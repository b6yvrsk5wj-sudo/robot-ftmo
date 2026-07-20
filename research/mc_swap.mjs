// Monte Carlo du challenge (mode challenge: 1.5%, cap total 3) AVEC swaps estimés — recalibrage du plan.
import { simulate } from './bt_portfolio.mjs';
import { fmtTable } from './lib.mjs';

import { REAL_RATES } from './bt_swap.mjs';
const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true, totalCap: 3 });
function applySwap(seq) {
  return seq.map(t => {
    const days = (t.exitT - t.entryT) / 86400000;
    const rate = REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'];
    return { ...t, r: t.r + (rate / 100) * (t.entryPx / t.riskDist) * days };
  });
}
const raw = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
const seqs = { 'sans swap (plan actuel)': raw, 'avec TAUX RÉELS MT5': applySwap(raw) };

const FEE = 540;
function pipeline(seq, riskPct, sims = 20000) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
  const perMonth = seq.length / span;
  const dayOf = i => new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + Math.floor(i / seq.length);
  function phase(risk, target, idx) {
    let eq = 0, curDay = '', daySum = 0;
    const cap = idx + seq.length * 5;
    while (idx < cap) {
      const dk = dayOf(idx);
      if (dk !== curDay) { curDay = dk; daySum = 0; }
      const r = seq[idx % seq.length].r * risk;
      eq += r; daySum += r; idx++;
      if (daySum <= -5 || eq <= -10) return ['bust', idx];
      if (eq >= target) return ['pass', idx];
    }
    return ['bust', idx];
  }
  const months = [], feesArr = [];
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length);
    const start = idx; let fees = FEE, funded = false;
    while (!funded && (idx - start) / perMonth < 60) {
      const [r1, i1] = phase(riskPct, 10, idx); idx = i1;
      if (r1 === 'bust') { fees += FEE; continue; }
      const [r2, i2] = phase(riskPct, 5, idx); idx = i2;
      if (r2 === 'bust') { fees += FEE; continue; }
      funded = true;
    }
    months.push((idx - start) / perMonth); feesArr.push(fees);
  }
  months.sort((a, b) => a - b);
  return {
    'médiane': months[Math.floor(sims / 2)].toFixed(1) + ' mois', '90e pct': months[Math.floor(sims * 0.9)].toFixed(1) + ' mois',
    '≤6 mois': (100 * months.filter(m => m <= 6).length / sims).toFixed(0) + '%',
    'frais moyens': Math.round(feesArr.reduce((a, b) => a + b, 0) / sims) + '€',
  };
}
console.log('===== CHALLENGE (mode challenge 1.5%, cap total 3) — recalibrage avec swaps =====');
const rows = [];
for (const [label, seq] of Object.entries(seqs)) rows.push({ scénario: label, ...pipeline(seq, 1.5) });
console.log(fmtTable(rows));
