// LE TEST QUI MANQUAIT À TOUT LE PROJET : chaque stratégie bat-elle une ENTRÉE AU HASARD
// de même fréquence et même durée de détention, sur les mêmes instruments ?
// Les stratégies long-only sur des actifs qui montent depuis 25 ans peuvent paraître bonnes sans edge.
import { INSTR, COST_PTS, sma, rsi, atr, stats, loadData, fmtTable } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const swp = (i, dir, px, rk, ms) => (REAL_RATES[i][dir === 1 ? 'L' : 'S'] / 100) * (px / rk) * ((ms / 86400000) * WED);
const add = (out, name, pos, exitT, x) => out.push({ instr: name, dir: 1, entryT: pos.entryT, exitT, r: (x - pos.entry) / pos.risk - COST_PTS[name] / pos.risk + swp(name, 1, pos.entry, pos.risk, exitT - pos.entryT) });

// moteur générique : signal d'entrée + règle de sortie, ou entrée aléatoire calibrée
function engine(b, name, { entry, exit, maxHold, pRand = null, seed = 1 }) {
  const c = b.map(x => x.c), s200 = sma(c, 200), s5 = sma(c, 5), r2 = rsi(c, 2), a = atr(b, 14);
  const ctx = { c, s200, s5, r2, a, b };
  const out = []; let pos = null, rnd = seed;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  for (let i = 201; i < b.length - 1; i++) {
    if (pos) {
      pos.held++;
      let x = null;
      if (b[i].o <= pos.sl) x = b[i].o; else if (b[i].l <= pos.sl) x = pos.sl;
      else if (pRand !== null ? pos.held >= pos.target : exit(ctx, i, pos)) x = b[i].c;
      else if (pos.held >= maxHold) x = b[i].c;
      if (x !== null) { add(out, name, pos, b[i].t, x); pos = null; }
      continue;
    }
    if (a[i] == null || s200[i] == null) continue;
    const go = pRand !== null ? rand() < pRand : entry(ctx, i);
    if (go) { const risk = 3 * a[i]; pos = { entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk, held: 0, target: pos ? 0 : 1 + Math.floor(rand() * maxHold) }; }
  }
  return out;
}

const STRATS = {
  'MR-A (RSI2<10)': {
    entry: (x, i) => x.b[i].c > x.s200[i] && x.r2[i] != null && x.r2[i] < 10,
    exit: (x, i) => x.r2[i] > 65, maxHold: 10, instr: ['US500', 'US100', 'US30'],
  },
  'Tournant de mois': {
    entry: (x, i) => new Date(x.b[i].t).getUTCMonth() !== new Date(x.b[i + 1].t).getUTCMonth(),
    exit: () => false, maxHold: 4, instr: ['US500', 'US100', 'US30', 'XAUUSD'],
  },
};

const d = loadData('1d');
console.log('===== CHAQUE STRATÉGIE BAT-ELLE LE HASARD ? (25 ans, net des swaps) =====\n');
for (const [lb, S] of Object.entries(STRATS)) {
  // stratégie réelle
  let real = [];
  for (const n of S.instr) if (d[n]) real = real.concat(engine(d[n], n, S));
  const sR = stats(real);
  // fréquence d'entrée observée, pour calibrer le hasard
  let bars = 0; for (const n of S.instr) if (d[n]) bars += d[n].length - 202;
  const freq = real.length / bars;
  // hasard, plusieurs graines
  const rs = [];
  for (const seed of [1, 7, 42, 99, 1234, 5555, 31337, 777, 2468, 13579]) {
    let rr = [];
    for (const n of S.instr) if (d[n]) rr = rr.concat(engine(d[n], n, { ...S, pRand: freq, seed }));
    rs.push(stats(rr));
  }
  const avg = k => rs.reduce((a, x) => a + (x[k] ?? 0), 0) / rs.length;
  const sd = k => { const m = avg(k); return Math.sqrt(rs.reduce((a, x) => a + ((x[k] ?? 0) - m) ** 2, 0) / rs.length); };
  const z = (sR.expR - avg('expR')) / (sd('expR') || 1e-9);
  console.log(`--- ${lb} ---`);
  console.log(fmtTable([
    { mode: 'STRATÉGIE', n: sR.n, 'réussite': sR.winRate + '%', PF: sR.pf, 'espérance/trade': sR.expR, 'R total': sR.totalR },
    { mode: `hasard (${rs.length} graines)`, n: Math.round(avg('n')), 'réussite': avg('winRate').toFixed(1) + '%', PF: avg('pf').toFixed(2), 'espérance/trade': avg('expR').toFixed(3), 'R total': avg('totalR').toFixed(1) },
  ]));
  console.log(`  surperformance : ${(sR.expR - avg('expR')).toFixed(3)}R/trade | écart-type du hasard : ${sd('expR').toFixed(3)} | z = ${z.toFixed(2)}`);
  console.log(`  => ${z > 2 ? '✅ EDGE RÉEL (au-delà de 2 écarts-types)' : z > 1 ? '⚠️ FAIBLE, non concluant' : '❌ PAS D EDGE au-delà du hasard'}\n`);
}
