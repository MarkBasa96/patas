// The copy of your data that lives on the phone. Pure state changes only (no storage, no network), so
// they can be tested. Saves land here first; "dirty" remembers what still has to reach the cloud.
import type { DebtRow, InstallmentRow, LineRow } from './ledger';
import { todayIso } from './plan';
import { START_CURSOR, mergePulled, type Cursor } from './merge';
import { isCurrency } from './money';

export type TableKey = 'debts' | 'installments' | 'lines' | 'cash';
export const TABLE_ORDER: TableKey[] = ['debts', 'installments', 'lines', 'cash']; // parents first: children point at debts

/** Round 4: Home's income and expenses for one month; the id IS the month ("2026-10"). */
export type CashRow = { id: string; income_centavos: number; expenses_centavos: number; created_at: number; deleted: boolean; updated_at?: string };
export type Data = { debts: DebtRow[]; installments: InstallmentRow[]; lines: LineRow[]; cash: CashRow[] };
type Rev = Record<string, number>; // row id -> the version of the local change still waiting to be sent

export type Local = {
  data: Data;
  dirty: Record<TableKey, Rev>;
  cursors: Record<TableKey, Cursor>;
  rev: number;
  /** Before round 4, Home's two typed numbers lived here; revive turns them into this month's cash row. */
  cash: { income: number; expenses: number };
  /** The currency amounts are shown in (round 4: converted for display, the stored amounts never change). */
  currency: string;
  /** The name Home greets with (round 4). */
  name: string;
  /** `settingsDirty` = currency or name not yet in the cloud. */
  settingsDirty: boolean;
};

export const emptyLocal = (): Local => ({
  data: { debts: [], installments: [], lines: [], cash: [] },
  dirty: { debts: {}, installments: {}, lines: {}, cash: {} },
  cursors: { debts: START_CURSOR, installments: START_CURSOR, lines: START_CURSOR, cash: START_CURSOR },
  rev: 0,
  cash: { income: 0, expenses: 0 },
  currency: 'PHP',
  name: '',
  settingsDirty: false,
});

const MAX_CASH = 99_999_999_999;
const cashNum = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_CASH ? v : 0);

/** Round 4: one month's income and expenses, saved as that month's row (waiting to be sent). */
export function setCashMonth(l: Local, month: string, income: number, expenses: number, nowMs: number): Local {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return l;
  const old = l.data.cash.find((r) => r.id === month);
  return putRows(l, 'cash', [{ id: month, income_centavos: cashNum(income), expenses_centavos: cashNum(expenses), created_at: old?.created_at ?? nowMs, deleted: false }]);
}

/** Every month's numbers, by month. */
export const cashByMonth = (l: Local): Record<string, { income: number; expenses: number }> =>
  Object.fromEntries(l.data.cash.filter((r) => !r.deleted).map((r) => [r.id, { income: r.income_centavos, expenses: r.expenses_centavos }]));

export const NAME_MAX = 40;
export function setNameLocal(l: Local, name: string): Local {
  const n = name.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
  return { ...l, name: n, settingsDirty: true };
}

/** After a send: forget the waiting mark only if the numbers were not changed again meanwhile. */
export function setCurrencyLocal(l: Local, code: string): Local {
  return isCurrency(code) ? { ...l, currency: code, settingsDirty: true } : l;
}

export type SettingsRow = { currency: string; name: string };

export function applySettingsPushed(l: Local, sent: SettingsRow): Local {
  return l.currency === sent.currency && l.name === sent.name ? { ...l, settingsDirty: false } : l;
}

/** Server settings come in unless the person has an unsent change. */
export function applySettingsPulled(l: Local, row: SettingsRow | null): Local {
  return row && !l.settingsDirty ? { ...l, currency: isCurrency(row.currency) ? row.currency : l.currency, name: typeof row.name === 'string' ? row.name.slice(0, NAME_MAX) : l.name } : l;
}

/** Add or replace rows by id and mark them as waiting to be sent. */
export function putRows<K extends TableKey>(l: Local, key: K, rows: Data[K]): Local {
  const incoming = new Map((rows as { id: string }[]).map((r) => [r.id, r] as const));
  const kept = (l.data[key] as { id: string }[]).filter((r) => !incoming.has(r.id));
  const rev = l.rev + 1;
  const dirty: Rev = { ...l.dirty[key] };
  for (const id of incoming.keys()) dirty[id] = rev;
  return { ...l, rev, data: { ...l.data, [key]: [...kept, ...incoming.values()] }, dirty: { ...l.dirty, [key]: dirty } };
}

export const pendingCount = (l: Local): number => TABLE_ORDER.reduce((n, k) => n + Object.keys(l.dirty[k]).length, 0) + (l.settingsDirty ? 1 : 0);

/** Rows to send for one table, with the version each had when picked. */
export function pendingRows<K extends TableKey>(l: Local, key: K): { rows: Data[K]; revs: Rev } {
  const revs = l.dirty[key];
  const rows = (l.data[key] as { id: string }[]).filter((r) => revs[r.id] !== undefined);
  return { rows: rows as Data[K], revs: { ...revs } };
}

/**
 * After a send: forget a row's waiting mark only if it has not been edited again meanwhile
 * (same version). `done` are ids the server took or will never take.
 */
export function applyPushed(l: Local, key: TableKey, sentRevs: Rev, done: string[]): Local {
  const dirty = { ...l.dirty[key] };
  for (const id of done) if (dirty[id] !== undefined && dirty[id] === sentRevs[id]) delete dirty[id];
  return { ...l, dirty: { ...l.dirty, [key]: dirty } };
}

/** Bring in server rows (unsent local edits win) and move the cursor on. */
export function applyPulled<K extends TableKey>(l: Local, key: K, rows: Data[K], cursor: Cursor): Local {
  const merged = mergePulled(l.data[key] as { id: string }[], rows as { id: string }[], new Set(Object.keys(l.dirty[key])));
  return { ...l, data: { ...l.data, [key]: merged }, cursors: { ...l.cursors, [key]: cursor } };
}

/** Make sure data read back from storage has the right shape, whatever an old version saved. */
export function reviveLocal(raw: unknown): Local {
  const base = emptyLocal();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Local>;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const obj = (v: unknown): Rev => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rev) : {});
  const cur = (v: unknown): Cursor => (v && typeof v === 'object' && typeof (v as Cursor).t === 'string' && typeof (v as Cursor).id === 'string' ? (v as Cursor) : START_CURSOR);
  const l: Local = {
    data: { debts: arr(r.data?.debts), installments: arr(r.data?.installments), lines: arr(r.data?.lines), cash: arr(r.data?.cash) },
    dirty: { debts: obj(r.dirty?.debts), installments: obj(r.dirty?.installments), lines: obj(r.dirty?.lines), cash: obj(r.dirty?.cash) },
    cursors: { debts: cur(r.cursors?.debts), installments: cur(r.cursors?.installments), lines: cur(r.cursors?.lines), cash: cur(r.cursors?.cash) },
    rev: typeof r.rev === 'number' ? r.rev : 0,
    cash: { income: cashNum(r.cash?.income), expenses: cashNum(r.cash?.expenses) },
    currency: isCurrency(r.currency) ? r.currency : 'PHP',
    name: typeof r.name === 'string' ? r.name.slice(0, NAME_MAX) : '',
    settingsDirty: r.settingsDirty === true,
  };
  // A phone saved before round 4 kept two numbers; they become this month's row (the server does the same, same id).
  if (!l.data.cash.length && (l.cash.income || l.cash.expenses)) return { ...setCashMonth(l, todayIso().slice(0, 7), l.cash.income, l.cash.expenses, Date.now()), cash: { income: 0, expenses: 0 } };
  return l;
}
