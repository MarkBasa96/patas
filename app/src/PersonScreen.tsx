// A person's page (round 4): everything owed to one name (trimmed, any case): remaining, borrowed, paid, their
// payment QR, Borrow again, their debts, and a dated ledger with the running balance.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { personQrId } from './DebtDetail';
import { Icon } from './icons';
import { people, personLedger, type LedgerEntry } from './insights';
import { Bar, DebtRow, Empty, fMonth, fShort, Header, LinkBtn, ListCard, PersonAvatar, plural, Row, T, useMoney } from './kit';
import { Press, useToast } from './motion';
import { pickImage, usePhotos } from './photos';
import { todayIso } from './plan';
import { useQrs } from './qrs';
import { useSettings } from './settings';
import { useStore } from './store';
import { Button } from './ui';

export function PersonScreen({ personKey: key, onBack, onOpen, onBorrowAgain, onShowQr, onAddQr }: { personKey: string; onBack: () => void; onOpen: (id: string) => void; onBorrowAgain: (person: string) => void; onShowQr: (id: string) => void; onAddQr: (person: string) => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const { qrs } = useQrs();
  const photos = usePhotos();
  const toast = useToast();
  const { conv, display, fmtSum, fmtIn } = useMoney();
  const [showSettled, setShowSettled] = useState(false);
  const today = todayIso();
  const p = useMemo(() => people(store.views, conv, display).find((x) => x.key === key), [store.views, conv, display, key]);
  const led = useMemo(() => personLedger(store.views, key, today), [store.views, key, today]);
  if (!p) {
    return (
      <View style={[s.page, { paddingTop: insets.top }]}>
        <Header back="Back" onBack={onBack} />
        <Empty text="Nobody by that name." />
      </View>
    );
  }
  // The running balance after each entry, oldest first (in each debt's own currency; one currency per person is the
  // usual case, so the balance reads in that one).
  const chrono = [...led].reverse();
  const after = new Map<LedgerEntry, number>();
  let bal = 0;
  for (const e of chrono) {
    bal += e.kind === 'payment' || e.kind === 'writeoff' ? -e.amount : e.amount;
    after.set(e, bal);
  }
  const cur = p.views[0]?.debt.currency ?? display;
  const oneCurrency = p.views.every((v) => v.debt.currency === cur);
  const since = chrono[0]?.date ?? today;
  const pct = p.borrowed.total ? Math.min(100, Math.floor((p.paid.total * 100) / p.borrowed.total)) : 0;
  const act = p.views.filter((v) => v.state !== 'settled');
  const set = p.views.filter((v) => v.state === 'settled');
  const qrId = personQrId(store.views, p.name);
  const qr = qrId ? qrs.find((q) => q.id === qrId) : undefined;
  const hasPhoto = !!photos.urlFor({ person: p.name });
  const byMonth = new Map<string, LedgerEntry[]>();
  for (const e of led) byMonth.set(e.date.slice(0, 7), [...(byMonth.get(e.date.slice(0, 7)) ?? []), e]);
  const editPhoto = async () => {
    const pic = await pickImage();
    if (!pic) return;
    const err = await photos.set({ person: p.name }, pic);
    toast(err ?? 'Photo saved', err ? { quiet: true } : undefined);
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.page, { paddingBottom: 32 }]}>
        <Header back="Back" onBack={onBack} />
        <View style={s.who}>
          <Press accessibilityRole="button" accessibilityLabel={`${hasPhoto ? 'Change' : 'Add'} a photo for ${p.name}`} onPress={() => void editPhoto()} style={{ borderRadius: 28 }}>
            <PersonAvatar name={p.name} size={56} />
            <View style={[s.cam, { backgroundColor: t.surface, borderColor: t.border }]}><Icon name="image" size={12} color={t.muted} /></View>
          </Press>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="greet" lines={2}>{p.name}</T>
            <T v="meta" tone="muted">{plural(p.views.length, 'debt')} · since {fMonth(since.slice(0, 7))}</T>
            {hasPhoto ? <View style={{ alignSelf: 'flex-start' }}><LinkBtn tone="danger" label="Remove photo" onPress={() => void photos.remove({ person: p.name }).then((e) => toast(e ?? 'Photo removed', { quiet: true }))} /></View> : null}
          </View>
        </View>

        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <T v="meta" tone="muted">Remaining</T>
          <T v="pop">{fmtSum(p.remaining)}</T>
          <View style={[s.between, { marginTop: 8 }]}>
            <T v="row" style={{ fontFamily: 'Manrope_500' }}>Borrowed <T v="row">{fmtSum(p.borrowed)}</T></T>
            <T v="row" style={{ fontFamily: 'Manrope_500' }}>Paid <T v="row">{fmtSum(p.paid)}</T></T>
          </View>
          <Bar pct={pct} h={8} style={{ marginTop: 8 }} />
        </View>

        <Press soft accessibilityRole="button" onPress={() => (qr ? onShowQr(qr.id) : onAddQr(p.name))} style={[s.card, s.qrRow, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[s.qrIcon, { backgroundColor: t.accentSoft }]}><Icon name="qr" color={t.accent} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="row">{qr ? 'Pay with QR' : 'Add payment QR'}</T>
            <T v="meta" tone="muted" lines={1}>{qr ? `${qr.wallet === 'other' ? qr.label : qr.wallet} · ${qr.account_name}` : `For ${p.name} · pay in one tap`}</T>
          </View>
          <Icon name="right" size={18} color={t.muted} />
        </Press>

        <View style={{ marginTop: 12 }}><Button kind="outline" label="+ Borrow again" onPress={() => onBorrowAgain(p.name)} /></View>

        <T v="sec" style={s.sec}>Debts</T>
        <ListCard>{act.length ? act.map((v, i) => <DebtRow key={v.debt.id} v={v} inPerson first={i === 0} onPress={() => onOpen(v.debt.id)} />) : <Empty text="No open debts." />}</ListCard>
        {set.length ? (
          <>
            <LinkBtn label={`${showSettled ? 'Hide settled' : 'Settled'} (${set.length})`} onPress={() => setShowSettled((x) => !x)} />
            {showSettled ? <ListCard>{set.map((v, i) => <DebtRow key={v.debt.id} v={v} inPerson first={i === 0} onPress={() => onOpen(v.debt.id)} />)}</ListCard> : null}
          </>
        ) : null}

        <T v="sec" style={s.sec}>History</T>
        {led.length ? [...byMonth].map(([m, rows]) => (
          <View key={m}>
            <T v="meta" tone="muted" style={{ fontFamily: 'Manrope_600', marginTop: 10, marginBottom: 6 }}>{fMonth(m)}</T>
            <ListCard>
              {rows.map((e, i) => {
                const b = after.get(e) ?? 0;
                const pay = e.kind === 'payment' || e.kind === 'writeoff';
                const label = e.kind === 'payment' ? 'Paid' : e.kind === 'writeoff' ? 'Written off' : e.kind === 'charge' ? 'Charge' : e.line?.kind === 'addition' ? 'Borrowed more' : e.view.debt.kind === 'recurring' ? 'Due' : 'Borrowed';
                return (
                  <Row key={`${e.view.debt.id}:${e.line?.id ?? e.date}:${i}`} first={i === 0} onPress={() => onOpen(e.view.debt.id)} style={{ alignItems: 'flex-start' }}>
                    <T v="meta" style={{ width: 48, fontFamily: 'Manrope_700', marginTop: 1 }}>{fShort(e.date)}</T>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.between}>
                        <T v="row">{label}</T>
                        <T v="row" tone={pay ? 'ok' : 'text'}>{pay ? '−' : '+'} {fmtIn(e.amount, e.currency)}</T>
                      </View>
                      <T v="meta" tone="muted" lines={2}>
                        {e.view.debt.title || 'Debt'}{e.line?.method ? ` · ${e.line.method}` : ''}{e.line?.note ? ` · ${e.line.note}` : ''}
                        {oneCurrency ? ` · ${b < 0 ? `ahead ${fmtIn(-b, cur)}` : `balance ${fmtIn(b, cur)}`}` : ''}
                      </T>
                    </View>
                  </Row>
                );
              })}
            </ListCard>
          </View>
        )) : <Empty text="Nothing recorded yet." />}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cam: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 20, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, marginTop: 16 },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  qrIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sec: { marginTop: 22, marginBottom: 8 },
});
