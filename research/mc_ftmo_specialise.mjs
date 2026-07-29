// Si on RESTE chez FTMO : la config spécialisée (or 2 sens + shorts indices + MR, swap -73%)
// bat-elle le panier complet sur le parcours de challenge ? Règles FTMO : 10%/5%, DD 10%, jour 5%, pas de consistance.
import { INSTR, COST_PTS, ema, sma, rsi, atr, fmtTable, loadData, stats } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const swapR = (i, d, px, rk, ms) => (REAL_RATES[i][d === 1 ? 'L' : 'S'] / 100) * (px / rk) * ((ms / 86400000) * WED);

function runTrend(bars, name, { side = 0 } = {}) {
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i], pv = bars[i - 1];
    if (pos) {
      const { dir, entry, riskDist, sl } = pos, tp = entry + dir * 3 * riskDist;
      let x = null;
      if (dir === 1) { if (bar.o <= sl) x = bar.o; else if (bar.l <= sl) x = sl; else if (bar.o >= tp) x = bar.o; else if (bar.h >= tp) x = tp; }
      else { if (bar.o >= sl) x = bar.o; else if (bar.h >= sl) x = sl; else if (bar.o <= tp) x = bar.o; else if (bar.l <= tp) x = tp; }
      if (x !== null) {
        const g = dir * (x - entry) / riskDist - cost / riskDist;
        out.push({ instr: name, dir, entryT: pos.entryT, exitT: bar.t, r: g + swapR(name, dir, entry, riskDist, bar.t - pos.entryT) });
        pos = null;
      } else continue;
    }
    if (e200[i] == null || a14[i] == null || e21[i - 1] == null) continue;
    const aL = bar.c > e50[i] && e50[i] > e200[i], aS = bar.c < e50[i] && e50[i] < e200[i];
    const sL = aL && pv.l <= e21[i - 1] && bar.c > bar.o && bar.c > e21[i] && r14[i] < 70;
    const sS = aS && pv.h >= e21[i - 1] && bar.c < bar.o && bar.c < e21[i] && r14[i] > 30;
    if (!sL && !sS) continue;
    const dir = sL ? 1 : -1; if (side && dir !== side) continue;
    pos = { dir, entry: bar.c, entryT: bar.t, riskDist: 3 * a14[i], sl: bar.c - dir * 3 * a14[i] };
  }
  return out;
}
function runMR(bars, name) {
  const c = bars.map(x => x.c);
  const s200 = sma(c, 200), s5 = sma(c, 5), r2 = rsi(c, 2), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i];
    if (pos) {
      pos.held++;
      let x = null;
      if (bar.o <= pos.sl) x = bar.o; else if (bar.l <= pos.sl) x = pos.sl;
      else if (r2[i] > 65 || bar.c > s5[i] || pos.held >= 10) x = bar.c;
      if (x !== null) {
        const g = (x - pos.entry) / pos.riskDist - cost / pos.riskDist;
        out.push({ instr: name, dir: 1, entryT: pos.entryT, exitT: bar.t, r: g + swapR(name, 1, pos.entry, pos.riskDist, bar.t - pos.entryT) });
        pos = null;
      }
      continue;
    }
    if (s200[i] == null || a14[i] == null || r2[i] == null) continue;
    if (!(bar.c > s200[i] && r2[i] < 10)) continue;
    pos = { entry: bar.c, entryT: bar.t, riskDist: 3 * a14[i], sl: bar.c - 3 * a14[i], held: 0 };
  }
  return out;
}

const d1h = loadData('1h'), d1d = loadData('1d');
const IDX = ['US500', 'US100', 'US30'];
const cut = Date.now() - 730 * 86400000;

let full = runTrend(d1h.XAUUSD, 'XAUUSD');
for (const n of IDX) if (d1h[n]) full = full.concat(runTrend(d1h[n], n));
let spec = runTrend(d1h.XAUUSD, 'XAUUSD');
for (const n of IDX) if (d1h[n]) spec = spec.concat(runTrend(d1h[n], n, { side: -1 }));
let mr = []; for (const n of IDX) if (d1d[n]) mr = mr.concat(runMR(d1d[n], n).filter(t => t.exitT >= cut));
full = [...full, ...mr].sort((a, b) => a.exitT - b.exitT);
spec = [...spec, ...mr].sort((a, b) => a.exitT - b.exitT);

function pipeline(seq, risk, sims = 20000) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
  const perMonth = seq.length / span;
  const dk = i => new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + Math.floor(i / seq.length);
  function phase(target, idx) {
    let eq = 0, cur = '', ds = 0; const cap = idx + seq.length * 6;
    while (idx < cap) {
      const k = dk(idx); if (k !== cur) { cur = k; ds = 0; }
      const r = seq[idx % seq.length].r * risk; eq += r; ds += r; idx++;
      if (ds <= -5 || eq <= -10) return ['bust', idx];
      if (eq >= target) return ['pass', idx];
    }
    return ['bust', idx];
  }
  const months = [], fees = [];
  for (let s = 0; s < sims; s++) {
    let idx = Math.floor(Math.random() * seq.length); const st = idx; let f = 540, ok = false;
    while (!ok && (idx - st) / perMonth < 60) {
      const [a, i1] = phase(10, idx); idx = i1; if (a === 'bust') { f += 540; continue; }
      const [b, i2] = phase(5, idx); idx = i2; if (b === 'bust') { f += 540; continue; }
      ok = true;
    }
    months.push((idx - st) / perMonth); fees.push(f);
  }
  months.sort((a, b) => a - b);
  return { 'médiane': months[sims / 2 | 0].toFixed(1) + ' mois', '90e pct': months[sims * 0.9 | 0].toFixed(1) + ' mois', '≤6 mois': (100 * months.filter(m => m <= 6).length / sims).toFixed(0) + '%', 'frais': Math.round(fees.reduce((a, b) => a + b, 0) / sims) + '€' };
}

console.log('Qualité des séquences (2 ans, net de swap) :');
console.log(fmtTable([{ config: 'panier complet', ...stats(full) }, { config: 'spécialisée (or + shorts idx + MR)', ...stats(spec) }]));
console.log('\n===== PARCOURS CHALLENGE FTMO =====');
const rows = [];
for (const risk of [1.0, 1.25, 1.5]) {
  rows.push({ config: `panier complet ${risk}%`, ...pipeline(full, risk) });
  rows.push({ config: `SPÉCIALISÉE ${risk}%`, ...pipeline(spec, risk) });
}
console.log(fmtTable(rows));
