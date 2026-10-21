import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { startBackNav, useBackHandler } from './backNav';
import { DebtDetail } from './DebtDetail';
import { DebtForm } from './DebtForm';
import { DebtsScreen } from './DebtsScreen';
import { HomeScreen } from './HomeScreen';
import { ReportsScreen } from './ReportsScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { LineFormScreen } from './LineFormScreen';
import { Icon, type IconName } from './icons';
import { SettingsScreen } from './SettingsScreen';
import { QrFormScreen, QrGallery, QrShow } from './QrScreens';
import { useSettings } from './settings';
import { refreshHere } from './reminders';
import { useStore } from './store';
import { Banner } from './ui';

type TabKey = 'home' | 'debts' | 'schedule' | 'reports';
const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'debts', label: 'Debts', icon: 'debts' },
  { key: 'schedule', label: 'Schedule', icon: 'schedule' },
  { key: 'reports', label: 'Reports', icon: 'reports' },
];

type Route =
  | { name: 'tabs' }
  | { name: 'add' }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'line'; id: string; kind: 'payment' | 'charge'; editId?: string }
  | { name: 'qr' }
  | { name: 'qrshow'; id: string; from?: string }
  | { name: 'qrform'; editId?: string; replaceId?: string; person?: string; from?: string };

export function Shell({ userId }: { userId: string }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const { status, pending, refused } = useStore();
  const [tab, setTab] = useState<TabKey>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'tabs' });

  const toDebts = () => { setTab('debts'); setRoute({ name: 'tabs' }); };

  // iPhone can drop a reminder subscription silently: re-save it on every open while permission holds.
  useEffect(() => { void refreshHere().catch(() => {}); }, []);

  // The phone's Back button: close what is open, then go Home, then ask before leaving.
  const [showExit, setShowExit] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () =>
      startBackNav(() => {
        setShowExit(true);
        if (exitTimer.current) clearTimeout(exitTimer.current);
        exitTimer.current = setTimeout(() => setShowExit(false), 2000);
      }),
    [],
  );
  const detailId = route.name === 'edit' || route.name === 'line' || route.name === 'detail' ? route.id : '';
  useBackHandler(route.name === 'add' || route.name === 'detail', toDebts);
  useBackHandler(route.name === 'edit' || route.name === 'line', () => setRoute({ name: 'detail', id: detailId }));
  // QR screens go back to where they were opened from: a debt, or the gallery.
  const qrBack = (from?: string) => setRoute(from ? { name: 'detail', id: from } : { name: 'qr' });
  const qrFrom = route.name === 'qrshow' || route.name === 'qrform' ? route.from : undefined;
  useBackHandler(route.name === 'qr', () => setRoute({ name: 'tabs' }));
  useBackHandler(route.name === 'qrshow' || route.name === 'qrform', () => qrBack(qrFrom));
  useBackHandler(route.name === 'tabs' && settingsOpen, () => setSettingsOpen(false));
  useBackHandler(route.name === 'tabs' && !settingsOpen && tab !== 'home', () => setTab('home'));
  if (route.name === 'add') return <DebtForm onClose={toDebts} onSaved={(id) => setRoute({ name: 'detail', id })} />;
  if (route.name === 'edit') return <DebtForm editId={route.id} onClose={() => setRoute({ name: 'detail', id: route.id })} onSaved={(id) => setRoute({ name: 'detail', id })} />;
  if (route.name === 'line') return <LineFormScreen debtId={route.id} kind={route.kind} editId={route.editId} onClose={() => setRoute({ name: 'detail', id: route.id })} />;
  if (route.name === 'detail')
    return (
      <DebtDetail
        id={route.id}
        onBack={toDebts}
        onEdit={() => setRoute({ name: 'edit', id: route.id })}
        onDeleted={toDebts}
        onLine={(kind, editId) => setRoute({ name: 'line', id: route.id, kind, editId })}
        onShowQr={(qrId) => setRoute({ name: 'qrshow', id: qrId, from: route.id })}
        onAddQr={(person) => setRoute({ name: 'qrform', person, from: route.id })}
      />
    );
  if (route.name === 'qr') return <QrGallery onBack={() => setRoute({ name: 'tabs' })} onOpen={(id) => setRoute({ name: 'qrshow', id })} onAdd={() => setRoute({ name: 'qrform' })} />;
  if (route.name === 'qrform') {
    const back = route.editId ?? route.replaceId;
    return (
      <QrFormScreen
        editId={route.editId}
        replaceId={route.replaceId}
        person={route.person}
        onClose={() => (back ? setRoute({ name: 'qrshow', id: back, from: route.from }) : qrBack(route.from))}
        onSaved={(id) => setRoute({ name: 'qrshow', id, from: route.from })}
      />
    );
  }
  if (route.name === 'qrshow')
    return (
      <QrShow
        id={route.id}
        userId={userId}
        onBack={() => qrBack(route.from)}
        onEdit={() => setRoute({ name: 'qrform', editId: route.id, from: route.from })}
        onReplace={() => setRoute({ name: 'qrform', replaceId: route.id, from: route.from })}
        onRemoved={() => qrBack(route.from)}
        onLogPayment={(debtId) => setRoute({ name: 'line', id: debtId, kind: 'payment' })}
      />
    );

  const syncNote = refused > 0 ? `${refused} change${refused === 1 ? '' : 's'} could not be saved to the cloud.` : status === 'offline' ? (pending > 0 ? `Offline. ${pending} change${pending === 1 ? '' : 's'} saved on this phone, waiting to sync.` : 'Offline. You can keep working; changes sync later.') : pending > 0 && status !== 'loading' ? 'Saved on this phone. Syncing…' : null;

  return (
    <View style={[s.fill, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <View style={s.appbar}>
        <Text style={[s.brand, { color: t.text }]}>Patas</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => setSettingsOpen((v) => !v)} style={[s.avatar, { backgroundColor: t.accentSoft }]}>
          <Text style={[s.avatarText, { color: t.accent }]}>{settingsOpen ? '×' : 'P'}</Text>
        </Pressable>
      </View>
      {showExit ? <View style={{ paddingHorizontal: 16 }}><Banner text="Press back again to exit" /></View> : null}
      {syncNote ? <View style={{ paddingHorizontal: 16 }}><Banner tone={refused > 0 ? 'warn' : 'info'} text={syncNote} /></View> : null}

      {settingsOpen ? (
        <SettingsScreen userId={userId} onOpenQr={() => setRoute({ name: 'qr' })} />
      ) : tab === 'debts' ? (
        <DebtsScreen onAdd={() => setRoute({ name: 'add' })} onOpen={(id) => setRoute({ name: 'detail', id })} />
      ) : tab === 'schedule' ? (
        <ScheduleScreen onOpen={(id) => setRoute({ name: 'detail', id })} />
      ) : tab === 'reports' ? (
        <ReportsScreen onOpen={(id) => setRoute({ name: 'detail', id })} />
      ) : (
        <HomeScreen
          onAdd={() => setRoute({ name: 'add' })}
          onOpen={(id) => setRoute({ name: 'detail', id })}
          onTab={(k) => setTab(k)}
          onLogPayment={(id) => setRoute({ name: 'line', id, kind: 'payment' })}
        />
      )}

      <View style={[s.tabbar, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist">
        {TABS.map((x) => {
          const on = !settingsOpen && tab === x.key;
          const color = on ? t.accent : t.muted;
          return (
            <Pressable key={x.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { setSettingsOpen(false); setTab(x.key); }} style={[s.tab, on && { backgroundColor: t.accentSoft }]}>
              <Icon name={x.icon} color={color} />
              <Text style={[s.tabLabel, { color, fontFamily: on ? 'Inter_600SemiBold' : 'Inter_500Medium' }]}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  appbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 5 }, // 5 + a 44px avatar = the old 8 + 38px bar height
  brand: { fontFamily: 'Inter_800ExtraBold', fontSize: 19, letterSpacing: 0.2 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  h1: { fontFamily: 'Inter_800ExtraBold', fontSize: 26, marginTop: 6, marginBottom: 10, letterSpacing: -0.3 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 10 },
  cardText: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21 },
  peso: { fontFamily: 'Inter_800ExtraBold', fontSize: 34, marginTop: 10, letterSpacing: -0.8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3 },
  tabbar: { flexDirection: 'row', gap: 2, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: 1 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 7, borderRadius: 16 },
  tabLabel: { fontSize: 11 },
});
