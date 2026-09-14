// STRATÉGIES INTERMARCHÉS — famille jamais explorée (on était resté sur des indicateurs de prix).
// Signaux issus d'AUTRES marchés : volatilité (VIX), dollar (DXY), taux (TNX), crédit (HYG).
// Tout sur 25 ans, NET des swaps réels, avec validation par sous-période.
import { readFileSync } from 'node:fs';
import { INSTR, COST_PTS, sma, ema, rsi, atr, stats, byPeriod, loadData, fmtTable } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const swp = (i, dir, px, rk, ms) => (REAL_RATES[i][dir === 1 ? 'L' : 'S'] / 100) * (px / rk) * ((ms / 86400000) * WED);
const add = (out, name, dir, pos, exitT, x) => out.push({ instr: name, dir, entryT: pos.entryT, exitT, r: dir * (x - pos.entry) / pos.risk - COST_PTS[name] / pos.risk + swp(name, dir, pos.entry, pos.risk, exitT - pos.entryT) });

// charge une série macro indexée par date (YYYY-MM-DD)
function macro(name) {
  const b = JSON.parse(readFileSync(new URL(`./data/${name}_1d.json`, import.meta.url)));
  const c = b.map(x => x.c);
  const m = new Map(), s20 = sma(c, 20), s50 = sma(c, 50), s200 = sma(c, 200);
  b.forEach((x, i) => m.set(new Date(x.t).toISOString().slice(0, 10), { c: x.c, s20: s20[i], s50: s50[i], s200: s200[i], prev: i > 0 ? c[i - 1] : null, i }));
  return m;
}
const VIX = macro('VIX'), DXY = macro('DXY'), TNX = macro('TNX'), HYG = macro('HYG'), TLT = macro('TLT');
const day = t => new Date(t).toISOString().slice(0, 10);

// ---------- A) Pic de VIX : la volatilité comme signal de panique, sortie quand elle retombe ----------
function vixSpike(b, name, { seuil = 1.25, maxHold = 10 } = {}) {
  const c = b.map(x => x.c), s200 = sma(c, 200), a = atr(b, 14);
  const out = []; let pos = null;
  for (let i = 201; i < b.length; i++) {
    const v = VIX.get(day(b[i].t));
    if (pos) {
      pos.held++;
      let x = null;
      if (b[i].l <= pos.sl) x = pos.sl;
      else if (v && v.s20 && v.c < v.s20) x = b[i].c;         // la peur est retombée
      else if (pos.held >= maxHold) x = b[i].c;
      if (x !== null) { add(out, name, 1, pos, b[i].t, x); pos = null; }
      continue;
    }
    if (!v || v.s20 == null || s200[i] == null || a[i] == null) continue;
    // marché haussier + VIX en excès de `seuil` fois sa moyenne 20j => achat
    if (b[i].c > s200[i] && v.c > v.s20 * seuil) { const risk = 3 * a[i]; pos = { dir: 1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk, held: 0 }; }
  }
  return out;
}

// ---------- B) Or piloté par dollar + taux ----------
function goldMacro(b, name, { maxHold = 20 } = {}) {
  const c = b.map(x => x.c), a = atr(b, 14);
  const out = []; let pos = null;
  for (let i = 201; i < b.length; i++) {
    const dx = DXY.get(day(b[i].t)), tn = TNX.get(day(b[i].t));
    if (pos) {
      pos.held++;
      let x = null;
      if (b[i].l <= pos.sl) x = pos.sl;
      else if (dx && dx.s50 && dx.c > dx.s50) x = b[i].c;       // le dollar repart => sortie
      else if (pos.held >= maxHold) x = b[i].c;
      if (x !== null) { add(out, name, 1, pos, b[i].t, x); pos = null; }
      continue;
    }
    if (!dx || !tn || dx.s50 == null || tn.s50 == null || a[i] == null) continue;
    // dollar faible ET taux en baisse => contexte porteur pour l'or
    if (dx.c < dx.s50 && tn.c < tn.s50) { const risk = 3 * a[i]; pos = { dir: 1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk, held: 0 }; }
  }
  return out;
}

// ---------- C) Appétit pour le risque via le crédit (HYG) ----------
function creditRisk(b, name, { maxHold = 15 } = {}) {
  const c = b.map(x => x.c), a = atr(b, 14), s200 = sma(c, 200);
  const out = []; let pos = null;
  for (let i = 201; i < b.length; i++) {
    const h = HYG.get(day(b[i].t));
    if (pos) {
      pos.held++;
      let x = null;
      if (b[i].l <= pos.sl) x = pos.sl;
      else if (h && h.s50 && h.c < h.s50) x = b[i].c;
      else if (pos.held >= maxHold) x = b[i].c;
      if (x !== null) { add(out, name, 1, pos, b[i].t, x); pos = null; }
      continue;
    }
    if (!h || h.s50 == null || h.s20 == null || s200[i] == null || a[i] == null) continue;
    // crédit qui repasse au-dessus de sa moyenne = retour de l'appétit pour le risque
    if (b[i].c > s200[i] && h.c > h.s50 && h.prev != null && h.prev <= h.s50) { const risk = 3 * a[i]; pos = { dir: 1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk, held: 0 }; }
  }
  return out;
}

// ---------- D) MR-A avec filtre VIX (améliorer l'existant) ----------
function mraVix(b, name, { mode = 'none' } = {}) {
  const c = b.map(x => x.c), s200 = sma(c, 200), r2 = rsi(c, 2), a = atr(b, 14);
  const out = []; let pos = null;
  for (let i = 201; i < b.length; i++) {
    if (pos) {
      pos.held++;
      let x = null;
      if (b[i].o <= pos.sl) x = b[i].o; else if (b[i].l <= pos.sl) x = pos.sl;
      else if (r2[i] > 65 || pos.held >= 10) x = b[i].c;
      if (x !== null) { add(out, name, 1, pos, b[i].t, x); pos = null; }
      continue;
    }
    if (s200[i] == null || a[i] == null || r2[i] == null) continue;
    if (!(b[i].c > s200[i] && r2[i] < 10)) continue;
    const v = VIX.get(day(b[i].t));
    if (mode === 'vixHaut' && !(v && v.s20 && v.c > v.s20)) continue;   // panique confirmée par le VIX
    if (mode === 'vixBas' && !(v && v.s20 && v.c < v.s20)) continue;
    const risk = 3 * a[i];
    pos = { dir: 1, entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk, held: 0 };
  }
  return out;
}

const d = loadData('1d');
const IDX = ['US500', 'US100', 'US30'];
const run = (fn, ins, opt) => { let o = []; for (const n of ins) if (d[n]) o = o.concat(fn(d[n], n, opt)); return o.sort((a, b) => a.exitT - b.exitT); };

const CAND = [
  ['A. Pic de VIX (indices)', run(vixSpike, IDX)],
  ['A2. Pic de VIX seuil 1.4', run(vixSpike, IDX, { seuil: 1.4 })],
  ['B. Or piloté dollar+taux', run(goldMacro, ['XAUUSD'])],
  ['C. Crédit HYG (indices)', run(creditRisk, IDX)],
  ['D0. MR-A sans filtre', run(mraVix, IDX)],
  ['D1. MR-A + VIX haut', run(mraVix, IDX, { mode: 'vixHaut' })],
  ['D2. MR-A + VIX bas', run(mraVix, IDX, { mode: 'vixBas' })],
];
console.log('===== STRATÉGIES INTERMARCHÉS — 25 ANS, NET DES SWAPS =====\n');
console.log(fmtTable(CAND.map(([lb, t]) => {
  const s = stats(t); const yrs = t.length ? (t[t.length - 1].exitT - t[0].exitT) / (365.25 * 86400000) : 1;
  return { stratégie: lb, n: s.n, '/an': (s.n / yrs).toFixed(0), 'réussite': (s.winRate ?? 0) + '%', PF: s.pf, 'R/an': (s.totalR / yrs).toFixed(2), maxDD: s.maxDD_R };
})));

console.log('\n===== VALIDATION PAR SOUS-PÉRIODE (candidats positifs) =====');
const P = [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]];
for (const [lb, t] of CAND) {
  const s = stats(t);
  if (!s.n || s.totalR <= 0) { console.log(`\n${lb} : ÉCARTÉ (${s.totalR ?? 0}R)`); continue; }
  console.log(`\n--- ${lb} : ${s.totalR}R, PF ${s.pf} ---`);
  console.log(fmtTable(byPeriod(t, P)));
}
