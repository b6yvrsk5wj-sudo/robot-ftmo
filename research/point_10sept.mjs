// Point du 2026-09-10. Série de 11 pertes trend = record du backtest. Le système est-il cassé ?
import { readFileSync } from 'node:fs';
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
import { stats, fmtTable } from './lib.mjs';
const WED = 1.28, R_USD = 1000, ACCOUNT = 100000;

const log = JSON.parse(readFileSync(new URL('../ftmo_signals_log.json', import.meta.url)));
function billed(t0, t1) { let d = 0; const end = new Date(t1); for (let x = new Date(t0); x < end; x.setUTCDate(x.getUTCDate() + 1)) { const nx = new Date(x); nx.setUTCDate(nx.getUTCDate() + 1); if (nx > end) { d += (end - x) / 86400000; break; } d += x.getUTCDay() === 3 ? 3 : 1; } return d; }

// équité nette dans le temps (pour le drawdown depuis le pic)
const opens = {}; const curve = []; let g = 0, sw = 0;
for (const e of log) {
  const k = (e.strategy || 'trend') + '_' + e.instrument;
  if (e.event === 'OPEN') opens[k] = e;
  else if (e.event === 'CLOSE' && opens[k]) {
    const o = opens[k], dir = o.dir === 'LONG' ? 1 : -1;
    g += e.resultR * R_USD;
    sw += (RATES(o.instrument, dir) / 100) * (o.entry / o.risk) * billed(o.time, e.time) * R_USD;
    curve.push({ t: e.time, eq: g + sw });
    delete opens[k];
  }
}
function RATES(i, d) { return REAL_RATES[i][d === 1 ? 'L' : 'S']; }
let peak = 0, mdd = 0;
for (const p of curve) { if (p.eq > peak) peak = p.eq; if (peak - p.eq > mdd) mdd = peak - p.eq; }
const net = g + sw;
console.log('=== P&L RÉEL (compte 100k à 1%) ===');
console.log(`  brut ${Math.round(g)}$ | swaps ${Math.round(sw)}$ | NET ${Math.round(net)}$ = ${(net / ACCOUNT * 100).toFixed(2)}%`);
console.log(`  pic atteint : ${Math.round(peak)}$ | drawdown depuis le pic : ${Math.round(mdd)}$ = ${(mdd / ACCOUNT * 100).toFixed(2)}%`);

console.log('\n=== OÙ EN SERAIS-TU CHEZ CHAQUE FIRME ? ===');
console.log(`  FTMO (plancher FIXE à -10% du départ) : équité ${(net / ACCOUNT * 100).toFixed(2)}% -> ${net > -10000 ? 'VIVANT, marge restante ' + Math.round(10000 + net) + '$' : 'CRAMÉ'}`);
const floorFT = Math.min(peak / ACCOUNT * 100 - 6, 0);
console.log(`  FT+ (plancher SUIVEUR 6%)             : plancher à ${floorFT.toFixed(2)}% -> ${(net / ACCOUNT * 100) <= floorFT ? 'CRAMÉ' : 'vivant'}`);

// --- contexte backtest ---
const { trades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const seq = trades.map(t => { const d = ((t.exitT - t.entryT) / 86400000) * WED; return { ...t, r: t.r + (RATES(t.instr, t.dir) / 100) * (t.entryPx / t.riskDist) * d }; }).sort((a, b) => a.exitT - b.exitT);
let mx = 0, cur = 0, n11 = 0;
for (const t of seq) { if (t.r <= 0) { cur++; if (cur > mx) mx = cur; if (cur === 11) n11++; } else cur = 0; }
console.log('\n=== LA SÉRIE DE 11 PERTES ===');
console.log(`  record du backtest 2 ans : ${mx} | séries de 11+ observées : ${n11}`);
console.log(`  probabilité théorique d'une série de 11 (69% de pertes) : ${(Math.pow(0.695, 11) * 100).toFixed(1)}% par trade de départ`);

// win rate significatif ?
const cl = log.filter(t => t.event === 'CLOSE' && (t.strategy || 'trend') === 'trend');
const n = cl.length, w = cl.filter(t => t.resultR > 0).length, p = 0.305;
const z = (w - n * p) / Math.sqrt(n * p * (1 - p));
console.log('\n=== LE SYSTÈME EST-IL CASSÉ ? ===');
console.log(`  taux de réussite : ${w}/${n} = ${(100 * w / n).toFixed(0)}% (attendu ${(100 * p).toFixed(0)}%)`);
console.log(`  écart : ${z.toFixed(2)} écart-type -> ${Math.abs(z) < 1.96 ? 'PAS de rupture statistique (il faudrait |z|>1.96)' : 'ANOMALIE STATISTIQUE'}`);
console.log(`  il faudrait ${Math.ceil((1.96 * Math.sqrt(n * p * (1 - p)) + n * p - w))} gagnants de moins pour conclure à une rupture`);

// fenêtres de 29 trades
const W = 29, arr = [];
for (let i = 0; i + W <= seq.length; i++) arr.push(seq.slice(i, i + W).reduce((a, t) => a + t.r, 0));
arr.sort((a, b) => a - b);
console.log(`\n=== FENÊTRES DE ${W} TRADES TREND (backtest) ===`);
console.log(`  négatives ${(100 * arr.filter(x => x < 0).length / arr.length).toFixed(0)}% | pires que -5R ${(100 * arr.filter(x => x <= -5).length / arr.length).toFixed(0)}% | pire ${arr[0].toFixed(1)}R | médiane ${arr[arr.length / 2 | 0].toFixed(1)}R`);
