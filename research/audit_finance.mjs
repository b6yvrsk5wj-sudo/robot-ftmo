// AUDIT FINAL — COMPTE FINANCÉ FT+ : optimiser risque x cap x coussin.
// Règles confirmées : 6% trailing, plancher figé au capital initial, DD jour 4%, sans swap, split 80%.
import { simulate } from './bt_portfolio.mjs';
import { fmtTable, stats } from './lib.mjs';

function build(cap) {
  const { trades, mrTrades } = simulate('1h', { maxConc: cap, maxPerDay: 3, withMR: true, conflict: true, totalCap: cap });
  return [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
}
const S = { 2: build(2), 3: build(3) };
const span = (S[3][S[3].length - 1].exitT - S[3][0].exitT) / (30.44 * 86400000);

function run(seq, { risk, cushion, sims = 15000 }) {
  const perMonth = seq.length / span;
  const horizon = Math.round(12 * perMonth), payEvery = Math.round(perMonth);
  const dk = (j, off) => new Date(seq[j % seq.length].exitT).toISOString().slice(0, 10) + '#' + off;
  let dead = 0; const inc = [];
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length);
    let eq = 0, peak = 0, cur = '', ds = 0, bank = 0, alive = true;
    for (let k = 0; k < horizon; k++) {
      const key = dk(idx, Math.floor(k / seq.length)); if (key !== cur) { cur = key; ds = 0; }
      const r = seq[idx % seq.length].r * risk; eq += r; ds += r; idx++;
      if (eq > peak) peak = eq;
      if (ds <= -4 || eq <= Math.min(peak - 6, 0)) { dead++; alive = false; break; }
      if (k > 0 && k % payEvery === 0) { const d2 = eq - cushion; if (d2 > 0) { bank += d2 * 0.8; eq -= d2; } }
    }
    if (alive) inc.push(bank + Math.max(eq, 0) * 0.8);
  }
  const avg = inc.length ? inc.reduce((a, b) => a + b, 0) / inc.length : 0;
  return { survie: (100 * (sims - dead) / sims).toFixed(0) + '%', 'espérance/an': ((sims - dead) / sims * avg).toFixed(1) + '%' };
}

console.log('Qualité des séquences :');
console.log(fmtTable([{ cap: 3, ...stats(S[3]) }, { cap: 2, ...stats(S[2]) }]));

console.log('\n===== COMPTE FINANCÉ FT+ : risque x cap x coussin (12 mois, retraits mensuels) =====\n');
const rows = [];
for (const cap of [3, 2]) for (const cushion of [4, 6, 8]) for (const risk of [0.5, 0.7, 0.9]) {
  if (cap * risk > 4) continue;
  rows.push({ cap, coussin: cushion + '%', risque: risk + '%', ...run(S[cap], { risk, cushion }) });
}
console.log(fmtTable(rows));

console.log('\n===== OPTIMUM (balayage fin) =====');
let best = null;
for (const cap of [2, 3]) for (let c = 3; c <= 10; c += 1) for (let risk = 0.3; risk <= 1.2; risk += 0.1) {
  if (cap * risk > 4) continue;
  const r = run(S[cap], { risk, cushion: c, sims: 4000 });
  const e = parseFloat(r['espérance/an']);
  if (!best || e > best.e) best = { e, cap, c, risk, r };
}
console.log(`Optimum : cap ${best.cap}, risque ${best.risk.toFixed(1)}%, coussin ${best.c}% -> survie ${best.r.survie}, espérance ${best.e.toFixed(1)}%/an`);
