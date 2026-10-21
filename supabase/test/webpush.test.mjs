// Proves the hand-written Web Push code: the exact RFC 8291 Appendix A example, a decrypt with a
// different crypto library (Node's own), the VAPID signature, and the sender's refusals.
//   node --experimental-strip-types supabase/test/webpush.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createECDH, createDecipheriv, hkdfSync, createPublicKey, verify } from 'node:crypto';
import { b64u, unb64u, encrypt, jwkFrom, vapidHeader, newSenderKeys, send, PUSH_HOST } from '../functions/send-reminders/webpush.ts';

// RFC 8291, Appendix A.
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

// The browser's side, written with Node's crypto (not WebCrypto), so a shared mistake can't pass both.
function uaDecrypt(body, uaPrivate, uaPublic, auth) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const sealed = body.subarray(21 + idlen);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  const out = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
  assert.equal(out[out.length - 1], 2, 'last-record delimiter');
  return out.subarray(0, out.length - 1).toString('utf8');
}

test('the RFC test vector keys are self-consistent (guards against a mistyped vector)', () => {
  const e = createECDH('prime256v1');
  e.setPrivateKey(unb64u(V.asPrivate));
  assert.equal(b64u(new Uint8Array(e.getPublicKey())), V.asPublic);
  e.setPrivateKey(unb64u(V.uaPrivate));
  assert.equal(b64u(new Uint8Array(e.getPublicKey())), V.uaPublic);
});

test('encrypt reproduces RFC 8291 Appendix A byte for byte', async () => {
  const out = await encrypt(new TextEncoder().encode(V.plaintext), unb64u(V.uaPublic), unb64u(V.auth), {
    salt: unb64u(V.salt), sender: { privateJwk: jwkFrom(unb64u(V.asPrivate), unb64u(V.asPublic)), publicRaw: unb64u(V.asPublic) },
  });
  assert.equal(b64u(out), V.body);
});

test('a real (random-key) message decrypts with Node crypto as the browser would', async () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const msg = JSON.stringify({ web_push: 8030, notification: { title: 'Patas', body: 'Due today: 2 payments.' } });
  const a = await encrypt(new TextEncoder().encode(msg), new Uint8Array(ua.getPublicKey()), auth);
  const b = await encrypt(new TextEncoder().encode(msg), new Uint8Array(ua.getPublicKey()), auth);
  assert.equal(uaDecrypt(Buffer.from(a), ua.getPrivateKey(), ua.getPublicKey(), Buffer.from(auth)), msg);
  assert.notEqual(b64u(a.subarray(0, 16)), b64u(b.subarray(0, 16)), 'fresh salt every time');
  assert.notEqual(b64u(a.subarray(21, 86)), b64u(b.subarray(21, 86)), 'fresh sender key every time');
  const wrongAuth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  assert.throws(() => uaDecrypt(Buffer.from(a), ua.getPrivateKey(), ua.getPublicKey(), Buffer.from(wrongAuth)), 'wrong auth secret must fail');
});

test('VAPID header: signed by the stored key, audience is only the push service origin, short expiry', async () => {
  const k = await newSenderKeys();
  assert.match(k.publicB64, /^[A-Za-z0-9_-]{87}$/);
  const keys = { privateJwk: JSON.parse(k.privateJson), publicRaw: unb64u(k.publicB64) };
  const now = 1_800_000_000;
  const h = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc?x=1', keys, 'https://patas.example', now);
  const [, t, kk] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(kk, k.publicB64);
  const [hd, cl, sig] = t.split('.');
  const claims = JSON.parse(Buffer.from(unb64u(cl)).toString());
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: now + 43200, sub: 'https://patas.example' });
  assert.deepEqual(JSON.parse(Buffer.from(unb64u(hd)).toString()), { typ: 'JWT', alg: 'ES256' });
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: keys.privateJwk.x, y: keys.privateJwk.y }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${hd}.${cl}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(unb64u(sig))));
  assert.equal(verify('sha256', Buffer.from(`${hd}.${cl}x`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(unb64u(sig))), false);
  assert.equal(JSON.parse(k.privateJson).d.length, 43, 'private key kept as a JWK');
});

test('sender: only real push hosts, never follows redirects, gone and failures reported, never throws', async () => {
  const k = await newSenderKeys();
  const keys = { privateJwk: JSON.parse(k.privateJson), publicRaw: unb64u(k.publicB64) };
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const sub = (endpoint) => ({ id: 'p1', endpoint, p256dh: b64u(new Uint8Array(ua.getPublicKey())), auth: b64u(new Uint8Array(16).fill(7)) });
  const calls = [];
  const fake = (status) => async (url, init) => { calls.push({ url, init }); return new Response(null, { status }); };
  for (const bad of ['https://fcm.googleapis.com.evil.test/x', 'https://evil.test/fcm.googleapis.com/x', 'http://fcm.googleapis.com/x',
    'https://169.254.169.254/latest', 'https://web.push.apple.com.evil.test/x', 'https://fcm.googleapis.com/\nx']) {
    assert.equal(await send(sub(bad), {}, keys, 's', fake(201)), 'refused', bad);
  }
  assert.equal(calls.length, 0, 'refused addresses are never called');
  assert.equal(await send(sub('https://fcm.googleapis.com/fcm/send/ok'), { a: 1 }, keys, 's', fake(201)), 'sent');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(await send(sub('https://web.push.apple.com/abc'), {}, keys, 's', fake(410)), 'gone');
  assert.equal(await send(sub('https://updates.push.services.mozilla.com/wpush/v2/x'), {}, keys, 's', fake(404)), 'gone');
  assert.equal(await send(sub('https://fcm.googleapis.com/fcm/send/r'), {}, keys, 's', fake(301)), 'failed', 'a redirect is a failure, not followed');
  assert.equal(await send(sub('https://fcm.googleapis.com/fcm/send/t'), {}, keys, 's', async () => { throw new Error('down'); }), 'failed');
  assert.equal(await send({ ...sub('https://fcm.googleapis.com/fcm/send/k'), p256dh: 'short' }, {}, keys, 's', fake(201)), 'failed', 'bad key: failed, no throw');
  assert.ok(PUSH_HOST.test('https://wns2-sg2p.notify.windows.com/w/?token=abc'));
});
