// L'OR PORTE-T-IL TOUT LE SYSTÈME ? Sur 2 ans oui. Mais est-ce structurel ou conjoncturel ?
// Seule façon de trancher : 25 ans de données daily, instrument par instrument, période par période.
import { INSTR, COST_PTS, ema, rsi, atr, sma, stats, loadData, fmtTable } from './lib.mjs';

function trend(bars, name) {
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
      if (x !== null) { out.push({ instr: name, dir: pos.dir, entryT: pos.t, exitT: b.t, r: pos.dir * (x - pos.entry) / pos.risk - cost / pos.risk }); pos = null; }
      else continue;
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

const d = loadData('1d');
const T = {};
for (const [, n] of INSTR) if (d[n]) T[n] = trend(d[n], n);

console.log('===== 1. SUR 25 ANS : chaque instrument gagne-t-il ? =====');
console.log(fmtTable(INSTR.filter(x => T[x[1]]).map(([, n, lb]) => ({ instrument: lb, ...stats(T[n]), 'R/an': (stats(T[n]).totalR / 25).toFixed(2) }))));

console.log('\n===== 2. R PAR INSTRUMENT ET PAR TRANCHE DE 5 ANS =====');
const per = [[2001, 2005], [2006, 2010], [2011, 2015], [2016, 2020], [2021, 2026]];
const rows = [];
for (const [, n, lb] of INSTR) {
  if (!T[n]) continue;
  const line = { instrument: lb };
  for (const [a, b] of per) {
    const sub = T[n].filter(t => { const y = new Date(t.exitT).getUTCFullYear(); return y >= a && y <= b; });
    line[`${a}-${b}`] = stats(sub).totalR ?? 0;
  }
  rows.push(line);
}
console.log(fmtTable(rows));

console.log('\n===== 3. PART DE L OR DANS LE PROFIT TOTAL, PAR PÉRIODE =====');
const parts = [];
for (const [a, b] of per) {
  const tot = {}; let sum = 0;
  for (const [, n] of INSTR) { if (!T[n]) continue; const v = stats(T[n].filter(t => { const y = new Date(t.exitT).getUTCFullYear(); return y >= a && y <= b; })).totalR || 0; tot[n] = v; sum += v; }
  parts.push({ période: `${a}-${b}`, 'total R': sum.toFixed(1), 'dont or': (tot.XAUUSD || 0).toFixed(1), 'part de l or': sum > 0 ? (100 * (tot.XAUUSD || 0) / sum).toFixed(0) + '%' : 'n/a' });
}
console.log(fmtTable(parts));

console.log('\n===== 4. PANIERS COMPARÉS SUR 25 ANS =====');
const mk = ns => { let o = []; for (const n of ns) if (T[n]) o = o.concat(T[n]); return o; };
const paniers = [
  ['4 instruments', ['US500', 'US100', 'US30', 'XAUUSD']],
  ['or seul', ['XAUUSD']],
  ['indices seuls', ['US500', 'US100', 'US30']],
  ['or + Nasdaq', ['XAUUSD', 'US100']],
];
console.log(fmtTable(paniers.map(([lb, ns]) => { const s = stats(mk(ns)); return { panier: lb, n: s.n, PF: s.pf, 'R total': s.totalR, 'R/an': (s.totalR / 25).toFixed(2), maxDD: s.maxDD_R, 'rdt/DD': (s.totalR / s.maxDD_R).toFixed(2) }; })));

console.log('\n===== 5. LES 2 DERNIÈRES ANNÉES SONT-ELLES ANORMALES ? (daily, même moteur) =====');
const cut = Date.now() - 730 * 86400000;
const rec = [];
for (const [, n, lb] of INSTR) {
  if (!T[n]) continue;
  const r = T[n].filter(t => t.exitT >= cut), h = T[n].filter(t => t.exitT < cut);
  rec.push({ instrument: lb, 'R/an sur 23 ans': (stats(h).totalR / 23).toFixed(2), 'R/an sur 2 ans': (stats(r).totalR / 2).toFixed(2) });
}
console.log(fmtTable(rec));
