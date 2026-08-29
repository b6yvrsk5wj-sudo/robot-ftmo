// RE-TEST DE L'INTRADAY — l'utilisateur a raison sur un point : on l'avait écarté AVANT de connaître les swaps.
// L'intraday ne paie AUCUN frais de nuit. La comparaison d'origine (brut contre brut) était donc biaisée de 51%.
// Ici : intraday NET (spread seulement) vs swing NET (spread + swaps réels FTMO).
import { INSTR, COST_PTS, ema, rsi, atr, sma, stats, byPeriod, loadData, fmtTable } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const hourOf = t => new Date(t).getUTCHours();
const dayOf = t => new Date(t).toISOString().slice(0, 10);

// ---------- stratégies INTRADAY (clôture forcée en fin de séance, jamais de nuit) ----------
// A) Opening Range Breakout : range des 2 premières heures, cassure, stop de l'autre côté, sortie au close
function orb(bars, name) {
  const cost = COST_PTS[name]; const out = [];
  const days = {};
  for (const b of bars) (days[dayOf(b.t)] = days[dayOf(b.t)] || []).push(b);
  for (const d of Object.values(days)) {
    if (d.length < 5) continue;
    const or = d.slice(0, 2);
    const hi = Math.max(...or.map(x => x.h)), lo = Math.min(...or.map(x => x.l));
    const rng = hi - lo; if (rng <= 0) continue;
    let pos = null;
    for (let i = 2; i < d.length; i++) {
      const b = d[i];
      if (!pos) {
        if (b.c > hi) pos = { dir: 1, entry: b.c, sl: b.c - rng, risk: rng, t: b.t };
        else if (b.c < lo) pos = { dir: -1, entry: b.c, sl: b.c + rng, risk: rng, t: b.t };
        continue;
      }
      const last = i === d.length - 1;
      let x = null;
      if (pos.dir === 1) { if (b.l <= pos.sl) x = pos.sl; else if (last) x = b.c; }
      else { if (b.h >= pos.sl) x = pos.sl; else if (last) x = b.c; }
      if (x !== null) { out.push({ instr: name, dir: pos.dir, entryT: pos.t, exitT: b.t, r: pos.dir * (x - pos.entry) / pos.risk - cost / pos.risk }); pos = null; break; }
    }
  }
  return out;
}
// B) Intraday mean reversion : RSI(4) extrême en séance, retour à la moyenne, sortie au close
function imr(bars, name) {
  const c = bars.map(x => x.c), r4 = rsi(c, 4), a14 = atr(bars, 14), s200 = sma(c, 200);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const b = bars[i], last = i === bars.length - 1 || dayOf(bars[i + 1].t) !== dayOf(b.t);
    if (pos) {
      let x = null;
      if (pos.dir === 1 && b.l <= pos.sl) x = pos.sl;
      else if (pos.dir === -1 && b.h >= pos.sl) x = pos.sl;
      else if (pos.dir === 1 && r4[i] > 55) x = b.c;
      else if (pos.dir === -1 && r4[i] < 45) x = b.c;
      else if (last) x = b.c;
      if (x !== null) { out.push({ instr: name, dir: pos.dir, entryT: pos.t, exitT: b.t, r: pos.dir * (x - pos.entry) / pos.risk - cost / pos.risk }); pos = null; }
      continue;
    }
    if (last || a14[i] == null || r4[i] == null || s200[i] == null) continue;
    const risk = 1.5 * a14[i];
    if (b.c > s200[i] && r4[i] < 15) pos = { dir: 1, entry: b.c, sl: b.c - risk, risk, t: b.t };
    else if (b.c < s200[i] && r4[i] > 85) pos = { dir: -1, entry: b.c, sl: b.c + risk, risk, t: b.t };
  }
  return out;
}
// C) Trend-pullback ACTUEL mais avec clôture forcée en fin de journée
function trendIntraday(bars, name) {
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const b = bars[i], pv = bars[i - 1], last = i === bars.length - 1 || dayOf(bars[i + 1].t) !== dayOf(b.t);
    if (pos) {
      const tp = pos.entry + pos.dir * 3 * pos.risk;
      let x = null;
      if (pos.dir === 1) { if (b.l <= pos.sl) x = pos.sl; else if (b.h >= tp) x = tp; else if (last) x = b.c; }
      else { if (b.h >= pos.sl) x = pos.sl; else if (b.l <= tp) x = tp; else if (last) x = b.c; }
      if (x !== null) { out.push({ instr: name, dir: pos.dir, entryT: pos.t, exitT: b.t, r: pos.dir * (x - pos.entry) / pos.risk - cost / pos.risk }); pos = null; }
      continue;
    }
    if (last || e200[i] == null || a14[i] == null || e21[i - 1] == null) continue;
    const aL = b.c > e50[i] && e50[i] > e200[i], aS = b.c < e50[i] && e50[i] < e200[i];
    const sL = aL && pv.l <= e21[i - 1] && b.c > b.o && b.c > e21[i] && r14[i] < 70;
    const sS = aS && pv.h >= e21[i - 1] && b.c < b.o && b.c < e21[i] && r14[i] > 30;
    if (!sL && !sS) continue;
    const dir = sL ? 1 : -1, risk = 3 * a14[i];
    pos = { dir, entry: b.c, sl: b.c - dir * risk, risk, t: b.t };
  }
  return out;
}
// référence : le swing actuel, NET des swaps réels
function swingNet(bars, name) {
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const b = bars[i], pv = bars[i - 1];
    if (pos) {
      const tp = pos.entry + pos.dir * 3 * pos.risk;
      let x = null;
      if (pos.dir === 1) { if (b.o <= pos.sl) x = b.o; else if (b.l <= pos.sl) x = pos.sl; else if (b.o >= tp) x = b.o; else if (b.h >= tp) x = tp; }
      else { if (b.o >= pos.sl) x = b.o; else if (b.h >= pos.sl) x = pos.sl; else if (b.o <= tp) x = b.o; else if (b.l <= tp) x = tp; }
      if (x !== null) {
        const days = ((b.t - pos.t) / 86400000) * WED;
        const sw = (REAL_RATES[name][pos.dir === 1 ? 'L' : 'S'] / 100) * (pos.entry / pos.risk) * days;
        out.push({ instr: name, dir: pos.dir, entryT: pos.t, exitT: b.t, r: pos.dir * (x - pos.entry) / pos.risk - cost / pos.risk + sw });
        pos = null;
      } else continue;
    }
    if (e200[i] == null || a14[i] == null || e21[i - 1] == null) continue;
    const aL = b.c > e50[i] && e50[i] > e200[i], aS = b.c < e50[i] && e50[i] < e200[i];
    const sL = aL && pv.l <= e21[i - 1] && b.c > b.o && b.c > e21[i] && r14[i] < 70;
    const sS = aS && pv.h >= e21[i - 1] && b.c < b.o && b.c < e21[i] && r14[i] > 30;
    if (!sL && !sS) continue;
    const dir = sL ? 1 : -1, risk = 3 * a14[i];
    pos = { dir, entry: b.c, sl: b.c - dir * risk, risk, t: b.t };
  }
  return out;
}

const d = loadData('1h');
const ANS = 2;
const VAR = [
  ['SWING actuel (net des swaps)', swingNet],
  ['INTRADAY A — opening range breakout', orb],
  ['INTRADAY B — mean reversion RSI4', imr],
  ['INTRADAY C — trend-pullback clôturé le soir', trendIntraday],
];
console.log('===== INTRADAY (zéro swap) vs SWING (swaps réels) — 2 ans, 4 instruments =====\n');
const rows = [];
const keep = {};
for (const [lb, fn] of VAR) {
  let all = [];
  for (const [, n] of INSTR) if (d[n]) all = all.concat(fn(d[n], n));
  keep[lb] = all;
  const s = stats(all);
  rows.push({ stratégie: lb, n: s.n, 'réussite': s.winRate + '%', PF: s.pf, 'R NET/an': (s.totalR / ANS).toFixed(1), maxDD: s.maxDD_R });
}
console.log(fmtTable(rows));

console.log('\n===== DÉTAIL PAR INSTRUMENT (la meilleure variante intraday) =====');
let best = null;
for (const [lb] of VAR.slice(1)) { const t = stats(keep[lb]).totalR; if (!best || t > best.t) best = { lb, t }; }
console.log(`(${best.lb})`);
const pi = [];
for (const [, n, label] of INSTR) {
  if (!d[n]) continue;
  const fn = VAR.find(v => v[0] === best.lb)[1];
  pi.push({ instrument: label, ...stats(fn(d[n], n)) });
}
console.log(fmtTable(pi));
