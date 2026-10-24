// The app frame (round 4): four tabs over a glass tab bar, pushed screens that fade in, Settings as a sheet.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { startBackNav, useBackHandler } from './backNav';
import { DebtDetail } from './DebtDetail';
import { DebtForm } from './DebtForm';
import { DebtsScreen, type DebtFilter } from './DebtsScreen';
import { HomeScreen } from './HomeScreen';
import { Icon, type IconName } from './icons';
import type { LineFormKind } from './lines';
import { LineFormScreen } from './LineFormScreen';
import { Press } from './motion';
import { PersonScreen } from './PersonScreen';
import { QrFormScreen, QrGallery, QrShow } from './QrScreens';
import { refreshHere } from './reminders';
import { ReportsScreen } from './ReportsScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SettingsSheet } from './SettingsScreen';
import { useSettings } from './settings';
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
  | { name: 'add'; person?: string; from?: Route }
  | { name: 'detail'; id: string; from?: Route }
  | { name: 'edit'; id: string }
  | { name: 'person'; key: string; from?: Route }
  | { name: 'line'; id: string; kind: LineFormKind; editId?: string; back?: Route }
  | { name: 'qr' }
  | { name: 'qrshow'; id: string; back?: Route }
  | { name: 'qrform'; editId?: string; replaceId?: string; person?: string; back?: Route };

export function Shell({ userId }: { userId: string }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const { status, pending, refused } = useStore();
  const [tab, setTab] = useState<TabKey>('home');
  const [filter, setFilter] = useState<DebtFilter>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'tabs' });
  const tabs: Route = { name: 'tabs' };
  const go = (r: Route) => setRoute(r);
  const back = (r?: Route) => setRoute(r ?? tabs);

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
  const routeBack = (): Route => {
    switch (route.name) {
      case 'add': case 'detail': case 'person': return route.from ?? tabs;
      case 'edit': return { name: 'detail', id: route.id };
      case 'line': return route.back ?? { name: 'detail', id: route.id };
      case 'qrshow': case 'qrform': return route.back ?? { name: 'qr' };
      default: return tabs;
    }
  };
  useBackHandler(route.name !== 'tabs', () => back(routeBack()));
  useBackHandler(route.name === 'tabs' && !settingsOpen && tab !== 'home', () => setTab('home'));

  const openDetail = (id: string) => go({ name: 'detail', id, from: route });
  const openPerson = (key: string) => go({ name: 'person', key, from: route });
  const here = route;

  let screen: React.ReactNode = null;
  if (route.name === 'add') screen = <DebtForm person={route.person} onClose={() => back(route.from)} onSaved={(id) => go({ name: 'detail', id, from: route.from })} />;
  else if (route.name === 'edit') screen = <DebtForm editId={route.id} onClose={() => back({ name: 'detail', id: route.id })} onSaved={(id) => go({ name: 'detail', id })} />;
  else if (route.name === 'line') screen = <LineFormScreen debtId={route.id} kind={route.kind} editId={route.editId} onClose={() => back(route.back ?? { name: 'detail', id: route.id })} />;
  else if (route.name === 'detail')
    screen = (
      <DebtDetail
        id={route.id}
        back={route.from?.name === 'person' ? 'Back' : route.from?.name === 'tabs' && tab === 'home' ? 'Home' : 'My debts'}
        onBack={() => back(route.from)}
        onEdit={() => go({ name: 'edit', id: route.id })}
        onDeleted={() => back(route.from)}
        onBorrowAgain={(person) => go({ name: 'add', person, from: here })}
        onLine={(kind, editId) => go({ name: 'line', id: route.id, kind, editId, back: here })}
        onShowQr={(qrId) => go({ name: 'qrshow', id: qrId, back: here })}
        onAddQr={(person) => go({ name: 'qrform', person, back: here })}
        onPerson={openPerson}
      />
    );
  else if (route.name === 'person')
    screen = (
      <PersonScreen
        personKey={route.key}
        onBack={() => back(route.from)}
        onOpen={(id) => go({ name: 'detail', id, from: here })}
        onBorrowAgain={(person) => go({ name: 'add', person, from: here })}
        onShowQr={(id) => go({ name: 'qrshow', id, back: here })}
        onAddQr={(person) => go({ name: 'qrform', person, back: here })}
      />
    );
  else if (route.name === 'qr') screen = <QrGallery onBack={() => back()} onOpen={(id) => go({ name: 'qrshow', id })} onAdd={() => go({ name: 'qrform' })} />;
  else if (route.name === 'qrform') {
    const r = route;
    const backTo = r.editId ?? r.replaceId;
    screen = (
      <QrFormScreen
        editId={r.editId}
        replaceId={r.replaceId}
        person={r.person}
        onClose={() => (backTo ? go({ name: 'qrshow', id: backTo, back: r.back }) : back(r.back ?? { name: 'qr' }))}
        onSaved={(id) => go({ name: 'qrshow', id, back: r.back })}
      />
    );
  } else if (route.name === 'qrshow') {
    const r = route;
    screen = (
      <QrShow
        id={r.id}
        userId={userId}
        onBack={() => back(r.back ?? { name: 'qr' })}
        onEdit={() => go({ name: 'qrform', editId: r.id, back: r.back })}
        onReplace={() => go({ name: 'qrform', replaceId: r.id, back: r.back })}
        onRemoved={() => back(r.back ?? { name: 'qr' })}
        onLogPayment={(debtId) => go({ name: 'line', id: debtId, kind: 'payment', back: here })}
      />
    );
  }

  const syncNote = refused > 0 ? `${refused} change${refused === 1 ? '' : 's'} could not be saved to the cloud.` : status === 'offline' ? (pending > 0 ? `Offline. ${pending} change${pending === 1 ? '' : 's'} saved on this phone, waiting to sync.` : 'Offline. You can keep working; changes sync later.') : pending > 0 && status !== 'loading' ? 'Saved on this phone. Syncing…' : null;
  const notes = (
    <>
      {showExit ? <View style={s.note}><Banner text="Press back again to exit" /></View> : null}
      {syncNote ? <View style={s.note}><Banner tone={refused > 0 ? 'warn' : 'info'} text={syncNote} /></View> : null}
    </>
  );
  const settings = <SettingsSheet visible={settingsOpen} userId={userId} onClose={() => setSettingsOpen(false)} onOpenQr={() => go({ name: 'qr' })} />;

  if (screen) {
    return (
      <View style={[s.fill, { backgroundColor: t.bg }]}>
        <View key={`${route.name}:${'id' in route ? route.id : ''}:${'key' in route ? route.key : ''}:${route.name === 'line' ? route.kind + (route.editId ?? '') : ''}`} style={s.fill} {...({ dataSet: { anim: 'screen' } } as object)}>{screen}</View>
        {showExit ? <View pointerEvents="none" style={[s.notes, { bottom: insets.bottom + 90 }]}><View style={s.note}><Banner text="Press back again to exit" /></View></View> : null}
        {settings}
      </View>
    );
  }

  const openSettings = () => setSettingsOpen(true);
  return (
    <View style={[s.fill, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      {notes}
      <View key={tab} style={s.fill} {...({ dataSet: { anim: 'screen' } } as object)}>
        {tab === 'debts' ? (
          <DebtsScreen filter={filter} onFilter={setFilter} onAdd={() => go({ name: 'add', from: tabs })} onOpen={openDetail} onPerson={openPerson} onQr={() => go({ name: 'qr' })} onSettings={openSettings} />
        ) : tab === 'schedule' ? (
          <ScheduleScreen onOpen={openDetail} onSettings={openSettings} />
        ) : tab === 'reports' ? (
          <ReportsScreen onSettings={openSettings} />
        ) : (
          <HomeScreen
            onOpen={openDetail}
            onPerson={openPerson}
            onTab={(k) => { if (k === 'debts') setFilter('all'); setTab(k); }}
            onOverdue={() => { setFilter('overdue'); setTab('debts'); }}
            onEditLine={(debtId, lineId) => go({ name: 'line', id: debtId, kind: 'payment', editId: lineId, back: tabs })}
            onSettings={openSettings}
          />
        )}
      </View>

      <View style={[s.tabbar, { backgroundColor: t.tabGlass, borderTopColor: t.tabBorder, paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist" {...({ dataSet: { glass: 'bar' } } as object)}>
        {TABS.map((x) => {
          const on = tab === x.key;
          const color = on ? t.accent : t.muted;
          return (
            <Press key={x.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(x.key)} style={[s.tab, on && { backgroundColor: t.accentSoft }]}>
              <Icon name={x.icon} color={color} />
              <Text style={[s.tabLabel, { color, fontFamily: on ? 'Manrope_600' : 'Manrope_500' }]}>{x.label}</Text>
            </Press>
          );
        })}
      </View>
      {settings}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  note: { paddingHorizontal: 16 },
  notes: { position: 'absolute', left: 0, right: 0 },
  tabbar: { flexDirection: 'row', gap: 2, paddingHorizontal: 10, paddingTop: 6, borderTopWidth: 1 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 7, borderRadius: 16, minHeight: 52, justifyContent: 'center' },
  tabLabel: { fontSize: 11 },
});
