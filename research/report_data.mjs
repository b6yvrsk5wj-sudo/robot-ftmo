// Prépare les données pour le rapport : exemples de trades MR-A récents + courbes d'équité mensuelles cumulées.
import { readFileSync } from 'node:fs';
import { monthlyR } from './lib.mjs';

const trend = JSON.parse(readFileSync(new URL('./out_trend.json', import.meta.url)));
const mr = JSON.parse(readFileSync(new URL('./out_meanrev.json', import.meta.url)));
const mrA = mr['A'].filter(t => t.instr !== 'XAUUSD');

// 8 derniers trades MR-A avec prix (exemples concrets)
console.log('=== 8 derniers trades MR-A (réels, backtest) ===');
for (const t of mrA.slice(-8)) {
  console.log(JSON.stringify({
    instr: t.instr, achat: new Date(t.entryT).toISOString().slice(0, 10), px: +t.entryPx.toFixed(0),
    vente: new Date(t.exitT).toISOString().slice(0, 10), pxOut: +t.exitPx.toFixed(0), jours: t.held, R: +t.r.toFixed(2),
  }));
}

// équité cumulée mensuelle 25 ans : trend daily / MR-A / combiné
function cumSeries(monthly, keys) { let c = 0; return keys.map(k => +(c += (monthly[k] || 0)).toFixed(1)); }
const mT = monthlyR(trend['1d|baseline (TP 3R)']), mM = monthlyR(mrA);
const keys = [...new Set([...Object.keys(mT), ...Object.keys(mM)])].sort();
console.log('\n=== SERIES 25 ans (mensuel cumulé, R) ===');
console.log('KEYS25=' + JSON.stringify(keys.filter((_, i) => i % 3 === 0))); // 1 point par trimestre pour alléger
const q = a => a.filter((_, i) => i % 3 === 0);
console.log('TREND25=' + JSON.stringify(q(cumSeries(mT, keys))));
console.log('MR25=' + JSON.stringify(q(cumSeries(mM, keys))));
const mC = {}; for (const k of keys) mC[k] = (mT[k] || 0) + (mM[k] || 0);
console.log('COMB25=' + JSON.stringify(q(cumSeries(mC, keys))));

// équité 2 ans : trend 1h live / MR-A / combiné
const cut = Date.now() - 730 * 86400000;
const mT2 = monthlyR(trend['1h|baseline (TP 3R)']), mM2 = monthlyR(mrA.filter(t => t.exitT >= cut));
const keys2 = [...new Set([...Object.keys(mT2), ...Object.keys(mM2)])].sort();
console.log('\n=== SERIES 2 ans (mensuel cumulé, R) ===');
console.log('KEYS2=' + JSON.stringify(keys2));
console.log('TREND2=' + JSON.stringify(cumSeries(mT2, keys2)));
console.log('MR2=' + JSON.stringify(cumSeries(mM2, keys2)));
const mC2 = {}; for (const k of keys2) mC2[k] = (mT2[k] || 0) + (mM2[k] || 0);
console.log('COMB2=' + JSON.stringify(cumSeries(mC2, keys2)));
