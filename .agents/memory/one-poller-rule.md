---
name: One-poller rule (Telegram long polling)
description: Why the workspace must not poll the same bot token as the live deployment, and how launch gating works.
---

Telegram allows only ONE long-polling `getUpdates` consumer per bot token. Running the
workspace/dev process and the deployed Reserved VM at the same time on the same
`BOT_TOKEN` makes them fight over every update (Telegram returns 409 Conflict to the
loser). Symptoms reported by users: "bot only works when I'm online on Replit",
"products/uploads sometimes just disappear" — updates were being handled by whichever
instance won the poll at that instant, so some never committed.

**Rule:** exactly one instance may poll a given token. The deployed VM owns `BOT_TOKEN`
24/7. The workspace must use a SEPARATE token (`DEV_BOT_TOKEN`) or not poll at all.

**Why:** the failover health check only treats 401/404 as a dead token, NOT 409, so a
conflict never self-heals — it just degrades silently.

**How to apply:** `startBotWithFailover` keys off `REPLIT_DEPLOYMENT` (Replit sets it in
deployments, empty in the workspace). Deployment → poll `BOT_TOKEN` (+ backups w/ failover).
Workspace → poll only if `DEV_BOT_TOKEN` is set, else log a warning and skip. Dev and the
deployment share the SAME built-in Postgres (`DATABASE_URL`), so data is consistent; the
flakiness was purely the dual-poller conflict, not a DB split.
