// Backtest trend-pullback (stratégie live) + variantes de sorties/filtres.
// Gaps gérés (sortie à l'open si le prix saute le niveau), SL prioritaire sur TP dans la même barre (conservateur), coûts inclus.
import { INSTR, COST_PTS, ema, rsi, atr, sma, stats, byPeriod, monthlyR, loadData, fmtTable } from './lib.mjs';
import { writeFileSync } from 'node:fs';

export function runTrend(bars, name, opt = {}) {
  const { tpR = 3, breakeven = null, trailing = false, volFilter = false, sessionFilter = false } = opt;
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const avgAtr = sma(a14.map(x => x ?? 0), 100);
  const cost = COST_PTS[name];
  const trades = [];
  let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i], pv = bars[i - 1];
    if (pos) {
      const { dir, entry, riskDist } = pos;
      // trailing chandelier : stop suiveur figé à la barre précédente, puis mis à jour
      if (trailing) {
        const ext = dir === 1 ? Math.max(pos.hc, bar.c) : Math.min(pos.hc, bar.c);
        var stop = pos.sl;
      } else var stop = pos.sl;
      const tp = trailing ? null : entry + dir * tpR * riskDist;
      let exitPx = null;
      if (dir === 1) {
        if (bar.o <= stop) exitPx = bar.o;
        else if (bar.l <= stop) exitPx = stop;
        else if (tp !== null && bar.o >= tp) exitPx = bar.o;
        else if (tp !== null && bar.h >= tp) exitPx = tp;
      } else {
        if (bar.o >= stop) exitPx = bar.o;
        else if (bar.h >= stop) exitPx = stop;
        else if (tp !== null && bar.o <= tp) exitPx = bar.o;
        else if (tp !== null && bar.l <= tp) exitPx = tp;
      }
      if (exitPx !== null) {
        const r = dir * (exitPx - entry) / riskDist - cost / riskDist;
        trades.push({ instr: name, dir, entryT: pos.entryT, exitT: bar.t, r });
        pos = null;
      } else {
        // mise à jour du stop pour la barre suivante
        if (trailing) {
          pos.hc = dir === 1 ? Math.max(pos.hc, bar.c) : Math.min(pos.hc, bar.c);
          const ch = pos.hc - dir * 3 * a14[i];
          if (dir === 1 && ch > pos.sl) pos.sl = ch;
          if (dir === -1 && ch < pos.sl) pos.sl = ch;
        }
        if (breakeven !== null) {
          const trig = entry + dir * breakeven * riskDist;
          if ((dir === 1 && bar.h >= trig) || (dir === -1 && bar.l <= trig)) {
            if (dir === 1 && pos.sl < entry) pos.sl = entry;
            if (dir === -1 && pos.sl > entry) pos.sl = entry;
          }
        }
        continue;
      }
    }
    if (e200[i] == null || a14[i] == null || e21[i - 1] == null) continue;
    const aL = bar.c > e50[i] && e50[i] > e200[i], aS = bar.c < e50[i] && e50[i] < e200[i];
    const sigL = aL && pv.l <= e21[i - 1] && bar.c > bar.o && bar.c > e21[i] && r14[i] < 70;
    const sigS = aS && pv.h >= e21[i - 1] && bar.c < bar.o && bar.c < e21[i] && r14[i] > 30;
    if (!sigL && !sigS) continue;
    if (volFilter && avgAtr[i] && a14[i] > 2 * avgAtr[i]) continue;
    if (sessionFilter) { const h = new Date(bar.t).getUTCHours(); if (h < 13 || h > 20) continue; }
    const dir = sigL ? 1 : -1;
    const entry = bar.c, riskDist = 3 * a14[i];
    pos = { dir, entry, entryT: bar.t, riskDist, sl: entry - dir * riskDist, hc: entry };
  }
  return trades;
}

const VARIANTS = [
  ['baseline (TP 3R)', {}],
  ['TP 2R', { tpR: 2 }],
  ['TP 4R', { tpR: 4 }],
  ['break-even à +1.5R', { breakeven: 1.5 }],
  ['trailing chandelier 3ATR', { trailing: true }],
  ['filtre volatilité (ATR<2x moy)', { volFilter: true }],
];

if (process.argv[1].endsWith('bt_trend.mjs')) {
  const out = {};
  for (const interval of ['1d', '1h']) {
    const data = loadData(interval);
    console.log(`\n===== TREND-PULLBACK — ${interval === '1d' ? 'DAILY 25 ans' : '1H 2 ans (config live)'} =====`);
    const variants = interval === '1h' ? [...VARIANTS, ['filtre session US 13-20 UTC', { sessionFilter: true }]] : VARIANTS;
    for (const [label, opt] of variants) {
      let all = [];
      for (const [, name] of INSTR) { if (data[name]) all = all.concat(runTrend(data[name], name, opt)); }
      out[`${interval}|${label}`] = all;
      console.log(`\n--- ${label} ---`);
      console.log(fmtTable([{ variante: label, ...stats(all) }]));
    }
    // détail par instrument + sous-périodes pour la baseline
    let base = [];
    const perInstr = [];
    for (const [, name, lb] of INSTR) { if (!data[name]) continue; const t = runTrend(data[name], name, {}); base = base.concat(t); perInstr.push({ instr: lb, ...stats(t) }); }
    console.log(`\n--- baseline par instrument (${interval}) ---`);
    console.log(fmtTable(perInstr));
    if (interval === '1d') {
      console.log(`\n--- baseline par sous-période (robustesse) ---`);
      console.log(fmtTable(byPeriod(base, [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]])));
    }
  }
  const save = {};
  for (const [k, v] of Object.entries(out)) save[k] = v;
  writeFileSync(new URL('./out_trend.json', import.meta.url), JSON.stringify(save));
}
