// Simulation PORTEFEUILLE avec les règles exactes du robot live :
// cap 3 positions trend simultanées, max 3 nouveaux trades trend/jour, sélection par score,
// anti-conflit trend/MR sur le même instrument. Comparaison avec le backtest "tous les trades".
// Ordre par barre (comme le robot) : sorties trend -> entrées trend -> sorties MR -> entrées MR.
import { INSTR, COST_PTS, ema, rsi, atr, sma, stats, fmtTable, loadData } from './lib.mjs';

const MR_NAMES = ['US500', 'US100', 'US30'];

function prepTrend(bars) {
  const c = bars.map(x => x.c);
  return { bars, c, e21: ema(c, 21), e50: ema(c, 50), e200: ema(c, 200), r14: rsi(c, 14), a14: atr(bars, 14) };
}
function prepMR(bars) {
  const c = bars.map(x => x.c);
  return { bars, c, s200: sma(c, 200), s5: sma(c, 5), r2: rsi(c, 2), a14: atr(bars, 14) };
}

export function simulate(interval, { maxConc = Infinity, maxPerDay = Infinity, withMR = false, conflict = true, totalCap = Infinity } = {}) {
  const dataT = loadData(interval), dataD = loadData('1d');
  const T = {}, M = {};
  for (const [, name] of INSTR) if (dataT[name]) T[name] = prepTrend(dataT[name]);
  if (withMR) for (const name of MR_NAMES) if (dataD[name]) M[name] = prepMR(dataD[name]);

  // timeline unifiée de timestamps (trend TF + daily si MR)
  // Les décisions MR se prennent à la CLÔTURE US (~t+7h), comme le robot — décalage appliqué dans la timeline.
  const MR_SHIFT = 7 * 3600_000;
  const ts = new Set();
  for (const name in T) for (const b of T[name].bars) ts.add(b.t);
  if (withMR) for (const name in M) for (const b of M[name].bars) ts.add(b.t + MR_SHIFT);
  const timeline = [...ts].sort((a, b) => a - b);
  const idxT = {}, idxM = {};
  for (const name in T) { idxT[name] = new Map(); T[name].bars.forEach((b, i) => idxT[name].set(b.t, i)); }
  for (const name in M) { idxM[name] = new Map(); M[name].bars.forEach((b, i) => idxM[name].set(b.t + MR_SHIFT, i)); }

  // les entrées MR sont limitées à la fenêtre couverte par les données trend (sinon fenêtres mélangées)
  let tMin = Infinity;
  for (const name in T) tMin = Math.min(tMin, T[name].bars[0].t);

  const posT = {}, posM = {};
  const trades = [], mrTrades = [];
  let skippedCaps = 0, skippedConflict = 0;
  let day = '', opened = 0;

  for (const t of timeline) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (d !== day) { day = d; opened = 0; }

    // 1) sorties trend (SL prioritaire, gaps gérés)
    for (const name in T) {
      const i = idxT[name].get(t); if (i == null) continue;
      const p = posT[name]; if (!p) continue;
      const bar = T[name].bars[i], { dir, entry, riskDist, sl } = p;
      const tp = entry + dir * 3 * riskDist;
      let exitPx = null;
      if (dir === 1) {
        if (bar.o <= sl) exitPx = bar.o; else if (bar.l <= sl) exitPx = sl;
        else if (bar.o >= tp) exitPx = bar.o; else if (bar.h >= tp) exitPx = tp;
      } else {
        if (bar.o >= sl) exitPx = bar.o; else if (bar.h >= sl) exitPx = sl;
        else if (bar.o <= tp) exitPx = bar.o; else if (bar.l <= tp) exitPx = tp;
      }
      if (exitPx !== null) {
        trades.push({ instr: name, dir, entryT: p.entryT, exitT: bar.t, r: dir * (exitPx - entry) / riskDist - COST_PTS[name] / riskDist });
        delete posT[name];
      }
    }

    // 2) entrées trend : candidats -> tri par score -> caps
    const cands = [];
    for (const name in T) {
      const i = idxT[name].get(t); if (i == null || i < 201) continue;
      if (posT[name]) continue;
      if (conflict && posM[name]) { continue; }
      const { bars, e21, e50, e200, r14, a14 } = T[name];
      const bar = bars[i], pv = bars[i - 1];
      if (e200[i] == null || a14[i] == null || e21[i - 1] == null) continue;
      const aL = bar.c > e50[i] && e50[i] > e200[i], aS = bar.c < e50[i] && e50[i] < e200[i];
      const sigL = aL && pv.l <= e21[i - 1] && bar.c > bar.o && bar.c > e21[i] && r14[i] < 70;
      const sigS = aS && pv.h >= e21[i - 1] && bar.c < bar.o && bar.c < e21[i] && r14[i] > 30;
      if (!sigL && !sigS) continue;
      cands.push({ name, dir: sigL ? 1 : -1, entry: bar.c, riskDist: 3 * a14[i], t, score: Math.abs(e50[i] - e200[i]) / a14[i] });
    }
    cands.sort((a, b) => b.score - a.score);
    for (const cd of cands) {
      if (Object.keys(posT).length >= maxConc || opened >= maxPerDay || Object.keys(posT).length + Object.keys(posM).length >= totalCap) { skippedCaps++; continue; }
      posT[cd.name] = { dir: cd.dir, entry: cd.entry, entryT: cd.t, riskDist: cd.riskDist, sl: cd.entry - cd.dir * cd.riskDist };
      opened++;
    }

    // 3) sorties MR (SL intrabar, sinon condition à la clôture)
    if (withMR) for (const name in M) {
      const i = idxM[name].get(t); if (i == null) continue;
      const p = posM[name]; if (!p) continue;
      const bar = M[name].bars[i], { s5, r2 } = M[name];
      let exitPx = null;
      if (bar.o <= p.sl) exitPx = bar.o; else if (bar.l <= p.sl) exitPx = p.sl;
      else { p.held++; if (bar.c > s5[i] || r2[i] > 65 || p.held >= 10) exitPx = bar.c; }
      if (exitPx !== null) {
        mrTrades.push({ instr: name, dir: 1, entryT: p.entryT, exitT: bar.t, r: (exitPx - p.entry) / p.riskDist - COST_PTS[name] / p.riskDist });
        delete posM[name];
      }
    }

    // 4) entrées MR (anti-conflit avec trend)
    if (withMR) for (const name in M) {
      const i = idxM[name].get(t); if (i == null || i < 201) continue;
      if (t < tMin) continue;
      if (posM[name]) continue;
      const { bars, s200, r2, a14 } = M[name];
      const bar = bars[i];
      if (s200[i] == null || a14[i] == null || r2[i] == null) continue;
      if (!(bar.c > s200[i] && r2[i] < 10)) continue;
      if (conflict && posT[name]) { skippedConflict++; continue; }
      if (Object.keys(posT).length + Object.keys(posM).length >= totalCap) { skippedCaps++; continue; }
      posM[name] = { entry: bar.c, entryT: bar.t, riskDist: 3 * a14[i], sl: bar.c - 3 * a14[i], held: 0 };
    }
  }
  return { trades, mrTrades, skippedCaps, skippedConflict };
}

if (process.argv[1].endsWith('bt_portfolio.mjs')) {
  console.log('===== RÈGLES DU ROBOT vs BACKTEST "TOUS LES TRADES" =====\n');

  for (const [label, interval] of [['TREND 1H — 2 ans (config live)', '1h'], ['TREND DAILY — 25 ans', '1d']]) {
    const un = simulate(interval, {});
    const cap = simulate(interval, { maxConc: 3, maxPerDay: 3 });
    console.log(`--- ${label} ---`);
    console.log(fmtTable([
      { config: 'sans limites (backtest)', ...stats(un.trades) },
      { config: 'AVEC règles robot (cap3, 3/j)', ...stats(cap.trades) },
    ]));
    console.log(`signaux sautés à cause des caps : ${cap.skippedCaps}\n`);
  }

  console.log('--- COMBINÉ LIVE 2 ans : trend 1H (règles robot) + MR-A daily + anti-conflit — LA VRAIE CONFIG ---');
  const unC = simulate('1h', { withMR: true, conflict: false });
  const capC = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
  console.log(fmtTable([
    { config: 'sans limites', ...stats([...unC.trades, ...unC.mrTrades]) },
    { config: 'AVEC règles robot complètes', ...stats([...capC.trades, ...capC.mrTrades]) },
  ]));
  console.log(`trend: ${capC.trades.length} trades (vs ${unC.trades.length}), MR: ${capC.mrTrades.length} (vs ${unC.mrTrades.length})`);
  console.log(`signaux trend sautés (caps): ${capC.skippedCaps} | signaux MR sautés (anti-conflit): ${capC.skippedConflict}`);

  console.log('\n--- COMBINÉ DAILY 25 ans (proxy long terme, conflit surestimé car trend daily = positions longues) ---');
  const unD = simulate('1d', { withMR: true, conflict: false });
  const capD = simulate('1d', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
  console.log(fmtTable([
    { config: 'sans limites', ...stats([...unD.trades, ...unD.mrTrades]) },
    { config: 'AVEC règles robot complètes', ...stats([...capD.trades, ...capD.mrTrades]) },
  ]));
  console.log(`trend: ${capD.trades.length} (vs ${unD.trades.length}), MR: ${capD.mrTrades.length} (vs ${unD.mrTrades.length}), MR sautés (conflit): ${capD.skippedConflict}`);

  // pic de positions simultanées avec les règles complètes de la config LIVE (info exposition)
  const all = [...capC.trades.map(t => ({ ...t })), ...capC.mrTrades.map(t => ({ ...t }))];
  const evts = [];
  for (const tr of all) { evts.push([tr.entryT, 1], [tr.exitT, -1]); }
  evts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, peak = 0;
  for (const [, dv] of evts) { cur += dv; if (cur > peak) peak = cur; }
  console.log(`pic de positions simultanées (trend+MR) : ${peak}`);
}
