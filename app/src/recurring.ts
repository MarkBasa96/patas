// Recurring debts (round 4): the same amount every week, 2 weeks or month from a first date, until stopped.
// Their dates are worked out, never stored, the same way as the server's reminder_events() so a reminder and the
// screen always agree: the n-th date is counted from the first one (n months / 7n / 14n days), never from the last.
import { stepDate, type Repeat } from './plan';

export type RecurringRule = { amount: number; every: Repeat; first: string; until: string | null };

/** Every date of a recurring debt from its first date up to and including `upTo` (and its end date, if any). */
export function recurringDates(r: RecurringRule, upTo: string, max = 600): string[] {
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    const d = stepDate(r.first, r.every, i);
    if (d > upTo || (r.until && d > r.until)) break;
    out.push(d);
  }
  return out;
}

/**
 * The plan of a recurring debt as installment-like rows, so the same balance() rules apply (payments go to the
 * oldest date first). `owedUpTo` limits what counts as owed (today); `showUpTo` adds the coming dates to show and
 * to tick ahead of time (they are never owed until they arrive).
 */
export function recurringPlan(r: RecurringRule, owedUpTo: string, showUpTo: string): { owed: { seq: number; due_on: string; amount_centavos: number }[]; shown: { seq: number; due_on: string; amount_centavos: number }[] } {
  const all = recurringDates(r, showUpTo > owedUpTo ? showUpTo : owedUpTo).map((due_on, i) => ({ seq: i + 1, due_on, amount_centavos: r.amount }));
  return { owed: all.filter((x) => x.due_on <= owedUpTo), shown: all };
}
