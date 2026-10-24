import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  clearPinHere, dropVerifier, flushOfflineFails, localCheck, localView, markLockedOut, pinChange, pinClaim,
  pinDisable, pinResetWithCode, pinStatus, pinSupported, pinVerify, saveKnown, writeVerifier,
} from './accountPin';
import { markForgot, takeSignIn } from './freshSignIn';
import { gate, keepVerifier, relock, weakPin, wrongText, type Gate, type ServerStatus } from './mpinLogic';
import { Icon } from './icons';
import { Keypad, Loading, LockBackdrop, Lockup, lockStyles, MpinCard } from './Opening';
import { signOut } from './session';
import { supabase } from './supabase';
import { useSettings } from './settings';
import { Banner, Button } from './ui';

/** Four digits, hidden. Calls onDone with the digits; a returned string is shown as the problem. */
function PinEntry({ title, body, onDone, problem, busy }: { title: string; body?: string; onDone: (pin: string) => void; problem?: string | null; busy?: boolean }) {
  const { t } = useSettings();
  const [v, setV] = useState('');
  const [seen, setSeen] = useState(problem);
  if (problem !== seen) { setSeen(problem); if (problem) setV(''); } // a new problem clears the digits
  return (
    <View>
      <Text style={[s.title, { color: t.text }]}>{title}</Text>
      {body ? <Text style={[s.body, { color: t.muted }]}>{body}</Text> : null}
      <TextInput
        value={v}
        onChangeText={(x) => {
          const d = x.replace(/\D/g, '').slice(0, 4);
          setV(d);
          if (d.length === 4 && !busy) onDone(d);
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        secureTextEntry
        maxLength={4}
        autoFocus
        autoComplete="off"
        textContentType="oneTimeCode"
        accessibilityLabel={title}
        editable={!busy}
        style={[s.pin, { backgroundColor: t.field, borderColor: t.border, color: t.text }]}
      />
      {problem ? <View style={{ marginTop: 12 }}><Banner tone="warn" text={problem} /></View> : null}
    </View>
  );
}

/** New MPIN, typed twice. Resolves with the digits once both match and the pick isn't a weak one. */
function NewPin({ title, onPicked, problem, busy }: { title: string; onPicked: (pin: string) => void; problem?: string | null; busy?: boolean }) {
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [seen, setSeen] = useState(problem);
  if (problem !== seen) { setSeen(problem); if (problem) { setFirst(null); setMsg(problem); } }
  if (first === null)
    return <PinEntry key="a" title={title} body="Pick 4 digits. Not a run like 1234 or the same digit four times." problem={msg} busy={busy}
      onDone={(p) => { if (weakPin(p)) setMsg('That MPIN is too easy to guess. Pick another.'); else { setMsg(null); setFirst(p); } }} />;
  return <PinEntry key="b" title="Type it again" busy={busy} problem={msg}
    onDone={(p) => { if (p !== first) { setFirst(null); setMsg('Those did not match. Start again.'); } else onPicked(p); }} />;
}

/**
 * The lock in front of the app (F24). Asked on a fresh open and after 30 minutes away. While locked the
 * app itself is not on screen at all, so anything open behind it (the QR copy sheet included) closes.
 */
export function PinGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [g, setG] = useState<Gate | 'checking'>('checking');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const unconfirmed = useRef(false); // opened without hearing from the server (audit L-3)
  const [pad, setPad] = useState(false);
  const [email, setEmail] = useState('');
  useEffect(() => { void supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')); }, []);

  // Works out the gate; never sets state itself (the callers do, after it answers).
  const decide = useCallback(async (afterAway: boolean, timeoutMs = 3000): Promise<{ gate: Gate; online: boolean }> => {
    if (!pinSupported()) return { gate: 'open', online: true };
    await flushOfflineFails(userId); // offline wrong tries reach the server before it is asked (audit L-1)
    const server = await pinStatus(timeoutMs);
    const local = await localView(userId);
    if (server !== 'network') {
      await saveKnown({ uid: userId, enabled: server.enabled, epoch: server.epoch });
      if (local.verifier && !local.verifier.lockedOut && !keepVerifier(server, local.verifier.epoch)) await dropVerifier();
    }
    // The sign-in flags are read once, on the first check after sign-in (never after time away).
    const signIn = afterAway ? { codeAccepted: false, forgot: false } : takeSignIn();
    return { gate: gate(server, await localView(userId), Date.now(), signIn.codeAccepted, signIn.forgot), online: server !== 'network' };
  }, [userId]);
  const evaluate = useCallback((afterAway: boolean) => decide(afterAway).then((r) => { setProblem(null); setG(r.gate); unconfirmed.current = r.gate === 'open' && !r.online; }), [decide]);

  useEffect(() => {
    void decide(false).then((r) => { setG(r.gate); unconfirmed.current = r.gate === 'open' && !r.online; });
  }, [decide]);

  // Opened without the server's answer (slow or offline): keep asking in the background, and lock if it
  // turns out this account has an MPIN (audit L-3; same trap as Gastos M-2).
  useEffect(() => {
    if (g !== 'open') return;
    const timer = setInterval(() => {
      if (!unconfirmed.current) return;
      void decide(true, 10_000).then((r) => {
        if (!r.online) return;
        unconfirmed.current = false;
        if (r.gate !== 'open') { setProblem(null); setG(r.gate); }
      });
    }, 20_000);
    return () => clearInterval(timer);
  }, [g, decide]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { if (hiddenAt.current === null) hiddenAt.current = Date.now(); return; }
      const away = hiddenAt.current;
      hiddenAt.current = null;
      if (relock(away, Date.now())) { setG('checking'); void evaluate(true); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [evaluate]);

  async function tryPin(pin: string) {
    setBusy(true); setProblem(null);
    await flushOfflineFails(userId); // earlier offline tries count first, so 5 means 5 (audit L-1)
    const r = await pinVerify(pin);
    if (r !== 'network') {
      if (r.result === 'ok' && r.epoch) {
        await writeVerifier(pin, userId, r.epoch);
        await flushOfflineFails(userId);
        setBusy(false);
        return setG('open');
      }
      if (r.result === 'none') { await clearPinHere(); setBusy(false); return setG('open'); }
      if (r.result === 'locked') { await markLockedOut(userId); setBusy(false); return setG('signout'); }
      setBusy(false);
      return setProblem(r.result === 'wrong' ? wrongText(r.tries_left) : 'Something went wrong. Try again.');
    }
    if (g === 'ask-online') { setBusy(false); return setProblem('Connect to the internet to unlock.'); }
    const l = await localCheck(pin, userId);
    setBusy(false);
    if (l === 'ok') return setG('open');
    if (l === 'locked') return setG('signout');
    if (l === 'wrong') return setProblem(wrongText(undefined));
    setG('ask-online');
    setProblem('Connect to the internet to unlock.');
  }

  async function reset(pin: string) {
    setBusy(true); setProblem(null);
    const r = await pinResetWithCode(pin);
    setBusy(false);
    if (r === 'network') return setProblem('Connect to the internet to set your new MPIN.');
    if (r.result === 'ok' && r.epoch) { await writeVerifier(pin, userId, r.epoch); await saveKnown({ uid: userId, enabled: true, epoch: r.epoch }); return setG('open'); }
    if (r.result === 'stale_code') return setG('signout');
    setProblem(r.result === 'weak' ? 'That MPIN is too easy to guess. Pick another.' : 'Something went wrong. Try again.');
  }

  async function leave(wantNewPin: boolean) {
    await flushOfflineFails(userId); // never lose wrong tries by signing out
    if (wantNewPin) markForgot();
    await clearPinHere();
    await signOut();
  }

  if (g === 'open') return <>{children}</>;
  // While checking: the white opening screen with the mascot on its ring (round 4).
  if (g === 'checking') return <Loading />;
  const mask = email.replace(/^(.)[^@]*/, (_m, a: string) => a + '•••');
  const links = (
    <View style={{ marginTop: 'auto' }}>
      <View style={lockStyles.links}>
        <Pressable accessibilityRole="button" onPress={() => { void leave(false); }} style={lockStyles.link}><Text style={lockStyles.linkText}>Not you? Switch</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { void leave(true); }} style={lockStyles.link}><Text style={lockStyles.linkText}>Forgot MPIN?</Text></Pressable>
      </View>
      <Text style={lockStyles.ver}>Patas 1.1</Text>
    </View>
  );
  if (g === 'reset') {
    return (
      <LockBackdrop>
        <Lockup white width={160} />
        <NewPinPad onPicked={(p) => { void reset(p); }} problem={problem} busy={busy} />
        {links}
      </LockBackdrop>
    );
  }
  if (g === 'signout') {
    return (
      <LockBackdrop>
        <Lockup white width={200} />
        <View style={{ flex: 1, justifyContent: 'center', width: '100%', alignItems: 'center' }}>
          <View style={lockStyles.panel} {...({ dataSet: { glass: 'lock' } } as object)}>
            <Text style={lockStyles.panelTitle}>MPIN locked</Text>
            <Text style={lockStyles.panelBody}>Too many wrong tries. Sign in again with a code from your email, then set a new MPIN. Your data stays safe.</Text>
            <Button label="Sign in with an email code" onPress={() => { void leave(true); }} />
          </View>
        </View>
      </LockBackdrop>
    );
  }
  if (!pad) {
    return (
      <LockBackdrop>
        <Lockup white width={236} />
        {mask ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Signed in as ${mask}. Switch account`} onPress={() => { void leave(false); }} style={lockStyles.pill}>
            <Text style={lockStyles.pillText}>{mask}</Text>
            <Icon name="swap" size={18} color="#FFFFFF" />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, justifyContent: 'center' }}><MpinCard onPress={() => setPad(true)} /></View>
        {g === 'ask-online' ? <Text style={[lockStyles.ver, { marginBottom: 12 }]}>Connect to the internet to unlock this phone.</Text> : null}
        {links}
      </LockBackdrop>
    );
  }
  return (
    <LockBackdrop>
      <Lockup white width={160} />
      <Keypad title="Enter your MPIN" body={g === 'ask-online' ? 'Connect to the internet to unlock this phone.' : undefined} problem={problem} busy={busy} onDone={(p) => { void tryPin(p); }} />
      {links}
    </LockBackdrop>
  );
}

/** New MPIN on the keypad, typed twice; weak picks are refused here too (the server checks again). */
function NewPinPad({ onPicked, problem, busy }: { onPicked: (pin: string) => void; problem?: string | null; busy?: boolean }) {
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [seen, setSeen] = useState(problem);
  if (problem !== seen) { setSeen(problem); if (problem) { setFirst(null); setMsg(problem); } }
  if (first === null)
    return <Keypad key="a" title="Set a new MPIN" body="4 digits. Not a run like 1234 or the same digit four times." problem={msg} busy={busy}
      onDone={(p) => { if (weakPin(p)) setMsg('That MPIN is too easy to guess. Pick another.'); else { setMsg(null); setFirst(p); } }} />;
  return <Keypad key="b" title="Type it again" busy={busy} problem={msg}
    onDone={(p) => { if (p !== first) { setFirst(null); setMsg('Those did not match. Start again.'); } else onPicked(p); }} />;
}

type Step = null | 'on' | 'change-old' | 'change-new' | 'off';

/** Settings > App lock (MPIN). Off by default. Every change is checked by the server. */
export function MpinSection({ userId }: { userId: string }) {
  const { t } = useSettings();
  const [status, setStatus] = useState<ServerStatus | 'network' | null>(null);
  const [step, setStep] = useState<Step>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const oldPin = useRef<string | null>(null); // Change MPIN: held only between the two screens

  const load = useCallback(() => pinStatus().then(setStatus), []);
  useEffect(() => { void pinStatus().then(setStatus); }, []);
  const close = () => { oldPin.current = null; setStep(null); setProblem(null); setBusy(false); };

  async function answer(r: Awaited<ReturnType<typeof pinVerify>>, ok: (epoch: string) => Promise<void>, doneText: string) {
    setBusy(false);
    if (r === 'network') return setProblem('Connect to the internet and try again.');
    if ((r.result === 'ok' || r.result === 'set') && r.epoch) { await ok(r.epoch); close(); setDone(doneText); return load(); }
    if (r.result === 'wrong') return setProblem(wrongText(r.tries_left));
    if (r.result === 'locked') { close(); await markLockedOut(userId); setDone('Too many wrong tries. Your MPIN is locked until you sign in with an email code.'); return load(); }
    if (r.result === 'weak') return setProblem('That MPIN is too easy to guess. Pick another.');
    if (r.result === 'exists') { close(); return load(); }
    setProblem('Something went wrong. Try again.');
  }

  if (!pinSupported()) return null;
  const on = status !== null && status !== 'network' && status.enabled;
  return (
    <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[s.h2, { color: t.text }]}>App lock (MPIN)</Text>
      <Text style={[s.note, { color: t.muted }]}>
        {on ? 'On. Asked when Patas opens and after 30 minutes away.' : 'Off. A 4-digit lock for when someone else holds your phone.'}
      </Text>
      {status === 'network' ? <Banner tone="warn" text="Connect to the internet to change the app lock." /> : null}
      {status && status !== 'network' ? (
        <View style={{ gap: 10 }}>
          {on ? (
            <>
              <Button label="Change MPIN" kind="outline" onPress={() => { setDone(null); setStep('change-old'); }} />
              <Button label="Turn off MPIN" kind="outline" onPress={() => { setDone(null); setStep('off'); }} />
            </>
          ) : (
            <Button label="Turn on MPIN" kind="outline" onPress={() => { setDone(null); setStep('on'); }} />
          )}
        </View>
      ) : null}
      {done ? <View style={{ marginTop: 12 }}><Banner text={done} /></View> : null}

      <Modal visible={step !== null} transparent animationType="fade" onRequestClose={close}>
        <View style={s.scrim}>
          <View style={[s.dialog, { backgroundColor: t.surface, borderColor: t.border }]}>
            {step === 'on' ? (
              <NewPin title="Choose an MPIN" busy={busy} problem={problem} onPicked={(p) => {
                setBusy(true); setProblem(null);
                void pinClaim(p).then((r) => answer(r, async (e) => { await writeVerifier(p, userId, e); await saveKnown({ uid: userId, enabled: true, epoch: e }); }, 'MPIN is on.'));
              }} />
            ) : step === 'change-old' ? (
              <PinEntry title="Current MPIN" problem={problem} busy={busy} onDone={(p) => { oldPin.current = p; setProblem(null); setStep('change-new'); }} />
            ) : step === 'change-new' ? (
              <NewPin title="New MPIN" busy={busy} problem={problem} onPicked={(p) => {
                setBusy(true); setProblem(null);
                void pinChange(oldPin.current ?? '', p).then((r) => {
                  if (r !== 'network' && r.result === 'wrong') { oldPin.current = null; setStep('change-old'); }
                  return answer(r, async (e) => { await writeVerifier(p, userId, e); await saveKnown({ uid: userId, enabled: true, epoch: e }); }, 'MPIN changed on every phone.');
                });
              }} />
            ) : step === 'off' ? (
              <PinEntry title="Current MPIN" body="Turning it off removes the lock on every phone." problem={problem} busy={busy} onDone={(p) => {
                setBusy(true); setProblem(null);
                void pinDisable(p).then((r) => answer(r, async () => { await clearPinHere(); await saveKnown({ uid: userId, enabled: false, epoch: null }); }, 'MPIN is off.'));
              }} />
            ) : null}
            <View style={{ marginTop: 16 }}>
              <Button label="Cancel" kind="outline" onPress={close} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 20 },
  brand: { fontFamily: 'Manrope_700', fontSize: 22, letterSpacing: -0.3, marginBottom: 16 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  title: { fontFamily: 'Manrope_700', fontSize: 20, marginBottom: 6 },
  body: { fontFamily: 'Manrope_400', fontSize: 15, lineHeight: 21, marginBottom: 12 },
  pin: { fontFamily: 'Manrope_700', fontSize: 28, letterSpacing: 12, textAlign: 'center', borderWidth: 1, borderRadius: 14, minHeight: 60, marginTop: 8 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  h2: { fontFamily: 'Manrope_700', fontSize: 17, marginBottom: 10 },
  note: { fontFamily: 'Manrope_400', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 20 },
});
