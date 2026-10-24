# Design approved

**Approved by Joe, 2026-10-15** ("that is the one"), for the Round 3 mockups in `docs/mockups-v3/`
(private Artifact: https://claude.ai/artifact/KPm93BhJioHjprvt3DYjKd, 70 checks in `docs/mockups-v3/_check/flows.mjs`).

What is approved: the look and the screens, following Joe's six boards literally. Four tabs
(Home, Debts, Schedule, Reports); Add debt (one-time or installments); Debt details and Log payment;
Payment schedule; Debt progress; QR gallery. Settings behind the round letter. Themes (six, light and
dark), currency, sounds, ask-before-save with a "saved on this phone" notice, offline waits to sync,
QR save/share warnings (iPhone shares, Android saves), 14-day "QR changed" warning.

Settled at the start of Phase 3 (Joe, 2026-10-17):
1. The boards drop debts owed to Joe, Tab and Uneven plan, and People/Vault as tabs. SPEC.md still
   lists them. Does SPEC shrink to match the boards?
   **ANSWERED 2026-10-17: yes, SPEC trimmed to match the boards.**
2. Home's "Monthly cash flow" needs income and expenses (SPEC leaves those to Gastos). Keep it, with
   Joe typing the two numbers?
   **ANSWERED 2026-10-17: keep it, Joe types the two numbers.**
3. May the logo copy (`docs/mockups-v3/logo-192.png`) stay in the public repo?
   **ANSWERED 2026-10-17: NO. Logo files are untracked and gitignored; mockups use them locally only.**

## Round 4 (approved by Joe, 2026-10-23: "That's the one")
The round 4 mockup, version 7: `docs/mockups-v4/` (private Artifact https://claude.ai/artifact/JrS315AM8X2peAw7HPZA2W,
checks in `docs/mockups-v4/_check/`: engine, flows, corners, fit, erasekey). Direction by Erina (vault
`02-process/erina-round4-direction-2026-10-23.md`) and her review (`erina-review-round4-mockups-2026-10-23.md`).
What is approved:
- **Look:** Patas violet `#5946E7` is the default theme (in the `indigo` slot; "Patas indigo" retired; Ink blue and the
  other themes stay). Manrope 400-700 replaces Inter; money always shows centavos with tabular figures. Glass only on the
  hero, the Home summary cards, the Reports summary cards, the tab bar, popup and sheet shells, toasts and dropdowns, over
  a soft wash; lists, forms, details, charts and confirm dialogs stay solid. Show QR stays always white.
- **Motion:** count-up once per app open and old-to-new after a change; circular theme reveal; popups scale and fade;
  sheets slide and swipe down; toasts slide down with a drawn check; press scale; charts grow once per session;
  reduced motion respected. One soft two-note chime on saves (not deletes), Android haptic; "Play test sound".
- **Home:** greeting by name ("Good evening, Rina"), the small mascot tile, no Next payment; Total I owe; Due this month
  (left · paid) and Paid this month open popups (payment detail inside, edit, delete); Overdue strip; Monthly cash flow
  (per month). Home fits the screen it is on.
- **Debts:** search that is also a dropdown (people and debts); filter chips wrap; rows say "₱x left" with the next date
  and a thin bar; a QR button to the gallery.
- **Debt details:** Remaining, progress, Reminder row (per-debt reminders: same day / 1 / 3 / 7 days before / a date, one
  time each), History row, Payment schedule, Payments; ⋯ menu with Edit, Borrow again, Delete; pinned Log payment and
  Pay with QR (or "Add their payment QR").
- **Person history:** a page per person: remaining, borrowed, paid, their QR, Borrow again, their debts, a dated ledger.
- **Log payment:** tick months (from the oldest; ticked + 3 shown, "Show n more"), Select all, Pay selected; or a custom
  amount; method chips with "Other…" that names a new method and keeps it.
- **Add debt:** One-time / Installment / Recurring; person picker with "+ Add"; currency per debt; app-style date fields.
- **Schedule:** a month calendar with dots (overdue, today, coming up, paid) and the day's list.
- **Reports:** period dropdown; Remaining with the progress ring; Debt over time; Debt by person; Cash remaining;
  Income, spending and debt (stacked months, tap for exact amounts).
- **Settings:** a sheet; profile (name, photo); Security & MPIN; Appearance (System / Light / Dark + swatches, circular
  reveal); Currency (21, search; amounts stay in their own currency, display converts with "≈"); Notifications; Sounds;
  Haptics (Android only); Paying > Payment QR codes; Backup & export; About; Log out.
- **Payment QR codes:** one per person, used by all their debts including new ones; gallery, Show QR, add / replace /
  remove; Kenshin's save-or-share wording kept.
- **Opening:** white loading screen (mascot riding a ring with a ₱ coin), the violet MPIN login (centred, frosted card,
  wallet-icon pattern), "Enter your MPIN" keypad with a plain erase key. MPIN rules unchanged.
- **Photos:** your own profile photo and one per person owed; private, like QR files.
**Joe's choices (2026-10-23, "use your recommended answers"):** confirm only before deletes (saves get the toast);
centavos everywhere; light glass as in the mockup; header tile = the small mascot. Joe also gave the go, in advance,
for going live and public when the build is "all good".
