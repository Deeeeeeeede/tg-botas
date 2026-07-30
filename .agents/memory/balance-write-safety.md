---
name: User balance write safety
description: Rules for any code that mutates bot user balances (refunds, top-ups, credits).
---

Every write to `usersTable.balance` MUST be scoped with a `where(eq(usersTable.telegramId, ...))`
and should credit relative to the current value (`sql\`${usersTable.balance} + ${amount}\``)
inside a transaction, not by read-then-write.

**Why:** a prior refund handler shipped an `update(usersTable).set({...})` with NO
where clause that corrupted every user's balance at once. Read-then-write also
races and can drop concurrent credits — the bot finalizes payments from a
background invoice ticker AND from manual admin actions at the same time, so two
overlapping credits/debits will clobber each other unless the update is relative.

**How to apply:** for refunds/credits, flip the source flag conditionally
(e.g. `refunded = false` → true) and credit the balance in the same
transaction so the operation is atomic and idempotent. Never write a balance
without a per-user where clause.
