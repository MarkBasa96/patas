// Storage on the phone and the trip to Supabase. Everything that touches the network is here.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { afterCursorFilter, int, str, type Cursor } from './merge';
import { emptyLocal, reviveLocal, type Data, type Local, type TableKey } from './local';
import { cacheClearAll } from './qrCache';
import { qrRowsKey } from './qrs';
import { rowFrom } from './rows';
import { supabase } from './supabase';
import { OfflineError, pushWithFallback, type DbError } from './syncCore';

const key = (uid: string) => `patas.v1.${uid}`;

export async function loadLocal(uid: string): Promise<Local> {
  try {
    const raw = await AsyncStorage.getItem(key(uid));
    return raw ? reviveLocal(JSON.parse(raw)) : emptyLocal();
  } catch {
    return emptyLocal();
  }
}
export async function saveLocal(uid: string, l: Local): Promise<void> {
  try {
    await AsyncStorage.setItem(key(uid), JSON.stringify(l));
  } catch {
    /* storage full or blocked: the in-memory copy still works this session */
  }
}
export async function clearLocal(uid: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([key(uid), qrRowsKey(uid)]);
  } catch {
    /* nothing to do */
  }
  await cacheClearAll(); // QR pictures: SPEC 7, cleared on sign-out and account deletion
}

const TABLE_NAME: Record<TableKey, string> = { debts: 'debts', installments: 'installments', lines: 'debt_lines' };


/** Send one table's waiting rows. `done` = taken by the server or refused for good (bad data). */
export async function pushTable(uid: string, k: TableKey, rows: Data[TableKey]): Promise<{ done: string[]; rejected: string[] }> {
  if (!supabase) throw new OfflineError('no server settings');
  const client = supabase;
  const wire = (rows as { id: string }[]).map((r): { id: string; user_id: string } & Record<string, unknown> => {
    const rest: Record<string, unknown> = { ...r };
    delete rest.updated_at; // the server sets updated_at itself
    delete rest.qr_linked_at; // ...and qr_linked_at
    return { ...rest, id: r.id, user_id: uid };
  });
  const { sent, rejected } = await pushWithFallback(wire, async (batch): Promise<DbError> => {
    const { error } = await client.from(TABLE_NAME[k]).upsert(batch, { onConflict: 'user_id,id' });
    return error ? { code: error.code, message: error.message } : null;
  });
  return { done: [...sent, ...rejected], rejected };
}

/** Everything on the server changed after the cursor, oldest first. */
export async function pullTable<K extends TableKey>(k: K, from: Cursor): Promise<{ rows: Data[K]; cursor: Cursor }> {
  if (!supabase) throw new OfflineError('no server settings');
  const out: Data[K][number][] = [];
  let cursor = from;
  for (;;) {
    const { data, error } = await supabase
      .from(TABLE_NAME[k])
      .select('*')
      .or(afterCursorFilter(cursor))
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1000);
    if (error) throw new OfflineError(error.message);
    if (!data.length) break;
    for (const raw of data as Record<string, unknown>[]) {
      const row = rowFrom[k](raw);
      if (row) out.push(row);
    }
    const last = data[data.length - 1] as Record<string, unknown>;
    cursor = { t: str(last.updated_at, cursor.t), id: str(last.id, cursor.id) };
    if (data.length < 1000) break;
  }
  return { rows: out as Data[K], cursor };
}

// ---- Home's two typed cash-flow numbers live in the account's settings row ----
export async function pushCash(uid: string, cash: { income: number; expenses: number; currency: string }): Promise<void> {
  if (!supabase) throw new OfflineError('no server settings');
  const { error } = await supabase.from('user_settings').upsert({ user_id: uid, cashflow_income_centavos: cash.income, cashflow_expenses_centavos: cash.expenses, currency: cash.currency }, { onConflict: 'user_id' });
  if (error) throw new OfflineError(error.message);
}

export async function pullCash(): Promise<{ income: number; expenses: number; currency: string } | null> {
  if (!supabase) throw new OfflineError('no server settings');
  const { data, error } = await supabase.from('user_settings').select('cashflow_income_centavos,cashflow_expenses_centavos,currency').limit(1);
  if (error) throw new OfflineError(error.message);
  const r = data[0] as Record<string, unknown> | undefined;
  return r ? { income: int(r.cashflow_income_centavos), expenses: int(r.cashflow_expenses_centavos), currency: str(r.currency, 'PHP') } : null;
}
