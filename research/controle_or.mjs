// TEST DE CONTRÔLE INDISPENSABLE : l'or est passé de ~270$ à ~4400$ en 25 ans (x16).
// Une stratégie LONG-ONLY sur l'or paraît donc bonne même sans aucun signal.
// Question : le signal « dollar faible + taux en baisse » apporte-t-il quelque chose de plus que le HASARD ?
import { readFileSync } from 'node:fs';
import { COST_PTS, sma, atr, stats, byPeriod, loadData, fmtTable } from './lib.mjs';
import { REAL_RATES } from './bt_swap.mjs';
const WED = 1.28;
const swp = (i, dir, px, rk, ms) => (REAL_RATES[i][dir === 1 ? 'L' : 'S'] / 100) * (px / rk) * ((ms / 86400000) * WED);
const add = (out, name, pos, exitT, x) => out.push({ instr: name, dir: 1, entryT: pos.entryT, exitT, r: (x - pos.entry) / pos.risk - COST_PTS[name] / pos.risk + swp(name, 1, pos.entry, pos.risk, exitT - pos.entryT) });

function mac(name) {
  const b = JSON.parse(readFileSync(new URL(`./data/${name}_1d.json`, import.meta.url)));
  const c = b.map(x => x.c), s50 = sma(c, 50);
  const m = new Map(); b.forEach((x, i) => m.set(new Date(x.t).toISOString().slice(0, 10), { c: x.c, s50: s50[i] }));
  return m;
}
const DXY = mac('DXY'), TNX = mac('TNX');
const day = t => new Date(t).toISOString().slice(0, 10);

// mode: 'signal' | 'hasard' | 'inverse' | 'toujours'
function runGold(b, { mode, maxHold = 20, seed = 1 } = {}) {
  const a = atr(b, 14); const out = []; let pos = null;
  let rnd = seed;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  let nSignals = 0;
  // fréquence du signal réel, pour calibrer le hasard à la même fréquence
  if (mode === 'hasard') {
    for (let i = 201; i < b.length; i++) { const dx = DXY.get(day(b[i].t)), tn = TNX.get(day(b[i].t)); if (dx && tn && dx.s50 != null && tn.s50 != null && dx.c < dx.s50 && tn.c < tn.s50) nSignals++; }
  }
  const pSig = nSignals / (b.length - 201);
  for (let i = 201; i < b.length; i++) {
    const dx = DXY.get(day(b[i].t)), tn = TNX.get(day(b[i].t));
    if (pos) {
      pos.held++;
      let x = null;
      if (b[i].l <= pos.sl) x = pos.sl;
      else if (mode === 'signal' && dx && dx.s50 != null && dx.c > dx.s50) x = b[i].c;
      else if (mode === 'inverse' && dx && dx.s50 != null && dx.c < dx.s50) x = b[i].c;
      else if (pos.held >= maxHold) x = b[i].c;
      if (x !== null) { add(out, 'XAUUSD', pos, b[i].t, x); pos = null; }
      continue;
    }
    if (a[i] == null) continue;
    let enter = false;
    if (mode === 'signal') enter = dx && tn && dx.s50 != null && tn.s50 != null && dx.c < dx.s50 && tn.c < tn.s50;
    else if (mode === 'inverse') enter = dx && tn && dx.s50 != null && tn.s50 != null && dx.c > dx.s50 && tn.c > tn.s50;
    else if (mode === 'hasard') enter = rand() < pSig;
    else if (mode === 'toujours') enter = true;
    if (enter) { const risk = 3 * a[i]; pos = { entry: b[i].c, entryT: b[i].t, risk, sl: b[i].c - risk, held: 0 }; }
  }
  return out;
}

const d = loadData('1d');
const b = d.XAUUSD;
console.log('===== CONTRÔLE : le signal macro bat-il le hasard sur l or ? (25 ans, net swaps) =====\n');
const rows = [];
rows.push({ mode: 'SIGNAL (dollar faible + taux baisse)', ...stats(runGold(b, { mode: 'signal' })) });
rows.push({ mode: 'SIGNAL INVERSE (dollar fort + taux hausse)', ...stats(runGold(b, { mode: 'inverse' })) });
rows.push({ mode: 'TOUJOURS LONG (tenue 20j, aucun signal)', ...stats(runGold(b, { mode: 'toujours' })) });
// hasard : plusieurs graines pour une moyenne honnête
const rs = [];
for (const s of [1, 7, 42, 99, 1234, 5555, 31337, 777]) rs.push(stats(runGold(b, { mode: 'hasard', seed: s })));
const avg = k => (rs.reduce((a, x) => a + (x[k] ?? 0), 0) / rs.length);
rows.push({ mode: `HASARD (moyenne de ${rs.length} graines, même fréquence)`, n: Math.round(avg('n')), winRate: avg('winRate').toFixed(1), pf: avg('pf').toFixed(2), expR: avg('expR').toFixed(3), totalR: avg('totalR').toFixed(1), maxDD_R: avg('maxDD_R').toFixed(1) });
console.log(fmtTable(rows));

const sig = runGold(b, { mode: 'signal' });
console.log('\n=== le SIGNAL par sous-période ===');
console.log(fmtTable(byPeriod(sig, [['2001-2008', 2001, 2008], ['2009-2014', 2009, 2014], ['2015-2020', 2015, 2020], ['2021-2026', 2021, 2026]])));
console.log('\n=== verdict ===');
const sSig = stats(sig), hasard = avg('expR');
console.log(`  espérance du signal : ${sSig.expR}R/trade | espérance du hasard : ${hasard.toFixed(3)}R/trade`);
console.log(`  surperformance : ${(sSig.expR - hasard).toFixed(3)}R/trade => ${sSig.expR > hasard * 1.3 ? 'LE SIGNAL APPORTE QUELQUE CHOSE' : 'LE SIGNAL N APPORTE RIEN DE SIGNIFICATIF'}`);
