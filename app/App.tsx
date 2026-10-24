import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MoneyProvider } from './src/kit';
import { PinGate } from './src/MpinScreens';
import { Loading } from './src/Opening';
import { ToastProvider } from './src/motion';
import { PhotoProvider } from './src/photos';
import { QrProvider } from './src/qrs';
import { Shell } from './src/Shell';
import { SignIn } from './src/SignIn';
import { useSession } from './src/session';
import { SettingsProvider, useSettings } from './src/settings';
import { StoreProvider } from './src/store';

// Round 4: Manrope (one variable font file, public/fonts, declared in index.html as Manrope_400 ... Manrope_700, each
// face pinned to its weight). Wait for it briefly so numbers do not jump; never block the app on it.
const FACES = ['400 16px Manrope_400', '500 16px Manrope_500', '600 16px Manrope_600', '700 16px Manrope_700'];
function useFontsReady(): boolean {
  const [ready, setReady] = useState(Platform.OS !== 'web' || typeof document === 'undefined' || !document.fonts);
  useEffect(() => {
    if (ready) return;
    const done = () => setReady(true);
    const timer = setTimeout(done, 2500); // a missing font must never leave a blank screen
    void Promise.all(FACES.map((f) => document.fonts.load(f))).then(done, done);
    return () => clearTimeout(timer);
  }, [ready]);
  return ready;
}

// Offline cold start: the service worker keeps a copy of the app's own files, never data.
// Built app only, over https (or localhost for tests), never in dev.
if (
  Platform.OS === 'web' &&
  !__DEV__ &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => console.warn('Patas: offline copy not set up', e));
  });
}

function Root() {
  const { t, mode } = useSettings();
  const fontsReady = useFontsReady();
  const session = useSession();
  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (session === undefined) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {session ? (
        <StoreProvider key={session.user.id} userId={session.user.id}>
          <QrProvider userId={session.user.id}>
            <PhotoProvider userId={session.user.id}>
              <MoneyProvider>
                <ToastProvider>
                  <PinGate userId={session.user.id}>
                    <Shell userId={session.user.id} />
                  </PinGate>
                </ToastProvider>
              </MoneyProvider>
            </PhotoProvider>
          </QrProvider>
        </StoreProvider>
      ) : (
        <SignIn />
      )}
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
