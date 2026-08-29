// LA VRAIE QUESTION (posée par l'utilisateur) : combien de CASH dans la poche, et QUAND ?
// Chez FT+ il faut d'abord constituer un coussin avant de pouvoir retirer quoi que ce soit.
// Chez FTMO on retire dès le premier profit. Le "plus rapide à financer" peut être plus LENT à encaisser.
// Simulation de bout en bout : challenge -> compte financé -> retraits, sur 24 mois. Séquences construites
// de façon IDENTIQUE pour les deux (même moteur, seul le swap et le jeu de règles changent).
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
const SEQ = { '2_free': seqFor(2, false), '3_free': seqFor(3, false), '3_swap': seqFor(3, true) };
const spanOf = s => (s[s.length - 1].exitT - s[0].exitT) / (30.44 * 86400000);

// parcours complet sur `months` mois : challenge (répété si échec) puis compte financé avec retraits
function journey(cfg, months = 24, sims = 12000) {
  const { chSeq, chRisk, chTargets, chMaxDD, chDayDD, chTrail, fee, fdSeq, fdRisk, fdCushion, fdMaxDD, fdDayDD, fdTrail, split } = cfg;
  const pmCh = chSeq.length / spanOf(chSeq), pmFd = fdSeq.length / spanOf(fdSeq);
  const horizon = Math.round(months * pmCh);
  const cash = [], firstPay = [];
  for (let s = 0; s < sims; s++) {
    let i = Math.floor(Math.random() * chSeq.length), used = 0, banked = 0, fees = 0, funded = false, tFirst = null;
    // --- phase challenge ---
    while (!funded && used < horizon) {
      fees += fee;
      let eq = 0, peak = 0, cur = '', ds = 0, ok = null;
      for (let t = 0; t < chTargets.length && ok !== 'bust'; t++) {
        eq = 0; peak = 0;
        while (used < horizon) {
          const k = new Date(chSeq[i % chSeq.length].exitT).toISOString().slice(0, 10) + '#' + (i / chSeq.length | 0);
          if (k !== cur) { cur = k; ds = 0; }
          const r = chSeq[i % chSeq.length].r * chRisk; eq += r; ds += r; i++; used++;
          if (eq > peak) peak = eq;
          const fl = chTrail ? Math.min(peak - chMaxDD, 0) : -chMaxDD;
          if (ds <= -chDayDD || eq <= fl) { ok = 'bust'; break; }
          if (eq >= chTargets[t]) { ok = 'pass'; break; }
        }
        if (used >= horizon) { ok = 'timeout'; break; }
      }
      if (ok === 'pass') funded = true;
    }
    // --- phase compte financé ---
    if (funded) {
      let j = Math.floor(Math.random() * fdSeq.length), eq = 0, peak = 0, cur = '', ds = 0, alive = true;
      const payEvery = Math.round(pmFd);
      let k2 = 0;
      while (used < horizon && alive) {
        const k = new Date(fdSeq[j % fdSeq.length].exitT).toISOString().slice(0, 10) + '#' + (j / fdSeq.length | 0);
        if (k !== cur) { cur = k; ds = 0; }
        const r = fdSeq[j % fdSeq.length].r * fdRisk; eq += r; ds += r; j++; used++; k2++;
        if (eq > peak) peak = eq;
        const fl = fdTrail ? Math.min(peak - fdMaxDD, 0) : -fdMaxDD;
        if (ds <= -fdDayDD || eq <= fl) { alive = false; break; }
        if (k2 % payEvery === 0) {
          const dispo = eq - fdCushion;
          if (dispo > 0) { banked += dispo * split; eq -= dispo; if (tFirst === null) tFirst = used / pmCh; }
        }
      }
    }
    cash.push(banked * 1000 - fees); // en $ sur compte 100k, net des frais de challenge
    if (tFirst !== null) firstPay.push(tFirst);
  }
  cash.sort((a, b) => a - b);
  firstPay.sort((a, b) => a - b);
  return {
    'cash net médian 24 mois': Math.round(cash[sims / 2 | 0]) + '$',
    'cash net moyen': Math.round(cash.reduce((a, b) => a + b, 0) / sims) + '$',
    '1er retrait (médiane)': firstPay.length ? firstPay[firstPay.length / 2 | 0].toFixed(1) + ' mois' : 'jamais',
    'jamais encaissé': (100 * (sims - firstPay.length) / sims).toFixed(0) + '%',
  };
}

const FTP = { fee: 384, split: 0.8, chTargets: [10], chMaxDD: 6, chDayDD: 4, chTrail: true, fdMaxDD: 6, fdDayDD: 4, fdTrail: true };
const FTMO = { fee: 540, split: 0.8, chTargets: [10, 5], chMaxDD: 10, chDayDD: 5, chTrail: false, fdMaxDD: 10, fdDayDD: 5, fdTrail: false };

console.log('===== CASH RÉELLEMENT ENCAISSÉ SUR 24 MOIS (compte 100k, net des frais) =====\n');
const rows = [];
for (const cush of [4, 6, 8]) {
  rows.push({
    offre: `FT+ coussin ${cush}%`, ...journey({ ...FTP, chSeq: SEQ['2_free'], chRisk: 1.75, fdSeq: SEQ['3_free'], fdRisk: 0.5, fdCushion: cush }),
  });
}
rows.push({ offre: 'FT+ coussin 8% @0.7%', ...journey({ ...FTP, chSeq: SEQ['2_free'], chRisk: 1.75, fdSeq: SEQ['3_free'], fdRisk: 0.7, fdCushion: 8 }) });
rows.push({ offre: '---', 'cash net médian 24 mois': '', 'cash net moyen': '', '1er retrait (médiane)': '', 'jamais encaissé': '' });
rows.push({ offre: 'FTMO 2-Step @1.25/0.7%', ...journey({ ...FTMO, chSeq: SEQ['3_swap'], chRisk: 1.25, fdSeq: SEQ['3_swap'], fdRisk: 0.7, fdCushion: 0 }) });
rows.push({ offre: 'FTMO 2-Step @1.0/0.7%', ...journey({ ...FTMO, chSeq: SEQ['3_swap'], chRisk: 1.0, fdSeq: SEQ['3_swap'], fdRisk: 0.7, fdCushion: 0 }) });
console.log(fmtTable(rows));
