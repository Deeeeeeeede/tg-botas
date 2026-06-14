import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  purchasesTable,
  productsTable,
  usersTable,
  citiesTable,
  productTypesTable,
} from "@workspace/db";
import { eq, and, gte, lte, count, sum, avg, desc } from "drizzle-orm";
import { ANALYTICS_KB, inlineKeyboard, BACK_BTN } from "../keyboards";
import { formatEur, formatDate } from "../utils";
import { getDashboardStats } from "../db";

function getPeriod(period: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return { start: today, end: now, label: "Today" };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: y, end: today, label: "Yesterday" };
    }
    case "week": {
      const w = new Date(today);
      w.setDate(w.getDate() - 7);
      return { start: w, end: now, label: "This Week" };
    }
    case "last_week": {
      const lw = new Date(today);
      lw.setDate(lw.getDate() - 14);
      const lwe = new Date(today);
      lwe.setDate(lwe.getDate() - 7);
      return { start: lw, end: lwe, label: "Last Week" };
    }
    case "month": {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: m, end: now, label: "This Month" };
    }
    case "last_month": {
      const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: lmStart, end: lmEnd, label: "Last Month" };
    }
    case "year": {
      const yr = new Date(now.getFullYear(), 0, 1);
      return { start: yr, end: now, label: "Year So Far" };
    }
    default:
      return { start: today, end: now, label: "Today" };
  }
}

export async function showReportMenu(ctx: Context & { session: BotSession }) {
  const periods = [
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["week", "This Week"],
    ["last_week", "Last Week"],
    ["month", "This Month"],
    ["last_month", "Last Month"],
    ["year", "Year So Far"],
  ];
  const kb = inlineKeyboard([
    ...periods.map(([key, label]) => [
      { text: label, callback_data: `analytics:rpt:${key}` },
    ]),
    [BACK_BTN("admin:analytics")],
  ]);
  await ctx.editMessageText("📋 <b>Generate Report</b> — Select period:", {
    parse_mode: "HTML",
    ...kb,
  });
}

export async function generateReport(
  ctx: Context & { session: BotSession },
  period: string
) {
  const { start, end, label } = getPeriod(period);
  const purchases = await db
    .select({
      count: count(),
      total: sum(purchasesTable.pricePaid),
      avg: avg(purchasesTable.pricePaid),
    })
    .from(purchasesTable)
    .where(
      and(
        gte(purchasesTable.createdAt, start),
        lte(purchasesTable.createdAt, end),
        eq(purchasesTable.refunded, false)
      )
    );

  const byType = await db
    .select({
      typeName: productTypesTable.name,
      typeEmoji: productTypesTable.emoji,
      count: count(),
      total: sum(purchasesTable.pricePaid),
    })
    .from(purchasesTable)
    .innerJoin(productsTable, eq(purchasesTable.productId, productsTable.id))
    .innerJoin(productTypesTable, eq(productsTable.typeId, productTypesTable.id))
    .where(
      and(
        gte(purchasesTable.createdAt, start),
        lte(purchasesTable.createdAt, end),
        eq(purchasesTable.refunded, false)
      )
    )
    .groupBy(productTypesTable.name, productTypesTable.emoji)
    .orderBy(desc(sum(purchasesTable.pricePaid)));

  const p = purchases[0];
  let text =
    `📋 <b>Sales Report — ${label}</b>\n\n` +
    `Orders: <b>${p?.count ?? 0}</b>\n` +
    `Revenue: <b>${formatEur(p?.total ?? 0)}</b>\n` +
    `Avg order: <b>${formatEur(p?.avg ?? 0)}</b>\n`;

  if (byType.length > 0) {
    text += "\n<b>By product type:</b>\n";
    for (const row of byType) {
      text += `${row.typeEmoji} ${row.typeName}: ${row.count} orders — ${formatEur(row.total ?? 0)}\n`;
    }
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    ...inlineKeyboard([
      [BACK_BTN("analytics:report")],
      [BACK_BTN("admin:analytics")],
    ]),
  });
}

export async function salesByCity(ctx: Context & { session: BotSession }) {
  const rows = await db
    .select({
      cityName: citiesTable.name,
      count: count(),
      total: sum(purchasesTable.pricePaid),
    })
    .from(purchasesTable)
    .innerJoin(productsTable, eq(purchasesTable.productId, productsTable.id))
    .innerJoin(citiesTable, eq(productsTable.cityId, citiesTable.id))
    .where(eq(purchasesTable.refunded, false))
    .groupBy(citiesTable.name)
    .orderBy(desc(sum(purchasesTable.pricePaid)));

  let text = "🌍 <b>Sales by City</b>\n\n";
  if (rows.length === 0) {
    text += "No sales yet.";
  } else {
    for (const row of rows) {
      text += `🏙 <b>${row.cityName}</b>: ${row.count} orders — ${formatEur(row.total ?? 0)}\n`;
    }
  }
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    ...inlineKeyboard([[BACK_BTN("admin:analytics")]]),
  });
}

export async function salesByType(ctx: Context & { session: BotSession }) {
  const rows = await db
    .select({
      typeName: productTypesTable.name,
      typeEmoji: productTypesTable.emoji,
      count: count(),
      total: sum(purchasesTable.pricePaid),
    })
    .from(purchasesTable)
    .innerJoin(productsTable, eq(purchasesTable.productId, productsTable.id))
    .innerJoin(productTypesTable, eq(productsTable.typeId, productTypesTable.id))
    .where(eq(purchasesTable.refunded, false))
    .groupBy(productTypesTable.name, productTypesTable.emoji)
    .orderBy(desc(sum(purchasesTable.pricePaid)));

  let text = "📦 <b>Sales by Type</b>\n\n";
  if (rows.length === 0) {
    text += "No sales yet.";
  } else {
    for (const row of rows) {
      text += `${row.typeEmoji} <b>${row.typeName}</b>: ${row.count} orders — ${formatEur(row.total ?? 0)}\n`;
    }
  }
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    ...inlineKeyboard([[BACK_BTN("admin:analytics")]]),
  });
}

export async function showPurchases(ctx: Context & { session: BotSession }, page = 0) {
  const PAGE_SIZE = 10;
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
    .orderBy(desc(purchasesTable.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  const [totalRow] = await db.select({ count: count() }).from(purchasesTable);
  const total = totalRow?.count ?? 0;

  let text = "🛍 <b>Recent Purchases</b>\n\n";
  if (purchases.length === 0) {
    text += "No purchases yet.";
  } else {
    for (const p of purchases) {
      text +=
        `• <code>${p.queueId}</code> — ${formatEur(p.price)} — ` +
        `${formatDate(p.createdAt)}${p.refunded ? " [REFUNDED]" : ""}\n`;
    }
  }

  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0) navRow.push({ text: "« Prev", callback_data: `admin:purchases:${page - 1}` });
  if ((page + 1) * PAGE_SIZE < total) navRow.push({ text: "Next »", callback_data: `admin:purchases:${page + 1}` });

  const kb = inlineKeyboard([
    ...(navRow.length ? [navRow] : []),
    [BACK_BTN("admin:main")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}
