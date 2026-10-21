// Optional app MPIN (SPEC 8, F24): the decisions only, no storage or network, so node tests cover them.
// Gastos v3 rules (Kenshin v3 review + audit), reused as is: the server decides whenever there is a
// network; the phone's copy (the "verifier") only unlocks offline, is written only with digits the
// server just accepted, goes stale after 30 days, and is dropped when the server's epoch moves on.

export const MAX_TRIES = 5;
export const AWAY_MS = 30 * 60_000; // a fresh open always asks; switching apps asks only after this long
export const STALE_MS = 30 * 86_400_000;

// Kenshin 1.7: block the most-guessed PINs. Same rule as the database's private.pin_weak.
const BLOCKED = new Set(['1212', '6969', '2580', '1004', '2000', '1122', '5683', '0852', '1010', '2020', '4545']);
export function weakPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true;
  if (/^(\d)\1{3}$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const up = d.every((x, i) => i === 0 || x === ((d[i - 1] ?? 0) + 1) % 10);
  const down = d.every((x, i) => i === 0 || x === ((d[i - 1] ?? 0) + 9) % 10);
  return up || down || BLOCKED.has(pin);
}

export type ServerStatus = { enabled: boolean; epoch: string | null; locked: boolean; tries_left: number; can_reset: boolean };
export type LocalView = { verifier: { epoch: string; lockedOut: boolean; checkedAt: number } | null; knownEnabled: boolean };

export type Gate =
  | 'open' // no MPIN, or just signed in with an email code
  | 'ask' // lock screen; the digits can be checked (online, or offline with a fresh copy)
  | 'ask-online' // lock screen that needs the internet (no copy on this phone, or it is stale)
  | 'reset' // locked out, and this session's email code may set a new MPIN
  | 'signout'; // locked out: only a new email code gets back in

/**
 * What the app shows on a fresh open (or after 30 minutes away). `codeAccepted` = an email code was accepted
 * on the sign-in screen in this app run (an in-memory flag, never a clock: Kenshin audit H-1); it only
 * counts online, where the server can confirm the account. `forgot` = the person asked to set a new MPIN.
 */
export function gate(server: ServerStatus | 'network', local: LocalView, now: number, codeAccepted: boolean, forgot = false): Gate {
  const v = local.verifier;
  if (server !== 'network') {
    // Locked on the server, or on this phone (offline wrong tries): locked means locked (Gastos audit L-1).
    if (server.locked || v?.lockedOut) return server.can_reset && codeAccepted ? 'reset' : 'signout';
    if (!server.enabled) return 'open';
    if (!codeAccepted) return 'ask';
    return forgot ? 'reset' : 'open';
  }
  if (v?.lockedOut) return 'signout';
  if (!v) return local.knownEnabled ? 'ask-online' : 'open';
  return now - v.checkedAt > STALE_MS ? 'ask-online' : 'ask';
}

/** The phone's copy is kept only while it matches what the server says now. */
export function keepVerifier(server: ServerStatus | 'network', verifierEpoch: string | null): boolean {
  if (server === 'network') return true;
  return server.enabled && !server.locked && server.epoch !== null && server.epoch === verifierEpoch;
}

export const relock = (hiddenAt: number | null, now: number) => hiddenAt !== null && now - hiddenAt > AWAY_MS;

export function wrongText(left: number | undefined): string {
  if (left === undefined) return 'Wrong MPIN.';
  return left <= 1 ? 'Wrong MPIN. One try left before you need an email code.' : `Wrong MPIN. ${left} tries left.`;
}
