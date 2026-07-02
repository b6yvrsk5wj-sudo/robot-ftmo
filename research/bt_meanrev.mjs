// Backtest MEAN-REVERSION (retour à la moyenne) — candidats complémentaires au trend-pullback.
// Long uniquement au-dessus de la SMA200 (le short mean-reversion sur indices est aussi testé pour preuve).
// Entrée au close du signal, stop catastrophe 3xATR (définit le R), sortie sur condition ou temps. Coûts inclus.
import { INSTR, COST_PTS, ema, rsi, atr, sma, stdev, stats, byPeriod, monthlyR, loadData, fmtTable } from './lib.mjs';
import { writeFileSync } from 'node:fs';

export function runMR(bars, name, variant) {
  const c = bars.map(x => x.c);
  const s200 = sma(c, 200), s20 = sma(c, 20), s5 = sma(c, 5), r2 = rsi(c, 2), a14 = atr(bars, 14), sd20 = stdev(c, 20);
  const cost = COST_PTS[name];
  const trades = [];
  let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i];
    if (pos) {
      pos.held++;
      const { dir, entry, riskDist } = pos;
      let exitPx = null;
      // stop catastrophe (gap géré)
      if (dir === 1 && bar.o <= pos.sl) exitPx = bar.o;
      else if (dir === 1 && bar.l <= pos.sl) exitPx = pos.sl;
      else if (dir === -1 && bar.o >= pos.sl) exitPx = bar.o;
      else if (dir === -1 && bar.h >= pos.sl) exitPx = pos.sl;
      else {
        // sortie sur condition, au close
        let cond = false;
        if (variant === 'A') cond = dir === 1 ? (r2[i] > 65 || bar.c > s5[i]) : (r2[i] < 35 || bar.c < s5[i]);
        if (variant === 'B') cond = dir === 1 ? bar.c >= s20[i] : bar.c <= s20[i];
        if (variant === 'C') cond = dir === 1 ? bar.c > pos.refHigh : bar.c < pos.refLow;
        const maxHold = variant === 'C' ? 5 : 10;
        if (cond || pos.held >= maxHold) exitPx = bar.c;
      }
      if (exitPx !== null) {
        const r = dir * (exitPx - entry) / riskDist - cost / riskDist;
        trades.push({ instr: name, dir, entryT: pos.entryT, exitT: bar.t, r, entryPx: entry, exitPx, sl: pos.sl, held: pos.held });
        pos = null;
      }
      continue;
    }
    if (s200[i] == null || a14[i] == null || r2[i] == null) continue;
    const up = bar.c > s200[i], down = bar.c < s200[i];
    let sig = 0;
    if (variant === 'A') { if (up && r2[i] < 10) sig = 1; else if (down && r2[i] > 90) sig = -1; }
    if (variant === 'B') { const lo = s20[i] - 2 * sd20[i], hi = s20[i] + 2 * sd20[i]; if (up && bar.c < lo) sig = 1; else if (down && bar.c > hi) sig = -1; }
    if (variant === 'C') {
      const d3 = c[i] < c[i - 1] && c[i - 1] < c[i - 2] && c[i - 2] < c[i - 3];
      const u3 = c[i] > c[i - 1] && c[i - 1] > c[i - 2] && c[i - 2] > c[i - 3];
      if (up && d3) sig = 1; else if (down && u3) sig = -1;
    }
    if (!sig) continue;
    const entry = bar.c, riskDist = 3 * a14[i];
    pos = { dir: sig, entry, entryT: bar.t, riskDist, sl: entry - sig * riskDist, held: 0, refHigh: bars[i - 1].h, refLow: bars[i - 1].l };
  }
  return trades;
}

const NAMES = { A: 'A — RSI2<10 au-dessus SMA200, sortie SMA5/RSI2>65', B: 'B — Bollinger 20/2 inférieur, sortie bande médiane', C: 'C — 3 clôtures baissières, sortie > plus-haut veille' };

if (process.argv[1].endsWith('bt_meanrev.mjs')) {
  const out = {};
  const data = loadData('1d');
  console.log('===== MEAN-REVERSION — DAILY 25 ans =====');
  for (const v of ['A', 'B', 'C']) {
    let all = [], allLong = [], allShort = [];
    const perInstr = [];
    for (const [, name, lb] of INSTR) {
      if (!data[name]) continue;
      const t = runMR(data[name], name, v);
      all = all.concat(t); allLong = allLong.concat(t.filter(x => x.dir === 1)); allShort = allShort.concat(t.filter(x => x.dir === -1));
      perInstr.push({ instr: lb, ...stats(t.filter(x => x.dir === 1)) });
    }
    out[v] = allLong;
    console.log(`\n--- ${NAMES[v]} ---`);
    console.log(fmtTable([{ cote: 'LONG (>SMA200)', ...stats(allLong) }, { cote: 'SHORT (<SMA200)', ...stats(allShort) }]));
    console.log('par instrument (long uniquement):');
    console.log(fmtTable(perInstr));
    console.log('sous-périodes (long uniquement):');
    console.log(fmtTable(byPeriod(allLong, [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]])));
  }
  writeFileSync(new URL('./out_meanrev.json', import.meta.url), JSON.stringify(out));
}
