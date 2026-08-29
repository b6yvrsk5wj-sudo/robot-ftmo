// AUDIT : la stratégie MR live diverge-t-elle du backtest ?
// Live : 5 trades, +0.01R, 40% de réussite — le backtest annonce 81% et +0.219R/trade.
// Tous les trades live sont PETITS (gains 0.04-0.3R, pertes 0.07-0.14R) => sorties trop précoces ?
import { readFileSync } from 'node:fs';
import { INSTR, sma, rsi, atr, stats, loadData, fmtTable } from './lib.mjs';

// --- trades MR live ---
const log = JSON.parse(readFileSync(new URL('../ftmo_signals_log.json', import.meta.url)));
const opens = {}, live = [];
for (const e of log) {
  if (e.strategy !== 'MR') continue;
  const k = e.instrument;
  if (e.event === 'OPEN') opens[k] = e;
  else if (e.event === 'CLOSE' && opens[k]) {
    live.push({ instr: k, r: e.resultR, days: (new Date(e.time) - new Date(opens[k].time)) / 86400000, outcome: e.outcome });
    delete opens[k];
  }
}
console.log('=== TRADES MR LIVE ===');
for (const t of live) console.log(` ${t.instr.padEnd(6)} ${t.days.toFixed(1).padStart(4)}j  ${t.outcome.padEnd(6)} ${(t.r >= 0 ? '+' : '') + t.r}R`);
console.log(` moyenne : ${(live.reduce((a, t) => a + t.r, 0) / live.length).toFixed(3)}R sur ${(live.reduce((a, t) => a + t.days, 0) / live.length).toFixed(1)} jours`);

// --- backtest MR (mêmes règles) ---
const d = loadData('1d');
function runMR(bars, name) {
  const c = bars.map(x => x.c);
  const s200 = sma(c, 200), s5 = sma(c, 5), r2 = rsi(c, 2), a14 = atr(bars, 14);
  const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i];
    if (pos) {
      pos.held++;
      let x = null, why = '';
      if (bar.o <= pos.sl) { x = bar.o; why = 'SL'; } else if (bar.l <= pos.sl) { x = pos.sl; why = 'SL'; }
      else if (r2[i] > 65) { x = bar.c; why = 'RSI2>65'; }
      else if (bar.c > s5[i]) { x = bar.c; why = 'close>SMA5'; }
      else if (pos.held >= 10) { x = bar.c; why = '10 jours'; }
      if (x !== null) { out.push({ instr: name, r: (x - pos.entry) / pos.riskDist, days: pos.held, why }); pos = null; }
      continue;
    }
    if (s200[i] == null || a14[i] == null || r2[i] == null) continue;
    if (!(bar.c > s200[i] && r2[i] < 10)) continue;
    pos = { entry: bar.c, riskDist: 3 * a14[i], sl: bar.c - 3 * a14[i], held: 0 };
  }
  return out;
}
let bt = [];
for (const n of ['US500', 'US100', 'US30']) if (d[n]) bt = bt.concat(runMR(d[n], n));
const bt2y = bt.slice(-60); // ordre de grandeur récent

console.log('\n=== BACKTEST MR (25 ans) ===');
const w = bt.filter(t => t.r > 0), l = bt.filter(t => t.r <= 0);
console.log(` ${bt.length} trades | réussite ${(100 * w.length / bt.length).toFixed(0)}% | moyenne ${(bt.reduce((a, t) => a + t.r, 0) / bt.length).toFixed(3)}R | durée moy ${(bt.reduce((a, t) => a + t.days, 0) / bt.length).toFixed(1)}j`);
console.log(` gain moyen ${(w.reduce((a, t) => a + t.r, 0) / w.length).toFixed(2)}R | perte moyenne ${(l.reduce((a, t) => a + t.r, 0) / l.length).toFixed(2)}R`);

console.log('\n=== RÉPARTITION DES CAUSES DE SORTIE (backtest) ===');
const by = {};
for (const t of bt) { by[t.why] = by[t.why] || { n: 0, r: 0, d: 0 }; by[t.why].n++; by[t.why].r += t.r; by[t.why].d += t.days; }
console.log(fmtTable(Object.entries(by).map(([k, v]) => ({ cause: k, n: v.n, part: (100 * v.n / bt.length).toFixed(0) + '%', 'R moyen': (v.r / v.n).toFixed(2), 'jours moyens': (v.d / v.n).toFixed(1) }))));

console.log('\n=== LES 12 DERNIERS TRADES MR DU BACKTEST (période comparable) ===');
for (const t of bt.slice(-12)) console.log(` ${t.instr.padEnd(6)} ${String(t.days).padStart(3)}j  ${t.why.padEnd(11)} ${(t.r >= 0 ? '+' : '') + t.r.toFixed(2)}R`);
console.log(` moyenne des 60 derniers : ${(bt2y.reduce((a, t) => a + t.r, 0) / bt2y.length).toFixed(3)}R | réussite ${(100 * bt2y.filter(t => t.r > 0).length / bt2y.length).toFixed(0)}%`);
