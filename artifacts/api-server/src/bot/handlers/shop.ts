import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  usersTable,
  productsTable,
  purchasesTable,
  basketsTable,
  productTypesTable,
  citiesTable,
  districtsTable,
  reviewsTable,
  tierLevelsTable,
} from "@workspace/db";
import { eq, and, asc, desc, count } from "drizzle-orm";
import {
  getCities,
  getDistricts,
  getProductTypes,
  getSizesForTypeInDistrict,
  getWelcomeText,
  reserveProduct,
  releaseBasket,
  getUserBasket,
  updateUserTier,
  getUser,
} from "../db";
import { calculatePrice, priceLabel } from "../pricing";
import { formatEur, formatDate, generateQueueId, chunk } from "../utils";
import { inlineKeyboard, BACK_BTN } from "../keyboards";

export async function showHome(ctx: Context & { session: BotSession }) {
  const telegramId = ctx.from!.id;
  ctx.session.step = undefined;
  ctx.session.data = undefined;

  const user = await getUser(telegramId);
  if (!user) return;

  if (user.isBanned) {
    await ctx.reply("🚫 Your account has been suspended.");
    return;
  }

  const welcomeText = await getWelcomeText();
  const tierLevel = await db
    .select()
    .from(tierLevelsTable)
    .where(
      require("drizzle-orm").eq(tierLevelsTable.name, user.tierName)
    )
    .then((r: any[]) => r[0]);

  const name = ctx.from!.first_name ?? "Customer";
  let header =
    `👋 Hello, <b>${name}</b>!\n` +
    `💰 Balance: <b>${formatEur(user.balance)}</b>\n` +
    `🏆 Tier: <b>${user.tierName}</b>`;

  if (tierLevel && tierLevel.globalDiscountPercent > 0) {
    header += `\n🎁 <b>${user.tierName} bonus: ${tierLevel.globalDiscountPercent}% off every item!</b>`;
  }

  header += `\n\n${welcomeText}`;

  const kb = inlineKeyboard([
    [{ text: "🛒 Shop", callback_data: "shop:cities" }],
    [
      { text: "🛍 My Basket", callback_data: "shop:basket" },
      { text: "📋 My Orders", callback_data: "shop:orders" },
    ],
    [
      { text: "💰 Top Up Balance", callback_data: "shop:topup" },
      { text: "⭐ Leave Review", callback_data: "shop:review" },
    ],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(header, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(header, { parse_mode: "HTML", ...kb });
  }
}

export async function showShopCities(ctx: Context & { session: BotSession }) {
  const cities = await getCities();
  if (cities.length === 0) {
    await ctx.editMessageText("No products available right now. Check back soon!", {
      ...inlineKeyboard([[BACK_BTN("shop:home")]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...cities.map((c) => [
      { text: `🏙 ${c.name}`, callback_data: `shop:dist:${c.id}` },
    ]),
    [BACK_BTN("shop:home")],
  ]);
  await ctx.editMessageText("🛒 <b>Select a city:</b>", {
    parse_mode: "HTML",
    ...kb,
  });
}

export async function showShopDistricts(
  ctx: Context & { session: BotSession },
  cityId: number
) {
  const city = await db
    .select()
    .from(citiesTable)
    .where(eq(citiesTable.id, cityId))
    .then((r) => r[0]);
  const districts = await getDistricts(cityId);
  if (districts.length === 0) {
    await ctx.editMessageText("No districts available in this city.", {
      ...inlineKeyboard([[BACK_BTN("shop:cities")]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...districts.map((d) => [
      { text: `📍 ${d.name}`, callback_data: `shop:types:${cityId}:${d.id}` },
    ]),
    [BACK_BTN("shop:cities")],
  ]);
  await ctx.editMessageText(
    `🏙 <b>${city?.name ?? "?"}</b>\nSelect a district:`,
    { parse_mode: "HTML", ...kb }
  );
}

export async function showShopTypes(
  ctx: Context & { session: BotSession },
  cityId: number,
  districtId: number
) {
  const types = await getProductTypes();
  const availableTypes: typeof types = [];
  for (const t of types) {
    const [cnt] = await db
      .select({ count: count() })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.cityId, cityId),
          eq(productsTable.districtId, districtId),
          eq(productsTable.typeId, t.id),
          eq(productsTable.status, "available")
        )
      );
    if ((cnt?.count ?? 0) > 0) availableTypes.push(t);
  }

  if (availableTypes.length === 0) {
    await ctx.editMessageText("No products available in this district.", {
      ...inlineKeyboard([[BACK_BTN(`shop:dist:${cityId}`)]]),
    });
    return;
  }

  const kb = inlineKeyboard([
    ...availableTypes.map((t) => [
      {
        text: `${t.emoji} ${t.name}`,
        callback_data: `shop:sizes:${cityId}:${districtId}:${t.id}`,
      },
    ]),
    [BACK_BTN(`shop:dist:${cityId}`)],
  ]);
  await ctx.editMessageText("🏷 <b>Select product type:</b>", {
    parse_mode: "HTML",
    ...kb,
  });
}

export async function showShopSizes(
  ctx: Context & { session: BotSession },
  cityId: number,
  districtId: number,
  typeId: number
) {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);
  if (!user) return;

  const sizes = await getSizesForTypeInDistrict(cityId, districtId, typeId);
  if (sizes.length === 0) {
    await ctx.editMessageText("No products available.", {
      ...inlineKeyboard([[BACK_BTN(`shop:types:${cityId}:${districtId}`)]]),
    });
    return;
  }

  const type = await db
    .select()
    .from(productTypesTable)
    .where(eq(productTypesTable.id, typeId))
    .then((r) => r[0]);

  const buttons = await Promise.all(
    sizes.map(async (s) => {
      const priceResult = await calculatePrice(
        {
          typeId,
          cityId,
          districtId,
          size: s.size,
          price: Number(s.price),
        },
        { isReseller: user.isReseller, tierName: user.tierName }
      );
      const badges = priceResult.discountBadges.join("");
      const label =
        priceResult.final === priceResult.original
          ? `${s.size} — ${formatEur(priceResult.final)} (${s.count} left)`
          : `${s.size} — ${formatEur(priceResult.final)} ~~${formatEur(priceResult.original)}~~ ${badges} (${s.count} left)`;
      return [
        {
          text: label,
          callback_data: `shop:buy:${cityId}:${districtId}:${typeId}:${encodeURIComponent(s.size)}`,
        },
      ];
    })
  );

  const kb = inlineKeyboard([
    ...buttons,
    [BACK_BTN(`shop:types:${cityId}:${districtId}`)],
  ]);
  await ctx.editMessageText(
    `${type?.emoji ?? ""} <b>${type?.name ?? "Products"}</b>\nSelect size and quantity:`,
    { parse_mode: "HTML", ...kb }
  );
}

export async function addToBasket(
  ctx: Context & { session: BotSession },
  cityId: number,
  districtId: number,
  typeId: number,
  size: string
) {
  const telegramId = ctx.from!.id;
  const product = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.cityId, cityId),
        eq(productsTable.districtId, districtId),
        eq(productsTable.typeId, typeId),
        eq(productsTable.size, size),
        eq(productsTable.status, "available")
      )
    )
    .orderBy(asc(productsTable.price))
    .limit(1)
    .then((r) => r[0]);

  if (!product) {
    await ctx.answerCbQuery("Sorry, this item is no longer available.", {
      show_alert: true,
    });
    return;
  }

  const ok = await reserveProduct(product.id, telegramId);
  if (!ok) {
    await ctx.answerCbQuery(
      "Could not add to basket. Basket may be full (max 10 items).",
      { show_alert: true }
    );
    return;
  }

  await ctx.answerCbQuery(`Added ${size} to basket!`);
  await showShopSizes(ctx, cityId, districtId, typeId);
}

export async function showBasket(ctx: Context & { session: BotSession }) {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);
  if (!user) return;

  const items = await getUserBasket(telegramId);

  if (items.length === 0) {
    const kb = inlineKeyboard([
      [{ text: "🛒 Go Shopping", callback_data: "shop:cities" }],
      [BACK_BTN("shop:home")],
    ]);
    if (ctx.callbackQuery) {
      await ctx.editMessageText("🛍 Your basket is empty.", { ...kb });
    } else {
      await ctx.reply("🛍 Your basket is empty.", { ...kb });
    }
    return;
  }

  let total = 0;
  let text = "🛍 <b>Your Basket</b>\n\n";
  for (const item of items) {
    const priceResult = await calculatePrice(
      {
        typeId: item.typeId,
        cityId: item.cityId,
        districtId: item.districtId,
        size: item.size,
        price: Number(item.price),
      },
      { isReseller: user.isReseller, tierName: user.tierName }
    );
    total += priceResult.final;
    text += `• ${item.size} — ${formatEur(priceResult.final)}\n`;
  }
  text += `\n💰 Total: <b>${formatEur(total)}</b>\n`;
  text += `💳 Your balance: <b>${formatEur(user.balance)}</b>`;

  const kb = inlineKeyboard([
    [{ text: "✅ Checkout", callback_data: "shop:checkout" }],
    [{ text: "❌ Clear Basket", callback_data: "shop:clear_basket" }],
    [BACK_BTN("shop:home")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function checkout(ctx: Context & { session: BotSession }) {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);
  if (!user) return;

  const items = await getUserBasket(telegramId);
  if (items.length === 0) {
    await ctx.answerCbQuery("Your basket is empty.", { show_alert: true });
    return;
  }

  let total = 0;
  const priceResults = [];
  for (const item of items) {
    const priceResult = await calculatePrice(
      {
        typeId: item.typeId,
        cityId: item.cityId,
        districtId: item.districtId,
        size: item.size,
        price: Number(item.price),
      },
      { isReseller: user.isReseller, tierName: user.tierName }
    );
    total += priceResult.final;
    priceResults.push({ item, priceResult });
  }

  if (Number(user.balance) < total) {
    await ctx.answerCbQuery(
      `Insufficient balance. You need ${formatEur(total)} but have ${formatEur(user.balance)}.`,
      { show_alert: true }
    );
    return;
  }

  const newBalance = Number(user.balance) - total;
  await db
    .update(usersTable)
    .set({
      balance: newBalance.toFixed(2),
      purchaseCount: user.purchaseCount + items.length,
      eurSpent: (Number(user.eurSpent) + total).toFixed(2),
    })
    .where(eq(usersTable.telegramId, telegramId));

  const queueIds: string[] = [];
  for (const { item, priceResult } of priceResults) {
    const queueId = generateQueueId();
    queueIds.push(queueId);
    await db
      .update(productsTable)
      .set({ status: "sold" })
      .where(eq(productsTable.id, item.productId));
    await db.insert(purchasesTable).values({
      queueId,
      userId: telegramId,
      productId: item.productId,
      pricePaid: priceResult.final.toFixed(2),
      paymentMethod: "balance",
    });
    await db.delete(basketsTable).where(eq(basketsTable.id, item.basketId));
  }

  await updateUserTier(telegramId);

  let msg = `✅ <b>Purchase Successful!</b>\n\n`;
  msg += `Paid: <b>${formatEur(total)}</b>\n`;
  msg += `Remaining balance: <b>${formatEur(newBalance)}</b>\n\n`;
  msg += `<b>Your items:</b>\n`;

  for (const { item } of priceResults) {
    const product = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId))
      .then((r) => r[0]);
    if (!product) continue;
    msg += `📦 <b>${item.size}</b>\n`;
    if (product.fileType === "text" && product.content) {
      msg += `<code>${product.content}</code>\n\n`;
    }
  }

  await ctx.editMessageText(msg, { parse_mode: "HTML" });

  for (const { item } of priceResults) {
    const product = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId))
      .then((r) => r[0]);
    if (!product) continue;
    if (product.fileType !== "text" && product.fileId) {
      if (product.fileType === "photo") {
        await ctx.replyWithPhoto(product.fileId, { caption: `Your ${item.size}` });
      } else if (product.fileType === "document") {
        await ctx.replyWithDocument(product.fileId, { caption: `Your ${item.size}` });
      } else if (product.fileType === "video") {
        await ctx.replyWithVideo(product.fileId, { caption: `Your ${item.size}` });
      } else if (product.fileType === "animation" || product.fileType === "gif") {
        await ctx.replyWithAnimation(product.fileId, { caption: `Your ${item.size}` });
      }
    }
  }

  await ctx.reply("Thank you for your purchase!", {
    ...inlineKeyboard([[{ text: "🏠 Home", callback_data: "shop:home" }]]),
  });
}

export async function showOrders(ctx: Context & { session: BotSession }, page = 0) {
  const telegramId = ctx.from!.id;
  const PAGE_SIZE = 10;
  const purchases = await db
    .select()
    .from(purchasesTable)
    .where(eq(purchasesTable.userId, telegramId))
    .orderBy(desc(purchasesTable.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  const [totalRow] = await db
    .select({ count: count() })
    .from(purchasesTable)
    .where(eq(purchasesTable.userId, telegramId));
  const total = totalRow?.count ?? 0;

  let text = "📋 <b>My Orders</b>\n\n";
  if (purchases.length === 0) {
    text += "No orders yet.";
  } else {
    for (const p of purchases) {
      text +=
        `• <code>${p.queueId}</code> — ${formatEur(p.pricePaid)} — ${formatDate(p.createdAt)}` +
        `${p.refunded ? " ↩" : ""}\n`;
    }
  }

  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0) navRow.push({ text: "« Prev", callback_data: `shop:orders:${page - 1}` });
  if ((page + 1) * PAGE_SIZE < total) navRow.push({ text: "Next »", callback_data: `shop:orders:${page + 1}` });

  const kb = inlineKeyboard([
    ...(navRow.length ? [navRow] : []),
    [BACK_BTN("shop:home")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function showTopUp(ctx: Context & { session: BotSession }) {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);
  const text =
    `💰 <b>Top Up Balance</b>\n\n` +
    `Current balance: <b>${formatEur(user?.balance ?? 0)}</b>\n\n` +
    `To add funds to your account, please contact the shop admin.\n` +
    `Minimum top-up: €5.00`;
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      ...inlineKeyboard([[BACK_BTN("shop:home")]]),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "HTML",
      ...inlineKeyboard([[BACK_BTN("shop:home")]]),
    });
  }
}
