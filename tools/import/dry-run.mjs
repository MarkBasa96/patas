// Patas importer, DRY RUN. Reads the owner's exported spreadsheets (read-only) and a private mapping
// file, builds the rows Patas would store, reconciles them against the spreadsheet's own totals, and
// writes a preview. It writes nothing anywhere else: no database, no network.
//   node tools/import/dry-run.mjs [import/mapping.json]
// Inputs and outputs live in import/, which git ignores (real names and money).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readWorkbook, unzip } from './xlsx.mjs';
import { balance, split, pesos, fmt } from './balance.mjs';

const mappingPath = process.argv[2] || 'import/mapping.json';
const M = JSON.parse(readFileSync(mappingPath, 'utf8'));
const books = Object.fromEntries(Object.entries(M.files).map(([k, p]) => [k, readWorkbook(p)]));
const flags = [];       // things a person must look at
const claimed = new Set(); // every money/tick cell a source read: file:sheet!A1
const claim = (file, sheet, col, row) => claimed.add(`${file}:${sheet}!${col}${row}`);
const counts = [];      // source rows imported, per source
const h = (s) => createHash('sha256').update(s).digest('base64url').slice(0, 20);

function cell(file, sheet, col, row) {
  const sh = books[file].sheets.get(sheet);
  if (!sh) throw new Error(`no sheet ${sheet} in ${file}`);
  return { ...(sh.cells.get(`${col}${row}`) || {}), note: sh.notes.get(`${col}${row}`) };
}
function cents(v, where) {
  if (typeof v !== 'number') throw new Error(`${where}: expected a number, got ${JSON.stringify(v)}`);
  const c = Math.round(v * 100);
  if (Math.abs(v * 100 - c) > 1e-6) flags.push(`${where}: ${v} is not a whole centavo; rounded to ${fmt(c)}`);
  return c;
}
function dateOf(c, where) {
  if (c.date) return c.date;
  if (typeof c.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.value)) return c.value;
  return null;
}
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
const clip = (text, max, where) => {
  const t = (text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim();
  if (t.length > max) { flags.push(`${where}: note longer than ${max} characters, shortened`); return t.slice(0, max - 1) + '…'; }
  return t;
};

const U = M.utang;
const out = { debts: [], installments: [], lines: [] };
const report = [];
let tick = 0;
const createdAt = () => 1760000000000 + tick++;   // fixed base so re-runs are identical

for (const d of M.debts) {
  const uRow = d.utangRow;
  const uDate = dateOf(cell(U.file, U.sheet, 'A', uRow));
  const debtId = 'd' + h(`debt:${d.key}`);
  const opened = uDate;
  const debtNotes = ['D', 'E', 'F'].map((c) => cell(U.file, U.sheet, c, uRow).note).filter(Boolean);
  const lines = [];
  const inst = [];
  const tags = new Map();
  const assumed = [];
  const addLine = (l, tag, sourceKey) => {
    const line = { id: 'l' + h(sourceKey), debt_id: debtId, kind: l.kind, charge_kind: null, adjust_sign: l.adjust_sign ?? null,
      amount_centavos: l.amount, on_date: l.on_date, note: clip(l.note, 300, sourceKey), source_key: sourceKey, created_at: createdAt(), deleted: false };
    if (!(line.amount_centavos > 0)) throw new Error(`${sourceKey}: amount must be positive`);
    lines.push(line); tags.set(line.id, tag);
  };

  for (const [si, s] of d.sources.entries()) {
    const where = `${d.key} source ${si + 1}`;
    if (s.type === 'principal') {
      addLine({ kind: 'principal', amount: pesos(s.amount), on_date: opened, note: s.note || '' }, s.tag, `${d.key}:principal`);
    } else if (s.type === 'line') {
      const amount = pesos(s.amount);
      addLine({ kind: s.kind, adjust_sign: s.kind === 'adjustment' ? s.sign : null, amount, on_date: opened, note: s.note }, s.tag, `${d.key}:line:${si}`);
      if (s.assumed) assumed.push(`${s.note}: ${s.assumed}`);
    } else if (s.type === 'ledger') {
      let n = 0;
      for (let r = s.rows[0]; r <= s.rows[1]; r++) {
        const a = cell(s.file, s.sheet, s.amount, r);
        claim(s.file, s.sheet, s.amount, r);
        if (a.value === undefined || a.value === '' || a.value === 0) continue;
        const date = dateOf(cell(s.file, s.sheet, s.date, r));
        if (!date) { flags.push(`${where}: ${s.sheet}!${s.date}${r} has no usable date; row skipped`); continue; }
        const desc = cell(s.file, s.sheet, s.desc, r);
        const c = cents(a.value, `${s.sheet}!${s.amount}${r}`);
        const note = [desc.value, desc.note, a.note].filter(Boolean).join(' / ');
        addLine({ kind: c > 0 ? 'addition' : 'payment', amount: Math.abs(c), on_date: date, note }, s.tag, `${s.file}:${s.sheet}!${s.amount}${r}`);
        lines.at(-1).ledgerSigned = c;
        n++;
      }
      counts.push({ debt: d.key, source: `${s.sheet}!${s.amount}${s.rows[0]}:${s.amount}${s.rows[1]} ledger`, rows: n });
    } else if (s.type === 'ticks') {
      let n = 0;
      const parts = s.splitTotal ? split(pesos(s.splitTotal), s.splitCount) : null;
      for (let r = s.rows[0]; r <= s.rows[1]; r++) {
        claim(s.file, s.sheet, s.tick, r);
        if (cell(s.file, s.sheet, s.tick, r).value !== true) continue;
        const date = dateOf(cell(s.file, s.sheet, s.date, r));
        if (!date) { flags.push(`${where}: tick at ${s.sheet}!${s.tick}${r} has no date; skipped`); continue; }
        const amount = parts ? parts[n] : pesos(s.each);
        addLine({ kind: 'payment', amount, on_date: date, note: s.note || '' }, s.tag, `${s.file}:${s.sheet}!${s.tick}${r}`);
        n++;
      }
      counts.push({ debt: d.key, source: `${s.sheet}!${s.tick}${s.rows[0]}:${s.tick}${s.rows[1]} ticks`, rows: n });
    } else if (s.type === 'payments') {
      let n = 0;
      for (let r = s.rows[0]; r <= s.rows[1]; r++) {
        const a = cell(s.file, s.sheet, s.amount, r);
        claim(s.file, s.sheet, s.amount, r);
        if (typeof a.value !== 'number' || a.value === 0) continue;
        const dc = cell(s.file, s.sheet, s.date, r);
        const date = dateOf(dc);
        if (!date) { flags.push(`${where}: ${s.sheet}!${s.date}${r} has no usable date; row skipped`); continue; }
        addLine({ kind: 'payment', amount: cents(a.value, `${s.sheet}!${s.amount}${r}`), on_date: date, note: [a.note, dc.note].filter(Boolean).join(' / ') }, s.tag, `${s.file}:${s.sheet}!${s.amount}${r}`);
        n++;
      }
      counts.push({ debt: d.key, source: `${s.sheet}!${s.amount}${s.rows[0]}:${s.amount}${s.rows[1]} payments`, rows: n });
    } else if (s.type === 'plan' || s.type === 'plan-paid-only') {
      let n = 0, p = 0;
      for (let r = s.rows[0]; r <= s.rows[1]; r++) {
        const a = cell(s.file, s.sheet, s.amount, r);
        claim(s.file, s.sheet, s.amount, r);
        if (typeof a.value !== 'number') continue;
        const due = dateOf(cell(s.file, s.sheet, s.due, r));
        const amount = cents(a.value, `${s.sheet}!${s.amount}${r}`);
        if (s.type === 'plan') {
          inst.push({ id: 'i' + h(`${s.file}:${s.sheet}!${s.amount}${r}`), debt_id: debtId, seq: n + 1, due_on: due, amount_centavos: amount,
            source_key: `${s.file}:${s.sheet}!${s.amount}${r}`, created_at: createdAt(), deleted: false });
        }
        n++;
        claim(s.file, s.sheet, s.paid, r);
        if (cell(s.file, s.sheet, s.paid, r).value === true) {
          const paidOn = dateOf(cell(s.file, s.sheet, s.paidDate, r));
          if (!paidOn) assumed.push(`${s.sheet} row ${r}: ticked paid with no paid date; dated on its due date ${due}`);
          addLine({ kind: 'payment', amount, on_date: paidOn || due, note: `Due ${due}` }, s.tag, `${s.file}:${s.sheet}!${s.paid}${r}`);
          p++;
        }
      }
      counts.push({ debt: d.key, source: `${s.sheet}!${s.amount}${s.rows[0]}:${s.amount}${s.rows[1]} ${s.type}`, rows: n, paid: p });
    } else throw new Error(`${where}: unknown source type ${s.type}`);
  }

  if (d.plan) {
    const parts = split(pesos(d.plan.total), d.plan.count);
    parts.forEach((amount, i) => inst.push({ id: 'i' + h(`${d.key}:plan:${i + 1}`), debt_id: debtId, seq: i + 1, due_on: addMonths(d.plan.start, i),
      amount_centavos: amount, source_key: `${d.key}:plan:${i + 1}`, created_at: createdAt(), deleted: false }));
    if (d.plan.assumed) assumed.push(d.plan.assumed);
  }

  const settledOn = d.settled ? lines.map((l) => l.on_date).sort().at(-1) : null;
  const debt = { id: debtId, direction: 'i_owe', kind: d.kind, person_name: d.person, title: d.title, due_on: null, opened_on: opened,
    settled_on: settledOn, remind: !d.settled, qr_id: null, note: clip(debtNotes.join(' / '), 500, `${d.key} note`), source_key: `debt:${d.key}`,
    created_at: createdAt(), deleted: false };
  const b = balance(debt, inst, lines);

  // Recompute the spreadsheet's own AMOUNT / PAID / REMAINING from the rows, by what each line fed.
  const credit = (l) => l.kind === 'payment' || l.kind === 'writeoff' || (l.kind === 'adjustment' && l.adjust_sign === -1);
  const planTotal = inst.reduce((s, i) => s + i.amount_centavos, 0);
  const amountRecalc = planTotal + lines.filter((l) => tags.get(l.id) === 'amount').reduce((s, l) => s + (credit(l) ? -1 : 1) * l.amount_centavos, 0);
  const paidRecalc = lines.filter((l) => tags.get(l.id) === 'paid').reduce((s, l) => s + (credit(l) ? 1 : -1) * l.amount_centavos, 0);
  const uv = (c) => { const v = cell(U.file, U.sheet, c, uRow).value; return typeof v === 'number' ? cents(v, `UTANG!${c}${uRow}`) : 0; };
  let uAmount = uv(U.amount);
  const uPaid = uv(U.paid), uRem = uv(U.remaining);
  // The owner may supply a figure the Sheet never had; it is shown, never hidden.
  if (d.sheetAmountOverride) {
    if (uAmount !== 0) throw new Error(`${d.key}: sheetAmountOverride given but the Sheet has an amount (${fmt(uAmount)})`);
    uAmount = pesos(d.sheetAmountOverride.amount);
    assumed.push(`Sheet amount was blank; using ${fmt(uAmount)} (${d.sheetAmountOverride.why})`);
  }
  const ref = M.reference.remaining[d.key] !== undefined ? pesos(M.reference.remaining[d.key]) : null;
  const ledgerNetRef = M.reference.ledgerNet[d.key] !== undefined ? pesos(M.reference.ledgerNet[d.key]) : null;
  const ledgerNet = lines.filter((l) => l.ledgerSigned !== undefined).reduce((s, l) => s + l.ledgerSigned, 0);
  for (const l of lines) delete l.ledgerSigned;

  report.push({ key: d.key, person: d.person, title: d.title, kind: d.kind, settled: !!d.settled, opened, settledOn,
    owed: b.owed, paid: b.paid, remaining: b.remaining, overpaid: b.overpaid, statuses: b.statuses,
    uAmount, uPaid, uRem, amountRecalc, paidRecalc, ref, ledgerNet, ledgerNetRef, lines: lines.length, installments: inst.length,
    assumed, unmapped: d.unmapped || null, decided: d.decided || d.plan?.decided || null });
  out.debts.push(debt); out.installments.push(...inst); out.lines.push(...lines);
}

// ---------- QR images: which picture sits under which label (by its anchor cell, never by file order) ----------
const qr = [];
{
  const z = books.E.zip;
  const wb = z.text('xl/workbook.xml'), wbRels = z.text('xl/_rels/workbook.xml.rels');
  const rid = [...wb.matchAll(/<sheet [^>]*name="QR Codes"[^>]*r:id="([^"]+)"/g)][0]?.[1];
  const sheetFile = 'xl/' + wbRels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))[1].replace(/^\/?xl\//, '');
  const sRels = z.text(sheetFile.replace(/worksheets\/([^/]+)$/, 'worksheets/_rels/$1.rels'));
  const drawing = 'xl/' + sRels.match(/Target="\.\.\/(drawings\/drawing\d+\.xml)"/)[1];
  const dRels = new Map([...z.text(drawing.replace(/drawings\/([^/]+)$/, 'drawings/_rels/$1.rels')).matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sh = books.E.sheets.get('QR Codes');
  const labels = [...sh.cells.values()].filter((c) => typeof c.value === 'string').map((c) => ({ ref: c.ref, col: c.ref.match(/[A-Z]+/)[0], row: +c.ref.match(/\d+/)[0], text: c.value }));
  const colN = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  for (const a of z.text(drawing).matchAll(/<xdr:(?:oneCellAnchor|twoCellAnchor)>([\s\S]*?)<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/g)) {
    const col = +a[1].match(/<xdr:from><xdr:col>(\d+)<\/xdr:col>/)[1] + 1;
    const row = +a[1].match(/<xdr:row>(\d+)<\/xdr:row>/)[1] + 1;
    const media = (dRels.get(a[1].match(/r:embed="([^"]+)"/)?.[1]) || '').replace(/^\.\.\//, 'xl/');
    const band = labels.filter((l) => l.row <= row).reduce((m, l) => Math.max(m, l.row), 0);
    const label = labels.filter((l) => l.row === band && colN(l.col) <= col).sort((x, y) => colN(y.col) - colN(x.col))[0];
    qr.push({ anchor: `${String.fromCharCode(64 + col)}${row}`, label: label?.text || '(no label)', media });
  }
}

// ---------- write preview ----------
const preview = JSON.stringify(out, null, 1);
writeFileSync('import/preview.json', preview);
const digest = createHash('sha256').update(preview).digest('hex').slice(0, 16);

const active = report.filter((r) => !r.settled), settled = report.filter((r) => r.settled);
const ok = (a, b) => (a === b ? 'ok' : `DIFF ${fmt(a - b)}`);
const md = [];
md.push(`# Patas import preview (dry run)\n\nNothing was written to any database. Preview digest \`${digest}\`.\n`);
md.push(`## Still owed (${active.length})\n\n| Who | What | Type | Owed | Paid | Left | Sheet says left | Check |\n|---|---|---|---:|---:|---:|---:|---|`);
for (const r of active) md.push(`| ${r.person} | ${r.title} | ${r.kind === 'installments' ? `installments (${r.installments})` : 'one-time'} | ${fmt(r.owed)} | ${fmt(r.paid)} | ${fmt(r.remaining)} | ${fmt(r.uRem)} | ${ok(r.remaining, r.uRem)}${r.ref !== null ? `, reference ${ok(r.remaining, r.ref)}` : ''} |`);
const total = active.reduce((s, r) => s + r.remaining, 0);
md.push(`| **Total** | | | | | **${fmt(total)}** | ${fmt(pesos(M.reference.total))} | ${ok(total, pesos(M.reference.total))} |\n`);
md.push(`## Settled (${settled.length})\n\n| Who | What | Owed | Paid | Left | Settled on | Check |\n|---|---|---:|---:|---:|---|---|`);
for (const r of settled) md.push(`| ${r.person} | ${r.title} | ${fmt(r.owed)} | ${fmt(r.paid)} | ${fmt(r.remaining)} | ${r.settledOn} | ${r.remaining === 0 && r.overpaid === 0 ? 'ok' : `NOT ZERO (left ${fmt(r.remaining)}, over ${fmt(r.overpaid)})`} |`);
md.push(`\n## Recalculated from the rows vs the Sheet's own numbers\n\n| Who | What | Amount: rows / Sheet | Paid: rows / Sheet |\n|---|---|---|---|`);
for (const r of report) md.push(`| ${r.person} | ${r.title} | ${fmt(r.amountRecalc)} / ${fmt(r.uAmount)} ${ok(r.amountRecalc, r.uAmount)} | ${fmt(r.paidRecalc)} / ${fmt(r.uPaid)} ${ok(r.paidRecalc, r.uPaid)} |`);
md.push(`\n## Ledger tabs\n`);
for (const r of report.filter((x) => x.ledgerNetRef !== null)) md.push(`- ${r.person}, ${r.title}: lines net ${fmt(r.ledgerNet)}, expected ${fmt(r.ledgerNetRef)}: ${ok(r.ledgerNet, r.ledgerNetRef)}`);
md.push(`\n## Rows imported per source\n\n| Debt | Source | Rows |\n|---|---|---:|`);
for (const c of counts) md.push(`| ${c.debt} | ${c.source} | ${c.rows}${c.paid !== undefined ? ` (${c.paid} paid)` : ''} |`);
md.push(`\n## Installment status (worked out, not stored)\n`);
for (const r of report.filter((x) => x.statuses.length && !x.settled)) {
  md.push(`- **${r.person}, ${r.title}:** ` + r.statuses.map((s) => `#${s.seq} ${s.due_on} ${fmt(s.amount)} ${s.status}${s.short && s.covered ? ` (${fmt(s.short)} short)` : ''}`).join('; '));
}
md.push(`\n## Needs your answer, your answers, and what stays out (nothing guessed)\n`);
for (const r of report.filter((x) => x.unmapped)) md.push(`- **${r.person}, ${r.title}:** ${r.unmapped}`);
for (const x of M.heldOut) md.push(`- **Not imported:** ${x.what}`);
for (const r of report.filter((x) => x.decided)) md.push(`- **Decided:** ${r.person}, ${r.title}: ${r.decided}`);
md.push(M.ownQrDecision ? `- **QR codes (decided):** ${qr.length} pictures. ${M.ownQrDecision}` : `- **QR codes:** ${qr.length} pictures found. Your own (labels starting "${M.ownQrPrefix}") are for collecting, not paying; keep them in the gallery or leave them out?`);
md.push(`\n## Assumed (marked, easy to change)\n`);
for (const r of report) for (const a of r.assumed) md.push(`- ${r.person}, ${r.title}: ${a}`);
md.push(`\n## QR pictures by label (anchor cell; images not opened)\n\n| Label | Cell | File |\n|---|---|---|`);
for (const q of qr.sort((a, b) => a.label.localeCompare(b.label))) md.push(`| ${q.label} | ${q.anchor} | ${q.media.replace('xl/media/', '')} |`);
if (flags.length) { md.push(`\n## Flags\n`); for (const f of flags) md.push(`- ${f}`); }
md.push(`\n## Totals\n\n${out.debts.length} debts, ${out.installments.length} installments, ${out.lines.length} lines.`);
writeFileSync('import/preview.md', md.join('\n') + '\n');

// ---------- console summary (the checks) ----------
const fails = [];
for (const r of active) {
  if (r.remaining !== r.uRem) fails.push(`${r.key}: left ${fmt(r.remaining)} vs Sheet ${fmt(r.uRem)}`);
  if (r.ref !== null && r.remaining !== r.ref) fails.push(`${r.key}: left ${fmt(r.remaining)} vs reference ${fmt(r.ref)}`);
}
if (total !== pesos(M.reference.total)) fails.push(`total ${fmt(total)} vs reference ${M.reference.total}`);
for (const r of settled) if (r.remaining !== 0 || r.overpaid !== 0) fails.push(`${r.key}: settled but left ${fmt(r.remaining)}, over ${fmt(r.overpaid)}`);
for (const r of report) {
  if (r.amountRecalc !== r.uAmount) fails.push(`${r.key}: amount from rows ${fmt(r.amountRecalc)} vs Sheet ${fmt(r.uAmount)}`);
  if (r.paidRecalc !== r.uPaid) fails.push(`${r.key}: paid from rows ${fmt(r.paidRecalc)} vs Sheet ${fmt(r.uPaid)}`);
  if (r.ledgerNetRef !== null && r.ledgerNet !== r.ledgerNetRef) fails.push(`${r.key}: ledger net ${fmt(r.ledgerNet)} vs ${fmt(r.ledgerNetRef)}`);
}
// Coverage: every typed number or tick in the listed money columns must be claimed by a source or ignored.
const inRange = (spec, sheetKey, col, row) => { const m = spec.match(/^(\w):(.+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/); return m && `${m[1]}:${m[2]}` === sheetKey && m[3] === col && row >= +m[4] && row <= +m[6]; };
const unclaimed = [];
for (const [sheetKey, cols] of Object.entries(M.coverage || {})) {
  if (sheetKey.startsWith('_')) continue;
  const [file, sheet] = sheetKey.split(':');
  for (const c of books[file].sheets.get(sheet).cells.values()) {
    const col = c.ref.match(/[A-Z]+/)[0], row = +c.ref.match(/\d+/)[0];
    if (!cols.includes(col) || c.formula !== undefined) continue;
    const money = (typeof c.value === 'number' && c.value !== 0 && !c.date) || c.value === true;
    if (!money || claimed.has(`${file}:${sheet}!${c.ref}`)) continue;
    if (Object.keys(M.coverageIgnore || {}).some((k) => inRange(k, sheetKey, col, row))) continue;
    unclaimed.push(`${sheet}!${c.ref} = ${JSON.stringify(c.value)}`);
  }
}
for (const u of unclaimed) fails.push(`not imported and not ignored: ${u}`);
console.log(`coverage: ${claimed.size} money/tick cells read, ${unclaimed.length} unclaimed`);
const keys = [...out.debts, ...out.installments, ...out.lines].map((x) => x.source_key);
if (new Set(keys).size !== keys.length) fails.push('duplicate source keys');
const ids = [...out.debts, ...out.installments, ...out.lines].map((x) => x.id);
if (new Set(ids).size !== ids.length) fails.push('duplicate ids');
console.log(`debts ${out.debts.length} (active ${active.length}, settled ${settled.length}), installments ${out.installments.length}, lines ${out.lines.length}`);
console.log(`total left ${fmt(total)} (reference ${M.reference.total})`);
console.log(`needs an answer: ${report.filter((x) => x.unmapped).length} debts + ${M.heldOut.length} held out; assumed: ${report.reduce((s, r) => s + r.assumed.length, 0)}; flags: ${flags.length}; QR pictures: ${qr.length}`);
console.log(`preview digest ${digest}`);
console.log(fails.length ? `RECONCILE FAILED (${fails.length}):\n  ` + fails.join('\n  ') : 'RECONCILE OK: every figure matches to the centavo');
process.exit(fails.length ? 1 : 0);
