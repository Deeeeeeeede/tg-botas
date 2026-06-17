---
name: SOL payment matching & sender wallet
description: How on-chain SOL payments are bound to one specific invoice, and how the paying wallet is identified.
---

# Binding a payment to exactly one invoice

**Rule:** Each open invoice (purchase AND top-up) must get a *guaranteed-unique*
SOL amount, and on-chain matching must use a tolerance strictly smaller than half
the uniqueness step, so each invoice's acceptance window is disjoint.

**Why:** Loose matching (`received >= expected*0.99`) let one buyer's payment
satisfy a *different* buyer's invoice when two ordered the same EUR total in the
same window — and let a direct/manual payment to the shop wallet auto-deliver an
open bot order (double-delivery). Signature-claim only prevents double *credit*,
not wrong-buyer binding.

**How to apply:**
- Generate amounts with `makeUniqueSolAmount(baseSol)`. It is **synchronous (no
  awaits)** on purpose: it snapshots active invoice amounts + a process-level
  `reservedAmounts` map and reserves its chosen amount before returning, which
  closes the TOCTOU race between amount-pick and `registerPendingInvoice`. If you
  ever add an `await` inside it, the race reopens.
- `registerPendingInvoice` releases the reservation; abandoned creations expire
  via TTL. Top-up invoices MUST also register `solAmount` or they fall out of the
  uniqueness space and can collide with purchases.
- Matching uses `MATCH_TOL` (2e-6) with step 1e-5, i.e. tol < step/2 → disjoint
  windows. Overpay-to-balance is intentionally gone; invoices say "send this
  exact amount". Don't widen the tolerance back without restoring uniqueness math.

# Identifying the paying wallet

`scanForPayment` returns `senderWallet` = the account key with the largest
(pre-post) balance decrease, excluding the shop wallet index; fallback
`accountKeys[0]` (the fee payer). Stored on `purchasesTable.senderWallet` and shown
in admin Today's Sales. Only populated for new SOL purchases going forward.

# Admin "Cancel Pending Order" (Tools menu)

Live invoices are in-memory only. `adminCancelInvoice` removes the watcher,
releases the basket (purchase) or expires the row (top-up), and notifies the
buyer — use it when a buyer pays directly so the bot won't also deliver.
