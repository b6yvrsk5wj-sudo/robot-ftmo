// Monte Carlo du PARCOURS COMPLET vers le compte financé : P1 -> P2, avec rachat du challenge en cas
// d'échec (le temps continue de s'écouler), à différents risques. + survie du compte financé sur 12 mois.
// Même base que mc_challenge.mjs (séquence réelle des trades, config live, règles robot).
import { simulate } from './bt_portfolio.mjs';
import { fmtTable } from './lib.mjs';

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const seq = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
const perMonth = seq.length / span;
const FEE = 540; // challenge FTMO 100k (€)

const dayOf = i => new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + Math.floor(i / seq.length);

// une phase : consomme la séquence depuis idx jusqu'à pass/bust ; renvoie [résultat, nouvel idx]
function phase(riskPct, targetPct, idx) {
  let eq = 0, curDay = '', daySum = 0;
  const cap = idx + seq.length * 5;
  while (idx < cap) {
    const dk = dayOf(idx);
    if (dk !== curDay) { curDay = dk; daySum = 0; }
    const r = seq[idx % seq.length].r * riskPct;
    eq += r; daySum += r; idx++;
    if (daySum <= -5 || eq <= -10) return ['bust', idx];
    if (eq >= targetPct) return ['pass', idx];
  }
  return ['bust', idx];
}

console.log(`===== PARCOURS COMPLET JUSQU'AU COMPTE FINANCÉ (rachats inclus, 20 000 sims) =====`);
const rows = [];
for (const risk of [0.7, 1.0, 1.25, 1.5]) {
  const months = [], feesArr = [];
  for (let s = 0; s < 20000; s++) {
    let idx = Math.floor(Math.random() * seq.length);
    const start = idx;
    let fees = FEE, funded = false;
    while (!funded && (idx - start) / perMonth < 60) {
      const [r1, i1] = phase(risk, 10, idx); idx = i1;
      if (r1 === 'bust') { fees += FEE; continue; }
      const [r2, i2] = phase(risk, 5, idx); idx = i2;
      if (r2 === 'bust') { fees += FEE; continue; }
      funded = true;
    }
    months.push((idx - start) / perMonth); feesArr.push(fees);
  }
  months.sort((a, b) => a - b);
  const med = months[10000], p90 = months[18000];
  const avgFees = feesArr.reduce((a, b) => a + b, 0) / feesArr.length;
  const under3 = months.filter(m => m <= 3).length / 200, under6 = months.filter(m => m <= 6).length / 200;
  rows.push({
    'risque': risk + '%', 'médiane': med.toFixed(1) + ' mois', '90e pct': p90.toFixed(1) + ' mois',
    'financé ≤3 mois': under3.toFixed(0) + '%', '≤6 mois': under6.toFixed(0) + '%', 'frais moyens': Math.round(avgFees) + '€',
  });
}
console.log(fmtTable(rows));

console.log(`\n===== SURVIE DU COMPTE FINANCÉ SUR 12 MOIS — AVEC RETRAITS MENSUELS DES PROFITS =====`);
console.log(`(à chaque retrait le coussin repart à ~zéro : c'est le scénario réaliste si on encaisse)`);
const rows2 = [];
for (const risk of [0.5, 0.7, 1.0, 1.25, 1.5]) {
  let dead = 0; const banked = [];
  const horizon = Math.round(12 * perMonth), payEvery = Math.round(perMonth);
  for (let s = 0; s < 20000; s++) {
    let idx = Math.floor(Math.random() * seq.length);
    let eq = 0, curDay = '', daySum = 0, bank = 0, alive = true;
    for (let k = 0; k < horizon; k++) {
      const dk = dayOf(idx);
      if (dk !== curDay) { curDay = dk; daySum = 0; }
      const r = seq[idx % seq.length].r * risk;
      eq += r; daySum += r; idx++;
      if (daySum <= -5 || eq <= -10) { dead++; alive = false; break; }
      if (k > 0 && k % payEvery === 0 && eq > 0) { bank += eq * 0.8; eq = 0; } // split 80/20, coussin remis à zéro
    }
    if (alive) banked.push(bank + Math.max(eq, 0) * 0.8);
  }
  const avgBank = banked.length ? banked.reduce((a, b) => a + b, 0) / banked.length : 0;
  rows2.push({ 'risque': risk + '%', 'compte perdu dans l’année': (100 * dead / 20000).toFixed(0) + '%', 'encaissé/an si survie (part trader)': '~' + avgBank.toFixed(1) + '% du compte' });
}
console.log(fmtTable(rows2));
