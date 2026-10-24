// Settings > Your data: back up to a file, restore from a file, export CSV (SPEC 9).
import React, { useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { base64ToBlob, blobToBase64, downloadFile, readText } from './dataIO';
import { debtsCsv, linesCsv, makeBackup, parseBackup, restorePlan, type Backup, type BackupQr, type RestoreMode } from './exportData';
import { formatLong, todayIso } from './plan';
import { decodeQr } from './qrDecode';
import { useQrs } from './qrs';
import { useSettings } from './settings';
import { useStore } from './store';
import { Banner, Button, Chip, Toggle } from './ui';

export function DataSection() {
  const { t } = useSettings();
  const { views, snapshot, restore, cash, currency } = useStore();
  const { qrs, picture, add } = useQrs();
  const [withQr, setWithQr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [pending, setPending] = useState<{ backup: Backup; skipped: number } | null>(null);
  const [mode, setMode] = useState<RestoreMode>('add');
  const input = useRef<HTMLInputElement | null>(null);
  const today = todayIso();

  async function backUp() {
    setBusy('backup');
    setNote(null);
    let missed = 0;
    const pics: BackupQr[] = [];
    if (withQr) {
      for (const q of qrs) {
        const p = await picture(q); // only a picture that passes the match check goes in
        if ('blob' in p) pics.push({ id: q.id, label: q.label, wallet: q.wallet, account_name: q.account_name, png: await blobToBase64(p.blob) });
        else missed++;
      }
    }
    const b = makeBackup(snapshot(), { currency, cash, madeAt: new Date().toISOString(), qrs: pics });
    downloadFile(`patas-backup-${today}.json`, JSON.stringify(b), 'application/json');
    setBusy(null);
    setNote({
      text: `Backup saved: ${b.debts.length} debts, ${b.lines.length} payments and other lines${withQr ? `, ${pics.length} QR codes` : ', no QR codes'}. The file holds your debts in plain text: keep it somewhere private.${missed ? ` ${missed} QR code${missed === 1 ? '' : 's'} could not be checked and ${missed === 1 ? 'was' : 'were'} left out.` : ''}`,
      warn: missed > 0,
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setNote(null);
    const r = parseBackup(await readText(file));
    if ('error' in r) return setNote({ text: r.error, warn: true });
    setMode('add');
    setPending(r);
  }

  async function doRestore() {
    if (!pending) return;
    const { backup, skipped } = pending;
    setPending(null);
    setBusy('restore');
    // QR pictures first: each one is read again and gets a fresh fingerprint for this account.
    const map = new Map<string, string>();
    const have = new Set(qrs.map((q) => q.id));
    let qrFailed = 0;
    for (const q of backup.qrs) {
      if (have.has(q.id)) continue;
      const blob = base64ToBlob(q.png, 'image/png');
      const got = await decodeQr(blob);
      const made = got ? await add({ label: q.label, wallet: q.wallet, account: q.account_name || q.label || 'Saved QR', person: null }, blob, got.text) : { error: 'unreadable' };
      if ('id' in made) map.set(q.id, made.id);
      else qrFailed++;
    }
    const plan = restorePlan(snapshot(), backup, mode, map, have);
    restore(plan, mode === 'replace' ? backup.cash : undefined);
    setBusy(null);
    const live = plan.debts.filter((d) => !d.deleted).length;
    const gone = plan.debts.filter((d) => d.deleted).length;
    setNote({
      text: `Restored ${live} debt${live === 1 ? '' : 's'}, ${plan.lines.filter((l) => !l.deleted).length} payments and other lines, ${map.size} QR code${map.size === 1 ? '' : 's'}.${gone ? ` ${gone} debt${gone === 1 ? '' : 's'} not in the backup ${gone === 1 ? 'was' : 'were'} deleted.` : ''}${skipped ? ` ${skipped} damaged row${skipped === 1 ? ' was' : 's were'} skipped.` : ''}${qrFailed ? ` ${qrFailed} QR code${qrFailed === 1 ? '' : 's'} could not be restored (offline, or the picture did not read).` : ''} Syncing to your account now.`,
      warn: skipped > 0 || qrFailed > 0,
    });
  }

  return (
    <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[s.h2, { color: t.text }]}>Your data</Text>
      <View style={[s.between, { marginBottom: 10 }]}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontFamily: 'Manrope_600', fontSize: 15, color: t.text }}>Include QR codes in backups</Text>
          <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, color: t.muted }}>{withQr ? 'On for the next backup. The file will hold the QR pictures.' : 'Off. QR pictures stay out unless you turn this on.'}</Text>
        </View>
        <Toggle value={withQr} onValueChange={setWithQr} label="Include QR codes in backups" />
      </View>
      <View style={{ gap: 10 }}>
        <Button label="Back up to a file" kind="outline" busy={busy === 'backup'} onPress={() => { void backUp(); }} />
        <Button label="Restore from a file" kind="outline" busy={busy === 'restore'} onPress={() => input.current?.click()} />
        <Button label="Export CSV" kind="outline" onPress={() => setCsvOpen(true)} />
      </View>
      {Platform.OS === 'web'
        ? React.createElement('input', {
            ref: input,
            type: 'file',
            accept: 'application/json,.json',
            'aria-label': 'Backup file',
            style: { display: 'none' },
            onChange: (e: { target: HTMLInputElement }) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            },
          })
        : null}
      {note ? <View style={{ marginTop: 12 }}><Banner tone={note.warn ? 'warn' : 'info'} text={note.text} /></View> : null}

      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <View style={s.scrim}>
          <View accessibilityRole="alert" style={[s.dialog, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={{ fontFamily: 'Manrope_700', fontSize: 18, color: t.text }}>Restore this backup?</Text>
            {pending ? (
              <Text style={{ fontFamily: 'Manrope_400', fontSize: 15, lineHeight: 21, color: t.muted, marginTop: 8 }}>
                {`Made ${pending.backup.made_at ? formatLong(pending.backup.made_at.slice(0, 10)) : 'on an unknown date'}: ${pending.backup.debts.length} debts, ${pending.backup.lines.length} payments and other lines, ${pending.backup.qrs.length} QR codes.`}
              </Text>
            ) : null}
            <View style={[s.row, { marginTop: 12 }]}>
              <Chip label="Add what's missing" on={mode === 'add'} onPress={() => setMode('add')} />
              <Chip label="Replace everything" on={mode === 'replace'} onPress={() => setMode('replace')} />
            </View>
            <Text style={{ fontFamily: 'Manrope_400', fontSize: 13, lineHeight: 19, color: t.muted, marginTop: 8 }}>
              {mode === 'add' ? 'Debts you already have stay as they are. Only what this account lacks is added.' : 'Your account becomes exactly the backup. Debts that are not in it are deleted. Make a backup first if you may want them again.'}
            </Text>
            <View style={{ gap: 10, marginTop: 16 }}>
              <Button label={mode === 'add' ? 'Add what is missing' : 'Replace everything'} kind={mode === 'replace' ? 'danger' : 'primary'} onPress={() => { void doRestore(); }} />
              <Button label="Cancel" kind="outline" onPress={() => setPending(null)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={csvOpen} transparent animationType="fade" onRequestClose={() => setCsvOpen(false)}>
        <View style={s.scrim}>
          <View style={[s.dialog, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={{ fontFamily: 'Manrope_700', fontSize: 18, color: t.text }}>Export CSV</Text>
            <Text style={{ fontFamily: 'Manrope_400', fontSize: 15, lineHeight: 21, color: t.muted, marginTop: 8 }}>Two files that open in Sheets or Excel. QR codes are never in them.</Text>
            <View style={{ gap: 10, marginTop: 16 }}>
              <Button label="Debts" onPress={() => downloadFile(`patas-debts-${today}.csv`, debtsCsv(views), 'text/csv')} />
              <Button label="Payments and other lines" onPress={() => downloadFile(`patas-payments-${today}.csv`, linesCsv(views), 'text/csv')} />
              <Button label="Done" kind="outline" onPress={() => setCsvOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  h2: { fontFamily: 'Manrope_700', fontSize: 17, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 20 },
});
