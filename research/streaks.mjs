// Séries de gains/pertes consécutifs dans les backtests (config live et 25 ans).
import { simulate } from './bt_portfolio.mjs';

function streaks(seq) {
  let mw = 0, ml = 0, cw = 0, cl = 0, l3 = 0;
  for (const t of seq) {
    if (t.r > 0) { cw++; if (cl >= 3) l3++; cl = 0; if (cw > mw) mw = cw; }
    else { cl++; cw = 0; if (cl > ml) ml = cl; }
  }
  if (cl >= 3) l3++;
  return { maxGains: mw, maxPertes: ml, nbSeries3PertesOuPlus: l3 };
}

const live = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const seqL = [...live.trades, ...live.mrTrades].sort((a, b) => a.exitT - b.exitT);
const trendOnly = [...live.trades].sort((a, b) => a.exitT - b.exitT);
const mrOnly = [...live.mrTrades].sort((a, b) => a.exitT - b.exitT);
console.log('CONFIG LIVE 2 ANS (règles robot) :');
console.log('  trend seul :', JSON.stringify(streaks(trendOnly)), '| trades:', trendOnly.length);
console.log('  MR seule   :', JSON.stringify(streaks(mrOnly)), '| trades:', mrOnly.length);
console.log('  combiné    :', JSON.stringify(streaks(seqL)), '| trades:', seqL.length);

const d = simulate('1d', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const seqD = [...d.trades, ...d.mrTrades].sort((a, b) => a.exitT - b.exitT);
const trendD = [...d.trades].sort((a, b) => a.exitT - b.exitT);
console.log('DAILY 25 ANS (règles robot) :');
console.log('  trend seul :', JSON.stringify(streaks(trendD)), '| trades:', trendD.length);
console.log('  combiné    :', JSON.stringify(streaks(seqD)), '| trades:', seqD.length);
