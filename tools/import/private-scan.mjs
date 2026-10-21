// Phase 4 check 7: no personal data in anything git would publish. Reads the private names and figures
// from import/mapping.json and searches every tracked or committable file for them.
//   node tools/import/private-scan.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const m=JSON.parse(fs.readFileSync('import/mapping.json','utf8'));
const people=[...new Set(m.debts.map(d=>d.person))].filter(p=>!/^(SSS|Pag-Ibig|GCash|G-Cash|SLoan|SPay Later|LTO|GGives)$/.test(p));
// A private figure may also be written with thousands commas ("1234567.89" as "1,234,567.89"), so search both.
const commas=(w)=>{const [i,d]=w.split('.');const g=i.replace(/\B(?=(\d{3})+(?!\d))/g,',');return d===undefined?g:g+'.'+d;};
const raw=[...people,...(m.privateWords||[])];
const words=[...new Set([...raw,...raw.filter(w=>/^\d{4,}(\.\d+)?$/.test(w)).map(commas)])];
const files=execSync('git ls-files --cached --others --exclude-standard',{encoding:'utf8'}).trim().split('\n').filter(f=>!f.includes('node_modules')&&f!=='tools/import/private-scan.mjs'); // this file holds the CREDIT pattern below
// The owner's chosen public credit (as in Gastos, 2026-09-26): only these exact strings are allowed; his name
// anywhere else is still a hit.
const CREDIT=/Made by Joemark Basa|<meta name="author" content="Joemark Basa" \/>|Copyright \(c\) 2026 Joemark Basa|Contact: joemarkudemy@gmail\.com|Designed and built by Joemark Basa|MIT © 2026 Joemark Basa|com\.joemarkbasa\.patas/g;
let hits=0;for(const f of files){let s;try{s=fs.readFileSync(f,'utf8').replace(CREDIT,'')}catch{continue}for(const w of words){if(s.toLowerCase().includes(w.toLowerCase())){hits++;console.log('HIT',f,JSON.stringify(w));}}}
console.log('scanned',files.length,'files for',words.length,'private words: hits',hits);
process.exit(hits?1:0);
