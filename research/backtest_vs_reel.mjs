// Section 27 — Le backtest est-il fidèle ? On rejoue la stratégie trend 1h (règles robot, mêmes caps)
// sur EXACTEMENT la période du forward-test, et on compare au journal réel des signaux.
import { readFileSync } from 'node:fs';
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const sw = t => ((REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * ((t.exitT - t.entryT) / 86400000) * WED);

const log = JSON.parse(readFileSync(new URL('./robot_v1_signals_log.json', import.meta.url)));
const opens = {}, live = [];
for (const e of log) {
  if ((e.strategy || 'trend') !== 'trend') continue;
  const k = e.instrument;
  if (e.event === 'OPEN') opens[k] = e;
  else if (e.event === 'CLOSE' && opens[k]) { live.push({ instr: k, dir: opens[k].dir, t0: Date.parse(opens[k].time), t1: Date.parse(e.time), r: e.resultR }); delete opens[k]; }
}
const START = Math.min(...live.map(t => t.t0)), END = Math.max(...live.map(t => t.t1));
const { trades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const bt = trades.filter(t => t.entryT >= START - 3600e3 && t.exitT <= END + 86400e3).sort((a, b) => a.entryT - b.entryT);

const sum = a => a.reduce((s, t) => s + t.r, 0);
console.log(`Période : ${new Date(START).toISOString().slice(0, 10)} -> ${new Date(END).toISOString().slice(0, 10)}`);
console.log(`RÉEL     : ${live.length} trades | ${live.filter(t => t.r > 0).length} gagnants | brut ${sum(live).toFixed(1)}R`);
console.log(`BACKTEST : ${bt.length} trades | ${bt.filter(t => t.r > 0).length} gagnants | brut ${sum(bt).toFixed(1)}R | net swaps ${(sum(bt) + bt.reduce((s, t) => s + sw(t), 0)).toFixed(1)}R`);

// appariement trade par trade : même instrument, même sens, entrée à moins de 2 h
let matched = 0, sameSign = 0;
const rows = [];
for (const l of live) {
  const d = l.dir === 'LONG' ? 1 : -1;
  const b = bt.find(x => x.instr === l.instr && x.dir === d && Math.abs(x.entryT - l.t0) <= 2 * 3600e3);
  if (b) { matched++; if (Math.sign(b.r) === Math.sign(l.r)) sameSign++; }
  rows.push(`${new Date(l.t0).toISOString().slice(0, 13)} ${l.instr.padEnd(6)} ${l.dir.padEnd(5)} réel ${l.r.toFixed(2).padStart(5)}R | backtest ${b ? b.r.toFixed(2).padStart(5) + 'R' : '  (absent)'}`);
}
console.log(`\nTrades réels retrouvés dans le backtest : ${matched}/${live.length} | même issue (gain/perte) : ${sameSign}/${matched}`);
console.log(rows.join('\n'));
