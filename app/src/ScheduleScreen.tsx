// Schedule (round 4): a month calendar with dots (overdue, today, coming up, paid); tap a day for its list, arrows
// for other months.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { monthRows, type CalRow, type DayDot } from './insights';
import { Empty, fDay, fMonth, fMon, Header, IconBtn, LinkBtn, ListCard, Pill, Row, T, useMoney } from './kit';
import { Press, Wash } from './motion';
import { addMonths, todayIso } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';

const ORDER: DayDot[] = ['overdue', 'today', 'upcoming', 'paid'];

export function ScheduleScreen({ onOpen, onSettings }: { onOpen: (id: string) => void; onSettings: () => void }) {
  const { t } = useSettings();
  const { views } = useStore();
  const { fmtIn, fmtSum, conv, display } = useMoney();
  const today = todayIso();
  const [m, setM] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const rows = useMemo(() => monthRows(views, m, today), [views, m, today]);
  const byDay = new Map<string, CalRow[]>();
  for (const r of rows) byDay.set(r.due, [...(byDay.get(r.due) ?? []), r]);
  const leftItems = rows.map((r) => ({ amount: r.short, currency: r.view.debt.currency }));
  const left = { total: leftItems.reduce((n, x) => n + (conv(x.amount, x.currency) ?? x.amount), 0), approx: leftItems.some((x) => x.currency !== display) };
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  const lead = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const dot = { overdue: t.danger, today: t.warn, upcoming: t.accent, paid: t.ok };
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const list = day ? byDay.get(day) ?? [] : rows;
  const go = (n: number) => { setM(addMonths(m + '-01', n).slice(0, 7)); setDay(null); };

  return (
    <View style={{ flex: 1 }}>
      <Wash height={200} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page}>
        <Header title="Schedule" onSettings={onSettings} />
        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={s.between}>
            <IconBtn name="left" label="Previous month" onPress={() => go(-1)} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <T v="sec">{fMonth(m)}</T>
              <T v="meta" tone="muted">{fmtSum(left)} left</T>
            </View>
            <IconBtn name="right" label="Next month" onPress={() => go(1)} />
          </View>
          <View style={[s.grid, { marginTop: 8 }]} accessibilityLabel={fMonth(m)}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => <Text key={i} style={[s.wd, { color: t.muted }]}>{w}</Text>)}
            {cells.map((iso, i) => {
              if (!iso) return <View key={i} style={s.cell} />;
              const items = byDay.get(iso) ?? [];
              const dots = [...new Set(items.map((r) => r.state))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).slice(0, 3);
              const sel = day === iso;
              return (
                <Press key={iso} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={`${fDay(iso)}${items.length ? `: ${items.length} ${items.length === 1 ? 'payment' : 'payments'}` : ''}`} onPress={() => setDay(sel ? null : iso)} style={[s.cell, sel && { backgroundColor: t.accentSoft }]}>
                  <View style={[s.n, iso === today && { borderWidth: 1.5, borderColor: t.accent }]}>
                    <Text style={{ fontFamily: items.length ? 'Manrope_600' : 'Manrope_500', fontSize: 15, color: iso === today ? t.accent : items.length ? t.text : t.muted }}>{Number(iso.slice(8, 10))}</Text>
                  </View>
                  <View style={s.dots}>{dots.map((d) => <View key={d} style={[s.dot, { backgroundColor: dot[d] }]} />)}</View>
                </Press>
              );
            })}
          </View>
          <View style={s.legend}>
            {([['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Coming up'], ['paid', 'Paid']] as const).map(([k, l]) => (
              <View key={k} style={s.legendItem}><View style={[s.dot, { width: 8, height: 8, backgroundColor: dot[k] }]} /><T v="cap" tone="muted">{l}</T></View>
            ))}
          </View>
        </View>

        <View style={[s.between, { marginTop: 22, marginBottom: 8 }]}>
          <T v="sec">{day ? fDay(day) : `All of ${fMonth(m).split(' ')[0]}`}</T>
          {day ? <LinkBtn label="Whole month" onPress={() => setDay(null)} /> : null}
        </View>
        <ListCard>
          {list.length ? list.map((r, i) => (
            <Row key={`${r.view.debt.id}:${r.due}:${i}`} first={i === 0} onPress={() => onOpen(r.view.debt.id)} label={r.view.debt.person_name}>
              <View style={{ width: 44, alignItems: 'center' }}>
                <T v="cap" tone="muted">{fMon(r.due)}</T>
                <T v="sec">{Number(r.due.slice(8, 10))}</T>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="row" tone={r.state === 'paid' ? 'muted' : 'text'} lines={1}>{r.view.debt.person_name}</T>
                <T v="meta" tone="muted" lines={1}>{r.view.debt.title}{r.charge ? ' · late fee' : ''}</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T v="row" tone={r.state === 'paid' ? 'muted' : 'text'}>{fmtIn(r.state === 'paid' ? r.amount : r.short, r.view.debt.currency)}</T>
                <View style={{ marginTop: 4 }}><Pill state={r.state === 'paid' ? 'paid' : r.state === 'overdue' ? 'overdue' : r.state === 'today' ? 'today' : ''} /></View>
              </View>
            </Row>
          )) : <Empty text={day ? 'Nothing due on this day.' : 'Nothing due this month.'} />}
        </ListCard>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  card: { borderRadius: 20, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: 'Manrope_600', fontSize: 12, paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  n: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 4 },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
