// La variante C (trend-pullback clôturé le soir) est-elle robuste, ou portée par un seul instrument
// comme l'ORB (dont 100% du profit vient de l'or) ? Test par instrument + par semestre + charge d'exécution.
import { INSTR, COST_PTS, ema, rsi, atr, stats, loadData, fmtTable } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const dayOf = t => new Date(t).toISOString().slice(0, 10);

function run(bars, name, { intraday }) {
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const cost = COST_PTS[name]; const out = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const b = bars[i], pv = bars[i - 1];
    const last = i === bars.length - 1 || dayOf(bars[i + 1].t) !== dayOf(b.t);
    if (pos) {
      const tp = pos.entry + pos.dir * 3 * pos.risk;
      let x = null;
      if (pos.dir === 1) { if (b.o <= pos.sl) x = b.o; else if (b.l <= pos.sl) x = pos.sl; else if (b.o >= tp) x = b.o; else if (b.h >= tp) x = tp; else if (intraday && last) x = b.c; }
      else { if (b.o >= pos.sl) x = b.o; else if (b.h >= pos.sl) x = pos.sl; else if (b.o <= tp) x = b.o; else if (b.l <= tp) x = tp; else if (intraday && last) x = b.c; }
      if (x !== null) {
        let r = pos.dir * (x - pos.entry) / pos.risk - cost / pos.risk;
        if (!intraday) { const dd = ((b.t - pos.t) / 86400000) * WED; r += (REAL_RATES[name][pos.dir === 1 ? 'L' : 'S'] / 100) * (pos.entry / pos.risk) * dd; }
        out.push({ instr: name, dir: pos.dir, entryT: pos.t, exitT: b.t, r });
        pos = null;
      } else continue;
    }
    if ((intraday && last) || e200[i] == null || a14[i] == null || e21[i - 1] == null) continue;
    const aL = b.c > e50[i] && e50[i] > e200[i], aS = b.c < e50[i] && e50[i] < e200[i];
    const sL = aL && pv.l <= e21[i - 1] && b.c > b.o && b.c > e21[i] && r14[i] < 70;
    const sS = aS && pv.h >= e21[i - 1] && b.c < b.o && b.c < e21[i] && r14[i] > 30;
    if (!sL && !sS) continue;
    const dir = sL ? 1 : -1, risk = 3 * a14[i];
    pos = { dir, entry: b.c, sl: b.c - dir * risk, risk, t: b.t };
  }
  return out;
}

const d = loadData('1h');
console.log('===== PAR INSTRUMENT : intraday (0 swap) vs swing (swaps réels), 2 ans =====\n');
const rows = [];
let allI = [], allS = [];
for (const [, n, lb] of INSTR) {
  if (!d[n]) continue;
  const I = run(d[n], n, { intraday: true }), S = run(d[n], n, { intraday: false });
  allI = allI.concat(I); allS = allS.concat(S);
  rows.push({ instrument: lb, 'R intraday': stats(I).totalR, 'PF intra': stats(I).pf, 'R swing net': stats(S).totalR, 'PF swing': stats(S).pf, 'trades intra': I.length });
}
console.log(fmtTable(rows));

console.log('\n===== AGRÉGÉ =====');
console.log(fmtTable([
  { config: 'INTRADAY (clôture le soir, 0 swap)', ...stats(allI), 'R/an': (stats(allI).totalR / 2).toFixed(1), 'rendement/DD': (stats(allI).totalR / stats(allI).maxDD_R).toFixed(2) },
  { config: 'SWING (net des swaps réels)', ...stats(allS), 'R/an': (stats(allS).totalR / 2).toFixed(1), 'rendement/DD': (stats(allS).totalR / stats(allS).maxDD_R).toFixed(2) },
]));

console.log('\n===== ROBUSTESSE PAR SEMESTRE (intraday) =====');
const sem = {};
for (const t of allI) { const dt = new Date(t.exitT); const k = dt.getUTCFullYear() + '-S' + (dt.getUTCMonth() < 6 ? 1 : 2); (sem[k] = sem[k] || []).push(t); }
console.log(fmtTable(Object.entries(sem).sort().map(([k, v]) => ({ semestre: k, ...stats(v) }))));

console.log('\n===== CHARGE D\'EXÉCUTION =====');
console.log(`  intraday : ${allI.length} trades / 2 ans = ${(allI.length / 24).toFixed(0)} par mois (~${(allI.length / 500).toFixed(1)} par jour de bourse)`);
console.log(`  swing    : ${allS.length} trades / 2 ans = ${(allS.length / 24).toFixed(0)} par mois`);
