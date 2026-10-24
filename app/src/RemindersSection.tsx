import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { REMINDER_TIMES, STATE_TEXT, testResultText, timeLabel, type PushState } from './pushLogic';
import { loadPrefs, savePrefs, sendTest, stateHere, turnOffHere, turnOnHere, type ReminderPrefs } from './reminders';
import { useSettings } from './settings';
import { Banner, Button, Chip, Toggle } from './ui';

// Settings > Reminders (SPEC 6). One short note a day, the day before and the day of a due date.
// Senku's status panel: the server can't see a silent drop on iPhone, so the phone says what it knows.
export function RemindersSection({ userId }: { userId: string }) {
  const { t } = useSettings();
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [busy, setBusy] = useState<'on' | 'off' | 'test' | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void stateHere().then((s) => alive && setState(s));
    void loadPrefs().then((p) => alive && setPrefs(p));
    return () => { alive = false; };
  }, []);

  async function on() {
    setBusy('on'); setNote(null);
    const r = await turnOnHere();
    setState(await stateHere());
    setBusy(null);
    if (r === 'on') setNote({ tone: 'ok', text: 'Done. Send a test to check it arrives.' });
    else if (r === 'no-keys' || r === 'failed') setNote({ tone: 'warn', text: 'Could not turn reminders on. Check your internet and try again.' });
  }
  async function off() {
    setBusy('off'); setNote(null);
    await turnOffHere();
    setState(await stateHere());
    setBusy(null);
  }
  async function test() {
    setBusy('test'); setNote(null);
    const r = await sendTest();
    setBusy(null);
    setNote({ tone: r.sent ? 'ok' : 'warn', text: testResultText(r) });
  }
  async function change(p: Partial<ReminderPrefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...p };
    setPrefs(next);
    if (!(await savePrefs(userId, p))) { setPrefs(prefs); setNote({ tone: 'warn', text: 'Could not save that. Check your internet and try again.' }); }
  }

  // Two levels, named (Erina, 2026-10-21): the account switch, then what this phone can do.
  return (
    <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[s.h2, { color: t.text }]}>Reminders</Text>
      <Text style={[s.note, { color: t.muted }]}>The day before and the day of each due date. Counts only, never names or amounts.</Text>
      {prefs ? (
        <View style={s.between}>
          <Text style={[s.label, { color: t.text, marginTop: 0, marginBottom: 0 }]}>For my account</Text>
          <Toggle label="Reminders for my account" value={prefs.on} onValueChange={(v) => { void change({ on: v }); }} />
        </View>
      ) : null}
      {prefs?.on ? (
        <>
          <Text style={[s.label, { color: t.text }]}>Time</Text>
          <View style={s.grid}>
            {REMINDER_TIMES.map((at) => (
              <View key={at} style={s.cell}>
                <Chip label={timeLabel(at)} on={prefs.at === at} onPress={() => { void change({ at }); }} />
              </View>
            ))}
          </View>
          <Text style={[s.label, { color: t.text }]}>On this phone</Text>
          {state ? <Text style={[s.note, { color: state === 'on' ? t.text : t.muted }]}>{STATE_TEXT[state]}</Text> : null}
          <View style={{ gap: 10 }}>
            {state === 'off' ? <Button label="Turn on for this phone" kind="outline" busy={busy === 'on'} onPress={() => { void on(); }} /> : null}
            {state === 'on' ? (
              <>
                <Button label="Send test reminder" kind="outline" busy={busy === 'test'} onPress={() => { void test(); }} />
                <Button label="Turn off for this phone" kind="outline" busy={busy === 'off'} onPress={() => { void off(); }} />
              </>
            ) : null}
          </View>
        </>
      ) : prefs ? (
        <Text style={[s.note, { color: t.muted, marginTop: 8, marginBottom: 0 }]}>Off on every phone.</Text>
      ) : null}
      {note ? <View style={{ marginTop: 12 }}><Banner tone={note.tone === 'ok' ? 'info' : 'warn'} text={note.text} /></View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  h2: { fontFamily: 'Manrope_700', fontSize: 17, marginBottom: 10 },
  label: { fontFamily: 'Manrope_600', fontSize: 14, marginTop: 6, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  cell: { flexBasis: '30%', flexGrow: 1 }, // three equal columns, so six times never leave one chip alone
  note: { fontFamily: 'Manrope_400', fontSize: 14, lineHeight: 20, marginBottom: 10 },
});
