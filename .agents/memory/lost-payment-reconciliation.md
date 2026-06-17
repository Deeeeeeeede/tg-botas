---
name: Lost-payment safety net (invoice intents + reconciliation)
description: Why purchase invoices must be persisted like top-ups, and the rules a payment-reconciliation sweep must follow to never double-credit.
---

# Lost SOL payments → persist invoices + reconcile

Original failure: purchase SOL invoices lived only in memory (`pendingInvoices`).
Top-ups persisted to their own table; purchases did not. So a process restart
(republish / Reserved-VM restart / bot failover) or a payment arriving after the
15-minute live window left the on-chain payment with nothing to match — money
received, no product, no record.

**Rule: any payment a buyer can initiate must leave a durable DB trail at
creation time, not only in memory.** Purchase invoices now persist to
`bot_invoice_intents` (status open|fulfilled|expired|canceled), mirroring the
top-up invoices table.

**Why:** in-memory-only state cannot survive the very events (restart, expiry)
that strand payments. The persisted intent is what lets a late/orphaned payment
be attributed back to its buyer.

## Reconciliation sweep — invariants that keep it safe
- **Idempotency is the UNIQUE `tx_signature` claim** (`INSERT bot_payment_receipts
  ON CONFLICT DO NOTHING`, inside the credit transaction). This is the single
  source of truth across ALL credit paths: live finalize, auto-sweep, and the
  admin manual tool. As long as every path claims the signature first, one
  payment can never be credited twice.
- **Skip amounts currently live in memory** (`isAmountLive` within `MATCH_TOL`) in
  BOTH the auto-sweep and the admin "Unmatched Payments" list. If you forget the
  admin list, an operator can claim a signature still in the live window and stop
  the live flow from delivering the product — recreating "paid but no product".
- **Auto-credit only on EXACTLY ONE match** (unfulfilled intent or top-up, amount
  within tolerance, created before the tx, within a 48h window). 0 or >1 → leave
  for the human admin tool. Credit to balance (not deliver) because post-expiry
  the reserved stock was already released.
- **Deployment-gate the auto-sweep** (`REPLIT_DEPLOYMENT==='1'` ||
  `NODE_ENV==='production'`). The workspace shares the same mainnet shop wallet but
  a SEPARATE dev DB, so a dev process auto-crediting could attribute a real
  mainnet payment to a dev test intent. The admin (read-only listing) tool can
  stay ungated.

## Historical orphans
Payments made before the intent table existed have no intent row, so the sweep
finds 0 matches and leaves them. The owner recovers them manually via
Tools → Payment Recovery → Unmatched Wallet Payments (credits a chosen Telegram
ID; still idempotent via the signature claim).
