import { Context } from "telegraf";
import { BotSession } from "../session";
import { db } from "@workspace/db";
import {
  productsTable,
  citiesTable,
  districtsTable,
  productTypesTable,
} from "@workspace/db";
import { and, eq, ilike } from "drizzle-orm";
import { getOwnerId } from "../db";

// One-time recovery of Panevezys stock that ended up in the development
// database because the workspace process was polling the live BOT_TOKEN and
// intercepted these worker uploads. The production database is not writable by
// the agent, so the only way to put the rows back on the live bot is for the
// live bot itself (the deployment) to insert them. The data below was exported
// from the dev database; the file_ids belong to the original uploads.
//
// Safe to run multiple times: each row is skipped if a product with the same
// file_id already exists, so it never creates duplicates.
const PANEVEZYS_RESTORE: ReadonlyArray<{
  district: string;
  type: string;
  size: string;
  price: string;
  fileId: string;
}> = [
  { district: "DEMBAVA", type: "Rukalas", size: "2g", price: "30.00", fileId: "AgACAgEAAxkBAAIFiGoxijJkPHKjQ9LbhdA72mTLaceyAALIDGsbAAHSiEXPl3E4AXIzOQEAAwIAA3kAAzwE" },
  { district: "DEMBAVA", type: "Rukalas", size: "2g", price: "30.00", fileId: "AgACAgEAAxkBAAIFqWoxi13BE1BEtw2yONQonx47mSzNAALNDGsbAAHSiEUf9Chc6snQhQEAAwIAA3kAAzwE" },
  { district: "DEMBAVA", type: "Rukalas", size: "2g", price: "30.00", fileId: "AgACAgEAAxkBAAIFomoxixZePgWu6Lj0fA3xc5OWdAABjQACzAxrGwAB0ohFyMcrTwpB5XUBAAMCAAN5AAM8BA" },
  { district: "DEMBAVA", type: "Rukalas", size: "2g", price: "30.00", fileId: "AgACAgEAAxkBAAIFlmoxirfRBupNecAfGaa7sdEOfIxYAALLDGsbAAHSiEX4NGvmQ7cWQgEAAwIAA3kAAzwE" },
  { district: "DEMBAVA", type: "Rukalas", size: "2g", price: "30.00", fileId: "AgACAgEAAxkBAAIFj2oxim25kGgd02nRump5bNp97XmMAALJDGsbAAHSiEVJeYkHxfsYYwEAAwIAA3kAAzwE" },
  { district: "STANIUNAI", type: "Krilai", size: "1g", price: "30.00", fileId: "AgACAgEAAxkBAAIER2owKbQOLxOSDBvtjFucRBlTTG6FAAIoDGsbM2iBRSAkXg-TclfTAQADAgADeQADPAQ" },
  { district: "STANIUNAI", type: "Krilai", size: "1g", price: "30.00", fileId: "AgACAgEAAxkBAAIEYWowKrei0CLjn3JjRbKwOLcgA_MTAAInDGsbM2iBRY2-GcoD04L4AQADAgADeQADPAQ" },
  { district: "STANIUNAI", type: "Krilai", size: "2g", price: "55.00", fileId: "AgACAgEAAxkBAAIEWmowKnGJJ-vpAAGpHnisOlzLMD4RUwACJgxrGzNogUW_YAodiW9LrwEAAwIAA3kAAzwE" },
  { district: "STANIUNAI", type: "Krilai", size: "2g", price: "55.00", fileId: "AgACAgEAAxkBAAIEUGowKiHiL9SKN0IdydN3eNWo-QLXAAIkDGsbM2iBRXaCBDFbiiR6AQADAgADeQADPAQ" },
];

const WORKER_TAG = "SAINTGERMAINNV";

export async function restorePanevezys(
  ctx: Context & { session: BotSession },
): Promise<void> {
  const city = await db
    .select({ id: citiesTable.id })
    .from(citiesTable)
    .where(ilike(citiesTable.name, "Panevezys"))
    .then((r) => r[0]);

  if (!city) {
    await ctx.reply("❌ Restore failed: city 'Panevezys' not found.");
    return;
  }

  const ownerId = getOwnerId() ?? ctx.from?.id ?? null;

  let inserted = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const item of PANEVEZYS_RESTORE) {
    const district = await db
      .select({ id: districtsTable.id })
      .from(districtsTable)
      .where(
        and(
          eq(districtsTable.cityId, city.id),
          ilike(districtsTable.name, item.district),
        ),
      )
      .then((r) => r[0]);

    const type = await db
      .select({ id: productTypesTable.id })
      .from(productTypesTable)
      .where(ilike(productTypesTable.name, item.type))
      .then((r) => r[0]);

    if (!district || !type) {
      problems.push(
        `• ${item.district} / ${item.type} ${item.size} — ${
          !district ? "district" : "type"
        } missing`,
      );
      continue;
    }

    const existing = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.fileId, item.fileId))
      .then((r) => r[0]);

    if (existing) {
      skipped++;
      continue;
    }

    try {
      await db.insert(productsTable).values({
        cityId: city.id,
        districtId: district.id,
        typeId: type.id,
        size: item.size,
        price: item.price,
        fileId: item.fileId,
        fileType: "photo",
        addedBy: ownerId,
        workerTag: WORKER_TAG,
        status: "available",
      });
      inserted++;
    } catch {
      problems.push(
        `• ${item.district} / ${item.type} ${item.size} — insert failed`,
      );
    }
  }

  let msg =
    `♻️ <b>Panevezys restore complete</b>\n\n` +
    `✅ Added: <b>${inserted}</b>\n` +
    `⏭ Already present (skipped): <b>${skipped}</b>`;
  if (problems.length) {
    msg += `\n\n⚠️ Could not place:\n${problems.join("\n")}`;
  }
  msg +=
    `\n\n<i>If a photo does not show on a restored item, it was uploaded ` +
    `through a different bot and only its picture needs re-uploading via /klad — ` +
    `the listing itself is back.</i>`;

  await ctx.reply(msg, { parse_mode: "HTML" });
}
