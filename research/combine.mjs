// Analyse portefeuille : corrélation trend vs mean-reversion, équité combinée, drawdown, et risque max compatible FTMO.
import { readFileSync } from 'node:fs';
import { stats, monthlyR, correlation, fmtTable } from './lib.mjs';

const trend = JSON.parse(readFileSync(new URL('./out_trend.json', import.meta.url)));
const mr = JSON.parse(readFileSync(new URL('./out_meanrev.json', import.meta.url)));

const trend1d = trend['1d|baseline (TP 3R)'];
const trend1d4R = trend['1d|TP 4R'];
const trend1h = trend['1h|baseline (TP 3R)'];
const mrA = mr['A'].filter(t => t.instr !== 'XAUUSD'); // indices seulement (l'or ne passe pas le test)

console.log('===== PORTEFEUILLE : TREND + MEAN-REVERSION A (indices, long only) =====\n');
console.log(fmtTable([
  { strategie: 'Trend daily 25a (TP3R)', ...stats(trend1d) },
  { strategie: 'Trend daily 25a (TP4R)', ...stats(trend1d4R) },
  { strategie: 'MR-A daily 25a (indices)', ...stats(mrA) },
  { strategie: 'COMBINÉ 25a (trend3R+MR)', ...stats([...trend1d, ...mrA]) },
  { strategie: 'COMBINÉ 25a (trend4R+MR)', ...stats([...trend1d4R, ...mrA]) },
]));

const corr25 = correlation(monthlyR(trend1d), monthlyR(mrA));
console.log(`\nCorrélation mensuelle (R) trend vs MR-A sur 25 ans : ${corr25}`);

// fenêtre 2 ans : trend 1h live vs MR-A
const cut = Date.now() - 730 * 86400000;
const mrA2y = mrA.filter(t => t.exitT >= cut);
const corr2y = correlation(monthlyR(trend1h), monthlyR(mrA2y));
console.log(`Corrélation mensuelle trend 1h (live) vs MR-A sur 2 ans : ${corr2y}`);
console.log('\n' + fmtTable([
  { strategie: 'Trend 1h 2a (live)', ...stats(trend1h) },
  { strategie: 'MR-A 2 ans (indices)', ...stats(mrA2y) },
  { strategie: 'COMBINÉ 2 ans', ...stats([...trend1h, ...mrA2y]) },
]));

// R annuel
console.log('\n--- R net par an (25 ans, daily) ---');
const years = {};
for (const [label, ts] of [['trend', trend1d], ['MR', mrA]]) {
  for (const t of ts) { const y = new Date(t.exitT).getUTCFullYear(); years[y] = years[y] || { annee: y, trend: 0, MR: 0 }; years[y][label] = +(years[y][label] + t.r).toFixed(1); }
}
const yrRows = Object.values(years).sort((a, b) => a.annee - b.annee).map(r => ({ ...r, total: +(r.trend + r.MR).toFixed(1) }));
const neg = yrRows.filter(r => r.total < 0).length;
console.log(fmtTable(yrRows));
console.log(`Années négatives (combiné): ${neg}/${yrRows.length}`);

// ===== RISQUE FTMO =====
// FTMO: perte max totale 10%, perte max journalière 5%. On calcule le DD max historique en R
// et le risque par trade qui garde une marge de sécurité (DD historique x1.5 pour le futur).
console.log('\n===== CALCUL RISQUE PAR TRADE vs LIMITES FTMO =====');
for (const [label, ts] of [['Trend 1h seul (config live, 2 ans)', trend1h], ['Trend daily 25 ans', trend1d], ['Combiné 25 ans (3R+MR)', [...trend1d, ...mrA]]]) {
  const s = stats(ts);
  const worstFuture = s.maxDD_R * 1.5; // marge : le pire du futur > pire du passé
  const safeRisk = 10 / worstFuture;
  console.log(`${label}: maxDD ${s.maxDD_R}R -> DD prudent ${worstFuture.toFixed(0)}R -> risque max ~${safeRisk.toFixed(2)}%/trade pour rester sous les 10% FTMO`);
}
// pire journée en R (limite 5%/jour)
for (const [label, ts] of [['Trend 1h (2 ans)', trend1h], ['Combiné 25 ans', [...trend1d, ...mrA]]]) {
  const days = {};
  for (const t of ts) { const k = new Date(t.exitT).toISOString().slice(0, 10); days[k] = (days[k] || 0) + t.r; }
  const worst = Math.min(...Object.values(days));
  console.log(`${label}: pire journée ${worst.toFixed(1)}R (limite FTMO 5%/jour -> risque max ${(5 / Math.abs(worst) * 0.75).toFixed(2)}%/trade avec marge 25%)`);
}
