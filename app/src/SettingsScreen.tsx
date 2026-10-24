// Settings (round 4): a sheet, not a page. Profile (name, photo), Security & MPIN, Appearance (System / Light / Dark
// + swatches, with the circular reveal), Currency (21, searchable, display only), Notifications, Sounds, Haptics
// (Android only), Paying > Payment QR codes, Backup & export, Privacy, About, Log out, Delete my account.
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native';

import { clearLocal } from './cloud';
import { CurrencySheet } from './DebtForm';
import { DataSection } from './DataSection';
import { CURRENCY_LIST } from './fx';
import { Icon, type IconName } from './icons';
import { LinkBtn, ListCard, PersonAvatar, Row, T } from './kit';
import { MpinSection } from './MpinScreens';
import { chime, isAndroid, Popup, prefs, Press, revealFrom, setPrefs, Sheet, useToast } from './motion';
import { pickImage, usePhotos } from './photos';
import { useQrs } from './qrs';
import { RemindersSection } from './RemindersSection';
import { signOut } from './session';
import { useSettings, type ModeSetting } from './settings';
import { useStore } from './store';
import { supabase } from './supabase';
import { THEME_ORDER, THEMES } from './theme';
import { Banner, Button, Field, Input, Toggle } from './ui';

// Approved by Joe 2026-10-17 (docs/SECURITY_DESIGN.md); contact and full-notice link filled in at go-live (2026-10-21);
// round 4 adds photos (same rules as QR files) and the exchange-rate sources.
const PRIVACY =
  'Your debts, saved QR codes and photos are private: other Patas users can’t see them. I run this server and can technically access what is stored. I don’t browse it; I would only look to fix a problem you report or where the law requires. It is never sold or used for ads. It is stored by Supabase (database and files) and served by Vercel; reminders reach your phone through its push service (Google, Apple, Mozilla or Microsoft), encrypted. Exchange rates come from open.er-api.com or Frankfurter. They see your currency code and, like any website, your internet address; nothing else. A QR you save contains the account or mobile number of the person you pay, inside the picture, and a photo of someone you owe is their personal data. You are recording other people’s details for your own use, so keep to what you need. Deleted items disappear from your lists at once and stay hidden on the server until you delete your account; “Delete my account” removes all your data, QR files and photos. A copy of a QR you save or share is outside Patas. Contact: joemarkudemy@gmail.com. You can also complain to the National Privacy Commission. Full notice: github.com/MarkBasa96/patas#privacy';

type Sub = null | 'profile' | 'security' | 'notif' | 'backup' | 'privacy' | 'about';
const TITLES: Record<Exclude<Sub, null>, string> = { profile: 'Profile', security: 'Security & MPIN', notif: 'Notifications', backup: 'Backup & export', privacy: 'Privacy', about: 'About Patas' };
const LOGO = require('../assets/brand/patas-logo.png');

export function SettingsSheet({ visible, userId, onClose, onOpenQr }: { visible: boolean; userId: string; onClose: () => void; onOpenQr: () => void }) {
  const { t, theme, setTheme, modeSetting, setModeSetting } = useSettings();
  const store = useStore();
  const { qrs } = useQrs();
  const toast = useToast();
  const [view, setView] = useState<Sub>(null);
  const [cur, setCur] = useState(false);
  const [, bump] = useState(0);
  const [lost, setLost] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const close = () => { setView(null); onClose(); };
  const curName = CURRENCY_LIST.find((c) => c.code === store.currency)?.name ?? store.currency;

  async function leaveNow() {
    await store.finishLeave();
    await signOut();
  }
  async function tryLeave() {
    const n = await store.prepareLeave(); // one last upload attempt
    if (n > 0) setLost(n);
    else await leaveNow();
  }
  const reveal = (e: GestureResponderEvent, apply: () => void) => revealFrom(e, apply);

  return (
    <>
      <Sheet visible={visible} onClose={close} title={view ? TITLES[view] : 'Settings'} onBack={view ? () => setView(null) : undefined} height="tall">
        {view === 'profile' ? <Profile onDone={() => setView(null)} /> : null}
        {view === 'security' ? <MpinSection userId={userId} /> : null}
        {view === 'notif' ? (
          <>
            <RemindersSection userId={userId} />
            <T v="meta" tone="muted" style={{ marginHorizontal: 4 }}>Each debt has its own reminder: open a debt, then Reminder. These settings are for this phone.</T>
          </>
        ) : null}
        {view === 'backup' ? <DataSection /> : null}
        {view === 'privacy' ? <T v="body" style={{ lineHeight: 23 }}>{PRIVACY}</T> : null}
        {view === 'about' ? (
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Image source={LOGO} accessibilityLabel="Patas logo" style={{ width: 112, height: 112 }} resizeMode="contain" />
            <T v="sec" style={{ marginTop: 8 }}>Patas</T>
            <T v="meta" tone="muted">Version 1.1 · MIT licence</T>
            <T v="meta" tone="muted" style={{ marginTop: 8, textAlign: 'center' }}>Who you owe, what is left, and what is due next. Made by Joemark Basa.</T>
            <LinkBtn label="Source code on GitHub" onPress={() => { if (typeof window !== 'undefined') window.open('https://github.com/MarkBasa96/patas', '_blank', 'noopener'); }} />
          </View>
        ) : null}

        {view === null ? (
          <>
            <Press soft accessibilityRole="button" onPress={() => setView('profile')} style={[s.profile, { backgroundColor: t.surface, borderColor: t.border }]}>
              <PersonAvatar name={store.name || 'P'} size={56} me />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="sec" lines={1}>{store.name || 'Add your name'}</T>
                <T v="meta" tone="muted">Name and photo</T>
              </View>
              <Icon name="right" size={18} color={t.muted} />
            </Press>

            <T v="cap" tone="muted" style={s.glabel}>APPEARANCE</T>
            <ListCard style={{ padding: 12 }}>
              <View style={s.modes} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
                {(['system', 'light', 'dark'] as ModeSetting[]).map((m) => {
                  const on = modeSetting === m;
                  const name = m === 'system' ? 'System' : m === 'light' ? 'Light' : 'Dark';
                  return (
                    <Press key={m} accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ checked: on }} onPress={(e) => reveal(e, () => setModeSetting(m))} style={[s.mode, { backgroundColor: on ? t.accentFill : t.field }]}>
                      <Text style={{ fontFamily: 'Manrope_600', fontSize: 14, color: on ? '#FFFFFF' : t.text }}>{name}</Text>
                    </Press>
                  );
                })}
              </View>
              <View style={s.swatches}>
                {THEME_ORDER.map((k) => (
                  <Press key={k} accessibilityRole="radio" accessibilityLabel={THEMES[k].name} accessibilityState={{ selected: theme === k }} onPress={(e) => reveal(e, () => setTheme(k))} style={[s.swatch, { borderColor: theme === k ? t.text : 'transparent' }]}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: THEMES[k].l.accent }} />
                  </Press>
                ))}
              </View>
              <T v="meta" tone="muted" style={{ textAlign: 'center' }}>{THEMES[theme].name}</T>
            </ListCard>

            <T v="cap" tone="muted" style={s.glabel}>GENERAL</T>
            <ListCard>
              <Item first icon="shield" label="Security & MPIN" onPress={() => setView('security')} />
              <Item icon="coins" label="Currency" value={`${store.currency} · ${curName}`} onPress={() => setCur(true)} />
              <Item icon="bell" label="Notifications" onPress={() => setView('notif')} />
              <Row>
                <Icon name="sound" color={t.muted} />
                <T v="row" style={{ flex: 1 }}>Sounds</T>
                <Toggle label="Sounds" value={prefs.sound} onValueChange={(v) => { setPrefs({ sound: v }); bump((n) => n + 1); if (v) chime(); toast(v ? 'Sounds on' : 'Sounds off', { quiet: true, sound: false }); }} />
              </Row>
              <Item icon="sound" label="Play test sound" value="iPhone’s silent switch mutes it" onPress={() => { chime(true); toast('Did you hear a soft chime?', { quiet: true, sound: false }); }} />
              {isAndroid() ? (
                <Row>
                  <Icon name="vib" color={t.muted} />
                  <T v="row" style={{ flex: 1 }}>Haptics</T>
                  <Toggle label="Haptics" value={prefs.haptic} onValueChange={(v) => { setPrefs({ haptic: v }); bump((n) => n + 1); toast(v ? 'Haptics on' : 'Haptics off', { quiet: true }); }} />
                </Row>
              ) : null}
            </ListCard>

            <T v="cap" tone="muted" style={s.glabel}>PAYING</T>
            <ListCard>
              <Item first icon="qr" label="Payment QR codes" value={`${qrs.length} saved`} onPress={() => { close(); onOpenQr(); }} />
            </ListCard>

            <T v="cap" tone="muted" style={s.glabel}>DATA</T>
            <ListCard>
              <Item first icon="box" label="Backup & export" onPress={() => setView('backup')} />
              <Item icon="shield" label="Privacy" onPress={() => setView('privacy')} />
              <Item icon="info" label="About Patas" onPress={() => setView('about')} />
            </ListCard>

            <View style={{ gap: 10, marginTop: 20 }}>
              <Button label="Log out" kind="outline" onPress={() => void tryLeave()} />
              <LinkBtn tone="danger" label="Delete my account" onPress={() => setDeleting(true)} />
            </View>
          </>
        ) : null}
      </Sheet>

      <CurrencySheet visible={cur} value={store.currency} title="Show amounts in" onClose={() => setCur(false)} onPick={(c) => { store.saveCurrency(c); setCur(false); toast(`Showing amounts in ${c}`, { quiet: true }); }} />

      <Popup visible={lost > 0} solid title="Log out anyway?" onClose={() => setLost(0)}>
        <T v="body" tone="muted">{`${lost} change${lost === 1 ? ' has' : 's have'} not reached the cloud yet (you are probably offline). Logging out now would lose ${lost === 1 ? 'it' : 'them'}.`}</T>
        <View style={{ gap: 10, marginTop: 16 }}>
          <Button label="Log out and lose them" kind="danger" onPress={() => { setLost(0); void leaveNow(); }} />
          <Button label="Cancel" kind="outline" onPress={() => setLost(0)} />
        </View>
      </Popup>
      <DeleteAccount visible={deleting} userId={userId} onClose={() => setDeleting(false)} />
    </>
  );
}

function Item({ icon, label, value, onPress, first }: { icon: IconName; label: string; value?: string; onPress: () => void; first?: boolean }) {
  const { t } = useSettings();
  return (
    <Row first={first} onPress={onPress} label={label}>
      <Icon name={icon} color={t.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="row" lines={1}>{label}</T>
        {value ? <T v="meta" tone="muted" lines={1}>{value}</T> : null}
      </View>
      <Icon name="right" size={18} color={t.muted} />
    </Row>
  );
}

function Profile({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const photos = usePhotos();
  const toast = useToast();
  const [name, setName] = useState(store.name);
  const [email, setEmail] = useState('');
  const has = !!photos.urlFor('me');
  useEffect(() => { void supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')); }, []);
  const change = async () => {
    const pic = await pickImage();
    if (!pic) return;
    const err = await photos.set('me', pic);
    toast(err ?? 'Photo saved', err ? { quiet: true } : undefined);
  };
  return (
    <View>
      <View style={{ alignItems: 'center', gap: 6, paddingBottom: 8 }}>
        <Press accessibilityRole="button" accessibilityLabel={has ? 'Change photo' : 'Add a photo'} onPress={() => void change()} style={{ borderRadius: 48 }}>
          <PersonAvatar name={store.name || 'P'} size={96} me />
        </Press>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <LinkBtn label={has ? 'Change photo' : 'Add a photo'} onPress={() => void change()} />
          {has ? <LinkBtn tone="danger" label="Remove" onPress={() => void photos.remove('me').then((e) => toast(e ?? 'Photo removed', { quiet: true }))} /> : null}
        </View>
        <T v="cap" tone="muted" style={{ textAlign: 'center', maxWidth: 280 }}>Only you see it. It is kept private to your account, like your QR codes.</T>
      </View>
      <Field label="Your name">
        <Input label="Your name" value={name} onChangeText={setName} maxLength={40} placeholder="What Patas calls you" />
      </Field>
      <T v="meta" tone="muted" style={{ marginTop: -6, marginBottom: 14 }}>Shown in the Home greeting. Saved to your account, so every phone greets you the same.</T>
      {email ? <Field label="Email"><T v="body" tone="muted">{email}</T></Field> : null}
      <Button label="Save" onPress={() => { store.saveName(name); toast('Profile saved'); onDone(); }} />
    </View>
  );
}

function DeleteAccount({ visible, userId, onClose }: { visible: boolean; userId: string; onClose: () => void }) {
  const { t } = useSettings();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function run() {
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
          ? 'For your safety, deleting needs a sign-in from the last 10 minutes. Log out, sign in again with a fresh code, then delete.'
          : 'Could not delete the account. Check your internet and try again. Nothing was deleted.',
      );
      return;
    }
    await clearLocal(userId);
    await signOut();
  }
  const close = () => { setTyped(''); setProblem(null); onClose(); };
  return (
    <Popup visible={visible} solid title="Delete your account?" onClose={close}>
      <T v="body" tone="muted">This permanently removes all your debts, payments, QR codes and photos from the server and from this phone. It cannot be undone. Type DELETE to confirm.</T>
      <TextInput value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Type DELETE to confirm" placeholder="DELETE" placeholderTextColor={t.muted} style={[s.input, { backgroundColor: t.field, borderColor: t.border, color: t.text }]} />
      {problem ? <View style={{ marginTop: 12 }}><Banner tone="warn" text={problem} /></View> : null}
      <View style={{ gap: 10, marginTop: 14 }}>
        <Button label="Delete everything" kind="danger" disabled={typed !== 'DELETE'} busy={busy} onPress={() => void run()} />
        <Button label="Cancel" kind="outline" onPress={close} />
      </View>
    </Popup>
  );
}

const s = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, borderWidth: 1, padding: 14 },
  glabel: { marginTop: 20, marginBottom: 8, marginHorizontal: 4, letterSpacing: 0.6, fontFamily: 'Manrope_600' },
  modes: { flexDirection: 'row', gap: 6 },
  mode: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  input: { fontFamily: 'Manrope_700', fontSize: 18, letterSpacing: 2, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 52, marginTop: 14 },
});
