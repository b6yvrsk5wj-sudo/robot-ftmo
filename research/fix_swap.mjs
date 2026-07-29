// CHERCHER UNE CONFIG QUI SURVIT AUX SWAPS.
// Levier : coût swap/R = taux × (prix / distance de stop) × jours. Stop plus large => moins de swap par R.
// Variantes testées sur le trend : multiple d'ATR du stop (3x actuel, 4x, 6x, 8x) et timeframe (1h vs daily).
import { INSTR, COST_PTS, ema, sma, rsi, atr, stats, fmtTable, loadData } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';

function billedDaysApprox(ms) { return (ms / 86400000) * (7 / 5) * (7 / 7); } // jours calendaires ~ = ms; le triple mercredi ajoute ~28%
const WED = 1.28; // majoration moyenne pour le triple swap du mercredi

function swapR(instr, dir, entryPx, riskDist, ms) {
  const days = (ms / 86400000) * WED;
  const rate = REAL_RATES[instr][dir === 1 ? 'L' : 'S'];
  return (rate / 100) * (entryPx / riskDist) * days;
}

// moteur trend paramétrable : multiple ATR du stop, TP en R
function runTrend(bars, name, { slMult = 3, tpR = 3 } = {}) {
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const cost = COST_PTS[name];
  const trades = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i], pv = bars[i - 1];
    if (pos) {
      const { dir, entry, riskDist, sl } = pos, tp = entry + dir * tpR * riskDist;
      let exitPx = null;
      if (dir === 1) { if (bar.o <= sl) exitPx = bar.o; else if (bar.l <= sl) exitPx = sl; else if (bar.o >= tp) exitPx = bar.o; else if (bar.h >= tp) exitPx = tp; }
      else { if (bar.o >= sl) exitPx = bar.o; else if (bar.h >= sl) exitPx = sl; else if (bar.o <= tp) exitPx = bar.o; else if (bar.l <= tp) exitPx = tp; }
      if (exitPx !== null) {
        const gross = dir * (exitPx - entry) / riskDist - cost / riskDist;
        const sw = swapR(name, dir, entry, riskDist, bar.t - pos.entryT);
        trades.push({ instr: name, dir, entryT: pos.entryT, exitT: bar.t, r: gross + sw, gross, sw });
        pos = null;
      } else continue;
    }
    if (e200[i] == null || a14[i] == null || e21[i - 1] == null) continue;
    const aL = bar.c > e50[i] && e50[i] > e200[i], aS = bar.c < e50[i] && e50[i] < e200[i];
    const sigL = aL && pv.l <= e21[i - 1] && bar.c > bar.o && bar.c > e21[i] && r14[i] < 70;
    const sigS = aS && pv.h >= e21[i - 1] && bar.c < bar.o && bar.c < e21[i] && r14[i] > 30;
    if (!sigL && !sigS) continue;
    const dir = sigL ? 1 : -1, riskDist = slMult * a14[i];
    pos = { dir, entry: bar.c, entryT: bar.t, riskDist, sl: bar.c - dir * riskDist };
  }
  return trades;
}

// moteur MR-A (daily, indices, long) avec swap
function runMR(bars, name) {
  const c = bars.map(x => x.c);
  const s200 = sma(c, 200), s5 = sma(c, 5), r2 = rsi(c, 2), a14 = atr(bars, 14);
  const cost = COST_PTS[name];
  const trades = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i];
    if (pos) {
      pos.held++;
      let exitPx = null;
      if (bar.o <= pos.sl) exitPx = bar.o; else if (bar.l <= pos.sl) exitPx = pos.sl;
      else if (r2[i] > 65 || bar.c > s5[i] || pos.held >= 10) exitPx = bar.c;
      if (exitPx !== null) {
        const gross = (exitPx - pos.entry) / pos.riskDist - cost / pos.riskDist;
        const sw = swapR(name, 1, pos.entry, pos.riskDist, bar.t - pos.entryT);
        trades.push({ instr: name, dir: 1, entryT: pos.entryT, exitT: bar.t, r: gross + sw, gross, sw });
        pos = null;
      }
      continue;
    }
    if (s200[i] == null || a14[i] == null || r2[i] == null) continue;
    if (!(bar.c > s200[i] && r2[i] < 10)) continue;
    pos = { entry: bar.c, entryT: bar.t, riskDist: 3 * a14[i], sl: bar.c - 3 * a14[i], held: 0 };
  }
  return trades;
}

const d1h = loadData('1h'), d1d = loadData('1d');
const YEARS_1H = 2, YEARS_1D = 25;

function report(label, trades, years) {
  const s = stats(trades);
  const sw = trades.reduce((a, t) => a + t.sw, 0), gr = trades.reduce((a, t) => a + t.gross, 0);
  return {
    config: label, n: s.n, WR: s.winRate, PF: s.pf,
    'R brut/an': (gr / years).toFixed(1), 'swap/an': (sw / years).toFixed(1), 'R NET/an': (s.totalR / years).toFixed(1), maxDD: s.maxDD_R,
  };
}

console.log('===== A) TREND 1H : élargir le stop réduit-il assez le swap ? (2 ans) =====');
const rowsA = [];
for (const mult of [3, 4, 6, 8]) {
  let all = [];
  for (const [, name] of INSTR) if (d1h[name]) all = all.concat(runTrend(d1h[name], name, { slMult: mult }));
  rowsA.push(report(`stop ${mult}x ATR`, all, YEARS_1H));
}
console.log(fmtTable(rowsA));

console.log('\n===== B) TREND DAILY : stops naturellement larges (25 ans) =====');
const rowsB = [];
for (const mult of [3, 4, 6]) {
  let all = [];
  for (const [, name] of INSTR) if (d1d[name]) all = all.concat(runTrend(d1d[name], name, { slMult: mult }));
  rowsB.push(report(`daily stop ${mult}x ATR`, all, YEARS_1D));
}
console.log(fmtTable(rowsB));

console.log('\n===== C) MR-A seule (indices, 25 ans) =====');
let mr = [];
for (const name of ['US500', 'US100', 'US30']) if (d1d[name]) mr = mr.concat(runMR(d1d[name], name));
console.log(fmtTable([report('MR-A indices', mr, YEARS_1D)]));

console.log('\n===== D) Ratio notionnel/risque moyen (la cause du problème) =====');
const ratios = [];
for (const [, name] of INSTR) {
  if (!d1h[name]) continue;
  const t1 = runTrend(d1h[name], name, { slMult: 3 });
  const t2 = d1d[name] ? runTrend(d1d[name], name, { slMult: 3 }) : [];
  ratios.push({ instr: name, 'trend 1h': t1.length ? (t1.reduce((a, x) => a + Math.abs(x.sw), 0) / t1.length).toFixed(3) + 'R/trade' : '-', 'trend daily': t2.length ? (t2.reduce((a, x) => a + Math.abs(x.sw), 0) / t2.length).toFixed(3) + 'R/trade' : '-' });
}
console.log(fmtTable(ratios));
