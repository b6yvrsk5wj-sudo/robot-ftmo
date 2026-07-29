// À quoi ressemble une fenêtre de 10 trades dans l'historique ? (contexte pour le forward-test réel)
// Aux taux de swap RÉELS. Répond à : "-0.7R après 10 trades, c'est grave ou normal ?"
import { simulate } from './bt_portfolio.mjs';
import { REAL_RATES } from './bt_swap.mjs';

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const seq = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT).map(t => {
  const days = (t.exitT - t.entryT) / 86400000;
  const rate = REAL_RATES[t.instr][t.dir === 1 ? 'L' : 'S'];
  return { ...t, r: t.r + (rate / 100) * (t.entryPx / t.riskDist) * days };
});

const W = 10;
const wins = [];
for (let i = 0; i + W <= seq.length; i++) wins.push(seq.slice(i, i + W).reduce((a, t) => a + t.r, 0));
wins.sort((a, b) => a - b);
const neg = wins.filter(w => w < 0).length;
const worse = wins.filter(w => w <= -0.7).length;
console.log(`Fenêtres glissantes de ${W} trades (taux réels) : ${wins.length} fenêtres`);
console.log(`  négatives           : ${neg} (${(100 * neg / wins.length).toFixed(0)}%)`);
console.log(`  pires que -0.7R     : ${worse} (${(100 * worse / wins.length).toFixed(0)}%)`);
console.log(`  pire fenêtre        : ${wins[0].toFixed(1)}R | médiane : ${wins[Math.floor(wins.length / 2)].toFixed(1)}R | meilleure : ${wins[wins.length - 1].toFixed(1)}R`);

// idem sur 20 trades (le seuil du critère GO)
const W2 = 20; const w2 = [];
for (let i = 0; i + W2 <= seq.length; i++) w2.push(seq.slice(i, i + W2).reduce((a, t) => a + t.r, 0));
w2.sort((a, b) => a - b);
console.log(`\nFenêtres de ${W2} trades : négatives ${(100 * w2.filter(w => w < 0).length / w2.length).toFixed(0)}% | pire ${w2[0].toFixed(1)}R | médiane ${w2[Math.floor(w2.length / 2)].toFixed(1)}R`);

// part de l'or dans les trades (l'or domine le compteur)
const gold = seq.filter(t => t.instr === 'XAUUSD');
console.log(`\nPart de l'or dans les trades : ${gold.length}/${seq.length} (${(100 * gold.length / seq.length).toFixed(0)}%) | R net or : ${gold.reduce((a, t) => a + t.r, 0).toFixed(1)}R`);
