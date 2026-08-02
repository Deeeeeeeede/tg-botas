import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  workersTable,
  productsTable,
  productSlotsTable,
  productTypesTable,
  citiesTable,
  districtsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, count, desc } from "drizzle-orm";
import {
  WORKERS_KB,
  inlineKeyboard,
  BACK_BTN,
} from "../keyboards";
import { getCities, getDistricts, getProductTypes } from "../db";
import { formatEur, formatDate } from "../utils";

// ─── Saved-route helpers (quick-upload menu) ─────────────────────────────────

export type SavedRoute = {
  cityId: number;
  districtId: number;
  typeId: number;
  size: string;
  label: string; // "City · District · 🔮 Type · Size"
};

/** Build a human-readable label for a route by looking up names from the DB. */
export async function buildRouteLabel(
  cityId: number,
  districtId: number,
  typeId: number,
  size: string,
): Promise<string> {
  const [city, district, type] = await Promise.all([
    db.select({ name: citiesTable.name }).from(citiesTable)
      .where(eq(citiesTable.id, cityId)).then((r) => r[0]),
    db.select({ name: districtsTable.name }).from(districtsTable)
      .where(eq(districtsTable.id, districtId)).then((r) => r[0]),
    db
      .select({ name: productTypesTable.name, emoji: productTypesTable.emoji })
      .from(productTypesTable)
      .where(eq(productTypesTable.id, typeId))
      .then((r) => r[0]),
  ]);
  const cityName = city?.name ?? `City#${cityId}`;
  const distName = district?.name ?? `Dist#${districtId}`;
  const typePart = type ? `${type.emoji} ${type.name}` : `Type#${typeId}`;
  return `${cityName} · ${distName} · ${typePart} · ${size}`;
}

/**
 * Prepend `route` to a worker's recent-routes list (max 5, deduped by route).
 * Does nothing if the worker record cannot be found.
 */
export async function saveWorkerRecentRoute(
  telegramId: number,
  route: SavedRoute,
): Promise<void> {
  const worker = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.telegramId, telegramId))
    .then((r) => r[0]);
  if (!worker) return;

  const existing: SavedRoute[] = worker.recentRoutes
    ? (JSON.parse(worker.recentRoutes) as SavedRoute[])
    : [];
  // Remove any duplicate entry for the exact same route
  const deduped = existing.filter(
    (r) =>
      !(
        r.cityId === route.cityId &&
        r.districtId === route.districtId &&
        r.typeId === route.typeId &&
        r.size === route.size
      ),
  );
  const updated = [route, ...deduped].slice(0, 5);
  await db
    .update(workersTable)
    .set({ recentRoutes: JSON.stringify(updated) })
    .where(eq(workersTable.id, worker.id));
}

// Resolve the workerTag exactly as the upload paths in index.ts do:
// worker record username -> users table username -> telegram ID string.
// Must stay in sync with the upload-time derivation or uploads become invisible.
async function resolveWorkerTag(worker: {
  username: string | null;
  telegramId: number;
}): Promise<string> {
  if (worker.username) return worker.username;
  const userRow = await db
    .select({ username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.telegramId, worker.telegramId))
    .then((r) => r[0]);
  return userRow?.username ?? String(worker.telegramId);
}

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

  const workerTag = await resolveWorkerTag(worker);
  const [available] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.workerTag, workerTag),
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
    [{ text: "📦 View Uploads", callback_data: `workers:uploads:${workerId}:0` }],
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

const UPLOADS_PAGE_SIZE = 10;

const STATUS_ICON: Record<string, string> = {
  available: "🟢",
  sold: "💰",
  reserved: "🟡",
};

export async function showWorkerUploads(
  ctx: Context & { session: BotSession },
  workerId: number,
  page = 0
) {
  const worker = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.id, workerId))
    .then((r) => r[0]);
  if (!worker) {
    await ctx.editMessageText("Worker not found.");
    return;
  }
  const tag = await resolveWorkerTag(worker);

  const [total] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(eq(productsTable.workerTag, tag));
  const totalCount = total?.count ?? 0;

  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.workerTag, tag))
    .orderBy(desc(productsTable.createdAt))
    .limit(UPLOADS_PAGE_SIZE)
    .offset(page * UPLOADS_PAGE_SIZE);

  const label = worker.username ? `@${worker.username}` : String(worker.telegramId);
  if (totalCount === 0) {
    await ctx.editMessageText(`📦 <b>${label}</b> has no uploads.`, {
      parse_mode: "HTML",
      ...inlineKeyboard([[BACK_BTN(`workers:detail:${workerId}`)]]),
    });
    return;
  }

  const totalPages = Math.ceil(totalCount / UPLOADS_PAGE_SIZE);
  let text = `📦 <b>Uploads by ${label}</b>\n`;
  text += `Total: ${totalCount} · Page ${page + 1}/${totalPages}\n`;
  text += `Tap a number below to view its photos / text.\n\n`;
  products.forEach((p, i) => {
    const icon = STATUS_ICON[p.status] ?? "•";
    const n = page * UPLOADS_PAGE_SIZE + i + 1;
    text +=
      `<b>${n}.</b> ${icon} <b>${p.size}</b> — ${formatEur(p.price)} · ${p.status}\n` +
      `   ${formatDate(p.createdAt)}\n`;
  });

  const rows: { text: string; callback_data: string }[][] = [];

  // One numbered button per upload (5 per row) to fetch its actual content.
  const contentBtns = products.map((p, i) => ({
    text: String(page * UPLOADS_PAGE_SIZE + i + 1),
    callback_data: `workers:upload:${p.id}`,
  }));
  for (let i = 0; i < contentBtns.length; i += 5) {
    rows.push(contentBtns.slice(i, i + 5));
  }

  const nav: { text: string; callback_data: string }[] = [];
  if (page > 0)
    nav.push({
      text: "⬅ Prev",
      callback_data: `workers:uploads:${workerId}:${page - 1}`,
    });
  if (page < totalPages - 1)
    nav.push({
      text: "Next ➡",
      callback_data: `workers:uploads:${workerId}:${page + 1}`,
    });
  if (nav.length > 0) rows.push(nav);
  rows.push([BACK_BTN(`workers:detail:${workerId}`)]);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    ...inlineKeyboard(rows),
  });
}

// Shared content fields selected for any upload preview.
const UPLOAD_CONTENT_COLUMNS = {
  size: productsTable.size,
  price: productsTable.price,
  status: productsTable.status,
  content: productsTable.content,
  fileId: productsTable.fileId,
  fileType: productsTable.fileType,
  mediaFiles: productsTable.mediaFiles,
  createdAt: productsTable.createdAt,
  workerTag: productsTable.workerTag,
  cityName: citiesTable.name,
  districtName: districtsTable.name,
  typeName: productTypesTable.name,
  typeEmoji: productTypesTable.emoji,
};

type UploadContentRow = {
  content: string | null;
  fileId: string | null;
  fileType: string;
  mediaFiles: string | null;
};

// Send every file (and any inline text) attached to an upload. Pure output —
// it never mutates product state, so it's safe to reuse for both the admin
// "View Uploads" review and the worker "My Uploads" preview.
async function sendUploadFiles(ctx: Context, row: UploadContentRow) {
  const files: { fileId: string; fileType: string }[] = [];
  if (row.fileId && row.fileType !== "text") {
    files.push({ fileId: row.fileId, fileType: row.fileType });
  }
  if (row.mediaFiles) {
    try {
      const extras = JSON.parse(row.mediaFiles) as {
        fileId: string;
        fileType: string;
      }[];
      files.push(...extras);
    } catch {
      // ignore malformed media_files JSON
    }
  }

  // For text-only uploads, send the content text first.
  if (row.fileType === "text" && row.content) {
    await ctx.reply(`<code>${row.content}</code>`, { parse_mode: "HTML" });
  }

  for (const f of files) {
    if (f.fileType === "photo") await ctx.replyWithPhoto(f.fileId);
    else if (f.fileType === "document") await ctx.replyWithDocument(f.fileId);
    else if (f.fileType === "video") await ctx.replyWithVideo(f.fileId);
    else if (f.fileType === "animation" || f.fileType === "gif")
      await ctx.replyWithAnimation(f.fileId);
    else if (f.fileType === "text")
      await ctx.reply(`<code>${f.fileId}</code>`, { parse_mode: "HTML" });
  }

  // For photo/video uploads that also have a caption, send the caption text
  // after the media so nothing is lost when the worker forwarded a combined message.
  if (row.fileType !== "text" && row.content) {
    await ctx.reply(`<code>${row.content}</code>`, { parse_mode: "HTML" });
  }

  if (files.length === 0 && !row.content) {
    await ctx.reply("⚠️ This upload has no stored content.");
  }
}

export async function sendWorkerUploadContent(
  ctx: Context & { session: BotSession },
  productId: number
) {
  const [row] = await db
    .select(UPLOAD_CONTENT_COLUMNS)
    .from(productsTable)
    .leftJoin(citiesTable, eq(productsTable.cityId, citiesTable.id))
    .leftJoin(districtsTable, eq(productsTable.districtId, districtsTable.id))
    .innerJoin(productTypesTable, eq(productsTable.typeId, productTypesTable.id))
    .where(eq(productsTable.id, productId));

  if (!row) {
    await ctx.answerCbQuery("❌ Product not found.");
    return;
  }
  await ctx.answerCbQuery();

  const icon = STATUS_ICON[row.status] ?? "•";
  const header =
    `📦 <b>${row.typeEmoji ?? ""} ${row.typeName} ${row.size}</b>\n` +
    `${row.cityName} · ${row.districtName}\n` +
    `${formatEur(row.price)} · ${icon} ${row.status} · ${formatDate(row.createdAt)}`;
  await ctx.reply(header, { parse_mode: "HTML" });

  await sendUploadFiles(ctx, row);

  if (row.status === "available") {
    await ctx.reply(
      "Manage this upload:",
      inlineKeyboard([
        [
          {
            text: row.content ? "✏️ Edit text" : "📝 Add text",
            callback_data: `workers:add_text:${productId}`,
          },
          {
            text: "📸 Add Photo",
            callback_data: `workers:add_photo:${productId}`,
          },
        ],
      ]),
    );
  }
}

// Worker-facing preview of one of their own uploads. Reviewing an upload must
// NEVER delete it — tapping an item here only shows its content, and deletion
// is offered as an explicit, confirmed action below.
export async function showKladUploadDetail(
  ctx: Context & { session: BotSession },
  productId: number,
  userId: number
) {
  const worker = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.telegramId, userId))
    .then((r) => r[0]);
  const tag = await resolveWorkerTag(
    worker ?? { username: null, telegramId: userId }
  );

  const [row] = await db
    .select(UPLOAD_CONTENT_COLUMNS)
    .from(productsTable)
    .leftJoin(citiesTable, eq(productsTable.cityId, citiesTable.id))
    .leftJoin(districtsTable, eq(productsTable.districtId, districtsTable.id))
    .innerJoin(productTypesTable, eq(productsTable.typeId, productTypesTable.id))
    .where(eq(productsTable.id, productId));

  // Only the worker who uploaded it may preview/manage it here.
  if (!row || row.workerTag !== tag) {
    await ctx.answerCbQuery("❌ Upload not found.");
    return;
  }
  await ctx.answerCbQuery();

  const icon = STATUS_ICON[row.status] ?? "•";
  const header =
    `📦 <b>${row.typeEmoji ?? ""} ${row.typeName} ${row.size}</b>\n` +
    `${row.cityName} · ${row.districtName}\n` +
    `${formatEur(row.price)} · ${icon} ${row.status} · ${formatDate(row.createdAt)}`;
  await ctx.reply(header, { parse_mode: "HTML" });

  await sendUploadFiles(ctx, row);

  const controls: { text: string; callback_data: string }[][] = [];
  if (row.status === "available") {
    controls.push([
      {
        text: row.content ? "✏️ Edit text" : "📝 Add text",
        callback_data: `klad:add_text:${productId}`,
      },
      {
        text: "📸 Add Photo",
        callback_data: `klad:add_photo:${productId}`,
      },
    ]);
    controls.push([
      {
        text: "🗑 Delete this upload",
        callback_data: `klad:del_confirm:${productId}`,
      },
    ]);
  }
  controls.push([
    { text: "⬅ Back to My Uploads", callback_data: "klad:my_uploads" },
  ]);
  await ctx.reply("Manage this upload:", { ...inlineKeyboard(controls) });
}

// Mark a worker's own available upload as unavailable. Guards on ownership so a
// worker can only remove their own stock, and only when it's still available.
export async function deleteKladUpload(
  ctx: Context & { session: BotSession },
  productId: number,
  userId: number
) {
  const worker = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.telegramId, userId))
    .then((r) => r[0]);
  const tag = await resolveWorkerTag(
    worker ?? { username: null, telegramId: userId }
  );

  // Mark unavailable instead of deleting so the product record survives for
  // history, refunds, and analytics. The worker loses the available unit, but
  // the row stays in the database.
  const result = await db
    .update(productsTable)
    .set({ status: "unavailable" })
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.workerTag, tag),
        eq(productsTable.status, "available")
      )
    )
    .returning({ id: productsTable.id });

  await ctx.answerCbQuery(
    result.length > 0 ? "Upload removed." : "Nothing to remove."
  );
  await showKladMyUploads(ctx, userId);
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

  // Load saved routes for this worker
  const worker = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.telegramId, (ctx as any).from?.id))
    .then((r) => r[0])
    .catch(() => undefined);

  const recent: SavedRoute[] = worker?.recentRoutes
    ? (JSON.parse(worker.recentRoutes) as SavedRoute[])
    : [];
  const defaultRoute: SavedRoute | null = worker?.defaultRoute
    ? (JSON.parse(worker.defaultRoute) as SavedRoute)
    : null;

  const buttons: { text: string; callback_data: string }[][] = [];

  // Default route — pinned at the top with a star
  if (defaultRoute) {
    const cb = `klad:quick:${defaultRoute.cityId}:${defaultRoute.districtId}:${defaultRoute.typeId}:${encodeURIComponent(defaultRoute.size)}`;
    buttons.push([{ text: `⭐ ${defaultRoute.label}`, callback_data: cb }]);
  }

  // Up to 3 recent routes (excluding the default if it matches one)
  const recentToShow = defaultRoute
    ? recent
        .filter(
          (r) =>
            !(
              r.cityId === defaultRoute.cityId &&
              r.districtId === defaultRoute.districtId &&
              r.typeId === defaultRoute.typeId &&
              r.size === defaultRoute.size
            ),
        )
        .slice(0, 3)
    : recent.slice(0, 3);

  for (const route of recentToShow) {
    const cb = `klad:quick:${route.cityId}:${route.districtId}:${route.typeId}:${encodeURIComponent(route.size)}`;
    buttons.push([{ text: `📍 ${route.label}`, callback_data: cb }]);
  }

  buttons.push([{ text: "📤 New location", callback_data: "klad:upload" }]);
  buttons.push([{ text: "📋 My Uploads", callback_data: "klad:my_uploads" }]);
  buttons.push([{ text: "✖ Exit", callback_data: "klad:exit" }]);

  const hasQuick = defaultRoute || recentToShow.length > 0;
  const menuText =
    "👷 <b>Worker Menu</b>" +
    (hasQuick ? "\n\nQuick upload ↓" : "\n\nSelect an option:");
  const kb = inlineKeyboard(buttons);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(menuText, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(menuText, { parse_mode: "HTML", ...kb });
  }
}

export async function showKladCities(ctx: Context & { session: BotSession }) {
  const cities = await getCities();
  if (cities.length === 0) {
    await ctx.editMessageText("No locations available. Ask admin to add cities first.", {
      ...inlineKeyboard([[BACK_BTN("klad:menu")]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...cities.map((c) => [
      { text: c.name, callback_data: `klad:city:${c.id}` },
    ]),
    [BACK_BTN("klad:menu")],
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
  // Sizes come from two sources: catalog slots defined by an admin
  // ("empty products") and any existing real product stock. Union them so a
  // worker can upload even when there's no stock yet.
  const slotSizes = await db
    .select({ size: productSlotsTable.size })
    .from(productSlotsTable)
    .where(
      and(
        eq(productSlotsTable.cityId, cityId),
        eq(productSlotsTable.districtId, districtId),
        eq(productSlotsTable.typeId, typeId)
      )
    )
    .groupBy(productSlotsTable.size);

  const productSizes = await db
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

  const sizeSet = new Set<string>();
  for (const s of slotSizes) sizeSet.add(s.size);
  for (const s of productSizes) sizeSet.add(s.size);
  const sizes = [...sizeSet].sort().map((size) => ({ size }));

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
    // Back goes to the types menu, not klad:type (which re-opens sizes).
    [BACK_BTN(`klad:dist:${cityId}:${districtId}`)],
  ]);
  await ctx.editMessageText("📐 Select size:", { ...kb });
}

export async function showKladMyUploads(
  ctx: Context & { session: BotSession },
  userId: number,
  page = 0,
) {
  const user = await db
    .select()
    .from(workersTable)
    .where(eq(workersTable.telegramId, userId))
    .then((r) => r[0]);
  const tag = await resolveWorkerTag(
    user ?? { username: null, telegramId: userId },
  );

  const whereClause = and(
    eq(productsTable.workerTag, tag),
    eq(productsTable.status, "available"),
  );

  const [total] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(whereClause);
  const totalCount = total?.count ?? 0;

  if (totalCount === 0) {
    await ctx.editMessageText("You have no available uploads.", {
      ...inlineKeyboard([[BACK_BTN("klad:menu")]]),
    });
    return;
  }

  const totalPages = Math.ceil(totalCount / UPLOADS_PAGE_SIZE);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  const products = await db
    .select({
      id: productsTable.id,
      size: productsTable.size,
      price: productsTable.price,
      createdAt: productsTable.createdAt,
      typeName: productTypesTable.name,
      typeEmoji: productTypesTable.emoji,
      cityName: citiesTable.name,
      districtName: districtsTable.name,
    })
    .from(productsTable)
    .innerJoin(productTypesTable, eq(productsTable.typeId, productTypesTable.id))
    .leftJoin(citiesTable, eq(productsTable.cityId, citiesTable.id))
    .leftJoin(districtsTable, eq(productsTable.districtId, districtsTable.id))
    .where(whereClause)
    .orderBy(desc(productsTable.createdAt))
    .limit(UPLOADS_PAGE_SIZE)
    .offset(safePage * UPLOADS_PAGE_SIZE);

  const rows: { text: string; callback_data: string }[][] = [
    ...products.map((p) => {
      const location = [p.cityName, p.districtName].filter(Boolean).join(", ");
      return [
        {
          text: `${p.typeEmoji} ${p.typeName} ${p.size} — ${formatEur(p.price)}${location ? ` · ${location}` : ""}`,
          callback_data: `klad:view_upload:${p.id}`,
        },
      ];
    }),
  ];

  const nav: { text: string; callback_data: string }[] = [];
  if (safePage > 0)
    nav.push({ text: "⬅ Prev", callback_data: `klad:my_uploads:${safePage - 1}` });
  if (safePage < totalPages - 1)
    nav.push({ text: "Next ➡", callback_data: `klad:my_uploads:${safePage + 1}` });
  if (nav.length > 0) rows.push(nav);
  rows.push([BACK_BTN("klad:menu")]);

  const header =
    totalPages > 1
      ? `📋 <b>My Uploads</b> — Page ${safePage + 1}/${totalPages} (${totalCount} total)`
      : `📋 <b>My Uploads</b> (${totalCount} total)`;

  await ctx.editMessageText(`${header}\n\nTap an item to view:`, {
    parse_mode: "HTML",
    ...inlineKeyboard(rows),
  });
}
