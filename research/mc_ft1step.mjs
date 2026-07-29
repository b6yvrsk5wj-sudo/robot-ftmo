// FT+ 1-STEP EXPRESS : sans swap, SANS règle de consistance, week-end OK, UNE SEULE phase (cible 10%),
// mais DD max 8% statique et DD JOUR 4% (plus serré que FTMO 10%/5%).
// Comparé à FTMO (2 phases 10%+5%, DD 10%/5%, AVEC swaps).
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
import { fmtTable } from './lib.mjs';
const WED = 1.28;

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const raw = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);       // SANS swap
const swapped = raw.map(t => {                                                // AVEC swap (FTMO)
  const d = ((t.exitT - t.entryT) / 86400000) * WED;
  return { ...t, r: t.r + (REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * d };
});

function pipeline(seq, { risk, targets, maxDD, dayDD, fee, sims = 20000 }) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
  const perMonth = seq.length / span;
  const dk = i => new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + Math.floor(i / seq.length);
  function phase(target, idx) {
    let eq = 0, cur = '', ds = 0; const cap = idx + seq.length * 6;
    while (idx < cap) {
      const k = dk(idx); if (k !== cur) { cur = k; ds = 0; }
      const r = seq[idx % seq.length].r * risk; eq += r; ds += r; idx++;
      if (ds <= -dayDD || eq <= -maxDD) return ['bust', idx];
      if (eq >= target) return ['pass', idx];
    }
    return ['bust', idx];
  }
  const months = [], fees = [];
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length); const st = idx; let f = fee, ok = false;
    while (!ok && (idx - st) / perMonth < 60) {
      let busted = false;
      for (const tg of targets) { const [res, i2] = phase(tg, idx); idx = i2; if (res === 'bust') { busted = true; break; } }
      if (busted) { f += fee; continue; }
      ok = true;
    }
    months.push((idx - st) / perMonth); fees.push(f);
  }
  months.sort((a, b) => a - b);
  return { 'médiane': months[sims / 2 | 0].toFixed(1) + ' mois', '90e pct': months[sims * 0.9 | 0].toFixed(1) + ' mois', '≤6 mois': (100 * months.filter(m => m <= 6).length / sims).toFixed(0) + '%', 'frais moyens': Math.round(fees.reduce((a, b) => a + b, 0) / sims) + '€' };
}

console.log('===== FTMO : 2 phases (10%+5%), DD 10%/jour 5%, AVEC swaps, frais 540€ =====');
const a = [];
for (const risk of [1.0, 1.25, 1.5]) a.push({ risque: risk + '%', ...pipeline(swapped, { risk, targets: [10, 5], maxDD: 10, dayDD: 5, fee: 540 }) });
console.log(fmtTable(a));

console.log('\n===== FT+ 1-STEP EXPRESS : 1 phase (10%), DD 8% statique/jour 4%, SANS swap =====');
console.log('(frais supposés 600€ — À VÉRIFIER, le prix réel change le budget mais pas le délai)');
const b = [];
for (const risk of [0.75, 1.0, 1.25, 1.5]) b.push({ risque: risk + '%', ...pipeline(raw, { risk, targets: [10], maxDD: 8, dayDD: 4, fee: 600 }) });
console.log(fmtTable(b));

console.log('\n===== Sensibilité : et si le DD jour 4% était le vrai obstacle ? =====');
console.log('(FT+ 1-step avec DD jour hypothétique 5% pour isoler l effet)');
const c = [];
for (const risk of [1.0, 1.25, 1.5]) c.push({ risque: risk + '%', ...pipeline(raw, { risk, targets: [10], maxDD: 8, dayDD: 5, fee: 600 }) });
console.log(fmtTable(c));
