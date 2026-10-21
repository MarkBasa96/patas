// Patas design tokens, ported from the approved Round 3 mockups (docs/mockups-v3/app.js).
// Pure data and maths, no React, so the node tests can import it directly.

export type ThemeKey = 'indigo' | 'ink' | 'green' | 'lavender' | 'teal' | 'pink';
export type Mode = 'light' | 'dark';

type Palette = { bg: string; surface: string; text: string; muted: string; border: string; accent: string; soft: string; m2: string; fill?: string };

export const THEME_ORDER: ThemeKey[] = ['ink', 'indigo', 'green', 'lavender', 'teal', 'pink'];

export const THEMES: Record<ThemeKey, { name: string; l: Palette; d: Palette }> = {
  indigo: { name: 'Patas indigo', l: { bg: '#F6F7FD', surface: '#FFFFFF', text: '#14183A', muted: '#5B6180', border: '#DDE0EF', accent: '#4F46E5', soft: '#E9EAFB', m2: '#6A63F3' }, d: { bg: '#0F1120', surface: '#181B30', text: '#ECEEFB', muted: '#A5AACB', border: '#2A2F4C', accent: '#A3A8FB', soft: '#242853', m2: '#7A72F4', fill: '#5A52E8' } },
  ink: { name: 'Ink blue', l: { bg: '#F6F6F3', surface: '#FFFFFF', text: '#161A22', muted: '#5A6170', border: '#DEDFE2', accent: '#364C8C', soft: '#E6EAF4', m2: '#5873B8' }, d: { bg: '#111318', surface: '#1A1D24', text: '#ECEEF3', muted: '#A3A9B6', border: '#2C313C', accent: '#95ADE4', soft: '#1F2740', m2: '#5873B8', fill: '#4A63A8' } },
  green: { name: 'Forest green', l: { bg: '#F6F7F6', surface: '#FFFFFF', text: '#16201B', muted: '#5B6660', border: '#DCE1DE', accent: '#1D6B45', soft: '#E3F0E8', m2: '#3F9D73' }, d: { bg: '#111513', surface: '#1A201D', text: '#EDF1EE', muted: '#A3ADA7', border: '#2C3530', accent: '#5CC48C', soft: '#1F3328', m2: '#2A8A5B', fill: '#2A7A51' } },
  lavender: { name: 'Lavender', l: { bg: '#F7F5FB', surface: '#FFFFFF', text: '#1C1830', muted: '#5F5A6E', border: '#DFDAEA', accent: '#5E4E8C', soft: '#ECE6F8', m2: '#8B7BC0' }, d: { bg: '#131219', surface: '#1C1A24', text: '#ECEAF3', muted: '#A8A5B8', border: '#2F2B3B', accent: '#BBA8F2', soft: '#2A2440', m2: '#6B4FB8', fill: '#6B58A8' } },
  teal: { name: 'Mint teal', l: { bg: '#F3F8F7', surface: '#FFFFFF', text: '#132220', muted: '#566663', border: '#D6E3E1', accent: '#0E716C', soft: '#D9F0EE', m2: '#3FAFA6' }, d: { bg: '#0F1514', surface: '#172020', text: '#E8F1EF', muted: '#9FB0AD', border: '#283533', accent: '#6DD3CA', soft: '#16332F', m2: '#1E8C84', fill: '#1F7F78' } },
  pink: { name: 'Baby pink', l: { bg: '#FBF5F7', surface: '#FFFFFF', text: '#2A1520', muted: '#6E5A63', border: '#EDDCE3', accent: '#B23A6E', soft: '#FCE4EE', m2: '#E58DB2' }, d: { bg: '#171113', surface: '#221A1D', text: '#F3ECEE', muted: '#B5A6AC', border: '#3A2C32', accent: '#F2A7C6', soft: '#3A2130', m2: '#A8456F', fill: '#A8456F' } },
};

export const DEFAULT_THEME: ThemeKey = 'ink'; // Joe 2026-10-21, on Erina's advice: indigo read as a stock generated-app look

export type Tokens = {
  bg: string; surface: string; text: string; muted: string; border: string;
  accent: string; accentSoft: string; accentFill: string; mesh2: string; field: string; track: string;
  peachBg: string; peachInk: string; mintBg: string; mintInk: string; redBg: string; danger: string; warn: string; ok: string;
};

const hexN = (h: string) => parseInt(h.slice(1), 16);

/** Blend two #RRGGBB colours; k = 0 gives a, k = 1 gives b. */
export function mix(a: string, b: string, k: number): string {
  const pa = hexN(a);
  const pb = hexN(b);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function tokens(key: ThemeKey, mode: Mode): Tokens {
  const T = THEMES[key] ?? THEMES[DEFAULT_THEME];
  const dark = mode === 'dark';
  const s = dark ? T.d : T.l;
  const sem = dark
    ? { peachBg: '#3A2B20', peachInk: '#FFB584', mintBg: '#17342A', mintInk: '#5FD6A2', redBg: '#3C2024', danger: '#FF8F96', warn: '#FFA566', ok: '#46CFA0' }
    : { peachBg: '#FDEBDD', peachInk: '#BD5418', mintBg: '#DDF5EA', mintInk: '#1C8A5F', redBg: '#FDE4E4', danger: '#D13F3F', warn: '#D9631F', ok: '#2FB589' };
  return {
    bg: s.bg, surface: s.surface, text: s.text, muted: s.muted, border: s.border,
    accent: s.accent, accentSoft: s.soft, accentFill: dark ? (s.fill ?? s.accent) : s.accent, mesh2: s.m2,
    field: dark ? mix(s.surface, '#FFFFFF', 0.07) : mix(s.bg, s.accent, 0.07),
    track: dark ? mix(s.surface, '#FFFFFF', 0.12) : mix(s.bg, s.text, 0.1),
    ...sem,
  };
}

/** WCAG relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const n = hexN(hex);
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const isThemeKey = (v: unknown): v is ThemeKey => typeof v === 'string' && (THEME_ORDER as string[]).includes(v);
