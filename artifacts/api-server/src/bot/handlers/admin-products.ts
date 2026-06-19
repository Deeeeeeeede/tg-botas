import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  productsTable,
  productTypesTable,
  productSlotsTable,
  citiesTable,
  districtsTable,
} from "@workspace/db";
import { eq, and, count, asc, desc } from "drizzle-orm";
import { getCities, getDistricts, getProductTypes } from "../db";
import {
  PRODUCTS_MENU_KB,
  inlineKeyboard,
  BACK_BTN,
} from "../keyboards";
import { formatEur } from "../utils";

export async function showProductsMenu(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  const text = "📦 <b>Products Menu</b>";
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...PRODUCTS_MENU_KB });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...PRODUCTS_MENU_KB });
  }
}

export async function showProductTypes(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  const types = await getProductTypes();
  const kb = inlineKeyboard([
    ...types.map((t) => [
      { text: `${t.emoji} ${t.name}`, callback_data: `prod:type_detail:${t.id}` },
    ]),
    [{ text: "➕ Add Type", callback_data: "prod:add_type" }],
    [BACK_BTN("admin:products")],
  ]);
  await ctx.editMessageText("🏷 <b>Product Types</b>", {
    parse_mode: "HTML",
    ...kb,
  });
}

export async function showTypeDetail(
  ctx: Context & { session: BotSession },
  typeId: number
) {
  const type = await db
    .select()
    .from(productTypesTable)
    .where(eq(productTypesTable.id, typeId))
    .then((r) => r[0]);
  if (!type) { await ctx.editMessageText("Type not found."); return; }
  const kb = inlineKeyboard([
    [{ text: "✏️ Rename", callback_data: `prod:rename_type:${typeId}` }],
    [{ text: "🗑 Delete", callback_data: `prod:del_type:${typeId}` }],
    [BACK_BTN("prod:types")],
  ]);
  await ctx.editMessageText(`${type.emoji} <b>${type.name}</b>`, {
    parse_mode: "HTML",
    ...kb,
  });
}

export async function deleteProductType(
  ctx: Context & { session: BotSession },
  typeId: number
) {
  // Any product (in ANY status — including sold history) and any catalog slot
  // holds a foreign key to this type, so deleting the type while those exist
  // would crash on a constraint violation. Refuse and tell the admin what to
  // clear first.
  const [pcount] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(eq(productsTable.typeId, typeId));
  if ((pcount?.count ?? 0) > 0) {
    await ctx.answerCbQuery(
      "Cannot delete: products (incl. sold history) still use this type.",
      { show_alert: true },
    );
    return;
  }
  const [scount] = await db
    .select({ count: count() })
    .from(productSlotsTable)
    .where(eq(productSlotsTable.typeId, typeId));
  if ((scount?.count ?? 0) > 0) {
    await ctx.answerCbQuery(
      "Cannot delete: catalog slots still use this type. Remove them first.",
      { show_alert: true },
    );
    return;
  }
  await db.delete(productTypesTable).where(eq(productTypesTable.id, typeId));
  await ctx.answerCbQuery("Type deleted.");
  await showProductTypes(ctx);
}

export async function showStock(ctx: Context & { session: BotSession }) {
  const rows = await db
    .select({
      typeName: productTypesTable.name,
      typeEmoji: productTypesTable.emoji,
      size: productsTable.size,
      count: count(),
    })
    .from(productsTable)
    .innerJoin(productTypesTable, eq(productsTable.typeId, productTypesTable.id))
    .where(eq(productsTable.status, "available"))
    .groupBy(productTypesTable.name, productTypesTable.emoji, productsTable.size)
    .orderBy(asc(productTypesTable.name), asc(productsTable.size));

  if (rows.length === 0) {
    await ctx.editMessageText("No products in stock.", {
      ...inlineKeyboard([[BACK_BTN("admin:products")]]),
    });
    return;
  }

  let text = "📦 <b>Bot Stock</b>\n\n";
  let currentType = "";
  for (const row of rows) {
    const typeLabel = `${row.typeEmoji} ${row.typeName}`;
    if (typeLabel !== currentType) {
      text += `\n<b>${typeLabel}</b>\n`;
      currentType = typeLabel;
    }
    text += `  • ${row.size}: ${row.count} available\n`;
  }

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      ...inlineKeyboard([[BACK_BTN("admin:products")]]),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "HTML",
      ...inlineKeyboard([[BACK_BTN("admin:products")]]),
    });
  }
}

export async function showManageProducts(
  ctx: Context & { session: BotSession }
) {
  const cities = await getCities();
  if (cities.length === 0) {
    await ctx.editMessageText("No cities yet.", {
      ...inlineKeyboard([[BACK_BTN("admin:products")]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...cities.map((c) => [
      { text: c.name, callback_data: `manage_prod:city:${c.id}` },
    ]),
    [BACK_BTN("admin:products")],
  ]);
  await ctx.editMessageText("🗂 <b>Manage Products</b> — Select city:", {
    parse_mode: "HTML",
    ...kb,
  });
}

export async function showManageProdDistricts(
  ctx: Context & { session: BotSession },
  cityId: number
) {
  const city = await db
    .select()
    .from(citiesTable)
    .where(eq(citiesTable.id, cityId))
    .then((r) => r[0]);
  const districts = await getDistricts(cityId);
  const kb = inlineKeyboard([
    ...districts.map((d) => [
      { text: d.name, callback_data: `manage_prod:dist:${cityId}:${d.id}` },
    ]),
    [BACK_BTN("prod:manage")],
  ]);
  await ctx.editMessageText(
    `🗂 <b>${city?.name ?? "?"}</b> — Select district:`,
    { parse_mode: "HTML", ...kb }
  );
}

export async function showManageProdTypes(
  ctx: Context & { session: BotSession },
  cityId: number,
  districtId: number
) {
  const types = await getProductTypes();
  const kb = inlineKeyboard([
    ...types.map((t) => [
      {
        text: `${t.emoji} ${t.name}`,
        callback_data: `manage_prod:type:${cityId}:${districtId}:${t.id}`,
      },
    ]),
    [BACK_BTN(`manage_prod:city:${cityId}`)],
  ]);
  await ctx.editMessageText("🗂 Select product type:", { ...kb });
}

export async function showProductList(
  ctx: Context & { session: BotSession },
  cityId: number,
  districtId: number,
  typeId: number,
  page = 0
) {
  const PAGE_SIZE = 8;
  const products = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.cityId, cityId),
        eq(productsTable.districtId, districtId),
        eq(productsTable.typeId, typeId),
        eq(productsTable.status, "available")
      )
    )
    .orderBy(asc(productsTable.size), asc(productsTable.price))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  const [totalRow] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.cityId, cityId),
        eq(productsTable.districtId, districtId),
        eq(productsTable.typeId, typeId),
        eq(productsTable.status, "available")
      )
    );
  const total = totalRow?.count ?? 0;

  if (products.length === 0 && page === 0) {
    await ctx.editMessageText("No products in this category.", {
      ...inlineKeyboard([
        [
          {
            text: "➕ Add Products",
            callback_data: `prod:add:${cityId}:${districtId}:${typeId}`,
          },
        ],
        [BACK_BTN(`manage_prod:dist:${cityId}:${districtId}`)],
      ]),
    });
    return;
  }

  const productButtons = products.map((p) => [
    {
      text: `${p.size} — ${formatEur(p.price)} ${p.workerTag ? `[@${p.workerTag}]` : ""}`,
      callback_data: `manage_prod:del:${p.id}:${cityId}:${districtId}:${typeId}:${page}`,
    },
  ]);

  const navRow: { text: string; callback_data: string }[] = [];
  if (page > 0) navRow.push({ text: "« Prev", callback_data: `manage_prod:type:${cityId}:${districtId}:${typeId}:${page - 1}` });
  if ((page + 1) * PAGE_SIZE < total) navRow.push({ text: "Next »", callback_data: `manage_prod:type:${cityId}:${districtId}:${typeId}:${page + 1}` });

  const kb = inlineKeyboard([
    ...productButtons,
    ...(navRow.length ? [navRow] : []),
    [
      {
        text: "➕ Add More",
        callback_data: `prod:add:${cityId}:${districtId}:${typeId}`,
      },
      {
        text: "🗑 Delete All",
        callback_data: `manage_prod:delall:${cityId}:${districtId}:${typeId}`,
      },
    ],
    [BACK_BTN(`manage_prod:dist:${cityId}:${districtId}`)],
  ]);

  await ctx.editMessageText(
    `🗂 Products (${total} total) — Tap to delete:`,
    { ...kb }
  );
}

export async function deleteAllProducts(
  ctx: Context & { session: BotSession },
  cityId: number,
  districtId: number,
  typeId: number
) {
  // Mark every still-available unit as unavailable rather than deleting it.
  // Sold units are left untouched so purchase history and refunds stay intact.
  const result = await db
    .update(productsTable)
    .set({ status: "unavailable" })
    .where(
      and(
        eq(productsTable.cityId, cityId),
        eq(productsTable.districtId, districtId),
        eq(productsTable.typeId, typeId),
        eq(productsTable.status, "available")
      )
    )
    .returning({ id: productsTable.id });
  await ctx.answerCbQuery(`Marked ${result.length} products unavailable.`);
  await showManageProducts(ctx);
}

export async function showReassignSourceTypes(
  ctx: Context & { session: BotSession }
) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  const types = await getProductTypes();
  if (types.length < 2) {
    await ctx.editMessageText(
      "You need at least 2 product types to reassign.",
      { ...inlineKeyboard([[BACK_BTN("admin:products")]]) }
    );
    return;
  }
  const rows = [];
  for (const t of types) {
    const [c] = await db
      .select({ count: count() })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.typeId, t.id),
          eq(productsTable.status, "available")
        )
      );
    rows.push([
      {
        text: `${t.emoji} ${t.name} (${c?.count ?? 0})`,
        callback_data: `prod:reassign_from:${t.id}`,
      },
    ]);
  }
  await ctx.editMessageText(
    "🔀 <b>Reassign Product Type</b>\n\nSelect the type to move products <b>from</b>:",
    {
      parse_mode: "HTML",
      ...inlineKeyboard([...rows, [BACK_BTN("admin:products")]]),
    }
  );
}

export async function showReassignDestTypes(
  ctx: Context & { session: BotSession },
  fromTypeId: number
) {
  const types = (await getProductTypes()).filter((t) => t.id !== fromTypeId);
  const from = await db
    .select()
    .from(productTypesTable)
    .where(eq(productTypesTable.id, fromTypeId))
    .then((r) => r[0]);
  const rows = types.map((t) => [
    {
      text: `${t.emoji} ${t.name}`,
      callback_data: `prod:reassign_to:${fromTypeId}:${t.id}`,
    },
  ]);
  await ctx.editMessageText(
    `🔀 <b>Reassign from ${from?.emoji ?? ""} ${from?.name ?? "?"}</b>\n\nSelect the type to move products <b>to</b>:`,
    {
      parse_mode: "HTML",
      ...inlineKeyboard([...rows, [BACK_BTN("prod:reassign")]]),
    }
  );
}

export async function doReassignType(
  ctx: Context & { session: BotSession },
  fromTypeId: number,
  toTypeId: number
) {
  const result = await db
    .update(productsTable)
    .set({ typeId: toTypeId })
    .where(
      and(
        eq(productsTable.typeId, fromTypeId),
        eq(productsTable.status, "available")
      )
    )
    .returning({ id: productsTable.id });
  await ctx.answerCbQuery(`Reassigned ${result.length} products.`, {
    show_alert: true,
  });
  await showProductsMenu(ctx);
}

export async function showBulkPriceTypes(
  ctx: Context & { session: BotSession }
) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  const types = await getProductTypes();
  if (types.length === 0) {
    await ctx.editMessageText("No product types available.", {
      ...inlineKeyboard([[BACK_BTN("admin:products")]]),
    });
    return;
  }
  const rows = [];
  for (const t of types) {
    const [c] = await db
      .select({ count: count() })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.typeId, t.id),
          eq(productsTable.status, "available")
        )
      );
    rows.push([
      {
        text: `${t.emoji} ${t.name} (${c?.count ?? 0})`,
        callback_data: `prod:bulk_price_type:${t.id}`,
      },
    ]);
  }
  await ctx.editMessageText(
    "💰 <b>Bulk Edit Prices</b>\n\nSelect the product type whose prices you want to change:",
    {
      parse_mode: "HTML",
      ...inlineKeyboard([...rows, [BACK_BTN("admin:products")]]),
    }
  );
}

export async function applyBulkPrice(
  ctx: Context & { session: BotSession },
  typeId: number,
  newPrice: number
) {
  const result = await db
    .update(productsTable)
    .set({ price: newPrice.toFixed(2) })
    .where(
      and(
        eq(productsTable.typeId, typeId),
        eq(productsTable.status, "available")
      )
    )
    .returning({ id: productsTable.id });
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  await ctx.reply(
    `✅ Updated price to ${formatEur(newPrice.toFixed(2))} for ${result.length} product(s).`
  );
  await showProductsMenu(ctx);
}
