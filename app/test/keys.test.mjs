// Kenshin round 4 M-1: every per-user key on the phone is wiped on sign-out and account deletion.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { localKey, photoRowsKey, qrRowsKey, userKeys } from '../src/keys.ts';

const SRC = new URL('../src/', import.meta.url);

test('the wipe list holds the debts copy, the QR rows and the photo rows', () => {
  assert.deepEqual(userKeys('u1'), ['patas.v1.u1', 'patas.qr.v1.u1', 'patas.photos.v1.u1']);
  assert.deepEqual(userKeys('u1'), [localKey('u1'), qrRowsKey('u1'), photoRowsKey('u1')]);
});

test('no other file makes its own per-user storage key (it would miss the wipe)', () => {
  const bad = [];
  for (const f of readdirSync(SRC)) {
    if (!/\.tsx?$/.test(f) || f === 'keys.ts') continue;
    const s = readFileSync(new URL(f, SRC), 'utf8');
    // a "patas." key built from a user id: `patas.something.${uid}` / `${userId}`
    if (/`patas\.[^`]*\$\{(uid|userId)[^`]*`/.test(s)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test('clearLocal wipes the whole list and sign-out drops the QR and photo rows', () => {
  const cloud = readFileSync(new URL('cloud.ts', SRC), 'utf8');
  assert.match(cloud, /multiRemove\(userKeys\(uid\)\)/);
  const session = readFileSync(new URL('session.ts', SRC), 'utf8');
  assert.match(session, /multiRemove\(\[qrRowsKey\(uid\), photoRowsKey\(uid\)\]\)/);
});
