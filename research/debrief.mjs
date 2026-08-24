// Debrief complet du forward-test : P&L exact en $ avec swaps réels FTMO + triple mercredi.
// Autonome (taux en dur) pour ne dépendre d'aucun cache de données.
import { readFileSync } from 'node:fs';

const RATES = { // %/jour du notionnel — relevés dans MT5 FTMO par l'utilisateur
  US500: { L: -0.0211, S: +0.0003 }, US100: { L: -0.0217, S: +0.0009 },
  US30: { L: -0.0218, S: +0.0009 }, XAUUSD: { L: -0.0182, S: -0.0059 },
};
const ACCOUNT = 100000, RISK = 1, R_USD = ACCOUNT * RISK / 100;
const log = JSON.parse(readFileSync(new URL('../ftmo_signals_log.json', import.meta.url)));

function billedDays(t0, t1) { // 1 nuit = 1 jour, mercredi = triple
  let d = 0; const end = new Date(t1);
  for (let x = new Date(t0); x < end; x.setUTCDate(x.getUTCDate() + 1)) {
    const nx = new Date(x); nx.setUTCDate(nx.getUTCDate() + 1);
    if (nx > end) { d += (end - x) / 86400000; break; }
    d += x.getUTCDay() === 3 ? 3 : 1;
  }
  return d;
}

const opens = {}, done = [];
for (const e of log) {
  const k = (e.strategy || 'trend') + '_' + e.instrument;
  if (e.event === 'OPEN') opens[k] = e;
  else if (e.event === 'CLOSE' && opens[k]) { done.push({ o: opens[k], c: e, strat: e.strategy || 'trend' }); delete opens[k]; }
}

let grossR = 0, swapUSD = 0, trGross = 0, trSwap = 0, mrGross = 0, mrSwap = 0;
const rows = [];
for (const { o, c, strat } of done) {
  const dir = o.dir === 'LONG' ? 1 : -1;
  const days = billedDays(o.time, c.time);
  const swR = (RATES[o.instrument][dir === 1 ? 'L' : 'S'] / 100) * (o.entry / o.risk) * days;
  const g = c.resultR * R_USD, s = swR * R_USD;
  grossR += c.resultR; swapUSD += s;
  if (strat === 'MR') { mrGross += g; mrSwap += s; } else { trGross += g; trSwap += s; }
  rows.push({ date: c.time.slice(0, 10), strat, instr: o.instrument, j: ((new Date(c.time) - new Date(o.time)) / 86400000).toFixed(0), brut: Math.round(g), swap: Math.round(s), net: Math.round(g + s) });
}

const W = [10, 5, 7, 4, 7, 7, 7];
const H = ['date', 'strat', 'instr', 'j', 'brut $', 'swap $', 'net $'];
console.log(H.map((h, i) => h.padEnd(W[i])).join(' '));
for (const r of rows) console.log([r.date, r.strat, r.instr, r.j, (r.brut >= 0 ? '+' : '') + r.brut, r.swap, (r.net >= 0 ? '+' : '') + r.net].map((v, i) => String(v).padEnd(W[i])).join(' '));

console.log('\n--- PAR STRATÉGIE (clôturé) ---');
console.log(`TREND : brut ${trGross >= 0 ? '+' : ''}${Math.round(trGross)}$ | swap ${Math.round(trSwap)}$ | NET ${trGross + trSwap >= 0 ? '+' : ''}${Math.round(trGross + trSwap)}$`);
console.log(`MR    : brut ${mrGross >= 0 ? '+' : ''}${Math.round(mrGross)}$ | swap ${Math.round(mrSwap)}$ | NET ${mrGross + mrSwap >= 0 ? '+' : ''}${Math.round(mrGross + mrSwap)}$`);
const netTot = grossR * R_USD + swapUSD;
console.log(`\nTOTAL CLÔTURÉ : brut ${Math.round(grossR * R_USD)}$ (${grossR.toFixed(2)}R) | swap ${Math.round(swapUSD)}$ | NET ${netTot >= 0 ? '+' : ''}${Math.round(netTot)}$ = ${(netTot / ACCOUNT * 100).toFixed(2)}% du compte`);

console.log('\n--- POSITIONS OUVERTES (swap déjà couru) ---');
let os = 0;
for (const k in opens) {
  const o = opens[k]; const dir = o.dir === 'LONG' ? 1 : -1;
  const s = (RATES[o.instrument][dir === 1 ? 'L' : 'S'] / 100) * (o.entry / o.risk) * billedDays(o.time, new Date().toISOString()) * R_USD;
  os += s;
  console.log(`${k.padEnd(10)} ouvert ${o.time.slice(0, 10)} : swap couru ${Math.round(s)}$`);
}
console.log(`\n>>> SWAP TOTAL PAYÉ DEPUIS LE DÉBUT : ${Math.round(swapUSD + os)}$`);

// rythme
const t0 = new Date(log.find(e => e.event === 'OPEN').time), t1 = new Date();
const weeks = (t1 - t0) / (7 * 86400000);
console.log(`\nDurée : ${weeks.toFixed(1)} semaines | ${done.length} trades clôturés | ${(done.length / weeks * 4.33).toFixed(1)} trades/mois`);
console.log(`Rythme NET : ${(netTot / R_USD / weeks * 4.33).toFixed(2)}R/mois (backtest attendu ~1.25R/mois)`);
