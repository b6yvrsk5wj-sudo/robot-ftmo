// Section 28 — Chasse aux « pépites » : stratégies à règles précises qui circulent en 2025-2026
// (YouTube, TikTok, TradingView, sites de backtests). Toutes passées au même banc :
// net de spread + swaps réels FTMO, 25 ans quand c'est du daily, 2 ans pour le 1h, contrôle hasard.
import { INSTR, COST_PTS, ema, sma, rsi, atr, stats, loadData } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';

const WED = 1.28, DAY = 86400000;
const IDX = ['US500', 'US100', 'US30'], ALL = ['US500', 'US100', 'US30', 'XAUUSD'];
const swapR = (n, d, px, risk, ms) => (REAL_RATES[n][d === 1 ? 'L' : 'S'] / 100) * (px / risk) * (ms / DAY) * WED;
const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });

const CACHE = new WeakMap();
function ctx(b) {
  if (CACHE.has(b)) return CACHE.get(b);
  const x = ctx0(b); CACHE.set(b, x); return x;
}
function ctx0(b) {
  const c = b.map(x => x.c);
  const x = { b, c, a: atr(b, 14), s5: sma(c, 5), s20: sma(c, 20), s50: sma(c, 50), s200: sma(c, 200),
    e9: ema(c, 9), e15: ema(c, 15), e200: ema(c, 200), r2: rsi(c, 2), sd20: [] };
  for (let i = 0; i < c.length; i++) { if (i < 19) { x.sd20.push(null); continue; } let m = 0; for (let j = i - 19; j <= i; j++) m += c[j]; m /= 20; let s = 0; for (let j = i - 19; j <= i; j++) s += (c[j] - m) ** 2; x.sd20.push(Math.sqrt(s / 20)); }
  x.ny = b.map(z => { const p = Object.fromEntries(nyFmt.formatToParts(new Date(z.t)).map(q => [q.type, q.value])); return { h: +p.hour % 24, wd: p.weekday, day: `${p.year}-${p.month}-${p.day}` }; });
  x.utcH = b.map(z => new Date(z.t).getUTCHours());
  x.utcDay = b.map(z => new Date(z.t).toISOString().slice(0, 10));
  return x;
}
const minC = (x, i, n) => { let m = Infinity; for (let j = i - n + 1; j <= i; j++) m = Math.min(m, x.c[j]); return m; };
const maxC = (x, i, n) => { let m = -Infinity; for (let j = i - n + 1; j <= i; j++) m = Math.max(m, x.c[j]); return m; };

// Une stratégie renvoie à la barre i (clôturée) un ordre : { dir, type:'close'|'open'|'limit'|'stop', px, valid, sl, tp, maxHold, exit }
const S = {
  // ---------- DAILY (25 ans) ----------
  'IBS < 0.2 (S&P, sortie > plus haut veille)': { tf: '1d', instr: IDX, sig: (x, i) => {
    const b = x.b[i], ibs = (b.c - b.l) / ((b.h - b.l) || 1e-9);
    return ibs < 0.2 && b.c > x.s200[i] ? { dir: 1, type: 'close', sl: b.c - 3 * x.a[i], maxHold: 10, exit: (x, k) => x.c[k] > x.b[k - 1].h } : null; } },
  'Turnaround Tuesday (lundi baissier)': { tf: '1d', instr: IDX, sig: (x, i) => {
    const wd = new Date(x.b[i].t).getUTCDay();
    return wd === 1 && x.c[i] < x.c[i - 1] ? { dir: 1, type: 'close', sl: x.c[i] - 3 * x.a[i], maxHold: 5, exit: (x, k) => x.c[k] > x.b[k - 1].h } : null; } },
  'Double 7 (Connors)': { tf: '1d', instr: IDX, sig: (x, i) =>
    x.c[i] > x.s200[i] && x.c[i] === minC(x, i, 7) ? { dir: 1, type: 'close', sl: x.c[i] - 3 * x.a[i], maxHold: 20, exit: (x, k) => x.c[k] === maxC(x, k, 7) } : null },
  'Effet overnight (achat clôture, vente ouverture)': { tf: '1d', instr: IDX, sig: (x, i) =>
    ({ dir: 1, type: 'close', sl: x.c[i] - 3 * x.a[i], maxHold: 1, exitAtOpen: true }) },
  'Comblement de gap baissier (achat ouverture)': { tf: '1d', instr: IDX, pre: true, sig: (x, i) =>
    x.b[i + 1] && x.b[i + 1].o < x.c[i] - 0.5 * x.a[i] && x.c[i] > x.s200[i] ? { dir: 1, type: 'open', sl: x.b[i + 1].o - 3 * x.a[i], maxHold: 0, exit: () => true } : null },
  'Bollinger bas + tendance (sortie SMA20)': { tf: '1d', instr: IDX, sig: (x, i) =>
    x.c[i] > x.s200[i] && x.c[i] < x.s20[i] - 2 * x.sd20[i] ? { dir: 1, type: 'close', sl: x.c[i] - 3 * x.a[i], maxHold: 15, exit: (x, k) => x.c[k] > x.s20[k] } : null },
  '3 plus bas décroissants (Connors)': { tf: '1d', instr: IDX, sig: (x, i) => {
    const b = x.b; return x.c[i] > x.s200[i] && b[i].l < b[i - 1].l && b[i - 1].l < b[i - 2].l && b[i - 2].l < b[i - 3].l && b[i].h < b[i - 1].h && b[i - 1].h < b[i - 2].h
      ? { dir: 1, type: 'close', sl: x.c[i] - 3 * x.a[i], maxHold: 10, exit: (x, k) => x.c[k] > x.b[k - 1].h } : null; } },
  'Inside bar + cassure (tendance)': { tf: '1d', instr: ALL, sig: (x, i) => {
    const b = x.b; if (!(b[i].h < b[i - 1].h && b[i].l > b[i - 1].l)) return null;
    if (x.c[i] > x.s50[i] && x.s50[i] > x.s200[i]) { const r = b[i - 1].h - b[i - 1].l; return { dir: 1, type: 'stop', px: b[i - 1].h, valid: 1, sl: b[i - 1].l, tp: b[i - 1].h + 2 * r, maxHold: 20 }; }
    if (x.c[i] < x.s50[i] && x.s50[i] < x.s200[i]) { const r = b[i - 1].h - b[i - 1].l; return { dir: -1, type: 'stop', px: b[i - 1].l, valid: 1, sl: b[i - 1].h, tp: b[i - 1].l - 2 * r, maxHold: 20 }; }
    return null; } },
  'Référence : MR-A (RSI2<10)': { tf: '1d', instr: IDX, sig: (x, i) =>
    x.c[i] > x.s200[i] && x.r2[i] < 10 ? { dir: 1, type: 'close', sl: x.c[i] - 3 * x.a[i], maxHold: 10, exit: (x, k) => x.r2[k] > 65 } : null },
  // ---------- 1h (2 ans) ----------
  'EMA 9/15 croisement (1h)': { tf: '1h', instr: ALL, sig: (x, i) => {
    const up = x.e9[i - 1] <= x.e15[i - 1] && x.e9[i] > x.e15[i], dn = x.e9[i - 1] >= x.e15[i - 1] && x.e9[i] < x.e15[i];
    if (!up && !dn) return null; const d = up ? 1 : -1;
    return { dir: d, type: 'close', sl: x.c[i] - d * 2 * x.a[i], tp: x.c[i] + d * 4 * x.a[i], maxHold: 48, exit: (x, k) => d === 1 ? x.e9[k] < x.e15[k] : x.e9[k] > x.e15[k] }; } },
  'Cassure de la 1re bougie de séance (indices 1h)': { tf: '1h', instr: IDX, sig: (x, i) => {
    if (x.ny[i].h !== 9 || x.ny[i - 1].day === x.ny[i].day) return null; // 1re barre 9h30
    const b = x.b[i], r = b.h - b.l; const day = x.ny[i].day;
    const eod = (x, k) => !x.ny[k + 1] || x.ny[k + 1].day !== day;
    return { dir: 0, type: 'stopHL', hi: b.h, lo: b.l, valid: 5, mk: d => ({ sl: d === 1 ? b.l : b.h, tp: d === 1 ? b.h + 2 * r : b.l - 2 * r, maxHold: 7, exit: eod }) }; } },
  'Cassure de Londres sur l\'or (range asiatique)': { tf: '1h', instr: ['XAUUSD'], sig: (x, i) => {
    if (x.utcH[i] !== 6) return null;
    let hi = -Infinity, lo = Infinity; const d0 = x.utcDay[i];
    for (let j = i; j >= 0 && x.utcDay[j] === d0 && x.utcH[j] <= 6; j--) { hi = Math.max(hi, x.b[j].h); lo = Math.min(lo, x.b[j].l); }
    const r = hi - lo; if (!(r > 0)) return null;
    return { dir: 0, type: 'stopHL', hi, lo, valid: 5, mk: d => ({ sl: d === 1 ? lo : hi, tp: d === 1 ? hi + 2 * r : lo - 2 * r, maxHold: 14, exit: (x, k) => x.utcH[k] >= 20 || x.utcDay[k] !== d0 }) }; } },
  'Fair Value Gap ICT + tendance (1h)': { tf: '1h', instr: ALL, sig: (x, i) => {
    const b = x.b; const bull = b[i].l > b[i - 2].h && x.c[i] > x.e200[i], bear = b[i].h < b[i - 2].l && x.c[i] < x.e200[i];
    if (bull) { const e = b[i - 2].h, sl = b[i - 2].l - 0.1 * x.a[i]; return e - sl > 0 ? { dir: 1, type: 'limit', px: e, valid: 10, sl, tp: e + 2 * (e - sl), maxHold: 48 } : null; }
    if (bear) { const e = b[i - 2].l, sl = b[i - 2].h + 0.1 * x.a[i]; return sl - e > 0 ? { dir: -1, type: 'limit', px: e, valid: 10, sl, tp: e - 2 * (sl - e), maxHold: 48 } : null; }
    return null; } },
  'Silver Bullet approx. (FVG 10h-11h NY, indices)': { tf: '1h', instr: IDX, sig: (x, i) => {
    if (x.ny[i].h !== 10) return null; const b = x.b; const day = x.ny[i].day;
    const eod = (x, k) => !x.ny[k + 1] || x.ny[k + 1].day !== day;
    if (b[i].l > b[i - 2].h) { const e = b[i - 2].h, sl = b[i - 2].l; return { dir: 1, type: 'limit', px: e, valid: 2, sl, tp: e + 2 * (e - sl), maxHold: 6, exit: eod }; }
    if (b[i].h < b[i - 2].l) { const e = b[i - 2].l, sl = b[i - 2].h; return { dir: -1, type: 'limit', px: e, valid: 2, sl, tp: e - 2 * (sl - e), maxHold: 6, exit: eod }; }
    return null; } },
};

function run(b, name, st, rnd = null) {
  const x = ctx(b), out = []; let pos = null, pend = null, seed = rnd?.seed ?? 1;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const close = (k, px, atOpen = false) => {
    const t1 = atOpen ? b[k].t : b[k].t;
    out.push({ instr: name, dir: pos.dir, entryT: pos.t, exitT: t1, held: pos.held,
      r: pos.dir * (px - pos.e) / pos.risk - COST_PTS[name] / pos.risk + swapR(name, pos.dir, pos.e, pos.risk, Math.max(t1 - pos.t, 0)) });
    pos = null;
  };
  const open = (k, d, e, o, limitFill = false) => {
    // ouverture au-delà du stop (gap) : position stoppée immédiatement, on compte le coût seul
    if (d * (e - o.sl) <= 0) { const nom = Math.abs((o.px ?? e) - o.sl) || 1e-9; out.push({ instr: name, dir: d, entryT: b[k].t, exitT: b[k].t, held: 0, r: -COST_PTS[name] / nom }); return; }
    pos = { dir: d, e, t: b[k].t, risk: Math.abs(e - o.sl), sl: o.sl, tp: o.tp ?? null, held: 0, maxHold: o.maxHold, exit: o.exit, exitAtOpen: o.exitAtOpen, target: o.target, limitFill };
  };
  for (let i = 210; i < b.length - 1; i++) {
    const bar = b[i];
    // 1) ordre en attente
    if (!pos && pend) {
      let d = 0, e = null;
      if (pend.type === 'limit') { if (pend.dir === 1 && bar.l <= pend.px) { d = 1; e = Math.min(bar.o, pend.px); } else if (pend.dir === -1 && bar.h >= pend.px) { d = -1; e = Math.max(bar.o, pend.px); } }
      else if (pend.type === 'stop') { if (pend.dir === 1 && bar.h >= pend.px) { d = 1; e = Math.max(bar.o, pend.px); } else if (pend.dir === -1 && bar.l <= pend.px) { d = -1; e = Math.min(bar.o, pend.px); } }
      else if (pend.type === 'stopHL') { if (bar.h >= pend.hi && bar.l <= pend.lo) pend.left = 0; else if (bar.h >= pend.hi) { d = 1; e = Math.max(bar.o, pend.hi); } else if (bar.l <= pend.lo) { d = -1; e = Math.min(bar.o, pend.lo); } }
      if (d) { const o = pend.type === 'stopHL' ? pend.mk(d) : pend; open(i, d, e, o, pend.type === 'limit'); pend = null; if (pos) pos.held = -1; }
      else if (--pend.left <= 0) pend = null;
    }
    // 2) gestion de position (y compris barre d'entrée pour SL/TP : conservateur)
    if (pos) {
      pos.held++;
      if (pos.exitAtOpen && pos.held >= 1) { close(i, bar.o, true); }
      else {
        const L = pos.dir === 1;
        // barre de remplissage d'un ordre limite : le plus haut a pu précéder l'entrée -> pas de TP sur cette barre
        const slHit = L ? bar.l <= pos.sl : bar.h >= pos.sl, tpHit = pos.tp != null && !(pos.limitFill && pos.held === 0) && (L ? bar.h >= pos.tp : bar.l <= pos.tp);
        if (slHit && pos.held > 0) close(i, L ? Math.min(bar.o, pos.sl) : Math.max(bar.o, pos.sl));
        else if (slHit) close(i, pos.sl);
        else if (tpHit) close(i, L ? Math.max(bar.o, pos.tp) : Math.min(bar.o, pos.tp));
        else if (rnd ? pos.held >= pos.target : (pos.exit && pos.exit(x, i)) || pos.held >= pos.maxHold) close(i, bar.c);
      }
      if (pos) continue;
    }
    // 3) nouveau signal
    if (pend || x.a[i] == null || x.s200[i] == null) continue;
    if (rnd) {
      if (rand() < rnd.freq) { const d = rand() < rnd.pLong ? 1 : -1; open(i, d, bar.c, { sl: bar.c - d * rnd.k * x.a[i], maxHold: 1e9, target: rnd.holds[Math.floor(rand() * rnd.holds.length)] }); }
      continue;
    }
    const o = st.sig(x, i); if (!o) continue;
    if (o.type === 'close') open(i, o.dir, bar.c, o);
    else if (o.type === 'open') { const nb = b[i + 1]; open(i + 1, o.dir, nb.o, o); if (pos) { pos.held = -1; i++; pos.held++; const L = pos.dir === 1; if (L ? nb.l <= pos.sl : nb.h >= pos.sl) close(i, pos.sl); else close(i, nb.c); } }
    else pend = { ...o, left: o.valid };
  }
  return out;
}

const D = loadData('1d'), H = loadData('1h'), NOW = Date.now(), Y2 = NOW - 2 * 365.25 * DAY;
const sum = a => a.reduce((s, t) => s + t.r, 0);
const span = a => a.length ? (Math.max(...a.map(t => t.exitT)) - Math.min(...a.map(t => t.entryT))) / (365.25 * DAY) : 1;
const rows = [];
for (const [label, st] of Object.entries(S)) {
  const data = st.tf === '1d' ? D : H;
  let all = []; for (const n of st.instr) if (data[n]) all = all.concat(run(data[n], n, st));
  if (!all.length) { console.log(label, ': aucun trade'); continue; }
  const s = stats(all), yrs = span(all), recent = all.filter(t => t.exitT >= Y2), sR = stats(recent);
  const top3 = [...recent].sort((a, b) => b.r - a.r).slice(0, 3).reduce((a, t) => a + t.r, 0);
  // hasard calibré
  let bars = 0; for (const n of st.instr) if (data[n]) bars += data[n].length - 211;
  const kAtr = (() => { const v = all.map(t => t.k).filter(Boolean); return 3; })();
  const cfg = { freq: all.length / bars, pLong: all.filter(t => t.dir === 1).length / all.length, holds: all.map(t => Math.max(1, t.held)), k: kAtr };
  const re = [];
  for (let k = 0; k < 10; k++) { let rr = []; for (const n of st.instr) if (data[n]) rr = rr.concat(run(data[n], n, st, { ...cfg, seed: 17 + k * 7919 })); re.push(stats(rr).expR); }
  const m = re.reduce((a, v) => a + v, 0) / re.length, sd = Math.sqrt(re.reduce((a, v) => a + (v - m) ** 2, 0) / (re.length - 1));
  const z = (s.expR - m) / (sd || 1e-9);
  let subs = '';
  if (st.tf === '1d') {
    const ps = [[2001, 2008], [2009, 2014], [2015, 2020], [2021, 2026]].map(([a, b2]) => sum(all.filter(t => { const y = new Date(t.exitT).getUTCFullYear(); return y >= a && y <= b2; })));
    subs = ps.map(v => (v >= 0 ? '+' : '') + v.toFixed(0)).join('/');
  }
  console.log(`=== ${label} [${st.tf}] ===`);
  console.log(`  total : ${s.n} trades | réussite ${s.winRate}% | PF ${s.pf} | ${(s.totalR / yrs).toFixed(2)}R/an | DD max ${s.maxDD_R}R${subs ? ` | sous-périodes ${subs}` : ''}`);
  console.log(`  2 dernières années : ${sR.n || 0} trades | ${sR.n ? (sR.totalR / 2).toFixed(2) : 0}R/an | sans les 3 meilleurs : ${((sR.totalR || 0) - top3).toFixed(1)}R`);
  console.log(`  hasard : ${m.toFixed(3)}R/trade vs ${s.expR}R/trade | z = ${z.toFixed(2)}\n`);
  rows.push({ label, tf: st.tf, n: s.n, wr: s.winRate, pf: s.pf, ry: +(s.totalR / yrs).toFixed(2), r2: +((sR.totalR || 0) / 2).toFixed(2), dd: s.maxDD_R, z: +z.toFixed(2), subs });
}
console.log('=== SYNTHÈSE ===');
console.log('stratégie'.padEnd(50) + 'tf  | trades | réuss. |  PF  | R/an | R/an 2a | DD R | z hasard | sous-pér.');
for (const r of rows) console.log(r.label.padEnd(50) + `${r.tf.padEnd(3)} | ${String(r.n).padStart(6)} | ${String(r.wr).padStart(5)}% | ${String(r.pf).padStart(4)} | ${String(r.ry).padStart(5)} | ${String(r.r2).padStart(7)} | ${String(r.dd).padStart(4)} | ${String(r.z).padStart(8)} | ${r.subs}`);

// ===== AUDIT DE ROBUSTESSE des candidates =====
const CAND = ['Cassure de la 1re bougie de séance (indices 1h)', 'Fair Value Gap ICT + tendance (1h)', 'Cassure de Londres sur l\'or (range asiatique)', 'EMA 9/15 croisement (1h)', 'Turnaround Tuesday (lundi baissier)', 'IBS < 0.2 (S&P, sortie > plus haut veille)'];
console.log('\n===== AUDIT DE ROBUSTESSE =====');
const base = { ...COST_PTS };
for (const label of CAND) {
  const st = S[label], data = st.tf === '1d' ? D : H;
  const go = () => { let a = []; for (const n of st.instr) if (data[n]) a = a.concat(run(data[n], n, st)); return a; };
  const all = go();
  const per = st.instr.map(n => { const s = stats(all.filter(t => t.instr === n)); return `${n} ${s.n || 0}tr ${s.n ? s.totalR : 0}R`; }).join(' | ');
  // semestres (sur les 2 dernières années)
  const rec = all.filter(t => t.exitT >= Y2);
  const sem = [0, 1, 2, 3].map(q => { const a = Y2 + q * 182.6 * DAY, z = a + 182.6 * DAY; return sum(rec.filter(t => t.exitT >= a && t.exitT < z)).toFixed(1); }).join(' / ');
  const longs = stats(all.filter(t => t.dir === 1)), shorts = stats(all.filter(t => t.dir === -1));
  // coûts x2 et x3 (slippage des ordres stop/limit)
  const cx = m => { for (const k in COST_PTS) COST_PTS[k] = base[k] * m; const s = stats(go()); for (const k in COST_PTS) COST_PTS[k] = base[k]; return s; };
  const c2 = cx(2), c3 = cx(3);
  console.log(`\n${label}\n   par instrument : ${per}\n   longs ${longs.n || 0}tr ${longs.totalR || 0}R | shorts ${shorts.n || 0}tr ${shorts.totalR || 0}R\n   semestres (2 ans) : ${sem}\n   coûts x2 : PF ${c2.pf} ${c2.totalR}R | coûts x3 : PF ${c3.pf} ${c3.totalR}R`);
}
// vérif horaires des barres 1h indices (heure NY de la 1re barre)
const cx0 = ctx(H.US500); const firstH = {}; for (let i = 1; i < cx0.ny.length; i++) if (cx0.ny[i].day !== cx0.ny[i - 1].day) firstH[cx0.ny[i].h] = (firstH[cx0.ny[i].h] || 0) + 1;
console.log('\nHeure NY de la 1re barre 1h US500 :', JSON.stringify(firstH), '| minutes 1re barre :', new Date(H.US500[1].t).toISOString());
