// PISTE : dans le backtest, la sortie "close>SMA5" ne rapporte que +0.10R alors que "RSI2>65" rapporte +0.30R.
// Faut-il supprimer la sortie close>SMA5 ? Test avec validation par sous-période (anti-overfit).
import { INSTR, sma, rsi, atr, stats, byPeriod, loadData, fmtTable, COST_PTS } from './lib.mjs';

function runMR(bars, name, { useSMA5 = true, useRSI = true, maxHold = 10 } = {}) {
  const c = bars.map(x => x.c);
  const s200 = sma(c, 200), s5 = sma(c, 5), r2 = rsi(c, 2), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i];
    if (pos) {
      pos.held++;
      let x = null;
      if (bar.o <= pos.sl) x = bar.o; else if (bar.l <= pos.sl) x = pos.sl;
      else if (useRSI && r2[i] > 65) x = bar.c;
      else if (useSMA5 && bar.c > s5[i]) x = bar.c;
      else if (pos.held >= maxHold) x = bar.c;
      if (x !== null) {
        out.push({ instr: name, dir: 1, entryT: pos.entryT, exitT: bar.t, r: (x - pos.entry) / pos.riskDist - cost / pos.riskDist });
        pos = null;
      }
      continue;
    }
    if (s200[i] == null || a14[i] == null || r2[i] == null) continue;
    if (!(bar.c > s200[i] && r2[i] < 10)) continue;
    pos = { entry: bar.c, entryT: bar.t, riskDist: 3 * a14[i], sl: bar.c - 3 * a14[i], held: 0 };
  }
  return out;
}

const d = loadData('1d');
const IDX = ['US500', 'US100', 'US30'];
const VAR = [
  ['ACTUEL (RSI2>65 ou SMA5 ou 10j)', {}],
  ['sans close>SMA5 (RSI2 ou 10j)', { useSMA5: false }],
  ['sans RSI2 (SMA5 ou 10j)', { useRSI: false }],
  ['RSI2 seul, max 5j', { useSMA5: false, maxHold: 5 }],
  ['RSI2 seul, max 15j', { useSMA5: false, maxHold: 15 }],
];
console.log('===== VARIANTES DE SORTIE MR — 25 ANS, 3 INDICES =====');
const rows = [];
const keep = {};
for (const [lb, opt] of VAR) {
  let all = [];
  for (const n of IDX) if (d[n]) all = all.concat(runMR(d[n], n, opt));
  keep[lb] = all;
  rows.push({ variante: lb, ...stats(all), 'R/an': (stats(all).totalR / 25).toFixed(2) });
}
console.log(fmtTable(rows));

console.log('\n===== VALIDATION PAR SOUS-PÉRIODE (le test qui tue les fausses idées) =====');
for (const lb of ['ACTUEL (RSI2>65 ou SMA5 ou 10j)', 'sans close>SMA5 (RSI2 ou 10j)']) {
  console.log(`\n--- ${lb} ---`);
  console.log(fmtTable(byPeriod(keep[lb], [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]])));
}

console.log('\n===== PAR INSTRUMENT (variante sans SMA5) =====');
const pi = [];
for (const n of IDX) { if (!d[n]) continue; const t = runMR(d[n], n, { useSMA5: false }); const b = runMR(d[n], n, {}); pi.push({ instr: n, 'R actuel': stats(b).totalR, 'R sans SMA5': stats(t).totalR, 'PF actuel': stats(b).pf, 'PF sans SMA5': stats(t).pf }); }
console.log(fmtTable(pi));
