// Phase 6a checks: the sign-in helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanCode, friendlyAuthError, isCompleteCode, isPlausibleEmail, maskEmail, normaliseEmail } from '../src/auth.ts';

test('emails: plain shapes accepted, junk refused', () => {
  for (const ok of ['a@b.co', ' Test.User+x@Example.com ', 'x@sub.domain.org']) assert.equal(isPlausibleEmail(ok), true, ok);
  for (const bad of ['', 'no-at.com', 'a@b', 'a b@c.com', 'a@@b.com', '@b.com', 'a@b.c', 'x'.repeat(250) + '@b.com']) assert.equal(isPlausibleEmail(bad), false, bad);
  assert.equal(normaliseEmail('  Jo@Example.COM '), 'jo@example.com');
});

test('code: digits only, six long, paste-friendly', () => {
  assert.equal(cleanCode('123 456'), '123456');
  assert.equal(cleanCode('12-34-56'), '123456');
  assert.equal(cleanCode('1234567890'), '123456');
  assert.equal(cleanCode('abc'), '');
  assert.equal(isCompleteCode('123456'), true);
  for (const bad of ['', '12345', '1234567', '12345a', '12 456']) assert.equal(isCompleteCode(bad), false, bad);
});

test('masking hides most of the name but keeps the domain', () => {
  assert.equal(maskEmail('testuser@example.com'), 'te******@example.com');
  assert.equal(maskEmail('ab@x.com'), 'ab**@x.com');
  assert.equal(maskEmail('nonsense'), 'nonsense');
});

test('server messages become plain words and never leak through', () => {
  assert.match(friendlyAuthError('captcha protection: request disallowed (invalid-input-response)', 'x'), /security check/);
  assert.match(friendlyAuthError('email rate limit exceeded', 'x'), /Too many/);
  assert.match(friendlyAuthError('Token has expired or is invalid', 'x'), /code did not work/);
  assert.match(friendlyAuthError('TypeError: Failed to fetch', 'x'), /No internet/);
  assert.equal(friendlyAuthError('weird secret db error at host db.internal', 'Could not send.'), 'Could not send.');
  assert.equal(friendlyAuthError(undefined, 'Could not send.'), 'Could not send.');
});
