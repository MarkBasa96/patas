// Backup, restore, CSV and share summaries (SPEC 9). Pure: no screen, no network, so it is tested in Node.
// Rules: a backup never carries the QR fingerprint (Kenshin F7: a restored QR gets a fresh one for its new
// account); QR pictures go in only when the person ticks "include QR codes"; the share summary never has a QR.
import type { DebtView } from './derive';
import type { DebtRow, InstallmentRow, LineRow } from './ledger';
import type { Data } from './local';
import { CHARGE_KINDS } from './lines';
import { formatPesos } from './money';
import { formatLong } from './plan';
import { rowFrom } from './rows';
import { isWallet, type Wallet } from './qr';

export const BACKUP_FORMAT = 1;

export type BackupQr = { id: string; label: string; wallet: Wallet; account_name: string; png: string }; // png = base64
export type Backup = {
  app: 'patas';
  format: number;
  made_at: string;
  currency: string;
  cash: { income: number; expenses: number };
  debts: DebtRow[];
  installments: InstallmentRow[];
  lines: LineRow[];
  qrs: BackupQr[];
};

const strip = <T extends object>(r: T, keys: string[]): T => {
  const o = { ...r } as Record<string, unknown>;
  for (const k of keys) delete o[k];
  return o as T;
};

/** Live rows only (deleted ones and the rows of deleted debts stay out). Server-only fields are dropped. */
export function makeBackup(data: Data, extra: { currency: string; cash: { income: number; expenses: number }; madeAt: string; qrs?: BackupQr[] }): Backup {
  const debts = data.debts.filter((d) => !d.deleted);
  const live = new Set(debts.map((d) => d.id));
  return {
    app: 'patas',
    format: BACKUP_FORMAT,
    made_at: extra.madeAt,
    currency: extra.currency,
    cash: extra.cash,
    debts: debts.map((d) => strip(d, ['updated_at', 'qr_linked_at'])),
    installments: data.installments.filter((i) => !i.deleted && live.has(i.debt_id)).map((i) => strip(i, ['updated_at'])),
    lines: data.lines.filter((l) => !l.deleted && live.has(l.debt_id)).map((l) => strip(l, ['updated_at'])),
    qrs: extra.qrs ?? [],
  };
}

const MAX_FILE = 20 * 1024 * 1024;

/** Read a backup file. Everything inside is untrusted: rows go through the same checks as server rows. */
export function parseBackup(text: string): { backup: Backup; skipped: number } | { error: string } {
  if (text.length > MAX_FILE) return { error: 'That file is too big to be a Patas backup.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'That file is not a Patas backup.' };
  }
  const r = raw as Partial<Record<keyof Backup, unknown>>;
  if (!r || typeof r !== 'object' || r.app !== 'patas' || typeof r.format !== 'number') return { error: 'That file is not a Patas backup.' };
  if (r.format > BACKUP_FORMAT) return { error: 'This backup was made by a newer Patas. Update the app first.' };
  let skipped = 0;
  const list = <T>(v: unknown, f: (x: Record<string, unknown>) => T | null): T[] =>
    (Array.isArray(v) ? v : []).flatMap((x) => {
      const row = x && typeof x === 'object' ? f(x as Record<string, unknown>) : null;
      if (!row) skipped++;
      return row ? [row] : [];
    });
  const debts = list(r.debts, rowFrom.debts).map((d) => ({ ...d, deleted: false }));
  const ids = new Set(debts.map((d) => d.id));
  const installments = list(r.installments, rowFrom.installments).filter((i) => ids.has(i.debt_id) || (skipped++, false));
  const lines = list(r.lines, rowFrom.lines).filter((l) => ids.has(l.debt_id) || (skipped++, false));
  const qrs = list(r.qrs, (q): BackupQr | null =>
    typeof q.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(q.id) && typeof q.png === 'string' && /^[A-Za-z0-9+/=]+$/.test(q.png) && q.png.length < 400_000 && isWallet(q.wallet)
      ? { id: q.id, label: typeof q.label === 'string' ? q.label : '', wallet: q.wallet, account_name: typeof q.account_name === 'string' ? q.account_name : '', png: q.png }
      : null,
  );
  const cash = r.cash as { income?: unknown; expenses?: unknown } | undefined;
  const num = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);
  return {
    backup: {
      app: 'patas', format: r.format, made_at: typeof r.made_at === 'string' ? r.made_at : '', currency: typeof r.currency === 'string' ? r.currency : 'PHP',
      cash: { income: num(cash?.income), expenses: num(cash?.expenses) }, debts, installments, lines, qrs,
    },
    skipped,
  };
}

export type RestoreMode = 'add' | 'replace';
export type RestorePlan = { debts: DebtRow[]; installments: InstallmentRow[]; lines: LineRow[] };

/**
 * What to write. "add": only rows this account lacks (or has deleted). "replace": every backup row, and
 * everything else in the account is deleted (soft: hidden, kept on the server until the account is deleted). `qrMap` turns a backup QR id
 * into this account's QR id; a debt whose QR is not in the map (and not already here) loses the link.
 */
export function restorePlan(current: Data, b: Backup, mode: RestoreMode, qrMap: Map<string, string>, existingQrIds: Set<string>): RestorePlan {
  const fixQr = (d: DebtRow): DebtRow => {
    const q = d.qr_id ?? null;
    return { ...d, qr_id: q === null ? null : (qrMap.get(q) ?? (existingQrIds.has(q) ? q : null)) };
  };
  const pick = <T extends { id: string; deleted: boolean }>(have: T[], want: T[]): T[] => {
    const live = new Set(have.filter((x) => !x.deleted).map((x) => x.id));
    return mode === 'add' ? want.filter((x) => !live.has(x.id)) : want;
  };
  const drop = <T extends { id: string; deleted: boolean }>(have: T[], want: T[]): T[] => {
    if (mode === 'add') return [];
    const keep = new Set(want.map((x) => x.id));
    return have.filter((x) => !x.deleted && !keep.has(x.id)).map((x) => ({ ...x, deleted: true }));
  };
  return {
    debts: [...pick(current.debts, b.debts).map(fixQr), ...drop(current.debts, b.debts)],
    installments: [...pick(current.installments, b.installments), ...drop(current.installments, b.installments)],
    lines: [...pick(current.lines, b.lines), ...drop(current.lines, b.lines)],
  };
}

// ---- CSV (opens in Sheets or Excel) ----
const BOM = String.fromCharCode(0xfeff);
const NL = String.fromCharCode(13, 10);
/** One cell. Text starting with = + - @ or a tab/return would run as a formula in a spreadsheet, so it gets a ' first. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
const amount = (c: number) => (c / 100).toFixed(2);
const csv = (rows: (string | number)[][]) => BOM + rows.map((r) => r.map(csvCell).join(',')).join(NL) + NL;

const STATE: Record<DebtView['state'], string> = { settled: 'Settled', overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming', open: 'Pay when I can' };

export function debtsCsv(views: DebtView[]): string {
  const head = ['Person', 'What for', 'Type', 'Opened', 'Due date', 'Settled on', 'Total owed', 'Paid', 'Remaining', 'Overpaid', 'Status', 'Notes'];
  return csv([
    head,
    ...views.map((v) => [
      v.debt.person_name, v.debt.title, v.debt.kind === 'installments' ? 'Installments' : 'One-time', v.debt.opened_on, v.next?.date ?? v.debt.due_on ?? '',
      v.debt.settled_on ?? '', amount(v.bal.owed), amount(v.bal.paid), amount(v.bal.remaining), amount(v.bal.overpaid), STATE[v.state], v.debt.note,
    ]),
  ]);
}

const KIND: Record<LineRow['kind'], string> = { principal: 'Borrowed', addition: 'Added', charge: 'Charge', adjustment: 'Opening adjustment', payment: 'Payment', writeoff: 'Written off' };

export function linesCsv(views: DebtView[]): string {
  const head = ['Person', 'What for', 'Date', 'Kind', 'Charge type', 'Amount', 'Counts as', 'Method', 'Note'];
  const rows = views.flatMap((v) =>
    [...v.lines]
      .sort((a, b) => a.on_date.localeCompare(b.on_date) || a.created_at - b.created_at)
      .map((l) => {
        const credit = l.kind === 'payment' || l.kind === 'writeoff' || (l.kind === 'adjustment' && l.adjust_sign === -1);
        return [v.debt.person_name, v.debt.title, l.on_date, KIND[l.kind], l.charge_kind ? CHARGE_KINDS.find((c) => c.key === l.charge_kind)?.label ?? 'Charge' : '', amount(l.amount_centavos), credit ? 'Paid down' : 'Owed', l.method, l.note];
      }),
  );
  return csv([head, ...rows]);
}

// ---- Share summaries: text only, never a QR, never an account name ----
export function debtSummary(v: DebtView, today: string): string {
  const lines = [`Patas: ${v.debt.person_name}${v.debt.title ? ` (${v.debt.title})` : ''}`, `Total: ${formatPesos(v.bal.owed)}`, `Paid: ${formatPesos(v.bal.paid)}`, `Left: ${formatPesos(v.bal.remaining)}`];
  if (v.bal.overpaid > 0) lines.push(`Overpaid: ${formatPesos(v.bal.overpaid)}`);
  if (v.debt.settled_on) lines.push(`Settled on ${formatLong(v.debt.settled_on)}`);
  else if (v.next) lines.push(`Next due: ${formatPesos(v.next.amount)} on ${formatLong(v.next.date)}`);
  lines.push(`As of ${formatLong(today)}`);
  return lines.join('\n');
}

export function overallSummary(views: DebtView[], today: string): string {
  const active = views.filter((v) => v.debt.settled_on === null);
  const left = active.reduce((n, v) => n + v.bal.remaining, 0);
  const paid = views.reduce((n, v) => n + Math.min(v.bal.paid, v.bal.owed), 0);
  return [`Patas summary, ${formatLong(today)}`, `Active debts: ${active.length}`, `Still owed: ${formatPesos(left)}`, `Paid so far: ${formatPesos(paid)}`].join('\n');
}
