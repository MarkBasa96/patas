import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { byDueSoonest, type DebtState, type DebtView } from './derive';
import { formatPesos } from './money';
import { formatShort } from './plan';
import { useSettings } from './settings';
import { useStore } from './store';
import { Avatar, Button, Chip, ProgressBar } from './ui';

type Filter = 'all' | 'one_time' | 'installments' | 'settled';

export function StateTag({ state }: { state: DebtState }) {
  const { t } = useSettings();
  const map: Record<DebtState, { label: string; bg: string; fg: string }> = {
    settled: { label: 'Settled', bg: t.mintBg, fg: t.mintInk },
    overdue: { label: 'Overdue', bg: t.redBg, fg: t.danger },
    today: { label: 'Due today', bg: t.peachBg, fg: t.peachInk },
    upcoming: { label: 'Upcoming', bg: t.accentSoft, fg: t.accent },
    open: { label: 'Pay when I can', bg: t.accentSoft, fg: t.muted },
  };
  // Pills only where they carry news: Overdue, Due today, Settled (Erina, 2026-10-21). "Upcoming" sits next
  // to a date that already says it; "Pay when I can" is plain muted text.
  if (state === 'upcoming') return null;
  if (state === 'open') return <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: t.muted }}>Pay when I can</Text>;
  const m = map[state];
  return (
    <View style={{ backgroundColor: m.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: m.fg }}>{m.label}</Text>
    </View>
  );
}

function DebtCard({ v, onPress }: { v: DebtView; onPress: () => void }) {
  const { t } = useSettings();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${v.debt.person_name}, ${formatPesos(v.bal.remaining)} remaining`} onPress={onPress} style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={s.row}>
        <Avatar name={v.debt.person_name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[s.person, { color: t.text }]}>{v.debt.person_name}</Text>
          {v.debt.title ? <Text numberOfLines={1} style={[s.sub, { color: t.muted }]}>{v.debt.title}</Text> : null}
        </View>
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: t.muted }}>{v.debt.kind === 'installments' ? 'Installments' : 'One-time'}</Text>
      </View>
      <View style={[s.row, { marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap' }]}>
        <View style={{ flexGrow: 1, flexBasis: 160, minWidth: 0 }}>
          <Text style={[s.rem, { color: t.text }]}>
            {formatPesos(v.bal.remaining)} <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: t.muted }}>remaining</Text>
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4, marginLeft: 'auto' }}>
          {v.next ? <Text style={[s.sub, { color: t.text }]}>{formatPesos(v.next.amount)} · {formatShort(v.next.date)}</Text> : null}
          <StateTag state={v.state} />
        </View>
      </View>
      {/* Its own full-width row, so every card's bar is the same length (Erina, 2026-10-21). */}
      <View style={{ marginTop: 10 }}><ProgressBar pct={v.bal.pct} /></View>
    </Pressable>
  );
}

export function DebtsScreen({ onAdd, onOpen }: { onAdd: () => void; onOpen: (id: string) => void }) {
  const { t } = useSettings();
  const { views } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const active = useMemo(() => views.filter((v) => v.state !== 'settled'), [views]);
  const settledViews = useMemo(() => views.filter((v) => v.state === 'settled'), [views]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (filter === 'settled' ? settledViews : active)
      .filter((v) => (filter === 'all' || filter === 'settled' || v.debt.kind === filter) && (!needle || `${v.debt.person_name} ${v.debt.title}`.toLowerCase().includes(needle)))
      .sort(byDueSoonest);
  }, [active, settledViews, q, filter]);
  const total = shown.reduce((n, v) => n + v.bal.remaining, 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <View style={s.titleRow}>
        <Text style={[s.h1, { color: t.text }]}>My debts</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Add debt" onPress={onAdd} style={[s.plus, { backgroundColor: t.accentSoft }]}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: t.accent, marginTop: -2 }}>+</Text>
        </Pressable>
      </View>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search a person or debt"
        placeholderTextColor={t.muted}
        accessibilityLabel="Search a person or debt"
        autoCorrect={false}
        style={[s.search, { backgroundColor: t.field, borderColor: t.border, color: t.text }]}
      />
      <View style={s.chips}>
        <Chip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="One-time" on={filter === 'one_time'} onPress={() => setFilter('one_time')} />
        <Chip label="Installments" on={filter === 'installments'} onPress={() => setFilter('installments')} />
      </View>
      <View style={[s.total, { backgroundColor: t.accentSoft }]}>
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: t.muted }}>Outstanding</Text>
        <Text style={{ fontFamily: 'Inter_800ExtraBold', fontSize: 26, letterSpacing: -0.5, color: t.text }}>{formatPesos(total)}</Text>
      </View>

      {shown.map((v) => (
        <DebtCard key={v.debt.id} v={v} onPress={() => onOpen(v.debt.id)} />
      ))}

      {!shown.length ? (
        <View style={s.empty}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: t.text }}>{filter === 'settled' ? 'Nothing settled yet' : active.length ? 'Nothing matches' : 'No debts yet'}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: t.muted, textAlign: 'center', marginTop: 6 }}>
            {filter === 'settled' ? 'When a debt is settled it moves here.' : active.length ? 'Try another word or filter.' : 'Add the first one to start keeping track.'}
          </Text>
          {!active.length && filter !== 'settled' ? <View style={{ marginTop: 16, alignSelf: 'stretch' }}><Button label="Add your first debt" onPress={onAdd} /></View> : null}
        </View>
      ) : null}

      {/* Settled debts live behind a link at the foot of the list, as in the approved design. */}
      {filter === 'settled' ? (
        <Pressable accessibilityRole="button" onPress={() => setFilter('all')} style={s.foot}>
          <Text style={[s.footText, { color: t.accent }]}>Back to active debts</Text>
        </Pressable>
      ) : settledViews.length ? (
        <Pressable accessibilityRole="button" onPress={() => setFilter('settled')} style={s.foot}>
          <Text style={[s.footText, { color: t.accent }]}>View settled debts ({settledViews.length})</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 10 },
  h1: { fontFamily: 'Inter_800ExtraBold', fontSize: 26, letterSpacing: -0.3 },
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  search: { fontFamily: 'Inter_500Medium', fontSize: 15, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 },
  chips: { flexDirection: 'row', gap: 8, marginVertical: 12, flexWrap: 'wrap' },
  total: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  person: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  sub: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  rem: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 8 },
  foot: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  footText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
