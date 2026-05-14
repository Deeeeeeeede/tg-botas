import { InlineKeyboardMarkup } from "telegraf/types";
import { chunk } from "./utils";

export type IKButton = { text: string; callback_data: string };

export function inlineKeyboard(buttons: IKButton[][]): { reply_markup: InlineKeyboardMarkup } {
  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

export function listKeyboard(
  items: { id: number; label: string; prefix: string }[],
  extras: IKButton[] = [],
  cols = 1
): { reply_markup: InlineKeyboardMarkup } {
  const itemButtons: IKButton[][] = chunk(
    items.map((i) => ({ text: i.label, callback_data: `${i.prefix}:${i.id}` })),
    cols
  );
  const extraRows = extras.map((b) => [b]);
  return inlineKeyboard([...itemButtons, ...extraRows]);
}

export const BACK_BTN = (target: string): IKButton => ({
  text: "« Back",
  callback_data: target,
});

export const CANCEL_BTN: IKButton = {
  text: "✖ Cancel",
  callback_data: "admin:main",
};

export const ADMIN_MAIN_KB = inlineKeyboard([
  [
    { text: "📊 Analytics", callback_data: "admin:analytics" },
    { text: "🛍 Purchases", callback_data: "admin:purchases" },
  ],
  [
    { text: "📦 Products Menu", callback_data: "admin:products" },
    { text: "🌍 Geography Menu", callback_data: "admin:geography" },
  ],
  [
    { text: "👥 Users Menu", callback_data: "admin:users" },
    { text: "🎁 Discounts Menu", callback_data: "admin:discounts" },
  ],
  [
    { text: "📣 Communications", callback_data: "admin:comms" },
    { text: "🔧 Tools & Settings", callback_data: "admin:tools" },
  ],
  [
    { text: "📡 Auto Ads System", callback_data: "admin:autoads" },
    { text: "👷 Workers (/klad)", callback_data: "admin:workers" },
  ],
  [{ text: "🏠 User Home", callback_data: "shop:home" }],
]);

export const GEOGRAPHY_KB = inlineKeyboard([
  [{ text: "🏙 Add New City", callback_data: "geo:add_city" }],
  [{ text: "🏙 Manage Cities", callback_data: "geo:cities" }],
  [{ text: "📍 Manage Districts", callback_data: "geo:districts_select" }],
  [BACK_BTN("admin:main")],
]);

export const PRODUCTS_MENU_KB = inlineKeyboard([
  [{ text: "➕ Add Products", callback_data: "prod:add" }],
  [{ text: "📦 Bulk Add Products", callback_data: "prod:bulk_add" }],
  [{ text: "🗂 Manage Products", callback_data: "prod:manage" }],
  [{ text: "👁 View Bot Stock", callback_data: "prod:stock" }],
  [{ text: "📋 Added Products Log", callback_data: "prod:log" }],
  [{ text: "🏷 Manage Product Types", callback_data: "prod:types" }],
  [{ text: "🔀 Reassign Product Type", callback_data: "prod:reassign" }],
  [{ text: "💰 Bulk Edit Prices", callback_data: "prod:bulk_price" }],
  [BACK_BTN("admin:main")],
]);

export const DISCOUNTS_KB = inlineKeyboard([
  [{ text: "🎟 Discount Codes", callback_data: "disc:codes" }],
  [{ text: "🔥 Product Discounts", callback_data: "disc:product" }],
  [{ text: "👑 Reseller Discounts", callback_data: "disc:reseller" }],
  [{ text: "🏆 Tier System", callback_data: "disc:tiers" }],
  [BACK_BTN("admin:main")],
]);

export const COMMS_KB = inlineKeyboard([
  [{ text: "📢 Broadcast Message", callback_data: "comms:broadcast" }],
  [{ text: "👋 Welcome Message", callback_data: "comms:welcome" }],
  [{ text: "⭐ Manage Reviews", callback_data: "comms:reviews" }],
  [BACK_BTN("admin:main")],
]);

export const TOOLS_KB = inlineKeyboard([
  [{ text: "🖼 Set Bot Media", callback_data: "tools:set_media" }],
  [{ text: "🗑 Clear Reservations", callback_data: "tools:clear_res" }],
  [{ text: "💳 Payment Recovery", callback_data: "tools:payment_recovery" }],
  [{ text: "↩ Product Refund", callback_data: "tools:refund" }],
  [{ text: "🔑 Backup Tokens", callback_data: "tools:backup_tokens" }],
  [{ text: "➕ Add Balance to User", callback_data: "tools:add_balance" }],
  [BACK_BTN("admin:main")],
]);

export const ANALYTICS_KB = inlineKeyboard([
  [{ text: "📋 Generate Report", callback_data: "analytics:report" }],
  [{ text: "🌍 Sales by City", callback_data: "analytics:city" }],
  [{ text: "📦 Sales by Type", callback_data: "analytics:type" }],
  [{ text: "🏆 Top Products", callback_data: "analytics:top" }],
  [BACK_BTN("admin:main")],
]);

export const USERS_MENU_KB = inlineKeyboard([
  [{ text: "🔍 Search User", callback_data: "users:search" }],
  [{ text: "👑 Manage Resellers", callback_data: "users:resellers" }],
  [{ text: "📥 Export Users CSV", callback_data: "users:export" }],
  [BACK_BTN("admin:main")],
]);

export const WORKERS_KB = inlineKeyboard([
  [{ text: "➕ Add Worker", callback_data: "workers:add" }],
  [{ text: "👷 View Workers", callback_data: "workers:list" }],
  [BACK_BTN("admin:main")],
]);
