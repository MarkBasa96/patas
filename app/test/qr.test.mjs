// Phase 6e checks: payee name, checksum, fingerprint recipe, 14-day warning, the saved copy's name,
// caption and layout, crop box, form rules. Fake data only (no real QR payloads).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { copyCaption, copyFileName, copyLayout, crc16, crcOk, cropBox, emvFields, inFilter, matches, namesAgree, payeeName, qrFingerprint, qrTitle, qrWarning, randomTag, validateQrForm } from '../src/qr.ts';

const tlv = (tag, v) => `${tag}${String(v.length).padStart(2, '0')}${v}`;
const fake = (name) => {
  const body = tlv('00', '01') + tlv('01', '11') + tlv('27', tlv('00', 'com.example.fake') + tlv('01', '0000')) + tlv('53', '608') + tlv('58', 'PH') + tlv('59', name) + tlv('60', 'Test City') + '6304';
  return body + crc16(body);
};

test('crc16 matches the standard check value (CRC-16/CCITT-FALSE of "123456789" is 29B1)', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('payee name is read from tag 59; a broken or foreign payload gives none', () => {
  const p = fake('TEST LENDER');
  assert.equal(emvFields(p)?.get('58'), 'PH');
  assert.equal(payeeName(p), 'TEST LENDER');
  assert.equal(crcOk(p), true);
  assert.equal(crcOk(p.slice(0, -1) + (p.endsWith('0') ? '1' : '0')), false, 'one changed checksum digit is caught');
  assert.equal(payeeName('https://example.com/pay'), '');
  assert.equal(payeeName(p.slice(0, 20)), '', 'truncated payload');
  const bidi = String.fromCharCode(0x202e);
  assert.equal(payeeName(fake(`EVIL${bidi}NAME`)), '', 'a name with a direction-override character is not shown');
});

test('fingerprint is sha256(user:id:text) in lowercase hex, as the server stores it', async () => {
  const want = createHash('sha256').update('u1:q1:hello').digest('hex');
  assert.equal(await qrFingerprint('u1', 'q1', 'hello'), want);
  assert.equal(await matches('u1', { id: 'q1', payload_sha256: want }, 'hello'), true);
  assert.equal(await matches('u1', { id: 'q1', payload_sha256: want }, 'hellO'), false, 'one character off is a mismatch');
  assert.equal(await matches('u2', { id: 'q1', payload_sha256: want }, 'hello'), false, 'another user id is a mismatch');
  assert.equal(await matches('u1', { id: 'q2', payload_sha256: want }, 'hello'), false, 'another QR id is a mismatch');
  assert.equal(await matches('u1', { id: 'q1', payload_sha256: want }, null), false, 'no decode is a mismatch');
});

test('14-day warning: changed, added, relinked, or nothing', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const daysAgo = (n) => new Date(now - n * 86_400_000).toISOString();
  assert.deepEqual(qrWarning({ added_at: daysAgo(3), replaces_id: 'old', old_copy_saved_at: '2026-10-01T09:00:00Z' }, null, now), { kind: 'changed', on: daysAgo(3).slice(0, 10), oldCopyOn: '2026-10-01' });
  assert.equal(qrWarning({ added_at: daysAgo(3), replaces_id: null, old_copy_saved_at: null }, null, now)?.kind, 'added');
  assert.equal(qrWarning({ added_at: daysAgo(13.9), replaces_id: null, old_copy_saved_at: null }, null, now)?.kind, 'added');
  assert.equal(qrWarning({ added_at: daysAgo(14.1), replaces_id: null, old_copy_saved_at: null }, null, now), null, 'past 14 days the warning goes');
  assert.equal(qrWarning({ added_at: daysAgo(40), replaces_id: null, old_copy_saved_at: null }, daysAgo(2), now)?.kind, 'relinked', 'a debt pointed at an old QR still warns');
  assert.equal(qrWarning({ added_at: daysAgo(40), replaces_id: null, old_copy_saved_at: null }, daysAgo(20), now), null);
  assert.equal(qrWarning({ added_at: 'garbage', replaces_id: null, old_copy_saved_at: null }, null, now), null);
});

test('copy file name and caption carry no names, only the date', () => {
  assert.equal(copyFileName('2026-10-02', 'k7m2'), 'qr-2026-10-02-k7m2.png');
  assert.throws(() => copyFileName('2026-10-02', 'Ana!'));
  assert.throws(() => copyFileName('02/10/2026', 'k7m2'));
  assert.match(randomTag(), /^[a-z0-9]{4}$/);
  assert.equal(copyCaption('2026-10-02'), `Copy from Patas ${String.fromCharCode(0xb7)} 2 Oct 2026`);
});

test('copy layout: whole-number scale, margin at least 12% and 32px, caption below', () => {
  const a = copyLayout(300, 300);
  assert.equal(a.scale, 2);
  assert.equal(a.margin, 72);
  assert.equal(a.width, 600 + 144);
  assert.equal(a.height, 600 + 144 + a.caption);
  const b = copyLayout(1000, 1000);
  assert.equal(b.scale, 1, 'never scaled down by a fraction');
  const c = copyLayout(100, 100);
  assert.equal(c.scale, 7);
  assert.ok(Number.isInteger(c.scale) && c.margin >= 32);
});

test('crop box: the QR plus a 15% quiet zone, clamped to the picture', () => {
  assert.deepEqual(cropBox([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }], 1000, 1000), { x: 70, y: 70, w: 260, h: 260 });
  assert.deepEqual(cropBox([{ x: 5, y: 5 }, { x: 205, y: 5 }, { x: 205, y: 205 }, { x: 5, y: 205 }], 220, 220), { x: 0, y: 0, w: 220, h: 220 });
});

test('names agree: exact words, masked words and initials; a stranger does not', () => {
  assert.equal(namesAgree('TEST LENDER', 'Test Lender'), true);
  assert.equal(namesAgree('TE** LE**** C.', 'Test Lender'), true, 'masked wallet name');
  assert.equal(namesAgree('LENDER T.', 'Test Lender'), true, 'surname first with an initial');
  assert.equal(namesAgree('OTHER PAYEE', 'Test Lender'), false, 'a different person is flagged');
  assert.equal(namesAgree('OT*** PA***', 'Test Lender'), false, 'a masked different person is flagged');
  assert.equal(namesAgree('TOM LEE', 'Test Lender'), false, 'a stranger with the same initials is flagged');
  assert.equal(namesAgree('', 'Test Lender'), true, 'no name in the QR: nothing to say');
});

test('form rules, titles and filters', () => {
  assert.deepEqual(validateQrForm({ label: '', wallet: 'gcash', account: 'Test Payee', person: null }, true), {});
  assert.ok(validateQrForm({ label: '', wallet: 'gcash', account: ' ', person: null }, true).account);
  assert.ok(validateQrForm({ label: '', wallet: 'gcash', account: 'Test', person: null }, false).picture);
  assert.ok(validateQrForm({ label: 'x'.repeat(41), wallet: 'gcash', account: 'Test', person: null }, true).label);
  assert.equal(qrTitle({ label: 'Mine', account_name: 'Me' }, []), 'Mine');
  assert.equal(qrTitle({ label: 'Mine', account_name: 'Me' }, ['Test Lender']), 'Test Lender');
  assert.equal(inFilter('gotyme', 'banks'), true);
  assert.equal(inFilter('gcash', 'banks'), false);
  assert.equal(inFilter('maya', 'all'), true);
});
