---
name: Owner/admin authorization
description: How owner-level admin access is determined in the bot — never hardcode a Telegram ID
---

Owner admin status comes ONLY from the `OWNER_ID` env var, resolved via
`getOwnerId()` / `isOwner()` in `artifacts/api-server/src/bot/db.ts`. Regular
admins live in the `bot_admins` table; `isAdmin()` = owner OR row in that table.

**Why:** A hardcoded owner Telegram ID was once embedded directly in source
(`isAdmin()` and the admin-managers handler), creating a permanent backdoor admin
in every deployment regardless of config. This got a code review rejected for
privilege escalation / least-privilege violation.

**How to apply:** Never reintroduce a literal Telegram ID anywhere in source for
auth. Owner identity is configuration only. On startup the owner is seeded into
`bot_admins`; if `OWNER_ID` is unset, log a warning (no owner is granted) rather
than falling back to any baked-in value.
