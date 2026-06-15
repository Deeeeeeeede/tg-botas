// Patch abort-controller's AbortSignal so node-fetch@2 accepts native Node.js AbortSignal instances
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AbortSignal: ACAbortSignal } = require("abort-controller") as {
    AbortSignal: { [Symbol.hasInstance]: unknown };
  };
  Object.defineProperty(ACAbortSignal, Symbol.hasInstance, {
    configurable: true,
    value(instance: unknown) {
      if (instance == null) return false;
      const i = instance as Record<string, unknown>;
      return (
        typeof i["aborted"] === "boolean" &&
        typeof i["addEventListener"] === "function"
      );
    },
  });
} catch {}

import app from "./app";
import { logger } from "./lib/logger";
import { createBot } from "./bot";
import { db } from "@workspace/db";
import {
  tierLevelsTable,
  tierSettingsTable,
  adminsTable,
  backupTokensTable,
} from "@workspace/db";
import { count, eq } from "drizzle-orm";
import type { Telegraf } from "telegraf";

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
  } else {
    logger.warn(
      "OWNER_ID is not set — no owner admin will be granted. Set OWNER_ID to the owner's Telegram user ID.",
    );
  }
}

let activeBot: Telegraf | null = null;
let failoverInProgress = false;
const HEALTH_CHECK_INTERVAL_MS = 60_000;

// Ordered list of tokens to try: main BOT_TOKEN first, then saved backups.
async function getOrderedTokens(): Promise<string[]> {
  const tokens: string[] = [];
  const main = process.env["BOT_TOKEN"];
  if (main) tokens.push(main);
  try {
    const backups = await db.select().from(backupTokensTable);
    for (const b of backups) {
      if (!tokens.includes(b.token)) tokens.push(b.token);
    }
  } catch (err) {
    logger.error({ err }, "Failed to load backup tokens");
  }
  return tokens;
}

// A 401 (Unauthorized) or 404 means the token is revoked/deleted.
function isAuthError(err: unknown): boolean {
  const e = err as { response?: { error_code?: number }; code?: number };
  const code = e?.response?.error_code ?? e?.code;
  return code === 401 || code === 404;
}

// Reflect which token is currently live in the DB so admins see [ACTIVE].
async function markActiveToken(activeToken: string): Promise<void> {
  try {
    const backups = await db.select().from(backupTokensTable);
    for (const b of backups) {
      const shouldBeActive = b.token === activeToken;
      if (b.isActive !== shouldBeActive) {
        await db
          .update(backupTokensTable)
          .set({ isActive: shouldBeActive })
          .where(eq(backupTokensTable.id, b.id));
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to update active backup token flag");
  }
}

// Periodically verify the live bot's token is still valid. If Telegram reports
// the token revoked/deleted, fail over to the next available token. Uses a
// serialized setTimeout chain (not setInterval) so checks never overlap.
function scheduleHealthCheck(bot: Telegraf, token: string): void {
  const timer = setTimeout(async () => {
    // This bot is no longer the live one (already failed over) — stop the chain.
    if (failoverInProgress || activeBot !== bot) return;

    try {
      await bot.telegram.getMe();
      scheduleHealthCheck(bot, token); // healthy — schedule the next check
      return;
    } catch (err) {
      if (!isAuthError(err)) {
        // transient/network error — keep monitoring; Telegraf retries polling
        scheduleHealthCheck(bot, token);
        return;
      }
    }

    // Token revoked/deleted. Re-check guards before acting (re-entrancy safety).
    if (failoverInProgress || activeBot !== bot) return;
    failoverInProgress = true;
    logger.warn(
      { token: token.slice(0, 10) },
      "Active bot token revoked — failing over to next token",
    );
    try {
      try {
        bot.stop("failover");
      } catch {
        // already stopped
      }
      activeBot = null;
      await startBotWithFailover();
    } catch (err) {
      logger.error({ err }, "Failover attempt failed");
    } finally {
      failoverInProgress = false;
    }
  }, HEALTH_CHECK_INTERVAL_MS);
  timer.unref?.();
}

// Launch a validated bot, register it as active, and start health monitoring.
// bot.launch() resolves only when the bot STOPS, so we never await it; we attach
// a .catch() to surface polling failures instead of leaving them unhandled.
async function activateBot(
  bot: Telegraf,
  token: string,
  meta: { username?: string; isBackup: boolean; tokenIndex: number },
): Promise<void> {
  bot.launch({ dropPendingUpdates: true }).catch((err) => {
    logger.error({ err, tokenIndex: meta.tokenIndex }, "Bot polling stopped");
  });
  activeBot = bot;
  await markActiveToken(token);
  scheduleHealthCheck(bot, token);
  logger.info(meta, "Telegram bot started (long polling)");
}

async function startBotWithFailover(): Promise<void> {
  const tokens = await getOrderedTokens();
  if (tokens.length === 0) {
    logger.warn("BOT_TOKEN not set — bot will not start");
    return;
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const isBackup = i > 0;
    const bot = createBot(token);

    try {
      const me = await bot.telegram.getMe();
      await activateBot(bot, token, {
        username: me.username,
        isBackup,
        tokenIndex: i,
      });
      return;
    } catch (err) {
      if (isAuthError(err)) {
        logger.warn(
          { tokenIndex: i, isBackup },
          "Token invalid or revoked — trying next token",
        );
        continue;
      }
      // Non-auth (network) error: launch anyway; Telegraf retries polling.
      logger.warn(
        { err, tokenIndex: i },
        "getMe failed (non-auth) — launching anyway",
      );
      await activateBot(bot, token, { isBackup, tokenIndex: i });
      return;
    }
  }

  logger.error("All bot tokens failed — no bot is running");
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  await seedDefaults();

  await startBotWithFailover();

  process.once("SIGINT", () => activeBot?.stop("SIGINT"));
  process.once("SIGTERM", () => activeBot?.stop("SIGTERM"));
});
