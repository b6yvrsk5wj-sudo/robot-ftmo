// Un compte "sans swap" compense souvent par des spreads plus larges.
// Question : à partir de quel élargissement de spread le compte sans swap cesse-t-il d'être rentable ?
// Notre stratégie a des stops SERRÉS => le spread compte proportionnellement beaucoup. Il faut chiffrer.
import { simulate } from './bt_portfolio.mjs';
import { COST_PTS, stats, fmtTable } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const seq = [...trades, ...mrTrades];
const YEARS = 2;

// coût spread actuel (déjà inclus dans r) et coût swap, en R/an
let spreadR = 0, swapTot = 0;
for (const t of seq) {
  spreadR += COST_PTS[t.instr] / t.riskDist;
  const days = ((t.exitT - t.entryT) / 86400000) * WED;
  swapTot += Math.abs((REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * days);
}
console.log(`Sur ${seq.length} trades / ${YEARS} ans :`);
console.log(`  coût SPREAD total : ${spreadR.toFixed(1)}R  (${(spreadR / YEARS).toFixed(2)}R/an)`);
console.log(`  coût SWAP total   : ${swapTot.toFixed(1)}R  (${(swapTot / YEARS).toFixed(2)}R/an)`);
console.log(`  ratio swap/spread : ${(swapTot / spreadR).toFixed(1)}x\n`);

console.log('Si un compte SANS SWAP élargit les spreads de Nx, que reste-t-il ?');
const rows = [];
for (const mult of [1, 1.5, 2, 3, 5, 10, 20]) {
  const extraSpread = spreadR * (mult - 1);
  const gain = swapTot - extraSpread;
  rows.push({
    'spread ×': mult, 'surcoût spread/an': (extraSpread / YEARS).toFixed(2) + 'R',
    'swap économisé/an': (swapTot / YEARS).toFixed(2) + 'R', 'GAIN NET/an': (gain / YEARS).toFixed(2) + 'R',
    verdict: gain > 0 ? 'gagnant' : 'perdant',
  });
}
console.log(fmtTable(rows));
console.log(`\nPoint mort : spread × ${(1 + swapTot / spreadR).toFixed(1)} (il faudrait que le spread soit ${(1 + swapTot / spreadR).toFixed(0)}x plus large pour annuler le bénéfice).`);
