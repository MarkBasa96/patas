import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { downloadFile, shareText } from './dataIO';
import { debtsCsv, overallSummary } from './exportData';

import { monthlyPayments } from './home';
import { compactPesos, formatPesos } from './money';
import { todayIso } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Avatar, Banner, Button, fitFontSize, ProgressBar } from './ui';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ReportsScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useSettings();
  const { views } = useStore();
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const page = Math.min(useWindowDimensions().width, 560) - 32;
  const today = todayIso();
  const live = views;
  const owed = live.reduce((n, v) => n + v.bal.owed, 0);
  const paid = live.reduce((n, v) => n + Math.min(v.bal.paid, v.bal.owed), 0);
  const pct = owed > 0 ? Math.min(100, Math.floor((paid * 100) / owed)) : 0;
  const months = useMemo(() => monthlyPayments(views, today, 6), [views, today]);
  const peak = Math.max(1, ...months.map((m) => m.amount));
  const ordered = useMemo(() => [...views].sort((a, b) => b.bal.pct - a.bal.pct), [views]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
      <Text style={[s.h1, { color: t.text }]}>Debt progress</Text>

      <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: t.muted }}>Paid so far, all debts</Text>
        <Text style={{ fontFamily: 'Inter_800ExtraBold', fontSize: fitFontSize(formatPesos(paid), 30, page - 30), letterSpacing: -0.5, color: t.text }}>{formatPesos(paid)}</Text>
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: t.muted, marginBottom: 10 }}>of {formatPesos(owed)} · {pct}%</Text>
        <ProgressBar pct={pct} />
      </View>

      <Text style={[s.h2, { color: t.text }]}>Payments by month</Text>
      <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={s.bars} accessibilityLabel="Payments by month">
          {months.map((m) => (
            <View key={m.ym} style={s.barCol}>
              <Text numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: t.muted }}>{m.amount ? compactPesos(m.amount) : ''}</Text>
              <View style={{ flex: 1, justifyContent: 'flex-end', width: '100%' }}>
                <View style={{ height: Math.max(m.amount ? 6 : 2, (m.amount / peak) * 110), backgroundColor: m.amount ? t.accentFill : t.track, borderRadius: 6 }} />
              </View>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: t.muted, marginTop: 4 }}>{SHORT[Number(m.ym.slice(5, 7)) - 1]}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={[s.h2, { color: t.text }]}>By debt</Text>
      {!ordered.length ? <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: t.muted }}>Add a debt to see its progress here.</Text> : null}
      {ordered.map((v) => (
        <Pressable key={v.debt.id} accessibilityRole="button" onPress={() => onOpen(v.debt.id)} style={[s.card, { backgroundColor: t.surface, borderColor: t.border, marginTop: 0, marginBottom: 10 }]}>
          <View style={s.row}>
            <Avatar name={v.debt.person_name} size={36} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15, color: t.text }}>{v.debt.person_name}</Text>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: t.muted }}>{v.bal.pct}%</Text>
          </View>
          <View style={{ marginTop: 8 }}><ProgressBar pct={v.bal.pct} /></View>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12.5, color: t.muted, marginTop: 6 }}>{formatPesos(v.bal.remaining)} left of {formatPesos(v.bal.owed)}</Text>
        </Pressable>
      ))}
      {views.length ? (
        <View style={{ marginTop: 6 }}>
          <Button label="Export report" kind="outline" onPress={() => setExporting(true)} />
          {notice ? <View style={{ marginTop: 10 }}><Banner text={notice} /></View> : null}
        </View>
      ) : null}
      <Modal visible={exporting} transparent animationType="fade" onRequestClose={() => setExporting(false)}>
        <View style={s.scrim}>
          <View style={[s.dialog, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: t.text }}>Export report</Text>
            <View style={{ gap: 10, marginTop: 16 }}>
              <Button label="Save as CSV" onPress={() => { downloadFile(`patas-debts-${today}.csv`, debtsCsv(views), 'text/csv'); setExporting(false); setNotice('CSV saved. It opens in Sheets or Excel.'); }} />
              <Button label="Share a summary" kind="outline" onPress={() => { setExporting(false); void shareText(overallSummary(views, today)).then((r) => setNotice(r === 'copied' ? 'Summary copied. Paste it where you like.' : r === 'shared' ? 'Summary shared.' : r === 'failed' ? 'Could not share the summary.' : '')); }} />
              <Button label="Cancel" kind="outline" onPress={() => setExporting(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  h1: { fontFamily: 'Inter_800ExtraBold', fontSize: 26, letterSpacing: -0.3, marginTop: 6, marginBottom: 10 },
  h2: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 16, marginBottom: 8 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginTop: 4 },
  bars: { flexDirection: 'row', gap: 8, height: 150, alignItems: 'stretch' },
  barCol: { flex: 1, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 20 },
});
