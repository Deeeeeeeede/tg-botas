// MUST be the very first import — patches abort-controller before Telegraf loads node-fetch.
// ES module imports are hoisted, so inline patch code in this file runs too late.
// See abort-signal-patch.ts for the full explanation.
import "./abort-signal-patch";

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
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

logger.info(
  {
    port,
    env: {
      NODE_ENV: process.env["NODE_ENV"],
      REPLIT_DEPLOYMENT: process.env["REPLIT_DEPLOYMENT"],
    },
  },
  "Starting API server",
);

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
const POLLING_RESTART_DELAY_MS = 5_000;
const MAX_POLL_RESTARTS = 5;

async function activateBot(
  bot: Telegraf,
  token: string,
  meta: { username?: string; isBackup: boolean; tokenIndex: number },
): Promise<void> {
  let restartCount = 0;

  const getErrorReason = (err: unknown): string => {
    const e = err as {
      response?: { description?: string; error_code?: number };
      message?: string;
      code?: number | string;
    };
    return (
      e?.response?.description ??
      e?.message ??
      (typeof e?.code === "string" || typeof e?.code === "number"
        ? String(e.code)
        : undefined) ??
      String(err)
    );
  };

  const launch = (): void => {
    bot
      .launch({ dropPendingUpdates: true })
      .then(() => {
        // Resolved = polling stopped cleanly (e.g. SIGTERM). Don't relaunch.
      })
      .catch((err) => {
        if (activeBot !== bot || failoverInProgress) return;

        restartCount += 1;
        const reason = getErrorReason(err);
        const errorCode = (err as { response?: { error_code?: number }; code?: number })?.response?.error_code ??
          (err as { code?: number })?.code;
        const isConflict = errorCode === 409 || /409|conflict/i.test(reason);
        const delay = Math.min(
          POLLING_RESTART_DELAY_MS * 2 ** (restartCount - 1),
          60_000,
        );

        if (isConflict) {
          logger.error(
            { err, tokenIndex: meta.tokenIndex, restartCount, reason, errorCode },
            "Bot polling failed due to 409 Conflict — stopping retries",
          );
          return;
        }

        if (restartCount > MAX_POLL_RESTARTS) {
          logger.error(
            { err, tokenIndex: meta.tokenIndex, restartCount, reason },
            "Bot polling stopped permanently after too many restarts",
          );
          return;
        }

        logger.warn(
          { err, tokenIndex: meta.tokenIndex, restartCount, reason, delay },
          "Bot polling stopped — restarting polling shortly",
        );

        const t = setTimeout(() => {
          if (activeBot === bot && !failoverInProgress) launch();
        }, delay);
        t.unref?.();
      });
  };

  try {
    const webhookInfo = await bot.telegram.getWebhookInfo();
    logger.info(
      { tokenIndex: meta.tokenIndex, webhookInfo },
      "Current webhook info before polling start",
    );
  } catch (err) {
    logger.warn(
      { err, tokenIndex: meta.tokenIndex },
      "Failed to query getWebhookInfo before polling",
    );
  }

  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    logger.info({ tokenIndex: meta.tokenIndex }, "Deleted webhook before polling start");
  } catch (err) {
    logger.warn(
      { err, tokenIndex: meta.tokenIndex },
      "Failed to delete webhook before polling; continuing anyway",
    );
  }

  launch();
  activeBot = bot;
  await markActiveToken(token);
  scheduleHealthCheck(bot, token);
  logger.info(meta, "Telegram bot started (long polling)");
}

let botStartGuard = false;

async function startBotWithFailover(): Promise<void> {
  if (botStartGuard) {
    logger.warn("Bot startup already initiated; skipping duplicate startBotWithFailover call");
    return;
  }
  botStartGuard = true;
  // Telegram allows only ONE long-polling instance per bot token. The live
  // deployment (Reserved VM) polls BOT_TOKEN 24/7. If the workspace/dev process
  // also polled BOT_TOKEN, the two would fight over every update (409 Conflict),
  // making the bot flaky and causing uploads/actions to be lost. So in dev we
  // only poll when given a SEPARATE token via DEV_BOT_TOKEN; otherwise we stay
  // quiet and let the deployment own the bot.
  //
  // Deployment is detected via TWO independent signals so the live bot is
  // guaranteed to poll: Replit sets REPLIT_DEPLOYMENT=1 in deployments, AND the
  // production run command sets NODE_ENV=production (the dev script sets
  // NODE_ENV=development). Either one being present means "this is production".
  const isDeployment =
    process.env["REPLIT_DEPLOYMENT"] === "1" ||
    process.env["NODE_ENV"] === "production";

  if (!isDeployment) {
    const devToken = process.env["DEV_BOT_TOKEN"];
    if (devToken) {
      // A dedicated dev token is configured — use it to avoid conflicting with
      // any live deployment that may be polling BOT_TOKEN.
      const bot = createBot(devToken);
      try {
        const me = await bot.telegram.getMe();
        await activateBot(bot, devToken, {
          username: me.username,
          isBackup: false,
          tokenIndex: 0,
        });
      } catch (err) {
        logger.error({ err }, "DEV_BOT_TOKEN failed to start");
      }
      return;
    }
    // No DEV_BOT_TOKEN in the workspace: do NOT fall back to BOT_TOKEN.
    //
    // Polling BOT_TOKEN from here is exactly what lets the dev process "steal"
    // the live bot's updates: when both the deployment and this process poll the
    // same token, Telegram hands some updates to this process, so workers'
    // uploads get handled here and written to the DEV database instead of
    // production — and the products then appear to "disappear" from the live
    // bot. To make that impossible, the workspace NEVER polls BOT_TOKEN. It only
    // runs a bot when a separate DEV_BOT_TOKEN is provided. The live deployment
    // (REPLIT_DEPLOYMENT/NODE_ENV=production) is the sole owner of BOT_TOKEN.
    logger.warn(
      "DEV_BOT_TOKEN not set — workspace bot will NOT poll Telegram. " +
        "Refusing to poll BOT_TOKEN so the dev process can never intercept the " +
        "live bot's updates. Set DEV_BOT_TOKEN to a separate BotFather token to " +
        "test the bot in the workspace.",
    );
    return;
  }

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

const server = app.listen(port);

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

server.on("listening", () => {
  logger.info({ port }, "Server listening");

  seedDefaults()
    .then(() => startBotWithFailover())
    .catch((err) => {
      logger.error({ err }, "Startup failed");
      process.exit(1);
    });
});

process.once("SIGINT", () => {
  logger.info("SIGINT received — stopping bot");
  activeBot?.stop("SIGINT");
});
process.once("SIGTERM", () => {
  logger.info("SIGTERM received — stopping bot");
  activeBot?.stop("SIGTERM");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
  process.exit(1);
});
