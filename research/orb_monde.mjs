// Section 31 — Validation HORS ÉCHANTILLON par marché : la cassure de la 1re heure marche-t-elle sur des indices
// qu'elle n'a jamais vus (Europe, Japon, small caps US) ? Mêmes règles que le robot, coût = 0,01 % du prix aller-retour.
// Contrôle : mêmes jours, même moment d'entrée, même stop/objectif, mais DIRECTION AU HASARD (l'info est-elle dans le sens ?).
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { stats } from './lib.mjs';

const MKT = [
  ['^GSPC', 'S&P 500 (référence)'], ['^NDX', 'Nasdaq 100 (référence)'], ['^DJI', 'Dow (référence)'],
  ['^RUT', 'Russell 2000 (US small caps)'], ['^GDAXI', 'DAX (Allemagne)'], ['^FCHI', 'CAC 40 (France)'],
  ['^STOXX50E', 'Euro Stoxx 50'], ['^FTSE', 'FTSE 100 (Londres)'], ['^N225', 'Nikkei 225 (Japon)'], ['^HSI', 'Hang Seng (Hong Kong)'],
];
const DIR = new URL('./data/', import.meta.url); mkdirSync(DIR, { recursive: true });

async function load(sym) {
  const f = new URL(`./orb_${sym.replace(/\W/g, '')}_1h.json`, DIR);
  if (existsSync(f)) return JSON.parse(readFileSync(f));
  const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 728 * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1h&period1=${p1}&period2=${p2}`;
  const j = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  const r = j.chart.result[0], ts = r.timestamp || [], q = r.indicators.quote[0], b = [];
  for (let i = 0; i < ts.length; i++) if (q.open[i] != null && q.high[i] != null && q.low[i] != null && q.close[i] != null) b.push({ t: ts[i] * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] });
  const out = { tz: r.meta.exchangeTimezoneName, b };
  writeFileSync(f, JSON.stringify(out)); await new Promise(z => setTimeout(z, 1200));
  return out;
}

// simule la cassure 1re heure ; dirFn(day, dirRègle) permet d'imposer une direction au hasard
function orb({ tz, b }, tpR, dirFn = null) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const day = b.map(x => fmt.format(new Date(x.t)));
  const out = [];
  for (let i = 1; i < b.length; i++) {
    if (day[i] === day[i - 1]) continue;                    // i = 1re bougie du jour
    let last = i; while (last + 1 < b.length && day[last + 1] === day[i]) last++;
    if (last - i < 3) continue;                              // séance trop courte / données trouées
    const hi = b[i].h, lo = b[i].l, r = hi - lo; if (!(r > 0)) continue;
    const cost = 0.0001 * b[i].c;
    const lastEntry = Math.min(i + 5, last - 1);             // 5 bougies max, jamais sur la dernière
    let pos = null;
    for (let k = i + 1; k <= last; k++) {
      const x = b[k];
      if (!pos) {
        if (k > lastEntry) break;
        const up = x.h >= hi, dn = x.l <= lo;
        if (up && dn) break;                                 // ambigu : pas de trade
        if (!up && !dn) continue;
        let d = up ? 1 : -1;
        if (dirFn) d = dirFn(d);
        // dans le sens de la cassure : entrée au niveau ; à contre-sens (hasard) : entrée à la clôture de la bougie
        const atLevel = d === 1 ? up : dn;
        const e = d === 1 ? (up ? Math.max(x.o, hi) : x.c) : (dn ? Math.min(x.o, lo) : x.c);
        const sl = e - d * r, tp = e + d * tpR * r;
        pos = { d, e, sl, tp, k, atLevel };
        if (!atLevel) continue; // entrée en clôture : la bougie d'entrée ne peut plus rien toucher
      }
      const L = pos.d === 1, first = k === pos.k;
      let ex = null;
      if (L ? x.l <= pos.sl : x.h >= pos.sl) ex = first ? pos.sl : (L ? Math.min(x.o, pos.sl) : Math.max(x.o, pos.sl));
      else if (L ? x.h >= pos.tp : x.l <= pos.tp) ex = L ? Math.max(x.o, pos.tp) : Math.min(x.o, pos.tp);
      if (ex === null && k === last) ex = x.c;
      if (ex !== null) { out.push({ instr: '', dir: pos.d, entryT: b[pos.k].t, exitT: x.t, r: pos.d * (ex - pos.e) / r - cost / r }); break; }
    }
  }
  return out;
}

const rows = [];
for (const [sym, label] of MKT) {
  let data; try { data = await load(sym); } catch (e) { console.log(label, 'données indisponibles :', e.message); continue; }
  if (data.b.length < 500) { console.log(label, ': trop peu de données'); continue; }
  for (const tpR of [2, 1]) {
    const tr = orb(data, tpR), s = stats(tr);
    // contrôle direction au hasard (30 graines)
    const rnd = [];
    for (let g = 0; g < 30; g++) { let seed = 99 + g * 7919; const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      rnd.push(stats(orb(data, tpR, () => (rand() < 0.5 ? 1 : -1))).expR); }
    const m = rnd.reduce((a, v) => a + v, 0) / rnd.length, sd = Math.sqrt(rnd.reduce((a, v) => a + (v - m) ** 2, 0) / (rnd.length - 1));
    const half = tr.length >> 1, a1 = stats(tr.slice(0, half)), a2 = stats(tr.slice(half));
    rows.push({ label, tpR, n: s.n, exp: s.expR, tot: s.totalR, pf: s.pf, h1: a1.expR, h2: a2.expR, rnd: +m.toFixed(3), z: +((s.expR - m) / (sd || 1e-9)).toFixed(1) });
  }
}
console.log('marché'.padEnd(32) + 'obj | trades | R/trade | R total |  PF  | 1re moitié | 2e moitié | hasard | z');
for (const r of rows) console.log(r.label.padEnd(32) + `${r.tpR}R  | ${String(r.n).padStart(6)} | ${String(r.exp).padStart(7)} | ${String(r.tot).padStart(7)} | ${String(r.pf).padStart(4)} | ${String(r.h1).padStart(10)} | ${String(r.h2).padStart(9)} | ${String(r.rnd).padStart(6)} | ${r.z}`);
