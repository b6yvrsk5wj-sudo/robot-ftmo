// L'effet TOURNANT DE MOIS (+1.82R/an net de swaps, positif sur les 4 sous-périodes) est le premier
// candidat sérieux depuis MR-A. Et il est complémentaire : MR était PLATE en 2015-2020, lui a fait +20.4R.
// On teste ici le portefeuille MR-A + tournant de mois, et sa capacité à passer un challenge.
import { INSTR, COST_PTS, sma, rsi, atr, stats, byPeriod, monthlyR, correlation, loadData, fmtTable } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const sw = (i, dir, px, rk, ms) => (REAL_RATES[i][dir === 1 ? 'L' : 'S'] / 100) * (px / rk) * ((ms / 86400000) * WED);
const mk = (out, name, dir, pos, exitT, x) => out.push({ instr: name, dir, entryT: pos.entryT, exitT, r: dir * (x - pos.entry) / pos.risk - COST_PTS[name] / pos.risk + sw(name, dir, pos.entry, pos.risk, exitT - pos.entryT) });

function mra(b, name) {
  const c = b.map(x => x.c), s200 = sma(c, 200), r2 = rsi(c, 2), a = atr(b, 14);
  const out = []; let pos = null;
  for (let i = 201; i < b.length; i++) {
    if (pos) { pos.held++; let x = null;
      if (b[i].o <= pos.sl) x = b[i].o; else if (b[i].l <= pos.sl) x = pos.sl; else if (r2[i] > 65 || pos.held >= 10) x = b[i].c;
      if (x !== null) { mk(out, name, 1, pos, b[i].t, x); pos = null; } continue; }
    if (s200[i] == null || a[i] == null || r2[i] == null) continue;
    if (b[i].c > s200[i] && r2[i] < 10) { const risk = 3 * a[i]; pos = { dir: 1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk, held: 0 }; }
  }
  return out;
}
// tournant de mois, avec option filtre de tendance
function tom(b, name, { filtre = false, hold = 4 } = {}) {
  const c = b.map(x => x.c), a = atr(b, 14), s200 = sma(c, 200);
  const out = []; let pos = null, held = 0;
  for (let i = 201; i < b.length - 1; i++) {
    if (pos) { held++; if (held >= hold || b[i].l <= pos.sl) { mk(out, name, 1, pos, b[i].t, b[i].l <= pos.sl ? pos.sl : b[i].c); pos = null; } continue; }
    if (a[i] == null) continue;
    if (filtre && (s200[i] == null || b[i].c < s200[i])) continue;
    if (new Date(b[i].t).getUTCMonth() !== new Date(b[i + 1].t).getUTCMonth()) { const risk = 3 * a[i]; pos = { dir: 1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk }; held = 0; }
  }
  return out;
}

const d = loadData('1d');
const build = (fn, opt) => { let o = []; for (const [, n] of INSTR) if (d[n]) o = o.concat(fn(d[n], n, opt)); return o.sort((a, b) => a.exitT - b.exitT); };
const MR = build(mra), TOM = build(tom), TOMF = build(tom, { filtre: true }), TOM6 = build(tom, { hold: 6 });

console.log('===== VARIANTES DU TOURNANT DE MOIS (25 ans, net swaps) =====');
console.log(fmtTable([
  { variante: 'brut (4 jours)', ...stats(TOM), 'R/an': (stats(TOM).totalR / 25).toFixed(2) },
  { variante: 'filtré (> SMA200)', ...stats(TOMF), 'R/an': (stats(TOMF).totalR / 25).toFixed(2) },
  { variante: 'tenue 6 jours', ...stats(TOM6), 'R/an': (stats(TOM6).totalR / 25).toFixed(2) },
]));

const best = [['brut', TOM], ['filtré', TOMF], ['6j', TOM6]].sort((a, b) => stats(b[1]).totalR - stats(a[1]).totalR)[0];
console.log(`\nMeilleure variante : ${best[0]}`);
console.log(fmtTable(byPeriod(best[1], [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]])));

console.log('\n===== PORTEFEUILLE MR-A + TOURNANT DE MOIS =====');
const COMBO = [...MR, ...best[1]].sort((a, b) => a.exitT - b.exitT);
console.log(fmtTable([
  { système: 'MR-A seule', ...stats(MR), 'R/an': (stats(MR).totalR / 25).toFixed(2) },
  { système: 'Tournant de mois seul', ...stats(best[1]), 'R/an': (stats(best[1]).totalR / 25).toFixed(2) },
  { système: 'COMBINÉ', ...stats(COMBO), 'R/an': (stats(COMBO).totalR / 25).toFixed(2) },
]));
console.log(`\nCorrélation mensuelle entre les deux : ${correlation(monthlyR(MR), monthlyR(best[1]))}`);
console.log('\nCombiné par sous-période :');
console.log(fmtTable(byPeriod(COMBO, [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]])));

// challenge : +10% avant -10%
function challenge(seq, risk, sims = 30000) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000), pm = seq.length / span;
  const months = []; let pass = 0;
  for (let s = 0; s < sims; s++) {
    let i = Math.floor(Math.random() * seq.length); const st = i;
    let eq = 0, cur = '', ds = 0; const cap = i + seq.length * 8;
    while (i < cap) {
      const k = new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + (i / seq.length | 0);
      if (k !== cur) { cur = k; ds = 0; }
      const r = seq[i % seq.length].r * risk; eq += r; ds += r; i++;
      if (ds <= -5 || eq <= -10) break;
      if (eq >= 10) { pass++; months.push((i - st) / pm); break; }
    }
  }
  months.sort((a, b) => a - b);
  return { 'réussite': (100 * pass / sims).toFixed(0) + '%', 'médiane': months.length ? months[months.length / 2 | 0].toFixed(1) + ' mois' : '-' };
}
console.log('\n===== PASSAGE DE CHALLENGE (+10% avant -10%) =====');
const rows = [];
for (const [lb, s] of [['MR-A seule', MR], ['Tournant de mois', best[1]], ['COMBINÉ', COMBO]])
  for (const r of [1, 1.5, 2]) rows.push({ système: lb, risque: r + '%', ...challenge(s, r) });
console.log(fmtTable(rows));
