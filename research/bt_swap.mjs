// Impact des SWAPS (frais overnight) sur la config live — question utilisateur du 2026-07-20.
// Coût journalier ≈ taux% × notionnel. En R : taux% × (prix d'entrée / distance de stop) par jour calendaire.
// Le ratio notionnel/risque est ÉNORME pour le trend 1h (stop serré: ratio ~60-90) et petit pour MR (stop daily large: ~15).
// Taux ESTIMÉS (à confirmer avec la fenêtre Spécification des symboles MT5 de l'utilisateur) :
//   indices long ~ -0.015%/jour, indices short ~ 0%, or long ~ -0.02%/jour, or short ~ 0%.
import { simulate } from './bt_portfolio.mjs';
import { stats, fmtTable } from './lib.mjs';

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });

// Taux RÉELS relevés par l'utilisateur le 2026-07-20 (MT5, "échange positions longues/courtes", en points/jour) :
// US100 L -620.96 / S +25.84 | XAUUSD L -73.08 / S -23.55 | US30 L -1133.52 / S +47.17 | US500 L -157.71 / S +2.44
// Convertis en %/jour du notionnel (point = 0.01 unité d'indice) — ≈ -0.021%/j long indices ≈ 7.7%/an de financement.
export const REAL_RATES = {
  US500: { L: -0.0211, S: +0.0003 }, US100: { L: -0.0217, S: +0.0009 },
  US30: { L: -0.0218, S: +0.0009 }, XAUUSD: { L: -0.0182, S: -0.0059 },
};

function applySwap(seq, mult, real = false) {
  // mult = multiplicateur du scénario (1 = central) ; taux en %/jour calendaire (négatif = coût)
  const RATE = { idxL: -0.015, idxS: 0, goldL: -0.02, goldS: 0 };
  return seq.map(t => {
    const days = (t.exitT - t.entryT) / 86400000;
    const gold = t.instr === 'XAUUSD';
    const rate = real ? REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S']
      : (gold ? (t.dir === 1 ? RATE.goldL : RATE.goldS) : (t.dir === 1 ? RATE.idxL : RATE.idxS)) * mult;
    const swapR = (rate / 100) * (t.entryPx / t.riskDist) * days;
    return { ...t, r: t.r + swapR, swapR };
  });
}

console.log('===== IMPACT DES SWAPS — config live 2 ans, règles robot =====');
for (const [label, seq] of [['TREND 1h', trades], ['MR-A daily', mrTrades], ['COMBINÉ', [...trades, ...mrTrades]]]) {
  const rows = [{ scénario: 'sans swap (backtest actuel)', ...stats(seq) }];
  for (const [sc, m] of [['swap central (-0.015%/j idx)', 1], ['swap faible (-0.01%/j)', 0.67], ['swap fort (-0.025%/j)', 1.67]]) {
    rows.push({ scénario: sc, ...stats(applySwap(seq, m)) });
  }
  rows.push({ scénario: 'TAUX RÉELS MT5 (2026-07-20)', ...stats(applySwap(seq, 1, true)) });
  console.log(`\n--- ${label} ---`);
  console.log(fmtTable(rows));
}

// coût moyen par trade et sur les marathons
const sw = applySwap(trades, 1);
const avg = sw.reduce((a, t) => a + t.swapR, 0) / sw.length;
const marathons = sw.filter(t => (t.exitT - t.entryT) / 86400000 > 21);
console.log(`\nCoût swap moyen par trade trend : ${avg.toFixed(3)}R`);
console.log(`Trades > 21 jours : ${marathons.length}, coût swap moyen : ${(marathons.reduce((a, t) => a + t.swapR, 0) / marathons.length).toFixed(2)}R, résultat net moyen : ${(marathons.reduce((a, t) => a + t.r, 0) / marathons.length).toFixed(2)}R`);
const swM = applySwap(mrTrades, 1);
console.log(`Coût swap moyen par trade MR : ${(swM.reduce((a, t) => a + t.swapR, 0) / swM.length).toFixed(3)}R (stop daily large -> notionnel/risque ~15 seulement)`);
