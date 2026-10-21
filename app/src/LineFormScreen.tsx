import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHARGE_KINDS, METHODS, emptyLineForm, formFromLine, remainingAfter, validateLine, type ChargeKind, type LineForm } from './lines';
import { currencySymbol, formatPesos, parsePesos, pesosToInput } from './money';
import { todayIso } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Avatar, Banner, Button, Chip, Confirm, DateField, Field, Input } from './ui';

/** Log a payment or add a charge on one debt. Pass editId to change or delete an existing line. */
export function LineFormScreen({ debtId, kind, editId, onClose }: { debtId: string; kind: 'payment' | 'charge'; editId?: string; onClose: () => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const today = todayIso();
  const v = store.views.find((x) => x.debt.id === debtId);
  const existing = useMemo(() => v?.lines.find((l) => l.id === editId), [v, editId]);
  const [f, setF] = useState<LineForm>(() => (existing ? formFromLine(existing) : emptyLineForm(today)));
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof LineForm>(k: K, val: LineForm[K]) => setF((p) => ({ ...p, [k]: val }));

  if (!v) return null;
  const errors = validateLine(f, kind, today);
  const valid = Object.keys(errors).length === 0;
  const amount = parsePesos(f.amount);
  const left = kind === 'payment' && amount !== null ? remainingAfter(v, amount, existing) : null;
  const next = v.next;
  const title = `${existing ? 'Edit' : kind === 'payment' ? 'Log' : 'Add'} ${kind}`;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[s.head, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={s.headBtn}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: t.accent }}>Cancel</Text>
        </Pressable>
        <Text style={[s.title, { color: t.text }]}>{title}</Text>
        <View style={{ width: 56 }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.body, { paddingBottom: 130 }]} keyboardShouldPersistTaps="handled">
        <View style={s.who}>
          <Avatar name={v.debt.person_name} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: t.text }}>{v.debt.person_name}</Text>
            {v.debt.title ? <Text numberOfLines={1} style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: t.muted }}>{v.debt.title}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: t.muted }}>Current balance</Text>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: t.text }}>{formatPesos(v.bal.remaining)}</Text>
          </View>
        </View>

        {kind === 'payment' && !existing && v.bal.remaining > 0 ? (
          <View style={s.quick}>
            {next ? <Chip label={`Next due ${formatPesos(next.amount)}`} on={amount === next.amount} onPress={() => set('amount', pesosToInput(next.amount))} /> : null}
            <Chip label={`Full balance ${formatPesos(v.bal.remaining)}`} on={amount === v.bal.remaining} onPress={() => set('amount', pesosToInput(v.bal.remaining))} />
          </View>
        ) : null}

        <Field label="Amount" error={f.amount ? errors.amount : undefined}>
          <Input label="Amount" value={f.amount} onChangeText={(x) => set('amount', x)} placeholder="0" keyboardType="decimal-pad" prefix={currencySymbol()} maxLength={16} />
        </Field>

        {kind === 'charge' ? (
          <Field label="What kind of charge?">
            <View style={s.chips}>
              {CHARGE_KINDS.map((c) => (
                <Chip key={c.key} label={c.label} on={f.chargeKind === c.key} onPress={() => set('chargeKind', c.key as ChargeKind)} />
              ))}
            </View>
          </Field>
        ) : null}

        <Field label={kind === 'payment' ? 'Payment date' : 'Charge date'} error={errors.date}>
          <DateField label="Date" value={f.date} onChange={(x) => set('date', x)} />
        </Field>

        {kind === 'payment' ? (
          <Field label="Payment method" error={errors.method}>
            <View style={s.chips}>
              {METHODS.map((m) => (
                <Chip key={m} label={m} on={f.method === m} onPress={() => set('method', m)} />
              ))}
            </View>
          </Field>
        ) : null}

        <Field label="Note" optional error={errors.note}>
          <Input label="Note" value={f.note} onChangeText={(x) => set('note', x)} placeholder="Add a note" maxLength={320} />
        </Field>

        {left !== null ? (
          <View style={[s.after, { backgroundColor: t.accentSoft }]}>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: t.muted }}>{left < 0 ? 'Overpaid by' : 'Remaining after payment'}</Text>
            <Text style={{ fontFamily: 'Inter_800ExtraBold', fontSize: 24, color: t.text }}>{formatPesos(Math.abs(left))}</Text>
          </View>
        ) : null}
        {left !== null && left < 0 ? <Banner tone="warn" text="That is more than the balance. It will show as overpaid." /> : null}
        <Banner text={kind === 'payment' ? 'This records a payment you already made. Patas never moves money.' : 'Only record a charge the lender really added. Patas never calculates fees or interest by itself.'} />

        {existing ? <View style={{ marginTop: 8 }}><Button label={`Delete this ${kind}`} kind="outline" onPress={() => setConfirm(true)} /></View> : null}
      </ScrollView>
      <View style={[s.save, { backgroundColor: t.bg, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button
          label={existing ? 'Save changes' : kind === 'payment' ? 'Save payment' : 'Save charge'}
          disabled={!valid}
          onPress={() => {
            store.saveLine(kind, debtId, f, existing);
            onClose();
          }}
        />
      </View>
      <Confirm
        visible={confirm}
        title={`Delete this ${kind}?`}
        body="The balance is worked out again without it. This cannot be undone from here."
        confirmLabel={`Delete ${kind}`}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          if (existing) store.deleteLine(existing.id);
          onClose();
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  headBtn: { minHeight: 44, minWidth: 56, justifyContent: 'center' }, // 44px to tap (hitSlop does nothing on the web build)
  body: { paddingHorizontal: 16, paddingTop: 8, width: '100%', maxWidth: 560, alignSelf: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  after: { borderRadius: 14, padding: 14, marginBottom: 10 },
  save: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
});
