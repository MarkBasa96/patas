// Round 4 opening, like Gastos (approved mockup v5-v7): a white loading screen with the small mascot riding a ring
// with a ₱ coin, then the violet lock screens (centred, frosted card, faint wallet pattern, a keypad whose erase key
// has no circle). Only the look; the MPIN rules live in MpinScreens.tsx / mpinLogic.ts and are unchanged.
import React, { createElement, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icons';
import { Press } from './motion';

const SMALL = require('../assets/brand/patas-mono-small.png');
const SMALL_VIOLET = require('../assets/brand/patas-mono-small-violet.png');
const VIOLET = '#5946E7';

/** The mascot beside the word "Patas" (Manrope), white on violet or violet on white. */
export function Lockup({ white, width = 210 }: { white?: boolean; width?: number }) {
  return (
    <View accessibilityRole="image" accessibilityLabel="Patas" style={[s.lockup, { gap: width * 0.07 }]}>
      <Image source={white ? SMALL : SMALL_VIOLET} style={{ width: width * 0.27, height: width * 0.27 }} resizeMode="contain" />
      <Text style={{ fontFamily: 'Manrope_700', fontSize: width * 0.2, letterSpacing: -0.5, color: white ? '#FFFFFF' : VIOLET }}>Patas</Text>
    </View>
  );
}

/** White loading screen: the lockup, then the mascot riding a ring with a ₱ coin. */
export function Loading() {
  return (
    <View style={s.loading} accessibilityRole="progressbar" accessibilityLabel="Opening Patas">
      <Lockup width={210} />
      <View style={s.spinner} aria-hidden>
        <View style={[s.ring, { borderColor: '#ECE9FC' }]} />
        <View style={StyleSheet.absoluteFill} {...({ dataSet: { anim: 'spin' } } as object)}>
          <View style={s.rider}>
            <Image source={SMALL_VIOLET} style={{ width: 26, height: 26 }} resizeMode="contain" />
            <View style={s.coin}><Text style={s.coinText}>₱</Text></View>
          </View>
        </View>
      </View>
    </View>
  );
}

/** The violet backdrop with the faint pattern of small tilted wallets. */
export function LockBackdrop({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const wallet = (x: number, y: number, r: number) =>
    `<g transform="translate(${x} ${y}) rotate(${r})" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-11 -6h18a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-18a3 3 0 0 1-3-3v-12a3 3 0 0 1 3-3z"/><path d="M10 1h-6a2.5 2.5 0 0 0 0 5h6"/><path d="M-11 -6l13-5 3 5"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112">${wallet(28, 30, -12)}${wallet(84, 86, 10)}</svg>`;
  const web = Platform.OS === 'web';
  return (
    <View style={[s.lock, { paddingTop: insets.top + 56, paddingBottom: Math.max(insets.bottom, 16) }]}>
      {web
        ? createElement('div', {
            'aria-hidden': true,
            style: {
              position: 'absolute', inset: 0,
              // never lighter than the icon violet behind white text (measured in the mockup: worst 4.65:1)
              background: `url("data:image/svg+xml,${encodeURIComponent(svg)}"), radial-gradient(130% 75% at 50% 0%, ${VIOLET} 45%, #4634C8)`,
            },
          })
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: VIOLET }]} />}
      {children}
    </View>
  );
}

/** Four dots and a 3 x 4 keypad. Calls onDone with the four digits; a new `problem` clears and shakes. */
export function Keypad({ title, body, problem, busy, onDone }: { title: string; body?: string; problem?: string | null; busy?: boolean; onDone: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  const [seen, setSeen] = useState(problem);
  const [shake, setShake] = useState(0);
  if (problem !== seen) {
    setSeen(problem);
    if (problem) { setPin(''); setShake((n) => n + 1); }
  }
  const press = (k: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) onDone(next);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={{ alignItems: 'center' }}>
      <Text accessibilityRole="header" style={s.gtitle}>{title}</Text>
      {body ? <Text style={s.gbody}>{body}</Text> : null}
      <View key={shake} accessibilityLabel={`${pin.length} of 4 digits`} style={s.pdots} {...({ dataSet: { anim: shake ? 'shake' : undefined } } as object)}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={[s.pdot, i < pin.length && { backgroundColor: '#FFFFFF' }]} />)}
      </View>
      <Text accessibilityLiveRegion="polite" style={s.pmsg}>{problem ?? ' '}</Text>
      <View style={s.keypad}>
        {keys.map((k, i) =>
          k === '' ? <View key={i} style={s.keyGap} /> : k === 'del' ? (
            <Press key={i} accessibilityRole="button" accessibilityLabel="Delete" onPress={() => setPin((p) => p.slice(0, -1))} style={[s.key, s.keyDel]}>
              <Icon name="back" size={26} color="#FFFFFF" />
            </Press>
          ) : (
            <Press key={i} accessibilityRole="button" accessibilityLabel={k} onPress={() => press(k)} style={[s.key, s.keyGlass]} {...({ dataSet: { glass: 'lock', press: '1' } } as object)}>
              <Text style={s.keyText}>{k}</Text>
            </Press>
          ),
        )}
      </View>
    </View>
  );
}

/** The square frosted "MPIN Login" card. */
export function MpinCard({ onPress }: { onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel="MPIN Login" onPress={onPress} style={s.card} {...({ dataSet: { glass: 'lock', press: '1' } } as object)}>
      <View style={s.kdots}>{Array.from({ length: 9 }, (_, i) => <View key={i} style={s.kdot} />)}</View>
      <Text style={s.cardText}>MPIN Login</Text>
    </Press>
  );
}

export const lockStyles = StyleSheet.create({
  pill: { marginTop: 34, paddingHorizontal: 18, minHeight: 48, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillText: { fontFamily: 'Manrope_600', fontSize: 16, color: '#FFFFFF' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 24, flexWrap: 'wrap' },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontFamily: 'Manrope_600', fontSize: 15, color: '#FFFFFF' },
  ver: { fontFamily: 'Manrope_500', fontSize: 12, color: 'rgba(255,255,255,0.78)', textAlign: 'center', marginTop: 6 },
  panel: { width: '100%', maxWidth: 360, borderRadius: 24, padding: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)' },
  panelTitle: { fontFamily: 'Manrope_700', fontSize: 20, color: '#FFFFFF', textAlign: 'center' },
  panelBody: { fontFamily: 'Manrope_400', fontSize: 15, lineHeight: 22, color: '#FFFFFF', textAlign: 'center', marginTop: 8, marginBottom: 16 },
});

const s = StyleSheet.create({
  lockup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loading: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 40 },
  spinner: { width: 88, height: 88 },
  ring: { position: 'absolute', left: 10, top: 10, width: 68, height: 68, borderRadius: 34, borderWidth: 4 },
  rider: { position: 'absolute', left: 31, top: -2, width: 26, height: 26 },
  coin: { position: 'absolute', right: -10, top: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#F2B53A', alignItems: 'center', justifyContent: 'center' },
  coinText: { fontFamily: 'Manrope_700', fontSize: 10, color: '#5A3B00' },
  lock: { flex: 1, alignItems: 'center', paddingHorizontal: 16, overflow: 'hidden' },
  gtitle: { fontFamily: 'Manrope_700', fontSize: 22, color: '#FFFFFF', marginTop: 30, textAlign: 'center' },
  gbody: { fontFamily: 'Manrope_500', fontSize: 15, color: '#FFFFFF', marginTop: 6, textAlign: 'center', maxWidth: 300 },
  pdots: { flexDirection: 'row', gap: 18, marginTop: 26, marginBottom: 12 },
  pdot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  pmsg: { fontFamily: 'Manrope_600', fontSize: 14, color: '#FFFFFF', minHeight: 20, textAlign: 'center', maxWidth: 300 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 76 + 2 * 26, columnGap: 26, rowGap: 14, marginTop: 18 },
  keyGap: { width: 76, height: 76 },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  keyGlass: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  keyDel: { backgroundColor: 'transparent' },
  keyText: { fontFamily: 'Manrope_600', fontSize: 28, color: '#FFFFFF' },
  card: { width: 196, height: 196, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', alignItems: 'center', justifyContent: 'center', gap: 16 },
  kdots: { width: 62, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kdot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF' },
  cardText: { fontFamily: 'Manrope_600', fontSize: 16, color: '#FFFFFF' },
});
