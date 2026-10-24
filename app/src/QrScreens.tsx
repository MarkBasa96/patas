// QR gallery screens: the gallery, Add / Edit / Replace, Show QR, and the save-or-share sheet.
// Rules: docs/SECURITY_DESIGN.md and Kenshin's save/share ruling (strings S1-S15 are his, word for word).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { personKey } from './insights';
import { Header } from './kit';
import { useToast } from './motion';
import { formatLong, todayIso } from './plan';
import { copyFileName, inFilter, matches, namesAgree, payeeName, qrTitle, qrWarning, randomTag, validateQrForm, WALLETS, walletLabel, type QrForm, type QrRow, type QrWarning } from './qr';
import { buildCopy, preparePicked } from './qrImage';
import { useQrs, type Picture } from './qrs';
import { useSettings } from './settings';
import { useStore } from './store';
import { Banner, Button, Chip, Confirm, Field, Input } from './ui';

// ---------- small web pieces ----------
function QrImg({ blob, size, label }: { blob: Blob; size: number; label: string }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]); // the picture never outlives the screen showing it
  return React.createElement('img', { src: url, alt: label, draggable: false, style: { width: size, height: size, objectFit: 'contain', imageRendering: 'pixelated', background: '#FFFFFF', display: 'block' } });
}

type Pic = { state: 'loading' } | Picture;
function usePicture(row: QrRow | undefined): Pic {
  const { picture } = useQrs();
  const key = row ? `${row.id}:${row.payload_sha256}` : '';
  const [got, setGot] = useState<{ key: string; pic: Picture } | null>(null);
  // Only a different QR (or a different fingerprint) means a new download; a list refresh does not.
  useEffect(() => {
    let alive = true;
    if (row) void picture(row).then((p) => alive && setGot({ key, pic: p }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on id + fingerprint on purpose
  }, [key, picture]);
  return got && got.key === key ? got.pic : { state: 'loading' };
}
/** "Now", fixed for the life of a screen (render must not read the clock). */
const useNow = () => useState(() => Date.now())[0];
const hasBlob = (p: Pic): p is Extract<Picture, { blob: Blob }> => 'blob' in p;

function Head({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, paddingHorizontal: 16, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
      <Header back="Back" onBack={onBack} title={title} right={right} />
    </View>
  );
}

function WalletTag({ wallet }: { wallet: string }) {
  const { t } = useSettings();
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: t.accentSoft }}>
      <Text style={{ fontFamily: 'Manrope_600', fontSize: 12, color: t.accent }}>{walletLabel(wallet)}</Text>
    </View>
  );
}

export function warningText(w: QrWarning): string | null {
  if (!w) return null;
  const on = formatLong(w.on);
  const head = w.kind === 'changed' ? `QR changed on ${on}.` : w.kind === 'added' ? `QR added on ${on}.` : `This debt's QR was set on ${on}.`;
  // S15: a copy of the replaced QR may still be in the gallery.
  return w.oldCopyOn ? `${head} You saved a copy of the old QR on ${formatLong(w.oldCopyOn)}. Delete it so you don't pay from it by mistake.` : `${head} Check the account name below before you pay.`;
}

const latest = (xs: (string | null | undefined)[]): string | null => xs.filter((x): x is string => !!x).sort().pop() ?? null;

// ---------- Gallery ----------
export function QrGallery({ onBack, onOpen, onAdd }: { onBack: () => void; onOpen: (id: string) => void; onAdd: () => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const { qrs, status } = useQrs();
  const { debtsUsingQr } = useStore();
  const [f, setF] = useState<'all' | 'gcash' | 'maya' | 'banks'>('all');
  const [q, setQ] = useState('');
  const list = qrs
    .map((r) => ({ r, title: qrTitle(r, [...new Set(debtsUsingQr(r.id).map((v) => v.debt.person_name))]) }))
    .filter(({ r, title }) => inFilter(r.wallet, f) && `${title} ${r.account_name} ${walletLabel(r.wallet)}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Head title="QR gallery" onBack={onBack} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 120 }]}>
        <Text style={{ fontFamily: 'Manrope_400', fontSize: 14, color: t.muted, marginBottom: 10 }}>Keep payment QR codes linked to the people you owe.</Text>
        {qrs.length > 3 ? <Input value={q} onChangeText={setQ} placeholder="Search name or payment method" label="Search QR codes" /> : null}
        <View style={[s.row, { marginVertical: 12 }]}>
          {(['all', 'gcash', 'maya', 'banks'] as const).map((k) => (
            <Chip key={k} label={k === 'all' ? 'All' : k === 'banks' ? 'Banks' : walletLabel(k)} on={f === k} onPress={() => setF(k)} />
          ))}
        </View>
        {status === 'offline' ? <Banner text="Offline. Showing the QR codes saved on this phone." /> : null}
        <View style={s.grid}>
          {list.map(({ r, title }) => (
            <QrCard key={r.id} row={r} title={title} onPress={() => onOpen(r.id)} />
          ))}
        </View>
        {!qrs.length ? (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, alignItems: 'center', paddingVertical: 28 }]}>
            <Text style={{ fontFamily: 'Manrope_700', fontSize: 17, color: t.text }}>No QR codes yet</Text>
            <Text style={{ fontFamily: 'Manrope_400', fontSize: 14, color: t.muted, marginTop: 4, textAlign: 'center' }}>Save a payment QR so paying someone is one tap.</Text>
          </View>
        ) : null}
        <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, color: t.muted, marginTop: 12 }}>QR pictures are private to you. They stay out of backups unless you choose to include them.</Text>
      </ScrollView>
      <View style={[s.save, { backgroundColor: t.bg, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label="+ Add QR" onPress={onAdd} />
      </View>
    </View>
  );
}

function QrCard({ row, title, onPress }: { row: QrRow; title: string; onPress: () => void }) {
  const { t } = useSettings();
  const pic = usePicture(row);
  const now = useNow();
  const warn = qrWarning(row, null, now);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${walletLabel(row.wallet)}`} onPress={onPress} style={[s.qcard, { backgroundColor: t.surface, borderColor: warn ? t.warn : t.border }]}>
      <View style={[s.qthumb, { backgroundColor: '#FFFFFF' }]}>
        {hasBlob(pic) ? <QrImg blob={pic.blob} size={112} label="Saved QR" /> : <Text style={{ fontFamily: 'Manrope_600', fontSize: 12, color: '#5B6270', textAlign: 'center' }}>{'state' in pic ? 'Loading…' : pic.problem === 'mismatch' ? 'Does not match' : 'Not on this phone yet'}</Text>}
      </View>
      <Text numberOfLines={2} style={{ fontFamily: 'Manrope_700', fontSize: 14, color: t.text, marginTop: 8 }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <WalletTag wallet={row.wallet} />
        {warn ? <Text style={{ fontFamily: 'Manrope_600', fontSize: 12, color: t.warn }}>{warn.kind === 'changed' ? 'Changed' : 'New'}</Text> : null}
      </View>
    </Pressable>
  );
}

// ---------- Add / Edit / Replace ----------
export function QrFormScreen({ editId, replaceId, person, onClose, onSaved }: { editId?: string; replaceId?: string; person?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const { qrs, add, update, remove } = useQrs();
  const { views, linkQr, moveQrLinks, debtsUsingQr } = useStore();
  const old = qrs.find((r) => r.id === (editId ?? replaceId));
  const linkedNow = old ? (debtsUsingQr(old.id)[0]?.debt.person_name ?? null) : null;
  // One QR per person (round 4): everyone you owe, one name each (same name in any case is one person).
  const people = useMemo(() => { const m = new Map<string, string>(); for (const v of views) { const k = personKey(v.debt.person_name); if (k && !m.has(k)) m.set(k, v.debt.person_name.trim()); } return [...m.values()].sort((a, b) => a.localeCompare(b)); }, [views]);
  const toast = useToast();
  const [form, setForm] = useState<QrForm>({ label: old?.label ?? '', wallet: old?.wallet ?? 'gcash', account: old?.account_name ?? '', person: old ? linkedNow : (person ?? null) });
  const [picked, setPicked] = useState<{ png: Blob; text: string } | null>(null);
  const [pickErr, setPickErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const editing = !!editId;
  const errors = validateQrForm(form, editing || !!picked);
  const name = picked ? payeeName(picked.text) : '';
  const otherQr = form.person ? views.find((v) => v.debt.qr_id && v.debt.qr_id !== old?.id && personKey(v.debt.person_name) === personKey(form.person ?? ''))?.debt.qr_id : undefined;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setPickErr(null);
    const r = await preparePicked(file);
    setReading(false);
    if ('error' in r) {
      setPicked(null);
      setPickErr(r.error);
      return;
    }
    setPicked(r);
    const n = payeeName(r.text);
    if (n && !form.account.trim()) setForm((x) => ({ ...x, account: n }));
  }

  async function save() {
    setConfirm(false);
    setBusy(true);
    setProblem(null);
    if (editing && old) {
      const err = await update(old.id, { label: form.label, account_name: form.account, wallet: form.wallet });
      if (err) return (setBusy(false), setProblem(err));
      linkQr(old.id, form.person);
      setBusy(false);
      toast('QR saved');
      return onSaved(old.id);
    }
    if (!picked) return setBusy(false);
    const r = await add(form, picked.png, picked.text, replaceId ? old : undefined);
    if ('error' in r) return (setBusy(false), setProblem(r.error));
    if (replaceId && old) {
      moveQrLinks(old.id, r.id); // every debt that paid the old QR now pays the new one (the server stamps the change)
      await remove(old.id);
    }
    linkQr(r.id, form.person);
    setBusy(false);
    toast('QR saved');
    onSaved(r.id);
  }

  const title = editing ? 'Edit QR' : replaceId ? 'Replace QR picture' : 'Add payment QR';
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Head title={title} onBack={onClose} />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 140 }]} keyboardShouldPersistTaps="handled">
        {!editing ? (
          <Field label="QR picture" error={tried ? (pickErr ?? errors.picture) : (pickErr ?? undefined)}>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose QR picture" onPress={() => input.current?.click()} style={[s.drop, { borderColor: t.border, backgroundColor: t.surface }]}>
              {picked ? (
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <QrImg blob={picked.png} size={180} label="QR you picked" />
                  <Text style={{ fontFamily: 'Manrope_600', fontSize: 13, color: t.accent }}>Choose a different picture</Text>
                </View>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'Manrope_700', fontSize: 16, color: t.text }}>{reading ? 'Reading the QR…' : 'Choose QR picture'}</Text>
                  <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, color: t.muted, marginTop: 4 }}>A screenshot from the payment app works best. JPG or PNG, up to 5 MB.</Text>
                </View>
              )}
            </Pressable>
            {Platform.OS === 'web'
              ? React.createElement('input', {
                  ref: input,
                  type: 'file',
                  accept: 'image/png,image/jpeg,image/webp',
                  'aria-label': 'QR picture file',
                  style: { display: 'none' },
                  onChange: (e: { target: HTMLInputElement }) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = '';
                  },
                })
              : null}
            {picked ? <Text style={{ fontFamily: 'Manrope_500', fontSize: 13, color: t.muted, marginTop: 8 }}>{name ? `Name in the QR: ${name}` : 'This QR has no name in it. Check it in your payment app before you pay.'}</Text> : null}
            {picked && name && form.account.trim() && !namesAgree(name, form.account) ? <View style={{ marginTop: 8 }}><Banner tone="warn" text={`The name in this QR (${name}) is not the account name below. Make sure this QR pays the right person.`} /></View> : null}
          </Field>
        ) : null}
        {replaceId ? <Banner tone="warn" text="Replacing a QR shows a warning for 14 days, so a swapped code is easy to spot." /> : null}

        <Field label="Who it pays">
          <View style={s.row}>
            <Chip label="Nobody (my own QR)" on={form.person === null} onPress={() => setForm((x) => ({ ...x, person: null }))} />
            {people.map((p) => (
              <Chip key={p} label={p} on={form.person === p} onPress={() => setForm((x) => ({ ...x, person: p }))} />
            ))}
          </View>
          {form.person ? <Text style={{ fontFamily: 'Manrope_500', fontSize: 13, color: otherQr ? t.peachInk : t.muted, marginTop: 6 }}>{otherQr ? `${form.person} already has a QR. Saving uses this one for all their debts instead, with a warning on them for 14 days.` : 'Every debt with this person uses it, new ones too.'}</Text> : null}
        </Field>
        <Field label="Payment method">
          <View accessibilityRole="radiogroup" accessibilityLabel="Payment method" style={s.row}>
            {WALLETS.map((w) => (
              <Chip key={w.key} label={w.label} on={form.wallet === w.key} onPress={() => setForm((x) => ({ ...x, wallet: w.key }))} />
            ))}
          </View>
        </Field>
        <Field label="Account name" error={tried ? errors.account : undefined}>
          <Input value={form.account} onChangeText={(v) => setForm((x) => ({ ...x, account: v }))} placeholder="Name on the account" label="Account name" maxLength={60} />
          <Text style={{ fontFamily: 'Manrope_400', fontSize: 12, color: t.muted, marginTop: 6 }}>Names only. Patas never stores account numbers as text.</Text>
        </Field>
        <Field label="Label" optional error={tried ? errors.label : undefined}>
          <Input value={form.label} onChangeText={(v) => setForm((x) => ({ ...x, label: v }))} placeholder="Personal GCash" label="Label" maxLength={40} />
        </Field>
        {problem ? <Banner tone="warn" text={problem} /> : null}
      </ScrollView>
      <View style={[s.save, { backgroundColor: t.bg, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label="Save QR" busy={busy || reading} onPress={() => { setTried(true); if (!Object.keys(errors).length) setConfirm(true); }} />
      </View>
      <Confirm
        visible={confirm}
        tone="primary"
        title={editing ? 'Save these changes?' : replaceId ? 'Replace this QR?' : 'Save this QR?'}
        body={`${form.person ? `Pays: ${form.person}` : 'Your own QR, linked to no debt'} · ${walletLabel(form.wallet)} · ${form.account.trim()}${form.label.trim() ? ` · ${form.label.trim()}` : ''}.${replaceId ? ' The old picture is removed and every debt that used it gets this one. A warning shows for 14 days.' : ''}`}
        confirmLabel="Save it"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { void save(); }}
      />
    </View>
  );
}

// ---------- Show QR ----------
const isIphone = (): boolean => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export { useNow };
export function QrShow({ id, userId, onBack, onEdit, onReplace, onRemoved, onLogPayment }: { id: string; userId: string; onBack: () => void; onEdit: () => void; onReplace: () => void; onRemoved: () => void; onLogPayment: (debtId: string) => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const { qrs, remove } = useQrs();
  const { debtsUsingQr } = useStore();
  const row = qrs.find((r) => r.id === id);
  const pic = usePicture(row);
  const [menu, setMenu] = useState(false);
  const [askRemove, setAskRemove] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();
  if (!row) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Head title="QR" onBack={onBack} />
        <View style={s.body}><Text style={{ fontFamily: 'Manrope_600', fontSize: 16, color: t.text }}>That QR is not here any more.</Text></View>
      </View>
    );
  }
  const linked = debtsUsingQr(id);
  const active = linked.filter((v) => v.debt.settled_on === null);
  const title = qrTitle(row, [...new Set(linked.map((v) => v.debt.person_name))]);
  const warn = qrWarning(row, latest(linked.map((v) => v.debt.qr_linked_at)), now);
  const wtext = warningText(warn);
  const payee = hasBlob(pic) ? payeeName(pic.text) : '';
  const canCopy = hasBlob(pic);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Head title={title} onBack={onBack} right={<Pressable accessibilityRole="button" accessibilityLabel="More" onPress={() => setMenu((m) => !m)} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}><Text style={{ fontFamily: 'Manrope_700', fontSize: 22, color: t.accent }}>⋯</Text></Pressable>} />
      {menu ? (
        <View style={[s.menu, { backgroundColor: t.surface, borderColor: t.border, top: insets.top + 58 }]}>
          <MenuItem label="Edit details" onPress={() => { setMenu(false); onEdit(); }} />
          <MenuItem label="Replace the QR picture" onPress={() => { setMenu(false); onReplace(); }} />
          <MenuItem label="Remove from gallery" danger onPress={() => { setMenu(false); setAskRemove(true); }} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: 130 }]}>
        <View style={{ alignItems: 'center', marginBottom: 10 }}><WalletTag wallet={row.wallet} /></View>
        {notice ? <Banner text={notice} /> : null}
        {/* Most serious first (Erina, 2026-10-21): the words are Kenshin's and stay as they are; only the order moved. */}
        {'problem' in pic && pic.problem === 'mismatch' ? <Banner tone="warn" text="This QR does not match what you saved. Saving a copy is turned off. Don't pay with it: replace it from the ⋯ menu." /> : null}
        {payee && !namesAgree(payee, row.account_name) ? <Banner tone="warn" text={`The name in this QR (${payee}) is not the saved account name. Check it before you pay.`} /> : null}
        {wtext ? <Banner tone="warn" text={wtext} /> : null}
        {'problem' in pic && pic.problem !== 'mismatch' ? <Banner text="Open this QR once while online to see it here offline." /> : null}
        <View style={[s.big, { backgroundColor: '#FFFFFF', borderColor: t.border }]}>
          {hasBlob(pic) ? <QrImg blob={pic.blob} size={260} label="Your payment QR code" /> : <View style={{ width: 260, height: 260, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: 'Manrope_600', fontSize: 14, color: '#5B6270' }}>{'state' in pic ? 'Loading QR…' : 'QR hidden'}</Text></View>}
        </View>
        <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={{ fontFamily: 'Manrope_500', fontSize: 13, color: t.muted }}>Account name</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <Text style={{ flex: 1, fontFamily: 'Manrope_700', fontSize: 18, color: t.text }}>{row.account_name}</Text>
            <Pressable accessibilityRole="button" onPress={() => { void navigator.clipboard?.writeText(row.account_name).then(() => setNotice('Name copied.')).catch(() => undefined); }} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontFamily: 'Manrope_600', fontSize: 14, color: t.accent }}>Copy name</Text>
            </Pressable>
          </View>
          {hasBlob(pic) ? <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, color: t.muted, marginTop: 8 }}>{payee ? `Name in the QR: ${payee}` : 'This QR has no name in it. Check it in your payment app before you pay.'}</Text> : null}
          {row.label ? <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, color: t.muted, marginTop: 4 }}>Label: {row.label}</Text> : null}
          <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, color: t.muted, marginTop: 4 }}>QR set on {formatLong(row.added_at.slice(0, 10))}</Text>
        </View>
        <Button label="Save or share" kind="outline" disabled={!canCopy} onPress={() => setSheet(true)} />
        {row.last_copy_saved_at ? <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, color: t.muted, textAlign: 'center', marginTop: 8 }}>You saved a copy on {formatLong(row.last_copy_saved_at.slice(0, 10))}. Delete it after you pay.</Text> : null}
        <View style={{ marginTop: 12 }}><Banner text="Open your payment app and upload this image. Wallets read QR codes from your gallery." /></View>
        {active.length > 1 ? (
          <View style={{ marginTop: 6 }}>
            <Text style={{ fontFamily: 'Manrope_600', fontSize: 14, color: t.text, marginBottom: 8 }}>After paying, log it on:</Text>
            <View style={s.row}>{active.map((v) => <Chip key={v.debt.id} label={v.debt.title || v.debt.person_name} on={false} onPress={() => onLogPayment(v.debt.id)} />)}</View>
          </View>
        ) : null}
      </ScrollView>
      {active.length === 1 && active[0] ? (
        <View style={[s.save, { backgroundColor: t.bg, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, color: t.muted, textAlign: 'center', marginBottom: 8 }}>After paying, log your payment in Patas.</Text>
          <Button label="Log payment" onPress={() => onLogPayment(active[0]!.debt.id)} />
        </View>
      ) : null}
      {sheet && hasBlob(pic) ? <CopySheet row={row} userId={userId} stored={pic.blob} text={pic.text} warn={wtext} onClose={() => setSheet(false)} onDone={(m) => { setSheet(false); setNotice(m); }} /> : null}
      <Confirm
        visible={askRemove}
        title="Remove this QR?"
        body={`${title} · ${walletLabel(row.wallet)} is removed from Patas. Copies you saved or shared elsewhere stay where they are.`}
        confirmLabel="Remove"
        onCancel={() => setAskRemove(false)}
        onConfirm={() => { setAskRemove(false); void remove(id).then((err) => (err ? setNotice(err) : onRemoved())); }}
      />
    </View>
  );

  function MenuItem({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
        <Text style={{ fontFamily: 'Manrope_600', fontSize: 15, color: danger ? t.danger : t.text }}>{label}</Text>
      </Pressable>
    );
  }
}

// ---------- Save or share (Kenshin's sheet, S3-S12) ----------
type Ready = { file: File; url: string };
function CopySheet({ row, userId, stored, text, warn, onClose, onDone }: { row: QrRow; userId: string; stored: Blob; text: string; warn: string | null; onClose: () => void; onDone: (msg: string) => void }) {
  const { t } = useSettings();
  const { copySaved } = useQrs();
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iphone = isIphone();

  // The copy is built while the sheet opens, so Share needs no waiting after the tap (Safari drops the tap otherwise).
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void (async () => {
      const today = todayIso();
      const copy = await buildCopy(stored, today);
      const same = copy && copy.text === text && (await matches(userId, row, copy.text));
      if (!alive) return;
      if (!copy || !same) return setError('Couldn’t make a safe copy of this QR. Nothing was saved.'); // S9
      made = URL.createObjectURL(copy.blob);
      setReady({ file: new File([copy.blob], copyFileName(today, randomTag()), { type: 'image/png' }), url: made });
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made); // the prepared copy is dropped with the sheet
    };
  }, [stored, text, row, userId]);

  const canShare = !!ready && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [ready.file] });
  const canSave = typeof document !== 'undefined' && 'download' in document.createElement('a');

  function save() {
    if (!ready) return;
    const a = document.createElement('a');
    const u = URL.createObjectURL(ready.file);
    a.href = u;
    a.download = ready.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000); // revoking at once can cancel the download
    void copySaved(row.id);
    onDone('Saved to Downloads. Delete it after you pay.'); // S5
  }
  function share() {
    if (!ready) return;
    // Files only: no title, text or url, so no label or name rides along (ruling 3.4).
    navigator
      .share({ files: [ready.file] })
      .then(() => {
        void copySaved(row.id);
        onDone("Copy shared. Patas can't delete it for you."); // S6
      })
      .catch((e: { name?: string }) => {
        if (e?.name === 'AbortError') return; // S7: a normal cancel, the sheet stays open
        setError(`Couldn't open sharing. Try again.${iphone ? '' : ' Or use Save to phone.'}`); // S8
      });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.scrim}>
        <View accessibilityRole="alert" style={[s.dialog, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={{ fontFamily: 'Manrope_700', fontSize: 18, color: t.text }}>Save a copy of this QR?</Text>
          <Text style={{ fontFamily: 'Manrope_400', fontSize: 15, lineHeight: 21, color: t.muted, marginTop: 8 }}>
            {"This copy leaves Patas: your MPIN won't lock it, signing out won't delete it, and your photo backup may upload it."}
          </Text>
          <View style={{ alignItems: 'center', marginVertical: 12 }}>
            {ready ? React.createElement('img', { src: ready.url, alt: 'The copy that will be saved', style: { width: 150, height: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 } }) : !error ? <Text style={{ fontFamily: 'Manrope_500', fontSize: 14, color: t.muted }}>Preparing copy…</Text> : null}
          </View>
          {warn ? <Banner tone="warn" text={warn} /> : null}
          {error ? <Banner tone="warn" text={error} /> : null}
          <View style={{ gap: 10, marginTop: 6 }}>
            {!iphone && canSave ? <Button label="Save to phone" disabled={!ready} onPress={save} /> : null}
            {canShare ? <Button label="Share…" kind={iphone ? 'primary' : 'outline'} disabled={!ready} onPress={share} /> : null}
            {iphone && canShare ? <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, color: t.muted, textAlign: 'center' }}>Choose Save Image to put it in Photos.</Text> : null}
            {(iphone && !canShare && ready) || (!canSave && !canShare) ? <Banner text="This browser can't save the QR. You can take a screenshot instead." /> : null}
            <Button label="Cancel" kind="outline" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  title: { flex: 1, textAlign: 'center', fontFamily: 'Manrope_700', fontSize: 18 },
  body: { paddingHorizontal: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  qcard: { width: '47%', flexGrow: 1, minWidth: 136, borderRadius: 16, borderWidth: 1, padding: 10 },
  qthumb: { height: 120, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  big: { alignSelf: 'center', borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 12 },
  drop: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, padding: 18, alignItems: 'center', justifyContent: 'center', minHeight: 140 },
  save: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  menu: { position: 'absolute', right: 16, zIndex: 20, borderWidth: 1, borderRadius: 14, minWidth: 220, overflow: 'hidden' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 20 },
});
