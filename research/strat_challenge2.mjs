// Comparaison directe sur le SEUL objectif du challenge : atteindre +10% avant -10%.
// Systèmes comparés, tous nets des swaps réels FTMO.
import { INSTR, COST_PTS, sma, rsi, atr, ema, stats, loadData, fmtTable } from './lib.mjs';
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const swR = (i, dir, px, rk, ms) => (REAL_RATES[i][dir === 1 ? 'L' : 'S'] / 100) * (px / rk) * ((ms / 86400000) * WED);

function runMR(bars, name, { entry = 10 } = {}) {
  const c = bars.map(x => x.c);
  const s200 = sma(c, 200), r2 = rsi(c, 2), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const b = bars[i];
    if (pos) {
      pos.held++;
      let x = null;
      if (b.o <= pos.sl) x = b.o; else if (b.l <= pos.sl) x = pos.sl;
      else if (r2[i] > 65 || pos.held >= 10) x = b.c;
      if (x !== null) { out.push({ instr: name, dir: 1, entryT: pos.entryT, exitT: b.t, r: (x - pos.entry) / pos.riskDist - cost / pos.riskDist + swR(name, 1, pos.entry, pos.riskDist, b.t - pos.entryT) }); pos = null; }
      continue;
    }
    if (s200[i] == null || a14[i] == null || r2[i] == null) continue;
    if (!(b.c > s200[i] && r2[i] < entry)) continue;
    pos = { entry: b.c, entryT: b.t, riskDist: 3 * a14[i], sl: b.c - 3 * a14[i], held: 0 };
  }
  return out;
}

const d1d = loadData('1d');
const ALL = ['US500', 'US100', 'US30', 'XAUUSD'];
const mkMR = opt => { let o = []; for (const n of ALL) if (d1d[n]) o = o.concat(runMR(d1d[n], n, opt)); return o.sort((a, b) => a.exitT - b.exitT); };

// système actuel (trend 1h + MR), net de swaps — 2 ans
const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const actuel = [...trades, ...mrTrades].map(t => ({ ...t, r: t.r + swR(t.instr, t.dir, t.entryPx, t.riskDist, t.exitT - t.entryT) })).sort((a, b) => a.exitT - b.exitT);
const trendSeul = trades.map(t => ({ ...t, r: t.r + swR(t.instr, t.dir, t.entryPx, t.riskDist, t.exitT - t.entryT) })).sort((a, b) => a.exitT - b.exitT);

function challenge(seq, risk, sims = 30000) {
  const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000);
  const pm = seq.length / span;
  const months = []; let pass = 0;
  for (let s = 0; s < sims; s++) {
    let i = Math.floor(Math.random() * seq.length); const st = i;
    let eq = 0, cur = '', ds = 0; const cap = i + seq.length * 8;
    while (i < cap) {
      const k = new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + (i / seq.length | 0);
      if (k !== cur) { cur = k; ds = 0; }
      const r = seq[i % seq.length].r * risk; eq += r; ds += r; i++;
      if (ds <= -5 || eq <= -10) break;
      if (eq >= 10) { pass++; months.push((i - st) / pm); break; }
    }
  }
  months.sort((a, b) => a - b);
  return { 'réussite': (100 * pass / sims).toFixed(0) + '%', 'médiane': months.length ? months[months.length / 2 | 0].toFixed(1) + ' mois' : '-', '90e pct': months.length ? months[Math.floor(months.length * 0.9)].toFixed(1) + ' mois' : '-' };
}

const S = {
  'SYSTÈME ACTUEL (trend + MR)': actuel,
  'TREND seul': trendSeul,
  'MR seule (RSI2<10, 4 instr)': mkMR({ entry: 10 }),
  'MR élargie (RSI2<20, 4 instr)': mkMR({ entry: 20 }),
};
console.log('===== QUALITÉ DES SÉQUENCES (nettes de swaps) =====');
console.log(fmtTable(Object.entries(S).map(([lb, s]) => {
  const st = stats(s); const yrs = (s[s.length - 1].exitT - s[0].exitT) / (365.25 * 86400000);
  return { système: lb, n: st.n, 'trades/an': (st.n / yrs).toFixed(0), 'réussite': st.winRate + '%', PF: st.pf, 'R/an': (st.totalR / yrs).toFixed(2), maxDD: st.maxDD_R };
})));

console.log('\n===== OBJECTIF UNIQUE : +10% AVANT -10% =====');
const rows = [];
for (const [lb, s] of Object.entries(S)) for (const risk of [1, 1.5, 2]) rows.push({ système: lb.slice(0, 28), risque: risk + '%', ...challenge(s, risk) });
console.log(fmtTable(rows));
