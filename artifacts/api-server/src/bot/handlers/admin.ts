import { Context } from "telegraf";
import { BotSession } from "../session";
import { getDashboardStats } from "../db";
import { ADMIN_MAIN_KB } from "../keyboards";
import { formatEur } from "../utils";

export async function showAdminMenu(ctx: Context & { session: BotSession }) {
  const stats = await getDashboardStats();
  const text =
    `<b>Admin Dashboard</b>\n\n` +
    `👥 Users: <b>${stats.users}</b>\n` +
    `💰 Balances: <b>${formatEur(stats.balances)}</b>\n` +
    `📈 Sales (30d): <b>${formatEur(stats.sales30d)}</b>\n` +
    `📦 Products in stock: <b>${stats.products}</b>`;
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...ADMIN_MAIN_KB });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...ADMIN_MAIN_KB });
  }
}
