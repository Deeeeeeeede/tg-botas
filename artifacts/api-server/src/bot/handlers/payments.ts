import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  usersTable,
  productsTable,
  purchasesTable,
  basketsTable,
  discountCodesTable,
  productTypesTable,
  citiesTable,
  districtsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { formatEur, generateQueueId, addMinutes, formatDate } from "../utils";
import { getUser, getUserBasket, releaseBasket, updateUserTier } from "../db";
import { inlineKeyboard, BACK_BTN } from "../keyboards";

export const SOL_WALLET = "HtbWwMXAMJ6jT5meYGJ1hcV1JRarGKoJa8hTz36zCL59";
const SOL_RPC = "https://api.mainnet-beta.solana.com";
const LAMPORTS_PER_SOL = 1_000_000_000;

export async function getSolPrice(): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur",
      { signal: controller.signal },
    );
    const data = (await res.json()) as any;
    return Number(data?.solana?.eur ?? 0);
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

export async function showCryptoMenu(
  ctx: Context & { session: BotSession },
  eurAmount: number,
) {
  ctx.session.data = { ...(ctx.session.data ?? {}), pendingEur: eurAmount };
  const kb = inlineKeyboard([
    [{ text: "◎ Solana (SOL)", callback_data: "pay:crypto:sol" }],
    [{ text: "✖ Cancel", callback_data: "pay:cancel" }],
  ]);
  const text = `💳 <b>Total: ${formatEur(eurAmount)}</b>\n\nSelect payment method:`;
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function showSolInvoice(ctx: Context & { session: BotSession }) {
  const data = ctx.session.data ?? {};
  const eurAmount = Number(data["discountedTotal"] ?? data["pendingEur"] ?? 0);

  const solPrice = await getSolPrice();
  if (solPrice <= 0) {
    await ctx.editMessageText(
      "⚠️ Could not fetch SOL price. Please try again.",
      { ...inlineKeyboard([[BACK_BTN("shop:basket")]]) },
    );
    return;
  }

  const solAmount = parseFloat((eurAmount / solPrice).toFixed(6));
  const expiresAt = addMinutes(new Date(), 15);

  ctx.session.data = {
    ...data,
    solAmount,
    invoiceExpiresAt: expiresAt.getTime(),
    invoiceCreatedAt: Date.now(),
  };

  const telegramId = ctx.from!.id;
  const items = await getUserBasket(telegramId);

  let itemsText = "";
  for (const it of items) {
    const [type] = await db
      .select()
      .from(productTypesTable)
      .where(eq(productTypesTable.id, it.typeId));
    const [city] = await db
      .select()
      .from(citiesTable)
      .where(eq(citiesTable.id, it.cityId));
    const [district] = await db
      .select()
      .from(districtsTable)
      .where(eq(districtsTable.id, it.districtId));
    itemsText += `  • ${type?.emoji ?? "💎"} ${type?.name ?? "?"} ${it.size} — ${city?.name ?? "?"}/${district?.name ?? "?"} (${formatEur(it.price)})\n`;
  }

  const text =
    `🧾 <b>Payment Invoice</b>\n\n` +
    (itemsText ? `<b>Items:</b>\n${itemsText}\n` : "") +
    `Total: <b>${formatEur(eurAmount)}</b>\n` +
    `────────────────────────\n` +
    `Send exactly: <code>${solAmount}</code> SOL\n\n` +
    `To address:\n<code>${SOL_WALLET}</code>\n` +
    `────────────────────────\n` +
    `⏳ <b>Expires:</b> ${formatDate(expiresAt)} (LT)\n\n` +
    `💡 Sending a little more is fine — any overpay goes to your balance.\n` +
    `✅ Auto-checked every 30 seconds.`;

  const kb = inlineKeyboard([
    [{ text: "🔄 Check Payment", callback_data: "pay:check_sol" }],
    [{ text: "✖ Cancel", callback_data: "pay:cancel" }],
  ]);

  await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
}

export async function checkSolPayment(
  ctx: Context & { session: BotSession },
): Promise<void> {
  const data = ctx.session.data ?? {};
  const expectedSol = Number(data["solAmount"] ?? 0);
  const expiresAt = Number(data["invoiceExpiresAt"] ?? 0);
  const createdAt = Number(data["invoiceCreatedAt"] ?? 0);

  if (!expectedSol || !expiresAt) {
    await ctx.answerCbQuery("No active invoice.", { show_alert: true });
    return;
  }

  if (Date.now() > expiresAt) {
    ctx.session.data = undefined;
    await ctx.answerCbQuery("Invoice expired. Please start over.", {
      show_alert: true,
    });
    return;
  }

  await ctx.answerCbQuery("Checking payment…");

  try {
    const sigCtrl = new AbortController();
    const sigTimer = setTimeout(() => sigCtrl.abort(), 12000);
    const sigRes = await fetch(SOL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [SOL_WALLET, { limit: 25 }],
      }),
      signal: sigCtrl.signal,
    }).finally(() => clearTimeout(sigTimer));
    const sigData = (await sigRes.json()) as any;
    const signatures: any[] = sigData?.result ?? [];

    for (const sig of signatures) {
      if (sig.err) continue;
      if (sig.blockTime && sig.blockTime * 1000 < createdAt - 60000) continue;

      const txCtrl = new AbortController();
      const txTimer = setTimeout(() => txCtrl.abort(), 12000);
      const txRes = await fetch(SOL_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            sig.signature,
            { encoding: "json", maxSupportedTransactionVersion: 0 },
          ],
        }),
        signal: txCtrl.signal,
      }).finally(() => clearTimeout(txTimer));
      const txData = (await txRes.json()) as any;
      const tx = txData?.result;
      if (!tx) continue;

      const accountKeys: string[] = tx.transaction?.message?.accountKeys ?? [];
      const walletIndex = accountKeys.indexOf(SOL_WALLET);
      if (walletIndex === -1) continue;

      const pre = tx.meta?.preBalances?.[walletIndex] ?? 0;
      const post = tx.meta?.postBalances?.[walletIndex] ?? 0;
      const receivedSol = (post - pre) / LAMPORTS_PER_SOL;

      if (receivedSol >= expectedSol * 0.99) {
        const solPrice = await getSolPrice();
        const paidEur = receivedSol * solPrice;
        const expectedEur = Number(
          data["discountedTotal"] ?? data["pendingEur"] ?? 0,
        );
        const overpayEur = Math.max(0, paidEur - expectedEur);
        await completePurchase(ctx, "sol", overpayEur);
        return;
      }
    }

    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;

    const existingText =
      (ctx.callbackQuery as any)?.message?.text ?? "🧾 Payment Invoice";
    await ctx
      .editMessageText(existingText, {
        parse_mode: "HTML",
        ...inlineKeyboard([
          [
            {
              text: `🔄 Check Again (${mins}:${secs.toString().padStart(2, "0")} left)`,
              callback_data: "pay:check_sol",
            },
          ],
          [{ text: "✖ Cancel", callback_data: "pay:cancel" }],
        ]),
      })
      .catch(() => {});
  } catch {
    await ctx
      .reply("⚠️ Could not reach Solana network. Please try again.")
      .catch(() => {});
  }
}

export async function completePurchase(
  ctx: Context & { session: BotSession },
  paymentMethod: string,
  overpayEur = 0,
): Promise<void> {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);
  if (!user) return;

  const data = ctx.session.data ?? {};
  const isPaynow = Boolean(data["paynow"]);
  const discountCode = data["appliedCode"] as string | undefined;
  const discountedTotal = Number(data["discountedTotal"] ?? 0);

  type Spec = {
    cityId: number;
    districtId: number;
    typeId: number;
    size: string;
    price: number;
  };

  let specs: Spec[];

  if (isPaynow) {
    specs = [
      {
        cityId: data["cityId"] as number,
        districtId: data["districtId"] as number,
        typeId: data["typeId"] as number,
        size: data["size"] as string,
        price: discountedTotal,
      },
    ];
  } else {
    const basketItems = await getUserBasket(telegramId);
    if (basketItems.length === 0) {
      if (ctx.callbackQuery) {
        await ctx.editMessageText(
          "⚠️ Basket is empty. Please add items and try again.",
          {
            ...inlineKeyboard([
              [{ text: "🏠 Home", callback_data: "shop:home" }],
            ]),
          },
        );
      }
      return;
    }
    const perItemPrice =
      discountedTotal > 0 ? discountedTotal / basketItems.length : 0;
    specs = basketItems.map((it) => ({
      cityId: it.cityId,
      districtId: it.districtId,
      typeId: it.typeId,
      size: it.size,
      price: perItemPrice > 0 ? perItemPrice : Number(it.price),
    }));
  }

  const purchased: { productId: number; size: string; queueId: string; pricePaid: number }[] = [];
  let unpurchasedRefund = 0;

  for (const spec of specs) {
    const result = await db.execute(sql`
      UPDATE bot_products
      SET status = 'sold', reserved_by = NULL, reserved_until = NULL
      WHERE id = (
        SELECT id FROM bot_products
        WHERE city_id = ${spec.cityId}
          AND district_id = ${spec.districtId}
          AND type_id = ${spec.typeId}
          AND size = ${spec.size}
          AND status = 'available'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, size
    `);
    const row = result.rows[0] as { id: number; size: string } | undefined;
    if (!row) {
      unpurchasedRefund += spec.price;
      continue;
    }
    const queueId = generateQueueId();
    await db.insert(purchasesTable).values({
      queueId,
      userId: telegramId,
      productId: row.id,
      pricePaid: spec.price.toFixed(2),
      discountCodeUsed: discountCode,
      paymentMethod,
    });
    purchased.push({ productId: row.id, size: row.size, queueId, pricePaid: spec.price });
  }

  if (purchased.length === 0) {
    const refundTotal = discountedTotal + overpayEur;
    if (refundTotal > 0) {
      const freshUser = await getUser(telegramId);
      await db
        .update(usersTable)
        .set({ balance: (Number(freshUser!.balance) + refundTotal).toFixed(2) })
        .where(eq(usersTable.telegramId, telegramId));
    }
    ctx.session.step = undefined;
    ctx.session.data = undefined;
    if (!isPaynow) await releaseBasket(telegramId);
    if (ctx.callbackQuery) {
      await ctx.editMessageText(
        "⚠️ Sorry, all items went out of stock just now. Your balance has been refunded.",
        {
          ...inlineKeyboard([
            [{ text: "🏠 Home", callback_data: "shop:home" }],
          ]),
        },
      );
    }
    return;
  }

  if (!isPaynow) await releaseBasket(telegramId);

  if (discountCode) {
    await db
      .update(discountCodesTable)
      .set({ usesCount: sql`${discountCodesTable.usesCount} + 1` })
      .where(eq(discountCodesTable.code, discountCode))
      .catch(() => {});
  }

  const totalCredit = overpayEur + unpurchasedRefund;
  if (totalCredit > 0) {
    const freshUser = await getUser(telegramId);
    await db
      .update(usersTable)
      .set({ balance: (Number(freshUser!.balance) + totalCredit).toFixed(2) })
      .where(eq(usersTable.telegramId, telegramId));
  }

  const totalPaid = purchased.reduce((s, p) => s + p.pricePaid, 0);
  await db
    .update(usersTable)
    .set({
      purchaseCount: user.purchaseCount + purchased.length,
      eurSpent: (Number(user.eurSpent) + totalPaid).toFixed(2),
    })
    .where(eq(usersTable.telegramId, telegramId));

  await updateUserTier(telegramId);

  ctx.session.step = undefined;
  ctx.session.data = undefined;

  let msg =
    `✅ <b>Purchase Successful!</b>\n\n` +
    `Total paid: <b>${formatEur(totalPaid)}</b>\n`;
  if (overpayEur > 0)
    msg += `💰 Overpay credited: <b>${formatEur(overpayEur)}</b>\n`;
  if (unpurchasedRefund > 0)
    msg += `↩ Out-of-stock refund: <b>${formatEur(unpurchasedRefund)}</b>\n`;
  msg += `\n<b>Your items:</b>\n`;

  const productsToDeliver: any[] = [];
  for (const { productId, size, queueId } of purchased) {
    const product = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .then((r) => r[0]);
    if (!product) continue;
    msg += `\n📦 <b>${size}</b> — <code>${queueId}</code>\n`;
    if (product.fileType === "text" && product.content) {
      msg += `<code>${product.content}</code>\n`;
    }
    productsToDeliver.push(product);
  }

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: "HTML" });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML" });
  }

  for (const product of productsToDeliver) {
    await sendProductMedia(ctx, product);
  }

  await ctx.reply("Thank you for your purchase! 🙏", {
    ...inlineKeyboard([[{ text: "🏠 Home", callback_data: "shop:home" }]]),
  });
}

export async function sendProductMedia(ctx: any, product: any) {
  const files: { fileId: string; fileType: string }[] = [];

  if (product.fileId && product.fileType !== "text") {
    files.push({ fileId: product.fileId, fileType: product.fileType });
  }

  if (product.mediaFiles) {
    try {
      const extra = JSON.parse(product.mediaFiles) as {
        fileId: string;
        fileType: string;
      }[];
      files.push(...extra);
    } catch {}
  }

  for (const f of files) {
    try {
      if (f.fileType === "photo") await ctx.replyWithPhoto(f.fileId);
      else if (f.fileType === "document") await ctx.replyWithDocument(f.fileId);
      else if (f.fileType === "video") await ctx.replyWithVideo(f.fileId);
      else if (f.fileType === "animation" || f.fileType === "gif")
        await ctx.replyWithAnimation(f.fileId);
    } catch {}
  }
}
