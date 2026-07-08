// Durée des trades (en jours calendaires) dans la config live.
import { simulate } from './bt_portfolio.mjs';

const live = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
function dur(seq, label) {
  const d = seq.map(t => (t.exitT - t.entryT) / 86400000).sort((a, b) => a - b);
  const q = p => d[Math.floor(d.length * p)].toFixed(1);
  console.log(`${label}: médiane ${q(0.5)}j | 75% sous ${q(0.75)}j | 90% sous ${q(0.9)}j | MAX ${d[d.length - 1].toFixed(1)}j (${seq.length} trades)`);
  return d;
}
dur(live.trades, 'TREND 1h (live)');
dur(live.mrTrades, 'MR-A daily     ');
// les 5 plus longs trades trend avec leur résultat
const long5 = [...live.trades].sort((a, b) => (b.exitT - b.entryT) - (a.exitT - a.entryT)).slice(0, 5);
console.log('\nTop 5 des trades trend les plus longs :');
for (const t of long5) console.log(` ${t.instr.padEnd(7)} ${new Date(t.entryT).toISOString().slice(0, 10)} -> ${new Date(t.exitT).toISOString().slice(0, 10)} (${((t.exitT - t.entryT) / 86400000).toFixed(0)}j) : ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R`);
