import React from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { useSettings } from './settings';

export function Button({ label, onPress, disabled, busy, kind = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; kind?: 'primary' | 'outline' | 'danger' }) {
  const { t } = useSettings();
  // Solid red with white text in both modes: the pale dark-mode danger colour reads as disabled (seen in Gastos).
  const bg = kind === 'primary' ? t.accentFill : kind === 'danger' ? '#C9372F' : 'transparent';
  const fg = kind === 'outline' ? t.accent : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[s.button, { backgroundColor: bg, borderColor: kind === 'outline' ? t.accent : 'transparent', borderWidth: kind === 'outline' ? 1.5 : 0, opacity: disabled ? 0.45 : 1 }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, children, optional }: { label: string; error?: string; children: React.ReactNode; optional?: boolean }) {
  const { t } = useSettings();
  return (
    <View style={s.field}>
      <Text style={[s.label, { color: t.text }]}>
        {label}
        {optional ? <Text style={{ color: t.muted, fontFamily: 'Inter_400Regular' }}> (optional)</Text> : null}
      </Text>
      {children}
      {error ? <Text accessibilityRole="alert" style={[s.err, { color: t.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function Input({ value, onChangeText, placeholder, keyboardType, maxLength, multiline, label, prefix }: { value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: KeyboardTypeOptions; maxLength?: number; multiline?: boolean; label: string; prefix?: string }) {
  const { t } = useSettings();
  return (
    <View style={[s.inputWrap, { backgroundColor: t.field, borderColor: t.border }]}>
      {prefix ? <Text style={[s.prefix, { color: t.muted }]}>{prefix}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        accessibilityLabel={label}
        autoCorrect={false}
        style={[s.input, { color: t.text }, multiline && { minHeight: 76, textAlignVertical: 'top', paddingTop: 12 }]}
      />
    </View>
  );
}

/** A real date picker on the web; typed YYYY-MM-DD elsewhere (the phone app comes later). */
export function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useSettings();
  if (Platform.OS === 'web') {
    return (
      <View style={[s.inputWrap, { backgroundColor: t.field, borderColor: t.border }]}>
        {React.createElement('input', {
          type: 'date',
          value,
          'aria-label': label,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
          style: { flex: 1, minHeight: 50, border: 0, background: 'transparent', color: t.text, fontFamily: 'Inter_500Medium', fontSize: 16, padding: '0 12px', colorScheme: 'inherit' },
        })}
      </View>
    );
  }
  return <Input value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" label={label} maxLength={10} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const { t } = useSettings();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.seg, { backgroundColor: t.field, borderColor: t.border }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.key)} style={[s.segItem, on && { backgroundColor: t.accentFill }]}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: on ? '#FFFFFF' : t.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The usual switch, but the tap area is 52x44 (the bare switch is 40x20 and cannot be enlarged by style). */
export function Toggle({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  const { t } = useSettings();
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} aria-checked={value} onPress={() => onValueChange(!value)} style={s.toggle}>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" aria-hidden>
        {/* White knob in both states: react-native-web's default "on" knob is teal (#009688), off-brand (Erina). */}
        <Switch value={value} trackColor={{ true: t.accentFill, false: t.border }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} />
      </View>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { t } = useSettings();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[s.chip, { borderColor: on ? t.accentFill : t.border, backgroundColor: on ? t.accentFill : t.surface }]}>
      <Text numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: on ? '#FFFFFF' : t.text }}>{label}</Text>
    </Pressable>
  );
}

export function Banner({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' }) {
  const { t } = useSettings();
  return (
    <View accessibilityRole="alert" style={[s.banner, { backgroundColor: tone === 'warn' ? t.peachBg : t.accentSoft }]}>
      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, color: tone === 'warn' ? t.peachInk : t.accent }}>{text}</Text>
    </View>
  );
}

/** Our own confirm box: the browser's Alert does nothing on the web. */
export function Confirm({ visible, title, body, confirmLabel, onConfirm, onCancel, tone = 'danger', extraLabel, onExtra }: { visible: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; tone?: 'danger' | 'primary'; extraLabel?: string; onExtra?: () => void }) {
  const { t } = useSettings();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.scrim}>
        <View accessibilityRole="alert" style={[s.dialog, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: t.text }}>{title}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21, color: t.muted, marginTop: 8 }}>{body}</Text>
          <View style={{ gap: 10, marginTop: 18 }}>
            <Button label={confirmLabel} kind={tone === 'danger' ? 'danger' : 'primary'} onPress={onConfirm} />
            {extraLabel && onExtra ? <Button label={extraLabel} kind="outline" onPress={onExtra} /> : null}
            <Button label="Cancel" kind="outline" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  field: { marginBottom: 14 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 6 },
  err: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, minHeight: 52 },
  prefix: { fontFamily: 'Inter_700Bold', fontSize: 16, paddingLeft: 14 },
  input: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 16, paddingHorizontal: 14, minHeight: 50 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4, gap: 4, marginBottom: 14 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toggle: { minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // 44px tall to tap (hitSlop does nothing on the web build); maxWidth keeps a 40-character name inside the screen.
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 44, maxWidth: '100%', alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 20 },
});

/** Biggest font size (up to `base`) at which a money string such as "₱1,234,567.89" still fits one line in `budget` px. */
export function fitFontSize(text: string, base: number, budget: number, min = 13): number {
  let em = 0; // rough width of the text in font sizes: digits 0.62, comma/point 0.3, the peso sign and anything else 0.7
  for (const c of text) em += /\d/.test(c) ? 0.62 : c === ',' || c === '.' ? 0.3 : 0.7;
  return Math.max(min, Math.min(base, Math.floor(budget / em)));
}

export const initials = (name: string): string => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (((w[0] ?? '?')[0] ?? '?') + (w.length > 1 ? (w[w.length - 1] ?? '')[0] ?? '' : '')).toUpperCase();
};

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const { t } = useSettings();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: size * 0.32, color: t.accent }}>{initials(name)}</Text>
    </View>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const { t } = useSettings();
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ height: 8, borderRadius: 4, backgroundColor: t.track, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 8, backgroundColor: t.accentFill }} />
    </View>
  );
}
