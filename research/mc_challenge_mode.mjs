// "Mode challenge" : à 1.5% de risque, comparer les règles normales (3 trend + 3 MR possibles)
// avec un cap TOTAL de 3 positions (trend+MR confondus) qui neutralise structurellement la règle des −5%/jour.
import { simulate } from './bt_portfolio.mjs';
import { fmtTable, stats } from './lib.mjs';

function buildSeq(opts) {
  const { trades, mrTrades } = simulate('1h', opts);
  return [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
}
const seqStd = buildSeq({ maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const seqCap = buildSeq({ maxConc: 3, maxPerDay: 3, withMR: true, conflict: true, totalCap: 3 });
console.log('Qualité des séquences (2 ans, en R) :');
console.log(fmtTable([
  { config: 'règles normales (jusqu à 6 pos.)', ...stats(seqStd) },
  { config: 'cap TOTAL 3 positions', ...stats(seqCap) },
]));

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
  let bustP1 = 0, tries = 0;
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length);
    const start = idx;
    let fees = FEE, funded = false;
    while (!funded && (idx - start) / perMonth < 60) {
      tries++;
      const [r1, i1] = phase(riskPct, 10, idx); idx = i1;
      if (r1 === 'bust') { bustP1++; fees += FEE; continue; }
      const [r2, i2] = phase(riskPct, 5, idx); idx = i2;
      if (r2 === 'bust') { fees += FEE; continue; }
      funded = true;
    }
    months.push((idx - start) / perMonth); feesArr.push(fees);
  }
  months.sort((a, b) => a - b);
  return {
    'médiane': months[Math.floor(sims / 2)].toFixed(1) + ' mois',
    '90e pct': months[Math.floor(sims * 0.9)].toFixed(1) + ' mois',
    '≤3 mois': (100 * months.filter(m => m <= 3).length / sims).toFixed(0) + '%',
    '≤6 mois': (100 * months.filter(m => m <= 6).length / sims).toFixed(0) + '%',
    'frais moyens': Math.round(feesArr.reduce((a, b) => a + b, 0) / sims) + '€',
  };
}

console.log('\nParcours complet jusqu au financement, à 1.5% de risque :');
console.log(fmtTable([
  { config: 'règles normales', ...pipeline(seqStd, 1.5) },
  { config: 'MODE CHALLENGE (cap total 3)', ...pipeline(seqCap, 1.5) },
]));
console.log('\nEt à 1.25% pour comparaison :');
console.log(fmtTable([
  { config: 'règles normales', ...pipeline(seqStd, 1.25) },
  { config: 'MODE CHALLENGE (cap total 3)', ...pipeline(seqCap, 1.25) },
]));
