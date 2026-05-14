import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  workersTable,
  productsTable,
  productTypesTable,
  citiesTable,
  districtsTable,
} from "@workspace/db";
import { eq, and, count, desc } from "drizzle-orm";
import {
  WORKERS_KB,
  inlineKeyboard,
  BACK_BTN,
} from "../keyboards";
import { getCities, getDistricts, getProductTypes } from "../db";
import { formatEur, formatDate } from "../utils";

export async function showWorkersMenu(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  if (ctx.callbackQuery) {
    await ctx.editMessageText("👷 <b>Workers</b>\n\nManage trusted product uploaders.", {
      parse_mode: "HTML",
      ...WORKERS_KB,
    });
  } else {
    await ctx.reply("👷 <b>Workers</b>", { parse_mode: "HTML", ...WORKERS_KB });
  }
}

export async function showWorkersList(ctx: Context & { session: BotSession }) {
  const workers = await db.select().from(workersTable).orderBy(desc(workersTable.addedAt));
  if (workers.length === 0) {
    await ctx.editMessageText("No workers added yet.", {
      ...inlineKeyboard([[BACK_BTN("admin:workers")]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...workers.map((w) => [
      {
        text: `${w.enabled ? "✅" : "❌"} ${w.username ? `@${w.username}` : w.telegramId} — ${w.totalUploads} uploads`,
        callback_data: `workers:detail:${w.id}`,
      },
    ]),
    [BACK_BTN("admin:workers")],
  ]);
  await ctx.editMessageText("👷 <b>Workers List</b>", { parse_mode: "HTML", ...kb });
}

export async function showWorkerDetail(
  ctx: Context & { session: BotSession },
  workerId: number
) {
  const worker = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.id, workerId))
    .then((r) => r[0]);
  if (!worker) { await ctx.editMessageText("Worker not found."); return; }

  const [available] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.workerTag, worker.username ?? String(worker.telegramId)),
        eq(productsTable.status, "available")
      )
    );

  const text =
    `👷 <b>Worker</b>\n\n` +
    `ID: <code>${worker.telegramId}</code>\n` +
    `Username: ${worker.username ? `@${worker.username}` : "—"}\n` +
    `Status: ${worker.enabled ? "✅ Active" : "❌ Disabled"}\n` +
    `Total uploads: ${worker.totalUploads}\n` +
    `Still available: ${available?.count ?? 0}\n` +
    `Added: ${formatDate(worker.addedAt)}`;

  const kb = inlineKeyboard([
    [
      worker.enabled
        ? { text: "❌ Disable", callback_data: `workers:disable:${workerId}` }
        : { text: "✅ Enable", callback_data: `workers:enable:${workerId}` },
    ],
    [{ text: "🗑 Remove", callback_data: `workers:remove:${workerId}` }],
    [BACK_BTN("workers:list")],
  ]);
  await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
}

export async function toggleWorker(
  ctx: Context & { session: BotSession },
  workerId: number,
  enabled: boolean
) {
  await db
    .update(workersTable)
    .set({ enabled })
    .where(eq(workersTable.id, workerId));
  await ctx.answerCbQuery(enabled ? "Worker enabled." : "Worker disabled.");
  await showWorkerDetail(ctx, workerId);
}

export async function removeWorker(
  ctx: Context & { session: BotSession },
  workerId: number
) {
  await db.delete(workersTable).where(eq(workersTable.id, workerId));
  await ctx.answerCbQuery("Worker removed.");
  await showWorkersList(ctx);
}

export async function showKladMenu(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  const kb = inlineKeyboard([
    [{ text: "📤 Upload Product", callback_data: "klad:upload" }],
    [{ text: "📋 My Uploads", callback_data: "klad:my_uploads" }],
    [{ text: "✖ Exit", callback_data: "klad:exit" }],
  ]);
  if (ctx.callbackQuery) {
    await ctx.editMessageText("👷 <b>Worker Menu</b>\nSelect an option:", {
      parse_mode: "HTML",
      ...kb,
    });
  } else {
    await ctx.reply("👷 <b>Worker Menu</b>\nSelect an option:", {
      parse_mode: "HTML",
      ...kb,
    });
  }
}

export async function showKladCities(ctx: Context & { session: BotSession }) {
  const cities = await getCities();
  if (cities.length === 0) {
    await ctx.editMessageText("No locations available.", {
      ...inlineKeyboard([[{ text: "✖ Exit", callback_data: "klad:exit" }]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...cities.map((c) => [
      { text: c.name, callback_data: `klad:city:${c.id}` },
    ]),
    [{ text: "✖ Cancel", callback_data: "klad:exit" }],
  ]);
  if (ctx.callbackQuery) {
    await ctx.editMessageText("📍 Select city:", { ...kb });
  } else {
    await ctx.reply("📍 Select city:", { ...kb });
  }
}

export async function showKladDistricts(
  ctx: Context & { session: BotSession },
  cityId: number
) {
  const districts = await getDistricts(cityId);
  if (districts.length === 0) {
    await ctx.editMessageText("No districts in this city.", {
      ...inlineKeyboard([[BACK_BTN("klad:upload")]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...districts.map((d) => [
      { text: d.name, callback_data: `klad:dist:${cityId}:${d.id}` },
    ]),
    [BACK_BTN("klad:upload")],
  ]);
  await ctx.editMessageText("📍 Select district:", { ...kb });
}

export async function showKladTypes(
  ctx: Context & { session: BotSession },
  cityId: number,
  districtId: number
) {
  const types = await getProductTypes();
  const kb = inlineKeyboard([
    ...types.map((t) => [
      {
        text: `${t.emoji} ${t.name}`,
        callback_data: `klad:type:${cityId}:${districtId}:${t.id}`,
      },
    ]),
    [BACK_BTN(`klad:city:${cityId}`)],
  ]);
  await ctx.editMessageText("🏷 Select product type:", { ...kb });
}

export async function showKladSizes(
  ctx: Context & { session: BotSession },
  cityId: number,
  districtId: number,
  typeId: number
) {
  const sizes = await db
    .select({ size: productsTable.size })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.cityId, cityId),
        eq(productsTable.districtId, districtId),
        eq(productsTable.typeId, typeId)
      )
    )
    .groupBy(productsTable.size);

  if (sizes.length === 0) {
    await ctx.editMessageText("No sizes available for this type in this location.", {
      ...inlineKeyboard([[BACK_BTN(`klad:dist:${cityId}:${districtId}`)]]),
    });
    return;
  }

  const kb = inlineKeyboard([
    ...sizes.map((s) => [
      {
        text: s.size,
        callback_data: `klad:size:${cityId}:${districtId}:${typeId}:${encodeURIComponent(s.size)}`,
      },
    ]),
    [BACK_BTN(`klad:type:${cityId}:${districtId}:${typeId}`)],
  ]);
  await ctx.editMessageText("📐 Select size:", { ...kb });
}

export async function showKladMyUploads(ctx: Context & { session: BotSession }, userId: number) {
  const user = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.telegramId, userId))
    .then((r) => r[0]);
  const tag = user?.username ?? String(userId);
  const products = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.workerTag, tag),
        eq(productsTable.status, "available")
      )
    )
    .orderBy(desc(productsTable.createdAt))
    .limit(20);

  if (products.length === 0) {
    await ctx.editMessageText("You have no available uploads.", {
      ...inlineKeyboard([[{ text: "✖ Exit", callback_data: "klad:exit" }]]),
    });
    return;
  }

  const kb = inlineKeyboard([
    ...products.map((p) => [
      {
        text: `🗑 ${p.size} — ${formatEur(p.price)} — ${formatDate(p.createdAt)}`,
        callback_data: `klad:del_upload:${p.id}`,
      },
    ]),
    [{ text: "✖ Exit", callback_data: "klad:exit" }],
  ]);
  await ctx.editMessageText("📋 <b>My Uploads</b> (tap to delete):", {
    parse_mode: "HTML",
    ...kb,
  });
}
