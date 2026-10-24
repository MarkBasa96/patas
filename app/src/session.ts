import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { photoRowsKey, qrRowsKey } from './keys';
import { cacheClearAll } from './qrCache';
import { turnOffHere } from './reminders';
import { supabase } from './supabase';

/** undefined = still checking the saved session, null = signed out, Session = signed in. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => alive && setSession(data.session))
      .catch(() => alive && setSession(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return session;
}

/** Sign out on this device: stop this phone's reminders first (Kenshin F8, while still signed in so
 *  the server hears it), then drop every cached QR picture and the QR/photo row lists (even if the caller
 *  forgot to; Kenshin round 4 M-1). The debts copy is the caller's call (finishLeave), as before. */
export async function signOut(): Promise<void> {
  await turnOffHere().catch(() => {});
  await cacheClearAll();
  const uid = supabase ? (await supabase.auth.getSession().catch(() => null))?.data.session?.user.id : undefined;
  if (uid) await AsyncStorage.multiRemove([qrRowsKey(uid), photoRowsKey(uid)]).catch(() => {});
  if (supabase) await supabase.auth.signOut();
}
