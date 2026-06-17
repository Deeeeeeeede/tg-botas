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
import { eq, and, gte, lte, count, sum, avg, desc, sql } from "drizzle-orm";
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

function contentIcon(fileType: string): string {
  if (fileType === "photo") return "📷";
  if (fileType === "document") return "📄";
  if (fileType === "video") return "🎥";
  if (fileType === "animation") return "🎞";
  return "💬";
}

export async function salesToday(ctx: Context & { session: BotSession }, page = 0) {
  const PAGE_SIZE = 10;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rows = await db
    .select({
      purchaseId: purchasesTable.id,
      pricePaid: purchasesTable.pricePaid,
      createdAt: purchasesTable.createdAt,
      refunded: purchasesTable.refunded,
      paymentMethod: purchasesTable.paymentMethod,
      senderWallet: purchasesTable.senderWallet,
      username: usersTable.username,
      firstName: usersTable.firstName,
      telegramId: usersTable.telegramId,
      typeEmoji: productTypesTable.emoji,
      typeName: productTypesTable.name,
      size: productsTable.size,
      fileType: productsTable.fileType,
      content: productsTable.content,
      mediaFiles: productsTable.mediaFiles,
    })
    .from(purchasesTable)
    .innerJoin(usersTable, eq(purchasesTable.userId, usersTable.telegramId))
    .innerJoin(productsTable, eq(purchasesTable.productId, productsTable.id))
    .innerJoin(productTypesTable, eq(productsTable.typeId, productTypesTable.id))
    .where(gte(purchasesTable.createdAt, todayStart))
    .orderBy(desc(purchasesTable.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  const [totalsRow] = await db
    .select({
      totalOrders: count(),
      totalRevenue: sum(purchasesTable.pricePaid),
    })
    .from(purchasesTable)
    .where(and(gte(purchasesTable.createdAt, todayStart), eq(purchasesTable.refunded, false)));

  const [totalCountRow] = await db
    .select({ cnt: count() })
    .from(purchasesTable)
    .where(gte(purchasesTable.createdAt, todayStart));

  const totalCount = totalCountRow?.cnt ?? 0;

  const dateLabel = todayStart.toLocaleDateString("en-GB", {
    timeZone: "Europe/Vilnius",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  let text =
    `📅 <b>Sales Today — ${dateLabel}</b>\n` +
    `Orders: <b>${totalsRow?.totalOrders ?? 0}</b>   Revenue: <b>${formatEur(totalsRow?.totalRevenue ?? 0)}</b>\n\n`;

  if (rows.length === 0) {
    text += "No sales today yet.";
  } else {
    rows.forEach((r, i) => {
      const num = page * PAGE_SIZE + i + 1;
      const time = r.createdAt.toLocaleTimeString("en-GB", {
        timeZone: "Europe/Vilnius",
        hour: "2-digit",
        minute: "2-digit",
      });
      const buyer = r.username
        ? `@${r.username}`
        : r.firstName ?? `#${r.telegramId}`;
      const refundMark = r.refunded ? " ↩️" : "";
      const icon = contentIcon(r.fileType);
      // For text products show a snippet; for media show the icon type
      let contentHint = "";
      if (r.fileType === "text" && r.content) {
        const snippet = r.content.length > 40 ? r.content.slice(0, 40) + "…" : r.content;
        contentHint = `\n  💬 <code>${snippet}</code>`;
      } else {
        contentHint = `\n  ${icon} ${r.fileType}`;
        // If there are additional media files, mention them
        if (r.mediaFiles) {
          try {
            const extras = JSON.parse(r.mediaFiles) as { fileType: string }[];
            if (extras.length > 0) {
              const extraIcons = extras.map((e) => contentIcon(e.fileType)).join(" ");
              contentHint += ` + ${extraIcons}`;
            }
          } catch {}
        }
      }
      const walletHint = r.senderWallet
        ? `\n  💳 paid from <code>${r.senderWallet}</code>`
        : "";
      text +=
        `<b>${num}.</b> ${time} — <b>${buyer}</b>\n` +
        `  ${r.typeEmoji} ${r.typeName} ${r.size} — ${formatEur(r.pricePaid)}${refundMark}` +
        `${contentHint}${walletHint}\n\n`;
    });
  }

  // Compact view buttons: 5 per row
  const viewBtns = rows.map((r, i) => ({
    text: `👁 ${page * PAGE_SIZE + i + 1}`,
    callback_data: `analytics:view_sale:${r.purchaseId}`,
  }));
  const viewRows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < viewBtns.length; i += 5) {
    viewRows.push(viewBtns.slice(i, i + 5));
  }

  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0) navRow.push({ text: "« Prev", callback_data: `analytics:today:${page - 1}` });
  if ((page + 1) * PAGE_SIZE < totalCount) navRow.push({ text: "Next »", callback_data: `analytics:today:${page + 1}` });

  const kb = inlineKeyboard([
    ...viewRows,
    ...(navRow.length ? [navRow] : []),
    [BACK_BTN("admin:analytics")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function viewSaleContent(ctx: Context & { session: BotSession }, purchaseId: number) {
  const [row] = await db
    .select({
      fileType: productsTable.fileType,
      content: productsTable.content,
      fileId: productsTable.fileId,
      mediaFiles: productsTable.mediaFiles,
      typeName: productTypesTable.name,
      typeEmoji: productTypesTable.emoji,
      size: productsTable.size,
      username: usersTable.username,
      firstName: usersTable.firstName,
      pricePaid: purchasesTable.pricePaid,
      senderWallet: purchasesTable.senderWallet,
      txSignature: purchasesTable.txSignature,
    })
    .from(purchasesTable)
    .innerJoin(productsTable, eq(purchasesTable.productId, productsTable.id))
    .innerJoin(productTypesTable, eq(productsTable.typeId, productTypesTable.id))
    .innerJoin(usersTable, eq(purchasesTable.userId, usersTable.telegramId))
    .where(eq(purchasesTable.id, purchaseId));

  if (!row) {
    await ctx.answerCbQuery("❌ Sale not found.");
    return;
  }

  await ctx.answerCbQuery();

  const buyer = row.username ? `@${row.username}` : row.firstName ?? `#${purchaseId}`;
  const header = `🧾 Content sent to <b>${buyer}</b> — ${row.typeEmoji} ${row.typeName} ${row.size} (${formatEur(row.pricePaid)}):`;

  // Send the header as plain text
  await ctx.reply(header, { parse_mode: "HTML" });

  // Show which wallet paid (for SOL payments) so the admin can reconcile
  // against direct/manual deals.
  if (row.senderWallet) {
    await ctx.reply(
      `💳 Paid from wallet:\n<code>${row.senderWallet}</code>`,
      { parse_mode: "HTML" },
    );
  }

  // Collect all files to send (same logic as sendProductMedia)
  const files: { fileId: string; fileType: string }[] = [];
  if (row.fileId && row.fileType !== "text") {
    files.push({ fileId: row.fileId, fileType: row.fileType });
  }
  if (row.mediaFiles) {
    try {
      const extras = JSON.parse(row.mediaFiles) as { fileId: string; fileType: string }[];
      files.push(...extras);
    } catch {}
  }

  // Send text content first if primary type is text
  if (row.fileType === "text" && row.content) {
    await ctx.reply(`<code>${row.content}</code>`, { parse_mode: "HTML" });
  }

  // Send all media/text items
  for (const f of files) {
    if (f.fileType === "photo") await ctx.replyWithPhoto(f.fileId);
    else if (f.fileType === "document") await ctx.replyWithDocument(f.fileId);
    else if (f.fileType === "video") await ctx.replyWithVideo(f.fileId);
    else if (f.fileType === "animation" || f.fileType === "gif") await (ctx as any).replyWithAnimation(f.fileId);
    else if (f.fileType === "text") await ctx.reply(`<code>${f.fileId}</code>`, { parse_mode: "HTML" });
  }
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
