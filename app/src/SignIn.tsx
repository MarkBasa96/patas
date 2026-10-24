import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CODE_LENGTH, cleanCode, friendlyAuthError, isCompleteCode, isPlausibleEmail, maskEmail, normaliseEmail } from './auth';
import { setCodeAccepted } from './freshSignIn';
import { Wash } from './motion';
import { Lockup } from './Opening';
import { useSettings } from './settings';
import { supabase } from './supabase';
import { Turnstile, turnstileEnabled, type TurnstileHandle } from './Turnstile';

export function SignIn() {
  const { t, mode } = useSettings();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useRef<TurnstileHandle>(null);

  const needsCheck = turnstileEnabled && !token;
  const canSend = isPlausibleEmail(email) && !needsCheck && !busy;

  async function send() {
    if (!supabase || !canSend) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: normaliseEmail(email),
      options: { shouldCreateUser: true, captchaToken: token ?? undefined },
    });
    setBusy(false);
    check.current?.reset(); // a bot-check token works once; get a fresh one for "send a new code"
    if (e) {
      setError(friendlyAuthError(e.message, 'Could not send the code. Check your internet and try again.'));
      return;
    }
    setStep('code');
  }

  async function verify() {
    if (!supabase || !isCompleteCode(code) || busy) return;
    setBusy(true);
    setError(null);
    // Raised before the call: on success the session listener can mount the app before this await returns.
    setCodeAccepted(true);
    const { error: e } = await supabase.auth.verifyOtp({ email: normaliseEmail(email), token: code, type: 'email' });
    if (e) setCodeAccepted(false);
    setBusy(false);
    // On success the session listener in App.tsx swaps this screen for the app.
    if (e) setError(friendlyAuthError(e.message, 'Could not sign you in. Try again.'));
  }

  const field = [s.input, { backgroundColor: t.field, borderColor: t.border, color: t.text }];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={[s.page, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
      <Wash />
      <View style={{ alignItems: 'flex-start' }}><Lockup white={mode === 'dark'} width={150} /></View>
      <Text style={[s.h1, { color: t.text }]}>{step === 'email' ? 'Sign in or sign up' : 'Check your email'}</Text>

      {step === 'email' ? (
        <>
          <Text style={[s.body, { color: t.muted }]}>We email you a 6-digit code. No password to remember. New here? The same code makes your account.</Text>
          <Text style={[s.label, { color: t.text }]}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={t.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            maxLength={254}
            accessibilityLabel="Email"
            style={field}
          />
          <Turnstile ref={check} onToken={setToken} dark={mode === 'dark'} />
          <Button label="Send me a code" onPress={send} disabled={!canSend} busy={busy} />
        </>
      ) : (
        <>
          <Text style={[s.body, { color: t.muted }]}>
            We sent a {CODE_LENGTH}-digit code to <Text style={{ fontFamily: 'Manrope_600', color: t.text }}>{maskEmail(normaliseEmail(email))}</Text>. It works once and expires in 10 minutes.
          </Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(cleanCode(v))}
            placeholder="123456"
            placeholderTextColor={t.muted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={CODE_LENGTH + 4}
            accessibilityLabel={`${CODE_LENGTH}-digit code`}
            style={[...field, s.code]}
          />
          <Button label="Sign in" onPress={verify} disabled={!isCompleteCode(code) || busy} busy={busy} />
          <View style={s.links}>
            <Link label="Send a new code" onPress={() => { setStep('email'); setCode(''); setError(null); }} />
            <Link label="Use a different email" onPress={() => { setStep('email'); setCode(''); setEmail(''); setError(null); }} />
          </View>
        </>
      )}

      {error ? <Text accessibilityRole="alert" style={[s.error, { color: t.danger, backgroundColor: t.redBg }]}>{error}</Text> : null}
      {!supabase ? <Text style={[s.error, { color: t.danger, backgroundColor: t.redBg }]}>This build has no server settings (see .env.example).</Text> : null}
    </ScrollView>
  );

  function Button({ label, onPress, disabled, busy: b }: { label: string; onPress: () => void; disabled: boolean; busy: boolean }) {
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, { backgroundColor: t.accentFill, opacity: disabled ? 0.45 : 1 }]}>
        {b ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>{label}</Text>}
      </Pressable>
    );
  }

  function Link({ label, onPress }: { label: string; onPress: () => void }) {
    return (
      <Text accessibilityRole="button" onPress={onPress} style={{ fontFamily: 'Manrope_600', fontSize: 14, color: t.accent }}>
        {label}
      </Text>
    );
  }
}

const s = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 20, width: '100%', maxWidth: 520, alignSelf: 'center' },
  h1: { fontFamily: 'Manrope_700', fontSize: 28, letterSpacing: -0.4, marginTop: 24 },
  body: { fontFamily: 'Manrope_400', fontSize: 15, lineHeight: 22, marginTop: 8 },
  label: { fontFamily: 'Manrope_600', fontSize: 14, marginTop: 24, marginBottom: 6 },
  input: { fontFamily: 'Manrope_500', fontSize: 16, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 52 },
  code: { fontFamily: 'Manrope_700', fontSize: 26, letterSpacing: 6, textAlign: 'center', marginTop: 20 },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonText: { fontFamily: 'Manrope_700', fontSize: 16, color: '#FFFFFF' },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  error: { fontFamily: 'Manrope_500', fontSize: 14, lineHeight: 20, borderRadius: 12, padding: 12, marginTop: 16 },
});
