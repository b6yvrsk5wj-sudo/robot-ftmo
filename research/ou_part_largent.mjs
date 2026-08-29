// « Il doit bien exister quelque chose de beaucoup plus rentable et moins risqué »
// Décomposition honnête : la stratégie est-elle le problème, ou l'emballage ?
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
import { stats, fmtTable } from './lib.mjs';
const WED = 1.28;

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const brut = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
const net = brut.map(t => {
  const d = ((t.exitT - t.entryT) / 86400000) * WED;
  return { ...t, r: t.r + (REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * d };
});
const ANS = 2;

// --- qualité intrinsèque de la stratégie ---
function sharpe(seq, risk) {
  // rendements mensuels en % du compte
  const m = {};
  for (const t of seq) { const k = new Date(t.exitT).toISOString().slice(0, 7); m[k] = (m[k] || 0) + t.r * risk; }
  const v = Object.values(m), n = v.length;
  const mu = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (n - 1));
  return { annuel: (mu * 12).toFixed(1), volAnnuelle: (sd * Math.sqrt(12)).toFixed(1), sharpe: (mu / sd * Math.sqrt(12)).toFixed(2) };
}

console.log('=== 1. QUALITÉ INTRINSÈQUE DE TA STRATÉGIE (à 1% de risque) ===');
console.log('   brut (sans frais de nuit) :', JSON.stringify(sharpe(brut, 1)));
console.log('   net  (swaps FTMO payés)   :', JSON.stringify(sharpe(net, 1)));
console.log('   Repères : fonds quantitatif correct = Sharpe 0.7-1.0 | excellent = 1.5+ | Renaissance Medallion ≈ 2.5 (fermé au public depuis 30 ans)');

// --- décomposition : où passent les 26.8R/an bruts ---
const brutR = stats(brut).totalR / ANS, netR = stats(net).totalR / ANS;
console.log('\n=== 2. DÉCOMPOSITION D\'UNE ANNÉE, DE LA STRATÉGIE À TA POCHE ===');
const RISK_CHALLENGE = 1.0, RISK_FUNDED = 0.7, SPLIT = 0.8;
const lignes = [
  ['Ce que la stratégie produit (1% de risque, sans frais)', brutR * 1 , '100%'],
  ['− frais de nuit du broker (swaps)', -(brutR - netR) * 1, ''],
  ['= rendement net à 1% de risque', netR * 1, ''],
  ['− bridage du risque imposé (1% -> 0.7% à cause du drawdown max)', -(netR * 1 - netR * RISK_FUNDED), ''],
  ['= rendement net au risque autorisé', netR * RISK_FUNDED, ''],
  ['− part de la prop firm (20%)', -netR * RISK_FUNDED * (1 - SPLIT), ''],
  ['= CE QUE TU TOUCHES', netR * RISK_FUNDED * SPLIT, ''],
];
const base = brutR * 1;
console.log(fmtTable(lignes.map(([l, v]) => ({ poste: l, '%/an': (v >= 0 ? '+' : '') + v.toFixed(1) + '%', 'part du brut': (100 * Math.abs(v) / base).toFixed(0) + '%' }))));

// --- que se passerait-il sur SON PROPRE capital ? ---
console.log('\n=== 3. LA MÊME STRATÉGIE SUR TON PROPRE CAPITAL (broker classique, aucune règle) ===');
console.log('   Pas de split, pas de drawdown imposé, pas de challenge. Seule contrainte : ne pas se ruiner.');
const rows = [];
for (const risk of [1, 1.5, 2]) {
  const s = sharpe(net, risk);
  const dd = stats(net).maxDD_R * risk;
  rows.push({ risque: risk + '%', 'rendement/an': s.annuel + '%', 'pire drawdown': dd.toFixed(0) + '%', 'sur 10 000€': Math.round(10000 * parseFloat(s.annuel) / 100) + '€/an', 'sur 100 000€': Math.round(100000 * parseFloat(s.annuel) / 100) + '€/an' });
}
console.log(fmtTable(rows));
console.log('\n   => Le rendement en % est le MÊME. Seul le capital change le montant.');
console.log('   => La prop firm ne rend pas la stratégie meilleure : elle prête un capital contre 20% + des règles.');
