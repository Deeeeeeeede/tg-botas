import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  productSlotsTable,
  productTypesTable,
  citiesTable,
  districtsTable,
} from "@workspace/db";
import { eq, inArray, count, asc, sql } from "drizzle-orm";
import { getCities, getProductTypes } from "../db";
import { inlineKeyboard, BACK_BTN } from "../keyboards";
import { formatEur } from "../utils";

type SlotSize = { size: string; price: number };

export function parseSlotSizes(encoded: string): SlotSize[] {
  const sizes: SlotSize[] = [];
  for (const pair of encoded.split("|")) {
    const [size, priceStr] = pair.split("@");
    if (size && priceStr) sizes.push({ size, price: parseFloat(priceStr) });
  }
  return sizes;
}

export function encodeSlotSizes(sizes: SlotSize[]): string {
  return sizes.map((s) => `${s.size}@${s.price}`).join("|");
}

function getEprod(ctx: Context & { session: BotSession }) {
  const data = (ctx.session.data ?? {}) as Record<string, any>;
  return {
    typeId: data["eprodTypeId"] as number | undefined,
    sizes: (data["eprodSizes"] as SlotSize[] | undefined) ?? [],
    cityIds: (data["eprodCityIds"] as number[] | undefined) ?? [],
    districtIds: (data["eprodDistrictIds"] as number[] | undefined) ?? [],
  };
}

function setEprod(
  ctx: Context & { session: BotSession },
  patch: Partial<{
    typeId: number;
    sizes: SlotSize[];
    cityIds: number[];
    districtIds: number[];
  }>,
) {
  const data = (ctx.session.data ?? {}) as Record<string, any>;
  ctx.session.data = {
    ...data,
    ...(patch.typeId !== undefined ? { eprodTypeId: patch.typeId } : {}),
    ...(patch.sizes !== undefined ? { eprodSizes: patch.sizes } : {}),
    ...(patch.cityIds !== undefined ? { eprodCityIds: patch.cityIds } : {}),
    ...(patch.districtIds !== undefined
      ? { eprodDistrictIds: patch.districtIds }
      : {}),
  };
}

// When the admin picks an existing product type for an empty product, check if
// that product already has sizes/prices stored anywhere in the catalog. If so,
// offer to reuse them instead of retyping everything.
export async function showExistingOrNewSizes(
  ctx: Context & { session: BotSession },
  typeId: number,
) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  const rows = await db
    .select({ size: productSlotsTable.size, price: productSlotsTable.price })
    .from(productSlotsTable)
    .where(eq(productSlotsTable.typeId, typeId))
    .orderBy(asc(productSlotsTable.size))
    .limit(40);

  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!seen.has(r.size)) seen.set(r.size, Number(r.price));
  }
  const existing = [...seen.entries()].map(([size, price]) => ({ size, price }));

  if (existing.length > 0) {
    const sizeText = existing
      .map((s) => `  ${s.size} — ${formatEur(s.price)}`)
      .join("\n");
    const kb = inlineKeyboard([
      [{
        text: "✅ Reuse these sizes",
        callback_data: `eprod:reuse_sizes:${typeId}:${encodeSlotSizes(existing)}`,
      }],
      [{
        text: "✏️ Enter new sizes",
        callback_data: `eprod:type_new_sizes:${typeId}`,
      }],
      [BACK_BTN("prod:empty")],
    ]);
    await ctx.editMessageText(
      `📐 <b>Existing sizes for this product</b>\n\n${sizeText}\n\n` +
      `Reuse these sizes or enter new ones?`,
      { parse_mode: "HTML", ...kb },
    );
    return;
  }

  // No existing sizes for this type — go straight to manual entry.
  ctx.session.data = { eprodTypeId: typeId };
  await promptEmptyProductSizes(ctx, true);
}

// Step 1 — pick (or create) the product, e.g. ❄️ Snaiges.
export async function showEmptyProductStart(
  ctx: Context & { session: BotSession },
) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  const types = await getProductTypes();
  const kb = inlineKeyboard([
    ...types.map((t) => [
      {
        text: `${t.emoji} ${t.name}`,
        callback_data: `eprod:type:${t.id}`,
      },
    ]),
    [{ text: "➕ New Product", callback_data: "eprod:new_type" }],
    [BACK_BTN("admin:products")],
  ]);
  await ctx.editMessageText(
    "🆕 <b>Add Empty Product</b>\n\n" +
      "Create a product (name + sizes + prices) without uploading any stock. " +
      "Workers fill it later with /klad.\n\n" +
      "Select an existing product or create a new one:",
    { parse_mode: "HTML", ...kb },
  );
}

// Step 2 — after the product is chosen, ask for the sizes & prices.
export async function promptEmptyProductSizes(
  ctx: Context & { session: BotSession },
  edit: boolean,
) {
  ctx.session.step = "eprod:sizes";
  const text =
    "📐 <b>Enter sizes and prices</b>\n\n" +
    "Send one per line as <code>size price</code>. Example:\n\n" +
    "<code>1g 10\n2g 18\n5g 40</code>";
  const kb = inlineKeyboard([[BACK_BTN("prod:empty")]]);
  if (edit && ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

// Parse the free-text sizes/prices message. Duplicate sizes collapse to the
// last value provided so a single insert never produces two rows that target
// the same unique slot key (which would break the upsert).
export function parseSizesInput(input: string): SlotSize[] {
  const byKey = new Map<string, SlotSize>();
  for (const rawLine of input.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)[\s:=]+(\d+(?:[.,]\d+)?)$/);
    if (!m) continue;
    const size = m[1]!.trim();
    const price = parseFloat(m[2]!.replace(",", "."));
    if (!size || isNaN(price) || price <= 0) continue;
    byKey.set(size.toLowerCase(), { size, price });
  }
  return [...byKey.values()];
}

// Step 3 — multi-select cities.
export async function showEmptyProductCities(
  ctx: Context & { session: BotSession },
) {
  const { cityIds } = getEprod(ctx);
  const cities = await getCities();
  if (cities.length === 0) {
    await ctx.reply("No cities yet. Add a city first.", {
      ...inlineKeyboard([[BACK_BTN("admin:products")]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...cities.map((c) => [
      {
        text: `${cityIds.includes(c.id) ? "✅" : "⬜"} ${c.name}`,
        callback_data: `eprod:city_toggle:${c.id}`,
      },
    ]),
    [
      {
        text: `▶️ Continue (${cityIds.length} selected)`,
        callback_data: "eprod:cities_done",
      },
    ],
    [BACK_BTN("prod:empty")],
  ]);
  const body = "🏙 <b>Select cities</b>\n\nTap to toggle, then Continue:";
  if (ctx.callbackQuery) {
    await ctx.editMessageText(body, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(body, { parse_mode: "HTML", ...kb });
  }
}

export async function toggleEmptyProductCity(
  ctx: Context & { session: BotSession },
  cityId: number,
) {
  const { cityIds, districtIds } = getEprod(ctx);
  const next = cityIds.includes(cityId)
    ? cityIds.filter((id) => id !== cityId)
    : [...cityIds, cityId];

  // Prune any previously-selected districts that no longer belong to a
  // selected city, so deselecting a city never leaves stale districts behind.
  let prunedDistricts = districtIds;
  if (districtIds.length > 0) {
    if (next.length === 0) {
      prunedDistricts = [];
    } else {
      const valid = await db
        .select({ id: districtsTable.id })
        .from(districtsTable)
        .where(inArray(districtsTable.cityId, next));
      const validIds = new Set(valid.map((d) => d.id));
      prunedDistricts = districtIds.filter((id) => validIds.has(id));
    }
  }

  setEprod(ctx, { cityIds: next, districtIds: prunedDistricts });
  await showEmptyProductCities(ctx);
}

// Step 4 — multi-select districts within the chosen cities.
export async function showEmptyProductDistricts(
  ctx: Context & { session: BotSession },
) {
  const { cityIds, districtIds } = getEprod(ctx);
  if (cityIds.length === 0) {
    await ctx.answerCbQuery("Select at least one city first.", {
      show_alert: true,
    });
    return;
  }
  const districts = await db
    .select({
      id: districtsTable.id,
      name: districtsTable.name,
      cityName: citiesTable.name,
    })
    .from(districtsTable)
    .innerJoin(citiesTable, eq(districtsTable.cityId, citiesTable.id))
    .where(inArray(districtsTable.cityId, cityIds))
    .orderBy(asc(citiesTable.name), asc(districtsTable.name));

  if (districts.length === 0) {
    await ctx.editMessageText(
      "No districts in the selected cities. Add districts first.",
      { ...inlineKeyboard([[BACK_BTN("prod:empty")]]) },
    );
    return;
  }

  const kb = inlineKeyboard([
    ...districts.map((d) => [
      {
        text: `${districtIds.includes(d.id) ? "✅" : "⬜"} ${d.cityName} · ${d.name}`,
        callback_data: `eprod:dist_toggle:${d.id}`,
      },
    ]),
    [
      {
        text: "☑️ Select all",
        callback_data: "eprod:dist_all",
      },
    ],
    [
      {
        text: `▶️ Continue (${districtIds.length} selected)`,
        callback_data: "eprod:dists_done",
      },
    ],
    [{ text: "« Back", callback_data: "eprod:cities_back" }],
  ]);
  await ctx.editMessageText(
    "📍 <b>Select districts</b>\n\nTap to toggle, then Continue:",
    { parse_mode: "HTML", ...kb },
  );
}

export async function toggleEmptyProductDistrict(
  ctx: Context & { session: BotSession },
  districtId: number,
) {
  const { districtIds } = getEprod(ctx);
  const next = districtIds.includes(districtId)
    ? districtIds.filter((id) => id !== districtId)
    : [...districtIds, districtId];
  setEprod(ctx, { districtIds: next });
  await showEmptyProductDistricts(ctx);
}

export async function selectAllEmptyProductDistricts(
  ctx: Context & { session: BotSession },
) {
  const { cityIds } = getEprod(ctx);
  const districts = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(inArray(districtsTable.cityId, cityIds));
  setEprod(ctx, { districtIds: districts.map((d) => d.id) });
  await showEmptyProductDistricts(ctx);
}

// Step 5 — confirmation summary.
export async function showEmptyProductConfirm(
  ctx: Context & { session: BotSession },
) {
  const { typeId, sizes, districtIds } = getEprod(ctx);
  if (districtIds.length === 0) {
    await ctx.answerCbQuery("Select at least one district first.", {
      show_alert: true,
    });
    return;
  }
  const type = typeId
    ? await db
        .select()
        .from(productTypesTable)
        .where(eq(productTypesTable.id, typeId))
        .then((r) => r[0])
    : undefined;

  const sizeLines = sizes
    .map((s) => `  • ${s.size} — ${formatEur(s.price.toFixed(2))}`)
    .join("\n");
  const total = sizes.length * districtIds.length;

  const kb = inlineKeyboard([
    [{ text: "✅ Create", callback_data: "eprod:confirm" }],
    [{ text: "« Back", callback_data: "eprod:dists_back" }],
    [BACK_BTN("admin:products")],
  ]);
  await ctx.editMessageText(
    `🆕 <b>Confirm Empty Product</b>\n\n` +
      `Product: ${type ? `${type.emoji} ${type.name}` : "?"}\n\n` +
      `Sizes:\n${sizeLines}\n\n` +
      `Districts selected: <b>${districtIds.length}</b>\n` +
      `This will create <b>${total}</b> catalog slot(s).`,
    { parse_mode: "HTML", ...kb },
  );
}

// "Add to more cities" after creating slots for the same product.
export async function addMoreCities(
  ctx: Context & { session: BotSession },
  typeId: number,
  encodedSizes: string,
) {
  const sizes = parseSlotSizes(encodedSizes);
  ctx.session.data = { eprodTypeId: typeId, eprodSizes: sizes };
  await showEmptyProductCities(ctx);
}

export async function createEmptyProductSlots(
  ctx: Context & { session: BotSession },
) {
  const { typeId, sizes, districtIds } = getEprod(ctx);
  if (!typeId || sizes.length === 0 || districtIds.length === 0) {
    await ctx.answerCbQuery("Missing data, start again.", { show_alert: true });
    return;
  }
  const districts = await db
    .select({ id: districtsTable.id, cityId: districtsTable.cityId })
    .from(districtsTable)
    .where(inArray(districtsTable.id, districtIds));

  const rows = [];
  for (const d of districts) {
    for (const s of sizes) {
      rows.push({
        cityId: d.cityId,
        districtId: d.id,
        typeId,
        size: s.size,
        price: s.price.toFixed(2),
      });
    }
  }

  let created = 0;
  if (rows.length > 0) {
    const inserted = await db
      .insert(productSlotsTable)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          productSlotsTable.cityId,
          productSlotsTable.districtId,
          productSlotsTable.typeId,
          productSlotsTable.size,
        ],
        set: { price: sql`excluded.price` },
      })
      .returning({ id: productSlotsTable.id });
    created = inserted.length;
  }

  ctx.session.step = undefined;
  ctx.session.data = undefined;
  const kb = inlineKeyboard([
    [{ text: "🆕 Add to more cities", callback_data: `eprod:add_more:${typeId}:${encodeSlotSizes(sizes)}` }],
    [{ text: "🆕 Add Another product", callback_data: "prod:empty" }],
    [BACK_BTN("admin:products")],
  ]);
  await ctx.editMessageText(
    `✅ Created/updated <b>${created}</b> catalog slot(s).\n\n` +
      `Workers can now upload stock for these via /klad.`,
    { parse_mode: "HTML", ...kb },
  );
}

// ---- Catalog management (view/delete empty product slots) ----

export async function showCatalog(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  const rows = await db
    .select({
      typeId: productSlotsTable.typeId,
      typeName: productTypesTable.name,
      typeEmoji: productTypesTable.emoji,
      count: count(),
    })
    .from(productSlotsTable)
    .innerJoin(
      productTypesTable,
      eq(productSlotsTable.typeId, productTypesTable.id),
    )
    .groupBy(
      productSlotsTable.typeId,
      productTypesTable.name,
      productTypesTable.emoji,
    )
    .orderBy(asc(productTypesTable.name));

  if (rows.length === 0) {
    await ctx.editMessageText("No empty products defined yet.", {
      ...inlineKeyboard([
        [{ text: "🆕 Add Empty Product", callback_data: "prod:empty" }],
        [BACK_BTN("admin:products")],
      ]),
    });
    return;
  }

  const kb = inlineKeyboard([
    ...rows.map((r) => [
      {
        text: `${r.typeEmoji} ${r.typeName} (${r.count})`,
        callback_data: `eprod:cat_type:${r.typeId}`,
      },
    ]),
    [BACK_BTN("admin:products")],
  ]);
  await ctx.editMessageText(
    "📋 <b>Empty Products (Catalog)</b>\n\nSelect a product to view its slots:",
    { parse_mode: "HTML", ...kb },
  );
}

export async function showCatalogType(
  ctx: Context & { session: BotSession },
  typeId: number,
) {
  const slots = await db
    .select({
      id: productSlotsTable.id,
      size: productSlotsTable.size,
      price: productSlotsTable.price,
      cityName: citiesTable.name,
      distName: districtsTable.name,
    })
    .from(productSlotsTable)
    .innerJoin(citiesTable, eq(productSlotsTable.cityId, citiesTable.id))
    .innerJoin(
      districtsTable,
      eq(productSlotsTable.districtId, districtsTable.id),
    )
    .where(eq(productSlotsTable.typeId, typeId))
    .orderBy(asc(citiesTable.name), asc(districtsTable.name), asc(productSlotsTable.size))
    .limit(40);

  if (slots.length === 0) {
    return showCatalog(ctx);
  }

  const kb = inlineKeyboard([
    ...slots.map((s) => [
      {
        text: `🗑 ${s.cityName} · ${s.distName} · ${s.size} — ${formatEur(s.price)}`,
        callback_data: `eprod:cat_del:${s.id}:${typeId}`,
      },
    ]),
    [
      {
        text: "🗑 Remove ALL catalog slots",
        callback_data: `eprod:cat_delall:${typeId}`,
      },
    ],
    [BACK_BTN("eprod:catalog")],
  ]);
  await ctx.editMessageText(
    `📋 <b>Catalog Slots</b>\n\n` +
    `Tap to remove a slot definition. <b>Uploaded products are NOT affected.</b>\n\n` +
    `To delete actual uploaded stock, use the <b>Manage Products</b> menu instead.`,
    { parse_mode: "HTML", ...kb },
  );
}

export async function deleteCatalogSlot(
  ctx: Context & { session: BotSession },
  slotId: number,
  typeId: number,
) {
  await db.delete(productSlotsTable).where(eq(productSlotsTable.id, slotId));
  await ctx.answerCbQuery("Slot removed. Uploaded products remain.");
  await showCatalogType(ctx, typeId);
}

export async function deleteCatalogType(
  ctx: Context & { session: BotSession },
  typeId: number,
) {
  const res = await db
    .delete(productSlotsTable)
    .where(eq(productSlotsTable.typeId, typeId))
    .returning({ id: productSlotsTable.id });
  await ctx.answerCbQuery(`Removed ${res.length} slot(s). Uploaded products remain.`);
  await showCatalog(ctx);
}
