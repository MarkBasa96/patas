// Phase 6f: what the Reminders card says and what a phone subscription may become.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deviceHint, hhmm, keyBytes, pushState, subscriptionId, subscriptionRow, testResultText, timeLabel } from '../src/pushLogic.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const env = (over) => ({ hasPush: true, permission: 'default', subscribed: false, ua: ANDROID, standalone: false, ...over });

test('status: iPhone tab, unsupported, blocked, off, on', () => {
  assert.equal(pushState(env({ ua: IPHONE })), 'ios-home', 'iPhone in a Safari tab, even if it claims push');
  assert.equal(pushState(env({ ua: IPAD_DESKTOP, hasPush: false })), 'ios-home', 'iPad that says Macintosh');
  assert.equal(pushState(env({ ua: IPHONE, standalone: true })), 'off', 'Home Screen app on iPhone can turn on');
  assert.equal(pushState(env({ hasPush: false })), 'unsupported');
  assert.equal(pushState(env({ permission: 'denied' })), 'blocked');
  assert.equal(pushState(env({ permission: 'granted' })), 'off', 'allowed but not subscribed is still off');
  assert.equal(pushState(env({ permission: 'granted', subscribed: true })), 'on');
  assert.equal(pushState(env({ permission: 'denied', subscribed: true })), 'blocked', 'a stale subscription with blocked permission is not on');
});

test('reminder time: database values in, friendly labels out', () => {
  assert.equal(hhmm('08:00:00'), '08:00');
  assert.equal(hhmm('20:30'), '20:30');
  for (const bad of ['24:00', '8:00', '08:60', 'x', null, 800]) assert.equal(hhmm(bad), null, String(bad));
  assert.equal(timeLabel('08:00'), '8:00 AM');
  assert.equal(timeLabel('12:00'), '12:00 PM');
  assert.equal(timeLabel('00:15'), '12:15 AM');
  assert.equal(timeLabel('20:00'), '8:00 PM');
});

test('subscription row: only real push hosts and well-formed keys; padding stripped', () => {
  const keys = { p256dh: 'B'.repeat(87) + '=', auth: 'c'.repeat(22) + '==' };
  const ok = subscriptionRow({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys }, 'ps_1', 'Android');
  assert.deepEqual(ok, { id: 'ps_1', endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'B'.repeat(87), auth_secret: 'c'.repeat(22), device_hint: 'Android', deleted: false });
  for (const endpoint of ['https://fcm.googleapis.com.evil.test/x', 'http://fcm.googleapis.com/x', 'https://evil.test/x', 'https://fcm.googleapis.com/', 'https://web.push.apple.com/a b', 'x'.repeat(1001)]) {
    assert.equal(subscriptionRow({ endpoint, keys }, 'ps_1', 'Android'), null, endpoint);
  }
  assert.equal(subscriptionRow({ endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'short', auth: keys.auth } }, 'ps_1', ''), null);
  assert.equal(subscriptionRow({ endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: keys.p256dh, auth: 'a+b/' } }, 'ps_1', ''), null, 'non-base64url auth');
  assert.equal(subscriptionRow({ endpoint: 'https://web.push.apple.com/abc' }, 'ps_1', ''), null, 'no keys');
});

test('device hint is generic; key bytes decode; ids are stable and table-safe', async () => {
  assert.equal(deviceHint(IPHONE), 'iPhone or iPad');
  assert.equal(deviceHint(ANDROID), 'Android');
  assert.equal(deviceHint('curl/8'), 'Other');
  const k = keyBytes('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  assert.equal(k.length, 65);
  assert.equal(k[0], 4);
  const a = await subscriptionId('https://fcm.googleapis.com/fcm/send/abc');
  assert.equal(a, await subscriptionId('https://fcm.googleapis.com/fcm/send/abc'));
  assert.notEqual(a, await subscriptionId('https://fcm.googleapis.com/fcm/send/abd'));
  assert.match(a, /^[A-Za-z0-9_-]{1,40}$/, 'fits the table id rule');
});

test('test-reminder messages say what really happened', () => {
  assert.match(testResultText({ error: 'wait' }), /two minutes/);
  assert.match(testResultText({ error: 'failed' }), /internet/);
  assert.match(testResultText({ sent: 0, phones: 0 }), /Turn them on first/);
  assert.equal(testResultText({ sent: 1, phones: 1 }), 'Sent to 1 phone. It should arrive within a minute.');
  assert.equal(testResultText({ sent: 2, phones: 2 }), 'Sent to 2 phones. It should arrive within a minute.');
  assert.match(testResultText({ sent: 0, gone: 1, phones: 1 }), /expired/);
  assert.match(testResultText({ sent: 0, failed: 1, phones: 1 }), /did not accept/);
});
