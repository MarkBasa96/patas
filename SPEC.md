# Patas — Product spec

*Patas* is Tagalog for "even" or "square" ("patas na tayo" = we're even). The app helps
you get there: it tracks **who you owe, who owes you, how much is left, and when the next
payment is due**, and keeps the payment QR codes you need to pay them.

Status: Phase 0 spec, written 2026-10-01 from the owner's interview; **trimmed 2026-10-17 to match the
approved Round 3 mockups** (`docs/DESIGN_APPROVED.md`). Debts owed to the user, the Tab and Uneven
plan types, Open balance, and People/Vault as tabs are now "Later". Decisions here
are settled unless the owner reopens them. Personal data never appears in this file;
every example uses fake names and amounts.

---

## 1. Goals

1. Replace a spreadsheet of debts and installments with a phone app that is faster to
   update and never hides a number inside a formula.
2. Show, within 2 seconds of opening: what is due next, the total still owed, and what is
   due this month (with how much is already paid).
3. Hold payment QR codes (GCash, Maya, GoTyme, bank) so paying someone is one tap from
   their debt.
4. Remind the user before a payment is due.
5. Be usable by anyone from the day it goes live: open sign-up, private accounts,
   English, pesos by default.
6. Be open source (MIT) without leaking anyone's data, ever.

## 2. Non-goals (v1)

- Expense, income, salary, budget or savings tracking. A separate app covers those.
- Bank or wallet balances. Patas records payments; it does not hold money.
- Bills that are not debts (taxes, utilities, subscriptions).
- Automatic late-fee or interest calculation. Charges are typed in by the user.
- Sharing a debt with the other person so they see it too (Later).
- More than one currency per account, or currency conversion (Later).
- Debts owed *to* the user, the Tab, Uneven plan and Open balance types, a People tab (Later;
  the approved boards dropped them).
- Importing from other people's spreadsheets or CSVs (Later). The spreadsheet importer
  in v1 is a one-off tool for the first user, run on their own computer.
- Widgets, native store builds (Later).
- Any language other than English.

## 3. Users

- **First user and tester:** the owner, who is migrating from Google Sheets.
- **Everyone else:** open sign-up from the day the app goes live. Each person sees only
  their own data. Strangers arrive with nothing to import, so the app must make sense
  from an empty start.

## 4. Core concepts

| Term | Meaning |
|---|---|
| **Person** | Who the money is with: a name typed on the debt ("Ana Reyes") or an organisation ("SSS", "Shopee"). No People tab. |
| **Debt** | One thing the user owes one person. In v1 every debt is *I owe*; the data keeps a direction field so "Owed to me" can be added later without a rebuild. |
| **Debt type** | One-time or Installments (below). |
| **Installment** | One scheduled due date and amount on a plan. |
| **Payment** | Money that actually moved: amount, date, optional note. |
| **Charge** | A late fee, penalty or interest the lender actually charged. Raises what is owed. |
| **Write-off** | The part forgiven or discounted when a debt is settled for less. |
| **QR gallery** | The user's saved payment QR codes, reached from Settings and from a debt's menu. |

### 4.1 The two debt types

1. **One-time**: one amount, an optional due date ("pay when I can" when there is none). Paid in one go or
   in parts. A running tab is a one-time debt whose borrowings are "+ added" lines (Joe, 2026-10-17).
2. **Installments**: same amount every period (for example ₱1,250 × 10 months from a start
   date, due on a set day). Patas generates the installments.

Underneath, both are one model: a debt has *amount lines* (principal, charges), *payments*,
optional *installments*, and *write-offs*. The type changes the screens, not the maths.
Later: Open balance, Uneven plan, Tab, and the *Owed to me* direction.

### 4.2 Money rules

- Stored as **whole centavos** (integers). Never floating point.
- **Remaining and status are always calculated** from the lines and payments, never typed
  or stored as an independent number.
  `remaining = principal + additions + charges − payments − write-offs`.
- Payments are applied to the **oldest unpaid installment first**. An installment can be
  *unpaid*, *partly paid* (shows how much short), *paid*, or *paid late* (the payment's
  date is after the due date).
- A partial payment records the real amount. The shortfall stays on that installment; it
  is not silently moved onto next month.
- "Paid in full" is one tap and fills in the installment's remaining amount.
- Overpaying is allowed. The excess applies to the next installment; beyond the total,
  the debt shows "Overpaid ₱X".
- **Settle**: a "Mark as settled" action. If money is still left, Patas asks
  "Write off ₱X as discount or forgiven?" and records that as its own labelled line, so
  the history stays true and the balance reaches zero.
- A settled debt shows a settled mark in Debts, keeps its full history and the date it was
  finished, and can be reopened.
- Deleting a debt is allowed with a confirmation (for mistakes). Settling is the normal
  way to close one.

## 5. Screens

Four tabs: **Home, Debts, Schedule, Reports**. Settings sits behind the round letter (avatar).

1. **Welcome / onboarding**: what Patas does in one line, sign in with a 6-digit email
   code (bot check like the sibling app), then an empty-state home that invites "Add your
   first debt".
2. **Home**: *Due next* (overdue on top), *Total I still owe*, *Due this month* (and how much
   of it is already paid), all above the fold. Home's "Monthly cash flow" card uses income and
   expenses typed in by the user (kept, owner decision 2026-10-17: two typed numbers, nothing pulled from Gastos).
3. **Debts**: all debts with filters; settled ones carry a mark.
4. **Add debt**: the person, One-time or Installments, then the type's fields.
5. **Debt details** with **Log payment**: remaining, progress, schedule, payments, charges,
   notes, and a **Pay** button when a QR is linked.
6. **Schedule**: the payment schedule across debts.
7. **Reports**: debt progress.
8. **QR gallery**: saved QRs. **Show QR** is full screen and bright, with the account name and
   a copy button, and it works offline.
9. **Settings**: themes (six, light and dark), currency (one per account, display only),
   sounds, reminders (on/off, time), optional MPIN, backup / restore / CSV export,
   privacy note, delete my account, sign out.
10. **Share summary**: a clean image or text of one debt for the share sheet.
11. **Import (owner tool)**: preview and run the one-off spreadsheet import. Not shown to
    other users in v1.

Saves ask before saving and show a "saved on this phone" notice; offline saves wait to sync.
Every screen has mockups for its awkward states: empty, loading, error, offline, very long
names, overdue, fully paid.

## 6. Reminders

- **Phone notifications** (push). Each user's default: **the day before and the day of**
  a due date, at 08:00 local time. Changeable in Settings.
- Overdue items are shown inside the app (top of Home). No repeated overdue alerts.
- Reminders can be turned off per debt.
- Delivery on iPhone needs the app on the home screen (iOS 16.4+). Phase 1 research
  confirms what works on iPhone, Android and the Android wrapper, and whether a free
  database plan keeps the scheduled sender alive.

## 7. QR gallery (QR codes)

- Each item: **QR image, label, wallet type** (GCash, Maya, GoTyme, bank, other), and the
  **account name** with a copy button. No account numbers are stored as text, but the QR picture
  itself carries the payee's number, so the privacy note says so.
- An item can be linked to a person or a debt. **Pay** on a debt opens its QR.
- **No extra lock on the gallery** (owner's decision). The optional app MPIN covers it if
  turned on.
- Works offline: a QR is cached on the phone after it is first shown. The cache is
  cleared on sign-out and on account deletion.
- **Swap protection**: the real risk is someone replacing a QR with their own so money
  goes to them. Patas shows "QR changed on <date>" on any QR replaced within the last
  14 days. The full design is done in Phase 3 (security).
- QR images are left out of backups and exports unless the user ticks "include QR codes".
- QR images are never logged, never put in URLs, never in analytics.

## 8. Accounts, privacy and security

- Private accounts. Every row stores its owner. Row-level security on every table:
  a user can read and write only their own rows. No table is readable by anonymous users.
  A test proves user A cannot read or change user B's rows or QR files.
- QR images live in a **private storage bucket** under per-user paths, downloaded only with the
  owner's own login. There are no shareable links; the server refuses to make them (docs/SECURITY_DESIGN.md).
- The Supabase `service_role` key never ships in app code. Nothing secret goes in any
  `EXPO_PUBLIC_` variable (those are readable by every user).
- **Optional app MPIN**, off by default. Same rules as the sibling app: asked on a fresh
  open and after 30 minutes away, verified on the server, attempt limit.
- **Delete my account**: removes all of the user's rows and QR files, in one action with
  a confirmation.
- **Privacy note (honest version)**: "Your data is private from other users. The person
  running this server can technically access stored data. We never look at it, sell it or
  share it, and you can delete everything at any time." Self-hosters run their own server
  and make their own promise.
- Imported rows carry a stable `source_key`, so re-running an import never duplicates.
- Soft delete underneath, so an accidental delete can be recovered for a short window.
- Saves go to the phone first and sync when online, as in the sibling app.

## 9. Backup and export

- **Backup file + restore** ("add what's missing" by default, or "replace everything").
  QR images excluded unless chosen.
- **CSV export**: one file of debts and one of payments/lines, opens in Sheets or Excel.
- **Share one debt** as a summary (screen 10). The summary never contains a QR.
- **Saving or sharing one QR** from Show QR is separate from exports and backups: one QR at a time, by the
  user's choice, after a warning, with only the date recorded (Kenshin's save/share ruling).

## 10. Stack

Expo (React Native + web) with TypeScript; Supabase (Postgres, Auth, Storage); web build
on Vercel; installable to the home screen (PWA); Android wrapper (Trusted Web Activity)
later; store builds later. Look: same family as the sibling app (calm, plain, same type
and layout habits) with **its own accent colour**. The logo is supplied by the owner;
mockups use a plain placeholder until then.

## 11. Migration (first user only)

A re-runnable importer reads the owner's two spreadsheets on their own PC (read-only),
writes a **preview file first**, and lists anything it can't map. The real figures and
mapping rules live outside this repo, because the repo is public. The rules that shape the
app itself:

- Every tab comes over **line by line**, with date, amount and note, so totals can be
  checked to the centavo.
- Numbers that were hidden inside formulas come over as clearly labelled
  **"Opening adjustment"** lines, so the totals match and the owner can see them.
- Settled debts come over marked settled, with whatever payment detail exists.
- Notes in cells come over as notes on the matching debt.
- QR images go only into the owner's private QR gallery, matched by position, never by file order.
- Switch-over: once the import reconciles with **zero unexplained differences**, the
  spreadsheets stop being used that same day and stay untouched as an archive.

## 12. Risks

| Risk | What we do about it |
|---|---|
| A QR is swapped and money goes to the wrong person | "QR changed" warning; security review in Phase 3 |
| User A sees user B's data | RLS on every table and storage path, proven by a test, audited before real data |
| Strangers' financial data held by the operator | Honest privacy note, delete-account button, no analytics on content |
| Free database plan pauses after 7 idle days and reminders stop | Phase 1 research before choosing the reminder design |
| iPhone push only works for home-screen installs | Onboarding tells iPhone users to add to home screen; Phase 1 confirms |
| Rounding drift | Integer centavos only; calculated, never typed, balances |
| Personal data leaking into the public repo | Fake data only; private notes outside the repo; secret and data scan before going public |
| Open sign-up attracts bots | Bot check on sign-in, as in the sibling app |
| Import silently wrong | Preview first, reconcile every reference figure, list unmapped items |

## 13. Open questions (answered later, not blocking Phase 1)

- Phase 1 research: push reminders on an iPhone home-screen app and the Android
  wrapper; storing payment QRs safely; how comparable trackers structure installments vs
  ledgers; licence and privacy-note notes for an app holding other people's financial info.
- Phase 4 (owner's data): the specific gaps in the spreadsheets are collected into an
  "unmapped items" list and answered with the real numbers in view.
- The owner's logo (owner supplies it).

## 14. The end-to-end check (proves the app works)

Run on the deployed preview with two fresh test accounts and fake data only:

1. **A** signs up with an email code and lands on an empty Home that invites a first debt.
2. A adds "Test Lender" with **Installments**, ₱1,200 × 3 months starting this month. Home
   shows Total I owe **₱3,600.00**, Due next = this month's ₱1,200.00, Due this month ₱1,200.00
   with ₱0.00 paid.
3. A logs a **partial payment** of ₱500.00. Installment 1 shows "partly paid, ₱700.00 short".
   Total I owe **₱3,100.00**.
4. A adds a **charge** (late fee) of ₱100.00. Total **₱3,200.00**.
5. A adds a **One-time** debt "Test Friend" ₱300.00 and pays it in full. It shows settled.
   Total I owe is unchanged.
6. A uploads a fake QR to the gallery, links it to Test Lender, taps **Pay** on the plan, and
   sees it full screen. With the device **offline**, it still shows.
7. A **settles** the plan, writing off what is left. Total I owe is **₱0.00**; the history
   shows the write-off line.
8. **B** signs up in another browser. B sees none of A's debts or QRs. A direct API request by
   B for A's rows returns nothing, and for A's QR file it is refused.
9. A exports **CSV** and a **backup**, creates account **C**, restores the backup there, and
   every total matches A's exactly.
10. A **deletes the account**. A's rows and QR files are gone (checked as admin), and B is
    unaffected.

Passing all ten, with raw output pasted, is what "the app works" means.
