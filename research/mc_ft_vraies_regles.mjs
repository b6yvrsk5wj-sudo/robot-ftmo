// SIMULATION AVEC LES VRAIES RÈGLES FT+ 1-STEP EXPRESS (lues sur help.fundedtradingplus.com le 2026-08-24)
// Cible 10% | DD max 6% RELATIF (TRAILING sur high water mark, plafonné au solde initial) | DD jour 4% | SANS SWAP
// vs FTMO : cibles 10%+5% | DD 10% STATIQUE | DD jour 5% | AVEC SWAP
// ⚠️ Ma simulation précédente supposait 8% STATIQUE chez FT+ : c'était FAUX. Le trailing change tout.
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

// trailing=true : plancher = min(pic - maxDD, 0)  [plafonné au solde initial, cf. doc FT+]
// trailing=false : plancher = -maxDD (statique)
function pipeline(seq, { risk, targets, maxDD, dayDD, trailing, fee, sims = 20000 }) {
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
      if (ds <= -dayDD) return ['bust', idx];
      if (eq <= floor) return ['bust', idx];
      if (eq >= target) return ['pass', idx];
    }
    return ['bust', idx];
  }
  const months = [], fees = []; let ok = 0;
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length); const st = idx; let f = fee, done = false;
    while (!done && (idx - st) / perMonth < 60) {
      let bust = false;
      for (const tg of targets) { const [res, i2] = phase(tg, idx); idx = i2; if (res === 'bust') { bust = true; break; } }
      if (bust) { f += fee; continue; }
      done = true;
    }
    if (done) ok++;
    months.push((idx - st) / perMonth); fees.push(f);
  }
  months.sort((a, b) => a - b);
  return { 'médiane': months[sims / 2 | 0].toFixed(1) + ' mois', '90e pct': months[sims * 0.9 | 0].toFixed(1) + ' mois', '≤6 mois': (100 * months.filter(m => m <= 6).length / sims).toFixed(0) + '%', 'frais moyens': Math.round(fees.reduce((a, b) => a + b, 0) / sims) + '€' };
}

console.log('===== FTMO — 2 phases (10%+5%), DD 10% STATIQUE, jour 5%, AVEC swaps =====');
const a = [];
for (const risk of [1.0, 1.25, 1.5]) a.push({ risque: risk + '%', ...pipeline(swapped, { risk, targets: [10, 5], maxDD: 10, dayDD: 5, trailing: false, fee: 540 }) });
console.log(fmtTable(a));

console.log('\n===== FT+ 1-STEP EXPRESS — VRAIES RÈGLES : 1 phase (10%), DD 6% TRAILING, jour 4%, SANS swap =====');
const b = [];
for (const risk of [0.5, 0.75, 1.0, 1.25, 1.5]) b.push({ risque: risk + '%', ...pipeline(raw, { risk, targets: [10], maxDD: 6, dayDD: 4, trailing: true, fee: 600 }) });
console.log(fmtTable(b));

console.log('\n===== Ce que j avais simulé À TORT (8% statique) — pour mesurer mon erreur =====');
const c = [];
for (const risk of [1.0, 1.25]) c.push({ risque: risk + '%', ...pipeline(raw, { risk, targets: [10], maxDD: 8, dayDD: 4, trailing: false, fee: 600 }) });
console.log(fmtTable(c));

console.log('\n===== Drawdown historique de la stratégie (pour situer le 6%) =====');
let eq = 0, peak = 0, mdd = 0;
for (const t of swapped) { eq += t.r; if (eq > peak) peak = eq; if (peak - eq > mdd) mdd = peak - eq; }
console.log(`maxDD historique (net de swap) : ${mdd.toFixed(1)}R`);
for (const r of [0.5, 0.75, 1.0, 1.25, 1.5]) console.log(`  à ${r}% de risque => drawdown de ${(mdd * r).toFixed(1)}% ${mdd * r > 6 ? '❌ dépasse les 6% de FT+' : '✅ tient sous 6%'}`);
