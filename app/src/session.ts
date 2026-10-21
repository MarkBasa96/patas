import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

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
 *  the server hears it), then drop every cached QR picture (even if the caller forgot to). */
export async function signOut(): Promise<void> {
  await turnOffHere().catch(() => {});
  await cacheClearAll();
  if (supabase) await supabase.auth.signOut();
}
