import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Both values are public by design: they ship inside the app. Row Level Security protects the data.
// The service_role key must never appear anywhere in this app.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function noStoreForFiles(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return fetch(input, href.includes('/storage/v1/') ? { ...init, cache: 'no-store' } : init);
}

export const supabase =
  url && key
    ? createClient(url, key, {
        auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        // QR pictures must never sit in the browser's HTTP cache, where signing out can't clear them (Kenshin F9).
        global: { fetch: noStoreForFiles },
      })
    : null;
