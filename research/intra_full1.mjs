// AUDIT INTRADAY 1/3 — variantes de paramètres et sélection d'instruments.
// Mêmes questions que celles posées au swing : TP, multiple de stop, filtre de session, panier.
import { INSTR, COST_PTS, ema, rsi, atr, stats, loadData, fmtTable } from './lib.mjs';
const dayOf = t => new Date(t).toISOString().slice(0, 10);

export function runIntra(bars, name, { tpR = 3, slMult = 3, sessionOnly = false, side = 0 } = {}) {
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const b = bars[i], pv = bars[i - 1];
    const last = i === bars.length - 1 || dayOf(bars[i + 1].t) !== dayOf(b.t);
    if (pos) {
      const tp = pos.entry + pos.dir * tpR * pos.risk;
      let x = null;
      if (pos.dir === 1) { if (b.o <= pos.sl) x = b.o; else if (b.l <= pos.sl) x = pos.sl; else if (b.o >= tp) x = b.o; else if (b.h >= tp) x = tp; else if (last) x = b.c; }
      else { if (b.o >= pos.sl) x = b.o; else if (b.h >= pos.sl) x = pos.sl; else if (b.o <= tp) x = b.o; else if (b.l <= tp) x = tp; else if (last) x = b.c; }
      if (x !== null) { out.push({ instr: name, dir: pos.dir, entryT: pos.t, exitT: b.t, r: pos.dir * (x - pos.entry) / pos.risk - cost / pos.risk }); pos = null; }
      continue;
    }
    if (last || e200[i] == null || a14[i] == null || e21[i - 1] == null) continue;
    if (sessionOnly) { const h = new Date(b.t).getUTCHours(); if (h < 13 || h >= 20) continue; }
    const aL = b.c > e50[i] && e50[i] > e200[i], aS = b.c < e50[i] && e50[i] < e200[i];
    const sL = aL && pv.l <= e21[i - 1] && b.c > b.o && b.c > e21[i] && r14[i] < 70;
    const sS = aS && pv.h >= e21[i - 1] && b.c < b.o && b.c < e21[i] && r14[i] > 30;
    if (!sL && !sS) continue;
    const dir = sL ? 1 : -1; if (side && dir !== side) continue;
    const risk = slMult * a14[i];
    pos = { dir, entry: b.c, sl: b.c - dir * risk, risk, t: b.t };
  }
  return out;
}

const d = loadData('1h');
const A = 2;
const all = (opt, insts) => { let o = []; for (const n of (insts || INSTR.map(x => x[1]))) if (d[n]) o = o.concat(runIntra(d[n], n, opt)); return o; };
const line = (lb, t) => { const s = stats(t); return { config: lb, n: s.n, 'réussite': s.winRate + '%', PF: s.pf, 'R/an': (s.totalR / A).toFixed(1), maxDD: s.maxDD_R, 'rdt/DD': (s.totalR / s.maxDD_R).toFixed(2) }; };

console.log('===== 1. TAKE PROFIT =====');
console.log(fmtTable([1.5, 2, 3, 4].map(tp => line(`TP ${tp}R`, all({ tpR: tp })))));

console.log('\n===== 2. MULTIPLE DE STOP =====');
console.log(fmtTable([1.5, 2, 3, 4].map(m => line(`stop ${m}x ATR`, all({ slMult: m })))));

console.log('\n===== 3. FILTRE DE SESSION (entrées 13h-20h UTC seulement) =====');
console.log(fmtTable([line('toutes heures', all({})), line('session US only', all({ sessionOnly: true }))]));

console.log('\n===== 4. SÉLECTION D INSTRUMENTS (la question de l or) =====');
const paniers = [
  ['4 instruments (actuel)', ['US500', 'US100', 'US30', 'XAUUSD']],
  ['or seul', ['XAUUSD']],
  ['or + Nasdaq', ['XAUUSD', 'US100']],
  ['indices seuls', ['US500', 'US100', 'US30']],
];
console.log(fmtTable(paniers.map(([lb, ins]) => line(lb, all({}, ins)))));

console.log('\n===== 5. SENS (long/short) =====');
console.log(fmtTable([[0, 'les deux'], [1, 'longs seuls'], [-1, 'shorts seuls']].map(([s, lb]) => line(lb, all({ side: s })))));
