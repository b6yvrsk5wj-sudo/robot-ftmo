// NOUVELLE DONNÉE (2026-08-24) : FTMO propose AUSSI un challenge 1-STEP (499€, cible 10%, une phase).
// Comparaison des deux offres 1-step, avec leurs vraies règles :
//   FTMO 1-Step   : 10% cible | DD 10% STATIQUE | jour 5% | AVEC swaps | 499€ | frais NON remboursés
//   FTMO 2-Step   : 10%+5%    | DD 10% STATIQUE | jour 5% | AVEC swaps | 540€ | frais REMBOURSÉS au 1er payout
//   FT+ 1-Step Ex : 10% cible | DD 6% TRAILING  | jour 4% | SANS swap  | 549$ | remboursement à confirmer
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
import { fmtTable } from './lib.mjs';
const WED = 1.28;

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const raw = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
const swapped = raw.map(t => {
  const d = ((t.exitT - t.entryT) / 86400000) * WED;
  return { ...t, r: t.r + (REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * d };
});

function pipeline(seq, { risk, targets, maxDD, dayDD, trailing, fee, refund = false, sims = 20000 }) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
  const perMonth = seq.length / span;
  const dk = i => new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + Math.floor(i / seq.length);
  function phase(target, idx) {
    let eq = 0, peak = 0, cur = '', ds = 0; const cap = idx + seq.length * 6;
    while (idx < cap) {
      const k = dk(idx); if (k !== cur) { cur = k; ds = 0; }
      const r = seq[idx % seq.length].r * risk; eq += r; ds += r; idx++;
      if (eq > peak) peak = eq;
      const floor = trailing ? Math.min(peak - maxDD, 0) : -maxDD;
      if (ds <= -dayDD || eq <= floor) return ['bust', idx];
      if (eq >= target) return ['pass', idx];
    }
    return ['bust', idx];
  }
  const months = [], costs = [];
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length); const st = idx; let paid = fee, done = false;
    while (!done && (idx - st) / perMonth < 60) {
      let bust = false;
      for (const tg of targets) { const [res, i2] = phase(tg, idx); idx = i2; if (res === 'bust') { bust = true; break; } }
      if (bust) { paid += fee; continue; }
      done = true;
    }
    months.push((idx - st) / perMonth);
    costs.push(done && refund ? paid - fee : paid); // remboursement de la tentative gagnante
  }
  months.sort((a, b) => a - b);
  return {
    'médiane': months[sims / 2 | 0].toFixed(1) + ' mois', '90e pct': months[sims * 0.9 | 0].toFixed(1) + ' mois',
    '≤6 mois': (100 * months.filter(m => m <= 6).length / sims).toFixed(0) + '%',
    'coût net moyen': Math.round(costs.reduce((a, b) => a + b, 0) / sims) + '€',
  };
}

const rows = [];
for (const risk of [1.0, 1.25, 1.5]) {
  rows.push({ offre: `FTMO 2-Step ${risk}%`, ...pipeline(swapped, { risk, targets: [10, 5], maxDD: 10, dayDD: 5, trailing: false, fee: 540, refund: true }) });
  rows.push({ offre: `FTMO 1-Step ${risk}%`, ...pipeline(swapped, { risk, targets: [10], maxDD: 10, dayDD: 5, trailing: false, fee: 499, refund: false }) });
  rows.push({ offre: `FT+ 1-Step ${risk}%`, ...pipeline(raw, { risk, targets: [10], maxDD: 6, dayDD: 4, trailing: true, fee: 500, refund: false }) });
  rows.push({ offre: '---', médiane: '', '90e pct': '', '≤6 mois': '', 'coût net moyen': '' });
}
console.log('===== LES TROIS OFFRES, VRAIES RÈGLES ET VRAIS PRIX =====');
console.log(fmtTable(rows));
