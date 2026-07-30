import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import { usersTable, topupInvoicesTable, paymentReceiptsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { formatEur, addMinutes } from "../utils";
import { inlineKeyboard, BACK_BTN, editOrReplace } from "../keyboards";
import {
  getSolPrice,
  getSolWallet,
  registerPendingInvoice,
  cancelPendingInvoice,
  countdownLine,
  scanForPayment,
  makeUniqueSolAmount,
} from "./payments";
import { getUser } from "../db";

const INVOICE_MINUTES = 30;

export async function showTopUpMenu(ctx: Context & { session: BotSession }) {
  const telegramId = ctx.from!.id;
  const user = await getUser(telegramId);

  const solPrice = await getSolPrice();
  const solLine =
    solPrice > 0
      ? `\n◎ Current rate: <b>1 SOL = ${formatEur(solPrice)}</b>`
      : "";

  const text =
    `💰 <b>Top Up Balance</b>\n\n` +
    `Your balance: <b>${formatEur(user?.balance ?? 0)}</b>${solLine}\n\n` +
    `Enter the amount in EUR you want to add (e.g. <code>20</code> or <code>50.50</code>):`;

  ctx.session.step = "topup:enter_amount";

  await editOrReplace(ctx, text, {
    parse_mode: "HTML",
    ...inlineKeyboard([[BACK_BTN("shop:home")]]),
  });
}

export async function handleTopUpAmount(
  ctx: Context & { session: BotSession },
  input: string
) {
  const telegramId = ctx.from!.id;
  const eurAmount = parseFloat(input.trim().replace(",", "."));

  if (isNaN(eurAmount) || eurAmount < 1 || eurAmount > 10000) {
    await ctx.reply(
      "❌ Please enter a valid amount between 1 and 10000 EUR:"
    );
    return;
  }

  const solPrice = await getSolPrice();
  if (solPrice <= 0) {
    await ctx.reply(
      "⚠️ Could not fetch SOL price right now. Please try again in a moment.",
      { ...inlineKeyboard([[{ text: "🔄 Retry", callback_data: "topup:start" }]]) }
    );
    ctx.session.step = undefined;
    return;
  }

  const solAmount = makeUniqueSolAmount(eurAmount / solPrice);
  const expiresAt = addMinutes(new Date(), INVOICE_MINUTES);

  // Cancel any running background checker for the user's previous invoice
  // before we create a new one. Without this the old ticker keeps scanning
  // for the old SOL amount even after the DB record is marked expired.
  cancelPendingInvoice(telegramId);

  await db
    .update(topupInvoicesTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(topupInvoicesTable.userId, telegramId),
        eq(topupInvoicesTable.status, "pending")
      )
    );

  const [invoice] = await db
    .insert(topupInvoicesTable)
    .values({
      userId: telegramId,
      eurAmount: eurAmount.toFixed(2),
      solAmount: solAmount.toFixed(6),
      expiresAt,
    })
    .returning();

  ctx.session.step = undefined;
  ctx.session.data = { topupInvoiceId: invoice!.id };

  const baseText = await buildInvoiceText(eurAmount, solAmount);
  const keyboard = [
    [{ text: "✅ Check Payment", callback_data: "topup:check" }],
    [{ text: "❌ Cancel", callback_data: "topup:cancel" }],
  ];

  const sent = await ctx.reply(
    baseText + "\n\n" + countdownLine(expiresAt.getTime()),
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    }
  );

  registerPendingInvoice(telegramId, {
    chatId: ctx.chat!.id,
    messageId: sent.message_id,
    expiresAt: expiresAt.getTime(),
    baseText,
    keyboard,
    kind: "topup",
    topupInvoiceId: invoice!.id,
    solAmount,
  });
}

async function buildInvoiceText(eurAmount: number, solAmount: number): Promise<string> {
  const wallet = await getSolWallet();
  return (
    `🧾 <b>Top-Up Invoice</b>\n\n` +
    `💶 Amount: <b>${formatEur(eurAmount)}</b>\n` +
    `────────────────────────\n` +
    `Send approximately:\n<code>${solAmount}</code> SOL\n\n` +
    `To address:\n<code>${wallet}</code>\n` +
    `────────────────────────\n` +
    `ℹ️ Send as close to <code>${solAmount}</code> SOL as possible.\n` +
    `Minor differences (e.g. rounding) are accepted — you will be credited for what you actually send.\n` +
    `✅ Press <b>Check Payment</b> after sending.`
  );
}

export async function checkTopUpPayment(
  ctx: Context & { session: BotSession }
) {
  const telegramId = ctx.from!.id;
  const invoiceId = ctx.session.data?.["topupInvoiceId"] as number | undefined;

  if (!invoiceId) {
    await ctx.answerCbQuery("No active top-up invoice.", { show_alert: true });
    return;
  }

  const invoice = await db
    .select()
    .from(topupInvoicesTable)
    .where(eq(topupInvoicesTable.id, invoiceId))
    .then((r) => r[0]);

  if (!invoice || invoice.status !== "pending") {
    await ctx.answerCbQuery("Invoice not found or already used.", { show_alert: true });
    ctx.session.data = undefined;
    return;
  }

  if (Date.now() > invoice.expiresAt.getTime()) {
    await db
      .update(topupInvoicesTable)
      .set({ status: "expired" })
      .where(eq(topupInvoicesTable.id, invoiceId));
    cancelPendingInvoice(telegramId);
    ctx.session.data = undefined;
    await ctx.answerCbQuery("Invoice expired. Please start a new top-up.", { show_alert: true });
    await ctx.editMessageText(
      "⏰ Invoice expired. Start a new top-up:",
      {
        ...inlineKeyboard([
          [{ text: "💰 New Top-Up", callback_data: "topup:start" }],
          [{ text: "🏠 Home", callback_data: "shop:home" }],
        ]),
      }
    );
    return;
  }

  // The global callback_query middleware already answered this callback, so the
  // loading spinner is dismissed; the live ticker keeps the countdown moving.
  const expectedSol = Number(invoice.solAmount);
  const createdAtMs = invoice.createdAt.getTime();
  const chatId = ctx.chat!.id;
  const messageId = (ctx.callbackQuery?.message as { message_id?: number })
    ?.message_id;

  try {
    const hit = await scanForPayment(expectedSol, createdAtMs, { allowFuzzy: true });
    if (hit) {
      const credited = await creditTopupInvoice(
        ctx.telegram,
        telegramId,
        invoice,
        hit.receivedSol,
        hit.signature,
        chatId,
        messageId,
      );
      if (credited) {
        ctx.session.data = undefined;
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

// Credit a confirmed top-up payment. The idempotent invoice completion, the
// one-time signature claim (UNIQUE on bot_payment_receipts), and the balance
// credit all commit together or not at all — so a claimed signature can never be
// left without a matching credit, and a single payment is never credited twice.
// Renders the success message by editing the invoice message. Returns true when
// the balance was credited (caller should stop polling), false otherwise.
async function creditTopupInvoice(
  telegram: any,
  telegramId: number,
  invoice: { id: number; eurAmount: string },
  receivedSol: number,
  signature: string,
  chatId: number,
  messageId?: number,
): Promise<boolean> {
  const solPrice = await getSolPrice();
  const creditedEur =
    solPrice > 0 ? receivedSol * solPrice : Number(invoice.eurAmount);

  let newBalance = 0;
  let credited = false;
  try {
    credited = await db.transaction(async (tx) => {
      const updated = await tx
        .update(topupInvoicesTable)
        .set({ status: "completed", txSignature: signature })
        .where(
          and(
            eq(topupInvoicesTable.id, invoice.id),
            eq(topupInvoicesTable.status, "pending"),
          ),
        )
        .returning({ id: topupInvoicesTable.id });
      if (updated.length === 0) return false;

      const claimRows = await tx
        .insert(paymentReceiptsTable)
        .values({
          txSignature: signature,
          userId: telegramId,
          kind: "topup",
          receivedSol: receivedSol.toFixed(9),
        })
        .onConflictDoNothing({ target: paymentReceiptsTable.txSignature })
        .returning({ id: paymentReceiptsTable.id });
      // Signature already consumed elsewhere — abort and roll back the invoice
      // completion so nothing is credited.
      if (claimRows.length === 0) throw new Error("signature-already-claimed");

      const [u] = await tx
        .update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${creditedEur}` })
        .where(eq(usersTable.telegramId, telegramId))
        .returning({ balance: usersTable.balance });
      newBalance = Number(u?.balance ?? 0);
      return true;
    });
  } catch {
    credited = false;
  }
  if (!credited) return false;

  cancelPendingInvoice(telegramId);

  const { refreshAdminLiveStatsNow } = await import("./admin");
  refreshAdminLiveStatsNow();

  const successText =
    `✅ <b>Top-Up Successful!</b>\n\n` +
    `◎ Received: <b>${receivedSol.toFixed(6)} SOL</b>\n` +
    `💶 Credited: <b>${formatEur(creditedEur)}</b>\n` +
    `💰 New balance: <b>${formatEur(newBalance)}</b>`;
  const replyMarkup = {
    inline_keyboard: [[{ text: "🏠 Home", callback_data: "shop:home" }]],
  };
  if (messageId) {
    await telegram
      .editMessageText(chatId, messageId, undefined, successText, {
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      })
      .catch(() => {});
  } else {
    await telegram
      .sendMessage(chatId, successText, {
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      })
      .catch(() => {});
  }
  return true;
}

// Background auto-confirm for a top-up invoice. Returns true when the invoice is
// no longer pending (credited here or elsewhere) so the ticker stops polling it;
// false while still awaiting payment.
export async function autoConfirmTopupInvoice(
  telegram: any,
  userId: number,
  inv: { chatId: number; messageId: number; topupInvoiceId?: number },
): Promise<boolean> {
  const invoiceId = inv.topupInvoiceId;
  if (!invoiceId) return false;
  const invoice = await db
    .select()
    .from(topupInvoicesTable)
    .where(eq(topupInvoicesTable.id, invoiceId))
    .then((r) => r[0]);
  if (!invoice || invoice.status !== "pending") return true;
  if (Date.now() > invoice.expiresAt.getTime()) return false;
  const hit = await scanForPayment(
    Number(invoice.solAmount),
    invoice.createdAt.getTime(),
    { allowFuzzy: true },
  );
  if (!hit) return false;
  return creditTopupInvoice(
    telegram,
    userId,
    invoice,
    hit.receivedSol,
    hit.signature,
    inv.chatId,
    inv.messageId,
  );
}

export async function cancelTopUp(ctx: Context & { session: BotSession }) {
  cancelPendingInvoice(ctx.from!.id);
  const invoiceId = ctx.session.data?.["topupInvoiceId"] as number | undefined;
  if (invoiceId) {
    await db
      .update(topupInvoicesTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(topupInvoicesTable.id, invoiceId),
          eq(topupInvoicesTable.status, "pending")
        )
      );
  }
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  await ctx.answerCbQuery("Top-up cancelled.");
  const { showHome } = await import("./shop");
  await showHome(ctx);
}
