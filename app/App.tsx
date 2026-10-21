import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PinGate } from './src/MpinScreens';
import { QrProvider } from './src/qrs';
import { Shell } from './src/Shell';
import { SignIn } from './src/SignIn';
import { useSession } from './src/session';
import { SettingsProvider, useSettings } from './src/settings';
import { StoreProvider } from './src/store';

// Fonts come from assets/fonts, copied there on purpose: Vercel skips paths containing node_modules.
const FONTS = {
  Inter_400Regular: require('./assets/fonts/Inter_400Regular.ttf'),
  Inter_500Medium: require('./assets/fonts/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('./assets/fonts/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('./assets/fonts/Inter_700Bold.ttf'),
  Inter_800ExtraBold: require('./assets/fonts/Inter_800ExtraBold.ttf'),
};

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
  const [loaded, error] = useFonts(FONTS);
  const session = useSession();
  // Show the app even if a font fails: a fallback face is better than a blank screen.
  if ((!loaded && !error) || session === undefined) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {session ? (
        <StoreProvider key={session.user.id} userId={session.user.id}>
          <QrProvider userId={session.user.id}>
            <PinGate userId={session.user.id}>
              <Shell userId={session.user.id} />
            </PinGate>
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
