// What happened at sign-in during THIS app run, kept in memory only (Kenshin audit H-1: never compare
// the token's server time with the phone's clock, which whoever holds the phone can move).
//  - codeAccepted: an email code was just accepted on this screen, so the MPIN may be skipped once (online only).
//  - forgot: the person tapped "Forgot MPIN?", so after the code they set a new one (audit L-2).
let codeAccepted = false;
let forgot = false;

export const setCodeAccepted = (v: boolean) => { codeAccepted = v; };
export const markForgot = () => { forgot = true; };

/** Read once: the next lock check gets it, nothing after. */
export function takeSignIn(): { codeAccepted: boolean; forgot: boolean } {
  const r = { codeAccepted, forgot };
  codeAccepted = false;
  forgot = false;
  return r;
}
