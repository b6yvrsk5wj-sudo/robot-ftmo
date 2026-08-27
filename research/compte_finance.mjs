// LA QUESTION DE L'UTILISATEUR (2026-09) : sur le COMPTE FINANCÉ, le 6% trailing de FT+ oblige à baisser
// le risque sous 1% — au point que la rentabilité redevienne équivalente à un FTMO 10% avec swaps ?
// On simule 12 mois de compte financé, AVEC retraits mensuels, pour les deux offres, à plusieurs risques.
// Sortie : taux de survie sur 1 an + revenu net encaissé par le trader (après split).
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
import { fmtTable } from './lib.mjs';
const WED = 1.28;

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const raw = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);           // FT+ : sans swap
const swapped = raw.map(t => {                                                    // FTMO : avec swap
  const d = ((t.exitT - t.entryT) / 86400000) * WED;
  return { ...t, r: t.r + (REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * d };
});
const span = (raw[raw.length - 1].exitT - raw[0].exitT) / (30.44 * 86400000);
const perMonth = raw.length / span;

// 12 mois de compte financé, retrait mensuel de tout le profit (split appliqué).
// FT+   : plancher = min(pic - 6, 0) ; le retrait ramène le solde vers 0 mais le plancher reste (cas PESSIMISTE, à confirmer par le support)
// FTMO  : plancher = -10 statique depuis le solde initial ; retrait ne bouge pas le plancher
// resetOnPayout=true => scénario OPTIMISTE : après un retrait, le plancher se recale sous le nouveau solde
function run(seq, { risk, maxDDp, dayDD, trailing, dailyLim, split, resetOnPayout = false, sims = 20000 }) {
  const horizon = Math.round(12 * perMonth), payEvery = Math.round(perMonth);
  const dk = (j, off) => new Date(seq[j % seq.length].exitT).toISOString().slice(0, 10) + '#' + off;
  let dead = 0; const incomes = [];
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length);
    let eq = 0, peak = 0, cur = '', ds = 0, banked = 0, alive = true;
    for (let k = 0; k < horizon; k++) {
      const key = dk(idx, Math.floor(k / seq.length));
      if (key !== cur) { cur = key; ds = 0; }
      const r = seq[idx % seq.length].r * risk; eq += r; ds += r; idx++;
      if (eq > peak) peak = eq;
      const floor = trailing ? Math.min(peak - maxDDp, 0) : -maxDDp;
      if (ds <= -dailyLim || eq <= floor) { dead++; alive = false; break; }
      if (k > 0 && k % payEvery === 0 && eq > 0) { banked += eq * split; eq = 0; if (resetOnPayout) peak = 0; } // retrait mensuel
    }
    if (alive) incomes.push(banked + Math.max(eq, 0) * split);
  }
  const avg = incomes.length ? incomes.reduce((a, b) => a + b, 0) / incomes.length : 0;
  return {
    'survie 12 mois': (100 * (sims - dead) / sims).toFixed(0) + '%',
    'encaissé/an (si survie)': avg.toFixed(1) + '% du compte',
    'espérance': ((sims - dead) / sims * avg).toFixed(1) + '% du compte',
  };
}

console.log('=== COMPTE FINANCÉ 12 MOIS, AVEC RETRAITS MENSUELS (split 80%) ===');
console.log('(FT+ : sans swap, plancher 6% trailing | FTMO : avec swaps, plancher 10% statique)\n');
const rows = [];
for (const risk of [0.4, 0.5, 0.7, 1.0]) {
  rows.push({ offre: 'FT+  (6% trail, sans swap)', risque: risk + '%', ...run(raw, { risk, maxDDp: 6, dailyLim: 4, trailing: true, split: 0.8 }) });
  rows.push({ offre: 'FTMO (10% stat, swaps)', risque: risk + '%', ...run(swapped, { risk, maxDDp: 10, dailyLim: 5, trailing: false, split: 0.8 }) });
  rows.push({ offre: '---', risque: '', 'survie 12 mois': '', 'encaissé/an (si survie)': '', 'espérance': '' });
}
console.log(fmtTable(rows));

console.log('\n=== SCÉNARIO OPTIMISTE : et si le plancher FT+ se recalait après chaque retrait ? ===');
const rows2 = [];
for (const risk of [0.5, 0.7, 1.0, 1.25]) {
  rows2.push({ offre: 'FT+ (plancher recalé)', risque: risk + '%', ...run(raw, { risk, maxDDp: 6, dailyLim: 4, trailing: true, split: 0.8, resetOnPayout: true }) });
}
console.log(fmtTable(rows2));

console.log('\n=== MEILLEUR RÉGLAGE DE CHAQUE OFFRE (espérance maximale) ===');
for (const [lb, seq, cfg] of [['FT+ pessimiste', raw, { maxDDp: 6, dailyLim: 4, trailing: true }], ['FT+ optimiste', raw, { maxDDp: 6, dailyLim: 4, trailing: true, resetOnPayout: true }], ['FTMO', swapped, { maxDDp: 10, dailyLim: 5, trailing: false }]]) {
  let best = null;
  for (let risk = 0.2; risk <= 1.5; risk += 0.05) {
    const r = run(seq, { risk, split: 0.8, sims: 6000, ...cfg });
    const e = parseFloat(r['espérance']);
    if (!best || e > best.e) best = { e, risk, r };
  }
  console.log(`${lb.padEnd(5)} : optimum à ${best.risk.toFixed(2)}% de risque -> survie ${best.r['survie 12 mois']}, espérance ${best.e.toFixed(1)}% du compte/an`);
}
