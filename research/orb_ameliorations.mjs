// Section 30 — Variantes de la cassure 1re heure. Choix sur l'ANNÉE 1, validation sur l'ANNÉE 2 (jamais vue).
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./pepites.mjs', import.meta.url), 'utf8');
const mod = src.slice(0, src.indexOf('const D = loadData')).replace(/^import .*$/gm, '');
const L = await import('./lib.mjs'), { REAL_RATES } = await import('./bt_swap.mjs');
const { run, ctx } = new Function('INSTR', 'COST_PTS', 'ema', 'sma', 'rsi', 'atr', 'stats', 'loadData', 'REAL_RATES', mod + '\nreturn { S, run, ctx };')(L.INSTR, L.COST_PTS, L.ema, L.sma, L.rsi, L.atr, L.stats, L.loadData, REAL_RATES);
const H = L.loadData('1h'), IDX = ['US500', 'US100', 'US30'], DAY = 86400000;

// mémo : plages des 1res heures précédentes (pour le filtre « plage étroite »)
function firstRanges(x) {
  if (x._fr) return x._fr; const fr = {}; const list = [];
  for (let i = 1; i < x.b.length; i++) if (x.ny[i].h === 9 && x.ny[i - 1].day !== x.ny[i].day) { list.push(x.b[i].h - x.b[i].l); fr[i] = list.slice(-21, -1); }
  return (x._fr = fr);
}
function orb({ tp = 2, valid = 5, trend = false, narrow = null, wide = null, midStop = false }) {
  return { tf: '1h', instr: IDX, sig: (x, i) => {
    if (x.ny[i].h !== 9 || x.ny[i - 1].day === x.ny[i].day) return null;
    const b = x.b[i], r = b.h - b.l, day = x.ny[i].day;
    if (narrow || wide) { const past = firstRanges(x)[i]; if (!past || past.length < 20) return null; const med = [...past].sort((a, c) => a - c)[10];
      if (narrow && r > med * narrow) return null; if (wide && r < med * wide) return null; }
    const eod = (x, k) => !x.ny[k + 1] || x.ny[k + 1].day !== day;
    const up = x.c[i] > x.e200[i];
    return { dir: 0, type: 'stopHL', hi: trend && !up ? Infinity : b.h, lo: trend && up ? -Infinity : b.l, valid, mk: d => {
      const mid = (b.h + b.l) / 2, sl = midStop ? mid : (d === 1 ? b.l : b.h), e = d === 1 ? b.h : b.l, rk = Math.abs(e - sl);
      return { sl, tp: tp ? e + d * tp * rk : null, maxHold: 7, exit: eod }; } };
  } };
}
const V = {
  'BASE (objectif 2R, entrées jusqu\'à 15h30)': {},
  'Objectif 1R': { tp: 1 }, 'Objectif 3R': { tp: 3 }, 'Pas d\'objectif (sortie fin de séance)': { tp: 0 },
  'Filtre tendance (EMA200 1h)': { trend: true },
  'Plage étroite seulement (< médiane)': { narrow: 1 }, 'Plage large seulement (> médiane)': { wide: 1 },
  'Entrées jusqu\'à 12h30 seulement': { valid: 2 }, 'Stop au milieu de la plage': { midStop: true },
};
let allT = []; for (const n of IDX) allT = allT.concat(H[n].map(b => b.t));
const T0 = Math.min(...allT), SPLIT = T0 + 365.25 * DAY;
const rows = [];
for (const [lb, opt] of Object.entries(V)) {
  const st = orb(opt); let tr = []; for (const n of IDX) tr = tr.concat(run(H[n], n, st));
  const y1 = tr.filter(t => t.entryT < SPLIT), y2 = tr.filter(t => t.entryT >= SPLIT);
  const s = L.stats(tr), s1 = L.stats(y1), s2 = L.stats(y2);
  // DD en R séquence journalière
  const byD = {}; for (const t of tr) { const k = new Date(t.exitT).toISOString().slice(0, 10); byD[k] = (byD[k] || 0) + t.r; }
  let eq = 0, pk = 0, dd = 0; for (const k of Object.keys(byD).sort()) { eq += byD[k]; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  rows.push({ lb, n: s.n, y1: s1.totalR, y2: s2.totalR, e1: s1.expR, e2: s2.expR, tot: s.totalR, dd: +dd.toFixed(1), ratio: +(s.totalR / dd).toFixed(2) });
}
console.log('variante'.padEnd(44) + 'trades | année 1 (R) | année 2 (R) | R/trade a1 | R/trade a2 | DD R | total/DD');
for (const r of rows) console.log(r.lb.padEnd(44) + `${String(r.n).padStart(6)} | ${String(r.y1).padStart(11)} | ${String(r.y2).padStart(11)} | ${String(r.e1).padStart(10)} | ${String(r.e2).padStart(10)} | ${String(r.dd).padStart(4)} | ${r.ratio}`);
const base = rows[0], best1 = [...rows.slice(1)].sort((a, b) => b.e1 - a.e1)[0];
console.log(`\nMeilleure variante sur l'ANNÉE 1 (R/trade) : ${best1.lb} (${best1.e1} vs base ${base.e1})`);
console.log(`Sur l'ANNÉE 2 jamais vue : ${best1.e2} R/trade vs base ${base.e2} -> ${best1.e2 > base.e2 ? 'CONFIRMÉE' : 'NON CONFIRMÉE'}`);
