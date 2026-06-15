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
  paymentReceiptsTable,
  topupInvoicesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { formatEur, generateQueueId, addMinutes, formatDate } from "../utils";
import { getUser, getUserBasket, releaseBasket, updateUserTier } from "../db";
import { inlineKeyboard, BACK_BTN } from "../keyboards";

const DEFAULT_SOL_WALLET = "HtbWwMXAMJ6jT5meYGJ1hcV1JRarGKoJa8hTz36zCL59";
const SOL_RPC = "https://api.mainnet-beta.solana.com";

let solWalletCache: string | null = null;
let solWalletCacheTs = 0;

export async function getSolWallet(): Promise<string> {
  const now = Date.now();
  if (solWalletCache && now - solWalletCacheTs < 30_000) {
    return solWalletCache;
  }
  const { getSetting } = await import("../db");
  const saved = await getSetting("sol_wallet");
  const wallet = saved || DEFAULT_SOL_WALLET;
  solWalletCache = wallet;
  solWalletCacheTs = now;
  return wallet;
}

export function clearSolWalletCache() {
  solWalletCache = null;
  solWalletCacheTs = 0;
}

// Re-export for legacy compatibility during transition; prefer getSolWallet().
export const SOL_WALLET = DEFAULT_SOL_WALLET;

type InlineKb = { text: string; callback_data: string }[][];
type LiveInvoice = {
  chatId: number;
  messageId: number;
  expiresAt: number;
  baseText: string;
  keyboard: InlineKb;
  kind: "purchase" | "topup";
  topupInvoiceId?: number;
  lastText?: string;
};
const pendingInvoices = new Map<number, LiveInvoice>();

// Builds the live countdown line appended to the invoice each tick.
// Uses whole-minute granularity so the ticker only edits the message once per
// minute instead of every few seconds — dramatically reduces "edited" flicker.
export function countdownLine(expiresAt: number): string {
  const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const mins = Math.ceil(remaining / 60);
  if (mins <= 0) return `⏳ Time remaining: <b>less than a minute</b>`;
  return `⏳ Time remaining: <b>${mins} min</b>`;
}

export function registerPendingInvoice(userId: number, invoice: LiveInvoice) {
  pendingInvoices.set(userId, invoice);
}

export function cancelPendingInvoice(userId: number) {
  pendingInvoices.delete(userId);
}

// Single ticker that keeps every active invoice's countdown live by editing the
// invoice message in place, and finalizes the message when it expires. Runs
// often enough to feel live but well within Telegram's edit rate limits.
// Process-scoped singleton: bot failover recreates the Telegraf instance in the
// same process, so guard against spawning duplicate intervals. The shared
// `telegram` reference is updated on each call so edits use the live instance.
let invoiceTickerStarted = false;
let invoiceTelegram: any = null;
export function startInvoiceBackgroundChecker(telegram: any) {
  invoiceTelegram = telegram;
  if (invoiceTickerStarted) return;
  invoiceTickerStarted = true;
  setInterval(async () => {
    const telegram = invoiceTelegram;
    if (!telegram) return;
    const now = Date.now();
    for (const [userId, inv] of Array.from(pendingInvoices.entries())) {
      if (now >= inv.expiresAt) {
        pendingInvoices.delete(userId);
        if (inv.kind === "purchase") {
          await releaseBasket(userId).catch(() => {});
        } else if (inv.kind === "topup" && inv.topupInvoiceId) {
          await db
            .update(topupInvoicesTable)
            .set({ status: "expired" })
            .where(
              and(
                eq(topupInvoicesTable.id, inv.topupInvoiceId),
                eq(topupInvoicesTable.status, "pending"),
              ),
            )
            .catch(() => {});
        }
        const timeoutText =
          inv.kind === "purchase"
            ? "⏰ <b>Payment Timeout</b>\n\nYour payment invoice has expired. Your basket has been cleared."
            : "⏰ <b>Top-Up Expired</b>\n\nYour invoice has expired. Start a new top-up when ready.";
        await telegram
          .editMessageText(inv.chatId, inv.messageId, undefined, timeoutText, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🏠 Home", callback_data: "shop:home" }],
              ],
            },
          })
          .catch(() => {});
        continue;
      }

      const text = inv.baseText + "\n\n" + countdownLine(inv.expiresAt);
      if (text === inv.lastText) continue;
      inv.lastText = text;
      await telegram
        .editMessageText(inv.chatId, inv.messageId, undefined, text, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: inv.keyboard },
        })
        .catch(() => {});
    }
  }, 5000);
}
const LAMPORTS_PER_SOL = 1_000_000_000;

let cachedSolPrice = 0;
let cachedSolPriceTs = 0;
const SOL_PRICE_TTL_MS = 60_000; // 1 minute cache

export async function getSolPrice(): Promise<number> {
  // Return cached price if still fresh
  if (cachedSolPrice > 0 && Date.now() - cachedSolPriceTs < SOL_PRICE_TTL_MS) {
    return cachedSolPrice;
  }

  // Try CoinGecko first
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur",
      { signal: controller.signal },
    );
    const data = (await res.json()) as any;
    const price = Number(data?.solana?.eur ?? 0);
    if (price > 0) {
      cachedSolPrice = price;
      cachedSolPriceTs = Date.now();
      return price;
    }
  } catch {
    // CoinGecko failed — try fallback
  } finally {
    clearTimeout(timer);
  }

  // Fallback: Binance SOL/USDT then convert to EUR via USDT/EUR
  const binanceController = new AbortController();
  const binanceTimer = setTimeout(() => binanceController.abort(), 8000);
  try {
    const [solUsdtRes, usdtEurRes] = await Promise.all([
      fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
        { signal: binanceController.signal },
      ),
      fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT",
        { signal: binanceController.signal },
      ),
    ]);
    const solUsdt = (await solUsdtRes.json()) as any;
    const usdtEur = (await usdtEurRes.json()) as any;
    const solPriceUsdt = Number(solUsdt?.price ?? 0);
    const eurPriceUsdt = Number(usdtEur?.price ?? 0);
    if (solPriceUsdt > 0 && eurPriceUsdt > 0) {
      const price = solPriceUsdt * eurPriceUsdt;
      cachedSolPrice = price;
      cachedSolPriceTs = Date.now();
      return price;
    }
  } catch {
    // Fallback also failed — return cached price if available, else 0
  } finally {
    clearTimeout(binanceTimer);
  }

  return cachedSolPrice > 0 ? cachedSolPrice : 0;
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

  const telegramId = ctx.from!.id;
  const chatId = ctx.chat!.id;
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

  const baseText =
    `🧾 <b>Payment Invoice</b>\n\n` +
    (itemsText ? `<b>Items:</b>\n${itemsText}\n` : "") +
    `Total: <b>${formatEur(eurAmount)}</b>\n` +
    `────────────────────────\n` +
    `Send exactly: <code>${solAmount}</code> SOL\n\n` +
    `To address:\n<code>${(await getSolWallet())}</code>\n` +
    `────────────────────────\n` +
    `💡 Sending a little more is fine — any overpay goes to your balance.`;

  const text = baseText + "\n\n" + countdownLine(expiresAt.getTime());

  ctx.session.data = {
    ...data,
    solAmount,
    invoiceExpiresAt: expiresAt.getTime(),
    invoiceCreatedAt: Date.now(),
    invoiceBaseText: baseText,
  };

  const keyboard = [
    [{ text: "🔄 Check Payment", callback_data: "pay:check_sol" }],
    [{ text: "✖ Cancel", callback_data: "pay:cancel" }],
  ];

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });

  const messageId = (ctx.callbackQuery?.message as { message_id?: number })
    ?.message_id;
  if (messageId) {
    registerPendingInvoice(telegramId, {
      chatId,
      messageId,
      expiresAt: expiresAt.getTime(),
      baseText,
      keyboard,
      kind: "purchase",
    });
  }
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
    cancelPendingInvoice(ctx.from!.id);
    ctx.session.data = undefined;
    await ctx.answerCbQuery("Invoice expired. Please start over.", {
      show_alert: true,
    });
    await ctx
      .editMessageText(
        "⏰ <b>Payment Timeout</b>\n\nYour invoice has expired. Your basket has been cleared.",
        {
          parse_mode: "HTML",
          ...inlineKeyboard([[{ text: "🏠 Home", callback_data: "shop:home" }]]),
        },
      )
      .catch(() => {});
    await releaseBasket(ctx.from!.id).catch(() => {});
    return;
  }

  // The global callback_query middleware already answered this callback, so the
  // loading spinner is dismissed; the live ticker keeps the countdown moving.
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
        params: [(await getSolWallet()), { limit: 25 }],
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
      const walletIndex = accountKeys.indexOf(await getSolWallet());
      if (walletIndex === -1) continue;

      const pre = tx.meta?.preBalances?.[walletIndex] ?? 0;
      const post = tx.meta?.postBalances?.[walletIndex] ?? 0;
      const receivedSol = (post - pre) / LAMPORTS_PER_SOL;

      if (receivedSol >= expectedSol * 0.99) {
        // Atomically claim this transaction. If another handler already
        // consumed it (purchase or top-up), skip it — never credit twice.
        const claimed = await claimSignature(
          sig.signature,
          ctx.from!.id,
          "purchase",
          receivedSol,
        );
        if (!claimed) continue;

        const solPrice = await getSolPrice();
        const paidEur = receivedSol * solPrice;
        const expectedEur = Number(
          data["discountedTotal"] ?? data["pendingEur"] ?? 0,
        );
        const overpayEur = Math.max(0, paidEur - expectedEur);
        await completePurchase(ctx, "sol", overpayEur, sig.signature);
        return;
      }
    }

    // No payment found yet. The background ticker keeps the countdown live,
    // so there is nothing to re-render here — just leave the invoice ticking.
  } catch {
    await ctx
      .reply("⚠️ Could not reach Solana network. Please try again.")
      .catch(() => {});
  }
}

// Atomically claim an on-chain Solana transaction signature so it can be
// credited exactly once across every flow (purchase or top-up). Relies on the
// UNIQUE constraint on bot_payment_receipts.tx_signature: the INSERT either
// wins (returns true) or conflicts because another concurrent handler already
// claimed it (returns false). This closes the read-then-act race.
export async function claimSignature(
  signature: string,
  userId: number,
  kind: "purchase" | "topup",
  receivedSol: number,
): Promise<boolean> {
  const rows = await db
    .insert(paymentReceiptsTable)
    .values({
      txSignature: signature,
      userId,
      kind,
      receivedSol: receivedSol.toFixed(9),
    })
    .onConflictDoNothing({ target: paymentReceiptsTable.txSignature })
    .returning({ id: paymentReceiptsTable.id });
  return rows.length > 0;
}

export async function completePurchase(
  ctx: Context & { session: BotSession },
  paymentMethod: string,
  overpayEur = 0,
  txSignature?: string,
): Promise<void> {
  const telegramId = ctx.from!.id;
  cancelPendingInvoice(telegramId);
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
      // The on-chain payment was already claimed upstream, so we must not
      // silently drop the funds — credit everything paid to the balance.
      const refundTotal = discountedTotal + overpayEur;
      if (refundTotal > 0) {
        await db
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${refundTotal}` })
          .where(eq(usersTable.telegramId, telegramId));
      }
      const { refreshAdminLiveStatsNow } = await import("./admin");
      refreshAdminLiveStatsNow();
      ctx.session.step = undefined;
      ctx.session.data = undefined;
      if (ctx.callbackQuery) {
        await ctx.editMessageText(
          refundTotal > 0
            ? "⚠️ Your basket was empty, so your payment was added to your balance."
            : "⚠️ Basket is empty. Please add items and try again.",
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
    const queueId = generateQueueId();
    // Claim the item and record the purchase atomically: either the product is
    // marked sold AND the purchase row is written, or neither happens. Without
    // this, a failure between the two writes leaves a product stuck as "sold"
    // with no buyer — an item that silently "disappears" from stock.
    const row = await db
      .transaction(async (tx) => {
        const result = await tx.execute(sql`
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
        const claimed = result.rows[0] as
          | { id: number; size: string }
          | undefined;
        if (!claimed) return undefined;
        await tx.insert(purchasesTable).values({
          queueId,
          userId: telegramId,
          productId: claimed.id,
          pricePaid: spec.price.toFixed(2),
          discountCodeUsed: discountCode,
          paymentMethod,
          txSignature,
        });
        return claimed;
      })
      .catch(() => undefined);
    if (!row) {
      unpurchasedRefund += spec.price;
      continue;
    }
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
    const { refreshAdminLiveStatsNow } = await import("./admin");
    refreshAdminLiveStatsNow();
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
    const { refreshAdminLiveStatsNow } = await import("./admin");
    refreshAdminLiveStatsNow();
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
      else if (f.fileType === "text")
        // Text stored in mediaFiles uses fileId as the raw text value.
        await ctx.reply(`<code>${f.fileId}</code>`, { parse_mode: "HTML" });
    } catch {}
  }
}
