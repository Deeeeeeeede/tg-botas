import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  citiesTable,
  districtsTable,
  productsTable,
  productSlotsTable,
} from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { getCities, getDistricts } from "../db";
import {
  GEOGRAPHY_KB,
  inlineKeyboard,
  BACK_BTN,
  CANCEL_BTN,
} from "../keyboards";

export async function showGeographyMenu(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  const text = "🌍 <b>Geography Menu</b>\n\nManage cities and districts.";
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...GEOGRAPHY_KB });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...GEOGRAPHY_KB });
  }
}

export async function showCitiesList(ctx: Context & { session: BotSession }) {
  const cities = await getCities();
  if (cities.length === 0) {
    await ctx.editMessageText("No cities yet. Add one first.", {
      ...inlineKeyboard([[BACK_BTN("admin:geography")]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...cities.map((c) => [
      { text: c.name, callback_data: `geo:city_detail:${c.id}` },
    ]),
    [BACK_BTN("admin:geography")],
  ]);
  await ctx.editMessageText("🏙 <b>Cities</b>\nTap a city to rename or delete.", {
    parse_mode: "HTML",
    ...kb,
  });
}

export async function showCityDetail(
  ctx: Context & { session: BotSession },
  cityId: number
) {
  ctx.session.step = undefined;
  const city = await db
    .select()
    .from(citiesTable)
    .where(eq(citiesTable.id, cityId))
    .then((r) => r[0]);
  if (!city) { await ctx.editMessageText("City not found."); return; }
  const kb = inlineKeyboard([
    [{ text: "✏️ Rename", callback_data: `geo:rename_city:${cityId}` }],
    [{ text: "🗑 Delete", callback_data: `geo:del_city:${cityId}` }],
    [BACK_BTN("geo:cities")],
  ]);
  await ctx.editMessageText(`🏙 <b>${city.name}</b>`, {
    parse_mode: "HTML",
    ...kb,
  });
}

export async function deleteCity(
  ctx: Context & { session: BotSession },
  cityId: number
) {
  const city = await db
    .select()
    .from(citiesTable)
    .where(eq(citiesTable.id, cityId))
    .then((r) => r[0]);
  if (!city) {
    await ctx.answerCbQuery("City not found.", { show_alert: true });
    return;
  }

  const [dcount] = await db
    .select({ count: count() })
    .from(districtsTable)
    .where(eq(districtsTable.cityId, cityId));
  const [pcount] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(eq(productsTable.cityId, cityId));

  const districts = dcount?.count ?? 0;
  const products = pcount?.count ?? 0;

  const kb = inlineKeyboard([
    [
      { text: "✅ Yes, delete everything", callback_data: `geo:confirm_del_city:${cityId}` },
    ],
    [
      { text: "❌ Cancel", callback_data: `geo:city_detail:${cityId}` },
    ],
  ]);

  await ctx.editMessageText(
    `🚨 <b>Delete City</b>\n\n` +
    `City: <b>${city.name}</b>\n` +
    `Districts to delete: <b>${districts}</b>\n` +
    `Products to delete: <b>${products}</b>\n\n` +
    `Are you sure? This action cannot be undone.`,
    { parse_mode: "HTML", ...kb }
  );
}

export async function confirmDeleteCity(
  ctx: Context & { session: BotSession },
  cityId: number
) {
  const city = await db
    .select()
    .from(citiesTable)
    .where(eq(citiesTable.id, cityId))
    .then((r) => r[0]);
  if (!city) {
    await ctx.answerCbQuery("City not found.", { show_alert: true });
    return;
  }

  // Delete dependents first (products + catalog slots), then districts, then the
  // city itself. Slots and districts both have foreign keys to the city, so
  // skipping the slot cleanup would crash the delete on a constraint violation.
  await db.delete(productsTable).where(eq(productsTable.cityId, cityId));
  await db.delete(productSlotsTable).where(eq(productSlotsTable.cityId, cityId));
  await db.delete(districtsTable).where(eq(districtsTable.cityId, cityId));
  await db.delete(citiesTable).where(eq(citiesTable.id, cityId));

  await ctx.answerCbQuery(`✅ City "${city.name}" and all districts/products deleted.`, { show_alert: true });
  await showCitiesList(ctx);
}

export async function showDistrictsCitySelect(ctx: Context & { session: BotSession }) {
  const cities = await getCities();
  if (cities.length === 0) {
    await ctx.editMessageText("No cities yet. Add a city first.", {
      ...inlineKeyboard([[BACK_BTN("admin:geography")]]),
    });
    return;
  }
  const kb = inlineKeyboard([
    ...cities.map((c) => [
      { text: c.name, callback_data: `geo:dist_city:${c.id}` },
    ]),
    [BACK_BTN("admin:geography")],
  ]);
  await ctx.editMessageText("📍 Select a city to manage its districts:", {
    ...kb,
  });
}

export async function showDistrictsList(
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
      { text: d.name, callback_data: `geo:dist_detail:${d.id}:${cityId}` },
    ]),
    [{ text: "➕ Add District", callback_data: `geo:add_dist:${cityId}` }],
    [BACK_BTN("geo:districts_select")],
  ]);
  await ctx.editMessageText(
    `📍 Districts in <b>${city?.name ?? "?"}</b>:`,
    { parse_mode: "HTML", ...kb }
  );
}

export async function showDistrictDetail(
  ctx: Context & { session: BotSession },
  districtId: number,
  cityId: number
) {
  const district = await db
    .select()
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .then((r) => r[0]);
  if (!district) { await ctx.editMessageText("District not found."); return; }
  const kb = inlineKeyboard([
    [{ text: "✏️ Rename", callback_data: `geo:rename_dist:${districtId}:${cityId}` }],
    [{ text: "🗑 Delete", callback_data: `geo:del_dist:${districtId}:${cityId}` }],
    [BACK_BTN(`geo:dist_city:${cityId}`)],
  ]);
  await ctx.editMessageText(`📍 <b>${district.name}</b>`, {
    parse_mode: "HTML",
    ...kb,
  });
}

export async function deleteDistrict(
  ctx: Context & { session: BotSession },
  districtId: number,
  cityId: number
) {
  const district = await db
    .select()
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .then((r) => r[0]);
  if (!district) {
    await ctx.answerCbQuery("District not found.", { show_alert: true });
    return;
  }

  const [pcount] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(eq(productsTable.districtId, districtId));
  const products = pcount?.count ?? 0;

  const kb = inlineKeyboard([
    [
      { text: "✅ Yes, delete everything", callback_data: `geo:confirm_del_dist:${districtId}:${cityId}` },
    ],
    [
      { text: "❌ Cancel", callback_data: `geo:dist_detail:${districtId}:${cityId}` },
    ],
  ]);

  await ctx.editMessageText(
    `🚨 <b>Delete District</b>\n\n` +
    `District: <b>${district.name}</b>\n` +
    `Products to delete: <b>${products}</b>\n\n` +
    `Are you sure? This action cannot be undone.`,
    { parse_mode: "HTML", ...kb }
  );
}

export async function confirmDeleteDistrict(
  ctx: Context & { session: BotSession },
  districtId: number,
  cityId: number
) {
  const district = await db
    .select()
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .then((r) => r[0]);
  if (!district) {
    await ctx.answerCbQuery("District not found.", { show_alert: true });
    return;
  }

  // Remove products + catalog slots in this district before the district row,
  // otherwise the slot foreign key would block the delete.
  await db.delete(productsTable).where(eq(productsTable.districtId, districtId));
  await db
    .delete(productSlotsTable)
    .where(eq(productSlotsTable.districtId, districtId));
  await db.delete(districtsTable).where(eq(districtsTable.id, districtId));

  await ctx.answerCbQuery(`✅ District "${district.name}" and all products deleted.`, { show_alert: true });
  await showDistrictsList(ctx, cityId);
}
