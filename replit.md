# Shop Bot

A full-featured Telegram shop bot with admin management, product catalog, customer tiers, discount system, and worker roles.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — build and run the API server + Telegram bot (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (provisioned automatically)
- Required env: `BOT_TOKEN` — Telegram bot token (used by the deployed production bot)
- Required env: `OWNER_ID` — Owner's Telegram user ID (auto-added to admin list on startup)
- Optional env: `DEV_BOT_TOKEN` — a SEPARATE BotFather token used only in the workspace. The bot only polls Telegram in the workspace if this is set; otherwise the dev process stays quiet so it never conflicts with the live deployment (see "Running 24/7" below).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot: Telegraf v4 (long polling)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — all Telegram bot code
  - `index.ts` — bot setup, all command and callback handlers
  - `db.ts` — database query helpers
  - `pricing.ts` — discount price stack calculation
  - `keyboards.ts` — reusable inline keyboard builders
  - `utils.ts` — formatting, date, uuid helpers
  - `handlers/` — per-feature handlers (admin-geography, admin-products, admin-users, admin-analytics, admin-comms, admin-discounts, admin-tools, worker, shop)
- `lib/db/src/schema/bot.ts` — all database table definitions

## Bot Commands

| Command | Who | What |
|---------|-----|------|
| `/start` | Anyone | Customer home screen |
| `/admin` | Admin | Admin menu |
| `/klad` | Worker | Worker upload menu |
| `/terminate` | Admin | Cancel current flow, return to admin menu |
| `/done` | Admin/Worker | Finish bulk upload |

## Admin Menu Features

- **Analytics** — sales reports by period, city, type; top products
- **Purchases** — live feed of all paid orders
- **Products Menu** — add, add empty product (catalog slots, no upload), bulk add, manage, view stock, product types, bulk price edit
  - **Add Empty Product** — admin defines a product (name + sizes/prices) with NO content, assigns it to multiple cities/districts at once. Creates `bot_product_slots` rows. Workers then upload real stock via `/klad` and inherit the slot price. Customers only ever see slots that have actual available stock.
- **Geography Menu** — cities and districts CRUD
- **Users Menu** — search, ban/unban, reseller management, CSV export
- **Discounts Menu** — discount codes, product discounts (🔥), reseller discounts (👑), tier system (🏆)
- **Communications** — broadcast to all users, welcome message templates, reviews
- **Tools & Settings** — add balance, clear reservations, payment recovery, refunds, backup tokens
- **Workers (/klad)** — manage trusted product uploaders; per-worker "View Uploads" lists what each worker uploaded (size, price, status, date), paginated

## Customer Tier Defaults

| Tier | Threshold (purchases) | Global Discount |
|------|-----------------------|-----------------|
| New | 0 | 0% |
| Regular | 5 | 0% |
| VIP | 15 | 5% |
| Legend | 30 | 10% |

## Architecture decisions

- Bot runs in the same process as the Express API server (long polling, not webhook)
- **Running 24/7 / one-poller rule**: Telegram allows only ONE long-polling instance per bot token. The startup logic (`startBotWithFailover` in `artifacts/api-server/src/index.ts`) works as follows:
  - **Deployment** (`REPLIT_DEPLOYMENT=1` or `NODE_ENV=production`): always polls `BOT_TOKEN`.
  - **Workspace + `DEV_BOT_TOKEN` set**: polls the dev token only — keeps the live deployment conflict-free.
  - **Workspace + no `DEV_BOT_TOKEN`**: falls back to polling `BOT_TOKEN` directly with a warning. Safe when no deployment exists, but if you later re-publish you must set `DEV_BOT_TOKEN` to a separate BotFather token to avoid 409 Conflicts.
  - After changing bot code while a deployment is live, re-publish so the deployment runs the latest build.
- Automatic token failover: on startup the bot tries the main `BOT_TOKEN` first, then saved backup tokens (Tools → Backup Tokens). A health check (`getMe` every 60s) detects a revoked/deleted token (401/404) and relaunches on the next available token. The active token is flagged `[ACTIVE]` in the backup tokens list. Note: a backup bot has a different @username, so customers must open the new bot link — but all data is shared via the same database.
- Session state stored in memory (Telegraf built-in session)
- Price calculation applies discounts in order: fire (sale) → crown (reseller) → trophy (tier rule) → tier global % → discount code
- SOL payment integrity: every accepted on-chain transaction is recorded once in `bot_payment_receipts` (UNIQUE `tx_signature`). The claim is an atomic `INSERT ... ON CONFLICT DO NOTHING`, so a single payment can be credited at most once across both product purchases and balance top-ups. Top-up finalization (invoice complete + signature claim + balance credit) runs inside one DB transaction, so it is all-or-nothing. Known residual limitations: (1) payments are matched by wallet amount + time window, not bound to a specific buyer — two users paying the same amount in the same window is the only collision case; (2) `completePurchase` is not yet a single transaction, though it refunds to balance on every early-exit branch.
- Workers use `/klad` and can only upload to existing city/district/type/size combinations
- Products store content as either text (inline) or Telegram file_id (for photos, documents, videos, GIFs)

## User preferences

- Bot token and owner ID stored as env vars (BOT_TOKEN, OWNER_ID)
- Timestamps shown in Europe/Vilnius timezone

## Gotchas

- After any schema change, run `pnpm --filter @workspace/db run push` then rebuild
- After code changes, the api-server workflow auto-rebuilds (dev script runs build then start)
- The bot uses long polling — only one instance should run at a time
- `@workspace/db` lib must be rebuilt (`pnpm run typecheck:libs`) after schema changes before api-server typecheck works

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
