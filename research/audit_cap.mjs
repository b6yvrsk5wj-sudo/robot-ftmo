// CONTRAINTE STRUCTURELLE DÉCOUVERTE : la limite journalière FT+ est de 4%.
// Avec un cap de 3 positions, une journée où les 3 stops sautent = -3 x risque%.
//   3 x 1.25% = 3.75% -> passe sous 4% ✅   |   3 x 1.5% = 4.5% -> BREACH ❌
// => 1.25% est le risque MAXIMUM structurellement sûr avec cap 3.
// Alternative testée : baisser le cap pour pouvoir monter le risque.
import { simulate } from './bt_portfolio.mjs';
import { fmtTable, stats } from './lib.mjs';

const P1 = 384, RESET = 439;
function build(cap) {
  const { trades, mrTrades } = simulate('1h', { maxConc: cap, maxPerDay: 3, withMR: true, conflict: true, totalCap: cap });
  return [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
}
function run(seq, risk, sims = 25000) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
  const perMonth = seq.length / span;
  const dk = (j, off) => new Date(seq[j % seq.length].exitT).toISOString().slice(0, 10) + '#' + off;
  function attempt(start) {
    let eq = 0, peak = 0, cur = '', ds = 0, i = start;
    const cap2 = start + seq.length * 6;
    while (i < cap2) {
      const k = dk(i, Math.floor(i / seq.length)); if (k !== cur) { cur = k; ds = 0; }
      const r = seq[i % seq.length].r * risk; eq += r; ds += r; i++;
      if (eq > peak) peak = eq;
      if (ds <= -4) return { res: 'bust', i, cause: 'jour' };
      if (eq <= Math.min(peak - 6, 0)) return { res: 'bust', i, cause: 'DD' };
      if (eq >= 10) return { res: 'pass', i };
    }
    return { res: 'bust', i, cause: 'temps' };
  }
  let first = 0, dayBust = 0; const months = [], costs = [];
  for (let s = 0; s < sims; s++) {
    let i = Math.floor(Math.random() * seq.length); const st = i;
    let cost = P1, k = 0, ok = false;
    while (!ok && k < 12) {
      const a = attempt(i); i = a.i; k++;
      if (a.res === 'pass') { ok = true; if (k === 1) first++; }
      else { if (a.cause === 'jour') dayBust++; cost += RESET; }
    }
    months.push((i - st) / perMonth); costs.push(cost);
  }
  months.sort((a, b) => a - b);
  return {
    'réussite 1re': (100 * first / sims).toFixed(0) + '%',
    'médiane': months[sims / 2 | 0].toFixed(1) + ' mois',
    '90e pct': months[sims * 0.9 | 0].toFixed(1) + ' mois',
    'coût moyen': Math.round(costs.reduce((a, b) => a + b, 0) / sims) + '$',
    'échecs "jour"': (dayBust / sims).toFixed(2) + '/parcours',
  };
}

console.log('===== RISQUE x CAP DE POSITIONS — challenge FT+ =====');
console.log('(pire journée théorique = cap x risque ; limite FT+ = 4%)\n');
const rows = [];
for (const [cap, risks] of [[3, [1.0, 1.25]], [2, [1.25, 1.5, 1.75]], [1, [1.5, 2.0]]]) {
  const seq = build(cap);
  const q = stats(seq);
  for (const r of risks) {
    rows.push({ cap, risque: r + '%', 'pire jour théo': (cap * r).toFixed(2) + '%' + (cap * r > 4 ? ' ❌' : ' ✅'), ...run(seq, r) });
  }
  rows.push({ cap: '', risque: `(${seq.length} trades, PF ${q.pf})`, 'pire jour théo': '', 'réussite 1re': '', 'médiane': '', '90e pct': '', 'coût moyen': '', 'échecs "jour"': '' });
}
console.log(fmtTable(rows));
