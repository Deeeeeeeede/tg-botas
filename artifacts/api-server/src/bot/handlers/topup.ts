import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import { usersTable, topupInvoicesTable, paymentReceiptsTable } from "@workspace/db";
import { eq, and, gt, sql } from "drizzle-orm";
import { formatEur, addMinutes, formatDate } from "../utils";
import { inlineKeyboard, BACK_BTN, editOrReplace } from "../keyboards";
import { getSolPrice, SOL_WALLET } from "./payments";
import { getUser } from "../db";

const SOL_RPC = "https://api.mainnet-beta.solana.com";
const LAMPORTS_PER_SOL = 1_000_000_000;
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

  const solAmount = parseFloat((eurAmount / solPrice).toFixed(6));
  const expiresAt = addMinutes(new Date(), INVOICE_MINUTES);

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

  await ctx.reply(
    buildInvoiceText(eurAmount, solAmount, expiresAt),
    {
      parse_mode: "HTML",
      ...inlineKeyboard([
        [{ text: "✅ Check Payment", callback_data: "topup:check" }],
        [{ text: "❌ Cancel", callback_data: "topup:cancel" }],
      ]),
    }
  );
}

function buildInvoiceText(eurAmount: number, solAmount: number, expiresAt: Date): string {
  return (
    `🧾 <b>Top-Up Invoice</b>\n\n` +
    `💶 Amount: <b>${formatEur(eurAmount)}</b>\n` +
    `────────────────────────\n` +
    `Send exactly:\n<code>${solAmount}</code> SOL\n\n` +
    `To address:\n<code>${SOL_WALLET}</code>\n` +
    `────────────────────────\n` +
    `⏳ Expires: ${formatDate(expiresAt)}\n\n` +
    `💡 Sending a little more is fine — the full received amount will be credited to your balance.\n` +
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

  await ctx.answerCbQuery("Checking blockchain…");

  const expectedSol = Number(invoice.solAmount);
  const createdAtMs = invoice.createdAt.getTime();

  try {
    const sigCtrl = new AbortController();
    setTimeout(() => sigCtrl.abort(), 12000);
    const sigRes = await fetch(SOL_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [SOL_WALLET, { limit: 30 }],
      }),
      signal: sigCtrl.signal,
    });
    const sigData = (await sigRes.json()) as any;
    const signatures: any[] = sigData?.result ?? [];

    for (const sig of signatures) {
      if (sig.err) continue;
      if (sig.blockTime && sig.blockTime * 1000 < createdAtMs - 120_000) continue;

      const txCtrl = new AbortController();
      setTimeout(() => txCtrl.abort(), 12000);
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
      });
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
        const creditedEur = solPrice > 0 ? receivedSol * solPrice : Number(invoice.eurAmount);

        // Verify + credit atomically. The idempotent invoice completion, the
        // one-time signature claim (UNIQUE on bot_payment_receipts), and the
        // balance credit all commit together or not at all — so a claimed
        // signature can never be left without a matching credit, and a single
        // payment can never be credited twice.
        let newBalance = 0;
        let credited = false;
        try {
          credited = await db.transaction(async (tx) => {
            const updated = await tx
              .update(topupInvoicesTable)
              .set({ status: "completed", txSignature: sig.signature })
              .where(
                and(
                  eq(topupInvoicesTable.id, invoiceId),
                  eq(topupInvoicesTable.status, "pending"),
                ),
              )
              .returning({ id: topupInvoicesTable.id });
            if (updated.length === 0) return false;

            const claimRows = await tx
              .insert(paymentReceiptsTable)
              .values({
                txSignature: sig.signature,
                userId: telegramId,
                kind: "topup",
                receivedSol: receivedSol.toFixed(9),
              })
              .onConflictDoNothing({ target: paymentReceiptsTable.txSignature })
              .returning({ id: paymentReceiptsTable.id });
            // Signature already consumed elsewhere — abort and roll back the
            // invoice completion so nothing is credited.
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
        if (!credited) continue;

        ctx.session.data = undefined;

        await ctx.editMessageText(
          `✅ <b>Top-Up Successful!</b>\n\n` +
          `◎ Received: <b>${receivedSol.toFixed(6)} SOL</b>\n` +
          `💶 Credited: <b>${formatEur(creditedEur)}</b>\n` +
          `💰 New balance: <b>${formatEur(newBalance)}</b>`,
          {
            parse_mode: "HTML",
            ...inlineKeyboard([[{ text: "🏠 Home", callback_data: "shop:home" }]]),
          }
        );
        return;
      }
    }

    const remaining = Math.max(0, Math.floor((invoice.expiresAt.getTime() - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;

    await ctx
      .editMessageText(
        buildInvoiceText(
          Number(invoice.eurAmount),
          Number(invoice.solAmount),
          invoice.expiresAt
        ),
        {
          parse_mode: "HTML",
          ...inlineKeyboard([
            [
              {
                text: `🔄 Check Again (${mins}:${secs.toString().padStart(2, "0")} left)`,
                callback_data: "topup:check",
              },
            ],
            [{ text: "❌ Cancel", callback_data: "topup:cancel" }],
          ]),
        }
      )
      .catch(() => {});
  } catch {
    await ctx
      .reply("⚠️ Could not reach Solana network. Please try again.")
      .catch(() => {});
  }
}

export async function cancelTopUp(ctx: Context & { session: BotSession }) {
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
