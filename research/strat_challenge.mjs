// L'UTILISATEUR A RAISON : passer un challenge n'est PAS le même problème que gérer un compte financé.
// Challenge = atteindre +10% AVANT -10%. Ce qui compte : taux de réussite élevé + petit drawdown + fréquence.
// Le trend (31% de réussite, séries de 11 pertes) est structurellement mauvais pour ça. MR (74%) est mieux armée.
// On teste ici des variantes de MR à fréquence accrue, dédiées au challenge.
import { INSTR, COST_PTS, sma, rsi, atr, stats, byPeriod, loadData, fmtTable } from './lib.mjs';

// MR paramétrable : seuil d'entrée, seuil de sortie, panier
function runMR(bars, name, { entry = 10, exitRsi = 65, maxHold = 10 } = {}) {
  const c = bars.map(x => x.c);
  const s200 = sma(c, 200), r2 = rsi(c, 2), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const b = bars[i];
    if (pos) {
      pos.held++;
      let x = null;
      if (b.o <= pos.sl) x = b.o; else if (b.l <= pos.sl) x = pos.sl;
      else if (r2[i] > exitRsi || pos.held >= maxHold) x = b.c;
      if (x !== null) { out.push({ instr: name, dir: 1, entryT: pos.entryT, exitT: b.t, r: (x - pos.entry) / pos.riskDist - cost / pos.riskDist }); pos = null; }
      continue;
    }
    if (s200[i] == null || a14[i] == null || r2[i] == null) continue;
    if (!(b.c > s200[i] && r2[i] < entry)) continue;
    pos = { entry: b.c, entryT: b.t, riskDist: 3 * a14[i], sl: b.c - 3 * a14[i], held: 0 };
  }
  return out;
}

const d = loadData('1d');
const IDX = ['US500', 'US100', 'US30'], ALL = ['US500', 'US100', 'US30', 'XAUUSD'];
const mk = (opt, ins) => { let o = []; for (const n of ins) if (d[n]) o = o.concat(runMR(d[n], n, opt)); return o.sort((a, b) => a.exitT - b.exitT); };

// probabilité d'atteindre +cible avant -limite, et durée (Monte Carlo sur la séquence)
function challenge(seq, risk, target = 10, limit = 10, dayLim = 5, sims = 30000) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
  const pm = seq.length / span;
  const months = []; let pass = 0;
  for (let s = 0; s < sims; s++) {
    let i = Math.floor(Math.random() * seq.length); const st = i;
    let eq = 0, cur = '', ds = 0; const cap = i + seq.length * 8;
    while (i < cap) {
      const k = new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + (i / seq.length | 0);
      if (k !== cur) { cur = k; ds = 0; }
      const r = seq[i % seq.length].r * risk; eq += r; ds += r; i++;
      if (ds <= -dayLim || eq <= -limit) break;
      if (eq >= target) { pass++; months.push((i - st) / pm); break; }
    }
  }
  months.sort((a, b) => a - b);
  return { 'réussite': (100 * pass / sims).toFixed(0) + '%', 'médiane si réussi': months.length ? months[months.length / 2 | 0].toFixed(1) + ' mois' : '-' };
}

const VAR = [
  ['MR standard (RSI2<10, indices)', { entry: 10 }, IDX],
  ['MR élargie RSI2<15', { entry: 15 }, IDX],
  ['MR élargie RSI2<20', { entry: 20 }, IDX],
  ['MR RSI2<15 + or', { entry: 15 }, ALL],
  ['MR RSI2<20 + or', { entry: 20 }, ALL],
  ['MR RSI2<20 + or, sortie RSI2>55', { entry: 20, exitRsi: 55 }, ALL],
];
console.log('===== VARIANTES MR — 25 ANS =====');
const rows = [];
const keep = {};
for (const [lb, opt, ins] of VAR) {
  const t = mk(opt, ins); keep[lb] = t;
  const s = stats(t);
  rows.push({ variante: lb, n: s.n, '/an': (s.n / 25).toFixed(0), 'réussite': s.winRate + '%', PF: s.pf, 'R/an': (s.totalR / 25).toFixed(2), maxDD: s.maxDD_R });
}
console.log(fmtTable(rows));

console.log('\n===== PROBABILITÉ DE PASSER UNE PHASE (+10% avant -10%) =====');
const rows2 = [];
for (const [lb] of VAR) {
  for (const risk of [1.0, 1.5]) rows2.push({ variante: lb.slice(0, 30), risque: risk + '%', ...challenge(keep[lb], risk) });
}
console.log(fmtTable(rows2));

console.log('\n===== ROBUSTESSE DE LA MEILLEURE VARIANTE (par sous-période) =====');
let best = null;
for (const [lb] of VAR) { const s = stats(keep[lb]); const sc = s.totalR / s.maxDD_R; if (!best || sc > best.sc) best = { lb, sc }; }
console.log(`(${best.lb})`);
console.log(fmtTable(byPeriod(keep[best.lb], [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]])));
