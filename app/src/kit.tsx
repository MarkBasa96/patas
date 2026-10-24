// Round 4 building blocks shared by every screen, to the approved mockup (docs/mockups-v4: app.css type scale, rows,
// pills, the header with the small mascot). Money shown here always has centavos; totals in the display currency wear
// "≈" when any part was converted from another currency.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import type { DebtView } from './derive';
import { convert, ratesFor, type Rates } from './fx';
import { Icon, type IconName } from './icons';
import type { Conv, Sum } from './insights';
import { formatMoney } from './money';
import { Press } from './motion';
import { usePhotos } from './photos';
import { useSettings } from './settings';
import { useStore } from './store';
import { initials } from './ui';

// ---------------- money in the display currency ----------------
type MoneyCtx = { display: string; conv: Conv; rates: Rates | null; fmt: (c: number) => string; fmtSum: (s: Sum) => string; fmtIn: (c: number, code: string) => string };
const Ctx = createContext<MoneyCtx | null>(null);

export function MoneyProvider({ children }: { children: React.ReactNode }) {
  const { currency } = useStore();
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    let alive = true;
    void ratesFor(currency).then((r) => alive && setRates(r));
    return () => { alive = false; };
  }, [currency]);
  const value = useMemo<MoneyCtx>(() => {
    const conv: Conv = (a, from) => convert(a, from, currency, rates);
    return {
      display: currency, conv, rates,
      fmt: (c) => formatMoney(c, currency),
      fmtSum: (s) => (s.approx ? '≈ ' : '') + formatMoney(s.total, currency),
      fmtIn: (c, code) => formatMoney(c, code),
    };
  }, [currency, rates]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useMoney(): MoneyCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useMoney must be used inside MoneyProvider');
  return c;
}

// ---------------- type scale (app.css .t-*) ----------------
const TYPE = {
  hero: { fontFamily: 'Manrope_600', fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: 'Manrope_700', fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  pop: { fontFamily: 'Manrope_600', fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  greet: { fontFamily: 'Manrope_600', fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  card: { fontFamily: 'Manrope_600', fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  sec: { fontFamily: 'Manrope_600', fontSize: 17, lineHeight: 22 },
  row: { fontFamily: 'Manrope_600', fontSize: 15, lineHeight: 20 },
  body: { fontFamily: 'Manrope_400', fontSize: 16, lineHeight: 22 },
  meta: { fontFamily: 'Manrope_500', fontSize: 13, lineHeight: 18 },
  cap: { fontFamily: 'Manrope_500', fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
} as const;
export type TypeKey = keyof typeof TYPE;
type Tone = 'text' | 'muted' | 'accent' | 'ok' | 'amber' | 'danger' | 'white';

export function T({ v = 'body', tone = 'text', style, children, lines, label, role }: { v?: TypeKey; tone?: Tone; style?: StyleProp<TextStyle>; children?: React.ReactNode; lines?: number; label?: string; role?: 'header' }) {
  const { t } = useSettings();
  const color = { text: t.text, muted: t.muted, accent: t.accent, ok: t.mintInk, amber: t.peachInk, danger: t.danger, white: '#FFFFFF' }[tone];
  return (
    <Text numberOfLines={lines} accessibilityLabel={label} accessibilityRole={role} style={[TYPE[v], { color }, style]}>
      {children}
    </Text>
  );
}
export const type = TYPE;

// ---------------- pieces ----------------
export function Pill({ state }: { state: 'overdue' | 'today' | 'settled' | 'paid' | string }) {
  const { t } = useSettings();
  const map: Record<string, [string, string, string]> = {
    overdue: [t.redBg, t.danger, 'Overdue'], today: [t.peachBg, t.peachInk, 'Due today'], settled: [t.mintBg, t.mintInk, 'Settled'], paid: [t.mintBg, t.mintInk, 'Paid'],
  };
  const m = map[state];
  if (!m) return null;
  return (
    <View style={[k.pill, { backgroundColor: m[0] }]}>
      <Text style={[k.pillText, { color: m[1] }]}>{m[2]}</Text>
    </View>
  );
}

export function Bar({ pct, h = 3, style }: { pct: number; h?: number; style?: StyleProp<ViewStyle> }) {
  const { t } = useSettings();
  return (
    <View style={[{ height: h, borderRadius: h, backgroundColor: t.track, overflow: 'hidden' }, style]}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: h, backgroundColor: t.accentFill }} />
    </View>
  );
}

/** A person's avatar: their photo if one was added, else their initials. */
export function PersonAvatar({ name, size = 40, me }: { name: string; size?: number; me?: boolean }) {
  const { t } = useSettings();
  const photos = usePhotos();
  const uri = photos.urlFor(me ? 'me' : { person: name });
  if (uri) return <Image source={{ uri }} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: 'Manrope_600', fontSize: Math.round(size * 0.35), color: t.accent }}>{initials(name || 'P')}</Text>
    </View>
  );
}

const MASCOT = require('../assets/brand/patas-mono-small.png');

/** The small mascot on its violet tile (header). */
export function Logo({ size = 36 }: { size?: number }) {
  const { t } = useSettings();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: t.accentFill, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={MASCOT} style={{ width: size * 0.75, height: size * 0.75 }} resizeMode="contain" />
    </View>
  );
}

export function IconBtn({ name, label, onPress, filled, soft, color }: { name: IconName; label: string; onPress: () => void; filled?: boolean; soft?: boolean; color?: string }) {
  const { t } = useSettings();
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[k.iconBtn, filled && { backgroundColor: t.accentFill }, soft && { backgroundColor: t.accentSoft }]}>
      <Icon name={name} color={color ?? (filled ? '#FFFFFF' : t.accent)} />
    </Press>
  );
}

/** The screen header: mascot + title (tabs), or Back + title (pushed screens); avatar opens Settings. */
export function Header({ title, sub, back, onBack, onSettings, right, greet }: { title?: string; sub?: string; back?: string; onBack?: () => void; onSettings?: () => void; right?: React.ReactNode; greet?: boolean }) {
  const { t } = useSettings();
  const { name } = useStore();
  // A big title shrinks to its space (down to 18) instead of "My d…" on a 360 px phone with three header buttons.
  const [room, setRoom] = useState(0);
  const v: TypeKey = back !== undefined ? 'sec' : greet ? 'greet' : 'title';
  const fit = v === 'title' && title && room ? Math.max(18, Math.min(28, Math.floor(room / (title.length * 0.6)))) : 0;
  return (
    <View style={k.hdr}>
      {back !== undefined ? (
        <Press accessibilityRole="button" accessibilityLabel={back && back !== 'Back' ? `Back to ${back}` : 'Back'} onPress={onBack} style={k.back}>
          <Icon name="left" color={t.accent} />
          {back ? <Text numberOfLines={1} style={[TYPE.row, { color: t.accent, maxWidth: 110 }]}>{back}</Text> : null}
        </Press>
      ) : (
        <Logo />
      )}
      <View style={{ flex: 1, minWidth: 0 }} onLayout={(e) => setRoom(e.nativeEvent.layout.width)}>
        {title ? <T v={v} lines={1} role="header" style={fit ? { fontSize: fit, lineHeight: Math.round(fit * 1.2) } : undefined}>{title}</T> : null}
        {sub ? <T v="meta" tone="muted" lines={1}>{sub}</T> : null}
      </View>
      {right}
      {onSettings ? (
        <Press accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} style={k.avatarBtn}>
          <PersonAvatar name={name || 'P'} size={44} me />
        </Press>
      ) : null}
    </View>
  );
}

/** A solid list card (lists stay solid for reading, Erina). */
export function ListCard({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { t } = useSettings();
  return <View style={[k.list, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>;
}

/** A row inside a ListCard; `first` drops the hairline above it. */
export function Row({ children, onPress, first, label, style }: { children?: React.ReactNode; onPress?: () => void; first?: boolean; label?: string; style?: StyleProp<ViewStyle> }) {
  const { t } = useSettings();
  const st = [k.li, !first && { borderTopWidth: 1, borderTopColor: t.border }, style];
  return onPress ? (
    <Press soft accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={st}>{children}</Press>
  ) : (
    <View style={st}>{children}</View>
  );
}

export const KIND_LABEL = { one_time: 'One-time', installments: 'Installment', recurring: 'Recurring' } as const;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fShort = (s: string) => `${MON[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}`;
export const fLong = (s: string) => `${fShort(s)}, ${s.slice(0, 4)}`;
export const fMonth = (m: string) => `${MONTH[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const fMon = (m: string) => MON[Number(m.slice(5, 7)) - 1] ?? '';
export const fDay = (s: string) => `${WD[new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).getUTCDay()]}, ${fLong(s)}`;
export const timeLabel = (hm: string) => { const [h = 0, mi = 0] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** One debt in a list: who (or what, on a person's page), "₱x left", the next date or a pill, a thin bar. */
export function DebtRow({ v, onPress, first, inPerson }: { v: DebtView; onPress: () => void; first?: boolean; inPerson?: boolean }) {
  const { fmtIn } = useMoney();
  const rec = v.debt.kind === 'recurring';
  const settled = v.state === 'settled';
  const sub = settled ? (v.debt.settled_on ? `Settled ${fShort(v.debt.settled_on)}` : 'Settled') : v.next ? `Next ${fShort(v.next.date)}` : v.debt.kind === 'one_time' && !v.debt.due_on ? 'Pay when I can' : '';
  const main = inPerson ? v.debt.title || KIND_LABEL[v.debt.kind] : v.debt.person_name;
  const label = inPerson ? KIND_LABEL[v.debt.kind] : v.debt.title;
  const every = v.debt.recurring_every === 'weekly' ? 'every week' : v.debt.recurring_every === 'biweekly' ? 'every 2 weeks' : 'every month';
  const pill = v.state === 'overdue' ? 'overdue' : v.state === 'today' ? 'today' : settled ? 'settled' : '';
  const amount = rec ? (v.debt.recurring_amount_centavos ?? 0) : v.bal.remaining;
  return (
    <Row first={first} onPress={onPress} label={`${v.debt.person_name}${v.debt.title ? ', ' + v.debt.title : ''}`}>
      {inPerson ? null : <PersonAvatar name={v.debt.person_name} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="row" lines={1}>{main}</T>
        {label ? <T v="meta" tone="muted" lines={1}>{label}</T> : null}
        {rec || settled ? null : <Bar pct={v.bal.pct} style={{ marginTop: 8 }} />}
      </View>
      <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: '50%' }}>
        <Text numberOfLines={1} style={[TYPE.row]}>
          <T v="row">{fmtIn(amount, v.debt.currency)}</T>
          {rec || settled ? null : <T v="row" tone="muted" style={{ fontFamily: 'Manrope_500' }}> left</T>}
        </Text>
        <View style={{ marginTop: 4 }}>{pill ? <Pill state={pill} /> : <T v="meta" tone="muted" lines={1}>{rec ? every : sub}</T>}</View>
      </View>
    </Row>
  );
}

export function Empty({ text }: { text: string }) {
  return <T v="body" tone="muted" style={{ textAlign: 'center', paddingVertical: 28, paddingHorizontal: 16, fontSize: 15 }}>{text}</T>;
}

/** Plain text button ("Edit", "Clear"). */
export function LinkBtn({ label, onPress, tone = 'accent' }: { label: string; onPress: () => void; tone?: 'accent' | 'danger' }) {
  const { t } = useSettings();
  return (
    <Press accessibilityRole="button" onPress={onPress} style={k.link}>
      <Text style={[TYPE.row, { color: tone === 'danger' ? t.danger : t.accent }]}>{label}</Text>
    </Press>
  );
}

export const k = StyleSheet.create({
  pill: { height: 22, paddingHorizontal: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  pillText: { fontFamily: 'Manrope_600', fontSize: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hdr: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, paddingBottom: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, marginLeft: -8, paddingRight: 4 },
  avatarBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  list: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 16 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
});
