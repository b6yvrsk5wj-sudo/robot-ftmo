// RECHERCHE DIRIGÉE — contrainte apprise en 3 mois : le ratio notionnel/risque décide de tout.
// Un stop LARGE => petite position => peu de swap. MR-A survit pour cette raison. On cherche d'autres
// stratégies avec la même propriété, testées sur 25 ans de daily et NET DES SWAPS RÉELS dès le départ.
import { INSTR, COST_PTS, sma, ema, rsi, atr, stats, byPeriod, loadData, fmtTable } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const sw = (i, dir, px, rk, ms) => (REAL_RATES[i][dir === 1 ? 'L' : 'S'] / 100) * (px / rk) * ((ms / 86400000) * WED);
const push = (out, name, dir, pos, exitT, x) => out.push({
  instr: name, dir, entryT: pos.entryT, exitT,
  r: dir * (x - pos.entry) / pos.risk - COST_PTS[name] / pos.risk + sw(name, dir, pos.entry, pos.risk, exitT - pos.entryT),
  ratio: pos.entry / pos.risk,
});

// 1) DONCHIAN 20/10 (style tortue) — stop 2xATR, sortie sur canal inverse
function donchian(b, name) {
  const out = []; let pos = null; const a = atr(b, 20);
  for (let i = 60; i < b.length; i++) {
    const hi20 = Math.max(...b.slice(i - 20, i).map(x => x.h)), lo20 = Math.min(...b.slice(i - 20, i).map(x => x.l));
    const hi10 = Math.max(...b.slice(i - 10, i).map(x => x.h)), lo10 = Math.min(...b.slice(i - 10, i).map(x => x.l));
    if (pos) {
      let x = null;
      if (pos.dir === 1) { if (b[i].l <= pos.sl) x = pos.sl; else if (b[i].c < lo10) x = b[i].c; }
      else { if (b[i].h >= pos.sl) x = pos.sl; else if (b[i].c > hi10) x = b[i].c; }
      if (x !== null) { push(out, name, pos.dir, pos, b[i].t, x); pos = null; }
      continue;
    }
    if (a[i] == null) continue;
    const risk = 2 * a[i];
    if (b[i].c > hi20) pos = { dir: 1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk };
    else if (b[i].c < lo20) pos = { dir: -1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c + risk };
  }
  return out;
}

// 2) TENDANCE HEBDO — EMA10/30 sur bougies semaine, stop 3xATR hebdo (positions longues, stop très large)
function weekly(b, name) {
  const W = [];
  for (const x of b) { const k = Math.floor(x.t / (7 * 86400000)); const l = W[W.length - 1]; if (l && l.k === k) { l.h = Math.max(l.h, x.h); l.l = Math.min(l.l, x.l); l.c = x.c; } else W.push({ k, t: x.t, o: x.o, h: x.h, l: x.l, c: x.c }); }
  const c = W.map(x => x.c), e10 = ema(c, 10), e30 = ema(c, 30), a = atr(W, 14);
  const out = []; let pos = null;
  for (let i = 40; i < W.length; i++) {
    if (pos) {
      let x = null;
      if (pos.dir === 1) { if (W[i].l <= pos.sl) x = pos.sl; else if (e10[i] < e30[i]) x = W[i].c; }
      else { if (W[i].h >= pos.sl) x = pos.sl; else if (e10[i] > e30[i]) x = W[i].c; }
      if (x !== null) { push(out, name, pos.dir, pos, W[i].t, x); pos = null; }
      continue;
    }
    if (a[i] == null || e30[i] == null || e30[i - 1] == null) continue;
    const risk = 3 * a[i];
    if (e10[i] > e30[i] && e10[i - 1] <= e30[i - 1]) pos = { dir: 1, entry: W[i].c, entryT: W[i].t, risk, sl: W[i].c - risk };
    else if (e10[i] < e30[i] && e10[i - 1] >= e30[i - 1]) pos = { dir: -1, entry: W[i].c, entryT: W[i].t, risk, sl: W[i].c + risk };
  }
  return out;
}

// 3) EFFET TOURNANT DE MOIS — achat 1 jour avant fin de mois, sortie 3 jours après (effet documenté)
function turnMonth(b, name) {
  const a = atr(b, 14); const out = []; let pos = null, held = 0;
  for (let i = 30; i < b.length - 1; i++) {
    if (pos) { held++; if (held >= 4 || b[i].l <= pos.sl) { push(out, name, 1, pos, b[i].t, b[i].l <= pos.sl ? pos.sl : b[i].c); pos = null; } continue; }
    if (a[i] == null) continue;
    const m = new Date(b[i].t).getUTCMonth(), mn = new Date(b[i + 1].t).getUTCMonth();
    if (m !== mn) { const risk = 3 * a[i]; pos = { dir: 1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk }; held = 0; }
  }
  return out;
}

// 4) MR-A (référence, la seule stratégie qui survit aujourd'hui)
function mra(b, name) {
  const c = b.map(x => x.c), s200 = sma(c, 200), s5 = sma(c, 5), r2 = rsi(c, 2), a = atr(b, 14);
  const out = []; let pos = null;
  for (let i = 201; i < b.length; i++) {
    if (pos) {
      pos.held++;
      let x = null;
      if (b[i].o <= pos.sl) x = b[i].o; else if (b[i].l <= pos.sl) x = pos.sl;
      else if (r2[i] > 65 || pos.held >= 10) x = b[i].c;
      if (x !== null) { push(out, name, 1, pos, b[i].t, x); pos = null; }
      continue;
    }
    if (s200[i] == null || a[i] == null || r2[i] == null) continue;
    if (b[i].c > s200[i] && r2[i] < 10) { const risk = 3 * a[i]; pos = { dir: 1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk, held: 0 }; }
  }
  return out;
}

const d = loadData('1d');
const CAND = [['MR-A (référence)', mra], ['Donchian 20/10', donchian], ['Tendance hebdo EMA10/30', weekly], ['Effet tournant de mois', turnMonth]];
console.log('===== CANDIDATS — 25 ANS, 4 INSTRUMENTS, NET DES SWAPS RÉELS =====\n');
const rows = []; const keep = {};
for (const [lb, fn] of CAND) {
  let all = [];
  for (const [, n] of INSTR) if (d[n]) all = all.concat(fn(d[n], n));
  all.sort((a, b) => a.exitT - b.exitT); keep[lb] = all;
  const s = stats(all);
  const ratio = all.reduce((a, t) => a + t.ratio, 0) / all.length;
  rows.push({ stratégie: lb, n: s.n, '/an': (s.n / 25).toFixed(0), 'réussite': s.winRate + '%', PF: s.pf, 'R/an': (s.totalR / 25).toFixed(2), maxDD: s.maxDD_R, 'notionnel/risque': ratio.toFixed(0) });
}
console.log(fmtTable(rows));
console.log('\n(le ratio notionnel/risque est la cause des swaps : plus il est bas, moins la stratégie paie de frais)');

console.log('\n===== ROBUSTESSE PAR SOUS-PÉRIODE (les candidats positifs) =====');
for (const [lb] of CAND) {
  const s = stats(keep[lb]);
  if (s.totalR <= 0) { console.log(`\n--- ${lb} : ÉCARTÉ (${s.totalR}R sur 25 ans) ---`); continue; }
  console.log(`\n--- ${lb} : ${s.totalR}R ---`);
  console.log(fmtTable(byPeriod(keep[lb], [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]])));
}
