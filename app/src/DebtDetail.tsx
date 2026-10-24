// Debt details (round 4): who and what, remaining (≈ in the display currency when typed in another), progress, the
// Reminder row (per-debt), the person's history, the payment schedule, payments; the ⋯ menu (Edit, Borrow again,
// Share summary, Add charge, Mark as settled, Delete); pinned Log payment and Pay with QR (or "Add their payment QR").
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shareText } from './dataIO';
import type { DebtView } from './derive';
import { debtSummary } from './exportData';
import { Icon, type IconName } from './icons';
import { personKey, people } from './insights';
import { Bar, Empty, fLong, fShort, Header, IconBtn, KIND_LABEL, ListCard, Pill, PersonAvatar, plural, Row, T, timeLabel, useMoney } from './kit';
import { history, CHARGE_KINDS } from './lines';
import { ConfirmPop, Press, Sheet, useToast } from './motion';
import { pickImage, usePhotos } from './photos';
import { addDays, todayIso } from './plan';
import { REMINDER_TIMES } from './pushLogic';
import { qrWarning } from './qr';
import { useNow, warningText } from './QrScreens';
import { useQrs } from './qrs';
import { useSettings } from './settings';
import { useStore } from './store';
import { Banner, Button, Toggle } from './ui';

type Nav = {
  id: string; back: string; onBack: () => void; onEdit: () => void; onDeleted: () => void; onBorrowAgain: (person: string) => void;
  onLine: (kind: 'payment' | 'charge' | 'addition', editId?: string) => void; onShowQr: (qrId: string) => void; onAddQr: (person: string) => void; onPerson: (key: string) => void;
};

/** The QR that pays this person: the debt's own, else any of the person's debts' (one QR per person). */
export function personQrId(views: DebtView[], name: string, own?: string | null): string | null {
  if (own) return own;
  const k = personKey(name);
  return views.find((v) => v.debt.qr_id && personKey(v.debt.person_name) === k)?.debt.qr_id ?? null;
}

/** The dates this debt's reminders fire for its next unpaid amount (today or later). */
export function reminderDates(v: DebtView, days: number[], on: string | null, today: string): string[] {
  if (!v.next) return on && on >= today ? [on] : [];
  const out = days.map((d) => addDays(v.next!.date, -d)).concat(on ? [on] : []);
  return [...new Set(out)].filter((x) => x >= today).sort();
}
const list = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

export function DebtDetail(nav: Nav) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const { qrs } = useQrs();
  const photos = usePhotos();
  const toast = useToast();
  const { conv, display, fmt, fmtIn, fmtSum } = useMoney();
  const now = useNow();
  const [menu, setMenu] = useState(false);
  const [remind, setRemind] = useState(false);
  const [ask, setAsk] = useState<null | 'delete' | 'settle'>(null);
  const v = store.views.find((x) => x.debt.id === nav.id);
  if (!v) {
    return (
      <View style={[s.page, { paddingTop: insets.top }]}>
        <Header back={nav.back} onBack={nav.onBack} />
        <Empty text="That debt is not here any more." />
      </View>
    );
  }
  const d = v.debt;
  const cur = d.currency;
  const money = (c: number) => fmtIn(c, cur);
  const today = todayIso();
  const rec = d.kind === 'recurring';
  const settled = v.state === 'settled';
  const qrId = personQrId(store.views, d.person_name, d.qr_id);
  const qr = qrId ? qrs.find((q) => q.id === qrId) : undefined;
  const qrWarn = qr ? warningText(qrWarning(qr, d.qr_linked_at ?? null, now)) : null;
  const pays = history(v, ['payment']);
  const charges = history(v, ['charge', 'addition']);
  const writeOffs = history(v, ['writeoff']);
  const person = people(store.views, conv, display).find((p) => p.key === personKey(d.person_name));
  const dates = reminderDates(v, d.remind_days, d.remind_on, today);
  const at = d.remind_at ?? null;
  const remTxt = !d.remind ? 'Off' : dates.length ? `${list(dates.map(fShort))}${at ? ` at ${timeLabel(at)}` : ''}` : d.remind_days.length ? d.remind_days.map((o) => (o === 0 ? 'on the day' : `${o} ${o === 1 ? 'day' : 'days'} before`)).join(', ') : 'On';
  const late = v.schedule.filter((x) => x.short > 0 && x.due_on < today).reduce((n, x) => n + x.short, 0);
  const editPhoto = async () => {
    const pic = await pickImage();
    if (!pic) return;
    const err = await photos.set({ person: d.person_name }, pic);
    toast(err ?? 'Photo saved', err ? { quiet: true } : undefined);
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.page, { paddingBottom: 120 }]}>
        <Header back={nav.back} onBack={nav.onBack} right={<IconBtn name="more" label="More actions" onPress={() => setMenu(true)} />} />
        <View style={s.who}>
          <Press accessibilityRole="button" accessibilityLabel={`Add or change a photo for ${d.person_name}`} onPress={() => void editPhoto()} style={{ borderRadius: 24 }}>
            <PersonAvatar name={d.person_name} size={48} />
            <View style={[s.cam, { backgroundColor: t.surface, borderColor: t.border }]}><Icon name="image" size={12} color={t.muted} /></View>
          </Press>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="greet" lines={2}>{d.person_name}</T>
            <T v="meta" tone="muted" lines={1}>{d.title ? `${d.title} · ` : ''}{KIND_LABEL[d.kind]}</T>
          </View>
          <Pill state={v.state === 'overdue' ? 'overdue' : v.state === 'today' ? 'today' : settled ? 'settled' : ''} />
        </View>

        <View style={{ marginTop: 16 }}>
          {rec ? (
            <>
              <T v="hero" lines={1}>{money(d.recurring_amount_centavos ?? 0)}</T>
              <T v="body" tone="muted">{d.recurring_every === 'weekly' ? 'every week' : d.recurring_every === 'biweekly' ? 'every 2 weeks' : 'every month'}{v.next ? ` · next ${fShort(v.next.date)}` : ''}{v.bal.remaining > 0 ? ` · ${money(v.bal.remaining)} due now` : ''}</T>
            </>
          ) : (
            <>
              <T v="hero" lines={1}>{money(v.bal.remaining)}</T>
              <T v="body" tone="muted">remaining{cur !== display ? ` · ${fmtSum({ total: conv(v.bal.remaining, cur) ?? v.bal.remaining, approx: true })}` : ''}</T>
            </>
          )}
        </View>
        {v.state === 'overdue' && v.next ? (
          <View style={[s.overdue, { backgroundColor: t.redBg }]}>
            <Icon name="alert" size={18} color={t.danger} />
            <Text style={{ flex: 1, fontFamily: 'Manrope_600', fontSize: 15, color: t.danger }}>{money(late)} was due {fLong(v.next.date)}</Text>
          </View>
        ) : null}
        {v.bal.overpaid > 0 ? <View style={{ marginTop: 12 }}><Banner tone="warn" text={`Overpaid ${money(v.bal.overpaid)}.`} /></View> : null}
        {qrWarn && !settled ? <View style={{ marginTop: 12 }}><Banner tone="warn" text={qrWarn} /></View> : null}
        {settled && d.settled_on ? <View style={{ marginTop: 12 }}><Banner text={`Settled on ${fLong(d.settled_on)}${writeOffs.length ? ` · ${money(writeOffs.reduce((n, l) => n + l.amount_centavos, 0))} written off` : ''}.`} /></View> : null}

        {rec ? null : (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={s.between}>
              <T v="meta">{money(Math.min(v.bal.paid, v.bal.owed))} of {money(v.bal.owed)} paid</T>
              <T v="meta" tone="muted">{v.bal.pct}%</T>
            </View>
            <Bar pct={v.bal.pct} h={8} style={{ marginTop: 8 }} />
          </View>
        )}

        <ListCard style={{ marginTop: 12 }}>
          <Row first>
            <Press accessibilityRole="button" accessibilityLabel="Reminder settings" onPress={() => setRemind(true)} style={s.remRow}>
              <Icon name="bell" color={t.muted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="row">Reminder</T>
                <T v="meta" tone="muted" lines={1}>{remTxt}</T>
              </View>
            </Press>
            <Toggle label="Remind me about this debt" value={d.remind} onValueChange={(on) => { store.saveReminder(d.id, { remind: on, days: d.remind_days, on: d.remind_on, at: d.remind_at }); toast(on ? 'Reminder on' : 'Reminder off', { quiet: true }); }} />
          </Row>
          {qr ? null : (
            <NavRow icon="qr" title="Add payment QR" sub={`For ${d.person_name} · pay in one tap`} onPress={() => nav.onAddQr(d.person_name)} />
          )}
          <NavRow icon="hist" title={`History with ${d.person_name}`} sub={person ? `${plural(person.views.length, 'debt')} · ${fmt(person.paid.total)} paid` : ''} onPress={() => nav.onPerson(personKey(d.person_name))} />
        </ListCard>

        {d.note ? (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <T v="meta" tone="muted">Notes</T>
            <T v="body" style={{ marginTop: 2 }}>{d.note}</T>
          </View>
        ) : null}

        {d.kind !== 'one_time' ? (
          <>
            <T v="sec" style={s.sec}>{rec ? 'Coming up' : 'Payment schedule'}</T>
            <ListCard>
              {(rec ? v.schedule.slice(Math.max(0, v.schedule.length - 6)) : v.schedule).map((x, i) => {
                const charge = d.kind === 'installments' && i === v.installments.length;
                const state = x.short === 0 ? (x.status === 'paid late' ? 'paid late' : 'paid') : x.due_on < today ? 'overdue' : x.covered > 0 ? `${money(x.short)} left` : '';
                return (
                  <Row key={x.seq} first={i === 0} style={{ minHeight: 56 }}>
                    <View style={{ flex: 1 }}>
                      <T v="row">{charge ? 'Charges' : `#${x.seq}`} · {fShort(x.due_on)}</T>
                      {state ? <T v="meta" tone={state === 'overdue' ? 'danger' : x.short === 0 ? 'ok' : 'muted'}>{state}</T> : null}
                    </View>
                    <T v="row">{money(x.amount)}</T>
                  </Row>
                );
              })}
            </ListCard>
          </>
        ) : d.due_on ? (
          <T v="meta" tone="muted" style={{ marginTop: 12 }}>Due by {fLong(d.due_on)}</T>
        ) : (
          <T v="meta" tone="muted" style={{ marginTop: 12 }}>No due date: pay when you can.</T>
        )}

        <T v="sec" style={s.sec}>Payments</T>
        <ListCard>
          {pays.length ? pays.map((l, i) => (
            <Row key={l.id} first={i === 0} onPress={() => nav.onLine('payment', l.id)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="row">{fLong(l.on_date)}</T>
                <T v="meta" tone="muted" lines={1}>{l.method || 'Payment'}{l.note ? ` · ${l.note}` : ''}</T>
              </View>
              <T v="row">{money(l.amount_centavos)}</T>
              <Icon name="right" size={18} color={t.muted} />
            </Row>
          )) : <Empty text="No payments yet." />}
        </ListCard>
        {charges.length ? (
          <>
            <T v="sec" style={s.sec}>Added to this debt</T>
            <ListCard>
              {charges.map((l, i) => (
                <Row key={l.id} first={i === 0} onPress={() => nav.onLine(l.kind === 'addition' ? 'addition' : 'charge', l.id)}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T v="row">{fLong(l.on_date)}</T>
                    <T v="meta" tone="muted" lines={1}>{l.kind === 'addition' ? 'Borrowed more' : CHARGE_KINDS.find((c) => c.key === l.charge_kind)?.label ?? 'Charge'}{l.note ? ` · ${l.note}` : ''}</T>
                  </View>
                  <T v="row">+ {money(l.amount_centavos)}</T>
                </Row>
              ))}
            </ListCard>
          </>
        ) : null}
      </ScrollView>

      <View style={[s.pinned, { backgroundColor: t.tabGlass, borderTopColor: t.tabBorder, paddingBottom: Math.max(insets.bottom, 12) }]} {...({ dataSet: { glass: 'bar' } } as object)}>
        {settled ? (
          <Button label="Reopen debt" kind="outline" onPress={() => { store.reopenDebt(d.id); toast('Debt reopened'); }} />
        ) : qr ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Pay with QR" kind="outline" onPress={() => nav.onShowQr(qr.id)} /></View>
            <View style={{ flex: 1 }}><Button label="Log payment" onPress={() => nav.onLine('payment')} /></View>
          </View>
        ) : (
          <Button label="Log payment" onPress={() => nav.onLine('payment')} />
        )}
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)} title={d.person_name}>
        <Action icon="pencil" label="Edit debt" onPress={() => { setMenu(false); nav.onEdit(); }} />
        <Action icon="plus" label={`Borrow again from ${d.person_name}`} onPress={() => { setMenu(false); nav.onBorrowAgain(d.person_name); }} />
        {d.kind === 'one_time' && !settled ? <Action icon="coins" label="Borrowed more on this debt" onPress={() => { setMenu(false); nav.onLine('addition'); }} /> : null}
        {!settled ? <Action icon="alert" label="Add a charge (late fee, interest)" onPress={() => { setMenu(false); nav.onLine('charge'); }} /> : null}
        <Action icon="swap" label="Share summary" onPress={() => { setMenu(false); void shareText(debtSummary(v, today)).then((r) => r !== 'cancelled' && toast(r === 'copied' ? 'Summary copied' : r === 'shared' ? 'Summary shared' : 'Could not share the summary', { quiet: r === 'failed' })); }} />
        {qr ? <Action icon="qr" label="Show payment QR" onPress={() => { setMenu(false); nav.onShowQr(qr.id); }} /> : null}
        {!settled ? <Action icon="check" label="Mark as settled" onPress={() => { setMenu(false); setAsk('settle'); }} /> : null}
        <View style={{ height: 12 }} />
        <Action icon="trash" label="Delete debt" danger onPress={() => { setMenu(false); setAsk('delete'); }} />
      </Sheet>

      <ReminderSheet visible={remind} v={v} onClose={() => setRemind(false)} />

      <ConfirmPop visible={ask === 'delete'} title="Delete this debt?" body="It disappears from your lists on every device." action="Delete debt" onCancel={() => setAsk(null)} onConfirm={() => { setAsk(null); store.remove(d.id); toast('Debt deleted', { quiet: true }); nav.onDeleted(); }} />
      <SettlePop visible={ask === 'settle'} v={v} money={money} onClose={() => setAsk(null)} />
    </View>
  );
}

function NavRow({ icon, title, sub, onPress }: { icon: IconName; title: string; sub?: string; onPress: () => void }) {
  const { t } = useSettings();
  return (
    <Row onPress={onPress} label={title}>
      <Icon name={icon} color={t.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="row" lines={1}>{title}</T>
        {sub ? <T v="meta" tone="muted" lines={1}>{sub}</T> : null}
      </View>
      <Icon name="right" size={18} color={t.muted} />
    </Row>
  );
}

export function Action({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const { t } = useSettings();
  return (
    <Press soft accessibilityRole="button" onPress={onPress} style={[s.action, { backgroundColor: danger ? t.redBg : t.field }]}>
      <Icon name={icon} color={danger ? t.danger : t.muted} />
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: 'Manrope_600', fontSize: 16, color: danger ? t.danger : t.text }}>{label}</Text>
    </Press>
  );
}

function SettlePop({ visible, v, money, onClose }: { visible: boolean; v: DebtView; money: (c: number) => string; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const left = v.bal.remaining;
  const done = (writeOff: boolean) => { onClose(); store.settleDebt(v.debt.id, writeOff); toast('Debt settled'); };
  return (
    <Sheet visible={visible} onClose={onClose} title={left > 0 ? 'Settle this debt?' : 'Mark as settled?'}>
      <T v="body" tone="muted" style={{ marginBottom: 16 }}>{left > 0 ? `${money(left)} is still left. Write it off as a discount or forgiven amount? The history keeps it as its own labelled line.` : 'Everything is paid. It moves to your settled debts and can be reopened.'}</T>
      <View style={{ gap: 10 }}>
        <Button label={left > 0 ? `Write off ${money(left)} and settle` : 'Mark as settled'} onPress={() => done(true)} />
        {left > 0 ? <Button label="Settle without writing off" kind="outline" onPress={() => done(false)} /> : null}
      </View>
    </Sheet>
  );
}

/** Per-debt reminders: on/off, same day / 1 / 3 / 7 days before, an extra date, one time for all of them. */
function ReminderSheet({ visible, v, onClose }: { visible: boolean; v: DebtView; onClose: () => void }) {
  const { t } = useSettings();
  const store = useStore();
  const toast = useToast();
  const today = todayIso();
  const [on, setOn] = useState<boolean | null>(null);
  const [days, setDays] = useState<number[] | null>(null);
  const [date, setDate] = useState<string | null | undefined>(undefined);
  const [at, setAt] = useState<string | null | undefined>(undefined);
  const r = { on: on ?? v.debt.remind, days: days ?? v.debt.remind_days, date: date === undefined ? v.debt.remind_on : date, at: at === undefined ? v.debt.remind_at : at };
  const dates = reminderDates(v, r.days, r.date, today);
  const close = () => { setOn(null); setDays(null); setDate(undefined); setAt(undefined); onClose(); };
  const flip = (o: number) => setDays(r.days.includes(o) ? r.days.filter((x) => x !== o) : [...r.days, o].sort((a, b) => a - b));
  const row = (o: number, label: string, i: number) => (
    <Row key={o} first={i === 0}>
      <View style={{ flex: 1 }}>
        <T v="row">{label}</T>
        {v.next ? <T v="meta" tone="muted">{fShort(addDays(v.next.date, -o))}</T> : null}
      </View>
      <Toggle label={label} value={r.days.includes(o)} onValueChange={() => flip(o)} />
    </Row>
  );
  return (
    <Sheet visible={visible} onClose={close} title="Reminder" footer={<Button label="Save reminder" onPress={() => { store.saveReminder(v.debt.id, { remind: r.on, days: r.days, on: r.date, at: r.at }); toast('Reminder saved'); close(); }} />}>
      <ListCard>
        <Row first>
          <T v="row" style={{ flex: 1 }}>Remind me about this debt</T>
          <Toggle label="Remind me about this debt" value={r.on} onValueChange={setOn} />
        </Row>
      </ListCard>
      <T v="meta" tone={r.on && dates.length ? 'text' : 'muted'} style={{ marginVertical: 12, marginHorizontal: 4 }}>
        {!r.on ? 'No reminders for this debt.' : dates.length ? `${plural(dates.length, 'reminder')}: ${list(dates.map(fShort))}${r.at ? ` at ${timeLabel(r.at)}` : ' at your usual reminder time'}` : 'Pick when below.'}
      </T>
      {r.on ? (
        <>
          <ListCard>
            {row(0, 'On the due date', 0)}
            {row(1, '1 day before', 1)}
            {row(3, '3 days before', 2)}
            {row(7, '7 days before', 3)}
            <Row>
              <View style={{ flex: 1 }}>
                <T v="row">On a date</T>
                <T v="meta" tone="muted">{r.date ? fLong(r.date) : 'Add a date'}</T>
              </View>
              <DateChip value={r.date ?? ''} min={today} onChange={(x) => setDate(x || null)} />
              {r.date ? <Press accessibilityRole="button" accessibilityLabel="Remove the date" onPress={() => setDate(null)} style={s.xbtn}><Icon name="x" size={18} color={t.muted} /></Press> : null}
            </Row>
          </ListCard>
          <T v="meta" tone="muted" style={{ marginTop: 18, marginBottom: 8, marginHorizontal: 4, fontFamily: 'Manrope_600' }}>Time, for all of this debt’s reminders</T>
          <View style={s.tgrid}>
            {[null, ...REMINDER_TIMES].map((x) => {
              const sel = r.at === x;
              return (
                <Press key={x ?? 'acct'} accessibilityRole="button" accessibilityState={{ selected: sel }} onPress={() => setAt(x)} style={[s.tchip, { borderColor: sel ? t.accentFill : t.border, backgroundColor: sel ? t.accentFill : t.surface }]}>
                  <Text style={{ fontFamily: 'Manrope_600', fontSize: 14, color: sel ? '#FFFFFF' : t.text }}>{x ? timeLabel(x) : 'Usual time'}</Text>
                </Press>
              );
            })}
          </View>
          <T v="cap" tone="muted" style={{ marginTop: 10, marginHorizontal: 4 }}>Reminders need notifications on for this phone (Settings, Notifications).</T>
        </>
      ) : null}
    </Sheet>
  );
}

/** A small "pick a date" button over the phone's own date picker (web). */
export function DateChip({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const { t } = useSettings();
  return (
    <View style={[s.dchip, { borderColor: t.border, backgroundColor: t.field }]}>
      <Icon name="schedule" size={18} color={t.accent} />
      {React.createElement('input', {
        type: 'date', value, min, max, 'aria-label': 'Pick a date',
        onChange: (e: { target: { value: string } }) => onChange(e.target.value),
        style: { position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' },
      })}
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cam: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  overdue: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, minHeight: 48, marginTop: 12 },
  card: { borderRadius: 20, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, marginTop: 12 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  sec: { marginTop: 22, marginBottom: 8 },
  pinned: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderRadius: 14, paddingHorizontal: 14, marginBottom: 8 },
  tgrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tchip: { flexBasis: '30%', flexGrow: 1, minHeight: 44, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dchip: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  xbtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
