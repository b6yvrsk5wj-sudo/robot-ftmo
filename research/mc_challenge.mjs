// Monte Carlo du challenge FTMO : rejoue la séquence réelle des trades du système (config live,
// règles robot complètes) en partant de points de départ aléatoires (bootstrap circulaire),
// à différents niveaux de risque par trade. Règles FTMO : cible +10% (P1) / +5% (P2),
// perte max −10% (statique, depuis le départ), perte max journalière −5%. Pas de limite de temps.
// Approximation : équité sur trades CLÔTURÉS (le flottant n'est pas modélisé -> légèrement optimiste).
import { simulate } from './bt_portfolio.mjs';
import { fmtTable } from './lib.mjs';

const { trades, mrTrades } = simulate('1h', { maxConc: 3, maxPerDay: 3, withMR: true, conflict: true });
const seq = [...trades, ...mrTrades].sort((a, b) => a.exitT - b.exitT);
const span = (seq[seq.length - 1].exitT - seq[0].exitT) / (30.44 * 86400000); // mois couverts
const perMonth = seq.length / span;
console.log(`Séquence: ${seq.length} trades sur ${span.toFixed(1)} mois (~${perMonth.toFixed(1)} trades/mois)\n`);

// regroupe par jour calendaire pour la règle des −5%/jour
const dayKey = t => new Date(t.exitT).toISOString().slice(0, 10);

function runPhase(riskPct, targetPct, sims = 20000) {
  let pass = 0, bust = 0, months = [];
  for (let s = 0; s < sims; s++) {
    const start = Math.floor(Math.random() * seq.length);
    let eq = 0, i = 0, curDay = '', daySum = 0, res = null;
    while (i < seq.length * 5) { // garde-fou : 5 tours max de la séquence
      const t = seq[(start + i) % seq.length];
      const dk = dayKey(t) + Math.floor((start + i) / seq.length); // jours distincts entre tours
      if (dk !== curDay) { curDay = dk; daySum = 0; }
      const r = t.r * riskPct;
      eq += r; daySum += r;
      i++;
      if (daySum <= -5) { res = 'bust'; break; }
      if (eq <= -10) { res = 'bust'; break; }
      if (eq >= targetPct) { res = 'pass'; break; }
    }
    if (res === 'pass') { pass++; months.push(i / perMonth); }
    else if (res === 'bust') bust++;
    else bust++; // n'a jamais atteint la cible en 5 tours -> échec pratique
  }
  months.sort((a, b) => a - b);
  const med = months.length ? months[Math.floor(months.length / 2)] : NaN;
  const p90 = months.length ? months[Math.floor(months.length * 0.9)] : NaN;
  return { pass: +(100 * pass / sims).toFixed(0), bust: +(100 * bust / sims).toFixed(0), medMois: +med.toFixed(1), p90Mois: +p90.toFixed(1) };
}

for (const [label, target] of [['PHASE 1 (cible +10%)', 10], ['PHASE 2 (cible +5%)', 5]]) {
  console.log(`===== ${label} =====`);
  const rows = [];
  for (const risk of [0.5, 0.7, 1.0, 1.25, 1.5]) {
    const r = runPhase(risk, target);
    rows.push({ 'risque/trade': risk + '%', 'réussite': r.pass + '%', 'échec (compte cramé)': r.bust + '%', 'durée médiane': r.medMois + ' mois', 'durée (90e pct)': r.p90Mois + ' mois' });
  }
  console.log(fmtTable(rows) + '\n');
}
