// COMPARATIF FINAL DES 3 OFFRES — même moteur, mêmes séquences, mesure du CASH encaissé.
//
// PHIDIAS PREMIUM 100K (futures, relevé sur leur site le 2026-08-29) :
//   prix 180$ one-time (code PHIDIAS80) | drawdown 3 000$ EOD TRAILING | objectif 6 000$ | 1 jour min
//   overnight + week-end autorisés (évaluation ET compte financé) | payouts tous les 5 jours
//   split progressif 75% -> 100% | Cash Account Reset 1x | PAS DE SWAP (futures)
//   ⚠️ ratio objectif/drawdown = 2.0 (le plus défavorable des trois)
// FT+ 1-STEP EXPRESS : 384$ | DD 6% trailing | cible 10% | jour 4% | sans swap | coussin obligatoire
// FTMO 2-STEP SWING  : 540$ remboursés | DD 10% statique | cibles 10%+5% | jour 5% | AVEC swaps
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';
import { fmtTable } from './lib.mjs';
const WED = 1.28;

function seqFor(cap, withSwap) {
  const { trades, mrTrades } = simulate('1h', { maxConc: cap, maxPerDay: 3, withMR: true, conflict: true, totalCap: cap });
  const s = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
  if (!withSwap) return s;
  return s.map(t => {
    const d = ((t.exitT - t.entryT) / 86400000) * WED;
    return { ...t, r: t.r + (REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'] / 100) * (t.entryPx / t.riskDist) * d };
  });
}
const S = { free3: seqFor(3, false), free2: seqFor(2, false), swap3: seqFor(3, true) };
const spanOf = s => (s[s.length - 1].exitT - s[0].exitT) / (30.44 * 86400000);

// tout est exprimé en R ; ddR et targetR = limites converties en multiples de R
function journey(cfg, months = 24, sims = 12000) {
  const { seq, ddR, dayR, trail, targetsR, fee, refund, split, cushionR, riskUSD, fdDdR, fdTargets, resetOnce } = cfg;
  const pm = seq.length / spanOf(seq), horizon = Math.round(months * pm);
  const cash = [], first = [];
  for (let s = 0; s < sims; s++) {
    let i = Math.floor(Math.random() * seq.length), used = 0, banked = 0, fees = 0, funded = false, tF = null;
    while (!funded && used < horizon) {
      fees += fee;
      let ok = null;
      for (let t = 0; t < targetsR.length && ok !== 'bust'; t++) {
        let eq = 0, peak = 0, cur = '', ds = 0;
        while (used < horizon) {
          const k = new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + (i / seq.length | 0);
          if (k !== cur) { cur = k; ds = 0; }
          const r = seq[i % seq.length].r; eq += r; ds += r; i++; used++;
          if (eq > peak) peak = eq;
          const fl = trail ? Math.min(peak - ddR, 0) : -ddR;
          if (dayR && ds <= -dayR) { ok = 'bust'; break; }
          if (eq <= fl) { ok = 'bust'; break; }
          if (eq >= targetsR[t]) { ok = 'pass'; break; }
        }
        if (used >= horizon) { ok = 'timeout'; break; }
      }
      if (ok === 'pass') funded = true;
    }
    if (funded) {
      let eq = 0, peak = 0, cur = '', ds = 0, alive = true, resets = resetOnce ? 1 : 0, k2 = 0;
      const payEvery = Math.max(1, Math.round(pm * (cfg.payMonths ?? 1)));
      while (used < horizon && alive) {
        const k = new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + (i / seq.length | 0);
        if (k !== cur) { cur = k; ds = 0; }
        const r = seq[i % seq.length].r; eq += r; ds += r; i++; used++; k2++;
        if (eq > peak) peak = eq;
        const fl = trail ? Math.min(peak - fdDdR, 0) : -fdDdR;
        if ((dayR && ds <= -dayR) || eq <= fl) {
          if (resets > 0) { resets--; eq = 0; peak = 0; ds = 0; } else { alive = false; break; }
        }
        if (k2 % payEvery === 0) { const d2 = eq - cushionR; if (d2 > 0) { banked += d2 * split; eq -= d2; if (tF === null) tF = used / pm; } }
      }
    }
    cash.push(banked * riskUSD - fees + (funded && refund ? fee : 0));
    if (tF !== null) first.push(tF);
  }
  cash.sort((a, b) => a - b); first.sort((a, b) => a - b);
  return {
    'cash médian 24 mois': Math.round(cash[sims / 2 | 0]) + '$',
    'cash moyen': Math.round(cash.reduce((a, b) => a + b, 0) / sims) + '$',
    '1er retrait': first.length ? first[first.length / 2 | 0].toFixed(1) + ' mois' : 'jamais',
    'jamais payé': (100 * (sims - first.length) / sims).toFixed(0) + '%',
  };
}

console.log('===== COMPARATIF FINAL — CASH ENCAISSÉ SUR 24 MOIS =====\n');
const rows = [];

// PHIDIAS : dd 3000$, cible 6000$. On balaie le risque par trade en $.
for (const riskUSD of [150, 200, 270, 350]) {
  rows.push({
    offre: `PHIDIAS ${riskUSD}$/trade`, seq: 'sans swap',
    ...journey({ seq: S.free3, riskUSD, ddR: 3000 / riskUSD, fdDdR: 3000 / riskUSD, targetsR: [6000 / riskUSD], trail: true, dayR: 0, fee: 180, refund: false, split: 0.8, cushionR: 0, payMonths: 0.25, resetOnce: true }),
  });
}
rows.push({ offre: '---', seq: '', 'cash médian 24 mois': '', 'cash moyen': '', '1er retrait': '', 'jamais payé': '' });
// FT+ : 100k, risque en % ; 1R = risque% x 1000$
for (const [risk, cush] of [[1.75, 6], [1.0, 6]]) {
  rows.push({
    offre: `FT+ ${risk}% / coussin ${cush}%`, seq: 'sans swap',
    ...journey({ seq: risk > 1.3 ? S.free2 : S.free3, riskUSD: risk * 1000, ddR: 6 / risk, fdDdR: 6 / risk, targetsR: [10 / risk], trail: true, dayR: 4 / risk, fee: 384, refund: false, split: 0.8, cushionR: cush / risk, payMonths: 1 }),
  });
}
rows.push({ offre: '---', seq: '', 'cash médian 24 mois': '', 'cash moyen': '', '1er retrait': '', 'jamais payé': '' });
// FTMO : challenge 1.25% puis financé 0.7% -> on approxime avec le risque moyen pondéré
for (const risk of [1.25, 1.0]) {
  rows.push({
    offre: `FTMO ${risk}% puis 0.7%`, seq: 'avec swaps',
    ...journey({ seq: S.swap3, riskUSD: 700, ddR: 10 / 0.7, fdDdR: 10 / 0.7, targetsR: [10 / risk * (risk / 0.7) / (risk / 0.7), 5 / 0.7].map((v, idx) => idx === 0 ? 10 / 0.7 : 5 / 0.7), trail: false, dayR: 5 / 0.7, fee: 540, refund: true, split: 0.8, cushionR: 0, payMonths: 1 }),
  });
}
console.log(fmtTable(rows));
