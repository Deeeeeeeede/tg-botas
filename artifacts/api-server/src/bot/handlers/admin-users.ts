import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import { usersTable, workersTable, purchasesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  USERS_MENU_KB,
  inlineKeyboard,
  BACK_BTN,
} from "../keyboards";
import { formatEur, formatDate } from "../utils";
import { searchUser } from "../db";

export async function showUsersMenu(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  if (ctx.callbackQuery) {
    await ctx.editMessageText("👥 <b>Users Menu</b>", {
      parse_mode: "HTML",
      ...USERS_MENU_KB,
    });
  } else {
    await ctx.reply("👥 <b>Users Menu</b>", {
      parse_mode: "HTML",
      ...USERS_MENU_KB,
    });
  }
}

export async function showUserProfile(
  ctx: Context & { session: BotSession },
  query: string
) {
  const user = await searchUser(query);
  if (!user) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery("User not found.", { show_alert: true });
    } else {
      await ctx.reply("User not found.");
    }
    return;
  }

  const recentPurchases = await db
    .select()
    .from(purchasesTable)
    .where(eq(purchasesTable.userId, user.telegramId))
    .orderBy(desc(purchasesTable.createdAt))
    .limit(5);

  const text =
    `👤 <b>User Profile</b>\n\n` +
    `ID: <code>${user.telegramId}</code>\n` +
    `Username: ${user.username ? `@${user.username}` : "—"}\n` +
    `Name: ${user.firstName ?? "—"}\n` +
    `Tier: <b>${user.tierName}</b>\n` +
    `Balance: <b>${formatEur(user.balance)}</b>\n` +
    `Purchases: <b>${user.purchaseCount}</b>\n` +
    `Total spent: <b>${formatEur(user.eurSpent)}</b>\n` +
    `Reseller: ${user.isReseller ? "✅" : "❌"}\n` +
    `Banned: ${user.isBanned ? "🚫 Yes" : "✅ No"}\n` +
    `Member since: ${formatDate(user.createdAt)}\n` +
    (recentPurchases.length > 0
      ? `\n<b>Recent purchases:</b>\n` +
        recentPurchases
          .map(
            (p) =>
              `• Queue ${p.queueId} — ${formatEur(p.pricePaid)} — ${formatDate(p.createdAt)}`
          )
          .join("\n")
      : "");

  const kb = inlineKeyboard([
    [
      user.isBanned
        ? {
            text: "✅ Unban User",
            callback_data: `users:unban:${user.telegramId}`,
          }
        : {
            text: "🚫 Ban User",
            callback_data: `users:ban:${user.telegramId}`,
          },
    ],
    [
      user.isReseller
        ? {
            text: "❌ Remove Reseller",
            callback_data: `users:rm_reseller:${user.telegramId}`,
          }
        : {
            text: "👑 Make Reseller",
            callback_data: `users:mk_reseller:${user.telegramId}`,
          },
    ],
    [
      {
        text: "💰 Add Balance",
        callback_data: `users:add_bal:${user.telegramId}`,
      },
    ],
    [BACK_BTN("admin:users")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function banUser(ctx: Context & { session: BotSession }, telegramId: number) {
  await db
    .update(usersTable)
    .set({ isBanned: true })
    .where(eq(usersTable.telegramId, telegramId));
  await ctx.answerCbQuery("User banned.");
  await showUserProfile(ctx, String(telegramId));
}

export async function unbanUser(ctx: Context & { session: BotSession }, telegramId: number) {
  await db
    .update(usersTable)
    .set({ isBanned: false })
    .where(eq(usersTable.telegramId, telegramId));
  await ctx.answerCbQuery("User unbanned.");
  await showUserProfile(ctx, String(telegramId));
}

export async function makeReseller(ctx: Context & { session: BotSession }, telegramId: number) {
  await db
    .update(usersTable)
    .set({ isReseller: true })
    .where(eq(usersTable.telegramId, telegramId));
  await ctx.answerCbQuery("User is now a reseller.");
  await showUserProfile(ctx, String(telegramId));
}

export async function removeReseller(ctx: Context & { session: BotSession }, telegramId: number) {
  await db
    .update(usersTable)
    .set({ isReseller: false })
    .where(eq(usersTable.telegramId, telegramId));
  await ctx.answerCbQuery("Reseller status removed.");
  await showUserProfile(ctx, String(telegramId));
}

export async function exportUsersCsv(ctx: Context & { session: BotSession }) {
  const users = await db.select().from(usersTable);
  const header = "ID,Username,Balance,Purchases,EUR Spent,Tier,Banned\n";
  const rows = users.map((u) =>
    [
      u.telegramId,
      u.username ?? "",
      u.balance,
      u.purchaseCount,
      u.eurSpent,
      u.tierName,
      u.isBanned ? "yes" : "no",
    ].join(",")
  );
  const csv = header + rows.join("\n");
  const buf = Buffer.from(csv, "utf-8");
  await ctx.replyWithDocument(
    { source: buf, filename: `users_${Date.now()}.csv` },
    { caption: `Exported ${users.length} users.` }
  );
}
