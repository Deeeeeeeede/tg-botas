import { Context, Telegraf } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  usersTable,
  welcomeTemplatesTable,
  reviewsTable,
} from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import {
  COMMS_KB,
  inlineKeyboard,
  BACK_BTN,
} from "../keyboards";
import { formatDate } from "../utils";

export async function showCommsMenu(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  if (ctx.callbackQuery) {
    await ctx.editMessageText("📣 <b>Communications</b>", {
      parse_mode: "HTML",
      ...COMMS_KB,
    });
  } else {
    await ctx.reply("📣 <b>Communications</b>", {
      parse_mode: "HTML",
      ...COMMS_KB,
    });
  }
}

export async function showWelcomeMenu(ctx: Context & { session: BotSession }) {
  const templates = await db
    .select()
    .from(welcomeTemplatesTable)
    .orderBy(desc(welcomeTemplatesTable.createdAt));

  const active = templates.find((t) => t.isActive);

  let text = "👋 <b>Welcome Message</b>\n\n";
  text += `Active template: ${active ? `"${active.text.substring(0, 40)}..."` : "Built-in default"}\n\n`;
  if (templates.length > 0) {
    text += "Saved templates:\n";
    templates.forEach((t, i) => {
      text += `${i + 1}. ${t.isActive ? "✅ " : ""}${t.text.substring(0, 50)}...\n`;
    });
  }

  const kb = inlineKeyboard([
    [{ text: "➕ Add New Template", callback_data: "comms:welcome_add" }],
    ...templates.map((t) => [
      {
        text: `${t.isActive ? "✅ " : ""}Activate: ${t.text.substring(0, 20)}...`,
        callback_data: `comms:welcome_activate:${t.id}`,
      },
      { text: "🗑", callback_data: `comms:welcome_del:${t.id}` },
    ]),
    [{ text: "🔄 Reset to Default", callback_data: "comms:welcome_reset" }],
    [BACK_BTN("admin:comms")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function activateWelcomeTemplate(
  ctx: Context & { session: BotSession },
  templateId: number
) {
  await db
    .update(welcomeTemplatesTable)
    .set({ isActive: false });
  await db
    .update(welcomeTemplatesTable)
    .set({ isActive: true })
    .where(eq(welcomeTemplatesTable.id, templateId));
  await ctx.answerCbQuery("Template activated.");
  await showWelcomeMenu(ctx);
}

export async function deleteWelcomeTemplate(
  ctx: Context & { session: BotSession },
  templateId: number
) {
  await db
    .delete(welcomeTemplatesTable)
    .where(eq(welcomeTemplatesTable.id, templateId));
  await ctx.answerCbQuery("Template deleted.");
  await showWelcomeMenu(ctx);
}

export async function showReviews(ctx: Context & { session: BotSession }, page = 0) {
  const PAGE_SIZE = 5;
  const reviews = await db
    .select()
    .from(reviewsTable)
    .orderBy(desc(reviewsTable.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  let text = "⭐ <b>Customer Reviews</b>\n\n";
  if (reviews.length === 0) {
    text += "No reviews yet.";
  } else {
    for (const r of reviews) {
      text +=
        `👤 ${r.username ? `@${r.username}` : `ID:${r.userId}`} — ${formatDate(r.createdAt)}\n` +
        `"${r.text}"\n\n`;
    }
  }

  const reviewButtons = reviews.map((r) => [
    { text: `🗑 Delete review #${r.id}`, callback_data: `comms:del_review:${r.id}:${page}` },
  ]);

  const [totalRow] = await db
    .select({ count: count() })
    .from(reviewsTable);
  const total = (totalRow as any)?.count ?? 0;
  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0) navRow.push({ text: "« Prev", callback_data: `comms:reviews:${page - 1}` });
  if ((page + 1) * PAGE_SIZE < total) navRow.push({ text: "Next »", callback_data: `comms:reviews:${page + 1}` });

  const kb = inlineKeyboard([
    ...reviewButtons,
    ...(navRow.length ? [navRow] : []),
    [BACK_BTN("admin:comms")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}
