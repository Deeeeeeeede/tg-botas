---
name: Drizzle upsert duplicate-target crash
description: Why a single multi-row INSERT ... onConflictDoUpdate can throw, and how to avoid it.
---

Postgres throws "ON CONFLICT DO UPDATE command cannot affect row a second time"
when one INSERT statement contains two or more rows that resolve to the same
conflict target (unique key). This bites when you build insert rows from
user-supplied lists (e.g. parsed size/price lines, multi-select cross-products).

**Why:** the failure surfaces only on duplicate input, so it passes typecheck and
normal testing but blocks a real admin action.

**How to apply:** deduplicate rows by their unique-key tuple BEFORE the insert
(e.g. collapse repeated sizes via a Map keyed on the normalized size, last value
wins). Also, in Telegram multi-select flows that store selections in session,
prune dependent selections when a parent is deselected (e.g. drop districts whose
city was unselected) — session state is not auto-reconciled.
