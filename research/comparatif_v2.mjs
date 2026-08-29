// COMPARATIF FINAL v2 — corrigé : risque distinct entre phase challenge et phase financée.
// Tout est exprimé en DOLLARS sur la base d'un compte de référence, pour comparer des choses comparables.
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

// ch* = phase challenge, fd* = phase financée. Montants en $.
function journey(c, months = 24, sims = 12000) {
  const seq = c.seq, pm = seq.length / spanOf(seq), horizon = Math.round(months * pm);
  const cash = [], first = [];
  for (let s = 0; s < sims; s++) {
    let i = Math.floor(Math.random() * seq.length), used = 0, banked = 0, fees = 0, funded = false, tF = null;
    // --- CHALLENGE ---
    while (!funded && used < horizon) {
      fees += c.fee;
      let ok = null;
      for (let t = 0; t < c.chTargets.length && ok !== 'bust'; t++) {
        let eq = 0, peak = 0, cur = '', ds = 0;
        while (used < horizon) {
          const k = new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + (i / seq.length | 0);
          if (k !== cur) { cur = k; ds = 0; }
          const g = seq[i % seq.length].r * c.chRisk; eq += g; ds += g; i++; used++;
          if (eq > peak) peak = eq;
          const fl = c.trail ? Math.min(peak - c.chDD, 0) : -c.chDD;
          if (c.chDay && ds <= -c.chDay) { ok = 'bust'; break; }
          if (eq <= fl) { ok = 'bust'; break; }
          if (eq >= c.chTargets[t]) { ok = 'pass'; break; }
        }
        if (used >= horizon) { ok = 'timeout'; break; }
      }
      if (ok === 'pass') funded = true;
    }
    // --- COMPTE FINANCÉ ---
    if (funded) {
      let eq = 0, peak = 0, cur = '', ds = 0, alive = true, resets = c.resetOnce ? 1 : 0, n = 0;
      const payEvery = Math.max(1, Math.round(pm * c.payMonths));
      while (used < horizon && alive) {
        const k = new Date(seq[i % seq.length].exitT).toISOString().slice(0, 10) + '#' + (i / seq.length | 0);
        if (k !== cur) { cur = k; ds = 0; }
        const g = seq[i % seq.length].r * c.fdRisk; eq += g; ds += g; i++; used++; n++;
        if (eq > peak) peak = eq;
        const fl = c.trail ? Math.min(peak - c.fdDD, 0) : -c.fdDD;
        if ((c.fdDay && ds <= -c.fdDay) || eq <= fl) {
          if (resets > 0) { resets--; eq = 0; peak = 0; ds = 0; } else { alive = false; break; }
        }
        if (n % payEvery === 0) { const d2 = eq - c.cushion; if (d2 > 0) { banked += d2 * c.split; eq -= d2; if (tF === null) tF = used / pm; } }
      }
    }
    cash.push(banked - fees + (funded && c.refund ? c.fee : 0));
    if (tF !== null) first.push(tF);
  }
  cash.sort((a, b) => a - b); first.sort((a, b) => a - b);
  return {
    'cash médian': Math.round(cash[sims / 2 | 0]) + '$',
    'cash moyen': Math.round(cash.reduce((a, b) => a + b, 0) / sims) + '$',
    '1er retrait': first.length ? first[first.length / 2 | 0].toFixed(1) + ' mois' : 'jamais',
    'jamais payé': (100 * (sims - first.length) / sims).toFixed(0) + '%',
  };
}

console.log('===== COMPARATIF FINAL v2 — CASH ENCAISSÉ SUR 24 MOIS =====\n');
const rows = [];

// PHIDIAS PREMIUM 100K : DD 3000$ EOD trailing, cible 6000$, pas de swap, payouts /5j, split 0.8 moyen, reset 1x
for (const rUSD of [200, 270, 350]) {
  rows.push({ offre: `PHIDIAS ${rUSD}$/trade`, ...journey({ seq: S.free3, chRisk: rUSD, fdRisk: rUSD, chDD: 3000, fdDD: 3000, chDay: 0, fdDay: 0, trail: true, chTargets: [6000], fee: 180, refund: false, split: 0.8, cushion: 0, payMonths: 0.25, resetOnce: true }) });
}
rows.push({ offre: '---', 'cash médian': '', 'cash moyen': '', '1er retrait': '', 'jamais payé': '' });

// FT+ 1-STEP 100K : DD 6% trailing, cible 10%, jour 4%, sans swap, coussin, 1R = risque% x 1000$
for (const [chR, fdR, cush, cap] of [[1.75, 0.5, 6, 'free2'], [1.75, 0.7, 6, 'free2']]) {
  rows.push({
    offre: `FT+ ch ${chR}% / fin ${fdR}% / cous ${cush}%`,
    ...journey({ seq: S[cap], chRisk: chR * 1000, fdRisk: fdR * 1000, chDD: 6000, fdDD: 6000, chDay: 4000, fdDay: 4000, trail: true, chTargets: [10000], fee: 384, refund: false, split: 0.8, cushion: cush * 1000, payMonths: 1 }),
  });
}
rows.push({ offre: '---', 'cash médian': '', 'cash moyen': '', '1er retrait': '', 'jamais payé': '' });

// FTMO 2-STEP SWING 100K : DD 10% statique, cibles 10% puis 5%, jour 5%, AVEC swaps, frais remboursés
for (const [chR, fdR] of [[1.25, 0.7], [1.0, 0.7]]) {
  rows.push({
    offre: `FTMO ch ${chR}% / fin ${fdR}%`,
    ...journey({ seq: S.swap3, chRisk: chR * 1000, fdRisk: fdR * 1000, chDD: 10000, fdDD: 10000, chDay: 5000, fdDay: 5000, trail: false, chTargets: [10000, 5000], fee: 540, refund: true, split: 0.8, cushion: 0, payMonths: 1 }),
  });
}
console.log(fmtTable(rows));
