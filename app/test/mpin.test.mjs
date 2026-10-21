// Phase 6f/6h: the MPIN gate decisions (F24). The server side is proven in supabase/test/run-6f.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AWAY_MS, STALE_MS, gate, keepVerifier, relock, weakPin, wrongText } from '../src/mpinLogic.ts';

const on = { enabled: true, epoch: 'e1', locked: false, tries_left: 5, can_reset: false };
const NOW = 1_800_000_000_000;
const fresh = { epoch: 'e1', lockedOut: false, checkedAt: NOW - 1000 };

test('weak PINs match the database rule', () => {
  for (const w of ['1234', '4321', '0000', '7777', '9012', '2109', '2580', '1212', '12a4', '483', '48311']) assert.equal(weakPin(w), true, w);
  for (const ok of ['4831', '5917', '6408', '1357']) assert.equal(weakPin(ok), false, ok);
});

test('online: the server decides', () => {
  assert.equal(gate({ ...on, enabled: false }, { verifier: fresh, knownEnabled: true }, NOW, false), 'open', 'turned off elsewhere');
  assert.equal(gate(on, { verifier: null, knownEnabled: false }, NOW, false), 'ask');
  assert.equal(gate(on, { verifier: null, knownEnabled: false }, NOW, true), 'open', 'just signed in with an email code');
  assert.equal(gate({ ...on, locked: true, can_reset: true }, { verifier: null, knownEnabled: true }, NOW, true), 'reset', 'locked, code accepted in this run, server agrees');
  assert.equal(gate({ ...on, locked: true }, { verifier: fresh, knownEnabled: true }, NOW, false), 'signout', 'locked, no fresh code');
});

test('audit H-1, L-1, L-2: no clock in the rule, a lock here stays a lock, "forgot" leads to a new MPIN', () => {
  // H-1: the skip comes only from the in-memory "code accepted" flag, and never offline.
  assert.equal(gate('network', { verifier: fresh, knownEnabled: true }, NOW, true), 'ask', 'offline: a code flag never skips the lock');
  assert.equal(gate('network', { verifier: null, knownEnabled: true }, NOW, true), 'ask-online');
  assert.equal(gate(on, { verifier: fresh, knownEnabled: true }, NOW - 4 * 86_400_000, false), 'ask', 'a phone clock moved back changes nothing');
  // L-1: offline lockout is not undone by going online.
  assert.equal(gate(on, { verifier: { ...fresh, lockedOut: true }, knownEnabled: true }, NOW, false), 'signout');
  assert.equal(gate({ ...on, can_reset: true }, { verifier: { ...fresh, lockedOut: true }, knownEnabled: true }, NOW, true), 'reset', 'a fresh code may set a new one');
  assert.equal(gate({ ...on, locked: true, can_reset: true }, { verifier: null, knownEnabled: true }, NOW, false), 'signout', 'server allows a reset, but no code in this app run');
  // L-2: "Forgot MPIN?" then a code: set a new one, not just walk in.
  assert.equal(gate(on, { verifier: null, knownEnabled: true }, NOW, true, true), 'reset');
  assert.equal(gate({ ...on, enabled: false }, { verifier: null, knownEnabled: false }, NOW, true, true), 'open', 'no MPIN: nothing to reset');
});

test('offline: only a fresh, unlocked copy on this phone can unlock', () => {
  assert.equal(gate('network', { verifier: fresh, knownEnabled: true }, NOW, false), 'ask');
  assert.equal(gate('network', { verifier: { ...fresh, checkedAt: NOW - STALE_MS - 1 }, knownEnabled: true }, NOW, false), 'ask-online', 'stale after 30 days');
  assert.equal(gate('network', { verifier: { ...fresh, lockedOut: true }, knownEnabled: true }, NOW, true), 'signout', 'locked stays locked offline, even with a code');
  assert.equal(gate('network', { verifier: null, knownEnabled: true }, NOW, false), 'ask-online', 'MPIN known to exist, no copy here');
  assert.equal(gate('network', { verifier: null, knownEnabled: false }, NOW, false), 'open', 'no MPIN known');
});

test('the phone copy is dropped when the server moved on', () => {
  assert.equal(keepVerifier(on, 'e1'), true);
  assert.equal(keepVerifier(on, 'e0'), false, 'changed on another phone');
  assert.equal(keepVerifier({ ...on, enabled: false, epoch: 'e1' }, 'e1'), false, 'turned off');
  assert.equal(keepVerifier({ ...on, locked: true }, 'e1'), false, 'locked');
  assert.equal(keepVerifier('network', 'e0'), true, 'offline: keep what we have');
});

test('away timer: 30 minutes, not a second less', () => {
  assert.equal(relock(null, NOW), false);
  assert.equal(relock(NOW - AWAY_MS, NOW), false);
  assert.equal(relock(NOW - AWAY_MS - 1, NOW), true);
  assert.equal(wrongText(3), 'Wrong MPIN. 3 tries left.');
  assert.match(wrongText(1), /One try left/);
});
