// The copy of your data that lives on the phone. Pure state changes only (no storage, no network), so
// they can be tested. Saves land here first; "dirty" remembers what still has to reach the cloud.
import type { DebtRow, InstallmentRow, LineRow } from './ledger';
import { START_CURSOR, mergePulled, type Cursor } from './merge';
import { isCurrency } from './money';

export type TableKey = 'debts' | 'installments' | 'lines';
export const TABLE_ORDER: TableKey[] = ['debts', 'installments', 'lines']; // parents first: children point at debts

export type Data = { debts: DebtRow[]; installments: InstallmentRow[]; lines: LineRow[] };
type Rev = Record<string, number>; // row id -> the version of the local change still waiting to be sent

export type Local = {
  data: Data;
  dirty: Record<TableKey, Rev>;
  cursors: Record<TableKey, Cursor>;
  rev: number;
  /** Home's "Monthly cash flow": two numbers the person types (centavos). `settingsDirty` = settings not yet in the cloud. */
  cash: { income: number; expenses: number };
  /** Display currency (one per account, no conversion). */
  currency: string;
  settingsDirty: boolean;
};

export const emptyLocal = (): Local => ({
  data: { debts: [], installments: [], lines: [] },
  dirty: { debts: {}, installments: {}, lines: {} },
  cursors: { debts: START_CURSOR, installments: START_CURSOR, lines: START_CURSOR },
  rev: 0,
  cash: { income: 0, expenses: 0 },
  currency: 'PHP',
  settingsDirty: false,
});

const MAX_CASH = 99_999_999_999;
const cashNum = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_CASH ? v : 0);

export function setCash(l: Local, income: number, expenses: number): Local {
  return { ...l, cash: { income: cashNum(income), expenses: cashNum(expenses) }, settingsDirty: true };
}

/** After a send: forget the waiting mark only if the numbers were not changed again meanwhile. */
export function setCurrencyLocal(l: Local, code: string): Local {
  return isCurrency(code) ? { ...l, currency: code, settingsDirty: true } : l;
}

export type SettingsRow = { income: number; expenses: number; currency: string };

export function applyCashPushed(l: Local, sent: SettingsRow): Local {
  return l.cash.income === sent.income && l.cash.expenses === sent.expenses && l.currency === sent.currency ? { ...l, settingsDirty: false } : l;
}

/** Server numbers come in unless the person has an unsent change. */
export function applyCashPulled(l: Local, row: SettingsRow | null): Local {
  return row && !l.settingsDirty ? { ...l, cash: { income: cashNum(row.income), expenses: cashNum(row.expenses) }, currency: isCurrency(row.currency) ? row.currency : l.currency } : l;
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
  return {
    data: { debts: arr(r.data?.debts), installments: arr(r.data?.installments), lines: arr(r.data?.lines) },
    dirty: { debts: obj(r.dirty?.debts), installments: obj(r.dirty?.installments), lines: obj(r.dirty?.lines) },
    cursors: { debts: cur(r.cursors?.debts), installments: cur(r.cursors?.installments), lines: cur(r.cursors?.lines) },
    rev: typeof r.rev === 'number' ? r.rev : 0,
    cash: { income: cashNum(r.cash?.income), expenses: cashNum(r.cash?.expenses) },
    currency: isCurrency(r.currency) ? r.currency : 'PHP',
    settingsDirty: r.settingsDirty === true,
  };
}
