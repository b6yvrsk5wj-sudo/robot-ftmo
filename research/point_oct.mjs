// Point du 2026-10-10 — 16 semaines de forward-test.
import { readFileSync } from 'node:fs';
const RATES = { US500: { L: -0.0211, S: 0.0003 }, US100: { L: -0.0217, S: 0.0009 }, US30: { L: -0.0218, S: 0.0009 }, XAUUSD: { L: -0.0182, S: -0.0059 } };
const R_USD = 1000, ACC = 100000;
const log = JSON.parse(readFileSync(new URL('../ftmo_signals_log.json', import.meta.url)));
const billed = (t0, t1) => { let d = 0; const e = new Date(t1); for (let x = new Date(t0); x < e; x.setUTCDate(x.getUTCDate() + 1)) { const n = new Date(x); n.setUTCDate(n.getUTCDate() + 1); if (n > e) { d += (e - x) / 86400000; break; } d += x.getUTCDay() === 3 ? 3 : 1; } return d; };

const opens = {}; const byStrat = { trend: { g: 0, s: 0, n: 0 }, MR: { g: 0, s: 0, n: 0 } };
const curve = [];
for (const e of log) {
  const st = e.strategy || 'trend', k = st + '_' + e.instrument;
  if (e.event === 'OPEN') opens[k] = e;
  else if (e.event === 'CLOSE' && opens[k]) {
    const o = opens[k], dir = o.dir === 'LONG' ? 1 : -1;
    const g = e.resultR * R_USD;
    const sw = (RATES[o.instrument][dir === 1 ? 'L' : 'S'] / 100) * (o.entry / o.risk) * billed(o.time, e.time) * R_USD;
    byStrat[st].g += g; byStrat[st].s += sw; byStrat[st].n++;
    curve.push({ t: e.time, v: g + sw, strat: st });
    delete opens[k];
  }
}
console.log('=== P&L RÉEL PAR STRATÉGIE (compte 100k à 1%) ===');
for (const [k, v] of Object.entries(byStrat))
  console.log(`  ${k.padEnd(6)} ${String(v.n).padStart(3)} trades | brut ${Math.round(v.g).toString().padStart(6)}$ | swaps ${Math.round(v.s).toString().padStart(6)}$ | NET ${Math.round(v.g + v.s).toString().padStart(6)}$`);
const net = Object.values(byStrat).reduce((a, v) => a + v.g + v.s, 0);
console.log(`  TOTAL                   NET ${Math.round(net)}$ = ${(net / ACC * 100).toFixed(2)}%`);

// et si on n'avait fait QUE MR ?
const mrNet = byStrat.MR.g + byStrat.MR.s;
console.log(`\n=== ET SI ON N AVAIT FAIT QUE MR ? ===`);
console.log(`  MR seule : ${Math.round(mrNet)}$ = ${(mrNet / ACC * 100).toFixed(2)}% | la jambe trend a coûté ${Math.round(byStrat.trend.g + byStrat.trend.s)}$`);

// equity / drawdown
let eq = 0, pk = 0, mdd = 0;
for (const p of curve) { eq += p.v; if (eq > pk) pk = eq; if (pk - eq > mdd) mdd = pk - eq; }
console.log(`\n=== RISQUE ===`);
console.log(`  pic ${Math.round(pk)}$ | drawdown max depuis le pic ${Math.round(mdd)}$ = ${(mdd / ACC * 100).toFixed(2)}%`);
console.log(`  chez FTMO (plancher -10% du départ) : ${net > -10000 ? 'VIVANT, marge ' + Math.round(10000 + net) + '$' : 'CRAMÉ'}`);

// significativite
const cl = log.filter(t => t.event === 'CLOSE');
for (const [st, p] of [['trend', 0.305], ['MR', 0.70]]) {
  const s = cl.filter(t => (t.strategy || 'trend') === st);
  const n = s.length, w = s.filter(t => t.resultR > 0).length;
  const z = (w - n * p) / Math.sqrt(n * p * (1 - p));
  console.log(`\n  ${st} : ${w}/${n} gagnants = ${(100 * w / n).toFixed(0)}% (attendu ${(100 * p).toFixed(0)}%) | z = ${z.toFixed(2)} ${Math.abs(z) < 1.96 ? '(dans la norme)' : '(ANORMAL)'}`);
}
const mrPer = byStrat.MR.n ? (byStrat.MR.g + byStrat.MR.s) / byStrat.MR.n / R_USD : 0;
console.log(`\n  espérance MR observée : ${mrPer.toFixed(3)}R/trade | attendue (25 ans) : 0.079R/trade`);
const trPer = byStrat.trend.n ? (byStrat.trend.g + byStrat.trend.s) / byStrat.trend.n / R_USD : 0;
console.log(`  espérance trend observée : ${trPer.toFixed(3)}R/trade | attendue (net swaps) : ~0.000R/trade`);
