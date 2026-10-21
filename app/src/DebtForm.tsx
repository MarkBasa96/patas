import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formFromDebt, hasCredits } from './derive';
import { LIMITS, emptyForm, validateForm, type DebtForm as Form } from './ledger';
import { currencySymbol, formatPesos, parsePesos } from './money';
import { buildPlan, formatLong, type Repeat } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Banner, Button, DateField, Field, Input, Segmented, Toggle } from './ui';

const REPEATS: { key: Repeat; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'weekly', label: 'Weekly' },
];

/** Add a debt, or edit one (pass editId). */
export function DebtForm({ editId, onClose, onSaved }: { editId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const existing = useMemo(() => store.views.find((v) => v.debt.id === editId), [store.views, editId]);
  const [f, setF] = useState<Form>(() => (existing ? formFromDebt(existing) : emptyForm()));
  const [message, setMessage] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const errors = validateForm(f);
  const valid = Object.keys(errors).length === 0;
  const locked = !!existing && existing.debt.kind === 'installments' && hasCredits(existing.lines);
  const kindLocked = !!existing; // one-time vs installments is chosen when the debt is made
  // Show a message only for fields the person has started typing in, so an empty form is not a wall of red.
  const show = (k: keyof Form) => (String(f[k]).length > 0 ? errors[k] : undefined);

  const amount = parsePesos(f.amount);
  const pay = parsePesos(f.payment);
  const plan = f.kind === 'installments' && amount !== null && pay !== null && f.first ? buildPlan(amount, pay, f.repeat, f.first) : null;

  function save() {
    if (!valid) return;
    if (existing) {
      const err = store.saveEdit(existing.debt.id, f);
      if (err) setMessage(err);
      else onSaved(existing.debt.id);
    } else {
      onSaved(store.saveNew(f));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[s.head, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={s.headBtn}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: t.accent }}>Cancel</Text>
        </Pressable>
        <Text style={[s.title, { color: t.text }]}>{existing ? 'Edit debt' : 'Add debt'}</Text>
        <View style={{ width: 56 }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.body, { paddingBottom: 120 }]} keyboardShouldPersistTaps="handled">
        {store.status === 'offline' ? <Banner text="Offline. This will be saved on this phone and sync when you are back online." /> : null}
        {message ? <Banner tone="warn" text={message} /> : null}
        <Field label="Who do you owe?" error={show('person')}>
          <Input label="Who do you owe?" value={f.person} onChangeText={(v) => set('person', v)} placeholder="Juan Dela Cruz" maxLength={LIMITS.person + 10} />
        </Field>
        <Field label="What is it for?" optional error={show('title')}>
          <Input label="What is it for?" value={f.title} onChangeText={(v) => set('title', v)} placeholder="Emergency loan" maxLength={LIMITS.title + 10} />
        </Field>
        <Field label={f.kind === 'one_time' ? 'Amount borrowed' : 'Total to repay'} error={show('amount')}>
          <Input label="Amount" value={f.amount} onChangeText={(v) => set('amount', v)} placeholder="0" keyboardType="decimal-pad" prefix={currencySymbol()} maxLength={16} />
        </Field>
        {kindLocked ? null : (
          <Segmented label="Debt type" value={f.kind} onChange={(v) => set('kind', v)} options={[{ key: 'one_time', label: 'One-time' }, { key: 'installments', label: 'Installments' }]} />
        )}

        {f.kind === 'one_time' ? (
          <Field label="Due date" optional>
            <DateField label="Due date" value={f.due} onChange={(v) => set('due', v)} />
            {f.due === '' ? <Text style={[s.hint, { color: t.muted }]}>Leave empty for “pay when I can”.</Text> : null}
          </Field>
        ) : (
          <>
            {locked ? <Banner tone="warn" text="A payment was already logged, so the plan can not be changed. You can still edit the name, notes and reminder." /> : null}
            <View pointerEvents={locked ? 'none' : 'auto'} style={{ opacity: locked ? 0.5 : 1 }}>
              <Field label="Payment amount" error={show('payment')}>
                <Input label="Payment amount" value={f.payment} onChangeText={(v) => set('payment', v)} placeholder="0" keyboardType="decimal-pad" prefix={currencySymbol()} maxLength={16} />
              </Field>
              <Field label="Repeat">
                <Segmented label="Repeat" value={f.repeat} onChange={(v) => set('repeat', v)} options={REPEATS} />
              </Field>
              <Field label="First due date" error={errors.first && f.first ? errors.first : undefined}>
                <DateField label="First due date" value={f.first} onChange={(v) => set('first', v)} />
              </Field>
            </View>
            <View style={[s.plan, { backgroundColor: t.accentSoft }]}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: t.accent }}>Ends when the balance is paid</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: t.muted, marginTop: 2 }}>
                {plan ? `${plan.length} ${plan.length === 1 ? 'payment' : 'payments'}, the last one ${formatPesos(plan[plan.length - 1]?.amount_centavos ?? 0)} on ${formatLong(plan[plan.length - 1]?.due_on ?? f.first)}.` : 'Fill in the amounts and the first date to see the plan.'}
              </Text>
            </View>
          </>
        )}

        <View style={s.switchRow}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: t.text, flex: 1 }}>Remind me before it is due</Text>
          <Toggle label="Remind me" value={f.remind} onValueChange={(v) => set('remind', v)} />
        </View>
        <Field label="Notes" optional error={show('note')}>
          <Input label="Notes" value={f.note} onChangeText={(v) => set('note', v)} placeholder="Add any notes" multiline maxLength={LIMITS.note + 20} />
        </Field>
      </ScrollView>
      <View style={[s.save, { backgroundColor: t.bg, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label={existing ? 'Save changes' : 'Save debt'} disabled={!valid} onPress={save} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  headBtn: { minHeight: 44, minWidth: 56, justifyContent: 'center' }, // 44px to tap (hitSlop does nothing on the web build)
  body: { paddingHorizontal: 16, paddingTop: 8, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hint: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6 },
  plan: { borderRadius: 14, padding: 14, marginBottom: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, minHeight: 44 },
  save: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
});
