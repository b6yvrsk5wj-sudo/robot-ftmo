// Section 26 — Les stratégies de SUIVI DE TENDANCE « du moment » (celles qui circulent en 2026 :
// Supertrend, cassures de plus haut/bas, croisements de moyennes, momentum 12 mois…) passées aux 3 tests :
// (1) 2 dernières années (« ça marche en ce moment ? »), (2) 25 ans, (3) contre une entrée au hasard.
// Tout est NET : spread + swaps réels FTMO (mercredi triple). Risque normalisé : 1R = distance du stop initial.
import { INSTR, COST_PTS, ema, sma, atr, stats, loadData } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';

const WED = 1.28, DAY = 86400000;
const NAMES = INSTR.map(x => x[1]);

function supertrend(b, len, mult) {
  const a = atr(b, len), up = [], dn = [], dir = [];
  for (let i = 0; i < b.length; i++) {
    if (a[i] == null) { up.push(null); dn.push(null); dir.push(0); continue; }
    const m = (b[i].h + b[i].l) / 2;
    let u = m - mult * a[i], d = m + mult * a[i];
    if (up[i - 1] != null && b[i - 1].c > up[i - 1]) u = Math.max(u, up[i - 1]);
    if (dn[i - 1] != null && b[i - 1].c < dn[i - 1]) d = Math.min(d, dn[i - 1]);
    let s = dir[i - 1] || 1;
    if (s === -1 && b[i].c > (dn[i - 1] ?? Infinity)) s = 1; else if (s === 1 && b[i].c < (up[i - 1] ?? -Infinity)) s = -1;
    up.push(u); dn.push(d); dir.push(s);
  }
  return { up, dn, dir };
}
const hh = (b, i, n) => { let m = -Infinity; for (let j = i - n; j < i; j++) m = Math.max(m, b[j].h); return m; };
const ll = (b, i, n) => { let m = Infinity; for (let j = i - n; j < i; j++) m = Math.min(m, b[j].l); return m; };

// Chaque stratégie : entry(ctx,i) -> +1 / -1 / 0 ; exit(ctx,i,pos) -> bool ; trail(ctx,i,pos) -> nouveau stop ou null
const STRATS = {
  'Supertrend 10/3 (long+short)': {
    entry: (x, i) => x.st.dir[i] !== x.st.dir[i - 1] ? x.st.dir[i] : 0,
    exit: (x, i, p) => x.st.dir[i] !== p.dir,
    trail: (x, i, p) => p.dir === 1 ? x.st.up[i] : x.st.dn[i],
  },
  'Cassure 55 j / sortie 20 j (Turtle)': {
    entry: (x, i) => x.b[i].c > hh(x.b, i, 55) ? 1 : x.b[i].c < ll(x.b, i, 55) ? -1 : 0,
    exit: (x, i, p) => p.dir === 1 ? x.b[i].c < ll(x.b, i, 20) : x.b[i].c > hh(x.b, i, 20),
    stopATR: 2,
  },
  'Croisement 50/200 (golden cross, long)': {
    entry: (x, i) => x.s50[i - 1] <= x.s200[i - 1] && x.s50[i] > x.s200[i] ? 1 : 0,
    exit: (x, i) => x.s50[i] < x.s200[i],
  },
  'Momentum 12 mois (long si >0, mensuel)': {
    entry: (x, i) => x.newMonth(i) && x.b[i].c > x.b[i - 252].c ? 1 : 0,
    exit: (x, i) => x.newMonth(i) && x.b[i].c <= x.b[i - 252].c,
  },
  'Plus haut 52 sem. + stop suiveur 3 ATR': {
    entry: (x, i) => x.b[i].c > hh(x.b, i, 252) ? 1 : 0,
    exit: () => false,
    trail: (x, i, p) => p.top - 3 * x.a[i],
  },
  'MACD 12/26/9 + filtre SMA200': {
    entry: (x, i) => x.b[i].c > x.s200[i] && x.hist[i - 1] <= 0 && x.hist[i] > 0 ? 1 : x.b[i].c < x.s200[i] && x.hist[i - 1] >= 0 && x.hist[i] < 0 ? -1 : 0,
    exit: (x, i, p) => p.dir === 1 ? x.hist[i] < 0 : x.hist[i] > 0,
  },
};

function ctxOf(b) {
  const c = b.map(x => x.c), e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = c.map((_, i) => e12[i] != null && e26[i] != null ? e12[i] - e26[i] : 0);
  const sig = ema(macd, 9);
  return {
    b, a: atr(b, 14), s50: sma(c, 50), s200: sma(c, 200), st: supertrend(b, 10, 3),
    hist: macd.map((m, i) => sig[i] == null ? 0 : m - sig[i]),
    newMonth: i => new Date(b[i].t).getUTCMonth() !== new Date(b[i + 1].t).getUTCMonth(),
  };
}

function swapR(name, dir, px, risk, ms) { return (REAL_RATES[name][dir === 1 ? 'L' : 'S'] / 100) * (px / risk) * (ms / DAY) * WED; }

// rnd = null : stratégie réelle ; sinon entrée au hasard calibrée (fréquence, part de longs, durées tirées de la stratégie)
function run(b, name, S, rnd = null) {
  const x = ctxOf(b), out = [];
  let pos = null, seed = rnd?.seed ?? 1;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const start = 260;
  for (let i = start; i < b.length - 1; i++) {
    if (pos) {
      pos.held++;
      pos.top = Math.max(pos.top, b[i].h); pos.bot = Math.min(pos.bot, b[i].l);
      let px = null;
      const hit = pos.dir === 1 ? b[i].l <= pos.sl : b[i].h >= pos.sl;
      if (hit) px = pos.dir === 1 ? Math.min(b[i].o, pos.sl) : Math.max(b[i].o, pos.sl);
      else if (rnd ? pos.held >= pos.target : S.exit(x, i, pos)) px = b[i].c;
      if (px !== null) {
        out.push({ instr: name, dir: pos.dir, entryT: pos.t, exitT: b[i].t, held: pos.held,
          r: pos.dir * (px - pos.e) / pos.risk - COST_PTS[name] / pos.risk + swapR(name, pos.dir, pos.e, pos.risk, b[i].t - pos.t) });
        pos = null; continue;
      }
      if (!rnd && S.trail) { const t = S.trail(x, i, pos); if (t != null) pos.sl = pos.dir === 1 ? Math.max(pos.sl, t) : Math.min(pos.sl, t); }
      continue;
    }
    if (x.a[i] == null || x.s200[i] == null) continue;
    let d = 0;
    if (rnd) { if (rand() < rnd.freq) d = rand() < rnd.pLong ? 1 : -1; }
    else d = S.entry(x, i);
    if (!d) continue;
    const risk = (S.stopATR ?? 3) * x.a[i];
    pos = { dir: d, e: b[i].c, t: b[i].t, risk, sl: b[i].c - d * risk, held: 0, top: b[i].h, bot: b[i].l,
      target: rnd ? rnd.holds[Math.floor(rand() * rnd.holds.length)] : 0 };
  }
  return out;
}

const years = trades => trades.length ? (Math.max(...trades.map(t => t.exitT)) - Math.min(...trades.map(t => t.entryT))) / (365.25 * DAY) : 1;
const since = (trades, y) => trades.filter(t => new Date(t.exitT).getUTCFullYear() >= y);
const fmt = (s, yrs) => s.n ? `${String(s.n).padStart(4)} tr | PF ${String(s.pf).padStart(4)} | ${String(s.totalR).padStart(6)}R | ${(s.totalR / yrs).toFixed(1).padStart(5)}R/an | DD ${s.maxDD_R}R` : '   0 trade';

const D = loadData('1d'), H = loadData('1h');
const NOW = Date.now(), Y2 = NOW - 2 * 365.25 * DAY;
console.log('Référence : portefeuille actuel validé MR-A + tournant de mois = 3.39R/an net (25 ans).\n');
const rows = [];
for (const [label, S] of Object.entries(STRATS)) {
  let all = [];
  for (const n of NAMES) if (D[n]) all = all.concat(run(D[n], n, S));
  const recentD = all.filter(t => t.exitT >= Y2);
  let h1 = [];
  for (const n of NAMES) if (H[n]) h1 = h1.concat(run(H[n], n, S));
  // contrôle hasard (25 ans daily)
  let bars = 0; for (const n of NAMES) if (D[n]) bars += D[n].length - 261;
  const rndCfg = { freq: all.length / bars, pLong: all.filter(t => t.dir === 1).length / all.length, holds: all.map(t => t.held) };
  const re = [];
  for (const seed of [1, 7, 42, 99, 1234, 5555, 31337, 777, 2468, 13579]) {
    let rr = []; for (const n of NAMES) if (D[n]) rr = rr.concat(run(D[n], n, S, { ...rndCfg, seed }));
    re.push(stats(rr).expR);
  }
  const m = re.reduce((a, v) => a + v, 0) / re.length, sd = Math.sqrt(re.reduce((a, v) => a + (v - m) ** 2, 0) / (re.length - 1));
  const sA = stats(all), z = (sA.expR - m) / (sd || 1e-9);
  console.log(`=== ${label} ===`);
  console.log(`  25 ans (daily)      : ${fmt(sA, years(all))}`);
  for (const [lb, a, b2] of [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]]) {
    const sub = all.filter(t => { const y = new Date(t.exitT).getUTCFullYear(); return y >= a && y <= b2; });
    const s = stats(sub); console.log(`     ${lb}       : ${s.n ? `${String(s.totalR).padStart(6)}R (PF ${s.pf})` : '-'}`);
  }
  console.log(`  2 dernières années (daily) : ${fmt(stats(recentD), 2)}`);
  console.log(`  2 dernières années (1h)    : ${fmt(stats(h1), 2)}`);
  const perI = NAMES.map(n => { const s = stats(recentD.filter(t => t.instr === n)); return `${n} ${s.n ? s.totalR : 0}R`; }).join(' | ');
  console.log(`     par instrument (daily 2 ans) : ${perI}`);
  console.log(`  hasard : ${m.toFixed(3)}R/trade vs stratégie ${sA.expR}R/trade | z = ${z.toFixed(2)} ${z > 2 ? '✅' : z > 1 ? '⚠️' : '❌'}\n`);
  rows.push({ label, r25: +(sA.totalR / years(all)).toFixed(2), r2d: +(stats(recentD).totalR / 2).toFixed(2), r2h: +((stats(h1).totalR || 0) / 2).toFixed(2), z: +z.toFixed(2) });
}
console.log('=== SYNTHÈSE (R par an, net) ===');
console.log('stratégie'.padEnd(42) + '25 ans  | 2 ans daily | 2 ans 1h | z hasard');
for (const r of rows) console.log(r.label.padEnd(42) + String(r.r25).padStart(6) + ' | ' + String(r.r2d).padStart(11) + ' | ' + String(r.r2h).padStart(8) + ' | ' + String(r.z).padStart(6));

// Contrôle hasard sur le 1h (2 ans) : les gains récents viennent-ils du signal ou de la hausse générale ?
console.log('\n=== CONTRÔLE HASARD SUR LE 1h (2 ans) ===');
for (const [label, S] of Object.entries(STRATS)) {
  let h1 = []; for (const n of NAMES) if (H[n]) h1 = h1.concat(run(H[n], n, S));
  if (!h1.length) continue;
  let bars = 0; for (const n of NAMES) if (H[n]) bars += H[n].length - 261;
  const cfg = { freq: h1.length / bars, pLong: h1.filter(t => t.dir === 1).length / h1.length, holds: h1.map(t => t.held) };
  const re = [], tot = [];
  for (let k = 0; k < 30; k++) {
    let rr = []; for (const n of NAMES) if (H[n]) rr = rr.concat(run(H[n], n, S, { ...cfg, seed: 1000 + k * 7919 }));
    const s = stats(rr); re.push(s.expR); tot.push(s.totalR);
  }
  const m = re.reduce((a, v) => a + v, 0) / re.length, sd = Math.sqrt(re.reduce((a, v) => a + (v - m) ** 2, 0) / (re.length - 1));
  const s = stats(h1), z = (s.expR - m) / (sd || 1e-9);
  const better = re.filter(v => v >= s.expR).length;
  console.log(`${label.padEnd(42)} stratégie ${String(s.totalR).padStart(6)}R | hasard moyen ${(tot.reduce((a, v) => a + v, 0) / tot.length).toFixed(1).padStart(6)}R | z = ${z.toFixed(2).padStart(5)} | hasard fait mieux ${better}/30 fois`);
}

console.log('\n=== 1h : D OÙ VIENNENT LES GAINS (par instrument, et sans le meilleur trade) ===');
for (const label of ['Croisement 50/200 (golden cross, long)', 'Momentum 12 mois (long si >0, mensuel)', 'MACD 12/26/9 + filtre SMA200']) {
  const S = STRATS[label]; let h1 = []; for (const n of NAMES) if (H[n]) h1 = h1.concat(run(H[n], n, S));
  const per = NAMES.map(n => { const s = stats(h1.filter(t => t.instr === n)); return `${n} ${s.n || 0}tr ${s.n ? s.totalR : 0}R`; }).join(' | ');
  const sorted = [...h1].sort((a, b) => b.r - a.r);
  const top3 = sorted.slice(0, 3).reduce((a, t) => a + t.r, 0);
  console.log(`${label}\n   ${per}\n   total ${stats(h1).totalR}R dont 3 meilleurs trades ${top3.toFixed(1)}R -> sans eux ${(stats(h1).totalR - top3).toFixed(1)}R`);
}
