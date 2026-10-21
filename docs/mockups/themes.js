/* Patas mockups: colour themes, the same idea as Gastos's eight themes (a full light and dark set each).
   Only themes that keep two meanings clear are offered: "overdue" (rust) and "due today" (amber) must never be
   mistaken for the accent. Gastos's coral, sunflower, latte and ocean blue collide with those or with the ink
   default, so they are left out until Joe decides. Tint values for green, lavender, teal and pink come from Gastos. */
(function (root) {
  const hex = (h) => parseInt(h.slice(1), 16);
  const mix = (a, b, k) => { const pa = hex(a), pb = hex(b); const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k); return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  const rgba = (h, a) => { const n = hex(h); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  const THEMES = {
    ink: { name: 'Listahan ink',
      l: { bg: '#F6F6F3', surface: '#FFFFFF', text: '#161A22', muted: '#5A6170', border: '#DEDFE2', accent: '#364C8C', soft: '#E6EAF4', mesh: ['#364C8C', '#7499C8', '#EFE6DA'] },
      d: { bg: '#111318', surface: '#1A1D24', text: '#ECEEF3', muted: '#A3A9B6', border: '#2C313C', accent: '#95ADE4', accentText: '#0E1630', soft: '#1F2740', mesh: ['#22305F', '#34498F', '#95ADE4'], fill: '#4A63A8' } },
    green: { name: 'Forest green',
      l: { bg: '#F6F7F6', surface: '#FFFFFF', text: '#16201B', muted: '#5B6660', border: '#DCE1DE', accent: '#1D6B45', soft: '#E3F0E8', mesh: ['#1D6B45', '#3F9D73', '#C9EEDA'] },
      d: { bg: '#111513', surface: '#1A201D', text: '#EDF1EE', muted: '#A3ADA7', border: '#2C3530', accent: '#5CC48C', accentText: '#0C1A12', soft: '#1F3328', mesh: ['#123D28', '#2A8A5B', '#5CC48C'], fill: '#2A7A51' } },
    lavender: { name: 'Lavender',
      l: { bg: '#F7F5FB', surface: '#FFFFFF', text: '#1C1830', muted: '#5F5A6E', border: '#DFDAEA', accent: '#5E4E8C', soft: '#ECE6F8', mesh: ['#5E4E8C', '#9486C0', '#DCD2F5'] },
      d: { bg: '#131219', surface: '#1C1A24', text: '#ECEAF3', muted: '#A8A5B8', border: '#2F2B3B', accent: '#BBA8F2', accentText: '#1A1233', soft: '#2A2440', mesh: ['#2A2050', '#6B4FB8', '#BBA8F2'], fill: '#6B58A8' } },
    teal: { name: 'Mint teal',
      l: { bg: '#F3F8F7', surface: '#FFFFFF', text: '#132220', muted: '#566663', border: '#D6E3E1', accent: '#0E716C', soft: '#D9F0EE', mesh: ['#0E716C', '#3FAFA6', '#C4EDE8'] },
      d: { bg: '#0F1514', surface: '#172020', text: '#E8F1EF', muted: '#9FB0AD', border: '#283533', accent: '#6DD3CA', accentText: '#062220', soft: '#16332F', mesh: ['#0D3B38', '#1E8C84', '#6DD3CA'], fill: '#1F7F78' } },
    pink: { name: 'Baby pink',
      l: { bg: '#FBF5F7', surface: '#FFFFFF', text: '#2A1520', muted: '#6E5A63', border: '#EDDCE3', accent: '#B23A6E', soft: '#FCE4EE', mesh: ['#B23A6E', '#E58DB2', '#F9D2E1'] },
      d: { bg: '#171113', surface: '#221A1D', text: '#F3ECEE', muted: '#B5A6AC', border: '#3A2C32', accent: '#F2A7C6', accentText: '#2A0E1A', soft: '#3A2130', mesh: ['#4A1A30', '#A8456F', '#F2A7C6'], fill: '#A8456F' } },
  };
  const ORDER = ['ink', 'green', 'lavender', 'teal', 'pink'];

  // every token the screens use, for one theme in one mode
  function tokens(key, mode) {
    const T = THEMES[key] || THEMES.ink, dark = mode === 'dark', s = dark ? T.d : T.l;
    const fill = dark ? (s.fill || mix(s.accent, '#000000', 0.5)) : s.accent;
    return {
      '--bg': s.bg, '--surface': s.surface, '--text': s.text, '--muted': s.muted, '--border': s.border,
      '--accent': s.accent, '--accent-text': dark ? s.accentText : '#FFFFFF', '--accent-soft': s.soft,
      '--accent-fill': fill, '--accent-fill-text': '#FFFFFF',
      '--seg-tray': dark ? s.bg : mix(s.bg, '#000000', 0.045), '--seg-on': dark ? s.border : '#FFFFFF',
      '--glass': rgba(s.bg, dark ? 0.6 : 0.62), '--glass-nav': rgba(s.bg, 0.8),
      '--hero-muted': dark ? mix(s.text, s.bg, 0.25) : mix(s.text, s.bg, 0.15),
      '--mesh1': s.mesh[0], '--mesh2': s.mesh[1], '--mesh3': s.mesh[2],
    };
  }
  function apply(el, key, mode) { const t = tokens(key, mode); for (const k in t) el.style.setProperty(k, t[k]); }
  root.PatasThemes = { THEMES, ORDER, tokens, apply, mix };
})(window);
