import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { StateTag } from './DebtsScreen';
import { cashRemaining, homeTotals, nextPayment } from './home';
import { currencySymbol, formatPesos, parsePesosOrZero, pesosToInput } from './money';
import { formatShort, todayIso } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Avatar, Button, Field, fitFontSize, Input } from './ui';

export function HomeScreen({ onAdd, onOpen, onTab, onLogPayment }: { onAdd: () => void; onOpen: (id: string) => void; onTab: (t: 'debts' | 'schedule' | 'reports') => void; onLogPayment: (id: string) => void }) {
  const { t } = useSettings();
  const { views, cash, saveCash } = useStore();
  const today = todayIso();
  const totals = useMemo(() => homeTotals(views, today), [views, today]);
  const next = useMemo(() => nextPayment(views), [views]);
  const left = cashRemaining(cash.income, cash.expenses, totals.paidThisMonth);
  const [editing, setEditing] = useState(false);
  const [inc, setInc] = useState('');
  const [exp, setExp] = useState('');
  const incN = parsePesosOrZero(inc);
  const expN = parsePesosOrZero(exp);
  // Big amounts shrink just enough to stay on one line (a 40-character name or a ₱1,234,567.89 total must never wrap).
  const page = Math.min(useWindowDimensions().width, 560) - 32;
  const heroSize = fitFontSize(formatPesos(totals.owed), 38, page - 36);
  const tileSize = fitFontSize(formatPesos(Math.max(totals.dueThisMonth, totals.paidThisMonth)), 20, (page - 12) / 2 - 24);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
      <Text style={[s.h1, { color: t.text }]}>Hi there</Text>
      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 15, color: t.muted, marginBottom: 12 }}>{new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}</Text>

      <Pressable accessibilityRole="button" accessibilityLabel={`Total I owe ${formatPesos(totals.owed)}`} onPress={() => onTab('debts')}>
        <LinearGradient colors={[t.accentFill, t.mesh2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <Text style={s.heroLab}>Total I owe</Text>
          <Text style={[s.heroAmt, { fontSize: heroSize }]}>{formatPesos(totals.owed)}</Text>
          <Text style={s.heroSub}>{totals.activeCount} active {totals.activeCount === 1 ? 'debt' : 'debts'}</Text>
        </LinearGradient>
      </Pressable>

      <View style={s.tiles}>
        <Pressable accessibilityRole="button" onPress={() => onTab('schedule')} style={[s.tile, { backgroundColor: t.peachBg }]}>
          <Text style={[s.tileLab, { color: t.text }]}>Due this month</Text>
          <Text style={[s.tileAmt, { color: t.text, fontSize: tileSize }]}>{formatPesos(totals.dueThisMonth)}</Text>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: t.peachInk }}>{formatPesos(totals.dueThisMonthPaid)} paid</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onTab('reports')} style={[s.tile, { backgroundColor: t.mintBg }]}>
          <Text style={[s.tileLab, { color: t.text }]}>Paid this month</Text>
          <Text style={[s.tileAmt, { color: t.text, fontSize: tileSize }]}>{formatPesos(totals.paidThisMonth)}</Text>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: t.mintInk }}>logged payments</Text>
        </Pressable>
      </View>
      {totals.overdueCount > 0 ? (
        <View style={[s.overdue, { backgroundColor: t.redBg }]}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: t.danger }}>{totals.overdueCount} overdue · {formatPesos(totals.overdueAmount)}</Text>
        </View>
      ) : null}

      <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={s.between}>
          <Text style={[s.h2, { color: t.text }]}>Monthly cash flow</Text>
          <Pressable accessibilityRole="button" style={s.edit} onPress={() => { setInc(cash.income ? pesosToInput(cash.income) : ''); setExp(cash.expenses ? pesosToInput(cash.expenses) : ''); setEditing((e) => !e); }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: t.accent }}>{editing ? 'Close' : 'Edit'}</Text>
          </Pressable>
        </View>
        {editing ? (
          <View style={{ marginTop: 10 }}>
            <Field label="Income this month" error={incN === null ? 'Enter an amount.' : undefined}>
              <Input label="Income" value={inc} onChangeText={setInc} placeholder="0" keyboardType="decimal-pad" prefix={currencySymbol()} maxLength={16} />
            </Field>
            <Field label="Expenses this month" error={expN === null ? 'Enter an amount.' : undefined}>
              <Input label="Expenses" value={exp} onChangeText={setExp} placeholder="0" keyboardType="decimal-pad" prefix={currencySymbol()} maxLength={16} />
            </Field>
            <Button label="Save" disabled={incN === null || expN === null} onPress={() => { if (incN !== null && expN !== null) { saveCash(incN, expN); setEditing(false); } }} />
          </View>
        ) : !cash.income && !cash.expenses ? (
          // Nothing typed yet: a quiet prompt, never a red "−₱800" made of blank inputs (Erina, 2026-10-21).
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20, color: t.muted, marginTop: 6 }}>
            Add this month’s income and expenses to see what is left after debt payments.
          </Text>
        ) : (
          <>
            <Row label="Income" value={formatPesos(cash.income)} />
            <Row label="Expenses" value={formatPesos(cash.expenses)} />
            <Row label="Debt payments" value={formatPesos(totals.paidThisMonth)} />
            <View style={[s.remain, { backgroundColor: t.accentSoft }]}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: t.accent, flex: 1 }}>Cash remaining</Text>
              <Text style={{ fontFamily: 'Inter_800ExtraBold', fontSize: 22, color: left < 0 ? t.text : t.accent }}>{formatPesos(left)}</Text>
            </View>
          </>
        )}
      </View>

      <Text style={[s.h2, { color: t.text, marginTop: 14, marginBottom: 8 }]}>Next payment</Text>
      {next && next.next ? (
        <Pressable accessibilityRole="button" onPress={() => onOpen(next.debt.id)} style={[s.card, s.nextRow, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Avatar name={next.debt.person_name} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: t.text }}>{next.debt.person_name}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: t.muted }}>{next.debt.kind === 'installments' ? 'Installment' : 'One-time'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 17, color: t.text }}>{formatPesos(next.next.amount)}</Text>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: next.state === 'overdue' ? t.danger : t.muted }}>{next.state === 'overdue' ? 'Overdue · ' : next.state === 'today' ? 'Due today · ' : 'Due '}{formatShort(next.next.date)}</Text>
            <StateTag state={next.state} />
          </View>
        </Pressable>
      ) : (
        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: t.muted }}>{views.length ? 'You are all caught up. Nothing is due.' : 'Nothing due yet. Add your first debt to see it here.'}</Text>
        </View>
      )}

      <View style={s.buttons}>
        <View style={{ flex: 1 }}><Button label="Add debt" onPress={onAdd} /></View>
        <View style={{ flex: 1 }}><Button label="Log payment" kind="outline" disabled={!next} onPress={() => next && onLogPayment(next.debt.id)} /></View>
      </View>
    </ScrollView>
  );

  function Row({ label, value }: { label: string; value: string }) {
    return (
      <View style={s.row}>
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 15, color: t.text, flex: 1 }}>{label}</Text>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: t.text }}>{value}</Text>
      </View>
    );
  }
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  h1: { fontFamily: 'Inter_800ExtraBold', fontSize: 26, letterSpacing: -0.3, marginTop: 6 },
  h2: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  hero: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16 },
  heroLab: { fontFamily: 'Inter_500Medium', fontSize: 15, color: 'rgba(255,255,255,0.92)' },
  heroAmt: { fontFamily: 'Inter_800ExtraBold', fontSize: 38, letterSpacing: -0.8, color: '#FFFFFF', marginVertical: 2 },
  heroSub: { fontFamily: 'Inter_500Medium', fontSize: 15, color: 'rgba(255,255,255,0.92)' },
  tiles: { flexDirection: 'row', gap: 12, marginTop: 12 },
  tile: { flex: 1, borderRadius: 16, padding: 12, minHeight: 84 },
  tileLab: { fontFamily: 'Inter_500Medium', fontSize: 12.5, opacity: 0.85 },
  tileAmt: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.3, marginVertical: 2 },
  overdue: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginTop: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  edit: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center', marginVertical: -12 }, // 44px to tap, without making the card taller
  row:{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  remain: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 0 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 16 },
});
