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
  tierLevelsTable,
  discountCodesTable,
  reviewsTable,
} from "@workspace/db";
import { eq, and, asc, desc, count } from "drizzle-orm";
import {
  getCities,
  getDistricts,
  getProductTypes,
  getSizesForTypeInDistrict,
  getWelcomeText,
  addToBasket as dbAddToBasket,
  releaseBasket,
  getUserBasket,
  updateUserTier,
  getUser,
} from "../db";
import { calculatePrice } from "../pricing";
import { formatEur, formatDate, generateQueueId } from "../utils";
import { inlineKeyboard, BACK_BTN } from "../keyboards";
import {
  completePurchase,
  showCryptoMenu,
  sendProductMedia,
} from "./payments";

const TIER_EMOJI: Record<string, string> = {
  New: "🌱",
  Regular: "⭐",
  VIP: "💎",
  Legend: "👑",
};

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
  const basketCount = await db
    .select({ count: count() })
    .from(basketsTable)
    .where(eq(basketsTable.userId, telegramId))
    .then((r) => r[0]?.count ?? 0);

  const tierEmoji = TIER_EMOJI[user.tierName] ?? "🏅";
  const name = ctx.from!.first_name ?? "Customer";

  const header =
    `👋 Hello, <b>${name}</b>!\n\n` +
    `💰 Balance: <b>${formatEur(user.balance)}</b>\n` +
    `⭐ Status: <b>${user.tierName}</b> ${tierEmoji}\n` +
    `🛒 Basket: <b>${basketCount} item(s)</b>\n\n` +
    `${welcomeText}\n\n` +
    `⚠️ <b>Note: No refunds.</b>`;

  const kb = inlineKeyboard([
    [{ text: "🏪 Shop", callback_data: "shop:cities" }],
    [
      { text: "👤 Profile", callback_data: "shop:profile" },
      { text: "⭐ Top Up", callback_data: "shop:topup" },
    ],
    [
      { text: "👁 View Reviews", callback_data: "shop:view_reviews" },
      { text: "📝 Leave a Review", callback_data: "shop:review_prompt" },
    ],
    [{ text: "📋 Price List", callback_data: "shop:pricelist" }],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(header, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(header, { parse_mode: "HTML", ...kb });
  }
}

export async function showProfile(ctx: Context & { session: BotSession }) {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);
  if (!user) return;

  const tierEmoji = TIER_EMOJI[user.tierName] ?? "🏅";

  const tierLevel = await db
    .select()
    .from(tierLevelsTable)
    .where(eq(tierLevelsTable.name, user.tierName))
    .then((r) => r[0]);

  const text =
    `👤 <b>Your Profile</b>\n\n` +
    `🪪 Username: ${user.username ? `@${user.username}` : "—"}\n` +
    `🆔 ID: <code>${telegramId}</code>\n` +
    `💰 Balance: <b>${formatEur(user.balance)}</b>\n` +
    `⭐ Status: <b>${user.tierName}</b> ${tierEmoji}\n` +
    `🛒 Total purchases: <b>${user.purchaseCount}</b>\n` +
    `💸 Total spent: <b>${formatEur(user.eurSpent)}</b>\n` +
    (tierLevel && tierLevel.globalDiscountPercent > 0
      ? `🎁 Tier discount: <b>${tierLevel.globalDiscountPercent}%</b> off every item\n`
      : "") +
    (user.isReseller ? `👑 Reseller status: <b>Active</b>\n` : "");

  const profileKb = inlineKeyboard([
    [
      { text: "🛒 My Basket", callback_data: "shop:basket" },
      { text: "📋 My Orders", callback_data: "shop:orders:0" },
    ],
    [BACK_BTN("shop:home")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...profileKb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...profileKb });
  }
}

export async function showPriceList(ctx: Context & { session: BotSession }) {
  const cities = await getCities();
  if (cities.length === 0) {
    await ctx.editMessageText("No products available.", {
      ...inlineKeyboard([[BACK_BTN("shop:home")]]),
    });
    return;
  }

  let text = "📋 <b>Price List</b>\n\n";

  for (const city of cities) {
    const districts = await getDistricts(city.id);
    let cityHasProducts = false;

    for (const district of districts) {
      const rows = await db
        .select({
          typeName: productTypesTable.name,
          typeEmoji: productTypesTable.emoji,
          size: productsTable.size,
          price: productsTable.price,
          cnt: count(),
        })
        .from(productsTable)
        .innerJoin(
          productTypesTable,
          eq(productsTable.typeId, productTypesTable.id)
        )
        .where(
          and(
            eq(productsTable.cityId, city.id),
            eq(productsTable.districtId, district.id),
            eq(productsTable.status, "available")
          )
        )
        .groupBy(
          productTypesTable.name,
          productTypesTable.emoji,
          productsTable.size,
          productsTable.price
        )
        .orderBy(asc(productTypesTable.name), asc(productsTable.price));

      if (rows.length === 0) continue;

      if (!cityHasProducts) {
        text += `🏙 <b>${city.name}</b>\n`;
        cityHasProducts = true;
      }
      text += `  🏠 <b>${district.name}</b>:\n`;
      for (const row of rows) {
        text += `    • ${row.typeEmoji} ${row.typeName} ${row.size} — ${formatEur(row.price)}\n`;
      }
    }
    if (cityHasProducts) text += "\n";
  }

  if (text === "📋 <b>Price List</b>\n\n") {
    text += "No products available right now.";
  }

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

export async function showShopCities(ctx: Context & { session: BotSession }) {
  const cities = await getCities();
  if (cities.length === 0) {
    await ctx.editMessageText(
      "No products available right now. Check back soon!",
      { ...inlineKeyboard([[BACK_BTN("shop:home")]]) }
    );
    return;
  }
  const kb = inlineKeyboard([
    ...cities.map((c) => [
      { text: `🏙 ${c.name}`, callback_data: `shop:dist:${c.id}` },
    ]),
    [{ text: "🏠 Home", callback_data: "shop:home" }],
  ]);
  await ctx.editMessageText("🏙 <b>Choose a City</b>\n\nSelect your location:", {
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

  let text = `🏙 <b>${city?.name ?? "?"}</b>\n\n`;

  const districtsWithProducts: typeof districts = [];

  for (const d of districts) {
    const rows = await db
      .select({
        typeName: productTypesTable.name,
        typeEmoji: productTypesTable.emoji,
        size: productsTable.size,
        price: productsTable.price,
      })
      .from(productsTable)
      .innerJoin(
        productTypesTable,
        eq(productsTable.typeId, productTypesTable.id)
      )
      .where(
        and(
          eq(productsTable.cityId, cityId),
          eq(productsTable.districtId, d.id),
          eq(productsTable.status, "available")
        )
      )
      .groupBy(
        productTypesTable.name,
        productTypesTable.emoji,
        productsTable.size,
        productsTable.price
      )
      .orderBy(asc(productTypesTable.name), asc(productsTable.price));

    if (rows.length === 0) continue;
    districtsWithProducts.push(d);

    text += `🏠 <b>${d.name}</b>:\n`;
    for (const row of rows) {
      text += `  • ${row.typeEmoji} ${row.typeName} ${row.size} — ${formatEur(row.price)}\n`;
    }
    text += "\n";
  }

  if (districtsWithProducts.length === 0) {
    await ctx.editMessageText("No products available in this city.", {
      ...inlineKeyboard([[BACK_BTN("shop:cities")]]),
    });
    return;
  }

  text += "Choose a district:";

  const kb = inlineKeyboard([
    ...districtsWithProducts.map((d) => [
      {
        text: `🏠 ${d.name}`,
        callback_data: `shop:types:${cityId}:${d.id}`,
      },
    ]),
    [
      BACK_BTN("shop:cities"),
      { text: "🏠 Home", callback_data: "shop:home" },
    ],
  ]);

  await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
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

  if (availableTypes.length === 1) {
    await showShopSizes(ctx, cityId, districtId, availableTypes[0]!.id);
    return;
  }

  const kb = inlineKeyboard([
    ...availableTypes.map((t) => [
      {
        text: `${t.emoji} ${t.name}`,
        callback_data: `shop:sizes:${cityId}:${districtId}:${t.id}`,
      },
    ]),
    [
      BACK_BTN(`shop:dist:${cityId}`),
      { text: "🏠 Home", callback_data: "shop:home" },
    ],
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

  const [city, district, type, allTypes] = await Promise.all([
    db
      .select()
      .from(citiesTable)
      .where(eq(citiesTable.id, cityId))
      .then((r) => r[0]),
    db
      .select()
      .from(districtsTable)
      .where(eq(districtsTable.id, districtId))
      .then((r) => r[0]),
    db
      .select()
      .from(productTypesTable)
      .where(eq(productTypesTable.id, typeId))
      .then((r) => r[0]),
    getProductTypes(),
  ]);

  // Count how many types have available stock in this district
  let availableTypeCount = 0;
  for (const t of allTypes) {
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
    if ((cnt?.count ?? 0) > 0) availableTypeCount++;
  }

  // If only 1 type, going back to types would auto-redirect here again — skip to districts
  const backTarget =
    availableTypeCount > 1
      ? `shop:types:${cityId}:${districtId}`
      : `shop:dist:${cityId}`;

  const sizes = await getSizesForTypeInDistrict(cityId, districtId, typeId);
  if (sizes.length === 0) {
    await ctx.editMessageText("No products available.", {
      ...inlineKeyboard([[BACK_BTN(backTarget)]]),
    });
    return;
  }

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
      const label =
        priceResult.final === priceResult.original
          ? `${s.size} ${formatEur(priceResult.final)}`
          : `${s.size} ${formatEur(priceResult.final)} (was ${formatEur(priceResult.original)}) ${priceResult.discountBadges.join("")}`;
      return [
        {
          text: label,
          callback_data: `shop:detail:${cityId}:${districtId}:${typeId}:${encodeURIComponent(s.size)}`,
        },
      ];
    })
  );

  const header =
    `🏙 <b>${city?.name ?? "?"}</b>\n` +
    `🏠 <b>${district?.name ?? "?"}</b>\n` +
    `${type?.emoji ?? "💎"} <b>${type?.name ?? "?"}</b>\n\n` +
    `Available options:`;

  const kb = inlineKeyboard([
    ...buttons,
    [
      BACK_BTN(backTarget),
      { text: "🏠 Home", callback_data: "shop:home" },
    ],
  ]);
  await ctx.editMessageText(header, { parse_mode: "HTML", ...kb });
}

export async function showSizeDetail(
  ctx: Context & { session: BotSession },
  cityId: number,
  districtId: number,
  typeId: number,
  size: string
) {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);
  if (!user) return;

  const [city, district, type] = await Promise.all([
    db
      .select()
      .from(citiesTable)
      .where(eq(citiesTable.id, cityId))
      .then((r) => r[0]),
    db
      .select()
      .from(districtsTable)
      .where(eq(districtsTable.id, districtId))
      .then((r) => r[0]),
    db
      .select()
      .from(productTypesTable)
      .where(eq(productTypesTable.id, typeId))
      .then((r) => r[0]),
  ]);

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
    await ctx.editMessageText("⚠️ This item is no longer available.", {
      ...inlineKeyboard([
        [BACK_BTN(`shop:sizes:${cityId}:${districtId}:${typeId}`)],
      ]),
    });
    return;
  }

  const priceResult = await calculatePrice(
    { typeId, cityId, districtId, size, price: Number(product.price) },
    { isReseller: user.isReseller, tierName: user.tierName }
  );

  let priceText = `💰 Price: <b>${formatEur(priceResult.final)}</b>`;
  if (priceResult.final !== priceResult.original) {
    priceText += ` <s>${formatEur(priceResult.original)}</s> ${priceResult.discountBadges.join("")}`;
  }

  const text =
    `🏙 <b>${city?.name ?? "?"}</b> | 🏠 <b>${district?.name ?? "?"}</b>\n` +
    `${type?.emoji ?? "💎"} <b>${type?.name ?? "?"} - ${size}</b>\n` +
    priceText;

  const kb = inlineKeyboard([
    [
      {
        text: "🛒 Add to Basket",
        callback_data: `shop:buy:${cityId}:${districtId}:${typeId}:${encodeURIComponent(size)}`,
      },
      {
        text: "💳 Pay Now",
        callback_data: `shop:paynow:${cityId}:${districtId}:${typeId}:${encodeURIComponent(size)}`,
      },
    ],
    [
      BACK_BTN(`shop:sizes:${cityId}:${districtId}:${typeId}`),
      { text: "🏠 Home", callback_data: "shop:home" },
    ],
  ]);

  await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
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

  const result = await dbAddToBasket(
    telegramId,
    cityId,
    districtId,
    typeId,
    size,
    Number(product.price)
  );
  if (!result.ok) {
    const msg =
      result.reason === "already"
        ? "Already in your basket!"
        : result.reason === "full"
          ? "Basket is full (max 10 items)."
          : "Item no longer available.";
    await ctx.answerCbQuery(msg, { show_alert: true });
    return;
  }

  await ctx.answerCbQuery(`✅ ${size} added to basket!`, { show_alert: true });
}

export async function payNow(
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

  ctx.session.data = {
    paynow: true,
    cityId,
    districtId,
    typeId,
    size,
  };

  await showPaymentSummary(ctx);
}

export async function showPaymentSummary(
  ctx: Context & { session: BotSession }
) {
  const telegramId = ctx.from!.id;
  const data = ctx.session.data ?? {};
  const user = await getUser(telegramId);
  if (!user) return;

  const cityId = data["cityId"] as number;
  const districtId = data["districtId"] as number;
  const typeId = data["typeId"] as number;
  const size = data["size"] as string;

  const [city, district, type, product] = await Promise.all([
    db
      .select()
      .from(citiesTable)
      .where(eq(citiesTable.id, cityId))
      .then((r) => r[0]),
    db
      .select()
      .from(districtsTable)
      .where(eq(districtsTable.id, districtId))
      .then((r) => r[0]),
    db
      .select()
      .from(productTypesTable)
      .where(eq(productTypesTable.id, typeId))
      .then((r) => r[0]),
    db
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
      .then((r) => r[0]),
  ]);

  if (!product) {
    await ctx.editMessageText("⚠️ This item is no longer available.", {
      ...inlineKeyboard([
        [{ text: "🏠 Home", callback_data: "shop:home" }],
      ]),
    });
    return;
  }

  const priceResult = await calculatePrice(
    { typeId, cityId, districtId, size, price: Number(product.price) },
    { isReseller: user.isReseller, tierName: user.tierName }
  );

  const appliedCode = data["appliedCode"] as string | undefined;
  let total = priceResult.final;

  if (appliedCode) {
    const code = await db
      .select()
      .from(discountCodesTable)
      .where(eq(discountCodesTable.code, appliedCode))
      .then((r) => r[0]);
    if (code) {
      total = total * (1 - code.percentOff / 100);
    }
  }

  ctx.session.data = { ...data, discountedTotal: total };

  const text =
    `🧾 <b>Payment Summary</b>\n\n` +
    `📦 Product: <b>${type?.emoji ?? "💎"} ${type?.name ?? "?"} ${size}</b>\n` +
    `💰 Price: <b>${formatEur(total)}</b>\n` +
    `📍 Location: <b>${city?.name ?? "?"}, ${district?.name ?? "?"}</b>\n\n` +
    (appliedCode ? `🎟 Code <b>${appliedCode}</b> applied!\n\n` : "") +
    `Do you have a discount code to apply?`;

  const kb = inlineKeyboard([
    [{ text: "💳 Pay Now", callback_data: "shop:do_paynow" }],
    [
      {
        text: "🎟 Apply Discount Code",
        callback_data: "shop:apply_code_paynow",
      },
    ],
    [
      BACK_BTN(
        `shop:detail:${cityId}:${districtId}:${typeId}:${encodeURIComponent(size)}`
      ),
    ],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function doPayNow(ctx: Context & { session: BotSession }) {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);
  if (!user) return;

  const data = ctx.session.data ?? {};
  const total = Number(data["discountedTotal"] ?? 0);

  if (Number(user.balance) >= total) {
    await db
      .update(usersTable)
      .set({ balance: (Number(user.balance) - total).toFixed(2) })
      .where(eq(usersTable.telegramId, telegramId));
    await completePurchase(ctx, "balance");
  } else {
    const kb = inlineKeyboard([
      [{ text: "💳 Pay with Crypto", callback_data: "pay:menu" }],
      [
        {
          text: "🎟 Apply Discount Code",
          callback_data: "shop:apply_code_paynow",
        },
      ],
      [BACK_BTN("shop:basket")],
    ]);
    await ctx.editMessageText(
      `⚠️ <b>Insufficient Balance!</b> (${formatEur(user.balance)} / ${formatEur(total)} EUR)\n\n` +
        `Do you have a discount code to apply before paying with crypto?`,
      { parse_mode: "HTML", ...kb }
    );
  }
}

export async function showBasket(ctx: Context & { session: BotSession }) {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);
  if (!user) return;

  const items = await getUserBasket(telegramId);

  if (items.length === 0) {
    const kb = inlineKeyboard([
      [{ text: "🏪 Go Shopping", callback_data: "shop:cities" }],
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

    const type = await db
      .select()
      .from(productTypesTable)
      .where(eq(productTypesTable.id, item.typeId))
      .then((r) => r[0]);
    const city = await db
      .select()
      .from(citiesTable)
      .where(eq(citiesTable.id, item.cityId))
      .then((r) => r[0]);

    text += `• ${type?.emoji ?? "💎"} ${type?.name ?? "?"} ${item.size} — ${formatEur(priceResult.final)} (${city?.name ?? "?"})\n`;
  }

  text +=
    `\n💰 Total: <b>${formatEur(total)}</b>\n` +
    `💳 Your balance: <b>${formatEur(user.balance)}</b>`;

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
  }

  const appliedCode = ctx.session.data?.["appliedCode"] as string | undefined;
  let discountedTotal = total;

  if (appliedCode) {
    const code = await db
      .select()
      .from(discountCodesTable)
      .where(eq(discountCodesTable.code, appliedCode))
      .then((r) => r[0]);
    if (code) {
      discountedTotal = total * (1 - code.percentOff / 100);
    }
  }

  ctx.session.data = {
    ...(ctx.session.data ?? {}),
    discountedTotal,
    pendingEur: discountedTotal,
  };

  if (Number(user.balance) >= discountedTotal) {
    await db
      .update(usersTable)
      .set({
        balance: (Number(user.balance) - discountedTotal).toFixed(2),
      })
      .where(eq(usersTable.telegramId, telegramId));
    await completePurchase(ctx, "balance");
  } else {
    const kb = inlineKeyboard([
      [{ text: "💳 Pay with Crypto", callback_data: "pay:menu" }],
      [
        {
          text: "🎟 Apply Discount Code",
          callback_data: "shop:apply_code_basket",
        },
      ],
      [BACK_BTN("shop:basket")],
    ]);
    await ctx.editMessageText(
      `⚠️ <b>Insufficient Balance!</b> (${formatEur(user.balance)} / ${formatEur(discountedTotal)} EUR)\n\n` +
        `Do you have a discount code to apply before paying with crypto?`,
      { parse_mode: "HTML", ...kb }
    );
  }
}

export async function applyDiscountCode(
  ctx: Context & { session: BotSession },
  code: string,
  returnTo: "paynow" | "basket"
) {
  const discountRecord = await db
    .select()
    .from(discountCodesTable)
    .where(eq(discountCodesTable.code, code.toUpperCase().trim()))
    .then((r) => r[0]);

  if (!discountRecord) {
    await ctx.reply("❌ Invalid discount code. Please try again:");
    return;
  }

  if (
    discountRecord.maxUses !== null &&
    discountRecord.usesCount >= discountRecord.maxUses
  ) {
    await ctx.reply("❌ This discount code has been fully used.");
    ctx.session.step = undefined;
    return;
  }

  ctx.session.data = {
    ...(ctx.session.data ?? {}),
    appliedCode: discountRecord.code,
  };
  ctx.session.step = undefined;

  await ctx.reply(
    `✅ Discount code <b>${discountRecord.code}</b> applied! (${discountRecord.percentOff}% off)`,
    { parse_mode: "HTML" }
  );

  if (returnTo === "paynow") {
    await showPaymentSummary(ctx);
  } else {
    await checkout(ctx);
  }
}

export async function showOrders(
  ctx: Context & { session: BotSession },
  page = 0
) {
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
        `${p.refunded ? " ↩ refunded" : ""}\n`;
    }
  }

  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0)
    navRow.push({ text: "« Prev", callback_data: `shop:orders:${page - 1}` });
  if ((page + 1) * PAGE_SIZE < total)
    navRow.push({ text: "Next »", callback_data: `shop:orders:${page + 1}` });

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
    `To add funds, pay with crypto:\n\n` +
    `◎ <b>Solana (SOL)</b> wallet:\n<code>HtbWwMXAMJ6jT5meYGJ1hcV1JRarGKoJa8hTz36zCL59</code>\n\n` +
    `Send any amount and contact admin with your Telegram ID (<code>${telegramId}</code>) for manual top-up confirmation.`;

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

export async function showCustomerReviews(
  ctx: Context & { session: BotSession }
) {
  const reviews = await db
    .select({
      id: reviewsTable.id,
      text: reviewsTable.text,
      createdAt: reviewsTable.createdAt,
      username: reviewsTable.username,
    })
    .from(reviewsTable)
    .orderBy(desc(reviewsTable.createdAt))
    .limit(20);

  if (reviews.length === 0) {
    const msg = "📭 No reviews yet. Be the first to leave one!";
    const kb = inlineKeyboard([
      [{ text: "📝 Leave a Review", callback_data: "shop:review_prompt" }],
      [BACK_BTN("shop:home")],
    ]);
    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, kb);
    } else {
      await ctx.reply(msg, kb);
    }
    return;
  }

  let text = `👁 <b>Customer Reviews</b>\n\n`;
  for (const r of reviews) {
    const who = r.username ? `@${r.username}` : "Customer";
    text += `⭐ <b>${who}</b>\n${r.text}\n\n`;
  }

  const kb = inlineKeyboard([
    [{ text: "📝 Leave a Review", callback_data: "shop:review_prompt" }],
    [BACK_BTN("shop:home")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}
