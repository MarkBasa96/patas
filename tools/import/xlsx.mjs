// Reads an .xlsx file with no dependencies: a small zip reader (Node's zlib) plus just enough of the
// spreadsheet XML to get each cell's typed value, cached value, formula, hidden rows and cell notes.
// Read-only: it never writes the workbook.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

// ---- zip ----
export function unzip(path) {
  const buf = readFileSync(path);
  // End of central directory record: last 22+ bytes, signature 0x06054b50.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(local + 26), lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    files.set(name, () => (method === 0 ? raw : method === 8 ? inflateRawSync(raw) : (() => { throw new Error('zip method ' + method); })()));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { names: [...files.keys()], read: (name) => files.get(name)?.(), text: (name) => files.get(name)?.().toString('utf8') };
}

// ---- xml helpers (the files are machine-written; regex is enough and keeps this dependency-free) ----
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? unesc(m[1]) : undefined; };
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join('');

export function colToNum(col) { let n = 0; for (const c of col) n = n * 26 + c.charCodeAt(0) - 64; return n; }
export function splitRef(ref) { const m = ref.match(/^([A-Z]+)(\d+)$/); return { col: m[1], row: +m[2] }; }

// Excel date serial (1900 system) to YYYY-MM-DD. Times are dropped.
export function serialToDate(n) {
  const ms = Math.round((n - 25569) * 864e5);
  return new Date(ms).toISOString().slice(0, 10);
}

export function readWorkbook(path) {
  const z = unzip(path);
  const shared = [];
  const ss = z.text('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const rels = new Map();
  for (const m of z.text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)) rels.set(attr(m[0], 'Id'), attr(m[0], 'Target'));
  const sheets = [];
  for (const m of z.text('xl/workbook.xml').matchAll(/<sheet\s[^>]*>/g)) {
    const target = rels.get(attr(m[0], 'r:id'));
    sheets.push({ name: attr(m[0], 'name'), state: attr(m[0], 'state') || 'visible', file: 'xl/' + target.replace(/^\/?xl\//, '') });
  }

  // Date-looking number formats, so a cell's number can be told apart from a date serial.
  const styles = z.text('xl/styles.xml') || '';
  const customFmt = new Map([...styles.matchAll(/<numFmt\s[^>]*>/g)].map((m) => [+attr(m[0], 'numFmtId'), attr(m[0], 'formatCode')]));
  const cellXfs = (styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [, ''])[1];
  const xfIsDate = [...cellXfs.matchAll(/<xf\s[^>]*?\/?>/g)].map((m) => {
    const id = +attr(m[0], 'numFmtId');
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const code = customFmt.get(id);
    return !!code && /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0.,\s₱$"]*$/.test(code);
  });

  const book = new Map();
  for (const sh of sheets) {
    const xml = z.text(sh.file);
    const cells = new Map();
    const hiddenRows = new Set();
    for (const r of xml.matchAll(/<row\s[^>]*>/g)) if (attr(r[0], 'hidden') === '1') hiddenRows.add(+attr(r[0], 'r'));
    for (const c of xml.matchAll(/<c\s([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = '<c ' + c[1] + '>';
      const ref = attr(tag, 'r');
      const t = attr(tag, 't');
      const s = attr(tag, 's');
      const inner = c[3] || '';
      const f = (inner.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/) || [])[1];
      const vRaw = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let value;
      if (t === 's') value = shared[+vRaw];
      else if (t === 'inlineStr') value = textOf(inner);
      else if (t === 'str') value = vRaw === undefined ? undefined : unesc(vRaw);
      else if (t === 'b') value = vRaw === '1';
      else if (t === 'e') value = { error: vRaw };
      else if (vRaw !== undefined) value = Number(vRaw);
      const isDate = typeof value === 'number' && s !== undefined && xfIsDate[+s];
      if (value === undefined && f === undefined) continue;
      cells.set(ref, { ref, value, formula: f === undefined ? undefined : unesc(f), date: isDate ? serialToDate(value) : undefined });
    }
    // Cell notes live in a comments part linked from the sheet's rels.
    const notes = new Map();
    const relPath = sh.file.replace(/worksheets\/([^/]+)$/, 'worksheets/_rels/$1.rels');
    const relXml = z.text(relPath);
    if (relXml) for (const m of relXml.matchAll(/<Relationship\s[^>]*>/g)) {
      const target = attr(m[0], 'Target');
      if (/comments/i.test(target)) {
        const cx = z.text('xl/' + target.replace(/^\.\.\//, '').replace(/^\/?xl\//, ''));
        if (cx) for (const cm of cx.matchAll(/<comment\s([^>]*)>([\s\S]*?)<\/comment>/g)) notes.set(attr('<c ' + cm[1] + '>', 'ref'), textOf(cm[2]).trim());
      }
    }
    book.set(sh.name, { ...sh, cells, hiddenRows, notes });
  }
  return { sheets: book, zip: z };
}
