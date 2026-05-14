import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  discountCodesTable,
  productDiscountsTable,
  resellerDiscountsTable,
  tierLevelsTable,
  tierSettingsTable,
  tierDiscountRulesTable,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import {
  DISCOUNTS_KB,
  inlineKeyboard,
  BACK_BTN,
} from "../keyboards";

export async function showDiscountsMenu(ctx: Context & { session: BotSession }) {
  ctx.session.step = undefined;
  ctx.session.data = undefined;
  if (ctx.callbackQuery) {
    await ctx.editMessageText("🎁 <b>Discounts Menu</b>", {
      parse_mode: "HTML",
      ...DISCOUNTS_KB,
    });
  } else {
    await ctx.reply("🎁 <b>Discounts Menu</b>", {
      parse_mode: "HTML",
      ...DISCOUNTS_KB,
    });
  }
}

export async function showDiscountCodes(ctx: Context & { session: BotSession }) {
  const codes = await db
    .select()
    .from(discountCodesTable)
    .orderBy(asc(discountCodesTable.code));

  let text = "🎟 <b>Discount Codes</b>\n\n";
  if (codes.length === 0) {
    text += "No codes yet.";
  } else {
    for (const c of codes) {
      const uses =
        c.maxUses != null
          ? `${c.usesCount}/${c.maxUses}`
          : `${c.usesCount}/∞`;
      text += `<code>${c.code}</code> — ${c.percentOff}% off — Uses: ${uses} — ${c.stacksWithSale ? "Stacks" : "No stack"}\n`;
    }
  }

  const kb = inlineKeyboard([
    [{ text: "➕ Create Code", callback_data: "disc:create_code" }],
    ...codes.map((c) => [
      { text: `🗑 ${c.code}`, callback_data: `disc:del_code:${c.id}` },
    ]),
    [BACK_BTN("admin:discounts")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function deleteDiscountCode(
  ctx: Context & { session: BotSession },
  codeId: number
) {
  await db.delete(discountCodesTable).where(eq(discountCodesTable.id, codeId));
  await ctx.answerCbQuery("Code deleted.");
  await showDiscountCodes(ctx);
}

export async function showProductDiscounts(ctx: Context & { session: BotSession }) {
  const discounts = await db
    .select()
    .from(productDiscountsTable)
    .orderBy(asc(productDiscountsTable.id));

  let text = "🔥 <b>Product Discounts</b>\n\n";
  if (discounts.length === 0) {
    text += "No product discounts set.";
  } else {
    for (const d of discounts) {
      const scope = [
        d.typeId ? `Type ${d.typeId}` : null,
        d.cityId ? `City ${d.cityId}` : null,
        d.districtId ? `District ${d.districtId}` : null,
        d.size ? `Size ${d.size}` : null,
      ]
        .filter(Boolean)
        .join(" / ");
      text += `• ${scope || "All"} — ${d.percentOff}% off\n`;
    }
  }

  const kb = inlineKeyboard([
    [{ text: "➕ Add Discount", callback_data: "disc:add_product_disc" }],
    ...discounts.map((d) => [
      {
        text: `🗑 Discount #${d.id} (${d.percentOff}%)`,
        callback_data: `disc:del_prod_disc:${d.id}`,
      },
    ]),
    [BACK_BTN("admin:discounts")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function showTierSystem(ctx: Context & { session: BotSession }) {
  const tiers = await db
    .select()
    .from(tierLevelsTable)
    .orderBy(asc(tierLevelsTable.threshold));
  const settings = await db.select().from(tierSettingsTable).then((r) => r[0]);
  const metric = settings?.metric ?? "purchase_count";

  let text =
    `🏆 <b>Tier System</b>\n` +
    `Metric: <b>${metric === "purchase_count" ? "Purchase Count" : "EUR Spent"}</b>\n\n`;

  if (tiers.length === 0) {
    text += "No tiers configured.";
  } else {
    for (const t of tiers) {
      text += `• <b>${t.name}</b> — threshold: ${t.threshold} — global discount: ${t.globalDiscountPercent}%\n`;
    }
  }

  const kb = inlineKeyboard([
    [{ text: "➕ Add Tier Level", callback_data: "tiers:add" }],
    [
      {
        text: "🔄 Switch Metric",
        callback_data: `tiers:switch:${metric === "purchase_count" ? "eur_spent" : "purchase_count"}`,
      },
    ],
    [{ text: "🔃 Reset Defaults", callback_data: "tiers:reset" }],
    ...tiers.map((t) => [
      {
        text: `✏️ ${t.name} (${t.threshold})`,
        callback_data: `tiers:edit:${t.id}`,
      },
      { text: "🗑", callback_data: `tiers:del:${t.id}` },
    ]),
    [BACK_BTN("admin:discounts")],
  ]);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: "HTML", ...kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", ...kb });
  }
}

export async function switchTierMetric(
  ctx: Context & { session: BotSession },
  metric: "purchase_count" | "eur_spent"
) {
  const existing = await db.select().from(tierSettingsTable).then((r) => r[0]);
  if (existing) {
    await db.update(tierSettingsTable).set({ metric });
  } else {
    await db.insert(tierSettingsTable).values({ metric });
  }
  await ctx.answerCbQuery(`Metric switched to ${metric === "purchase_count" ? "Purchase Count" : "EUR Spent"}.`);
  await showTierSystem(ctx);
}

export async function resetTierDefaults(ctx: Context & { session: BotSession }) {
  await db.delete(tierLevelsTable);
  await db.insert(tierLevelsTable).values([
    { name: "New", threshold: 0, globalDiscountPercent: 0 },
    { name: "Regular", threshold: 5, globalDiscountPercent: 0 },
    { name: "VIP", threshold: 15, globalDiscountPercent: 5 },
    { name: "Legend", threshold: 30, globalDiscountPercent: 10 },
  ]);
  await ctx.answerCbQuery("Tier ladder reset to defaults.");
  await showTierSystem(ctx);
}

export async function deleteTier(ctx: Context & { session: BotSession }, tierId: number) {
  await db.delete(tierLevelsTable).where(eq(tierLevelsTable.id, tierId));
  await ctx.answerCbQuery("Tier deleted.");
  await showTierSystem(ctx);
}
