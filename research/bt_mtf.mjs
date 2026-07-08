// Filtre MULTI-TIMEFRAME sur le trend-pullback 1h : n'entrer que si la tendance supérieure (4h / daily) est alignée.
// Sans lookahead : on n'utilise que des bougies HTF entièrement clôturées (daily = utilisable à t+24h, 4h = à la fin du bloc).
import { INSTR, COST_PTS, ema, sma, rsi, atr, stats, fmtTable, loadData } from './lib.mjs';

export function agg4h(bars) {
  const out = [];
  for (const b of bars) {
    const k = Math.floor(b.t / (4 * 3600_000)) * 4 * 3600_000;
    const last = out[out.length - 1];
    if (last && last.t === k) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; }
    else out.push({ t: k, o: b.o, h: b.h, l: b.l, c: b.c });
  }
  return out;
}

// même moteur que bt_trend baseline (SL 3ATR / TP 3R, gaps, SL prioritaire), + un check HTF à l'entrée
export function runTrendF(bars, name, htfCheck) {
  const c = bars.map(x => x.c);
  const e21 = ema(c, 21), e50 = ema(c, 50), e200 = ema(c, 200), r14 = rsi(c, 14), a14 = atr(bars, 14);
  const cost = COST_PTS[name];
  const trades = []; let pos = null;
  for (let i = 201; i < bars.length; i++) {
    const bar = bars[i], pv = bars[i - 1];
    if (pos) {
      const { dir, entry, riskDist, sl } = pos; const tp = entry + dir * 3 * riskDist;
      let exitPx = null;
      if (dir === 1) { if (bar.o <= sl) exitPx = bar.o; else if (bar.l <= sl) exitPx = sl; else if (bar.o >= tp) exitPx = bar.o; else if (bar.h >= tp) exitPx = tp; }
      else { if (bar.o >= sl) exitPx = bar.o; else if (bar.h >= sl) exitPx = sl; else if (bar.o <= tp) exitPx = bar.o; else if (bar.l <= tp) exitPx = tp; }
      if (exitPx !== null) { trades.push({ instr: name, dir, entryT: pos.entryT, exitT: bar.t, r: dir * (exitPx - entry) / riskDist - cost / riskDist }); pos = null; }
      else continue;
    }
    if (e200[i] == null || a14[i] == null || e21[i - 1] == null) continue;
    const aL = bar.c > e50[i] && e50[i] > e200[i], aS = bar.c < e50[i] && e50[i] < e200[i];
    const sigL = aL && pv.l <= e21[i - 1] && bar.c > bar.o && bar.c > e21[i] && r14[i] < 70;
    const sigS = aS && pv.h >= e21[i - 1] && bar.c < bar.o && bar.c < e21[i] && r14[i] > 30;
    if (!sigL && !sigS) continue;
    const dir = sigL ? 1 : -1;
    if (!htfCheck(dir, bar.t)) continue;
    pos = { dir, entry: bar.c, entryT: bar.t, riskDist: 3 * a14[i], sl: bar.c - dir * 3 * a14[i] };
  }
  return trades;
}

// index HTF : dernier indice dont la bougie est utilisable à l'instant t
export function mkLookup(times) {
  return t => { let lo = 0, hi = times.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (times[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
}

const d1h = loadData('1h'), d1d = loadData('1d');
const FILTERS = ['baseline (aucun filtre HTF)', 'daily: prix > SMA200 (long) / < (short)', 'daily: EMA50>EMA200 alignées', '4h: EMA50>EMA200 alignées'];
const agg = {};
for (const [, name] of INSTR) {
  if (!d1h[name] || !d1d[name]) continue;
  const D = d1d[name], cD = D.map(x => x.c);
  const s200D = sma(cD, 200), e50D = ema(cD, 50), e200D = ema(cD, 200);
  const lookD = mkLookup(D.map(x => x.t + 24 * 3600_000));
  const H4 = agg4h(d1h[name]), c4 = H4.map(x => x.c);
  const e50H = ema(c4, 50), e200H = ema(c4, 200);
  const look4 = mkLookup(H4.map(x => x.t + 4 * 3600_000));
  const checks = [
    () => true,
    (dir, t) => { const j = lookD(t); if (j < 200) return false; return dir === 1 ? cD[j] > s200D[j] : cD[j] < s200D[j]; },
    (dir, t) => { const j = lookD(t); if (j < 200) return false; return dir === 1 ? e50D[j] > e200D[j] : e50D[j] < e200D[j]; },
    (dir, t) => { const j = look4(t); if (j < 200 || e200H[j] == null) return false; return dir === 1 ? e50H[j] > e200H[j] : e50H[j] < e200H[j]; },
  ];
  FILTERS.forEach((f, k) => { agg[f] = (agg[f] || []).concat(runTrendF(d1h[name], name, checks[k])); });
}
console.log('===== FILTRE MULTI-TIMEFRAME sur le trend 1h — 2 ans, 4 instruments =====');
console.log(fmtTable(FILTERS.map(f => ({ filtre: f, ...stats(agg[f]) }))));
