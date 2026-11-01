// Section 29 — Cassure de la 1re heure face aux règles FTMO : drawdown en %, pire jour, Monte Carlo du challenge.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./pepites.mjs', import.meta.url), 'utf8');
// on réutilise le moteur de pepites.mjs sans relancer tout son rapport
const cut = src.indexOf('const D = loadData');
const mod = src.slice(0, cut).replace(/^import .*$/gm, '') ;
const { INSTR, COST_PTS, ema, sma, rsi, atr, stats, loadData } = await import('./lib.mjs');
const { REAL_RATES } = await import('./bt_swap.mjs');
const fn = new Function('INSTR', 'COST_PTS', 'ema', 'sma', 'rsi', 'atr', 'stats', 'loadData', 'REAL_RATES', mod + '\nreturn { S, run };');
const { S, run } = fn(INSTR, COST_PTS, ema, sma, rsi, atr, stats, loadData, REAL_RATES);
const H = loadData('1h'), st = S['Cassure de la 1re bougie de séance (indices 1h)'];
let tr = []; for (const n of st.instr) tr = tr.concat(run(H[n], n, st));
tr.sort((a, b) => a.exitT - b.exitT);
const day = t => new Date(t).toISOString().slice(0, 10);
const byDay = {}; for (const t of tr) byDay[day(t.exitT)] = (byDay[day(t.exitT)] || 0) + t.r;
const days = Object.keys(byDay).sort().map(k => byDay[k]);
console.log(`${tr.length} trades sur ${days.length} jours de bourse | ${(tr.length / days.length).toFixed(2)} trades/jour`);
console.log(`pire jour : ${Math.min(...days).toFixed(2)}R | meilleur jour : ${Math.max(...days).toFixed(2)}R`);
// drawdown max en R (sur la séquence journalière)
let eq = 0, pk = 0, dd = 0; for (const d of days) { eq += d; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
console.log(`total ${eq.toFixed(1)}R | drawdown max ${dd.toFixed(1)}R\n`);
console.log('risque | rendement/an | DD max | pire jour');
for (const rk of [0.25, 0.35, 0.5, 0.75, 1]) console.log(`${String(rk).padEnd(6)} | ${(eq / 2 * rk).toFixed(1).padStart(9)} % | ${(dd * rk).toFixed(1).padStart(5)} % | ${(Math.min(...days) * rk).toFixed(2)} %`);

// Monte Carlo du challenge FTMO 2-Step : phase 1 +10 %, phase 2 +5 %, perte max -10 % (statique), perte jour -5 %.
// Tirage de JOURS entiers (bootstrap par blocs de 20 jours pour garder les séries), 10 000 essais.
function challenge(rk, edgeCut = 0) {
  let pass = 0, months = [];
  const N = 10000, B = 20;
  let seed = 12345; const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < N; k++) {
    let bal = 0, phase = 1, start = 0, d = 0, dead = false;
    const target = () => (phase === 1 ? 10 : 5);
    while (!dead && phase <= 2 && d < 750) {
      const b0 = Math.floor(rand() * (days.length - B));
      for (let j = 0; j < B && !dead && phase <= 2; j++, d++) {
        const p = (days[b0 + j] - edgeCut * 0) * rk; // edgeCut appliqué par trade plus bas
        bal += p;
        if (p <= -5 || bal - start <= -10) dead = true;
        else if (bal - start >= target()) { phase++; start = bal; }
      }
    }
    if (!dead && phase > 2) { pass++; months.push(d / 21); }
  }
  months.sort((a, b) => a - b);
  return { pass: 100 * pass / N, med: months.length ? months[months.length >> 1] : null };
}
console.log('\n=== CHALLENGE FTMO 2-Step (10 % puis 5 %, -10 % max, -5 %/jour) ===');
for (const rk of [0.25, 0.35, 0.5, 0.75, 1]) { const r = challenge(rk); console.log(`risque ${rk} % : réussite ${r.pass.toFixed(0)} % | durée médiane ${r.med ? r.med.toFixed(1) + ' mois' : '-'}`); }
// scénario prudent : l'avantage réel est moitié moindre (0.023R/trade retiré à chaque trade)
const perDayTrades = {}; for (const t of tr) perDayTrades[day(t.exitT)] = (perDayTrades[day(t.exitT)] || 0) + 1;
const keys = Object.keys(byDay).sort(), half = keys.map(k => byDay[k] - 0.023 * perDayTrades[k]), zero = keys.map(k => byDay[k] - 0.046 * perDayTrades[k]);
for (const [lb, arr] of [['avantage divisé par 2', half], ['avantage nul', zero]]) {
  const save = days.splice(0, days.length, ...arr);
  console.log(`\n--- scénario : ${lb} ---`);
  for (const rk of [0.35, 0.5, 1]) { const r = challenge(rk); console.log(`risque ${rk} % : réussite ${r.pass.toFixed(0)} % | durée médiane ${r.med ? r.med.toFixed(1) + ' mois' : '-'}`); }
  days.splice(0, days.length, ...save);
}
