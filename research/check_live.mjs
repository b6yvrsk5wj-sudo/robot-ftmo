// 1) Le trend live (-3R sur 11 trades, 18% de réussite) est-il dans la norme ?
// 2) Les gains MR minuscules (+0.04R) sont-ils normaux ou un défaut de la stratégie ?
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
import { fmtTable } from './lib.mjs';
const WED = 1.28;
const sw = t => { const d = ((t.exitT - t.entryT) / 86400000) * WED; return (REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * d; };

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const tr = trades.map(t => ({ ...t, r: t.r + sw(t) })).sort((a, b) => a.exitT - b.exitT);
const mr = mrTrades.map(t => ({ ...t, r: t.r + sw(t) })).sort((a, b) => a.exitT - b.exitT);

// --- TREND : fenêtres de 11 trades ---
const W = 11, wins = [], wrs = [];
for (let i = 0; i + W <= tr.length; i++) {
  const s = tr.slice(i, i + W);
  wins.push(s.reduce((a, t) => a + t.r, 0));
  wrs.push(100 * s.filter(t => t.r > 0).length / W);
}
wins.sort((a, b) => a - b);
console.log(`=== TREND : fenêtres de ${W} trades dans le backtest (${wins.length} fenêtres) ===`);
console.log(`  négatives          : ${(100 * wins.filter(w => w < 0).length / wins.length).toFixed(0)}%`);
console.log(`  pires que -3.0R    : ${(100 * wins.filter(w => w <= -3).length / wins.length).toFixed(0)}%`);
console.log(`  pire / médiane / meilleure : ${wins[0].toFixed(1)}R / ${wins[wins.length / 2 | 0].toFixed(1)}R / ${wins[wins.length - 1].toFixed(1)}R`);
const wrLow = wrs.filter(w => w <= 18.2).length;
console.log(`  fenêtres avec un taux de réussite <= 18.2% : ${(100 * wrLow / wrs.length).toFixed(0)}%`);

// --- MR : distribution de la taille des gains ---
console.log(`\n=== MR-A : à quoi ressemblent ses trades gagnants ? (${mr.length} trades backtest) ===`);
const w2 = mr.filter(t => t.r > 0).map(t => t.r).sort((a, b) => a - b);
const q = p => w2[Math.floor(w2.length * p)];
console.log(`  gagnants : ${w2.length}/${mr.length} (${(100 * w2.length / mr.length).toFixed(0)}%)`);
console.log(`  taille des gains — médiane ${q(0.5).toFixed(2)}R | 25e pct ${q(0.25).toFixed(2)}R | 75e pct ${q(0.75).toFixed(2)}R | max ${w2[w2.length - 1].toFixed(2)}R`);
const tiny = mr.filter(t => t.r > 0 && t.r < 0.1).length;
console.log(`  gains "minuscules" (<0.10R = <100$) : ${tiny}/${w2.length} soit ${(100 * tiny / w2.length).toFixed(0)}% des gagnants`);
const losses = mr.filter(t => t.r <= 0).map(t => t.r).sort((a, b) => a - b);
console.log(`  pertes : ${losses.length} | pire ${losses.length ? losses[0].toFixed(2) : '-'}R | moyenne ${losses.length ? (losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(2) : '-'}R`);
console.log(`  espérance par trade MR : ${(mr.reduce((a, t) => a + t.r, 0) / mr.length).toFixed(3)}R`);
console.log(`  => contribution MR : ${(mr.reduce((a, t) => a + t.r, 0) / 2).toFixed(1)}R/an vs trend ${(tr.reduce((a, t) => a + t.r, 0) / 2).toFixed(1)}R/an`);
