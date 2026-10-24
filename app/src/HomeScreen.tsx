// Home (round 4): greeting by name, Total I owe, Due / Paid this month cards that open popups, the Overdue strip and
// this month's cash flow. Home fits the screen it is on: spare height goes into the cards, a short screen tightens
// spacing down to 0.55 (the approved mockup's fitHome).
import React, { createElement, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { coverOf, homeInsights, personKey, type DueRow } from './insights';
import { Icon } from './icons';
import { Bar, fLong, fMonth, fShort, Header, LinkBtn, ListCard, Pill, PersonAvatar, plural, Row, T, type as TY, useMoney } from './kit';
import { formatMoney, parsePesosOrZero, pesosToInput } from './money';
import { ConfirmPop, CountUp, Glass, Popup, Press, Sheet, useToast, Wash } from './motion';
import { todayIso } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Button, Field, Input } from './ui';

const greeting = () => { const h = new Date().getHours(); return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening'; };

type Nav = { onOpen: (id: string) => void; onPerson: (key: string) => void; onTab: (t: 'debts' | 'schedule' | 'reports') => void; onOverdue: () => void; onEditLine: (debtId: string, lineId: string) => void; onSettings: () => void };

export function HomeScreen(nav: Nav) {
  const { t } = useSettings();
  const store = useStore();
  const { conv, display, fmt, fmtSum } = useMoney();
  const today = todayIso();
  const h = useMemo(() => homeInsights(store.views, store.months, today, conv, display), [store.views, store.months, today, conv, display]);
  const first = (store.name || '').trim().split(/\s+/)[0] ?? '';
  const [pop, setPop] = useState<null | 'due' | 'paid' | { debt: string; line: string } | 'cash'>(null);
  const [k, setK] = useState(1);
  const [box, setBox] = useState(0);
  const hasCash = h.income > 0 || h.expenses > 0;
  const duePct = h.dueThisMonth.total ? Math.round((h.dueThisMonthPaid.total * 100) / h.dueThisMonth.total) : 0;
  const z = (n: number) => Math.round(n * k);
  const approx = (sum: { approx: boolean }) => (n: number) => (sum.approx ? '≈ ' : '') + formatMoney(n, display);

  return (
    <View style={{ flex: 1 }}>
      <Wash />
      <ScrollView
        style={{ flex: 1 }}
        onLayout={(e) => setBox(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, ch) => { if (box && ch > box + 1 && k > 0.55) setK((x) => Math.max(0.55, Math.round((x - 0.05) * 100) / 100)); }}
        contentContainerStyle={[s.page, { minHeight: box || undefined }]}
      >
        <Header greet title={`${greeting()}${first ? ', ' + first : ''}`} sub={fMonth(today.slice(0, 7))} onSettings={nav.onSettings} />

        <Press soft accessibilityRole="button" accessibilityLabel={`Total I owe ${fmtSum(h.owed)}, open My debts`} onPress={() => nav.onTab('debts')} style={[s.hero, { flexGrow: 3, paddingVertical: z(16), borderColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)' }, !t.dark && ({ boxShadow: `0 12px 32px -12px ${t.shadow}` } as object)]}>
          <HeroMesh />
          <View style={s.tap}><Icon name="right" size={18} color={t.muted} /></View>
          <T v="meta" style={{ opacity: 0.82 }}>Total I owe</T>
          <CountUp value={h.owed.total} k="home.owed" format={approx(h.owed)} style={[TY.hero, { color: t.text, fontSize: Math.round(40 * k), lineHeight: Math.round(44 * k), marginTop: 4, marginBottom: 2 }]} />
          <T v="meta" style={{ opacity: 0.82 }}>{plural(h.activeCount, 'active debt')}</T>
        </Press>

        <View style={[s.tiles, { flexGrow: 2, marginTop: z(12) }]}>
          <Press soft accessibilityRole="button" accessibilityLabel="Due this month" onPress={() => setPop('due')} style={{ flex: 1 }}>
            <Glass style={[s.tile, { paddingVertical: z(14) }]}>
              <View style={s.tap}><Icon name="right" size={18} color={t.muted} /></View>
              <T v="meta" tone="muted">Due this month</T>
              <CountUp value={h.dueThisMonth.total} k="home.due" delay={60} format={approx(h.dueThisMonth)} style={[TY.card, { color: t.text, fontSize: Math.max(17, Math.round(22 * k)), marginTop: 4 }]} />
              <T v="cap" tone="amber" style={{ marginTop: 4 }} lines={1}>{fmt(h.dueThisMonth.total - h.dueThisMonthPaid.total)} left</T>
              <T v="cap" tone="muted" lines={1}>{fmt(h.dueThisMonthPaid.total)} paid</T>
              <Bar pct={duePct} h={4} style={{ marginTop: 10 }} />
            </Glass>
          </Press>
          <Press soft accessibilityRole="button" accessibilityLabel="Paid this month" onPress={() => setPop('paid')} style={{ flex: 1 }}>
            <Glass style={[s.tile, { paddingVertical: z(14) }]}>
              <View style={s.tap}><Icon name="right" size={18} color={t.muted} /></View>
              <T v="meta" tone="muted">Paid this month</T>
              <CountUp value={h.paidThisMonth.total} k="home.paid" delay={120} format={approx(h.paidThisMonth)} style={[TY.card, { color: t.text, fontSize: Math.max(17, Math.round(22 * k)), marginTop: 4 }]} />
              <T v="cap" tone="ok" style={{ marginTop: 4 }}>{plural(h.paid.length, 'payment')}</T>
            </Glass>
          </Press>
        </View>

        {h.overdueCount > 0 ? (
          <Press accessibilityRole="button" onPress={nav.onOverdue} style={[s.overdue, { backgroundColor: t.redBg, marginTop: z(12), minHeight: Math.max(44, z(48)) }]}>
            <Icon name="alert" size={18} color={t.danger} />
            <Text numberOfLines={1} style={[TY.row, { color: t.danger, flex: 1 }]}>Overdue · {plural(h.overdueCount, 'debt')} · {fmtSum(h.overdueAmount)}</Text>
            <Icon name="right" size={18} color={t.danger} />
          </Press>
        ) : null}

        <Glass style={{ flexGrow: 3, marginTop: z(12), paddingVertical: z(16) }}>
          <View style={s.between}>
            <T v="sec">Monthly cash flow</T>
            <LinkBtn label="Edit" onPress={() => setPop('cash')} />
          </View>
          {hasCash ? (
            <>
              <View style={{ flexGrow: 1, justifyContent: 'space-evenly' }}>
                <CashRow label="Income" value={h.income} k="home.inc" z={z} />
                <CashRow label="Expenses" value={h.expenses} k="home.exp" z={z} />
                <CashRow label="Debt payments" value={h.paidThisMonth.total} k="home.debtpay" z={z} />
              </View>
              <View style={[s.remain, { backgroundColor: t.accentSoft, marginTop: z(8), paddingVertical: z(10) }]}>
                <T v="row" tone="accent">Cash remaining</T>
                <CountUp value={h.cashRemaining} k="home.cash" delay={240} format={fmt} style={[TY.card, { color: t.accent, fontSize: Math.max(18, Math.round(24 * k)), flexShrink: 1 }]} />
              </View>
            </>
          ) : (
            <T v="body" tone="muted" style={{ marginTop: 8 }}>Add this month’s income and expenses to see what is left after debt payments.</T>
          )}
        </Glass>
      </ScrollView>

      <DuePopup visible={pop === 'due'} rows={h.due} total={h.dueThisMonth} paid={h.dueThisMonthPaid} onClose={() => setPop(null)} onOpen={(id) => { setPop(null); nav.onOpen(id); }} onSchedule={() => { setPop(null); nav.onTab('schedule'); }} />
      <PaidPopup
        visible={pop === 'paid' || (typeof pop === 'object' && pop !== null)}
        detail={typeof pop === 'object' && pop !== null ? pop : null}
        h={h}
        onClose={() => setPop(null)}
        onBack={() => setPop('paid')}
        onPick={(debt, line) => setPop({ debt, line })}
        onOpen={(id) => { setPop(null); nav.onOpen(id); }}
        onPerson={(key) => { setPop(null); nav.onPerson(key); }}
        onEdit={(debt, line) => { setPop(null); nav.onEditLine(debt, line); }}
      />
      <CashSheet visible={pop === 'cash'} income={h.income} expenses={h.expenses} onClose={() => setPop(null)} />
    </View>
  );
}

function CashRow({ label, value, k, z }: { label: string; value: number; k: string; z: (n: number) => number }) {
  const { fmt } = useMoney();
  const { t } = useSettings();
  return (
    <View style={[s.cashrow, { paddingVertical: z(7) }]}>
      <T v="body" style={{ fontSize: 15 }}>{label}</T>
      <CountUp value={value} k={k} delay={180} format={fmt} style={[TY.row, { color: t.text }]} />
    </View>
  );
}

/** The hero's soft mesh (the mockup's radial gradients, then a light tint so the text stays readable). */
function HeroMesh() {
  const { t } = useSettings();
  if (Platform.OS !== 'web') return <View style={[StyleSheet.absoluteFill, { backgroundColor: t.accentSoft }]} />;
  const mb3 = t.dark ? `${t.accent}59` : 'rgba(255,255,255,0.9)';
  return createElement(
    'div',
    {
      'aria-hidden': true,
      style: {
        position: 'absolute', inset: 0,
        background: `radial-gradient(75% 95% at 0% 0%, ${t.heroA}, transparent 70%), radial-gradient(70% 90% at 100% 100%, ${t.heroB}, transparent 70%), radial-gradient(40% 55% at 92% 8%, ${mb3}, transparent 70%), ${t.heroBase}`,
      },
    },
    createElement('div', { style: { position: 'absolute', inset: 0, background: t.dark ? 'rgba(27,26,37,0.30)' : 'rgba(255,255,255,0.60)' } }),
  );
}

// ---------------- Due this month ----------------
function DuePopup({ visible, rows, total, paid, onClose, onOpen, onSchedule }: { visible: boolean; rows: DueRow[]; total: { total: number; approx: boolean }; paid: { total: number; approx: boolean }; onClose: () => void; onOpen: (id: string) => void; onSchedule: () => void }) {
  const { t } = useSettings();
  const { fmt, fmtSum, fmtIn } = useMoney();
  const [showPaid, setShowPaid] = useState(false);
  const today = todayIso();
  const left = rows.filter((x) => x.short > 0);
  const done = rows.filter((x) => x.short === 0);
  const late = (x: DueRow) => x.carried || x.due < today;
  const order = [...left.filter(late), ...left.filter((x) => !late(x))];
  const shown = order.slice(0, 8);
  const carried = shown.filter((x) => x.carried);
  const now = shown.filter((x) => !x.carried);
  const months = [...new Set(carried.map((x) => x.due.slice(0, 7)))];
  const pct = total.total ? Math.round((paid.total * 100) / total.total) : 0;
  const row = (x: DueRow, isDone: boolean, i: number) => (
    <Row key={`${x.view.debt.id}:${x.due}:${i}`} first={i === 0} onPress={() => onOpen(x.view.debt.id)} style={{ paddingHorizontal: 4 }} label={x.view.debt.person_name}>
      {isDone ? (
        <View style={[s.av36, { backgroundColor: t.accentSoft }]}><Icon name="check" size={18} color={t.accent} /></View>
      ) : (
        <PersonAvatar name={x.view.debt.person_name} size={36} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="row" tone={isDone ? 'muted' : 'text'} lines={1}>{x.view.debt.person_name}</T>
        <T v="meta" tone="muted" lines={1}>{x.charge ? 'Late fee · ' : x.view.debt.title ? `${x.view.debt.title} · ` : ''}{fShort(x.due)}</T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T v="row" tone={isDone ? 'muted' : 'text'}>{fmtIn(isDone ? x.amount : x.short, x.view.debt.currency)}</T>
        {!isDone && x.due < today ? <View style={{ marginTop: 4 }}><Pill state="overdue" /></View> : !isDone && x.short < x.amount ? <T v="cap" tone="muted" style={{ marginTop: 4 }}>{fmtIn(x.amount - x.short, x.view.debt.currency)} paid</T> : null}
      </View>
    </Row>
  );
  return (
    <Popup visible={visible} onClose={onClose} title="Due this month">
      <T v="pop">{fmtSum(total)}</T>
      <T v="meta" tone="muted" style={{ marginTop: 4 }}>{fmt(paid.total)} paid · {left.length} of {rows.length} left{rows.some((x) => x.carried) ? ' · includes overdue from earlier months' : ''}</T>
      <Bar pct={pct} h={4} style={{ marginTop: 10, marginBottom: 6 }} />
      {months.map((m) => (
        <View key={m}>
          <T v="meta" tone="muted" style={s.mhead}>From {fMonth(m).split(' ')[0]}</T>
          {carried.filter((x) => x.due.startsWith(m)).map((x, i) => row(x, false, i))}
        </View>
      ))}
      {carried.length ? <T v="meta" tone="muted" style={s.mhead}>{fMonth(today.slice(0, 7)).split(' ')[0]}</T> : null}
      {now.map((x, i) => row(x, false, i))}
      {rows.length === 0 ? <T v="body" tone="muted" style={{ paddingVertical: 20, textAlign: 'center' }}>Nothing is due this month.</T> : null}
      {order.length > 8 ? <LinkBtn label={`See all ${order.length} in Schedule`} onPress={onSchedule} /> : null}
      {done.length ? (
        <>
          <LinkBtn label={`${showPaid ? 'Hide paid' : 'Paid'} (${done.length})`} onPress={() => setShowPaid((v) => !v)} />
          {showPaid ? done.map((x, i) => row(x, true, i)) : null}
        </>
      ) : null}
    </Popup>
  );
}

// ---------------- Paid this month, and one payment's detail ----------------
function PaidPopup({ visible, detail, h, onClose, onBack, onPick, onOpen, onPerson, onEdit }: {
  visible: boolean; detail: { debt: string; line: string } | null; h: ReturnType<typeof homeInsights>; onClose: () => void; onBack: () => void;
  onPick: (debt: string, line: string) => void; onOpen: (id: string) => void; onPerson: (key: string) => void; onEdit: (debt: string, line: string) => void;
}) {
  const { t } = useSettings();
  const { fmtSum, fmtIn } = useMoney();
  const store = useStore();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const today = todayIso();
  const v = detail ? store.views.find((x) => x.debt.id === detail.debt) : undefined;
  const line = v?.lines.find((l) => l.id === detail?.line);
  if (detail && v && line) {
    const cov = coverOf(v, line.id);
    const cur = v.debt.currency;
    return (
      <Popup visible={visible} onClose={onClose} onBack={onBack} title="Payment">
        <T v="pop">{fmtIn(line.amount_centavos, cur)}</T>
        <T v="meta" tone="muted" style={{ marginTop: 4 }}>{fLong(line.on_date)}{line.method ? ` · ${line.method}` : ''}{line.note ? ` · ${line.note}` : ''}</T>
        <T v="meta" tone="muted" style={{ marginTop: 16, fontFamily: 'Manrope_600' }}>What it paid</T>
        <ListCard style={{ marginTop: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
          {cov.rows.length ? cov.rows.map((r) => (
            <View key={r.seq} style={[s.between, { paddingVertical: 8 }]}>
              <T v="meta">{v.debt.kind === 'one_time' ? 'Toward the balance' : `#${r.seq} · ${fShort(r.due)}`}</T>
              <T v="meta">{fmtIn(r.amount, cur)}{r.amount < r.of ? <T v="meta" tone="muted"> of {fmtIn(r.of, cur)}</T> : null}</T>
            </View>
          )) : <T v="meta" tone="muted" style={{ paddingVertical: 8 }}>{v.debt.kind === 'one_time' ? 'Toward the balance' : 'Nothing was left to pay when it was logged.'}</T>}
          {cov.extra > 0 ? <View style={[s.between, { paddingVertical: 8 }]}><T v="meta">Ahead / extra</T><T v="meta">{fmtIn(cov.extra, cur)}</T></View> : null}
        </ListCard>
        <ListCard style={{ marginTop: 12 }}>
          <Row first onPress={() => onOpen(v.debt.id)}>
            <Icon name="debts" color={t.muted} /><T v="row" lines={1} style={{ flex: 1 }}>Open debt{v.debt.title ? ` · ${v.debt.title}` : ''}</T><Icon name="right" size={18} color={t.muted} />
          </Row>
          <Row onPress={() => onPerson(personKey(v.debt.person_name))}>
            <Icon name="hist" color={t.muted} /><T v="row" lines={1} style={{ flex: 1 }}>{v.debt.person_name}’s history</T><Icon name="right" size={18} color={t.muted} />
          </Row>
        </ListCard>
        <View style={{ marginTop: 12 }}><Button kind="outline" label="Edit payment" onPress={() => onEdit(v.debt.id, line.id)} /></View>
        <LinkBtn tone="danger" label="Delete payment" onPress={() => setAsk(true)} />
        <ConfirmPop
          visible={ask}
          title="Delete this payment?"
          body={`${fmtIn(line.amount_centavos, cur)} on ${fLong(line.on_date)} will be removed, and what is left on this debt goes back up.`}
          action="Delete"
          onCancel={() => setAsk(false)}
          onConfirm={() => { setAsk(false); store.deleteLine(line.id); toast('Payment deleted', { quiet: true }); onBack(); }}
        />
      </Popup>
    );
  }
  return (
    <Popup visible={visible} onClose={onClose} title="Paid this month">
      <T v="pop">{fmtSum(h.paidThisMonth)}</T>
      <T v="meta" tone="muted" style={{ marginTop: 4 }}>{plural(h.paid.length, 'payment')} in {fMonth(today.slice(0, 7)).split(' ')[0]}</T>
      <View style={{ marginTop: 12 }}>
        {h.paid.length ? h.paid.map(({ view, line: l }, i) => (
          <Row key={l.id} first={i === 0} onPress={() => onPick(view.debt.id, l.id)} style={{ paddingHorizontal: 4 }}>
            <T v="meta" style={{ width: 48, fontFamily: 'Manrope_700' }}>{fShort(l.on_date)}</T>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="row" lines={1}>{view.debt.person_name}</T>
              <T v="meta" tone="muted" lines={1}>{view.debt.title}{l.method ? ` · ${l.method}` : ''}</T>
            </View>
            <T v="row">{fmtIn(l.amount_centavos, view.debt.currency)}</T>
            <Icon name="right" size={18} color={t.muted} />
          </Row>
        )) : <T v="body" tone="muted" style={{ paddingVertical: 20, textAlign: 'center' }}>No payments logged this month yet.</T>}
      </View>
    </Popup>
  );
}

// ---------------- this month's cash flow ----------------
function CashSheet({ visible, income, expenses, onClose }: { visible: boolean; income: number; expenses: number; onClose: () => void }) {
  const { display } = useMoney();
  const store = useStore();
  const toast = useToast();
  const [inc, setInc] = useState<string | null>(null);
  const [exp, setExp] = useState<string | null>(null);
  const incS = inc ?? (income ? pesosToInput(income) : '');
  const expS = exp ?? (expenses ? pesosToInput(expenses) : '');
  const incN = parsePesosOrZero(incS);
  const expN = parsePesosOrZero(expS);
  const month = todayIso().slice(0, 7);
  const close = () => { setInc(null); setExp(null); onClose(); };
  return (
    <Sheet visible={visible} onClose={close} title={`${fMonth(month).split(' ')[0]} cash flow`}>
      <T v="meta" tone="muted" style={{ marginBottom: 12 }}>Kept month by month, so Reports can show how each month went.</T>
      <Field label="Income this month" error={incN === null ? 'Enter an amount, for example 25000.' : undefined}>
        <Input label="Income this month" value={incS} onChangeText={setInc} keyboardType="decimal-pad" placeholder="0.00" prefix={display === 'PHP' ? '₱' : display} />
      </Field>
      <Field label="Expenses this month" error={expN === null ? 'Enter an amount, for example 12000.' : undefined}>
        <Input label="Expenses this month" value={expS} onChangeText={setExp} keyboardType="decimal-pad" placeholder="0.00" prefix={display === 'PHP' ? '₱' : display} />
      </Field>
      <Button label="Save" disabled={incN === null || expN === null} onPress={() => { if (incN === null || expN === null) return; store.saveCash(incN, expN, month); toast('Cash flow saved'); close(); }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingBottom: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { borderRadius: 20, overflow: 'hidden', paddingHorizontal: 18, borderWidth: 1, justifyContent: 'center' },
  tap: { position: 'absolute', top: 14, right: 12 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, padding: 14 },
  overdue: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cashrow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  remain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 12, gap: 8 },
  mhead: { fontFamily: 'Manrope_600', marginTop: 14, marginBottom: 2 },
  av36: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
