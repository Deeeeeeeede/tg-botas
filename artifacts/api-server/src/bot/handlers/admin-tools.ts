import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  purchasesTable,
  productsTable,
  usersTable,
  basketsTable,
  backupTokensTable,
  adminsTable,
} from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  TOOLS_KB,
  inlineKeyboard,
  BACK_BTN,
} from "../keyboards";
import { formatEur, formatDate } from "../utils";
import { clearExpiredReservations, getSetting, setSetting } from "../db";
import {
  listPendingInvoices,
  adminCancelInvoice,
  listUnmatchedPayments,
  creditOrphanToBalance,
} from "./payments";

export async function showToolsMenu(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;

  const adminId = ctx.from!.id;
  const adminRow = await db
    .select({ notifyOnPurchase: adminsTable.notifyOnPurchase })
    .from(adminsTable)
    .where(eq(adminsTable.telegramId, adminId))
    .then((r) => r[0]);
  const notifyOn = adminRow?.notifyOnPurchase ?? true;

  const notifyBtn = notifyOn
    ? { text: "🔔 Sale Notifications: ON", callback_data: "tools:toggle_notify" }
    : { text: "🔕 Sale Notifications: OFF", callback_data: "tools:toggle_notify" };

  const kb = inlineKeyboard([
    [{ text: "🖼 Set Bot Media", callback_data: "tools:set_media" }],
    [{ text: "🚫 Remove Bot Media", callback_data: "tools:remove_media" }],
    [{ text: "🗑 Clear Reservations", callback_data: "tools:clear_res" }],
    [{ text: "🛑 Cancel Pending Order", callback_data: "tools:pending_orders" }],
    [{ text: "💳 Payment Recovery", callback_data: "tools:payment_recovery" }],
    [{ text: "↩ Product Refund", callback_data: "tools:refund" }],
    [{ text: "🔑 Backup Tokens", callback_data: "tools:backup_tokens" }],
    [{ text: "➕ Add Balance to User", callback_data: "tools:add_balance" }],
    [{ text: "🪙 Change SOL Wallet", callback_data: "tools:change_wallet" }],
    [notifyBtn],
    [BACK_BTN("admin:main")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText("🔧 <b>Tools & Settings</b>", {
      parse_mode: "HTML",
      ...kb,
    });
  } else {
    await ctx.reply("🔧 <b>Tools & Settings</b>", {
      parse_mode: "HTML",
      ...kb,
    });
  }
}

export async function toggleAdminNotifications(
  ctx: Context & { session: BotSession },
) {
  const adminId = ctx.from!.id;
  const adminRow = await db
    .select({ notifyOnPurchase: adminsTable.notifyOnPurchase })
    .from(adminsTable)
    .where(eq(adminsTable.telegramId, adminId))
    .then((r) => r[0]);
  if (!adminRow) return;

  const newValue = !adminRow.notifyOnPurchase;
  await db
    .update(adminsTable)
    .set({ notifyOnPurchase: newValue })
    .where(eq(adminsTable.telegramId, adminId));

  await ctx.answerCbQuery(
    newValue ? "🔔 Sale notifications ON" : "🔕 Sale notifications OFF",
    { show_alert: true },
  );
  await showToolsMenu(ctx);
}

export async function clearAllReservations(ctx: Context & { session: BotSession }) {
  const cleared = await clearExpiredReservations();
  const basketRows = await db.select({ id: basketsTable.id }).from(basketsTable);
  const total = cleared + basketRows.length;
  await db.delete(basketsTable);
  await ctx.answerCbQuery(`Cleared ${total} basket entries.`, { show_alert: true });
  await showToolsMenu(ctx);
}

// Lists buyers who currently have an open (unpaid) invoice the bot is watching.
// Cancelling one stops the bot auto-delivering after a direct/manual deal.
export async function showPendingOrders(ctx: Context & { session: BotSession }) {
  const pending = listPendingInvoices();

  if (pending.length === 0) {
    const kb = inlineKeyboard([[BACK_BTN("admin:tools")]]);
    const text =
      "🛑 <b>Cancel Pending Order</b>\n\nThere are no open orders right now.";
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
    } else {
      await ctx.reply(text, { parse_mode: "HTML", ...kb });
    }
    return;
  }

  const now = Date.now();
  const rows: { text: string; callback_data: string }[][] = [];
  let body = "";
  let n = 1;
  for (const p of pending) {
    const user = await db
      .select({
        username: usersTable.username,
        firstName: usersTable.firstName,
      })
      .from(usersTable)
      .where(eq(usersTable.telegramId, p.userId))
      .then((r) => r[0]);
    const who = user?.username
      ? `@${user.username}`
      : user?.firstName ?? `#${p.userId}`;
    const mins = Math.max(0, Math.ceil((p.expiresAt - now) / 60000));
    const kind = p.kind === "topup" ? "Top-Up" : "Order";
    const amount = p.expectedEur != null ? ` — ${formatEur(p.expectedEur)}` : "";
    const sol = p.solAmount != null ? ` (${p.solAmount} SOL)` : "";
    body +=
      `<b>${n}.</b> ${who} — ${kind}${amount}${sol}\n` +
      `   ⏳ ${mins} min left\n`;
    rows.push([
      {
        text: `🛑 Cancel #${n} (${who})`,
        callback_data: `tools:cancel_pending:${p.userId}`,
      },
    ]);
    n++;
  }
  rows.push([BACK_BTN("admin:tools")]);

  const text =
    `🛑 <b>Cancel Pending Order</b>\n\n` +
    `These buyers have an open invoice the bot is watching. ` +
    `Cancel one if the buyer paid you directly, so the bot won't also deliver.\n\n` +
    body;

  const kb = inlineKeyboard(rows);
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function cancelPendingOrder(
  ctx: Context & { session: BotSession },
  userId: number,
) {
  const ok = await adminCancelInvoice(ctx.telegram, userId);
  await ctx.answerCbQuery(
    ok ? "✅ Order cancelled." : "Order no longer pending.",
    { show_alert: true },
  );
  await showPendingOrders(ctx);
}

export async function showRecentPurchasesForRefund(ctx: Context & { session: BotSession }) {
  const purchases = await db
    .select({
      id: purchasesTable.id,
      queueId: purchasesTable.queueId,
      userId: purchasesTable.userId,
      price: purchasesTable.pricePaid,
      createdAt: purchasesTable.createdAt,
      refunded: purchasesTable.refunded,
    })
    .from(purchasesTable)
    .where(eq(purchasesTable.refunded, false))
    .orderBy(desc(purchasesTable.createdAt))
    .limit(15);

  if (purchases.length === 0) {
    await ctx.editMessageText("No purchases to refund.", {
      ...inlineKeyboard([[BACK_BTN("admin:tools")]]),
    });
    return;
  }

  const kb = inlineKeyboard([
    ...purchases.map((p) => [
      {
        text: `${p.queueId} — ${formatEur(p.price)} — ${formatDate(p.createdAt)}`,
        callback_data: `tools:do_refund:${p.id}`,
      },
    ]),
    [BACK_BTN("admin:tools")],
  ]);

  await ctx.editMessageText("↩ <b>Select Purchase to Refund</b>:", {
    parse_mode: "HTML",
    ...kb,
  });
}

// Confirmation gate before a refund actually runs. Refunds credit real balance
// and cannot be undone, so the admin must explicitly confirm first.
export async function showRefundConfirm(
  ctx: Context & { session: BotSession },
  purchaseId: number,
) {
  const purchase = await db
    .select()
    .from(purchasesTable)
    .where(eq(purchasesTable.id, purchaseId))
    .then((r) => r[0]);
  if (!purchase || purchase.refunded) {
    await ctx.answerCbQuery("Purchase not found or already refunded.", {
      show_alert: true,
    });
    return;
  }
  await ctx.editMessageText(
    `⚠️ <b>Confirm Refund</b>\n\n` +
      `Order: <code>${purchase.queueId}</code>\n` +
      `User: <code>${purchase.userId}</code>\n` +
      `Amount: <b>${formatEur(purchase.pricePaid)}</b>\n\n` +
      `This credits the buyer's balance and cannot be undone.`,
    {
      parse_mode: "HTML",
      ...inlineKeyboard([
        [
          {
            text: "✅ Yes, refund",
            callback_data: `tools:confirm_refund:${purchaseId}`,
          },
        ],
        [{ text: "✖ Cancel", callback_data: "tools:refund" }],
      ]),
    },
  );
}

// Payment recovery landing screen: a quick picker of the most recent orders plus
// a manual Queue ID lookup. Saves the admin from having to know the Queue ID by
// heart for the common "look up the last order" case.
export async function showPaymentRecoveryMenu(
  ctx: Context & { session: BotSession },
) {
  ctx.session.step = undefined;
  const purchases = await db
    .select({
      id: purchasesTable.id,
      queueId: purchasesTable.queueId,
      userId: purchasesTable.userId,
      price: purchasesTable.pricePaid,
      createdAt: purchasesTable.createdAt,
    })
    .from(purchasesTable)
    .orderBy(desc(purchasesTable.createdAt))
    .limit(10);

  const rows = purchases.map((p) => [
    {
      text: `${p.queueId} — ${formatEur(p.price)} — ${formatDate(p.createdAt)}`,
      callback_data: `tools:recover:${p.id}`,
    },
  ]);
  rows.push([
    { text: "🔎 Look up by Queue ID", callback_data: "tools:recover_manual" },
  ]);
  rows.push([
    {
      text: "🪙 Unmatched Wallet Payments",
      callback_data: "tools:unmatched",
    },
  ]);
  rows.push([BACK_BTN("admin:tools")]);

  const intro = purchases.length
    ? "Pick a recent order, or look one up by Queue ID:"
    : "No orders yet. You can still look one up by Queue ID:";
  await ctx.editMessageText(`🛟 <b>Payment Recovery</b>\n\n${intro}`, {
    parse_mode: "HTML",
    ...inlineKeyboard(rows),
  });
}

type RecoverablePurchase = {
  queueId: string;
  userId: number;
  pricePaid: string;
  paymentMethod: string;
  refunded: boolean;
  productId: number;
};

// Render a single order's recovery details and re-deliver its product content.
// Shared by the recent-order picker and the manual Queue ID lookup.
export async function renderOrderRecovery(
  ctx: Context & { session: BotSession },
  purchase: RecoverablePurchase,
) {
  const product = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, purchase.productId))
    .then((r) => r[0]);
  const msg =
    `📦 Order <code>${purchase.queueId}</code>\n` +
    `User: <code>${purchase.userId}</code>\n` +
    `Paid: ${formatEur(purchase.pricePaid)}\n` +
    `Method: ${purchase.paymentMethod}\n` +
    `Status: ${purchase.refunded ? "Refunded" : "Completed"}`;
  await ctx.reply(msg, { parse_mode: "HTML" });
  if (product) {
    const { sendProductMedia } = await import("./payments");
    await sendProductMedia(ctx, product);
  }
  await showToolsMenu(ctx);
}

// Recover a recent order chosen from the picker (by internal purchase id).
export async function showOrderRecoveryById(
  ctx: Context & { session: BotSession },
  purchaseId: number,
) {
  const purchase = await db
    .select()
    .from(purchasesTable)
    .where(eq(purchasesTable.id, purchaseId))
    .then((r) => r[0]);
  if (!purchase) {
    await ctx.answerCbQuery("Order not found.", { show_alert: true });
    return;
  }
  await renderOrderRecovery(ctx, purchase);
}

// ── Unmatched wallet payments (orphan recovery) ─────────────────────────────
// Lists inbound SOL payments to the shop wallet that have no receipt yet — i.e.
// money received but never credited (the bug victims, or any future late arrival
// the auto-sweep couldn't attribute). The owner picks one and credits the buyer
// by Telegram ID; the signature claim makes it impossible to credit twice.
export async function showUnmatchedPayments(
  ctx: Context & { session: BotSession },
) {
  ctx.session.step = undefined;
  await ctx.answerCbQuery("Scanning the wallet…").catch(() => {});
  let payments;
  try {
    payments = await listUnmatchedPayments();
  } catch {
    return ctx.editMessageText(
      "⚠️ Couldn't reach the blockchain right now. Try again in a moment.",
      inlineKeyboard([[BACK_BTN("tools:payment_recovery")]]),
    );
  }

  if (payments.length === 0) {
    return ctx.editMessageText(
      "✅ <b>No unmatched payments</b>\n\nEvery recent wallet payment is already accounted for.",
      {
        parse_mode: "HTML",
        ...inlineKeyboard([[BACK_BTN("tools:payment_recovery")]]),
      },
    );
  }

  // Stash the list so taps can reference a payment by index (signatures are too
  // long for callback_data).
  ctx.session.data = {
    unmatched: payments.map((p) => ({
      signature: p.signature,
      receivedSol: p.receivedSol,
      suggestedUserId: p.suggestedUserId,
    })),
  };

  const rows = payments.map((p, i) => [
    {
      text:
        `${p.receivedSol.toFixed(6)} SOL · ${formatDate(new Date(p.blockTimeMs))}` +
        (p.suggestedUserId ? ` · 👤${p.suggestedUserId}` : ""),
      callback_data: `tools:unmatched_pick:${i}`,
    },
  ]);
  rows.push([BACK_BTN("tools:payment_recovery")]);

  return ctx.editMessageText(
    `🪙 <b>Unmatched Wallet Payments</b>\n\n` +
      `These payments arrived but were never credited. Tap one to credit the buyer.\n` +
      `👤 = a likely buyer we matched automatically.`,
    { parse_mode: "HTML", ...inlineKeyboard(rows) },
  );
}

export async function pickUnmatchedPayment(
  ctx: Context & { session: BotSession },
  index: number,
) {
  const list = ctx.session.data?.unmatched as
    | Array<{ signature: string; receivedSol: number; suggestedUserId: number | null }>
    | undefined;
  const item = list?.[index];
  if (!item) {
    await ctx.answerCbQuery("List expired — please rescan.", { show_alert: true });
    return showUnmatchedPayments(ctx);
  }
  ctx.session.step = "admin:credit_unmatched";
  ctx.session.data = {
    creditSignature: item.signature,
    creditReceivedSol: item.receivedSol,
  };
  const suggested = item.suggestedUserId
    ? `\n\nSuggested buyer: <code>${item.suggestedUserId}</code> (send this ID to confirm).`
    : "";
  return ctx.editMessageText(
    `🪙 <b>Credit payment</b>\n\n` +
      `Amount: <b>${item.receivedSol.toFixed(6)} SOL</b>\n` +
      `Tx: <code>${item.signature.slice(0, 16)}…</code>${suggested}\n\n` +
      `Send the buyer's <b>Telegram ID</b> to credit them the EUR value of this payment.`,
    { parse_mode: "HTML", ...inlineKeyboard([[BACK_BTN("tools:unmatched")]]) },
  );
}

// Final step: credit the chosen user for an orphaned payment. Idempotent — the
// signature claim inside creditOrphanToBalance prevents any double credit.
export async function creditUnmatchedPayment(
  ctx: Context & { session: BotSession },
  targetUserId: number,
) {
  const data = ctx.session.data ?? {};
  const signature = data["creditSignature"] as string | undefined;
  const receivedSol = data["creditReceivedSol"] as number | undefined;
  if (!signature || receivedSol === undefined) {
    ctx.session.step = undefined;
    return ctx.reply("Session expired — please rescan unmatched payments.");
  }
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, targetUserId))
    .then((r) => r[0]);
  if (!user) return ctx.reply("User not found. Send a valid Telegram ID:");

  ctx.session.step = undefined;
  ctx.session.data = undefined;

  const newBalance = await creditOrphanToBalance(
    ctx.telegram,
    targetUserId,
    signature,
    receivedSol,
    "purchase",
  );
  if (newBalance === null) {
    await ctx.reply(
      "⚠️ This payment was already credited (or the price feed was unavailable). No change made.",
    );
    return showToolsMenu(ctx);
  }
  await ctx.reply(
    `✅ Credited <code>${targetUserId}</code> for ${receivedSol.toFixed(6)} SOL.\n` +
      `New balance: <b>${formatEur(newBalance)}</b>.`,
    { parse_mode: "HTML" },
  );
  return showToolsMenu(ctx);
}

export async function doRefund(ctx: Context & { session: BotSession }, purchaseId: number) {
  const purchase = await db
    .select()
    .from(purchasesTable)
    .where(eq(purchasesTable.id, purchaseId))
    .then((r) => r[0]);
  if (!purchase || purchase.refunded) {
    await ctx.answerCbQuery("Purchase not found or already refunded.", {
      show_alert: true,
    });
    return;
  }
  // Mark the purchase refunded and credit the buyer's balance atomically, so a
  // refund can never be double-applied or leave the balance out of sync. The
  // refunded flag is flipped conditionally (refunded = false) inside the
  // transaction, making the whole operation idempotent.
  await db.transaction(async (tx) => {
    const flagged = await tx
      .update(purchasesTable)
      .set({ refunded: true })
      .where(
        and(
          eq(purchasesTable.id, purchaseId),
          eq(purchasesTable.refunded, false),
        ),
      )
      .returning({ id: purchasesTable.id });
    // Another concurrent refund already claimed this purchase — do nothing.
    if (flagged.length === 0) return;

    await tx
      .update(usersTable)
      .set({
        balance: sql`${usersTable.balance} + ${purchase.pricePaid}`,
      })
      .where(eq(usersTable.telegramId, purchase.userId));
  });
  const { refreshAdminLiveStatsNow } = await import("./admin");
  refreshAdminLiveStatsNow();
  await ctx.answerCbQuery(
    `Refunded ${formatEur(purchase.pricePaid)} to user ${purchase.userId}.`,
    { show_alert: true }
  );
  await showToolsMenu(ctx);
}

export async function showChangeWallet(ctx: Context & { session: BotSession }) {
  const current = await getSetting("sol_wallet") ?? "Default wallet";
  const text = `
🪙 <b>Change SOL Wallet</b>

Current: <code>${current}</code>

Send a new Solana address to update it. The default is used if none is set.`;
  ctx.session.step = "admin:change_wallet";
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    ...inlineKeyboard([
      [{ text: "↩ Reset to Default", callback_data: "tools:reset_wallet" }],
      [BACK_BTN("admin:tools")],
    ]),
  });
}

export async function doChangeWallet(ctx: Context & { session: BotSession }, input: string) {
  const address = input.trim();
  const isValid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  if (!isValid) {
    await ctx.reply("❌ Invalid Solana address format. Please enter a valid address:", {
      ...inlineKeyboard([
        [{ text: "↩ Back to Tools", callback_data: "admin:tools" }],
      ]),
    });
    return;
  }
  await setSetting("sol_wallet", address);
  const { clearSolWalletCache } = await import("./payments");
  clearSolWalletCache();
  await ctx.reply(`✅ SOL wallet updated to:\n<code>${address}</code>`, {
    parse_mode: "HTML",
    ...inlineKeyboard([[BACK_BTN("admin:tools")]]),
  });
}

export async function resetWalletToDefault(ctx: Context & { session: BotSession }) {
  await setSetting("sol_wallet", "");
  const { clearSolWalletCache } = await import("./payments");
  clearSolWalletCache();
  await ctx.answerCbQuery("✅ Reset to default wallet.", { show_alert: true });
  await showToolsMenu(ctx);
}

export async function showBackupTokens(ctx: Context & { session: BotSession }) {
  const tokens = await db.select().from(backupTokensTable);
  let text = "🔑 <b>Backup Tokens</b>\n\n";
  if (tokens.length === 0) {
    text += "No backup tokens saved.";
  } else {
    text += tokens
      .map(
        (t, i) =>
          `${i + 1}. <code>${t.token.substring(0, 10)}...${t.token.slice(-4)}</code>${t.isActive ? " [ACTIVE]" : ""}`
      )
      .join("\n");
  }
  const rows: { text: string; callback_data: string }[][] = tokens.map((t, i) => [
    {
      text: `❌ Delete #${i + 1} (…${t.token.slice(-4)})`,
      callback_data: `tools:del_token:${t.id}`,
    },
  ]);
  rows.push([{ text: "➕ Add Backup Token", callback_data: "tools:add_token" }]);
  rows.push([BACK_BTN("admin:tools")]);
  const kb = inlineKeyboard(rows);
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function deleteBackupToken(ctx: Context & { session: BotSession }, id: number) {
  await db.delete(backupTokensTable).where(eq(backupTokensTable.id, id));
  await ctx.answerCbQuery("🗑 Token deleted.");
  await showBackupTokens(ctx);
}
