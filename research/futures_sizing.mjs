// CONTRAINTE PRATIQUE DES FUTURES : on ne peut pas acheter une fraction de contrat.
// Question : le contrat MINIMUM (micro) permet-il de respecter le risque par trade autorisé par Phidias ?
import { readFileSync } from 'node:fs';

// valeur du point pour les contrats MICRO (le plus petit incrément disponible)
const MICRO = {
  US500: { sym: 'MES', perPoint: 5 },     // Micro E-mini S&P 500 : 5$ par point d'indice
  US100: { sym: 'MNQ', perPoint: 2 },     // Micro E-mini Nasdaq-100 : 2$ par point
  US30: { sym: 'MYM', perPoint: 0.5 },    // Micro E-mini Dow : 0.50$ par point
  XAUUSD: { sym: 'MGC', perPoint: 10 },   // Micro Gold : 10 oz, donc 10$ par $1 d'or
};

// distances de stop RÉELLES observées sur le forward-test
const log = JSON.parse(readFileSync(new URL('../ftmo_signals_log.json', import.meta.url)));
const risks = {};
for (const e of log) {
  if (e.event !== 'OPEN' || !e.risk) continue;
  (risks[e.instrument] = risks[e.instrument] || []).push(e.risk);
}

console.log('=== RISQUE MINIMUM PAR TRADE AVEC 1 SEUL CONTRAT MICRO ===\n');
const rows = [];
for (const [inst, arr] of Object.entries(risks)) {
  const med = arr.slice().sort((a, b) => a - b)[arr.length >> 1];
  const m = MICRO[inst];
  rows.push({ instrument: inst, contrat: m.sym, 'stop médian (points)': med.toFixed(0), '$ par point': m.perPoint, 'RISQUE MINIMUM': '$' + Math.round(med * m.perPoint) });
}
const w = [11, 8, 22, 12, 16];
console.log(['instrument', 'contrat', 'stop médian (points)', '$ par point', 'RISQUE MINIMUM'].map((h, i) => h.padEnd(w[i])).join(' '));
for (const r of rows) console.log(Object.values(r).map((v, i) => String(v).padEnd(w[i])).join(' '));

console.log('\n=== CONFRONTATION AVEC LE DRAWDOWN AUTORISÉ ===');
const DD_HIST = 11.1; // drawdown historique de la stratégie, en R, sans swap
for (const [acct, dd] of [['Phidias 50K', 2000], ['Phidias 100K', 3000], ['Phidias 150K', 4500]]) {
  const maxRisk = dd / DD_HIST;
  console.log(`\n${acct} — drawdown ${dd}$ :`);
  console.log(`  risque max par trade pour survivre au pire drawdown historique (${DD_HIST}R) : $${maxRisk.toFixed(0)}`);
  for (const r of rows) {
    const need = parseInt(r['RISQUE MINIMUM'].slice(1));
    console.log(`   ${r.instrument.padEnd(7)} (${r.contrat}) : minimum $${need} ${need <= maxRisk ? '✅ jouable' : '❌ TROP GROS'}`);
  }
}
