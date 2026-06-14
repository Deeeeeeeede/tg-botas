import { Context } from "telegraf";
import { BotSession } from "../session";
import { getDashboardStats } from "../db";
import { ADMIN_MAIN_KB, ANALYTICS_KB } from "../keyboards";
import { formatEur } from "../utils";

// Track admin screens so we can refresh live stats
const adminMenus = new Map<number, { chatId: number; messageId: number }>();
const analyticsScreens = new Map<number, { chatId: number; messageId: number }>();

export function getAdminMenu(userId: number) { return adminMenus.get(userId); }
export function getAnalyticsScreen(userId: number) { return analyticsScreens.get(userId); }

export function clearAdminMenu(userId: number) { adminMenus.delete(userId); }
export function clearAnalyticsScreen(userId: number) { analyticsScreens.delete(userId); }

export function getAllAdminMenuIds(): number[] { return Array.from(adminMenus.keys()); }
export function getAllAnalyticsIds(): number[] { return Array.from(analyticsScreens.keys()); }

export async function refreshAdminLiveStats(telegram: any) {
  for (const userId of getAllAdminMenuIds()) {
    await refreshAdminMenu(telegram, userId).catch(() => {});
  }
  for (const userId of getAllAnalyticsIds()) {
    await refreshAnalytics(telegram, userId).catch(() => {});
  }
}

let _adminTelegram: any;

export function refreshAdminLiveStatsNow() {
  if (_adminTelegram) {
    refreshAdminLiveStats(_adminTelegram).catch(() => {});
  }
}

let adminRefresherStarted = false;
export function startAdminRefreshLoop(telegram: any) {
  if (adminRefresherStarted) return;
  adminRefresherStarted = true;
  _adminTelegram = telegram;
  setInterval(async () => {
    await refreshAdminLiveStats(telegram);
  }, 30_000);
}

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
  let msg: any;
  if (ctx.callbackQuery) {
    msg = await ctx.editMessageText(text, { parse_mode: "HTML", ...ADMIN_MAIN_KB });
  } else {
    msg = await ctx.reply(text, { parse_mode: "HTML", ...ADMIN_MAIN_KB });
  }
  const msgId = (msg as any)?.message_id ?? (ctx.callbackQuery?.message as any)?.message_id;
  if (msgId && ctx.chat?.id) {
    adminMenus.set(ctx.from!.id, { chatId: ctx.chat.id, messageId: msgId });
  }
}

export async function refreshAdminMenu(telegram: any, userId: number) {
  const screen = adminMenus.get(userId);
  if (!screen) return;
  const stats = await getDashboardStats();
  const text =
    `<b>Admin Dashboard</b>\n\n` +
    `👥 Users: <b>${stats.users}</b>\n` +
    `💰 Balances: <b>${formatEur(stats.balances)}</b>\n` +
    `📈 Sales (30d): <b>${formatEur(stats.sales30d)}</b>\n` +
    `📦 Products in stock: <b>${stats.products}</b>`;
  try {
    await telegram.editMessageText(
      screen.chatId,
      screen.messageId,
      undefined,
      text,
      { parse_mode: "HTML", reply_markup: ADMIN_MAIN_KB.reply_markup },
    );
  } catch {
    adminMenus.delete(userId);
  }
}

export async function refreshAnalytics(telegram: any, userId: number) {
  const screen = analyticsScreens.get(userId);
  if (!screen) return;
  const stats = await getDashboardStats();
  const text =
    `📊 <b>Analytics Dashboard</b>\n\n` +
    `👥 Users: <b>${stats.users}</b>\n` +
    `💰 Balances held: <b>${formatEur(stats.balances)}</b>\n` +
    `📈 Sales (30d): <b>${formatEur(stats.sales30d)}</b>\n` +
    `📦 In stock: <b>${stats.products}</b>`;
  try {
    await telegram.editMessageText(
      screen.chatId,
      screen.messageId,
      undefined,
      text,
      { parse_mode: "HTML", reply_markup: (ANALYTICS_KB as any).reply_markup },
    );
  } catch {
    analyticsScreens.delete(userId);
  }
}

export async function showAnalytics(ctx: Context & { session: BotSession }) {
  const stats = await getDashboardStats();
  const text =
    `📊 <b>Analytics Dashboard</b>\n\n` +
    `👥 Users: <b>${stats.users}</b>\n` +
    `💰 Balances held: <b>${formatEur(stats.balances)}</b>\n` +
    `📈 Sales (30d): <b>${formatEur(stats.sales30d)}</b>\n` +
    `📦 In stock: <b>${stats.products}</b>`;
  let msg: any;
  if (ctx.callbackQuery) {
    msg = await ctx.editMessageText(text, { parse_mode: "HTML", ...ANALYTICS_KB });
  } else {
    msg = await ctx.reply(text, { parse_mode: "HTML", ...ANALYTICS_KB });
  }
  const msgId = (msg as any)?.message_id ?? (ctx.callbackQuery?.message as any)?.message_id;
  if (msgId && ctx.chat?.id) {
    analyticsScreens.set(ctx.from!.id, { chatId: ctx.chat.id, messageId: msgId });
  }
}
