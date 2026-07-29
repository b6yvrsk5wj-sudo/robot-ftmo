// P&L EXACT en $ si le forward-test avait tourné sur un vrai compte FTMO 100k à 1% de risque.
// Inclut les SWAPS aux taux réels MT5 de l'utilisateur, avec triple swap du mercredi.
import { readFileSync } from 'node:fs';
import { REAL_RATES } from './bt_swap.mjs';

const ACCOUNT = 100000, RISK_PCT = 1;
const R_USD = ACCOUNT * RISK_PCT / 100; // 1R = 1000$

const log = JSON.parse(readFileSync(new URL('../ftmo_signals_log.json', import.meta.url)));

// apparie OPEN -> CLOSE par instrument+stratégie
const opens = {}, trades = [];
for (const e of log) {
  const key = (e.strategy || 'trend') + '_' + e.instrument;
  if (e.event === 'OPEN') opens[key] = e;
  else if (e.event === 'CLOSE' && opens[key]) {
    trades.push({ open: opens[key], close: e, key });
    delete opens[key];
  }
}

// jours facturés : 1 par nuit, +2 pour chaque nuit de mercredi (triple swap)
function billedDays(t0, t1) {
  let d = 0;
  const start = new Date(t0), end = new Date(t1);
  for (let x = new Date(start); x < end; x.setUTCDate(x.getUTCDate() + 1)) {
    const next = new Date(x); next.setUTCDate(next.getUTCDate() + 1);
    if (next > end) { d += (end - x) / 86400000; break; }
    d += x.getUTCDay() === 3 ? 3 : 1; // mercredi = triple
  }
  return d;
}

console.log('=== TRADES CLÔTURÉS — compte 100 000$ à 1% de risque ===\n');
let grossR = 0, swapUSD = 0;
const rows = [];
for (const { open, close, key } of trades) {
  const dir = open.dir === 'LONG' ? 1 : -1;
  const instr = open.instrument;
  const days = billedDays(open.time, close.time);
  const rate = REAL_RATES[instr][dir === 1 ? 'L' : 'S'];
  const swapR = (rate / 100) * (open.entry / open.risk) * days;
  const gross = close.resultR * R_USD;
  const sw = swapR * R_USD;
  grossR += close.resultR; swapUSD += sw;
  rows.push({
    date: close.time.slice(0, 10), strat: (open.strategy || 'trend'), instr, sens: open.dir,
    jours: ((new Date(close.time) - new Date(open.time)) / 86400000).toFixed(1),
    brut: Math.round(gross), swap: Math.round(sw), net: Math.round(gross + sw),
  });
}
const w = [10, 5, 7, 5, 6, 8, 7, 8];
const hdr = ['date', 'strat', 'instr', 'sens', 'jours', 'brut $', 'swap $', 'net $'];
console.log(hdr.map((h, i) => h.padEnd(w[i])).join(' '));
for (const r of rows) console.log([r.date, r.strat, r.instr, r.sens, r.jours, (r.brut >= 0 ? '+' : '') + r.brut, r.swap.toFixed(0), (r.net >= 0 ? '+' : '') + r.net].map((v, i) => String(v).padEnd(w[i])).join(' '));

const grossUSD = grossR * R_USD;
console.log('\n--- TOTAL CLÔTURÉ ---');
console.log(`Résultat brut (sans frais) : ${grossUSD >= 0 ? '+' : ''}${Math.round(grossUSD)}$  (${grossR.toFixed(1)}R)`);
console.log(`Coût des swaps             : ${Math.round(swapUSD)}$`);
console.log(`RÉSULTAT NET               : ${grossUSD + swapUSD >= 0 ? '+' : ''}${Math.round(grossUSD + swapUSD)}$  (${((grossUSD + swapUSD) / R_USD).toFixed(2)}R = ${((grossUSD + swapUSD) / ACCOUNT * 100).toFixed(2)}% du compte)`);

// positions encore ouvertes : swap déjà payé à ce jour
console.log('\n--- POSITIONS ENCORE OUVERTES (swap déjà couru) ---');
let openSwap = 0;
for (const key in opens) {
  const o = opens[key];
  const dir = o.dir === 'LONG' ? 1 : -1;
  const days = billedDays(o.time, new Date().toISOString());
  const rate = REAL_RATES[o.instrument][dir === 1 ? 'L' : 'S'];
  const sw = (rate / 100) * (o.entry / o.risk) * days * R_USD;
  openSwap += sw;
  console.log(`${o.instrument.padEnd(7)} ${o.dir.padEnd(5)} ouvert le ${o.time.slice(0, 10)} : swap couru ${Math.round(sw)}$`);
}
console.log(`Swap total sur positions ouvertes : ${Math.round(openSwap)}$`);
console.log(`\n>>> COÛT TOTAL DES SWAPS DEPUIS LE DÉBUT : ${Math.round(swapUSD + openSwap)}$`);
