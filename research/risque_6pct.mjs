// LE POINT QUI INQUIÈTE : le DD max de 6% (trailing) de FT+ face au drawdown naturel de la stratégie.
// Où et quand les comptes cassent-ils ? Le plafonnement au breakeven sauve-t-il la mise ?
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
import { fmtTable } from './lib.mjs';
const WED = 1.28;

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const raw = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
const swapped = raw.map(t => {
  const d = ((t.exitT - t.entryT) / 86400000) * WED;
  return { ...t, r: t.r + (REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * d };
});

// drawdown naturel de la stratégie
function maxDD(seq) { let eq = 0, pk = 0, m = 0; for (const t of seq) { eq += t.r; if (eq > pk) pk = eq; if (pk - eq > m) m = pk - eq; } return m; }
const ddSwapFree = maxDD(raw), ddSwap = maxDD(swapped);
console.log('=== DRAWDOWN NATUREL DE LA STRATÉGIE (2 ans de backtest) ===');
console.log(`  sans swap : ${ddSwapFree.toFixed(1)}R | avec swap : ${ddSwap.toFixed(1)}R`);
console.log('\n  Ce que ça donne en % du compte selon le risque (version SANS swap, celle de FT+) :');
for (const r of [0.4, 0.5, 0.75, 1.0, 1.25, 1.5]) {
  const dd = ddSwapFree * r;
  console.log(`   ${String(r).padStart(4)}% de risque -> DD de ${dd.toFixed(1)}%  ${dd <= 6 ? '✅ tient sous les 6%' : '❌ DÉPASSE les 6%'}`);
}
console.log(`\n  Risque maximum pour que le DD historique tienne sous 6% : ${(6 / ddSwapFree).toFixed(2)}%`);

// une tentative : renvoie {res, atEquity, tradesUsed}
function attempt(seq, { risk, target, maxDDp, dayDD, trailing, start }) {
  let eq = 0, peak = 0, cur = '', ds = 0, i = start, n = 0;
  const dk = j => new Date(seq[j % seq.length].exitT).toISOString().slice(0, 10) + '#' + Math.floor(j / seq.length);
  const cap = start + seq.length * 6;
  while (i < cap) {
    const k = dk(i); if (k !== cur) { cur = k; ds = 0; }
    eq += seq[i % seq.length].r * risk; ds += seq[i % seq.length].r * risk; i++; n++;
    if (eq > peak) peak = eq;
    const floor = trailing ? Math.min(peak - maxDDp, 0) : -maxDDp;
    if (ds <= -dayDD) return { res: 'bust', eq, n, cause: 'jour' };
    if (eq <= floor) return { res: 'bust', eq, n, cause: peak >= maxDDp ? 'trailing-verrouillé' : 'trailing-precoce' };
    if (eq >= target) return { res: 'pass', eq, n };
  }
  return { res: 'bust', eq, n, cause: 'temps' };
}

console.log('\n=== TAUX D\'ÉCHEC PAR TENTATIVE ET CAUSE (20 000 tentatives) ===');
const rows = [];
for (const [lb, seq, cfg] of [
  ['FT+ 6% trailing', raw, { maxDDp: 6, dayDD: 4, trailing: true }],
  ['FTMO 10% statique', swapped, { maxDDp: 10, dayDD: 5, trailing: false }],
]) {
  for (const risk of [0.5, 0.75, 1.0, 1.25, 1.5]) {
    let pass = 0; const causes = {};
    for (let s = 0; s < 20000; s++) {
      const r = attempt(seq, { risk, target: 10, start: Math.floor(Math.random() * seq.length), ...cfg });
      if (r.res === 'pass') pass++; else causes[r.cause] = (causes[r.cause] || 0) + 1;
    }
    rows.push({
      offre: lb, risque: risk + '%', 'réussite/tentative': (100 * pass / 20000).toFixed(0) + '%',
      'échec précoce': (100 * (causes['trailing-precoce'] || 0) / 20000).toFixed(0) + '%',
      'échec après +6%': (100 * (causes['trailing-verrouillé'] || 0) / 20000).toFixed(0) + '%',
      'échec jour': (100 * (causes['jour'] || 0) / 20000).toFixed(0) + '%',
    });
  }
}
console.log(fmtTable(rows));
