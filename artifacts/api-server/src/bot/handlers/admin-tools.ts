import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  purchasesTable,
  productsTable,
  usersTable,
  basketsTable,
  backupTokensTable,
} from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  TOOLS_KB,
  inlineKeyboard,
  BACK_BTN,
} from "../keyboards";
import { formatEur, formatDate } from "../utils";
import { clearExpiredReservations, getSetting, setSetting } from "../db";

export async function showToolsMenu(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  if (ctx.callbackQuery) {
    await ctx.editMessageText("🔧 <b>Tools & Settings</b>", {
      parse_mode: "HTML",
      ...TOOLS_KB,
    });
  } else {
    await ctx.reply("🔧 <b>Tools & Settings</b>", {
      parse_mode: "HTML",
      ...TOOLS_KB,
    });
  }
}

export async function clearAllReservations(ctx: Context & { session: BotSession }) {
  const cleared = await clearExpiredReservations();
  const basketRows = await db.select({ id: basketsTable.id }).from(basketsTable);
  const total = cleared + basketRows.length;
  await db.delete(basketsTable);
  await ctx.answerCbQuery(`Cleared ${total} basket entries.`, { show_alert: true });
  await showToolsMenu(ctx);
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
        (t) =>
          `• ${t.token.substring(0, 10)}... ${t.isActive ? "[ACTIVE]" : ""}`
      )
      .join("\n");
  }
  const kb = inlineKeyboard([
    [{ text: "➕ Add Backup Token", callback_data: "tools:add_token" }],
    [BACK_BTN("admin:tools")],
  ]);
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}
