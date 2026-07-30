---
name: Destructive-on-tap list UX
description: Why list screens used for "review" must never delete/mutate on a single tap, and the safe pattern to use instead.
---

# Destructive-on-tap list UX

Telegram inline-keyboard lists that a user opens to *review* items must NEVER
perform a destructive action (delete / mark unavailable) on a single tap.

**Why:** The worker `/klad → My Uploads` screen rendered each upload as a button
that immediately marked the product `unavailable`. Workers/owners opening the
list to *look at* their stock tapped items expecting to view them and silently
removed them — products "disappeared" from the customer shop (a whole city's
stock vanished; a product ended up removed with zero purchase records). The
label "tap to delete" did not save users from the footgun.

**How to apply:** For any list whose primary purpose is review/inspection:
- Tapping an item opens a non-destructive **preview** (show content/details).
- Deletion is a separate, explicit, **two-step confirmed** action
  (preview → "Delete" → "Yes, remove it").
- Guard the deletion sink with ownership + state filters in the SQL `WHERE`
  (e.g. `worker_tag = derivedTag AND status = 'available'`) so forged callback
  data can't delete someone else's row or mutate non-available items.
- Verifying the SAME ownership in the preview handler prevents previewing
  others' items via crafted callbacks.
