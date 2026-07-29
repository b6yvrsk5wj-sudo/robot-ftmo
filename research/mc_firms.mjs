// COMPARAISON FTMO vs FUNDED TRADING PLUS — jeux de règles complets, Monte Carlo.
// FTMO   : swaps OUI | cibles 10% puis 5% | DD max 10% statique | DD jour 5% | PAS de règle de consistance
// FT+ 2-Step Classic : swaps NON | cible 7% x2 | DD max 8% statique | DD jour 4% | RÈGLE DE CONSISTANCE 35%
// La règle de consistance : aucun jour ne doit représenter plus de 35% du profit net total de la phase.
// Notre stratégie gagne par à-coups (+3R d'un coup) => cette règle peut mordre très fort. À chiffrer.
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
import { fmtTable } from './lib.mjs';
const WED = 1.28;

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const raw = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
const withSwap = raw.map(t => {
  const days = ((t.exitT - t.entryT) / 86400000) * WED;
  return { ...t, r: t.r + (REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * days };
});

function pipeline(seq, { risk, target1, target2, maxDD, dayDD, consistency = 0, fee, sims = 20000 }) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
  const perMonth = seq.length / span;
  const dayKey = i => new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + Math.floor(i / seq.length);

  function phase(target, idx) {
    let eq = 0, days = new Map();
    const cap = idx + seq.length * 6;
    while (idx < cap) {
      const dk = dayKey(idx);
      const r = seq[idx % seq.length].r * risk;
      eq += r; days.set(dk, (days.get(dk) || 0) + r);
      idx++;
      if (days.get(dk) <= -dayDD) return ['bust', idx];
      if (eq <= -maxDD) return ['bust', idx];
      if (eq >= target) {
        if (!consistency) return ['pass', idx];
        // règle de consistance : le meilleur jour doit être <= consistency% du profit total
        let best = 0;
        for (const v of days.values()) if (v > best) best = v;
        if (best <= consistency * eq) return ['pass', idx];
        // sinon : continuer à trader pour diluer
      }
    }
    return ['bust', idx];
  }

  const months = [], fees = [];
  let passed = 0;
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length);
    const start = idx; let cost = fee, funded = false;
    while (!funded && (idx - start) / perMonth < 60) {
      const [r1, i1] = phase(target1, idx); idx = i1;
      if (r1 === 'bust') { cost += fee; continue; }
      const [r2, i2] = phase(target2, idx); idx = i2;
      if (r2 === 'bust') { cost += fee; continue; }
      funded = true;
    }
    if (funded) passed++;
    months.push((idx - start) / perMonth); fees.push(cost);
  }
  months.sort((a, b) => a - b);
  return {
    'médiane': months[Math.floor(sims / 2)].toFixed(1) + ' mois',
    '90e pct': months[Math.floor(sims * 0.9)].toFixed(1) + ' mois',
    '≤6 mois': (100 * months.filter(m => m <= 6).length / sims).toFixed(0) + '%',
    'frais moyens': Math.round(fees.reduce((a, b) => a + b, 0) / sims) + '€',
  };
}

console.log('===== FTMO (avec swaps, pas de consistance) =====');
const rF = [];
for (const risk of [1.0, 1.25, 1.5]) {
  rF.push({ risque: risk + '%', ...pipeline(withSwap, { risk, target1: 10, target2: 5, maxDD: 10, dayDD: 5, fee: 540 }) });
}
console.log(fmtTable(rF));

console.log('\n===== FUNDED TRADING PLUS 2-Step Classic (sans swap, MAIS consistance 35% + DD 8%/4%) =====');
const rP = [];
for (const risk of [0.5, 0.75, 1.0, 1.25, 1.5]) {
  rP.push({ risque: risk + '%', ...pipeline(raw, { risk, target1: 7, target2: 7, maxDD: 8, dayDD: 4, consistency: 0.35, fee: 500 }) });
}
console.log(fmtTable(rP));

console.log('\n===== Contrôle : FT+ SANS la règle de consistance (pour isoler son coût) =====');
const rC = [];
for (const risk of [1.0, 1.5]) {
  rC.push({ risque: risk + '%', ...pipeline(raw, { risk, target1: 7, target2: 7, maxDD: 8, dayDD: 4, fee: 500 }) });
}
console.log(fmtTable(rC));
