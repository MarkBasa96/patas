// Round 4 motion, sound and the one popup system (Erina's direction §6; the approved mockup's motion.js).
// Everything respects "reduce motion": numbers land at once and popups only fade (CSS in public/index.html).
// Sound and haptics have their own switches. Haptics only exist on Android; iPhone web apps cannot vibrate.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useBackHandler } from './backNav';
import { Icon } from './icons';
import { useSettings } from './settings';

const web = Platform.OS === 'web' && typeof window !== 'undefined';

// ---------------- preferences ----------------
let reduce = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduce = v)).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => (reduce = v));
export const reduceMotion = (): boolean => reduce;

const PREFS_KEY = 'patas.fx.v1';
export const prefs = { sound: true, haptic: true };
export const isAndroid = (): boolean => web && /Android/i.test(navigator.userAgent);
void AsyncStorage.getItem(PREFS_KEY)
  .then((raw) => {
    if (!raw) return;
    const v = JSON.parse(raw) as { sound?: unknown; haptic?: unknown };
    if (typeof v.sound === 'boolean') prefs.sound = v.sound;
    if (typeof v.haptic === 'boolean') prefs.haptic = v.haptic;
  })
  .catch(() => {});
export function setPrefs(p: Partial<typeof prefs>): void {
  Object.assign(prefs, p);
  void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
}

// ---------------- sound and haptics (made on the fly, no files, nothing sent anywhere) ----------------
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (!web) return null;
  try {
    const C = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = ctx ?? new C();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}
// Browsers start audio paused: the first tap anywhere wakes it, so the first chime is not silent.
if (web) {
  const wake = () => { audio(); window.removeEventListener('pointerdown', wake); };
  window.addEventListener('pointerdown', wake);
}

/** A soft two-note chime (E6 then A6) on saves, never on deletes. `force` plays it with Sounds off (the test button). */
export function chime(force = false): void {
  if (!prefs.sound && !force) return;
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + 0.01;
  for (const [f, at] of [[1318.5, 0], [1760, 0.085]] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = t0 + at;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.3);
  }
}

export function buzz(ms: number | number[] = 10): void {
  if (!prefs.haptic || !web) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* no vibration: fine */
  }
}

// ---------------- count-up ----------------
// The first time a key is seen it counts from zero (once per app open); after that it only moves when the value
// changes, old -> new. Screen readers get the final amount.
const lastShown = new Map<string, number>();
const easeOut = (k: number) => 1 - Math.pow(1 - k, 4);

export function useCountUp(value: number, key: string, delay = 0): number {
  const from = lastShown.has(key) ? (lastShown.get(key) as number) : 0;
  const animate = web && !reduce && from !== value;
  const [shown, setShown] = useState(from);
  useEffect(() => {
    const seen = lastShown.has(key);
    lastShown.set(key, value);
    if (!animate) return;
    const dur = seen ? 500 : 600;
    const t0 = performance.now() + (seen ? 0 : delay);
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      setShown(Math.round(from + (value - from) * easeOut(k)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return animate ? shown : value;
}

export function CountUp({ value, k, format, delay, style, numberOfLines = 1 }: { value: number; k: string; format: (n: number) => string; delay?: number; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const n = useCountUp(value, k, delay);
  return (
    <Text style={style} numberOfLines={numberOfLines} accessibilityLabel={format(value)}>
      {format(n)}
    </Text>
  );
}

/** Once per session per key: true the first time (charts grow, rings sweep), false after. */
const seenOnce = new Set<string>();
export function useFirstTime(key: string): boolean {
  const [first] = useState(() => !seenOnce.has(key) && !reduce);
  useEffect(() => { seenOnce.add(key); }, [key]);
  return first;
}

/** 0 -> 1 over `ms` (ease-out), once per mount. 1 at once under reduced motion. */
export function useGrow(run: boolean, ms = 600, delay = 0): number {
  const active = run && !reduce && web;
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t0 = performance.now() + delay;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      setP(easeOut(k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, ms, delay]);
  return active ? p : 1;
}

// ---------------- press ----------------
type PressProps = PressableProps & { style?: StyleProp<ViewStyle>; soft?: boolean; children?: React.ReactNode };
/** Anything tappable that sinks a little while held (CSS [data-press]; dims instead under reduced motion). */
export function Press({ soft, style, children, ...rest }: PressProps) {
  return (
    <Pressable {...rest} style={style} {...({ dataSet: { press: soft ? 'soft' : '1' } } as object)}>
      {children}
    </Pressable>
  );
}

// ---------------- the soft wash behind the top of every screen ----------------
export function Wash({ height = 440 }: { height?: number }) {
  const { t } = useSettings();
  if (!web) return null;
  return React.createElement('div', {
    'aria-hidden': true,
    style: {
      position: 'absolute', left: 0, right: 0, top: 0, height, pointerEvents: 'none',
      background: `radial-gradient(70% 60% at 12% 0%, ${t.washA}, transparent 70%), radial-gradient(55% 50% at 95% 55%, ${t.washB}, transparent 70%)`,
      maskImage: 'linear-gradient(to bottom, #000 55%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent)',
    },
  });
}

/** A glass card over the wash (no blur: the wash is soft, so blurring buys nothing and costs Android frames). */
export function Glass({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const { t } = useSettings();
  return <View style={[s.glass, { backgroundColor: t.glass, borderColor: t.glassBorder, shadowColor: t.shadow }, style]}>{children}</View>;
}

// ---------------- one popup system: centred popups and bottom sheets ----------------
type OverlayProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** A solid panel (confirm dialogs stay solid, Erina). */
  solid?: boolean;
  /** Content height for sheets: 'auto' (up to 92%) or 'tall' (92%). */
  height?: 'auto' | 'tall';
  /** Something on the right of the header (a text button). */
  right?: React.ReactNode;
  /** A button pinned under the content. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
};

function Header({ title, onClose, right, onBack }: { title?: string; onClose: () => void; right?: React.ReactNode; onBack?: () => void }) {
  const { t } = useSettings();
  return (
    <View style={s.head}>
      {onBack ? (
        <Press accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={s.iconBtn}>
          <Icon name="left" color={t.text} />
        </Press>
      ) : null}
      <Text accessibilityRole="header" numberOfLines={1} style={[s.headTitle, { color: t.text }]}>{title ?? ''}</Text>
      {right}
      <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[s.closeBtn, { backgroundColor: t.track }]}>
        <Icon name="x" size={18} color={t.text} />
      </Press>
    </View>
  );
}

/** A centred popup: scales and fades in over a blurred scrim; Back and a tap outside close it. */
export function Popup({ visible, onClose, title, solid, right, footer, children, onBack }: OverlayProps & { onBack?: () => void }) {
  const { t } = useSettings();
  useBackHandler(visible, onBack ?? onClose);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onBack ?? onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]} {...({ dataSet: { glass: 'scrim', anim: 'fade' } } as object)} />
      <View style={s.center} pointerEvents="box-none">
        <View accessibilityViewIsModal style={[s.popup, { backgroundColor: solid ? t.surface : t.panel, borderColor: t.panelBorder, shadowColor: t.shadow }]} {...({ dataSet: { glass: solid ? undefined : 'panel', anim: 'pop' } } as object)}>
          <Header title={title} onClose={onClose} right={right} onBack={onBack} />
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/** A bottom sheet: slides up; drag the header down (past a quarter, or a flick) to close it. */
export function Sheet({ visible, onClose, title, height = 'auto', right, footer, children, onBack }: OverlayProps & { onBack?: () => void }) {
  const { t } = useSettings();
  useBackHandler(visible, onBack ?? onClose);
  const [dy, setDy] = useState(0);
  const [tall, setTall] = useState(600);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 4,
        onPanResponderMove: (_e, g) => setDy(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > tall * 0.25 || (g.dy > 24 && g.vy > 0.5)) onClose();
          setDy(0);
        },
        onPanResponderTerminate: () => setDy(0),
      }),
    [onClose, tall],
  );
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onBack ?? onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]} {...({ dataSet: { glass: 'scrim', anim: 'fade' } } as object)} />
      <View style={s.bottom} pointerEvents="box-none">
        <View
          accessibilityViewIsModal
          onLayout={(e) => setTall(e.nativeEvent.layout.height)}
          style={[s.sheet, height === 'tall' && { height: '92%' }, { backgroundColor: t.panel, borderColor: t.panelBorder, shadowColor: t.shadow, transform: [{ translateY: dy }] }]}
          {...({ dataSet: { glass: 'panel', anim: 'sheet' } } as object)}
        >
          <View {...pan.panHandlers}>
            <View style={s.grabZone}><View style={[s.grab, { backgroundColor: t.border }]} /></View>
            <Header title={title} onClose={onClose} right={right} onBack={onBack} />
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/** A small confirm before a delete (Joe 2026-10-23: confirm only before deletes). Solid, Cancel first. */
export function ConfirmPop({ visible, title, body, action, onCancel, onConfirm, danger = true }: { visible: boolean; title: string; body: string; action: string; onCancel: () => void; onConfirm: () => void; danger?: boolean }) {
  const { t } = useSettings();
  const used = useRef(false);
  useEffect(() => { if (visible) used.current = false; }, [visible]);
  return (
    <Popup visible={visible} onClose={onCancel} title={title} solid>
      <Text style={[s.confirmBody, { color: t.muted }]}>{body}</Text>
      <View style={s.confirmRow}>
        <Press accessibilityRole="button" onPress={onCancel} style={[s.btn, { borderColor: t.border, borderWidth: 1, flex: 1 }]}>
          <Text style={[s.btnText, { color: t.text }]}>Cancel</Text>
        </Press>
        <Press
          accessibilityRole="button"
          onPress={() => { if (used.current) return; used.current = true; onConfirm(); }}
          style={[s.btn, { backgroundColor: danger ? '#C9372F' : t.accentFill, flex: 1 }]}
        >
          <Text style={[s.btnText, { color: '#FFFFFF' }]}>{action}</Text>
        </Press>
      </View>
    </Popup>
  );
}

// ---------------- toast ----------------
type ToastOpts = { quiet?: boolean; sound?: boolean };
const ToastCtx = createContext<(text: string, o?: ToastOpts) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

/** Saves show a toast: slides down with a drawn check, a chime and (Android) a light buzz. Quiet toasts are grey. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useSettings();
  const [toast, setToast] = useState<{ text: string; quiet: boolean; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, o: ToastOpts = {}) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, quiet: !!o.quiet, key: Date.now() });
    if (o.sound !== false && !o.quiet) chime();
    if (!o.quiet) buzz(10);
    timer.current = setTimeout(() => setToast(null), 1860);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={s.toastWrap}>
          <Pressable
            key={toast.key}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            onPress={() => setToast(null)}
            style={[s.toast, { backgroundColor: t.glassStrong, borderColor: t.panelBorder, shadowColor: t.shadow }]}
            {...({ dataSet: { glass: 'panel', anim: 'toast' } } as object)}
          >
            <View {...({ dataSet: { anim: 'check' } } as object)}>
              <Svg width={22} height={22} viewBox="0 0 22 22">
                <Circle cx={11} cy={11} r={11} fill={toast.quiet ? t.muted : t.ok} />
                <Path d="m6.5 11.4 3 3 6-6.6" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <Text numberOfLines={1} style={[s.toastText, { color: t.text }]}>{toast.text}</Text>
          </Pressable>
        </View>
      ) : null}
    </ToastCtx.Provider>
  );
}

// ---------------- theme reveal: the new look floods out as a circle from the tapped control ----------------
export function revealFrom(e: GestureResponderEvent | null, apply: () => void): void {
  const doc = web ? (document as Document & { startViewTransition?: (fn: () => void) => { ready: Promise<void> } }) : null;
  if (!doc?.startViewTransition || !e) return apply();
  const ne = e.nativeEvent as unknown as { pageX?: number; pageY?: number; clientX?: number; clientY?: number };
  const x = ne.clientX ?? ne.pageX ?? window.innerWidth / 2;
  const y = ne.clientY ?? ne.pageY ?? window.innerHeight / 2;
  // react-dom ships with the web build (react-native-web renders through it): flushSync makes the change land inside
  // the transition's snapshot.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { flushSync } = require('react-dom') as { flushSync: (fn: () => void) => void };
  const vt = doc.startViewTransition(() => flushSync(apply));
  if (reduce) return; // the browser's own short crossfade
  const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  vt.ready
    .then(() =>
      doc.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' } as KeyframeAnimationOptions,
      ),
    )
    .catch(() => {});
}

const s = StyleSheet.create({
  glass: { borderRadius: 20, borderWidth: 1, padding: 16, shadowOpacity: 1, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  bottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  popup: { width: '100%', maxWidth: 440, maxHeight: '86%', borderRadius: 24, borderWidth: 1, overflow: 'hidden', shadowOpacity: 1, shadowRadius: 48, shadowOffset: { width: 0, height: 24 } },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden', shadowOpacity: 1, shadowRadius: 48 },
  grabZone: { alignItems: 'center', paddingTop: 8, paddingBottom: 2 },
  grab: { width: 36, height: 5, borderRadius: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingLeft: 16, paddingRight: 8 },
  headTitle: { flex: 1, fontFamily: 'Manrope_700', fontSize: 18 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', margin: 4 },
  body: { paddingHorizontal: 16, paddingBottom: 18 },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  confirmBody: { fontFamily: 'Manrope_400', fontSize: 15, lineHeight: 22 },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnText: { fontFamily: 'Manrope_700', fontSize: 16 },
  toastWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 10, paddingHorizontal: 16, zIndex: 90 },
  toast: { height: 52, width: '100%', maxWidth: 528, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, shadowOpacity: 1, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  toastText: { fontFamily: 'Manrope_600', fontSize: 15, flexShrink: 1 },
});
