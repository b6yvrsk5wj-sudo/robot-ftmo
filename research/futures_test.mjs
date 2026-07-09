// Test : le trend-pullback 1h sur les FUTURES Yahoo (ES=F/NQ=F/YM=F, plus proches des CFD FTMO, cotation ~24h)
// vs les indices CASH (^GSPC/^NDX/^DJI) utilisés par le robot. Même stratégie, mêmes coûts.
// + part des signaux qui tomberaient la NUIT (hors 13h-21h UTC) — enjeu : exécution manuelle.
import { yahoo, ema, rsi, atr, stats, fmtTable, COST_PTS } from './lib.mjs';
import { runTrendF } from './bt_mtf.mjs';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const PAIRS = [['ES=F', 'US500', '^GSPC'], ['NQ=F', 'US100', '^NDX'], ['YM=F', 'US30', '^DJI']];
const rows = [];
let futTrades = [], cashTrades = [];
for (const [futSym, name] of PAIRS) {
  const cache = new URL(`./data/${name}_fut_1h.json`, import.meta.url);
  let fut;
  if (existsSync(cache)) fut = JSON.parse(readFileSync(cache));
  else { fut = await yahoo(futSym, '1h', 728); writeFileSync(cache, JSON.stringify(fut)); await new Promise(r => setTimeout(r, 1500)); }
  const cash = JSON.parse(readFileSync(new URL(`./data/${name}_1h.json`, import.meta.url)));
  const tF = runTrendF(fut, name, () => true), tC = runTrendF(cash, name, () => true);
  futTrades = futTrades.concat(tF); cashTrades = cashTrades.concat(tC);
  const night = tF.filter(t => { const h = new Date(t.entryT).getUTCHours(); return h < 13 || h >= 21; }).length;
  rows.push({
    instr: name, 'barres fut': fut.length, 'R cash': stats(tC).totalR, 'R futures': stats(tF).totalR,
    'PF cash': stats(tC).pf, 'PF fut': stats(tF).pf, 'trades fut': tF.length, 'dont nuit': `${night} (${Math.round(100 * night / tF.length)}%)`,
  });
}
console.log('===== TREND 1H : INDICES CASH (robot actuel) vs FUTURES (proches FTMO) — 2 ans =====');
console.log(fmtTable(rows));
console.log('\nTOTAL indices :');
console.log(fmtTable([
  { source: 'cash (^GSPC/^NDX/^DJI)', ...stats(cashTrades) },
  { source: 'futures (ES=F/NQ=F/YM=F)', ...stats(futTrades) },
]));
