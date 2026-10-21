// QR gallery rules that need no screen and no network, so they can be tested in Node.
// Security design: docs/SECURITY_DESIGN.md (Kenshin's 6e conditions) and the save/share ruling.
import { isCleanLine } from './ledger';
import { isIsoDate } from './plan';

export type Wallet = 'gcash' | 'maya' | 'gotyme' | 'bank' | 'other';
export const WALLETS: { key: Wallet; label: string }[] = [
  { key: 'gcash', label: 'GCash' },
  { key: 'maya', label: 'Maya' },
  { key: 'gotyme', label: 'GoTyme' },
  { key: 'bank', label: 'Bank' },
  { key: 'other', label: 'Other' },
];
export const walletLabel = (w: string): string => WALLETS.find((x) => x.key === w)?.label ?? 'Other';
export const isWallet = (w: unknown): w is Wallet => typeof w === 'string' && WALLETS.some((x) => x.key === w);

/** One saved QR (mirrors public.qr_items). `added_at`, `last_copy_saved_at`, `old_copy_saved_at` come from the server clock. */
export type QrRow = {
  id: string;
  label: string;
  wallet: Wallet;
  account_name: string;
  storage_path: string;
  payload_sha256: string;
  added_at: string;
  last_copy_saved_at: string | null;
  replaces_id: string | null;
  old_copy_saved_at: string | null;
  created_at: number;
  deleted: boolean;
};

export const QR_LIMITS = { label: 40, account: 60 } as const;
export const MAX_QR_BYTES = 262_144; // the bucket refuses anything bigger
export const RECENT_DAYS = 14;

// ---- the payee name inside a payment QR (QR Ph / EMVCo: tag 59 = name, 60 = city) ----
/** Top-level TLV fields of an EMVCo payload, or null if the text is not one. */
export function emvFields(text: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < text.length) {
    const tag = text.slice(i, i + 2);
    const len = Number(text.slice(i + 2, i + 4));
    if (!/^\d\d$/.test(tag) || !/^\d\d$/.test(text.slice(i + 2, i + 4)) || i + 4 + len > text.length) return null;
    out.set(tag, text.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out.get('00') === '01' ? out : null;
}

/** The payee name a wallet will show, cleaned for display (never stored), or '' if there is none. */
export function payeeName(text: string): string {
  const name = (emvFields(text)?.get('59') ?? '').trim();
  return name && isCleanLine(name, 60) ? name : '';
}

/** EMVCo checksum (CRC-16/CCITT-FALSE over everything up to and including "6304"). */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const ch of s) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export function crcOk(text: string): boolean {
  const at = text.lastIndexOf('6304');
  return at >= 0 && at + 8 === text.length && crc16(text.slice(0, at + 4)) === text.slice(at + 4).toUpperCase();
}

/**
 * Does the name inside a QR plausibly belong to the saved account name? Wallets often mask names
 * ("JU** DE** C."), so a masked word only has to share its visible start with some typed word, and
 * an unmasked word has to equal one. Used to warn, never to block: a swapped QR usually shows a stranger's name.
 */
export function namesAgree(inQr: string, saved: string): boolean {
  const words = (s: string) => s.toUpperCase().split(/[^A-Z0-9*]+/).filter(Boolean);
  const q = words(inQr);
  const a = words(saved).map((w) => w.replace(/\*/g, ''));
  if (!q.length || !a.length) return true; // nothing to compare: say nothing
  return q.some((w) => {
    const visible = w.replace(/\*.*$/, '');
    if (!visible) return false;
    return w.includes('*') || visible.length === 1 ? a.some((x) => x.startsWith(visible)) : a.includes(visible);
  });
}

// ---- the fingerprint (Kenshin F7): sha256(user_id ':' id ':' decoded text), lowercase hex ----
export async function qrFingerprint(userId: string, id: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${userId}:${id}:${text}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Decoded text matches the saved QR? Any decode failure counts as "no". */
export async function matches(userId: string, row: Pick<QrRow, 'id' | 'payload_sha256'>, text: string | null): Promise<boolean> {
  return text !== null && (await qrFingerprint(userId, row.id, text)) === row.payload_sha256;
}

// ---- the 14-day warning ----
const DAY = 86_400_000;
const within = (iso: string | null | undefined, nowMs: number): boolean => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && nowMs - t < RECENT_DAYS * DAY && t <= nowMs + DAY;
};
const dateOf = (iso: string): string => iso.slice(0, 10);

export type QrWarning = { kind: 'changed' | 'added' | 'relinked'; on: string; oldCopyOn: string | null } | null;

/**
 * What to warn about on Show QR and on a debt: a QR that replaced another one in the last 14 days
 * ("changed"), a brand-new QR ("added"), or a debt pointed at a different QR ("relinked"). Dates are
 * the server's, so the phone can't hide a swap by changing its clock.
 */
export function qrWarning(qr: Pick<QrRow, 'added_at' | 'replaces_id' | 'old_copy_saved_at'>, debtLinkedAt: string | null, nowMs: number): QrWarning {
  const oldCopyOn = qr.old_copy_saved_at ? dateOf(qr.old_copy_saved_at) : null;
  if (within(qr.added_at, nowMs)) return { kind: qr.replaces_id ? 'changed' : 'added', on: dateOf(qr.added_at), oldCopyOn };
  if (within(debtLinkedAt, nowMs)) return { kind: 'relinked', on: dateOf(debtLinkedAt as string), oldCopyOn: null };
  return null;
}

// ---- the saved copy (save/share ruling 3.3, 3.5, 3.6) ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOT = String.fromCharCode(0xb7);

/** "qr-2026-10-02-k7m2.png": a date and 4 random characters, nothing that identifies anyone. */
export function copyFileName(today: string, rand: string): string {
  if (!isIsoDate(today) || !/^[a-z0-9]{4}$/.test(rand)) throw new Error('bad copy name parts');
  return `qr-${today}-${rand}.png`;
}
export function randomTag(random: () => number = Math.random): string {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 4 }, () => a[Math.floor(random() * a.length) % a.length]).join('');
}

/** "Copy from Patas · 2 Oct 2026": the app and the date, never the label, payee or amount. */
export function copyCaption(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  return `Copy from Patas ${DOT} ${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/**
 * Size of the copy: the QR scaled by a whole number (squares stay sharp), a white margin of at least
 * 12% of the QR's width and never under 32px on every side (more than the 4-square quiet zone), then
 * a caption strip below the margin.
 */
export function copyLayout(w: number, h: number): { scale: number; margin: number; caption: number; width: number; height: number } {
  const scale = Math.max(1, Math.floor(720 / Math.max(w, h, 1)));
  const qw = w * scale;
  const qh = h * scale;
  const margin = Math.max(32, Math.ceil(qw * 0.12));
  const caption = Math.max(36, Math.round(qw * 0.07));
  return { scale, margin, caption, width: qw + margin * 2, height: qh + margin * 2 + caption };
}

/** Where to crop a picked picture: the QR's corners plus a quiet zone, kept inside the picture. */
export function cropBox(corners: { x: number; y: number }[], imgW: number, imgH: number): { x: number; y: number; w: number; h: number } {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const side = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
  const pad = Math.ceil(side * 0.15);
  const x = Math.max(0, Math.floor(x0 - pad));
  const y = Math.max(0, Math.floor(y0 - pad));
  return { x, y, w: Math.min(imgW, Math.ceil(x0 + side + pad)) - x, h: Math.min(imgH, Math.ceil(y0 + side + pad)) - y };
}

// ---- the add/edit form ----
export type QrForm = { label: string; wallet: Wallet; account: string; person: string | null };
export type QrFormErrors = Partial<Record<'label' | 'account' | 'picture', string>>;

export function validateQrForm(f: QrForm, hasPicture: boolean): QrFormErrors {
  const e: QrFormErrors = {};
  if (!hasPicture) e.picture = 'Choose a picture of the QR code.';
  if (!f.account.trim()) e.account = 'Whose account is it? Type the name.';
  else if (!isCleanLine(f.account.trim(), QR_LIMITS.account)) e.account = `Up to ${QR_LIMITS.account} plain characters.`;
  if (!isCleanLine(f.label.trim(), QR_LIMITS.label)) e.label = `Up to ${QR_LIMITS.label} plain characters.`;
  return e;
}

/** The gallery's title for a QR: who it pays (from linked debts), else its label. */
export function qrTitle(qr: Pick<QrRow, 'label' | 'account_name'>, linkedPeople: string[]): string {
  return linkedPeople.length ? linkedPeople.join(', ') : qr.label || qr.account_name || 'Saved QR';
}

/** Gallery filter chips: All, GCash, Maya, Banks (GoTyme is a bank). */
export function inFilter(w: Wallet, f: 'all' | 'gcash' | 'maya' | 'banks'): boolean {
  return f === 'all' || (f === 'banks' ? w === 'bank' || w === 'gotyme' : w === f);
}
