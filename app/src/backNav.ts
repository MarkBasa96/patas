import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

// The phone's Back button (Joe, after v3 went live: "Back closes the app"). Patas is one page, so
// Android saw nothing to go back to. On web we keep one spare history entry: each Back pops it, we
// run the newest open handler (a sheet or pop-up closes, History/Settings go to Log), then put the
// spare entry back. With nothing open, the first Back asks, and a second within 2 s really leaves.

type Handler = { run: () => void };
const stack: Handler[] = [];
let lastRootBack = 0;
let started = false;

const web = Platform.OS === 'web' && typeof window !== 'undefined' && typeof history !== 'undefined';

function guard() {
  history.pushState({ patas: 'guard' }, '');
}

/** Call once at startup. `onAskExit` shows the "Press back again to exit" hint. */
export function startBackNav(onAskExit: () => void) {
  if (!web || started) return;
  started = true;
  history.replaceState({ patas: 'root' }, '');
  guard();
  window.addEventListener('popstate', () => {
    const top = stack[stack.length - 1];
    if (top) {
      top.run();
      guard();
      return;
    }
    if (Date.now() - lastRootBack < 2000) {
      history.back(); // past the app's first entry: the Android app closes, a browser tab goes back
      return;
    }
    lastRootBack = Date.now();
    onAskExit();
    guard();
  });
}

/** While `active`, the Back button runs `onBack` (newest registration first). */
export function useBackHandler(active: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  useEffect(() => {
    if (!web || !active) return;
    const h: Handler = { run: () => latest.current() };
    stack.push(h);
    return () => {
      const i = stack.lastIndexOf(h);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
