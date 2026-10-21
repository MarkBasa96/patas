import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { monthOf, scheduleRows, type ScheduleRow } from './home';
import { formatPesos } from './money';
import { formatShort, todayIso } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Avatar } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthTitle = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ''} ${ym.slice(0, 4)}`;

export function ScheduleScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useSettings();
  const { views } = useStore();
  const today = todayIso();
  const rows = useMemo(() => scheduleRows(views, today), [views, today]);
  const overdue = rows.filter((r) => r.overdue);
  const byMonth = useMemo(() => {
    const m = new Map<string, ScheduleRow[]>();
    for (const r of rows.filter((x) => !x.overdue)) m.set(monthOf(r.date), [...(m.get(monthOf(r.date)) ?? []), r]);
    return [...m.entries()];
  }, [rows]);

  const card = (r: ScheduleRow) => (
    <Pressable key={r.key} accessibilityRole="button" onPress={() => onOpen(r.debtId)} style={[s.row, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Avatar name={r.person} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: t.text }}>{r.person}</Text>
        {r.title ? <Text numberOfLines={1} style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: t.muted }}>{r.title}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: t.text }}>{formatPesos(r.amount)}</Text>
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12.5, color: r.overdue ? t.danger : r.today ? t.warn : t.muted }}>{r.overdue ? 'Overdue · ' : r.today ? 'Today · ' : ''}{formatShort(r.date)}</Text>
      </View>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
      <Text style={[s.h1, { color: t.text }]}>Payment schedule</Text>
      {!rows.length ? (
        <View style={s.empty}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: t.text }}>Nothing scheduled</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: t.muted, textAlign: 'center', marginTop: 6 }}>Installments and debts with a due date show up here, soonest first.</Text>
        </View>
      ) : null}
      {overdue.length ? (
        <>
          <Text style={[s.h2, { color: t.danger }]}>Overdue</Text>
          {overdue.map(card)}
        </>
      ) : null}
      {byMonth.map(([ym, list]) => (
        <View key={ym}>
          <View style={s.between}>
            <Text style={[s.h2, { color: t.text }]}>{monthTitle(ym)}</Text>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: t.muted }}>{formatPesos(list.reduce((n, r) => n + r.amount, 0))}</Text>
          </View>
          {list.map(card)}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  h1: { fontFamily: 'Inter_800ExtraBold', fontSize: 26, letterSpacing: -0.3, marginTop: 6, marginBottom: 8 },
  h2: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 14, marginBottom: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10 },
  empty: { alignItems: 'center', paddingVertical: 40 },
});
