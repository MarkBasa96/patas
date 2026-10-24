/* Patas mockups v4: motion shared by every screen, to Erina's round 4 spec (erina-round4-direction §6).
   Everything respects "reduce motion": numbers land at once, popups/sheets/toasts fade only, the reveal crossfades,
   press dims instead of scaling. Sound and haptics have their own switches. */
(function (root) {
  'use strict';
  const EASE = { out: 'cubic-bezier(0.22, 1, 0.36, 1)', in: 'cubic-bezier(0.4, 0, 1, 1)', sheet: 'cubic-bezier(0.32, 0.72, 0, 1)', inOut: 'cubic-bezier(0.65, 0, 0.35, 1)' };
  const MOTION = {
    count: 600, countTween: 500, countStagger: 60,
    popIn: 240, popOut: 180, scrimIn: 200,
    sheetIn: 320, sheetOut: 240, swipeShare: 0.25, flick: 0.5, // drag past 25% of the sheet, or faster than 0.5 px/ms
    toastIn: 260, toastHold: 1600, toastOut: 200,
    reveal: 520,
    press: { card: 0.98, button: 0.97, chip: 0.96 },
  };
  const reduce = () => document.documentElement.dataset.reduce === '1' || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);

  // ---------- count-up ----------
  // <span data-count="1234500" data-key="home.owed" data-delay="60">. The first time a key is seen it counts from
  // zero (once per app open); after that it only moves when the value changed, tweening old -> new.
  const last = new Map();
  function countAll(scope, fmt) {
    for (const el of scope.querySelectorAll('[data-count]')) {
      const to = Number(el.dataset.count), key = el.dataset.key || '';
      const seen = last.has(key), from = seen ? last.get(key) : 0;
      last.set(key, to);
      el.setAttribute('aria-label', fmt(to)); // screen readers hear the final amount, once
      el.textContent = fmt(to); // the box is sized to its final value first (no jitter), then the digits run
      const w = el.getBoundingClientRect().width;
      if (w) el.style.minWidth = w + 'px';
      if (reduce() || from === to) continue;
      const dur = seen ? MOTION.countTween : MOTION.count, delay = seen ? 0 : Number(el.dataset.delay || 0);
      el.textContent = fmt(from);
      const t0 = performance.now() + delay;
      const tick = (now) => {
        const k = Math.max(0, Math.min(1, (now - t0) / dur));
        el.textContent = fmt(Math.round(from + (to - from) * easeOut(k)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }
  const resetCounts = () => last.clear(); // "app opened again"

  // ---------- one popup system: centred popups and bottom sheets ----------
  // open(host, html, {kind:'center'|'sheet', title, height, onClose}) -> {close, el, body}
  function open(host, html, opt = {}) {
    const kind = opt.kind || 'center', rm = reduce();
    const wrap = document.createElement('div');
    wrap.className = `modal ${kind}`;
    wrap.innerHTML = `<div class="scrim" data-close></div><div class="dialog" role="dialog" aria-modal="true" aria-label="${opt.title || ''}"${opt.height ? ` style="height:${opt.height}"` : ''}>${kind === 'sheet' ? '<div class="grab" aria-hidden="true"><span></span></div>' : ''}<div class="dbody">${html}</div></div>`;
    host.appendChild(wrap);
    const dlg = wrap.querySelector('.dialog'), scrim = wrap.querySelector('.scrim'), body = wrap.querySelector('.dbody');
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: rm ? 150 : MOTION.scrimIn, easing: EASE.out, fill: 'both' });
    if (rm) dlg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, fill: 'both' });
    else if (kind === 'sheet') dlg.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: MOTION.sheetIn, easing: EASE.sheet, fill: 'both' });
    else dlg.animate([{ transform: 'scale(.96)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: MOTION.popIn, easing: EASE.out, fill: 'both' });
    let closed = false;
    const off = [];
    const close = () => {
      if (closed) return; closed = true;
      off.forEach((f) => f());
      const d = kind === 'sheet' ? MOTION.sheetOut : MOTION.popOut;
      const cur = getComputedStyle(dlg).transform;
      dlg.getAnimations().forEach((a) => a.cancel());
      if (rm) dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
      else if (kind === 'sheet') dlg.animate([{ transform: cur === 'none' ? 'translateY(0)' : cur }, { transform: 'translateY(100%)' }], { duration: d, easing: EASE.in, fill: 'forwards' });
      else dlg.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.98)', opacity: 0 }], { duration: d, easing: EASE.in, fill: 'forwards' });
      scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: rm ? 150 : d, easing: EASE.in, fill: 'forwards' }).onfinish = () => { wrap.remove(); opt.onClose && opt.onClose(); };
    };
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    body.addEventListener('scroll', () => dlg.classList.toggle('scrolled', body.scrollTop > 2), { passive: true }); // header hairline only once content has scrolled
    if (kind === 'sheet') {
      // drag down from the handle or header, or from the content when it is scrolled to the top
      let y0 = null, t0 = 0, dy = 0;
      const down = (e) => { if (body.scrollTop > 0 && !e.target.closest('.grab, .shead')) return; if (e.target.closest('input, textarea, select, .seg, .swatches')) return; y0 = e.clientY; t0 = performance.now(); dy = 0; };
      const move = (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); if (dy > 3) { dlg.getAnimations().forEach((a) => a.cancel()); dlg.style.transform = `translateY(${dy}px)`; } };
      const up = () => {
        if (y0 === null) return;
        const v = dy / Math.max(1, performance.now() - t0); y0 = null;
        if (dy > dlg.offsetHeight * MOTION.swipeShare || (dy > 24 && v > MOTION.flick)) { close(); return; }
        if (dy > 3) dlg.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 200, easing: EASE.out }).onfinish = () => (dlg.style.transform = '');
      };
      dlg.addEventListener('pointerdown', down);
      root.addEventListener('pointermove', move); root.addEventListener('pointerup', up);
      off.push(() => { root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); });
    }
    const first = dlg.querySelector('h2');
    if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
    return { close, el: wrap, body, isOpen: () => !closed };
  }

  /** Replace the popup's content with a pushed view (Paid -> payment detail): 24px slide + fade, back mirrors it. */
  function push(body, html, back) {
    body.innerHTML = html;
    body.scrollTop = 0;
    if (!reduce()) body.animate([{ transform: `translateX(${back ? -24 : 24}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: EASE.out });
  }

  // ---------- toast ----------
  let toastEl = null, toastTimer = null;
  function toast(host, text, opt = {}) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    const el = document.createElement('div');
    el.className = 'toast' + (opt.quiet ? ' quiet' : '');
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<svg class="tcheck" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="11"/><path d="m6.5 11.4 3 3 6-6.6"/></svg><span>${text}</span>`;
    host.appendChild(el);
    toastEl = el;
    const rm = reduce();
    el.animate(rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'translate(-50%,-16px)', opacity: 0 }, { transform: 'translate(-50%,0)', opacity: 1 }], { duration: rm ? 150 : MOTION.toastIn, easing: EASE.out, fill: 'both' });
    if (!rm) el.querySelector('path').animate([{ strokeDashoffset: 18 }, { strokeDashoffset: 0 }], { duration: 300, delay: 80, easing: EASE.out, fill: 'both' });
    if (opt.sound) sound();
    if (opt.haptic !== false && !opt.quiet) buzz(10);
    const leave = () => {
      clearTimeout(toastTimer);
      el.animate(rm ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'translate(-50%,0)', opacity: 1 }, { transform: 'translate(-50%,-8px)', opacity: 0 }], { duration: rm ? 150 : MOTION.toastOut, easing: EASE.in, fill: 'forwards' }).onfinish = () => el.remove();
    };
    el.addEventListener('click', leave);
    toastTimer = setTimeout(leave, MOTION.toastIn + MOTION.toastHold);
  }

  // ---------- one soft tick (made on the fly, no files) and an Android-only haptic ----------
  let ctx = null;
  const prefs = { sound: true, haptic: true };
  // A soft two-note chime (E6 then A6, a bell-like sine with a quick fade), loud enough to hear in a room but never a
  // coin or cash-register sound. The first version (one 4%-volume note) was too faint to notice (Joe, 2026-10-23).
  function sound(force) {
    if (!prefs.sound && !force) return;
    try {
      ctx = ctx || new (root.AudioContext || root.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime + 0.01;
      [[1318.5, 0], [1760, 0.085]].forEach(([f, at]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + at;
        o.type = 'sine'; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.3);
      });
    } catch (_) { /* no sound: fine */ }
  }
  // Browsers start audio paused; the first tap anywhere wakes it, so the first toast is not silent
  const wake = () => { try { ctx = ctx || new (root.AudioContext || root.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (_) {} root.removeEventListener('pointerdown', wake); };
  root.addEventListener('pointerdown', wake);
  const buzz = (ms) => { if (prefs.haptic && navigator.vibrate) try { navigator.vibrate(ms); } catch (_) {} };

  // ---------- theme reveal: the new look floods out as a circle from the tapped control ----------
  function reveal(x, y, apply) {
    const doc = document;
    if (!doc.startViewTransition) { apply(); return; }
    const vt = doc.startViewTransition(apply);
    if (reduce()) return; // the default view transition is a short crossfade
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    vt.ready.then(() => {
      doc.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] }, { duration: MOTION.reveal, easing: EASE.inOut, pseudoElement: '::view-transition-new(root)' });
    });
  }

  // ---------- press: cards, buttons and chips sink a little while held ----------
  function pressable(scope) {
    scope.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.press, .btn, .chip'); if (!el) return;
      const rm = reduce();
      const k = el.classList.contains('chip') ? MOTION.press.chip : el.classList.contains('btn') ? MOTION.press.button : MOTION.press.card;
      el.style.transition = `transform 90ms ${EASE.out}, opacity 90ms`;
      if (rm) el.style.opacity = '0.7'; else el.style.transform = `scale(${k})`;
      const up = () => { el.style.transition = `transform 160ms ${EASE.out}, opacity 160ms`; el.style.transform = ''; el.style.opacity = ''; root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', up); };
      root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
    });
  }

  /** Grow bars, draw lines and sweep rings on first view (one reveal per chart key per session). */
  const seenCharts = new Set();
  function chartsIn(scope) {
    for (const el of scope.querySelectorAll('[data-chart]')) {
      const key = el.dataset.chart; if (seenCharts.has(key)) continue; seenCharts.add(key);
      if (reduce()) continue;
      el.querySelectorAll('.gbar').forEach((b, i) => b.animate([{ transform: b.dataset.dir === 'x' ? 'scaleX(0)' : 'scaleY(0)' }, { transform: 'none' }], { duration: 500, delay: Math.min(300, i * 40), easing: EASE.out, fill: 'both' }));
      el.querySelectorAll('.gline').forEach((l) => { const len = l.getTotalLength ? l.getTotalLength() : 600; l.style.strokeDasharray = len; l.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 700, easing: EASE.out, fill: 'both' }); });
      el.querySelectorAll('.gring').forEach((r) => { const len = Number(r.dataset.len), to = Number(r.dataset.off); r.animate([{ strokeDashoffset: len }, { strokeDashoffset: to }], { duration: 650, easing: EASE.out, fill: 'both' }); });
    }
    for (const el of scope.querySelectorAll('.fill[data-pct]')) {
      if (reduce()) continue;
      el.animate([{ width: '0%' }, { width: el.dataset.pct + '%' }], { duration: 600, delay: 100, easing: EASE.out, fill: 'both' });
    }
  }

  root.PatasMotion = { EASE, MOTION, prefs, reduce, countAll, resetCounts, open, push, toast, sound, buzz, reveal, pressable, chartsIn };
})(window);
