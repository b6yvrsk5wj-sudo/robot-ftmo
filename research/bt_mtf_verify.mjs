// VÉRIFICATION du filtre multi-timeframe : le même concept (EMA50>EMA200 du TF supérieur ~4-5x)
// doit aussi marcher sur la stratégie daily avec filtre HEBDO sur 25 ans, sinon c'est de l'overfitting.
// + détail par instrument et par moitié de période pour le filtre 4h (2 ans).
import { INSTR, ema, sma, stats, byPeriod, fmtTable, loadData } from './lib.mjs';
import { runTrendF, agg4h, mkLookup } from './bt_mtf.mjs';

const d1d = loadData('1d'), d1h = loadData('1h');

// --- 1) concept sur 25 ans : trend DAILY filtré par tendance HEBDO ---
function aggW(bars) {
  const out = [];
  for (const b of bars) {
    const k = Math.floor(b.t / (7 * 86400_000)) * 7 * 86400_000;
    const last = out[out.length - 1];
    if (last && last.t === k) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; }
    else out.push({ t: k, o: b.o, h: b.h, l: b.l, c: b.c });
  }
  return out;
}
let base25 = [], filt25 = [], warmup = 0;
for (const [, name] of INSTR) {
  if (!d1d[name]) continue;
  const W = aggW(d1d[name]), cW = W.map(x => x.c);
  const e50W = ema(cW, 50), e200W = ema(cW, 200);
  const lookW = mkLookup(W.map(x => x.t + 7 * 86400_000));
  const wReady = W[200] ? W[200].t + 7 * 86400_000 : Infinity;
  warmup = Math.max(warmup, wReady);
  base25 = base25.concat(runTrendF(d1d[name], name, () => true));
  filt25 = filt25.concat(runTrendF(d1d[name], name, (dir, t) => { const j = lookW(t); if (j < 200 || e200W[j] == null) return false; return dir === 1 ? e50W[j] > e200W[j] : e50W[j] < e200W[j]; }));
}
base25 = base25.filter(t => t.entryT >= warmup); // même fenêtre pour comparaison juste
console.log('===== VÉRIF 25 ANS : trend DAILY, filtre tendance HEBDO (même fenêtre 2005+) =====');
console.log(fmtTable([{ config: 'daily sans filtre', ...stats(base25) }, { config: 'daily + filtre hebdo aligné', ...stats(filt25) }]));
console.log('\nsous-périodes (avec filtre hebdo):');
console.log(fmtTable(byPeriod(filt25, [['2005-2011', 2005, 2011], ['2012-2018', 2012, 2018], ['2019-2026', 2019, 2026]])));
console.log('sous-périodes (sans filtre):');
console.log(fmtTable(byPeriod(base25, [['2005-2011', 2005, 2011], ['2012-2018', 2012, 2018], ['2019-2026', 2019, 2026]])));

// --- 2) filtre 4h sur 2 ans : détail par instrument et par moitié ---
console.log('\n===== FILTRE 4H (2 ans) : détail =====');
const rows = [];
let allF = [], allB = [];
for (const [, name, lb] of INSTR) {
  if (!d1h[name]) continue;
  const H4 = agg4h(d1h[name]), c4 = H4.map(x => x.c);
  const e50H = ema(c4, 50), e200H = ema(c4, 200);
  const look4 = mkLookup(H4.map(x => x.t + 4 * 3600_000));
  const f = runTrendF(d1h[name], name, (dir, t) => { const j = look4(t); if (j < 200 || e200H[j] == null) return false; return dir === 1 ? e50H[j] > e200H[j] : e50H[j] < e200H[j]; });
  const b = runTrendF(d1h[name], name, () => true);
  allF = allF.concat(f); allB = allB.concat(b);
  rows.push({ instr: lb, 'R sans filtre': stats(b).totalR, 'R avec 4h': stats(f).totalR, 'PF sans': stats(b).pf, 'PF avec': stats(f).pf });
}
console.log(fmtTable(rows));
const mid = allB.length ? allB.map(t => t.exitT).sort((a, b) => a - b)[Math.floor(allB.length / 2)] : 0;
const half = (ts, w) => stats(ts.filter(t => w === 1 ? t.exitT < mid : t.exitT >= mid));
console.log('\npar moitié de période :');
console.log(fmtTable([
  { période: '1re année', 'sans filtre R': half(allB, 1).totalR, 'avec 4h R': half(allF, 1).totalR, 'PF sans': half(allB, 1).pf, 'PF avec': half(allF, 1).pf },
  { période: '2e année', 'sans filtre R': half(allB, 2).totalR, 'avec 4h R': half(allF, 2).totalR, 'PF sans': half(allB, 2).pf, 'PF avec': half(allF, 2).pf },
]));
