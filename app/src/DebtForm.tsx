// Add debt / Edit debt / Borrow again (round 4): One-time, Installment (by count: equal payments, rounding in the
// last) or Recurring (the same amount every month until stopped); a person picker that searches everyone you owe
// with "+ Add"; a currency per debt (kept as typed, converted only for display); app-style date fields.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formFromDebt, hasCredits } from './derive';
import { CURRENCY_LIST } from './fx';
import { Icon } from './icons';
import { people, personKey } from './insights';
import { fLong, fShort, Header, LinkBtn, ListCard, PersonAvatar, Row, T, useMoney } from './kit';
import { emptyForm, formPlan, LIMITS, validateForm, type DebtForm as Form } from './ledger';
import { parsePesos, pesosToInput, symbolOf } from './money';
import { Press, Sheet, useToast } from './motion';
import { todayIso, type Repeat } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Banner, Button, DateField, Field, Input, Segmented, Toggle } from './ui';

const REPEATS: { key: Repeat; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'weekly', label: 'Weekly' },
];
const DESC = { one_time: 'Borrowed once, paid back when you can or by a date.', installments: 'A fixed number of payments, on a schedule.', recurring: 'The same amount every month until you stop it.' } as const;

/** Add a debt, edit one (editId), or borrow again from someone (person). */
export function DebtForm({ editId, person, onClose, onSaved }: { editId?: string; person?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const toast = useToast();
  const { conv, display, fmtSum, fmtIn } = useMoney();
  const today = todayIso();
  const existing = useMemo(() => store.views.find((v) => v.debt.id === editId), [store.views, editId]);
  const [f, setF] = useState<Form>(() => (existing ? formFromDebt(existing) : { ...emptyForm(today), person: person ?? '', currency: store.currency }));
  const [message, setMessage] = useState<string | null>(null);
  const [who, setWho] = useState(false);
  const [curOpen, setCurOpen] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [endOn, setEndOn] = useState(!!f.until);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const ppl = useMemo(() => people(store.views, conv, display), [store.views, conv, display]);

  const errors = validateForm(f);
  const valid = Object.keys(errors).length === 0;
  const locked = !!existing && existing.debt.kind === 'installments' && hasCredits(existing.lines);
  const show = (k: keyof Form) => (String(f[k] ?? '').length > 0 ? errors[k] : undefined);
  const money = (c: number) => fmtIn(c, f.currency);
  const total = parsePesos(f.amount);
  const count = /^\d{1,3}$/.test(f.count.trim()) ? Number(f.count) : 0;
  const auto = total !== null && count > 0 ? Math.floor(total / count) : null;
  const plan = f.kind === 'installments' ? formPlan(f) : null;
  const n = f.person.trim().toLowerCase();
  const matches = ppl.filter((p) => !n || p.name.toLowerCase().includes(n)).slice(0, 5);
  const exact = ppl.find((p) => p.key === personKey(f.person));
  const title = existing ? 'Edit debt' : person ? 'Borrow again' : 'Add debt';

  function save() {
    if (!valid) return;
    if (existing) {
      const err = store.saveEdit(existing.debt.id, f);
      if (err) return setMessage(err);
      toast('Changes saved');
      onSaved(existing.debt.id);
    } else {
      const id = store.saveNew(f);
      toast('Debt saved');
      onSaved(id);
    }
  }
  const curBtn = (
    <Press accessibilityRole="button" accessibilityLabel={`Currency of this debt: ${f.currency}`} onPress={() => setCurOpen(true)} style={s.curBtn}>
      <Text style={{ fontFamily: 'Manrope_600', fontSize: 16, color: t.accent }}>{symbolOf(f.currency).trim()}</Text>
      <Icon name="down" size={14} color={t.accent} />
    </Press>
  );

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.page, { paddingBottom: 130 }]} keyboardShouldPersistTaps="handled">
        <Header back="Back" onBack={onClose} title={title} />
        {store.status === 'offline' ? <Banner text="Offline. This is saved on this phone and syncs when you are back online." /> : null}
        {message ? <Banner tone="warn" text={message} /> : null}
        {existing ? null : (
          <>
            <Segmented label="Debt type" value={f.kind} onChange={(v) => set('kind', v)} options={[{ key: 'one_time', label: 'One-time' }, { key: 'installments', label: 'Installment' }, { key: 'recurring', label: 'Recurring' }]} />
            <T v="meta" tone="muted" style={{ marginTop: -6, marginBottom: 14, marginHorizontal: 4 }}>{DESC[f.kind]}</T>
          </>
        )}

        <View style={{ zIndex: 5 }}>
          <Field label="Who do you owe?" error={show('person')}>
            <View style={[s.inp, { backgroundColor: t.field, borderColor: who ? t.accent : t.border }]}>
              <Icon name="user" size={20} color={t.muted} />
              <TextInput value={f.person} onChangeText={(x) => { set('person', x); setWho(true); }} onFocus={() => setWho(true)} placeholder="Search or add a person" placeholderTextColor={t.muted} accessibilityLabel="Who do you owe?" maxLength={LIMITS.person + 10} autoCorrect={false} style={[s.input, { color: t.text }]} />
              <Press accessibilityRole="button" accessibilityLabel="Show everyone" onPress={() => setWho((w) => !w)} style={s.ddBtn}><Icon name={who ? 'x' : 'down'} size={20} color={t.accent} /></Press>
            </View>
            {who && (matches.length || (n && !exact)) ? (
              <View style={[s.dd, { backgroundColor: t.glassStrong, borderColor: t.panelBorder, shadowColor: t.shadow }]} {...({ dataSet: { glass: 'panel', anim: 'fade' } } as object)}>
                {matches.map((p) => (
                  <Press key={p.key} soft accessibilityRole="button" onPress={() => { set('person', p.name); setWho(false); }} style={s.opt}>
                    <PersonAvatar name={p.name} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}><T v="row" lines={1}>{p.name}</T><T v="meta" tone="muted">{p.open} open · {fmtSum(p.remaining)}</T></View>
                  </Press>
                ))}
                {n && !exact ? (
                  <Press soft accessibilityRole="button" onPress={() => { set('person', f.person.trim()); setWho(false); }} style={s.opt}>
                    <Icon name="plus" color={t.accent} /><T v="row" tone="accent" lines={1} style={{ flex: 1 }}>Add “{f.person.trim()}”</T>
                  </Press>
                ) : null}
              </View>
            ) : null}
            {exact && !existing ? <T v="meta" tone="muted" style={{ marginTop: 6 }}>Goes under {exact.name}’s history, with their other debts.</T> : null}
          </Field>
        </View>

        <Field label="What it’s for" optional error={show('title')}>
          <Input label="What it’s for" value={f.title} onChangeText={(v) => set('title', v)} placeholder="Braces, phone, school fees…" maxLength={LIMITS.title + 10} />
        </Field>

        {f.kind === 'one_time' ? (
          <>
            <Field label="Amount" error={show('amount')}>
              <AmountInput value={f.amount} onChange={(v) => set('amount', v)} left={curBtn} label="Amount" />
            </Field>
            <Field label="Borrowed on" error={errors.opened}>
              <DateField label="Borrowed on" value={f.opened} max={today} onChange={(v) => set('opened', v)} />
            </Field>
            <Field label="Due by" optional error={show('due')}>
              <DateField label="Due by" value={f.due} empty="No due date" onChange={(v) => set('due', v)} />
              <View style={s.between}>
                <T v="meta" tone="muted" style={{ flex: 1 }}>{f.due ? '' : 'No date: it shows as “Pay when I can”.'}</T>
                {f.due ? <LinkBtn label="Remove the date" onPress={() => set('due', '')} /> : null}
              </View>
            </Field>
          </>
        ) : f.kind === 'installments' ? (
          <>
            {locked ? <Banner tone="warn" text="A payment was already logged, so the plan can not be changed. You can still edit the name, notes and reminder." /> : null}
            <View pointerEvents={locked ? 'none' : 'auto'} style={{ opacity: locked ? 0.5 : 1 }}>
              <Field label="Total" error={show('amount')}>
                <AmountInput value={f.amount} onChange={(v) => set('amount', v)} left={curBtn} label="Total" />
              </Field>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Number of payments" error={show('count')}>
                    <Input label="Number of payments" value={f.count} onChangeText={(v) => set('count', v)} placeholder="6" keyboardType="number-pad" maxLength={3} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Each payment" error={show('payment')}>
                    <Input label="Each payment" value={f.payment} onChangeText={(v) => set('payment', v)} placeholder={auto ? pesosToInput(auto) : 'auto'} keyboardType="decimal-pad" prefix={symbolOf(f.currency).trim()} maxLength={16} />
                  </Field>
                </View>
              </View>
              {plan && plan.length > 1 && plan[plan.length - 1]!.amount_centavos !== plan[0]!.amount_centavos && total !== null ? <T v="meta" tone="muted" style={{ marginTop: -8, marginBottom: 12 }}>Last payment {money(plan[plan.length - 1]!.amount_centavos)}, so it adds up to exactly {money(total)}.</T> : null}
              <Field label="How often">
                <Segmented label="How often" value={f.repeat} onChange={(v) => set('repeat', v)} options={REPEATS} />
              </Field>
              <Field label="First payment" error={f.first ? errors.first : undefined}>
                <DateField label="First payment" value={f.first} onChange={(v) => set('first', v)} />
                {plan ? <T v="meta" tone="muted" style={{ marginTop: 6 }}>Ends {fLong(plan[plan.length - 1]!.due_on)}</T> : null}
              </Field>
            </View>
            {plan ? (
              <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Press accessibilityRole="button" accessibilityState={{ expanded: showPlan }} onPress={() => setShowPlan((x) => !x)} style={[s.between, { minHeight: 44 }]}>
                  <T v="row" style={{ flex: 1 }}>{plan.length} payments of {money(plan[0]!.amount_centavos)} · {fShort(plan[0]!.due_on)} → {fShort(plan[plan.length - 1]!.due_on)}</T>
                  <Icon name={showPlan ? 'x' : 'down'} size={18} color={t.muted} />
                </Press>
                {showPlan ? plan.slice(0, 24).map((r) => (
                  <View key={r.seq} style={[s.between, { paddingVertical: 6, borderTopWidth: 1, borderTopColor: t.border }]}>
                    <T v="meta">#{r.seq} · {fLong(r.due_on)}</T><T v="meta">{money(r.amount_centavos)}</T>
                  </View>
                )) : null}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Field label="Amount each time" error={show('amount')}>
              <AmountInput value={f.amount} onChange={(v) => set('amount', v)} left={curBtn} label="Amount each time" />
            </Field>
            <Field label="How often">
              <Segmented label="How often" value={f.repeat} onChange={(v) => set('repeat', v)} options={REPEATS} />
            </Field>
            <Field label="Starts on" error={f.first ? errors.first : undefined}>
              <DateField label="Starts on" value={f.first} onChange={(v) => set('first', v)} />
            </Field>
            <View style={s.between}>
              <T v="meta" tone="muted" style={{ flex: 1 }}>{endOn ? '' : 'No end date: it runs until you stop it.'}</T>
              <LinkBtn label={endOn ? 'Remove the end date' : 'Set an end date'} onPress={() => { if (endOn) set('until', ''); setEndOn(!endOn); }} />
            </View>
            {endOn ? (
              <Field label="Ends on" error={errors.until}>
                <DateField label="Ends on" value={f.until} min={f.first || undefined} onChange={(v) => set('until', v)} />
              </Field>
            ) : null}
          </>
        )}
        {f.currency !== display ? <T v="meta" tone="muted" style={{ marginBottom: 12 }}>Saved in {f.currency}. Patas shows it converted (≈) wherever it adds up your debts.</T> : null}

        <ListCard style={{ marginTop: 4, marginBottom: 14 }}>
          <Row first>
            <Icon name="bell" color={t.muted} />
            <View style={{ flex: 1 }}>
              <T v="row">Reminder</T>
              <T v="meta" tone="muted">{f.remind ? 'On the day and 1 day before' : 'Off'} · change it later on the debt</T>
            </View>
            <Toggle label="Remind me" value={f.remind} onValueChange={(v) => set('remind', v)} />
          </Row>
        </ListCard>
        <Field label="Notes" optional error={show('note')}>
          <Input label="Notes" value={f.note} onChangeText={(v) => set('note', v)} placeholder="Add any notes" multiline maxLength={LIMITS.note + 20} />
        </Field>
      </ScrollView>
      <View style={[s.pinned, { backgroundColor: t.tabGlass, borderTopColor: t.tabBorder, paddingBottom: Math.max(insets.bottom, 12) }]} {...({ dataSet: { glass: 'bar' } } as object)}>
        <Button label={existing ? 'Save changes' : 'Save debt'} disabled={!valid} onPress={save} />
      </View>
      <CurrencySheet visible={curOpen} value={f.currency} onClose={() => setCurOpen(false)} onPick={(c) => { set('currency', c); setCurOpen(false); }} title="Currency of this debt" />
    </View>
  );
}

function AmountInput({ value, onChange, left, label }: { value: string; onChange: (v: string) => void; left: React.ReactNode; label: string }) {
  const { t } = useSettings();
  // Money fields format on leave ("1200" -> "1,200.00"), so what was typed is easy to check.
  const tidy = () => { const c = parsePesos(value); if (c !== null) onChange((c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); };
  return (
    <View style={[s.inp, { backgroundColor: t.field, borderColor: t.border, paddingLeft: 8 }]}>
      {left}
      <TextInput value={value} onChangeText={onChange} onBlur={tidy} placeholder="0.00" placeholderTextColor={t.muted} keyboardType="decimal-pad" accessibilityLabel={label} maxLength={18} style={[s.input, { color: t.text }]} />
    </View>
  );
}

/** The 21 currencies, searchable. */
export function CurrencySheet({ visible, value, onPick, onClose, title }: { visible: boolean; value: string; onPick: (code: string) => void; onClose: () => void; title: string }) {
  const { t } = useSettings();
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase();
  const list = CURRENCY_LIST.filter((c) => !n || c.code.toLowerCase().includes(n) || c.name.toLowerCase().includes(n));
  return (
    <Sheet visible={visible} onClose={() => { setQ(''); onClose(); }} title={title} height="tall">
      <View style={[s.inp, { backgroundColor: t.field, borderColor: t.border, marginBottom: 12 }]}>
        <Icon name="search" size={20} color={t.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search a currency" placeholderTextColor={t.muted} accessibilityLabel="Search a currency" style={[s.input, { color: t.text }]} />
      </View>
      <ListCard>
        {list.map((c, i) => (
          <Row key={c.code} first={i === 0} onPress={() => { setQ(''); onPick(c.code); }} label={`${c.name}, ${c.code}`}>
            <T v="row" style={{ width: 48 }}>{c.code}</T>
            <T v="body" style={{ flex: 1 }} lines={1}>{c.name}</T>
            {c.code === value ? <Icon name="check" color={t.accent} /> : null}
          </Row>
        ))}
        {list.length ? null : <T v="body" tone="muted" style={{ padding: 20, textAlign: 'center' }}>No currency matches.</T>}
      </ListCard>
    </Sheet>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  inp: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 12, borderWidth: 1, paddingLeft: 14, gap: 8 },
  input: { flex: 1, minWidth: 0, fontFamily: 'Manrope_500', fontSize: 16, minHeight: 50 },
  ddBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dd: { position: 'absolute', left: 0, right: 0, top: 84, borderRadius: 16, borderWidth: 1, paddingVertical: 6, overflow: 'hidden', shadowOpacity: 1, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 6 },
  curBtn: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4, borderRadius: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  card: { borderRadius: 20, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 16, marginBottom: 14 },
  pinned: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
});
