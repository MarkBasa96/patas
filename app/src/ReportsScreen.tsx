// Reports (round 4, Erina §7): a period dropdown; Remaining with the progress ring; Debt over time; Debt by person;
// Cash remaining; Income, spending and debt (stacked months, tap one for exact amounts). Charts grow once per session.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Icon } from './icons';
import { PERIODS, period, report, type PeriodKey, type Range } from './insights';
import { fMon, fMonth, Header, T, useMoney } from './kit';
import { CountUp, Glass, Press, Sheet, useFirstTime, useGrow, Wash } from './motion';
import { formatMoney } from './money';
import { todayIso } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Button, DateField, Field } from './ui';

const PHRASE: Record<PeriodKey, string> = { week: 'this week', month: 'this month', last_month: 'last month', '3m': 'in 3 months', '6m': 'in 6 months', year: 'this year', custom: 'in this period' };
const W = 326;

export function ReportsScreen({ onSettings }: { onSettings: () => void }) {
  const { t } = useSettings();
  const store = useStore();
  const { conv, display, fmt } = useMoney();
  const today = todayIso();
  const [key, setKey] = useState<PeriodKey>('month');
  const [custom, setCustom] = useState<Range>({ from: today.slice(0, 8) + '01', to: today });
  const [pick, setPick] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const range = period(key, today, custom);
  const r = useMemo(() => report(store.views, store.months, range, today, conv, display), [store.views, store.months, range.from, range.to, today, conv, display]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = useFirstTime('reports');
  const p = useGrow(first, 650, 80);
  const ap = (n: number) => (r.approx ? '≈ ' : '') + formatMoney(n, display);
  const short = r.months.length < 3;
  const span = short ? 'Last 6 months' : PERIODS.find((x) => x.key === key)?.label ?? '';
  const label = PERIODS.find((x) => x.key === key)?.label ?? '';
  const periodLabel = key === 'custom' ? `${range.from} → ${range.to}` : label;

  // Debt over time
  const H = 120;
  const tmax = Math.max(1, ...r.trend.map((x) => x.remaining));
  const step = W / Math.max(1, r.trend.length - 1);
  const pts = r.trend.map((x, i) => [i * step, H - 12 - ((H - 28) * x.remaining * p) / tmax] as const);
  const line = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${W} ${H - 12} L 0 ${H - 12} Z`;
  const a0 = r.trend[0]?.remaining ?? 0;
  const b0 = r.trend[r.trend.length - 1]?.remaining ?? 0;
  // Debt by person
  const cred = r.byPerson.slice(0, 5).map((c) => ({ name: c.name, amount: c.amount }));
  const others = r.byPerson.slice(5).reduce((n, c) => n + c.amount, 0);
  if (others) cred.push({ name: 'Others', amount: others });
  const cmax = Math.max(1, ...cred.map((c) => c.amount));
  // Income split
  const BH = 130;
  const bw = 30;
  const gap = (W - bw * r.monthly.length) / Math.max(1, r.monthly.length - 1);
  const imax = Math.max(1, ...r.monthly.map((m) => Math.max(m.income, m.expenses + m.paid)));
  const y = (v: number) => (BH * v * p) / imax;
  const tipM = tip ? r.monthly.find((m) => m.m === tip) : undefined;
  const cm = short ? store.months[range.to.slice(0, 7)] ?? { income: 0, expenses: 0 } : { income: r.income, expenses: r.expenses };
  const cmPaid = short ? r.monthly.find((m) => m.m === range.to.slice(0, 7))?.paid ?? 0 : r.debtPaid.total;
  const grey = t.dark ? '#4A4858' : '#B9B7C6';
  // the ring
  const R = 30;
  const len = 2 * Math.PI * R;
  const off = len * (1 - (r.progressPct * p) / 100);

  return (
    <View style={{ flex: 1 }}>
      <Wash />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page}>
        <Header title="Reports" onSettings={onSettings} />
        <Press soft accessibilityRole="button" accessibilityLabel={`Period: ${periodLabel}`} onPress={() => setPick(true)} style={[s.periodBtn, { backgroundColor: t.field, borderColor: t.border }]}>
          <T v="meta" tone="muted">Period</T>
          <T v="row" lines={1} style={{ flex: 1 }}>{periodLabel}</T>
          <Icon name="down" size={20} color={t.muted} />
        </Press>

        <Glass style={{ marginTop: 8 }}>
          <View style={s.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="meta" tone="muted">Remaining</T>
              <CountUp value={r.remaining.total} k="rep.remaining" format={ap} style={[{ fontFamily: 'Manrope_600', fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: t.text }]} />
              <T v="meta" tone="muted" style={{ marginTop: 4 }}><T v="meta">{fmt(r.totalPaidAll.total)}</T> paid of {fmt(r.totalOwed.total)}</T>
              <T v="meta" tone="muted"><T v="meta">{fmt(r.debtPaid.total)}</T> paid {PHRASE[key]}</T>
            </View>
            <Svg width={72} height={72} viewBox="0 0 72 72" accessibilityLabel={`${r.progressPct}% paid`}>
              <Circle cx={36} cy={36} r={R} fill="none" stroke={t.track} strokeWidth={7} />
              <Circle cx={36} cy={36} r={R} fill="none" stroke={t.accentFill} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={off} transform="rotate(-90 36 36)" />
              <SvgText fontFamily="Manrope_600" x={36} y={41} textAnchor="middle" fontSize={15} fontWeight="600" fill={t.text}>{`${r.progressPct}%`}</SvgText>
            </Svg>
          </View>
        </Glass>

        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={s.between}><T v="sec">Debt over time</T><T v="cap" tone="muted">{span}</T></View>
          <Svg width="100%" height={H + 16} viewBox={`0 0 ${W} ${H + 16}`} accessibilityLabel="Remaining debt at each month end" style={{ marginTop: 8 }}>
            <Path d={area} fill={t.accentSoft} opacity={0.8} />
            <Line x1={0} x2={W} y1={H - 12} y2={H - 12} stroke={t.border} />
            <Path d={line} fill="none" stroke={t.accentFill} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((q, i) => (
              <SvgText fontFamily="Manrope_500" key={i} x={q[0]} y={H + 8} fontSize={11} fill={t.muted} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}>{fMon(r.trend[i]!.m)}</SvgText>
            ))}
            {pts.length ? <Circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={4} fill={t.accent} /> : null}
          </Svg>
          <T v="meta" tone="muted">{b0 <= a0 ? `Down ${fmt(a0 - b0)} since ${fMon(r.trend[0]?.m ?? today)}` : `Up ${fmt(b0 - a0)} since ${fMon(r.trend[0]?.m ?? today)}: new debts were added`}</T>
        </View>

        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <T v="sec">Debt by person</T>
          <View style={{ gap: 12, marginTop: 10 }}>
            {cred.length ? cred.map((c) => (
              <View key={c.name}>
                <View style={s.between}><T v="meta" lines={1} style={{ flex: 1 }}>{c.name}</T><T v="meta">{fmt(c.amount)}</T></View>
                <View style={[s.track, { backgroundColor: t.track }]}><View style={{ width: `${((c.amount * 100) / cmax) * p}%`, height: 8, borderRadius: 4, backgroundColor: t.accentFill }} /></View>
              </View>
            )) : <T v="meta" tone="muted">Nothing owed right now.</T>}
          </View>
        </View>

        <Glass style={{ marginTop: 12 }}>
          <T v="meta" tone="muted">Cash remaining · {short ? `${fMonth(range.to.slice(0, 7)).split(' ')[0]} (monthly figures)` : span}</T>
          <CountUp value={cm.income - cm.expenses - cmPaid} k="rep.cash" format={fmt} style={[{ fontFamily: 'Manrope_600', fontSize: 28, lineHeight: 34, color: t.text }]} />
          <View style={[s.row, { flexWrap: 'wrap', gap: 16, marginTop: 8 }]}>
            <T v="meta" tone="muted">Income <T v="meta">{fmt(cm.income)}</T></T>
            <T v="meta" tone="muted">Expenses <T v="meta">{fmt(cm.expenses)}</T></T>
            <T v="meta" tone="muted">Debt payments <T v="meta">{fmt(cmPaid)}</T></T>
          </View>
        </Glass>

        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={s.between}><T v="sec">Income, spending and debt</T><T v="cap" tone="muted">{span}</T></View>
          <View style={{ minHeight: 40, marginTop: 4, justifyContent: 'center' }}>
            {tipM ? (
              <T v="meta"><T v="meta" style={{ fontFamily: 'Manrope_700' }}>{fMonth(tipM.m).split(' ')[0]}:</T> income {fmt(tipM.income)} · spent {fmt(tipM.expenses)} · debts {fmt(tipM.paid)} · left {fmt(tipM.income - tipM.expenses - tipM.paid)}</T>
            ) : <T v="meta" tone="muted">Tap a month to see the exact amounts.</T>}
          </View>
          <Svg width="100%" height={BH + 22} viewBox={`0 0 ${W} ${BH + 22}`} accessibilityLabel="Income split per month">
            {r.monthly.map((m, i) => {
              const x = i * (bw + gap);
              const ex = y(m.expenses);
              const pd = y(m.paid);
              const left = Math.max(0, y(m.income) - ex - pd);
              const over = Math.max(0, ex + pd - y(m.income));
              const sel = tip === m.m;
              return (
                <G key={m.m} onPress={() => setTip(sel ? null : m.m)}>
                  <Rect x={x - gap / 2} y={0} width={bw + gap} height={BH + 22} fill="transparent" />
                  <Rect x={x} y={BH - ex} width={bw} height={ex} rx={3} fill={grey} stroke={sel ? t.text : 'none'} strokeWidth={sel ? 1.5 : 0} />
                  <Rect x={x} y={BH - ex - pd} width={bw} height={pd} fill={t.accentFill} />
                  <Rect x={x} y={BH - ex - pd - left} width={bw} height={left} rx={3} fill={t.ok} />
                  {over ? <Rect x={x} y={BH - ex - pd} width={bw} height={over} fill={t.danger} /> : null}
                  <SvgText fontFamily="Manrope_500" x={x + bw / 2} y={BH + 16} textAnchor="middle" fontSize={11} fill={t.muted}>{fMon(m.m)}</SvgText>
                </G>
              );
            })}
            <Line x1={0} x2={W} y1={BH} y2={BH} stroke={t.border} />
          </Svg>
          <View style={[s.row, { gap: 14, flexWrap: 'wrap', marginTop: 8 }]}>
            {([[t.ok, 'Left'], [t.accentFill, 'Debt payments'], [grey, 'Expenses']] as const).map(([c, l]) => (
              <View key={l} style={[s.row, { gap: 5 }]}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} /><T v="cap" tone="muted">{l}</T></View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Sheet visible={pick} onClose={() => setPick(false)} title="Period">
        {PERIODS.map((x) => (
          <Press key={x.key} soft accessibilityRole="button" accessibilityState={{ selected: key === x.key }} onPress={() => { setKey(x.key); setTip(null); if (x.key !== 'custom') setPick(false); }} style={[s.opt, { borderTopColor: t.border }]}>
            <T v="row" style={{ flex: 1 }}>{x.label}</T>
            {key === x.key ? <Icon name="check" color={t.accent} /> : null}
          </Press>
        ))}
        {key === 'custom' ? (
          <View style={{ marginTop: 12 }}>
            <Field label="From"><DateField label="From" value={custom.from} max={custom.to} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} /></Field>
            <Field label="To"><DateField label="To" value={custom.to} min={custom.from} max={today} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} /></Field>
            <Button label="Show" onPress={() => setPick(false)} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  periodBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  card: { borderRadius: 20, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, marginTop: 12 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  opt: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderTopWidth: 1, paddingHorizontal: 4 },
});
