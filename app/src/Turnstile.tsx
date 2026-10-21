import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, View } from 'react-native';

// Cloudflare Turnstile bot check for "send me a code" (Supabase enforces it on /otp only; verifying the
// code and refreshing a session are exempt). Web only for now. The site key is public by design;
// the secret lives only in Supabase.
export const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';
export const turnstileEnabled = Platform.OS === 'web' && TURNSTILE_SITE_KEY.length > 0;

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
const api = (): TurnstileApi | undefined => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (api()) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error('turnstile script failed'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export type TurnstileHandle = { reset: () => void };

/** Renders the check; calls onToken(token) when passed, onToken(null) when it expires or fails. */
export const Turnstile = forwardRef<TurnstileHandle, { onToken: (t: string | null) => void; dark: boolean }>(function Turnstile(
  { onToken, dark },
  ref,
) {
  const box = useRef<View>(null);
  const id = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      cb.current(null);
      const t = api();
      if (id.current && t) t.reset(id.current);
    },
  }));

  useEffect(() => {
    if (!turnstileEnabled) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        const el = box.current as unknown as HTMLElement | null;
        const t = api();
        if (cancelled || !el || !t) return;
        id.current = t.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: dark ? 'dark' : 'light',
          size: 'flexible',
          callback: (tok: string) => cb.current(tok),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      cancelled = true;
      const t = api();
      if (id.current && t) t.remove(id.current);
      id.current = null;
    };
  }, [dark]);

  if (!turnstileEnabled) return null;
  return <View ref={box} style={{ marginTop: 16, minHeight: 65 }} accessibilityLabel="Security check" />;
});
