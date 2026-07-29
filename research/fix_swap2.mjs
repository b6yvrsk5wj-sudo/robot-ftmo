// PISTE 2 : spécialiser chaque instrument là où il coûte peu.
// Faits : (1) l'or paie 3-4x moins de swap que les indices ; (2) les SHORTS indices ont un swap POSITIF ;
// (3) MR-A a un stop large => peu de swap. => Tester des combinaisons ciblées, sur 2 ans ET 25 ans.
import { INSTR, COST_PTS, ema, sma, rsi, atr, stats, fmtTable, loadData, byPeriod } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const swapR = (instr, dir, px, risk, ms) => (REAL_RATES[instr][dir === 1 ? 'L' : 'S'] / 100) * (px / risk) * ((ms / 86400000) * WED);

function runTrend(bars, name, { slMult = 3, tpR = 3, side = 0 } = {}) {
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const trades = []; let pos = null;
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
    const dir = sigL ? 1 : -1;
    if (side && dir !== side) continue;
    const riskDist = slMult * a14[i];
    pos = { dir, entry: bar.c, entryT: bar.t, riskDist, sl: bar.c - dir * riskDist };
  }
  return trades;
}

function runMR(bars, name) {
  const c = bars.map(x => x.c);
  const s200 = sma(c, 200), s5 = sma(c, 5), r2 = rsi(c, 2), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const trades = []; let pos = null;
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
const IDX = ['US500', 'US100', 'US30'];
const rep = (label, tr, years) => {
  const s = stats(tr); const sw = tr.reduce((a, t) => a + t.sw, 0), gr = tr.reduce((a, t) => a + t.gross, 0);
  return { config: label, n: s.n, WR: s.winRate, PF: s.pf, 'brut/an': (gr / years).toFixed(1), 'swap/an': (sw / years).toFixed(1), 'NET/an': (s.totalR / years).toFixed(1), maxDD: s.maxDD_R };
};

console.log('===== TREND 1H PAR INSTRUMENT ET PAR SENS (2 ans, net de swap) =====');
const rows = [];
for (const [, name] of INSTR) {
  if (!d1h[name]) continue;
  for (const [lb, side] of [['tous', 0], ['LONG only', 1], ['SHORT only', -1]]) {
    rows.push(rep(`${name} ${lb}`, runTrend(d1h[name], name, { side }), 2));
  }
}
console.log(fmtTable(rows));

console.log('\n===== COMBINAISONS CANDIDATES (2 ans) =====');
const combos = [];
let goldOnly = runTrend(d1h.XAUUSD, 'XAUUSD', {});
let idxShort = []; for (const n of IDX) if (d1h[n]) idxShort = idxShort.concat(runTrend(d1h[n], n, { side: -1 }));
let idxAll = []; for (const n of IDX) if (d1h[n]) idxAll = idxAll.concat(runTrend(d1h[n], n, {}));
let mr2 = []; for (const n of IDX) if (d1d[n]) mr2 = mr2.concat(runMR(d1d[n], n).filter(t => t.exitT >= Date.now() - 730 * 86400000));
combos.push(rep('ACTUEL: trend tous + MR', [...goldOnly, ...idxAll, ...mr2], 2));
combos.push(rep('or + shorts indices + MR', [...goldOnly, ...idxShort, ...mr2], 2));
combos.push(rep('or seul + MR', [...goldOnly, ...mr2], 2));
combos.push(rep('MR seule', mr2, 2));
console.log(fmtTable(combos));

console.log('\n===== LES MÊMES SUR 25 ANS (test de robustesse — daily pour le trend) =====');
const c25 = [];
let g25 = runTrend(d1d.XAUUSD, 'XAUUSD', {});
let i25s = []; for (const n of IDX) if (d1d[n]) i25s = i25s.concat(runTrend(d1d[n], n, { side: -1 }));
let i25 = []; for (const n of IDX) if (d1d[n]) i25 = i25.concat(runTrend(d1d[n], n, {}));
let mr25 = []; for (const n of IDX) if (d1d[n]) mr25 = mr25.concat(runMR(d1d[n], n));
c25.push(rep('trend daily tous + MR', [...g25, ...i25, ...mr25], 25));
c25.push(rep('or daily + shorts idx + MR', [...g25, ...i25s, ...mr25], 25));
c25.push(rep('or daily + MR', [...g25, ...mr25], 25));
c25.push(rep('MR seule', mr25, 25));
console.log(fmtTable(c25));

console.log('\n===== MR-A : stabilité par sous-période (25 ans, net de swap) =====');
console.log(fmtTable(byPeriod(mr25, [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]])));
