// Web Push with WebCrypto only (no library): message encryption per RFC 8291 (aes128gcm) and the
// sender's signature per RFC 8292 (VAPID). Runs in Deno (Edge Function) and Node 20+ (tests).
// Proven against RFC 8291 Appendix A in supabase/test/webpush.test.mjs.

const te = new TextEncoder();
const subtle = globalThis.crypto.subtle;

export function b64u(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
}
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, bytes * 8));
}

/** A P-256 private key from its 32-byte scalar plus 65-byte uncompressed public point. */
export function jwkFrom(d: Uint8Array, pub: Uint8Array): JsonWebKey {
  return { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
}

export type SenderKeys = { privateJwk: JsonWebKey; publicRaw: Uint8Array };

/** Encrypts one message for one browser. `fixed` is for the RFC test vector only (salt + sender key). */
export async function encrypt(plaintext: Uint8Array, uaPublic: Uint8Array, authSecret: Uint8Array,
  fixed?: { salt: Uint8Array; sender: SenderKeys }): Promise<Uint8Array> {
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad browser key');
  if (authSecret.length !== 16) throw new Error('bad auth secret');
  let priv: CryptoKey, asPublic: Uint8Array;
  if (fixed) {
    priv = await subtle.importKey('jwk', fixed.sender.privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    asPublic = fixed.sender.publicRaw;
  } else {
    const pair = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    priv = pair.privateKey;
    asPublic = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  }
  const salt = fixed?.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const ua = await subtle.importKey('raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: ua }, priv, 256));
  const ikm = await hkdf(authSecret, shared, cat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, cat(plaintext, new Uint8Array([2])) as BufferSource));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  return cat(header, asPublic, sealed);
}

/** The "Authorization: vapid t=..., k=..." header for one push service. */
export async function vapidHeader(endpoint: string, keys: SenderKeys, subject: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const part = (o: unknown) => b64u(te.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud, exp: nowSec + 12 * 3600, sub: subject })}`;
  const key = await subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${b64u(keys.publicRaw)}`;
}

/** New sender keys: the public half as base64url raw, the private half as a JWK string. */
export async function newSenderKeys(): Promise<{ publicB64: string; privateJson: string }> {
  const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const jwk = await subtle.exportKey('jwk', pair.privateKey);
  return { publicB64: b64u(pub), privateJson: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y }) };
}

// Same allow-list as the database (SECURITY_DESIGN, Kenshin F8): checked again here, in code, so a
// row that somehow got past the table rule still can't make the server call an arbitrary address.
export const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|[a-z0-9-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\/[^\s\x00-\x1f]+$/;

export type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
export type SendResult = 'sent' | 'gone' | 'refused' | 'failed';

/** Sends one message. Never follows redirects, never throws, never logs the address or the words. */
export async function send(sub: Sub, payload: object, keys: SenderKeys, subject: string, fetcher: typeof fetch = fetch): Promise<SendResult> {
  try {
    if (!PUSH_HOST.test(sub.endpoint) || sub.endpoint.length > 1000) return 'refused';
    const body = await encrypt(te.encode(JSON.stringify(payload)), unb64u(sub.p256dh), unb64u(sub.auth));
    const res = await fetcher(sub.endpoint, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: await vapidHeader(sub.endpoint, keys, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
        Topic: 'patas-digest',
      },
      body: body as BodyInit,
    });
    await res.body?.cancel();
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.status >= 200 && res.status < 300 ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
