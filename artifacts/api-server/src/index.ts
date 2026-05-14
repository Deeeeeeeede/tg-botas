import app from "./app";
import { logger } from "./lib/logger";
import { createBot } from "./bot";
import { db } from "@workspace/db";
import {
  tierLevelsTable,
  tierSettingsTable,
  adminsTable,
} from "@workspace/db";
import { count, eq } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function seedDefaults() {
  const [tierCount] = await db.select({ count: count() }).from(tierLevelsTable);
  if ((tierCount?.count ?? 0) === 0) {
    await db.insert(tierLevelsTable).values([
      { name: "New", threshold: 0, globalDiscountPercent: 0 },
      { name: "Regular", threshold: 5, globalDiscountPercent: 0 },
      { name: "VIP", threshold: 15, globalDiscountPercent: 5 },
      { name: "Legend", threshold: 30, globalDiscountPercent: 10 },
    ]);
    logger.info("Default tier levels seeded");
  }

  const [settingsCount] = await db.select({ count: count() }).from(tierSettingsTable);
  if ((settingsCount?.count ?? 0) === 0) {
    await db.insert(tierSettingsTable).values({ metric: "purchase_count" });
    logger.info("Default tier settings seeded");
  }

  const ownerId = Number(process.env["OWNER_ID"]);
  if (ownerId) {
    await db
      .insert(adminsTable)
      .values({ telegramId: ownerId })
      .onConflictDoNothing();
    logger.info({ ownerId }, "Owner added to admins");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  await seedDefaults();

  if (!process.env["BOT_TOKEN"]) {
    logger.warn("BOT_TOKEN not set — bot will not start");
    return;
  }

  try {
    const bot = createBot();
    bot.launch({
      dropPendingUpdates: true,
    });
    logger.info("Telegram bot started (long polling)");

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (err) {
    logger.error({ err }, "Failed to start Telegram bot");
  }
});
