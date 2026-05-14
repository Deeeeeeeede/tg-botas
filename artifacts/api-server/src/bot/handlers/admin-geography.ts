import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  citiesTable,
  districtsTable,
  productsTable,
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
  const [pcount] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(eq(productsTable.cityId, cityId));
  if ((pcount?.count ?? 0) > 0) {
    await ctx.answerCbQuery(
      "Cannot delete: city still has products. Remove products first.",
      { show_alert: true }
    );
    return;
  }
  await db.delete(districtsTable).where(eq(districtsTable.cityId, cityId));
  await db.delete(citiesTable).where(eq(citiesTable.id, cityId));
  await ctx.answerCbQuery("City deleted.");
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
  const [pcount] = await db
    .select({ count: count() })
    .from(productsTable)
    .where(eq(productsTable.districtId, districtId));
  if ((pcount?.count ?? 0) > 0) {
    await ctx.answerCbQuery(
      "Cannot delete: district still has products. Remove products first.",
      { show_alert: true }
    );
    return;
  }
  await db.delete(districtsTable).where(eq(districtsTable.id, districtId));
  await ctx.answerCbQuery("District deleted.");
  await showDistrictsList(ctx, cityId);
}
