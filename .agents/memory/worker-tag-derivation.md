---
name: Worker (klad) product tagging
description: How uploaded products are linked to the worker who uploaded them
---

Products uploaded via `/klad` are linked to a worker only through a denormalized
text "worker tag" on the product row — there is no foreign key to the workers
table. The tag is derived as: worker-record username → users-table username →
stringified telegram ID.

**Why:** Any read that lists/counts a worker's uploads (admin per-worker view,
worker self-view, available-stock counts) must derive the tag the exact same way
as the upload path, or uploads silently become invisible — e.g. a worker added by
numeric ID whose users-table row has a username gets tagged by username, so a
naive viewer querying by telegram ID finds nothing.

**How to apply:** Derive the tag through one shared helper used by every read,
and keep it in lockstep with the upload-time derivation. Inherent limitation: if
a worker's username changes after uploads exist, old rows keep the old tag.
