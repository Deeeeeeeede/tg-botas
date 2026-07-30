import { Context, Telegraf } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  usersTable,
  welcomeTemplatesTable,
  reviewsTable,
} from "@workspace/db";
import { eq, desc, count, and, isNull } from "drizzle-orm";
import {
  COMMS_KB,
  inlineKeyboard,
  BACK_BTN,
} from "../keyboards";
import { formatDate } from "../utils";
import { logger } from "../../lib/logger";

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

// ---------------------------------------------------------------------------
// Broadcast — safe, opt-in-only, with permanent suppression of blocked users
// ---------------------------------------------------------------------------

/** Users eligible to receive a broadcast: opted in, not blocked by TG, not admin-banned. */
async function getEligibleRecipients() {
  return db
    .select({ telegramId: usersTable.telegramId })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.marketingOptIn, true),
        isNull(usersTable.botBlockedAt),
        eq(usersTable.isBanned, false),
      ),
    );
}

/**
 * Show a preview of the broadcast (recipient count + message excerpt) and ask
 * the admin to confirm before anything is sent.
 */
export async function showBroadcastPreview(
  ctx: Context & { session: BotSession },
  message: string,
) {
  const recipients = await getEligibleRecipients();
  const total = recipients.length;

  const preview = message.length > 300 ? message.slice(0, 300) + "…" : message;

  const text =
    `📢 <b>Broadcast Preview</b>\n\n` +
    `<b>Recipients:</b> ${total} opted-in user${total === 1 ? "" : "s"}\n` +
    `<i>(Users who blocked the bot or sent /stop are excluded.)</i>\n\n` +
    `<b>Message:</b>\n${preview}\n\n` +
    (total === 0
      ? `⚠️ No eligible recipients — everyone has opted out or none have started the bot.`
      : `Tap <b>✅ Send</b> to deliver, or <b>✖ Cancel</b> to discard.`);

  const kb = inlineKeyboard(
    total > 0
      ? [
          [{ text: "✅ Send to all", callback_data: "comms:broadcast_confirm" }],
          [{ text: "✖ Cancel", callback_data: "comms:broadcast_cancel" }],
        ]
      : [[{ text: "✖ Close", callback_data: "comms:broadcast_cancel" }]],
  );

  await ctx.reply(text, { parse_mode: "HTML", ...kb });
}

/** Error category resolved from a raw Telegram API error. */
type DeliveryError = "blocked" | "deactivated" | "chat_not_found" | "flood" | "other";

function classifyTelegramError(err: unknown): {
  category: DeliveryError;
  retryAfter?: number;
} {
  const e = err as {
    response?: { error_code?: number; description?: string };
    parameters?: { retry_after?: number };
  };
  const code = e?.response?.error_code;
  const desc = (e?.response?.description ?? "").toLowerCase();
  const retryAfter = e?.parameters?.retry_after;

  if (retryAfter) return { category: "flood", retryAfter };
  if (code === 403 && desc.includes("deactivated")) return { category: "deactivated" };
  if (code === 403) return { category: "blocked" };
  if (code === 400 && (desc.includes("chat not found") || desc.includes("not found")))
    return { category: "chat_not_found" };
  return { category: "other" };
}

/**
 * Execute the broadcast sequentially.
 *
 * - Sends one message at a time at ~4 msg/s (well under Telegram's 30 msg/s
 *   global cap, giving headroom for other bot traffic).
 * - Honours Telegram's retry_after on 429 responses.
 * - Permanently marks users who block or deactivate so they are skipped on
 *   every future broadcast.
 * - Updates the admin progress message every 20 deliveries.
 */
export async function executeBroadcast(
  telegram: Telegraf["telegram"],
  adminChatId: number,
  adminMsgId: number,
  message: string,
): Promise<void> {
  const recipients = await getEligibleRecipients();
  const total = recipients.length;
  let sent = 0;
  let suppressed = 0; // permanently blocked/deactivated — removed from future campaigns
  let failed = 0;     // transient or unknown failures

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  // 4 msg/s pacing — keeps us well under the 30/s Telegram limit even under
  // retry back-pressure, and reduces the flood of simultaneous requests.
  const PACE_MS = 250;

  for (let i = 0; i < total; i++) {
    const user = recipients[i]!;
    let delivered = false;
    let suppressReason: string | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await telegram.sendMessage(
          user.telegramId,
          message,
          { parse_mode: "HTML" },
        );
        delivered = true;
        break;
      } catch (err) {
        const { category, retryAfter } = classifyTelegramError(err);

        if (category === "flood") {
          const waitMs = ((retryAfter ?? 30) + 2) * 1000;
          logger.warn(
            { retryAfter, telegramId: user.telegramId },
            "Broadcast flood-limited; pausing before retry",
          );
          await sleep(waitMs);
          continue; // retry same user after back-off
        }

        // Permanent failures — no point retrying; suppress the user.
        if (category === "blocked") {
          suppressReason = "403_blocked";
          break;
        }
        if (category === "deactivated") {
          suppressReason = "403_deactivated";
          break;
        }
        if (category === "chat_not_found") {
          suppressReason = "400_not_found";
          break;
        }

        // Transient / unknown — retry once more then give up without suppressing.
        if (attempt < 2) {
          await sleep(1000);
        }
      }
    }

    if (delivered) {
      sent++;
    } else if (suppressReason) {
      suppressed++;
      // Record the suppression so this user is excluded from all future campaigns.
      await db
        .update(usersTable)
        .set({ botBlockedAt: new Date(), botBlockReason: suppressReason })
        .where(eq(usersTable.telegramId, user.telegramId))
        .catch((e) =>
          logger.error({ e, telegramId: user.telegramId }, "Failed to persist broadcast block state"),
        );
    } else {
      failed++;
    }

    // Update the progress message every 20 deliveries and at the end.
    if ((i + 1) % 20 === 0 || i === total - 1) {
      await telegram
        .editMessageText(
          adminChatId,
          adminMsgId,
          undefined,
          `📢 <b>Broadcasting…</b> ${i + 1} / ${total}\n\n` +
            `✅ Sent: <b>${sent}</b>\n` +
            `🚫 Blocked / removed: <b>${suppressed}</b>\n` +
            `⚠️ Failed (transient): <b>${failed}</b>`,
          { parse_mode: "HTML" },
        )
        .catch(() => {});
    }

    await sleep(PACE_MS);
  }

  // Final summary
  await telegram
    .editMessageText(
      adminChatId,
      adminMsgId,
      undefined,
      `✅ <b>Broadcast complete</b>\n\n` +
        `📨 Delivered: <b>${sent}</b>\n` +
        `🚫 Blocked / removed (auto-suppressed): <b>${suppressed}</b>\n` +
        `⚠️ Other failures: <b>${failed}</b>\n` +
        `👥 Total attempted: <b>${total}</b>\n\n` +
        `<i>Suppressed users will not be retried on future campaigns.</i>`,
      { parse_mode: "HTML" },
    )
    .catch(() => {});
}
