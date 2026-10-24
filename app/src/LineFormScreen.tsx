// Log payment (round 4), and the charge / "borrowed more" forms. Installments and recurring debts tick months from
// the oldest (payments apply oldest-first, so ticking a month ticks the ones before it; ticked + 3 shown, "Show n
// more"), Select all, Pay selected = one payment line for the ticked total; or a custom amount. Method chips with
// "Other…" that names a new method and keeps it (it is simply the method text on the payment).
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icons';
import { tickUpTo } from './insights';
import { fShort, Header, LinkBtn, Pill, T, type as TY, useMoney } from './kit';
import { CHARGE_KINDS, emptyLineForm, formFromLine, remainingAfter, validateLine, type ChargeKind, type LineForm, type LineFormKind } from './lines';
import { parsePesos, pesosToInput, symbolOf } from './money';
import { ConfirmPop, Press, useToast } from './motion';
import { todayIso } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Banner, Button, Chip, DateField, Field, Input, Segmented } from './ui';

export const DEFAULT_METHODS = ['Cash', 'GCash', 'Maya', 'Bank transfer'];

/** Chips for a name (payment method, QR wallet): defaults, then the person's own names; "Other…" adds one. */
export function NamePicker({ value, onChange, defaults, custom, placeholder }: { value: string; onChange: (v: string) => void; defaults: string[]; custom: string[]; placeholder: string }) {
  const { t } = useSettings();
  const [other, setOther] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const all = [...defaults, ...custom.filter((c) => !defaults.includes(c))];
  if (value && !all.includes(value) && value !== 'Other') all.push(value);
  const many = all.length > 6 && !more;
  const shown = many ? all.slice(0, 5) : all;
  const hiddenSel = many && value && !shown.includes(value);
  return (
    <View>
      <View style={s.chips}>
        {shown.map((m) => <Chip key={m} label={m} on={value === m} onPress={() => { setOther(null); onChange(m); }} />)}
        {hiddenSel ? <Chip label={value} on onPress={() => {}} /> : null}
        {many ? <Chip label="More…" on={false} onPress={() => setMore(true)} /> : null}
        <Chip label="Other…" on={other !== null} onPress={() => setOther(other === null ? '' : null)} />
      </View>
      {other !== null ? (
        <View style={[s.otherRow]}>
          <View style={[s.otherInp, { backgroundColor: t.field, borderColor: t.border }]}>
            <TextInput value={other} onChangeText={setOther} maxLength={20} placeholder={placeholder} placeholderTextColor={t.muted} accessibilityLabel="Name it" autoFocus style={[s.input, { color: t.text }]} />
          </View>
          <Press accessibilityRole="button" disabled={!other.trim()} onPress={() => { onChange(other.trim()); setOther(null); }} style={[s.addBtn, { backgroundColor: t.accentFill, opacity: other.trim() ? 1 : 0.45 }]}>
            <Text style={{ fontFamily: 'Manrope_700', fontSize: 15, color: '#FFFFFF' }}>Add</Text>
          </Press>
        </View>
      ) : null}
    </View>
  );
}

export function LineFormScreen({ debtId, kind, editId, onClose }: { debtId: string; kind: LineFormKind; editId?: string; onClose: () => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const toast = useToast();
  const { fmtIn } = useMoney();
  const today = todayIso();
  const v = store.views.find((x) => x.debt.id === debtId);
  const existing = useMemo(() => v?.lines.find((l) => l.id === editId), [v, editId]);
  const [f, setF] = useState<LineForm>(() => (existing ? formFromLine(existing) : emptyLineForm(today)));
  const canTick = kind === 'payment' && !existing && !!v && v.debt.kind !== 'one_time' && v.schedule.some((x) => x.short > 0);
  const [mode, setMode] = useState<'ticks' | 'custom'>(canTick ? 'ticks' : 'custom');
  const [count, setCount] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [ask, setAsk] = useState(false);
  const customMethods = useMemo(() => [...new Set(store.data.lines.filter((l) => !l.deleted && l.kind === 'payment' && l.method && l.method !== 'Other').map((l) => l.method))], [store.data.lines]);
  const set = <K extends keyof LineForm>(k: K, val: LineForm[K]) => setF((p) => ({ ...p, [k]: val }));
  if (!v) return null;
  const cur = v.debt.currency;
  const money = (c: number) => fmtIn(c, cur);
  const open = v.schedule.filter((x) => x.short > 0);
  const ticks = canTick && mode === 'ticks' ? tickUpTo(v, count - 1) : null;
  const form: LineForm = ticks ? { ...f, amount: ticks.total ? pesosToInput(ticks.total) : '' } : f;
  const errors = validateLine(form, kind, today);
  const amount = parsePesos(form.amount);
  const left = kind === 'payment' && amount !== null ? remainingAfter(v, amount, existing) : null;
  const valid = Object.keys(errors).length === 0 && (!ticks || ticks.total > 0);
  const title = kind === 'payment' ? (existing ? 'Edit payment' : 'Log payment') : kind === 'charge' ? (existing ? 'Edit charge' : 'Add a charge') : existing ? 'Edit borrowed more' : 'Borrowed more';
  const noun = kind === 'payment' ? 'payment' : kind === 'charge' ? 'charge' : 'amount';
  const save = () => {
    store.saveLine(kind, debtId, form, existing);
    toast(existing ? 'Changes saved' : kind === 'payment' ? 'Payment saved' : kind === 'charge' ? 'Charge saved' : 'Saved');
    onClose();
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.page, { paddingBottom: 140 }]} keyboardShouldPersistTaps="handled">
        <Header back="Back" onBack={onClose} title={title} sub={`${v.debt.person_name}${v.debt.title ? ' · ' + v.debt.title : ''}`} />

        {canTick ? (
          <Segmented label="How to pay" value={mode} onChange={setMode} options={[{ key: 'ticks', label: v.debt.kind === 'recurring' ? 'Months' : 'Installments' }, { key: 'custom', label: 'Custom amount' }]} />
        ) : null}

        {ticks ? (
          <>
            <T v="meta" tone="muted" style={{ marginHorizontal: 4 }}>Payments go to the oldest month first, so ticking a month also ticks the ones before it.</T>
            <View style={[s.between, { marginTop: 12 }]}>
              <T v="sec">Unpaid</T>
              <LinkBtn label={count === open.length ? 'Clear' : 'Select all'} onPress={() => setCount(count === open.length ? 0 : open.length)} />
            </View>
            <View accessibilityRole="none" accessibilityLabel="Months to pay" style={{ gap: 8, marginTop: 4 }}>
              {open.slice(0, showAll ? open.length : count + 3).map((x, i) => {
                const on = i < count;
                const charge = v.debt.kind === 'installments' && x.seq > v.installments.length;
                return (
                  <Press key={x.seq} soft accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setCount(on && i === count - 1 ? i : i + 1)} style={[s.tick, { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accentFill : t.border }]}>
                    <View style={[s.box, { borderColor: on ? t.accentFill : t.border, backgroundColor: on ? t.accentFill : 'transparent' }]}>{on ? <Icon name="check" size={16} color="#FFFFFF" width={3} /> : null}</View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T v="row">{charge ? 'Charges' : `#${x.seq}`} · {fShort(x.due_on)}</T>
                      {x.covered ? <T v="meta" tone="muted">{money(x.short)} left of {money(x.amount)}</T> : null}
                    </View>
                    {x.due_on < today ? <Pill state="overdue" /> : null}
                    <T v="row">{money(x.short)}</T>
                  </Press>
                );
              })}
            </View>
            {!showAll && open.length > count + 3 ? <LinkBtn label={`Show ${open.length - count - 3} more ${open.length - count - 3 === 1 ? 'month' : 'months'}`} onPress={() => setShowAll(true)} /> : null}
          </>
        ) : (
          <>
            {kind === 'payment' && !existing && v.bal.remaining > 0 ? (
              <View style={[s.chips, { marginBottom: 14 }]}>
                {v.next ? <Chip label={`Next due ${money(v.next.amount)}`} on={amount === v.next.amount} onPress={() => set('amount', pesosToInput(v.next!.amount))} /> : null}
                {v.debt.kind !== 'recurring' ? <Chip label={`Full balance ${money(v.bal.remaining)}`} on={amount === v.bal.remaining} onPress={() => set('amount', pesosToInput(v.bal.remaining))} /> : null}
              </View>
            ) : null}
            <Field label="Amount" error={f.amount ? errors.amount : undefined}>
              <Input label="Amount" value={f.amount} onChangeText={(x) => set('amount', x)} placeholder="0.00" keyboardType="decimal-pad" prefix={symbolOf(cur).trim()} maxLength={16} />
            </Field>
          </>
        )}

        {kind === 'charge' ? (
          <Field label="What kind of charge?">
            <View style={s.chips}>{CHARGE_KINDS.map((c) => <Chip key={c.key} label={c.label} on={f.chargeKind === c.key} onPress={() => set('chargeKind', c.key as ChargeKind)} />)}</View>
          </Field>
        ) : null}

        <View style={{ marginTop: 14 }}>
          <Field label={kind === 'payment' ? 'Payment date' : 'Date'} error={errors.date}>
            <DateField label="Date" value={f.date} max={today} onChange={(x) => set('date', x)} />
          </Field>
        </View>

        {kind === 'payment' ? (
          <Field label="Method" error={errors.method}>
            <NamePicker value={f.method} onChange={(m) => set('method', m)} defaults={DEFAULT_METHODS} custom={customMethods} placeholder="e.g. BPI, Palawan, UnionBank" />
          </Field>
        ) : null}

        <Field label="Note" optional error={errors.note}>
          <Input label="Note" value={f.note} onChangeText={(x) => set('note', x)} placeholder={kind === 'payment' ? 'Reference number, who received it…' : kind === 'addition' ? 'What it was for' : 'Add a note'} maxLength={300} />
        </Field>

        {left !== null && left < 0 && v.debt.kind !== 'recurring' ? <Banner tone="warn" text={`That is ${money(-left)} more than what is left. It will show as overpaid.`} /> : null}
        {kind === 'charge' ? <Banner text="Only record a charge the lender really added. Patas never works out fees or interest by itself." /> : null}
        {existing ? <LinkBtn tone="danger" label={`Delete this ${noun}`} onPress={() => setAsk(true)} /> : null}
      </ScrollView>

      <View style={[s.pinned, { backgroundColor: t.tabGlass, borderTopColor: t.tabBorder, paddingBottom: Math.max(insets.bottom, 12) }]} {...({ dataSet: { glass: 'bar' } } as object)}>
        {ticks ? (
          <View style={s.paybar}>
            <View style={{ flex: 1 }}>
              <T v="meta" tone="muted">{count} selected</T>
              <Text numberOfLines={1} style={[TY.card, { color: t.text }]}>{money(ticks.total)}</Text>
            </View>
            <View style={{ flex: 1 }}><Button label="Pay selected" disabled={!valid} onPress={save} /></View>
          </View>
        ) : (
          <Button label={existing ? 'Save changes' : kind === 'payment' ? 'Save payment' : kind === 'charge' ? 'Save charge' : 'Save'} disabled={!valid} onPress={save} />
        )}
      </View>
      <ConfirmPop
        visible={ask}
        title={`Delete this ${noun}?`}
        body="What is left on this debt is worked out again without it."
        action="Delete"
        onCancel={() => setAsk(false)}
        onConfirm={() => { setAsk(false); if (existing) store.deleteLine(existing.id); toast(`${noun[0]!.toUpperCase()}${noun.slice(1)} deleted`, { quiet: true }); onClose(); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  otherRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  otherInp: { flex: 1, borderWidth: 1, borderRadius: 12, minHeight: 52, justifyContent: 'center', paddingHorizontal: 14 },
  input: { fontFamily: 'Manrope_500', fontSize: 16, minHeight: 50 },
  addBtn: { minHeight: 52, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pinned: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  paybar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
