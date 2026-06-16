---
name: Telegram file_ids are bot-specific + dev/prod DB split
description: Why media fails to resend on a different bot token, and why workspace/deployment data diverges.
---

# Telegram file_ids are bot-specific

A Telegram `file_id` is only valid for the bot token that originally obtained it.
Sending it from a DIFFERENT bot (a dev/backup token, a different BotFather bot)
fails with `400: Bad Request: wrong file identifier/HTTP URL specified`.

**Why:** `showHome` crashed on `/start` for the dev bot (`saintgermandevbot`)
because the stored welcome-media `file_id` was uploaded via the production bot.
Every product photo/video stored as a `file_id` has the same limitation.

**How to apply:** Any code path that resends a stored `file_id` must tolerate
failure (try/catch → fall back to text), because the same DB row can be served
by a different bot token (dev vs prod vs backup). Never assume a stored
`file_id` is valid for the currently-running bot.

# Workspace (dev) and deployment (prod) use SEPARATE databases

The workspace/development DB and the deployed/production DB are distinct
datasets. `executeSql({environment:"production"})` is READ-ONLY (a replica);
the agent cannot write to production. Production data only changes via the live
app itself or the Publish schema-diff flow.

**Why:** Products uploaded while the workspace bot was polling the PRODUCTION
token landed in the DEV database (the workspace process answered live users and
wrote to dev). Result: products visible in dev, absent on the live bot —
looked like data "disappearing/being stolen," but it was a DB split.

**How to apply:** For a single-operator bot, enforce the one-poller rule (set
`DEV_BOT_TOKEN` so the workspace uses its own bot) so live-user writes never go
to the dev DB. To get content onto the live bot you must add it through the
live bot (agent cannot insert into prod). Re-publish after code changes so the
deployment runs the latest build.
