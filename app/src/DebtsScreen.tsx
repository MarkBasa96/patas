// My debts (round 4): a search box that is also a dropdown (people and debts), filter chips that wrap, rows that say
// "₱x left" with the next date and a thin bar, the QR gallery button, Add, and the settled list.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { byDueSoonest } from './derive';
import { Icon } from './icons';
import { people } from './insights';
import { DebtRow, Empty, Header, IconBtn, KIND_LABEL, LinkBtn, ListCard, PersonAvatar, plural, Row, T, type as TY, useMoney } from './kit';
import { Press, Wash } from './motion';
import { useSettings } from './settings';
import { useStore } from './store';
import { Chip } from './ui';

export type DebtFilter = 'all' | 'one_time' | 'installments' | 'recurring' | 'overdue';

export function DebtsScreen({ filter, onFilter, onAdd, onOpen, onPerson, onQr, onSettings }: { filter: DebtFilter; onFilter: (f: DebtFilter) => void; onAdd: () => void; onOpen: (id: string) => void; onPerson: (key: string) => void; onQr: () => void; onSettings: () => void }) {
  const { t } = useSettings();
  const { views } = useStore();
  const { conv, display, fmtSum, fmtIn } = useMoney();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [allPeople, setAllPeople] = useState(false);
  const [applied, setApplied] = useState('');
  const [showSettled, setShowSettled] = useState(false);
  const ppl = useMemo(() => people(views, conv, display), [views, conv, display]);
  const act = views.filter((v) => v.state !== 'settled').sort(byDueSoonest);
  const settled = views.filter((v) => v.state === 'settled').sort((a, b) => (b.debt.settled_on ?? '').localeCompare(a.debt.settled_on ?? ''));
  const needle = applied.trim().toLowerCase();
  const shown = (showSettled ? settled : act).filter(
    (v) => (filter === 'all' || filter === 'overdue' || v.debt.kind === filter) && (filter !== 'overdue' || v.state === 'overdue') && (!needle || `${v.debt.person_name} ${v.debt.title}`.toLowerCase().includes(needle)),
  );
  const n = q.trim().toLowerCase();
  const pm = n ? ppl.filter((p) => p.name.toLowerCase().includes(n)).slice(0, 3) : ppl.slice(0, 5);
  const dm = n ? views.filter((v) => `${v.debt.title} ${v.debt.person_name}`.toLowerCase().includes(n)).slice(0, 6 - pm.length) : [];
  const chips: [DebtFilter, string][] = [['all', 'All'], ['one_time', 'One-time'], ['installments', 'Installment'], ['recurring', 'Recurring'], ['overdue', 'Overdue']];

  return (
    <View style={{ flex: 1 }}>
      <Wash height={220} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Header
          title={allPeople ? 'People' : showSettled ? 'Settled debts' : 'My debts'}
          onSettings={onSettings}
          right={
            <>
              <IconBtn name="qr" label="Payment QR codes" onPress={onQr} soft />
              <IconBtn name="plus" label="Add debt" onPress={onAdd} filled />
            </>
          }
        />
        <View style={{ zIndex: 5 }}>
          <View style={[s.inp, { backgroundColor: t.field, borderColor: open ? t.accent : t.border }]}>
            <Icon name="search" size={20} color={t.muted} />
            <TextInput
              value={q}
              onChangeText={(x) => { setQ(x); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onSubmitEditing={() => { setApplied(q); setOpen(false); }}
              placeholder="Search people or debts"
              placeholderTextColor={t.muted}
              accessibilityLabel="Search people or debts"
              autoCorrect={false}
              returnKeyType="search"
              style={[s.input, { color: t.text }]}
            />
            <Press accessibilityRole="button" accessibilityLabel={open ? 'Close the list' : 'Show all people and debts'} accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={s.ddBtn}>
              <Icon name={open ? 'x' : 'down'} size={20} color={t.accent} />
            </Press>
          </View>
          {open ? (
            <View style={[s.dd, { backgroundColor: t.glassStrong, borderColor: t.panelBorder, shadowColor: t.shadow }]} {...({ dataSet: { glass: 'panel', anim: 'fade' } } as object)}>
              {pm.length ? <T v="cap" tone="muted" style={s.grp}>PEOPLE</T> : null}
              {pm.map((p) => (
                <Press key={p.key} soft accessibilityRole="button" onPress={() => { setOpen(false); onPerson(p.key); }} style={s.opt}>
                  <PersonAvatar name={p.name} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Hl text={p.name} n={n} />
                    <T v="meta" tone="muted" lines={1}>{plural(p.views.length, 'debt')} · {fmtSum(p.remaining)}</T>
                  </View>
                </Press>
              ))}
              {dm.length ? <T v="cap" tone="muted" style={s.grp}>DEBTS</T> : null}
              {dm.map((v) => (
                <Press key={v.debt.id} soft accessibilityRole="button" onPress={() => { setOpen(false); onOpen(v.debt.id); }} style={s.opt}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Hl text={v.debt.title || KIND_LABEL[v.debt.kind]} n={n} />
                    <T v="meta" tone="muted" lines={1}>{v.debt.person_name} · {KIND_LABEL[v.debt.kind]}</T>
                  </View>
                  <T v="meta">{fmtIn(v.bal.remaining, v.debt.currency)}</T>
                </Press>
              ))}
              {n && !pm.length && !dm.length ? <Empty text={`No person or debt called “${q.trim()}”.`} /> : null}
              {!n && ppl.length ? (
                <Press soft accessibilityRole="button" onPress={() => { setOpen(false); setAllPeople(true); }} style={[s.opt, { justifyContent: 'space-between' }]}>
                  <T v="row" tone="accent">All people ({ppl.length})</T>
                  <Icon name="right" size={18} color={t.accent} />
                </Press>
              ) : null}
              {!n && !ppl.length ? <Empty text="Nobody yet. Add a debt first." /> : null}
            </View>
          ) : null}
        </View>

        {allPeople ? (
          <>
            <View style={s.between}><T v="meta" tone="muted">Everyone you owe</T><LinkBtn label="Back to debts" onPress={() => setAllPeople(false)} /></View>
            <ListCard style={{ marginTop: 4 }}>
              {ppl.map((p, i) => (
                <Row key={p.key} first={i === 0} onPress={() => onPerson(p.key)} label={p.name}>
                  <PersonAvatar name={p.name} />
                  <View style={{ flex: 1, minWidth: 0 }}><T v="row" lines={1}>{p.name}</T><T v="meta" tone="muted">{plural(p.views.length, 'debt')} · {p.open} open</T></View>
                  <T v="row">{fmtSum(p.remaining)}</T>
                </Row>
              ))}
            </ListCard>
          </>
        ) : (
          <>
            <View style={[s.chips, open && { opacity: 0 }]} pointerEvents={open ? 'none' : 'auto'}>
              {chips.map(([k, l]) => <Chip key={k} label={l} on={filter === k} onPress={() => onFilter(k)} />)}
            </View>
            {applied ? (
              <View style={s.between}>
                <T v="meta" tone="muted" lines={1} style={{ flex: 1 }}>Showing “{applied}”</T>
                <LinkBtn label="Clear" onPress={() => { setApplied(''); setQ(''); }} />
              </View>
            ) : null}
            <ListCard style={{ marginTop: 12 }}>
              {shown.length ? shown.map((v, i) => <DebtRow key={v.debt.id} v={v} first={i === 0} onPress={() => onOpen(v.debt.id)} />) : <Empty text={showSettled ? 'No settled debts yet.' : views.length ? 'Nothing matches. Try another name or filter.' : 'No debts yet. Tap + to add the first one.'} />}
            </ListCard>
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              {showSettled ? <LinkBtn label="Back to active debts" onPress={() => setShowSettled(false)} /> : settled.length ? <LinkBtn label={`View settled debts (${settled.length})`} onPress={() => setShowSettled(true)} /> : null}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** The matching part in bold. */
function Hl({ text, n }: { text: string; n: string }) {
  const { t } = useSettings();
  const i = n ? text.toLowerCase().indexOf(n) : -1;
  if (i < 0) return <T v="row" lines={1}>{text}</T>;
  return (
    <Text numberOfLines={1} style={[TY.row, { color: t.text, fontFamily: 'Manrope_500' }]}>
      {text.slice(0, i)}
      <Text style={{ fontFamily: 'Manrope_700' }}>{text.slice(i, i + n.length)}</Text>
      {text.slice(i + n.length)}
    </Text>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  inp: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 12, borderWidth: 1, paddingLeft: 14, gap: 8 },
  input: { flex: 1, minWidth: 0, fontFamily: 'Manrope_500', fontSize: 16, minHeight: 50 },
  ddBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dd: { position: 'absolute', left: 0, right: 0, top: 58, borderRadius: 16, borderWidth: 1, paddingVertical: 6, maxHeight: 380, overflow: 'hidden', shadowOpacity: 1, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  grp: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.6 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
});
