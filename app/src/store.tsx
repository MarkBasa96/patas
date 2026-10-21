import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { clearLocal, loadLocal, pullCash, pullTable, pushCash, pushTable, saveLocal } from './cloud';
import { liveViews, type DebtView } from './derive';
import { editDebt } from './edit';
import { newId } from './ids';
import { buildDebt, type DebtForm, type DebtRow, type LineRow } from './ledger';
import { autoSettled, buildLine, reopen, settle, type LineForm } from './lines';
import type { RestorePlan } from './exportData';
import { applyCashPulled, applyCashPushed, applyPulled, applyPushed, emptyLocal, pendingCount, pendingRows, putRows, setCash, setCurrencyLocal, TABLE_ORDER, type Data, type Local } from './local';
import { setCurrency } from './money';
import { todayIso } from './plan';
import { OfflineError } from './syncCore';

export type SyncStatus = 'loading' | 'synced' | 'syncing' | 'offline';

type Store = {
  views: DebtView[];
  status: SyncStatus;
  pending: number;
  refused: number;
  saveNew: (f: DebtForm) => string;
  saveEdit: (id: string, f: DebtForm) => string | null; // null = saved, otherwise a message to show
  remove: (id: string) => void;
  /** Add (or, with `existing`, replace) a payment or charge. */
  saveLine: (kind: 'payment' | 'charge', debtId: string, f: LineForm, existing?: LineRow) => void;
  deleteLine: (lineId: string) => void;
  settleDebt: (debtId: string, writeOff: boolean) => void;
  reopenDebt: (debtId: string) => void;
  cash: { income: number; expenses: number };
  currency: string;
  saveCash: (income: number, expenses: number) => void;
  saveCurrency: (code: string) => void;
  /** Point this person's active debts at a QR (and unpoint any other debt using it). person null = link to nobody. */
  linkQr: (qrId: string, person: string | null) => void;
  /** After a QR is replaced: every debt that used the old one uses the new one. */
  moveQrLinks: (fromId: string, toId: string) => void;
  debtsUsingQr: (qrId: string) => DebtView[];
  /** The rows on this phone right now (for a backup). */
  snapshot: () => Data;
  /** Write a restore plan (rows marked waiting to sync) and, optionally, the backup's cash-flow numbers. */
  restore: (plan: RestorePlan, cash?: { income: number; expenses: number }) => void;
  syncNow: () => Promise<void>;
  /** Sign out step 1: one last upload attempt. Returns how many changes still have not reached the cloud. */
  prepareLeave: () => Promise<number>;
  /** Sign out step 2: forget this account's data on this phone. */
  finishLeave: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [local, setLocalState] = useState<Local>(emptyLocal());
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [refused, setRefused] = useState(0);
  const ref = useRef<Local>(local);
  const busy = useRef(false);
  const alive = useRef(true);

  const commit = useCallback(
    (next: Local) => {
      ref.current = next;
      setLocalState(next);
      void saveLocal(userId, next);
    },
    [userId],
  );

  const syncNow = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus('syncing');
    try {
      for (const k of TABLE_ORDER) {
        const { rows, revs } = pendingRows(ref.current, k);
        if (!rows.length) continue;
        const { done, rejected } = await pushTable(userId, k, rows);
        if (rejected.length) setRefused((n) => n + rejected.length);
        commit(applyPushed(ref.current, k, revs, done));
      }
      if (ref.current.settingsDirty) {
        const sent = { ...ref.current.cash, currency: ref.current.currency };
        await pushCash(userId, sent);
        commit(applyCashPushed(ref.current, sent));
      }
      for (const k of TABLE_ORDER) {
        const { rows, cursor } = await pullTable(k, ref.current.cursors[k]);
        commit(applyPulled(ref.current, k, rows, cursor));
      }
      commit(applyCashPulled(ref.current, await pullCash()));
      if (alive.current) setStatus('synced');
    } catch (e) {
      if (alive.current) setStatus(e instanceof OfflineError ? 'offline' : 'offline');
    } finally {
      busy.current = false;
    }
  }, [userId, commit]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void loadLocal(userId).then((l) => {
      if (cancelled) return;
      ref.current = l;
      setLocalState(l);
      void syncNow();
    });
    const onOnline = () => void syncNow();
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      alive.current = false;
      if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('online', onOnline);
    };
  }, [userId, syncNow]);

  setCurrency(local.currency); // display only; formatPesos reads it
  const views = useMemo(() => liveViews(local.data.debts, local.data.installments, local.data.lines, todayIso()), [local]);

  const saveNew = useCallback(
    (f: DebtForm): string => {
      const made = buildDebt(f, { debt: newId(), child: newId }, Date.now(), todayIso());
      let l = putRows(ref.current, 'debts', [made.debt]);
      l = putRows(l, 'installments', made.installments);
      l = putRows(l, 'lines', made.lines);
      commit(l);
      void syncNow();
      return made.debt.id;
    },
    [commit, syncNow],
  );

  const saveEdit = useCallback(
    (id: string, f: DebtForm): string | null => {
      const v = liveViews(ref.current.data.debts, ref.current.data.installments, ref.current.data.lines, todayIso()).find((x) => x.debt.id === id);
      if (!v) return 'That debt no longer exists.';
      const r = editDebt(v, f, newId, Date.now(), todayIso());
      if ('error' in r) return r.error;
      let l = putRows(ref.current, 'debts', [r.debt]);
      if (r.installments.length) l = putRows(l, 'installments', r.installments);
      if (r.lines.length) l = putRows(l, 'lines', r.lines);
      commit(l);
      void syncNow();
      return null;
    },
    [commit, syncNow],
  );

  const remove = useCallback(
    (id: string) => {
      const d = ref.current.data.debts.find((x) => x.id === id);
      if (!d) return;
      commit(putRows(ref.current, 'debts', [{ ...d, deleted: true }]));
      void syncNow();
    },
    [commit, syncNow],
  );

  const viewOf = useCallback((id: string) => liveViews(ref.current.data.debts, ref.current.data.installments, ref.current.data.lines, todayIso()).find((x) => x.debt.id === id), []);

  const saveLine = useCallback(
    (kind: 'payment' | 'charge', debtId: string, f: LineForm, existing?: LineRow) => {
      let l = putRows(ref.current, 'lines', [buildLine(kind, f, debtId, newId(), Date.now(), existing)]);
      const v = liveViews(l.data.debts, l.data.installments, l.data.lines, todayIso()).find((x) => x.debt.id === debtId);
      const done = v ? autoSettled(v, todayIso()) : null;
      if (done && kind === 'payment') l = putRows(l, 'debts', [done]);
      commit(l);
      void syncNow();
    },
    [commit, syncNow],
  );

  const deleteLine = useCallback(
    (lineId: string) => {
      const l = ref.current.data.lines.find((x) => x.id === lineId);
      if (!l) return;
      commit(putRows(ref.current, 'lines', [{ ...l, deleted: true }]));
      void syncNow();
    },
    [commit, syncNow],
  );

  const settleDebt = useCallback(
    (debtId: string, writeOff: boolean) => {
      const v = viewOf(debtId);
      if (!v) return;
      const r = settle(v, todayIso(), writeOff, newId, Date.now());
      let l = putRows(ref.current, 'debts', [r.debt]);
      if (r.lines.length) l = putRows(l, 'lines', r.lines);
      commit(l);
      void syncNow();
    },
    [commit, syncNow, viewOf],
  );

  const reopenDebt = useCallback(
    (debtId: string) => {
      const v = viewOf(debtId);
      if (!v) return;
      const r = reopen(v);
      let l = putRows(ref.current, 'debts', [r.debt]);
      if (r.lines.length) l = putRows(l, 'lines', r.lines);
      commit(l);
      void syncNow();
    },
    [commit, syncNow, viewOf],
  );

  const saveCurrency = useCallback(
    (code: string) => {
      commit(setCurrencyLocal(ref.current, code));
      void syncNow();
    },
    [commit, syncNow],
  );

  const saveCash = useCallback(
    (income: number, expenses: number) => {
      commit(setCash(ref.current, income, expenses));
      void syncNow();
    },
    [commit, syncNow],
  );

  const linkQr = useCallback(
    (qrId: string, person: string | null) => {
      const changed = ref.current.data.debts
        .filter((d) => !d.deleted)
        .flatMap((d): DebtRow[] => {
          const want = person !== null && d.person_name === person && d.settled_on === null;
          if (want && d.qr_id !== qrId) return [{ ...d, qr_id: qrId }];
          if (!want && d.qr_id === qrId) return [{ ...d, qr_id: null }];
          return [];
        });
      if (!changed.length) return;
      commit(putRows(ref.current, 'debts', changed));
      void syncNow();
    },
    [commit, syncNow],
  );

  const moveQrLinks = useCallback(
    (fromId: string, toId: string) => {
      const changed = ref.current.data.debts.filter((d) => !d.deleted && d.qr_id === fromId).map((d) => ({ ...d, qr_id: toId }));
      if (!changed.length) return;
      commit(putRows(ref.current, 'debts', changed));
      void syncNow();
    },
    [commit, syncNow],
  );

  const debtsUsingQr = useCallback((qrId: string) => views.filter((v) => v.debt.qr_id === qrId), [views]);

  const snapshot = useCallback(() => ref.current.data, []);

  const restore = useCallback(
    (plan: RestorePlan, cash?: { income: number; expenses: number }) => {
      let l = ref.current;
      if (plan.debts.length) l = putRows(l, 'debts', plan.debts); // parents first
      if (plan.installments.length) l = putRows(l, 'installments', plan.installments);
      if (plan.lines.length) l = putRows(l, 'lines', plan.lines);
      if (cash) l = setCash(l, cash.income, cash.expenses);
      commit(l);
      void syncNow();
    },
    [commit, syncNow],
  );

  const prepareLeave = useCallback(async (): Promise<number> => {
    await syncNow();
    return pendingCount(ref.current);
  }, [syncNow]);

  const finishLeave = useCallback(async (): Promise<void> => {
    await clearLocal(userId);
  }, [userId]);

  const value = useMemo<Store>(
    () => ({ views, status, pending: pendingCount(local), refused, cash: local.cash, currency: local.currency, saveCash, saveCurrency, linkQr, moveQrLinks, debtsUsingQr, snapshot, restore, saveNew, saveEdit, remove, saveLine, deleteLine, settleDebt, reopenDebt, syncNow, prepareLeave, finishLeave }),
    [views, status, local, refused, saveCash, saveCurrency, linkQr, moveQrLinks, debtsUsingQr, snapshot, restore, saveNew, saveEdit, remove, saveLine, deleteLine, settleDebt, reopenDebt, syncNow, prepareLeave, finishLeave],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore must be used inside StoreProvider');
  return c;
}
