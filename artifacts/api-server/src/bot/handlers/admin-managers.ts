import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import { usersTable, adminsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { inlineKeyboard, BACK_BTN } from "../keyboards";
import { formatDate } from "../utils";

const HARDCODED_OWNER_ID = 8725051269;

function isOwner(telegramId: number): boolean {
  return telegramId === HARDCODED_OWNER_ID;
}

export async function showAdminManagers(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;

  const admins = await db
    .select()
    .from(adminsTable)
    .orderBy(desc(adminsTable.addedAt));

  let text = "🛡 <b>Admin Managers</b>\n\n";
  text += `<b>Owner:</b> <code>${HARDCODED_OWNER_ID}</code> (cannot be removed)\n\n`;

  if (admins.length === 0) {
    text += "No additional admins.";
  } else {
    text += "Additional admins:\n";
    for (const a of admins) {
      text += `• <code>${a.telegramId}</code>${a.username ? ` (@${a.username})` : ""} — added ${formatDate(a.addedAt)}\n`;
    }
  }

  const kb = inlineKeyboard([
    [{ text: "➕ Add Admin", callback_data: "admin_mgr:add" }],
    ...(admins.length > 0
      ? admins
          .filter((a) => !isOwner(a.telegramId))
          .map((a) => [
            {
              text: `❌ Remove ${a.telegramId}`,
              callback_data: `admin_mgr:remove:${a.telegramId}`,
            },
          ])
      : []),
    [BACK_BTN("admin:main")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function addAdmin(ctx: Context & { session: BotSession }, input: string) {
  const parts = input.trim().split(/\s+/);
  const telegramId = Number(parts[0]);
  if (isNaN(telegramId) || telegramId <= 0) {
    await ctx.reply("❌ Invalid Telegram ID. Please enter a numeric ID (e.g. <code>123456789</code>):", {
      parse_mode: "HTML",
      ...inlineKeyboard([[BACK_BTN("admin:manage_admins")]]),
    });
    return;
  }

  if (isOwner(telegramId)) {
    await ctx.reply("⚠️ This ID is the owner and is already an admin.", {
      ...inlineKeyboard([[BACK_BTN("admin:manage_admins")]]),
    });
    return;
  }

  const existing = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.telegramId, telegramId))
    .then((r) => r[0]);
  if (existing) {
    await ctx.reply("⚠️ This user is already an admin.", {
      ...inlineKeyboard([[BACK_BTN("admin:manage_admins")]]),
    });
    return;
  }

  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .then((r) => r[0]);

  await db.insert(adminsTable).values({
    telegramId,
    username: user?.username ?? null,
  });

  await ctx.reply(
    `✅ Admin added: <code>${telegramId}</code>${user?.username ? ` (@${user.username})` : ""}.`,
    {
      parse_mode: "HTML",
      ...inlineKeyboard([[BACK_BTN("admin:manage_admins")]]),
    }
  );
}

export async function removeAdmin(ctx: Context & { session: BotSession }, telegramId: number) {
  if (isOwner(telegramId)) {
    await ctx.answerCbQuery("This user is the owner and cannot be removed.", { show_alert: true });
    return showAdminManagers(ctx);
  }
  await db
    .delete(adminsTable)
    .where(eq(adminsTable.telegramId, telegramId));
  await ctx.answerCbQuery(`Removed admin ${telegramId}.`, { show_alert: true });
  await showAdminManagers(ctx);
}
