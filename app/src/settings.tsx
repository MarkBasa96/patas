import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { DEFAULT_THEME, isThemeKey, tokens, type Mode, type ThemeKey, type Tokens } from './theme';

export type ModeSetting = 'system' | Mode;

type Ctx = { theme: ThemeKey; modeSetting: ModeSetting; mode: Mode; t: Tokens; setTheme: (k: ThemeKey) => void; setModeSetting: (m: ModeSetting) => void };

const KEY = 'patas.appearance.v1';
const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [theme, setThemeState] = useState<ThemeKey>(DEFAULT_THEME);
  const [modeSetting, setModeState] = useState<ModeSetting>('system');

  // Appearance only. Never money, never anything private. Storage can be missing or blocked, so every call is guarded.
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const v = JSON.parse(raw) as { theme?: unknown; mode?: unknown };
        if (isThemeKey(v.theme)) setThemeState(v.theme);
        if (v.mode === 'system' || v.mode === 'light' || v.mode === 'dark') setModeState(v.mode);
      })
      .catch(() => {});
  }, []);

  const save = useCallback((th: ThemeKey, m: ModeSetting) => {
    AsyncStorage.setItem(KEY, JSON.stringify({ theme: th, mode: m })).catch(() => {});
  }, []);

  const setTheme = useCallback((k: ThemeKey) => { setThemeState(k); save(k, modeSetting); }, [modeSetting, save]);
  const setModeSetting = useCallback((m: ModeSetting) => { setModeState(m); save(theme, m); }, [theme, save]);

  const mode: Mode = modeSetting === 'system' ? (system === 'dark' ? 'dark' : 'light') : modeSetting;
  const value = useMemo(() => ({ theme, modeSetting, mode, t: tokens(theme, mode), setTheme, setModeSetting }), [theme, modeSetting, mode, setTheme, setModeSetting]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error('useSettings must be used inside SettingsProvider');
  return c;
}
