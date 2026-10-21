import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StateTag } from './DebtsScreen';
import type { LineRow } from './ledger';
import { CHARGE_KINDS, history } from './lines';
import { formatPesos } from './money';
import { formatLong, formatShort, todayIso } from './plan';
import { useSettings } from './settings';
import { shareText } from './dataIO';
import { debtSummary } from './exportData';
import { qrWarning } from './qr';
import { useNow, warningText } from './QrScreens';
import { useQrs } from './qrs';
import { useStore } from './store';
import { Avatar, Banner, Button, Confirm, fitFontSize, ProgressBar } from './ui';

export function DebtDetail({ id, onBack, onEdit, onDeleted, onLine, onShowQr, onAddQr }: { id: string; onBack: () => void; onEdit: () => void; onDeleted: () => void; onLine: (kind: 'payment' | 'charge', editId?: string) => void; onShowQr: (qrId: string) => void; onAddQr: (person: string) => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const page = Math.min(useWindowDimensions().width, 560) - 32;
  const { views, remove, settleDebt, reopenDebt } = useStore();
  const { qrs } = useQrs();
  const now = useNow();
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'delete' | 'settle'>(null);
  const v = views.find((x) => x.debt.id === id);

  if (!v) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: insets.top + 24 }}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: t.text, marginBottom: 16 }}>That debt is not here any more.</Text>
        <Button label="Back to my debts" onPress={onBack} />
      </View>
    );
  }
  const d = v.debt;
  const settled = v.state === 'settled';
  const qr = d.qr_id ? qrs.find((q) => q.id === d.qr_id) : undefined;
  const qrWarn = qr ? warningText(qrWarning(qr, d.qr_linked_at ?? null, now)) : null;
  const payments = history(v, ['payment']);
  const charges = history(v, ['charge']);
  const writeOffs = history(v, ['writeoff']);
  const writeOffTotal = writeOffs.reduce((n, l) => n + l.amount_centavos, 0);

  const row = (l: LineRow, label: string, onPress?: () => void) => (
    <Pressable key={l.id} accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={[s.hrow, { borderBottomColor: t.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: t.text }}>{formatLong(l.on_date)}</Text>
        <Text numberOfLines={1} style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: t.muted }}>{label}{l.note ? ` · ${l.note}` : ''}</Text>
      </View>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: t.text }}>{formatPesos(l.amount_centavos)}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[s.head, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={s.headBtn}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: t.accent }}>‹ Back</Text>
        </Pressable>
        <Text style={[s.title, { color: t.text }]}>Debt details</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => setMenu((m) => !m)} style={[s.headBtn, { alignItems: 'flex-end' }]}>
          <Text style={{ fontFamily: 'Inter_800ExtraBold', fontSize: 22, color: t.accent, textAlign: 'right' }}>⋯</Text>
        </Pressable>
      </View>
      {menu ? (
        <View style={[s.menu, { backgroundColor: t.surface, borderColor: t.border }]}>
          <MenuItem label="Edit debt" onPress={() => { setMenu(false); onEdit(); }} />
          <MenuItem label="Share summary" onPress={() => { setMenu(false); void shareText(debtSummary(v, todayIso())).then((r) => setNotice(r === 'copied' ? 'Summary copied. Paste it where you like.' : r === 'shared' ? 'Summary shared.' : r === 'failed' ? 'Could not share the summary.' : null)); }} />
          {qr ? <MenuItem label="Show payment QR" onPress={() => { setMenu(false); onShowQr(qr.id); }} /> : <MenuItem label="Add payment QR" onPress={() => { setMenu(false); onAddQr(d.person_name); }} />}
          {!settled ? <MenuItem label="Add charge" onPress={() => { setMenu(false); onLine('charge'); }} /> : null}
          {!settled ? <MenuItem label="Mark as settled" onPress={() => { setMenu(false); setConfirm('settle'); }} /> : null}
          <MenuItem label="Delete debt" danger onPress={() => { setMenu(false); setConfirm('delete'); }} />
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.body, { paddingBottom: 120 }]}>
        <View style={s.who}>
          <Avatar name={d.person_name} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: t.text }}>{d.person_name}</Text>
            {d.title ? <Text numberOfLines={2} style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: t.muted }}>{d.title}</Text> : null}
          </View>
          <StateTag state={v.state} />
        </View>

        <Text style={[s.big, { color: t.text, fontSize: fitFontSize(formatPesos(v.bal.remaining), 38, page) }]}>{formatPesos(v.bal.remaining)}</Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 16, color: t.muted, marginBottom: 12 }}>remaining</Text>
        {v.bal.overpaid > 0 ? <Banner tone="warn" text={`Overpaid ${formatPesos(v.bal.overpaid)}.`} /> : null}
        {v.state === 'overdue' && v.next ? <Banner tone="warn" text={`${formatPesos(v.next.amount)} was due ${formatLong(v.next.date)}.`} /> : null}
        {notice ? <Banner text={notice} /> : null}
        {qrWarn && !settled ? <Banner tone="warn" text={qrWarn} /> : null}
        {settled && d.settled_on ? <Banner text={`Settled on ${formatLong(d.settled_on)}${writeOffTotal ? ` · ${formatPesos(writeOffTotal)} written off` : ''}.`} /> : null}

        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[s.between, { marginBottom: 8 }]}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: t.text }}>{formatPesos(v.bal.paid)} of {formatPesos(v.bal.owed)} paid</Text>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: t.muted }}>{v.bal.pct}%</Text>
          </View>
          <ProgressBar pct={v.bal.pct} />
        </View>

        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: t.muted }}>{d.kind === 'installments' ? 'Next due' : 'Due date'}</Text>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: t.text, marginTop: 2 }}>
            {d.kind === 'installments' ? (v.next ? `${formatPesos(v.next.amount)} on ${formatLong(v.next.date)}` : 'All paid') : d.due_on ? formatLong(d.due_on) : 'Pay when I can'}
          </Text>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: t.muted, marginTop: 10 }}>Reminder</Text>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: t.text, marginTop: 2 }}>{d.remind ? 'On' : 'Off'}</Text>
        </View>

        {d.note ? (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: t.muted }}>Notes</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21, color: t.text, marginTop: 2 }}>{d.note}</Text>
          </View>
        ) : null}

        {d.kind === 'installments' ? (
          <View style={{ marginTop: 6 }}>
            <Text style={[s.h3, { color: t.text }]}>Payment schedule</Text>
            {v.bal.statuses.map((st) => (
              <View key={st.seq} style={[s.hrow, { borderBottomColor: t.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: t.text }}>#{st.seq} · {formatShort(st.due_on)}</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: st.status === 'paid late' ? t.warn : t.muted }}>{st.status === 'partly paid' ? `${formatPesos(st.short)} short` : st.status}</Text>
                </View>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: t.text }}>{formatPesos(st.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[s.h3, { color: t.text, marginTop: 18 }]}>Payment history</Text>
        {payments.length ? payments.map((l) => row(l, l.method || 'Payment', () => onLine('payment', l.id))) : <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: t.muted }}>No payments yet.</Text>}

        {charges.length ? (
          <>
            <Text style={[s.h3, { color: t.text, marginTop: 18 }]}>Charges</Text>
            {charges.map((l) => row(l, CHARGE_KINDS.find((c) => c.key === l.charge_kind)?.label ?? 'Charge', () => onLine('charge', l.id)))}
          </>
        ) : null}
        {writeOffs.length ? (
          <>
            <Text style={[s.h3, { color: t.text, marginTop: 18 }]}>Written off</Text>
            {writeOffs.map((l) => row(l, 'Forgiven or discounted'))}
          </>
        ) : null}
      </ScrollView>

      <View style={[s.save, { backgroundColor: t.bg, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        {settled ? (
          <Button label="Reopen debt" kind="outline" onPress={() => reopenDebt(id)} />
        ) : qr ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Pay with QR" kind="outline" onPress={() => onShowQr(qr.id)} /></View>
            <View style={{ flex: 1 }}><Button label="Log payment" onPress={() => onLine('payment')} /></View>
          </View>
        ) : (
          <Button label="Log payment" onPress={() => onLine('payment')} />
        )}
      </View>

      <Confirm
        visible={confirm === 'delete'}
        title="Delete this debt?"
        body="It disappears from your lists on every device."
        confirmLabel="Delete debt"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); remove(id); onDeleted(); }}
      />
      <Confirm
        visible={confirm === 'settle'}
        tone="primary"
        title={v.bal.remaining > 0 ? 'Settle this debt?' : 'Mark as settled?'}
        body={v.bal.remaining > 0 ? `${formatPesos(v.bal.remaining)} is still left. Write it off as a discount or forgiven amount? The history keeps it as its own labelled line.` : 'Everything is paid. It moves to your settled debts and can be reopened.'}
        confirmLabel={v.bal.remaining > 0 ? `Write off ${formatPesos(v.bal.remaining)} and settle` : 'Mark as settled'}
        extraLabel={v.bal.remaining > 0 ? 'Settle without writing off' : undefined}
        onExtra={() => { setConfirm(null); settleDebt(id, false); }}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); settleDebt(id, true); }}
      />
    </View>
  );

  function MenuItem({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={s.menuItem}>
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: danger ? t.danger : t.text }}>{label}</Text>
      </Pressable>
    );
  }
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  headBtn: { minHeight: 44, minWidth: 64, justifyContent: 'center' }, // 44px to tap (hitSlop does nothing on the web build)
  body: { paddingHorizontal: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  big: { fontFamily: 'Inter_800ExtraBold', fontSize: 38, letterSpacing: -0.8 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  h3: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 8 },
  hrow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  menu: { position: 'absolute', right: 16, top: 96, zIndex: 20, borderWidth: 1, borderRadius: 14, minWidth: 190, overflow: 'hidden' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14 },
  save: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
});
