import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CURRENCIES } from './money';
import { clearLocal } from './cloud';
import { signOut } from './session';
import { useSettings, type ModeSetting } from './settings';
import { DataSection } from './DataSection';
import { MpinSection } from './MpinScreens';
import { RemindersSection } from './RemindersSection';
import { useQrs } from './qrs';
import { useStore } from './store';
import { supabase } from './supabase';
import { THEME_ORDER, THEMES } from './theme';
import { Banner, Button, Chip, Confirm } from './ui';

const MODES: { key: ModeSetting; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

// Approved by Joe 2026-10-17 (docs/SECURITY_DESIGN.md); contact and full-notice link filled in at go-live (2026-10-21).
const PRIVACY =
  'Your debts and saved QR codes are private: other Patas users can’t see them. I run this server and can technically access what is stored. I don’t browse it; I would only look to fix a problem you report or where the law requires. It is never sold or used for ads. It is stored by Supabase (database and files) and served by Vercel; reminders reach your phone through its push service (Google, Apple, Mozilla or Microsoft), encrypted. A QR you save contains the account or mobile number of the person you pay, inside the picture. You are recording other people’s details for your own use, so keep to what you need. Deleted items disappear from your lists at once and stay hidden on the server until you delete your account; “Delete my account” removes all your data and QR files. A copy of a QR you save or share is outside Patas. Contact: joemarkudemy@gmail.com. You can also complain to the National Privacy Commission. Full notice: github.com/MarkBasa96/patas#privacy';

export function SettingsScreen({ userId, onOpenQr }: { userId: string; onOpenQr: () => void }) {
  const { t, theme, setTheme, modeSetting, setModeSetting } = useSettings();
  const { currency, saveCurrency, prepareLeave, finishLeave } = useStore();
  const { qrs } = useQrs();
  const [lost, setLost] = useState(0);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function leaveNow() {
    await finishLeave();
    await signOut();
  }
  async function tryLeave() {
    const n = await prepareLeave(); // one last upload attempt
    if (n > 0) setLost(n);
    else await leaveNow();
  }

  async function deleteAccount() {
    if (!supabase || typed !== 'DELETE') return;
    setBusy(true);
    setProblem(null);
    const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
    if (error) {
      let code = '';
      try {
        const ctx = (error as { context?: Response }).context;
        code = ctx ? String(((await ctx.json()) as { error?: unknown }).error ?? '') : '';
      } catch {
        /* keep the generic message */
      }
      setBusy(false);
      setProblem(
        code === 'recent_login_required'
          ? 'For your safety, deleting needs a sign-in from the last 10 minutes. Sign out, sign in again with a fresh code, then delete.'
          : 'Could not delete the account. Check your internet and try again. Nothing was deleted.',
      );
      return;
    }
    await clearLocal(userId);
    await signOut();
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
      <Text style={[s.h1, { color: t.text }]}>Settings</Text>

      <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[s.h2, { color: t.text }]}>Appearance</Text>
        <View style={s.row}>
          {MODES.map((m) => (
            <Chip key={m.key} label={m.label} on={modeSetting === m.key} onPress={() => setModeSetting(m.key)} />
          ))}
        </View>
        <View style={[s.row, { marginTop: 14, gap: 4 }]}>
          {THEME_ORDER.map((k) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={THEMES[k].name} accessibilityState={{ selected: theme === k }} onPress={() => setTheme(k)} style={[s.swatch, { backgroundColor: THEMES[k].l.accent, borderColor: theme === k ? t.text : 'transparent' }]} />
          ))}
        </View>
      </View>

      <Pressable accessibilityRole="button" onPress={onOpenQr} style={[s.card, s.between, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View>
          <Text style={[s.h2, { color: t.text, marginBottom: 2 }]}>Payment QR gallery</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: t.muted }}>{qrs.length} saved</Text>
        </View>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: t.muted }}>›</Text>
      </Pressable>

      <RemindersSection userId={userId} />

      <MpinSection userId={userId} />

      <DataSection />

      <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[s.h2, { color: t.text }]}>Currency</Text>
        <Text style={[s.note, { color: t.muted }]}>Only changes the symbol you see. Patas does not convert money.</Text>
        <View style={s.row}>
          {Object.entries(CURRENCIES).map(([code, c]) => (
            <Chip key={code} label={`${c.symbol} ${code}`} on={currency === code} onPress={() => saveCurrency(code)} />
          ))}
        </View>
      </View>

      <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPrivacy }} onPress={() => setShowPrivacy((v) => !v)} style={s.between}>
          <Text style={[s.h2, { color: t.text, marginBottom: 0 }]}>Privacy note</Text>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: t.accent }}>{showPrivacy ? 'Hide' : 'Read'}</Text>
        </Pressable>
        {showPrivacy ? <Text style={[s.note, { color: t.text, marginTop: 10, marginBottom: 0, lineHeight: 21 }]}>{PRIVACY}</Text> : null}
      </View>

      <View style={{ marginTop: 6, gap: 10 }}>
        <Button label="Sign out" kind="outline" onPress={() => { void tryLeave(); }} />
        <Button label="Delete my account" kind="danger" onPress={() => { setTyped(''); setProblem(null); setDeleting(true); }} />
      </View>
      <Text style={[s.note, { color: t.muted, marginTop: 16, textAlign: 'center', marginBottom: 0 }]}>Patas 1.0{typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BUILD ? ` (build ${process.env.EXPO_PUBLIC_BUILD})` : ''}</Text>
      <Text style={[s.note, { color: t.muted, textAlign: 'center' }]}>Made by Joemark Basa</Text>

      <Confirm
        visible={lost > 0}
        title="Sign out anyway?"
        body={`${lost} change${lost === 1 ? ' has' : 's have'} not reached the cloud yet (you are probably offline). Signing out now would lose ${lost === 1 ? 'it' : 'them'}.`}
        confirmLabel="Sign out and lose them"
        onCancel={() => setLost(0)}
        onConfirm={() => { setLost(0); void leaveNow(); }}
      />

      <Modal visible={deleting} transparent animationType="fade" onRequestClose={() => setDeleting(false)}>
        <View style={s.scrim}>
          <View accessibilityRole="alert" style={[s.dialog, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: t.text }}>Delete your account?</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21, color: t.muted, marginTop: 8 }}>
              This permanently removes all your debts, payments and saved QR codes from the server and from this phone. It cannot be undone. Type DELETE to confirm.
            </Text>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Type DELETE to confirm"
              placeholder="DELETE"
              placeholderTextColor={t.muted}
              style={[s.input, { backgroundColor: t.field, borderColor: t.border, color: t.text }]}
            />
            {problem ? <View style={{ marginTop: 12 }}><Banner tone="warn" text={problem} /></View> : null}
            <View style={{ gap: 10, marginTop: 14 }}>
              <Button label="Delete everything" kind="danger" disabled={typed !== 'DELETE'} busy={busy} onPress={() => { void deleteAccount(); }} />
              <Button label="Cancel" kind="outline" onPress={() => setDeleting(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  h1: { fontFamily: 'Inter_800ExtraBold', fontSize: 26, letterSpacing: -0.3, marginTop: 6, marginBottom: 10 },
  h2: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 10 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  note: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 20 },
  input: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: 2, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 52, marginTop: 14 },
});
