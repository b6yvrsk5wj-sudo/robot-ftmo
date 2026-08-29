// AUDIT INTRADAY 2/3 — robustesse dans les 2 ans + simulation de challenge sur les offres débloquées.
// L'intraday supprime le besoin de compte Swing => FTMO 1-STEP devient jouable (split 90%, une phase).
import { INSTR, stats, loadData, fmtTable } from './lib.mjs';
import { runIntra } from './intra_full1.mjs';
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const d = loadData('1h');
const A = 2;

const build = (opt, insts) => { let o = []; for (const n of insts) if (d[n]) o = o.concat(runIntra(d[n], n, opt)); return o.sort((a, b) => a.exitT - b.exitT); };
const C = {
  'intra 4 instr TP3R (non optimisé)': build({}, ['US500', 'US100', 'US30', 'XAUUSD']),
  'intra or+Nasdaq TP4R (optimisé)': build({ tpR: 4 }, ['XAUUSD', 'US100']),
};
// référence swing net de swaps
{
  const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
  C['SWING actuel (swaps réels)'] = [...trades, ...mrTrades].map(t => {
    const dd = ((t.exitT - t.entryT) / 86400000) * WED;
    return { ...t, r: t.r + (REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * dd };
  }).sort((a, b) => a.exitT - b.exitT);
}

console.log('===== ROBUSTESSE PAR SEMESTRE =====');
for (const [lb, seq] of Object.entries(C)) {
  const sem = {};
  for (const t of seq) { const x = new Date(t.exitT); const k = x.getUTCFullYear() + '-S' + (x.getUTCMonth() < 6 ? 1 : 2); (sem[k] = sem[k] || []).push(t); }
  const line = { config: lb };
  for (const [k, v] of Object.entries(sem).sort()) line[k] = stats(v).totalR;
  console.log(fmtTable([line]));
}

console.log('\n===== SYNTHÈSE =====');
console.log(fmtTable(Object.entries(C).map(([lb, s]) => {
  const st = stats(s);
  return { config: lb, n: st.n, 'trades/mois': (st.n / 24).toFixed(0), PF: st.pf, 'R/an': (st.totalR / A).toFixed(1), maxDD: st.maxDD_R, 'rdt/DD': (st.totalR / st.maxDD_R).toFixed(2) };
})));

// ---------- simulation de challenge ----------
function pipeline(seq, { risk, targets, maxDD, dayDD, trail, fee, refund, split, sims = 20000 }) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
  const pm = seq.length / span;
  const dk = (j, o) => new Date(seq[j % seq.length].exitT).toISOString().slice(0, 10) + '#' + o;
  const months = [], costs = [];
  for (let s = 0; s < sims; s++) {
    let i = Math.floor(Math.random() * seq.length); const st = i; let paid = fee, ok = false, guard = 0;
    while (!ok && guard++ < 12) {
      let bust = false;
      for (const tg of targets) {
        let eq = 0, peak = 0, cur = '', ds = 0; const cap = i + seq.length * 6;
        let res = null;
        while (i < cap) {
          const k = dk(i, Math.floor(i / seq.length)); if (k !== cur) { cur = k; ds = 0; }
          const r = seq[i % seq.length].r * risk; eq += r; ds += r; i++;
          if (eq > peak) peak = eq;
          const fl = trail ? Math.min(peak - maxDD, 0) : -maxDD;
          if ((dayDD && ds <= -dayDD) || eq <= fl) { res = 'bust'; break; }
          if (eq >= tg) { res = 'pass'; break; }
        }
        if (res !== 'pass') { bust = true; break; }
      }
      if (bust) { paid += fee; continue; }
      ok = true;
    }
    months.push((i - st) / pm); costs.push(ok && refund ? paid - fee : paid);
  }
  months.sort((a, b) => a - b);
  return { 'médiane': months[sims / 2 | 0].toFixed(1) + ' mois', '90e pct': months[sims * 0.9 | 0].toFixed(1) + ' mois', '≤6 mois': (100 * months.filter(m => m <= 6).length / sims).toFixed(0) + '%', 'coût net': Math.round(costs.reduce((a, b) => a + b, 0) / sims) + '€' };
}

console.log('\n===== CHALLENGE : ce que l intraday débloque =====');
console.log('FTMO 1-Step : 499€ non remboursés | 10% | DD 10% statique | JOUR 3% | split 90%');
console.log('FTMO 2-Step : 540€ REMBOURSÉS   | 10%+5% | DD 10% statique | jour 5% | split 80%\n');
const rows = [];
for (const [lb, seq] of Object.entries(C)) {
  for (const risk of [0.75, 1.0]) {
    rows.push({ stratégie: lb.slice(0, 26), offre: '1-Step', risque: risk + '%', ...pipeline(seq, { risk, targets: [10], maxDD: 10, dayDD: 3, trail: false, fee: 499, refund: false, split: 0.9 }) });
  }
  rows.push({ stratégie: lb.slice(0, 26), offre: '2-Step', risque: '1%', ...pipeline(seq, { risk: 1, targets: [10, 5], maxDD: 10, dayDD: 5, trail: false, fee: 540, refund: true, split: 0.8 }) });
  rows.push({ stratégie: '---', offre: '', risque: '', 'médiane': '', '90e pct': '', '≤6 mois': '', 'coût net': '' });
}
console.log(fmtTable(rows));
