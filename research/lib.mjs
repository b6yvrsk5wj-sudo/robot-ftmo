// Librairie commune backtests — indicateurs identiques au robot (robot_ftmo.mjs) + stats.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

export const INSTR = [
  ['^GSPC', 'US500', 'S&P 500'],
  ['^NDX', 'US100', 'Nasdaq 100'],
  ['^DJI', 'US30', 'Dow Jones'],
  ['GC=F', 'XAUUSD', 'Or'],
];

// Coût aller-retour estimé (spread + slippage) en points, côté FTMO.
export const COST_PTS = { US500: 0.8, US100: 2.5, US30: 4, XAUUSD: 0.5 };

export async function yahoo(sym, interval, days) {
  const p2 = Math.floor(Date.now() / 1000), p1 = p2 - days * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&period1=${p1}&period2=${p2}`;
  const j = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  if (!j.chart?.result?.[0]) throw new Error(`Yahoo ${sym} ${interval}: ${JSON.stringify(j.chart?.error || j).slice(0, 200)}`);
  const r = j.chart.result[0]; const ts = r.timestamp || []; const q = r.indicators.quote[0];
  const b = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) continue;
    b.push({ t: ts[i] * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] });
  }
  return b;
}

export function ema(v, len) { const k = 2 / (len + 1); let p = null; const o = []; for (let i = 0; i < v.length; i++) { if (i < len - 1) { o.push(null); continue; } if (p === null) { let s = 0; for (let j = i - len + 1; j <= i; j++)s += v[j]; p = s / len; } else p = v[i] * k + p * (1 - k); o.push(p); } return o; }
export function sma(v, len) { const o = []; let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= len) s -= v[i - len]; o.push(i >= len - 1 ? s / len : null); } return o; }
export function rsi(c, len) { const o = [null]; let aG = 0, aL = 0; for (let i = 1; i < c.length; i++) { const ch = c[i] - c[i - 1], g = Math.max(ch, 0), l = Math.max(-ch, 0); if (i <= len) { aG += g; aL += l; o.push(null); if (i === len) { aG /= len; aL /= len; o[o.length - 1] = aL === 0 ? 100 : 100 - 100 / (1 + aG / aL); } } else { aG = (aG * (len - 1) + g) / len; aL = (aL * (len - 1) + l) / len; o.push(aL === 0 ? 100 : 100 - 100 / (1 + aG / aL)); } } return o; }
export function atr(b, len) { let p = null; const tr = [], o = []; for (let i = 0; i < b.length; i++)tr.push(i === 0 ? b[i].h - b[i].l : Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c))); for (let i = 0; i < b.length; i++) { if (i < len) { o.push(null); continue; } if (p === null) { let s = 0; for (let j = i - len + 1; j <= i; j++)s += tr[j]; p = s / len; } else p = (p * (len - 1) + tr[i]) / len; o.push(p); } return o; }
export function stdev(v, len) { const o = []; for (let i = 0; i < v.length; i++) { if (i < len - 1) { o.push(null); continue; } let m = 0; for (let j = i - len + 1; j <= i; j++)m += v[j]; m /= len; let s = 0; for (let j = i - len + 1; j <= i; j++)s += (v[j] - m) ** 2; o.push(Math.sqrt(s / len)); } return o; }

// trades: [{instr, dir, entryT, exitT, entryPx, exitPx, r}] — r = résultat net en R (coûts inclus)
export function stats(trades) {
  const n = trades.length;
  if (!n) return { n: 0 };
  const wins = trades.filter(t => t.r > 0);
  const gp = wins.reduce((s, t) => s + t.r, 0);
  const gl = -trades.filter(t => t.r <= 0).reduce((s, t) => s + t.r, 0);
  const totalR = gp - gl;
  // équité + max drawdown en R, trades triés par date de sortie
  const sorted = [...trades].sort((a, b) => a.exitT - b.exitT);
  let eq = 0, peak = 0, maxDD = 0;
  for (const t of sorted) { eq += t.r; if (eq > peak) peak = eq; if (peak - eq > maxDD) maxDD = peak - eq; }
  return {
    n, winRate: +(100 * wins.length / n).toFixed(1),
    pf: gl > 0 ? +(gp / gl).toFixed(2) : Infinity,
    expR: +(totalR / n).toFixed(3), totalR: +totalR.toFixed(1), maxDD_R: +maxDD.toFixed(1),
  };
}

export function byPeriod(trades, periods) {
  // periods: [[label, fromYear, toYear]] — robustesse par sous-période (année de sortie)
  return periods.map(([label, y1, y2]) => {
    const sub = trades.filter(t => { const y = new Date(t.exitT).getUTCFullYear(); return y >= y1 && y <= y2; });
    return { period: label, ...stats(sub) };
  });
}

export function monthlyR(trades) {
  const m = {};
  for (const t of trades) { const k = new Date(t.exitT).toISOString().slice(0, 7); m[k] = (m[k] || 0) + t.r; }
  return m;
}

export function correlation(mA, mB) {
  const keys = [...new Set([...Object.keys(mA), ...Object.keys(mB)])].sort();
  const a = keys.map(k => mA[k] || 0), b = keys.map(k => mB[k] || 0);
  const n = keys.length; if (n < 12) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return +(cov / Math.sqrt(va * vb)).toFixed(2);
}

export function loadData(interval) {
  const d = {};
  for (const [, name] of INSTR) {
    const f = new URL(`./data/${name}_${interval}.json`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    if (existsSync(f)) d[name] = JSON.parse(readFileSync(f));
  }
  return d;
}

export function fmtTable(rows) {
  if (!rows.length) return '(aucun trade)';
  const cols = Object.keys(rows[0]);
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const line = r => cols.map((c, i) => String(r[c] ?? '').padStart(w[i])).join('  ');
  return [cols.map((c, i) => c.padStart(w[i])).join('  '), ...rows.map(line)].join('\n');
}
