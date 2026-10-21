# Patas data model (Phase 3, 2026-10-17)

The SQL is `supabase/schema.sql`. The privacy test is `supabase/test/run-local.mjs`. Fake data only.

## In plain words

Patas stores **facts**, never results. A debt is a short header (who, one-time or installments,
when it started). Everything that changes what you owe is a line in one list: the amount you
borrowed, a late fee, a payment, a discount when you settle. The installment plan is stored as
"what you agreed": these dates, these amounts. Whether an installment is paid, how much is left,
and whether you are late are always **worked out** from those facts when the screen opens. They are
never typed in or saved, so they can never disagree with the payments.

Money is stored in whole centavos (₱12.50 is 1250), never as decimals, so nothing rounds wrong.

Every row belongs to one account. Its key is "account + row id", so two people can never bump
into each other's rows, and a payment can only point at a debt in the same account.

## Tables

| Table | What it holds |
|---|---|
| `user_settings` | One row per account: currency, theme, sounds, reminder on/off and time, time zone, and the two typed numbers for Home's "Monthly cash flow" (income, expenses). |
| `debts` | The header: person's name, one-time or installments, due date (one-time only, optional: "pay when I can"), opened, settled (empty = active), reminder on/off, linked QR, note. **No amounts, no "remaining", no status.** |
| `installments` | The plan: number, due date, amount. Made once from "₱1,200 × 3 from Oct 20", then editable. |
| `debt_lines` | The ledger. Kinds: `principal` (one-time debts), `addition` (one-time debts: borrowed more, or they paid for something for you; how a running tab comes over, Joe 2026-10-17), `charge` (late fee, penalty, interest, typed by hand), `adjustment` (import "Opening adjustment", plus or minus), `payment`, `writeoff`. Amounts are always positive; the kind gives the sign. |
| `qr_items` | A saved QR: label, wallet, account name, where the picture is, a fingerprint of what the QR says, and when the server first saw it. |
| `push_subscriptions` | Where to send phone reminders (one per phone). |

Every table also has: `id` (made on the phone, so saving works offline), `user_id`, `deleted`
(soft delete, so other phones learn about it), `updated_at` (server clock, used for syncing),
`created_at` (phone clock, for ordering only) and `source_key` (import id, so re-running an
import never duplicates).

## The money rules

```
remaining = sum(installments)            -- installments debts: the plan IS the principal
          + principal + additions        -- one-time debts: a principal line and/or "+ added" lines
          + charges + adjustments(+)
          - payments - writeoffs - adjustments(-)
```

Installments debts have **no** principal line, so the same number is never stored twice
(Senku's correction, adopted). Settling for less adds a `writeoff` line so the balance reaches
zero and the history stays true.

### Which installment a payment pays (worked out, never stored)

Payments and write-offs, in date order, fill installments in due-date order:

```
credits  = payment + writeoff + minus-adjustment lines, not deleted, sorted by (on_date, created_at, id)
for each installment j (sorted by due_on, seq):
  covered[j]  = clamp(totalCredits - sum of earlier installments, 0, amount[j])
  short[j]    = amount[j] - covered[j]
  doneOn[j]   = date of the credit that brought the running total up to this installment's end
  status[j]   = unpaid      if covered = 0
                partly paid if short > 0   (shows "₱X short"; the shortfall stays here)
                paid        if doneOn <= due_on
                paid late   otherwise
after the last installment: what is left pays charges and adjustments; anything beyond is "Overpaid ₱X".
```

- **Late fees count after the installments** (Joe confirmed 2026-10-17). Because this is worked
  out and not stored, flipping it to "fees first" later needs no data change.
- **"Paid late" is decided by the payment that finishes the installment.** Half on time and half
  late counts as late.

Check against SPEC section 14: 3 × 120,000 = 360,000 (₱3,600.00). Payment 50,000: installment 1
covered 50,000, short 70,000 (₱700.00). Remaining 310,000 (₱3,100.00). Late fee 10,000:
320,000 (₱3,200.00). Matches steps 2 to 4.

This function lives in the app (it must work offline) as one pure function with its own tests in
Phase 6b. The database never computes balances, which also means no database view can leak them.

## Syncing (same recipe as Gastos)

Phones make the ids, save locally first, then send whole rows (`upsert` on `user_id, id`). Each
phone pulls what changed since its last `(updated_at, id)`. Deletes are `deleted = true`. Because
nothing calculated is stored, two phones can't save conflicting totals.

## Kept for later, without a rebuild

- `debts.direction` exists but only allows `i_owe`. "Owed to me" becomes a one-line rule change.
- Open balance, Uneven plan and Tab fit the same ledger: `kind` gets new values, no new tables.

---

### Technical

- PK `(user_id, id)` on every table; `id ~ '^[A-Za-z0-9_-]{1,40}$'`. Child tables use composite FKs
  `(user_id, debt_id) → debts(user_id, id)` and `(user_id, qr_id) → qr_items(user_id, id)`, so a
  cross-user reference is a foreign-key violation (23503), whatever the policies say.
- `unique (user_id, source_key)`, plain (not partial), so `on conflict` works for imports.
- Partial unique `(user_id, debt_id, seq) where not deleted` on installments.
- `bigint` centavos with `between 1 and 99999999999` (₱999,999,999.99) on every amount.
- Text: `patas_clean_line` / `patas_clean_note` checks (length, no control characters, no
  bidi-override or direction marks).
- Server-set columns via triggers: `updated_at`, `qr_items.added_at`, `debts.qr_linked_at`.
- `debts_due_on` check: one-time ⇔ due date present.
- Not enforced in SQL (the app enforces it; it is integrity, not privacy): `principal` lines only
  on one-time debts; one principal per one-time debt.
- Purge job for long-deleted rows: Phase 8 (it must also remove storage files).
