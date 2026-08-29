// AUDIT FINAL : quel risque pour le challenge FT+ 1-Step Express ? 1.25% est-il raisonnable ou suicidaire ?
// Règles confirmées par le support : cible 10%, DD 6% TRAILING (plancher figé au capital initial), DD jour 4%, sans swap.
// Balayage fin, avec coût attendu (384$ la tentative, resets à -20%).
import { simulate } from './bt_portfolio.mjs';
import { fmtTable } from './lib.mjs';

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const seq = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT); // SANS swap (FT+)
const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
const perMonth = seq.length / span;
const P1 = 384, RESET = 439;

function run(risk, sims = 30000) {
  const dk = (j, off) => new Date(seq[j % seq.length].exitT).toISOString().slice(0, 10) + '#' + off;
  function attempt(start) {
    let eq = 0, peak = 0, cur = '', ds = 0, i = start, n = 0;
    const cap = start + seq.length * 6;
    while (i < cap) {
      const k = dk(i, Math.floor(i / seq.length)); if (k !== cur) { cur = k; ds = 0; }
      const r = seq[i % seq.length].r * risk; eq += r; ds += r; i++; n++;
      if (eq > peak) peak = eq;
      const floor = Math.min(peak - 6, 0);
      if (ds <= -4 || eq <= floor) return { res: 'bust', i, n };
      if (eq >= 10) return { res: 'pass', i, n };
    }
    return { res: 'bust', i, n };
  }
  let passFirst = 0; const months = [], costs = [], tries = [];
  for (let s = 0; s < sims; s++) {
    let i = Math.floor(Math.random() * seq.length); const st = i;
    let cost = P1, k = 0, ok = false;
    while (!ok && k < 12) {
      const a = attempt(i); i = a.i; k++;
      if (a.res === 'pass') { ok = true; if (k === 1) passFirst++; }
      else cost += RESET;
    }
    months.push((i - st) / perMonth); costs.push(cost); tries.push(k);
  }
  months.sort((a, b) => a - b);
  return {
    risque: risk.toFixed(2) + '%',
    'réussite 1re tentative': (100 * passFirst / sims).toFixed(0) + '%',
    'tentatives moy': (tries.reduce((a, b) => a + b, 0) / sims).toFixed(1),
    'médiane': months[sims / 2 | 0].toFixed(1) + ' mois',
    '90e pct': months[sims * 0.9 | 0].toFixed(1) + ' mois',
    'coût moyen': Math.round(costs.reduce((a, b) => a + b, 0) / sims) + '$',
  };
}

console.log('===== CHALLENGE FT+ 1-STEP EXPRESS : BALAYAGE DU RISQUE =====');
console.log('(cible 10%, DD 6% trailing, DD jour 4%, sans swap, 384$ la 1re tentative puis 439$)\n');
const rows = [];
for (const r of [0.5, 0.6, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0]) rows.push(run(r));
console.log(fmtTable(rows));
