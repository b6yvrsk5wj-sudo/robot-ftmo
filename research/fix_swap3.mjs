// PISTE 3 : "cull des zombies" — fermer les trades qui ne vont NULLE PART (≠ couper les gagnants).
// Logique : le swap s'accumule avec le temps ; un trade encore plat après N jours a peu d'espérance
// mais continue de saigner. Règle testée : si après N jours le trade est sous +X R => sortie au marché.
import { INSTR, COST_PTS, ema, sma, rsi, atr, stats, fmtTable, loadData } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const swapR = (i, d, px, rk, ms) => (REAL_RATES[i][d === 1 ? 'L' : 'S'] / 100) * (px / rk) * ((ms / 86400000) * WED);

function runTrend(bars, name, { cullDays = 0, cullBelow = 0, side = 0 } = {}) {
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const trades = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i], pv = bars[i - 1];
    if (pos) {
      const { dir, entry, riskDist, sl } = pos, tp = entry + dir * 3 * riskDist;
      let exitPx = null;
      if (dir === 1) { if (bar.o <= sl) exitPx = bar.o; else if (bar.l <= sl) exitPx = sl; else if (bar.o >= tp) exitPx = bar.o; else if (bar.h >= tp) exitPx = tp; }
      else { if (bar.o >= sl) exitPx = bar.o; else if (bar.h >= sl) exitPx = sl; else if (bar.o <= tp) exitPx = bar.o; else if (bar.l <= tp) exitPx = tp; }
      // cull zombie : après cullDays jours, si le trade est sous cullBelow R -> sortie au marché
      if (exitPx === null && cullDays > 0) {
        const days = (bar.t - pos.entryT) / 86400000;
        if (days >= cullDays) {
          const curR = dir * (bar.c - entry) / riskDist;
          if (curR < cullBelow) exitPx = bar.c;
        }
      }
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
    const riskDist = 3 * a14[i];
    pos = { dir, entry: bar.c, entryT: bar.t, riskDist, sl: bar.c - dir * riskDist };
  }
  return trades;
}

const d1h = loadData('1h'), d1d = loadData('1d');
const rep = (label, tr, y) => {
  const s = stats(tr), sw = tr.reduce((a, t) => a + t.sw, 0), gr = tr.reduce((a, t) => a + t.gross, 0);
  return { config: label, n: s.n, WR: s.winRate, PF: s.pf, 'brut/an': (gr / y).toFixed(1), 'swap/an': (sw / y).toFixed(1), 'NET/an': (s.totalR / y).toFixed(1), maxDD: s.maxDD_R };
};
const all1h = (opt) => { let a = []; for (const [, n] of INSTR) if (d1h[n]) a = a.concat(runTrend(d1h[n], n, opt)); return a; };
const all1d = (opt) => { let a = []; for (const [, n] of INSTR) if (d1d[n]) a = a.concat(runTrend(d1d[n], n, opt)); return a; };

console.log('===== CULL DES ZOMBIES — trend 1h, 2 ans =====');
const rows = [rep('aucun cull (actuel)', all1h({}), 2)];
for (const [d, b] of [[3, 0], [5, 0], [5, 0.5], [7, 0], [7, 0.5], [10, 0], [10, 1], [14, 0.5]]) {
  rows.push(rep(`cull ${d}j si < +${b}R`, all1h({ cullDays: d, cullBelow: b }), 2));
}
console.log(fmtTable(rows));

console.log('\n===== VÉRIFICATION 25 ANS (trend daily, même logique) =====');
const rows2 = [rep('aucun cull', all1d({}), 25)];
for (const [d, b] of [[5, 0], [7, 0.5], [10, 0], [10, 1]]) {
  rows2.push(rep(`cull ${d}j si < +${b}R`, all1d({ cullDays: d, cullBelow: b }), 25));
}
console.log(fmtTable(rows2));

console.log('\n===== MEILLEUR CULL + spécialisation (or 2 sens + shorts indices), 2 ans =====');
const IDX = ['US500', 'US100', 'US30'];
for (const [d, b] of [[0, 0], [5, 0], [7, 0.5], [10, 0]]) {
  const opt = d ? { cullDays: d, cullBelow: b } : {};
  let t = runTrend(d1h.XAUUSD, 'XAUUSD', opt);
  for (const n of IDX) if (d1h[n]) t = t.concat(runTrend(d1h[n], n, { ...opt, side: -1 }));
  console.log(fmtTable([rep(d ? `spécialisé + cull ${d}j <+${b}R` : 'spécialisé sans cull', t, 2)]));
}
