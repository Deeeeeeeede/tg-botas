---
name: sold-status invariant
description: Why bot_products must never be marked status='sold' as a soft-delete
---

# 'sold' must imply a purchase row

In the Telegram shop bot, `bot_products.status='sold'` is treated everywhere as
"this unit was bought." Using `status='sold'` as a generic soft-delete (e.g. a
worker deleting their own just-uploaded item, or a bulk "delete all" action)
creates **orphan sold products** — rows with status='sold' but NO matching
`bot_purchases` row.

**Why this matters:**
- Orphan sold rows silently remove stock from the customer shop (customers only
  see `available` units), so legitimate inventory "just vanishes."
- It breaks the invariant that every sold unit is accounted for by a purchase.

**How to apply:**
- To remove a product that was never purchased, `db.delete` the row (scope it to
  `status='available'` so you can't race-delete a unit mid-purchase). Do NOT set
  status='sold'.
- Only `completePurchase` should set status='sold', and it must do the
  UPDATE-to-sold and the purchase INSERT inside one `db.transaction` so the two
  can never diverge.
- If you ever audit and find `status='sold'` rows with no `bot_purchases` row,
  they are pre-fix orphans and can be restored to `available` if still
  deliverable (have content or file_id).
