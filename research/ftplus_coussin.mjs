// Le support FT+ a CONFIRMÉ par écrit le scénario pessimiste (2026-09) :
// « balance $101,000, drawdown floor remains at $100,000, a further $1,000 loss would breach the account ».
// PARADE TESTÉE ICI : ne pas tout retirer — laisser un coussin au-dessus du plancher.
// Question : un coussin suffit-il à rendre le compte financé FT+ viable ?
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
const span = (raw[raw.length - 1].exitT - raw[0].exitT) / (30.44 * 86400000);
const perMonth = raw.length / span;

// cushion = % d'équité conservé au-dessus du plancher lors de chaque retrait
function run(seq, { risk, maxDDp, dailyLim, trailing, split, cushion = 0, sims = 20000 }) {
  const horizon = Math.round(12 * perMonth), payEvery = Math.round(perMonth);
  const dk = (j, off) => new Date(seq[j % seq.length].exitT).toISOString().slice(0, 10) + '#' + off;
  let dead = 0; const inc = [];
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length);
    let eq = 0, peak = 0, cur = '', ds = 0, bank = 0, alive = true;
    for (let k = 0; k < horizon; k++) {
      const key = dk(idx, Math.floor(k / seq.length));
      if (key !== cur) { cur = key; ds = 0; }
      const r = seq[idx % seq.length].r * risk; eq += r; ds += r; idx++;
      if (eq > peak) peak = eq;
      const floor = trailing ? Math.min(peak - maxDDp, 0) : -maxDDp;
      if (ds <= -dailyLim || eq <= floor) { dead++; alive = false; break; }
      // retrait mensuel : on ne retire que ce qui dépasse le coussin
      if (k > 0 && k % payEvery === 0) {
        const dispo = eq - cushion;
        if (dispo > 0) { bank += dispo * split; eq -= dispo; }
      }
    }
    if (alive) inc.push(bank + Math.max(eq, 0) * split);
  }
  const avg = inc.length ? inc.reduce((a, b) => a + b, 0) / inc.length : 0;
  return { 'survie': (100 * (sims - dead) / sims).toFixed(0) + '%', 'espérance/an': ((sims - dead) / sims * avg).toFixed(1) + '%' };
}

console.log('=== FT+ COMPTE FINANCÉ : la parade du coussin sauve-t-elle la mise ? ===');
console.log('(règles confirmées par leur support : 6% trailing, plancher figé au capital initial)\n');
const rows = [];
for (const cushion of [0, 2, 4, 6]) {
  for (const risk of [0.3, 0.5, 0.7]) {
    rows.push({ 'coussin gardé': cushion + '%', risque: risk + '%', ...run(raw, { risk, maxDDp: 6, dailyLim: 4, trailing: true, split: 0.8, cushion }) });
  }
}
console.log(fmtTable(rows));

console.log('\n=== RÉFÉRENCE FTMO (10% statique, avec swaps) ===');
const r2 = [];
for (const risk of [0.5, 0.7, 0.9]) r2.push({ risque: risk + '%', ...run(swapped, { risk, maxDDp: 10, dailyLim: 5, trailing: false, split: 0.8, cushion: 0 }) });
console.log(fmtTable(r2));

console.log('\n=== OPTIMUM DE CHAQUE OFFRE (balayage risque x coussin) ===');
let bestF = null;
for (let c = 0; c <= 6; c += 1) for (let risk = 0.2; risk <= 1.0; risk += 0.1) {
  const r = run(raw, { risk, maxDDp: 6, dailyLim: 4, trailing: true, split: 0.8, cushion: c, sims: 5000 });
  const e = parseFloat(r['espérance/an']); if (!bestF || e > bestF.e) bestF = { e, risk, c, r };
}
console.log(`FT+  optimum : risque ${bestF.risk.toFixed(1)}%, coussin ${bestF.c}% -> survie ${bestF.r.survie}, espérance ${bestF.e.toFixed(1)}%/an`);
let bestT = null;
for (let risk = 0.2; risk <= 1.2; risk += 0.1) {
  const r = run(swapped, { risk, maxDDp: 10, dailyLim: 5, trailing: false, split: 0.8, sims: 5000 });
  const e = parseFloat(r['espérance/an']); if (!bestT || e > bestT.e) bestT = { e, risk, r };
}
console.log(`FTMO optimum : risque ${bestT.risk.toFixed(1)}% -> survie ${bestT.r.survie}, espérance ${bestT.e.toFixed(1)}%/an`);
