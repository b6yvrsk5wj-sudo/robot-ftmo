// « Bilan sanguin » mensuel des stratégies courtes, sur l'historique 5 min cumulé par tv_fetch.mjs.
// Règles FIGÉES (aucun réglage mois après mois, sinon le test ne vaut plus rien) :
//  A. ORB 5 min « Zarattini » : sens = couleur de la 1re bougie 5 min (9h30 NY), entrée à l'ouverture de la 2e,
//     stop à l'autre extrémité, objectif 10R, sinon sortie à la clôture (16h NY).
//  B. Cassure 5 min : ordres stop au-dessus/en dessous de la 1re bougie 5 min, stop de l'autre côté, objectif 2R,
//     entrées jusqu'à 15h30, sortie à la clôture.
//  C. Cassure 15 min : idem avec la plage des 15 premières minutes.
//  D. Cassure 1 h (= le robot) recalculée en 5 min, pour comparer au suivi du robot.
// Frais aller-retour en points : futures micro (commission + 1 tick de glissement par côté) et CFD FTMO.
import { readFileSync, existsSync } from 'node:fs';

const MK = { NQ1: { label: 'Nasdaq (NQ)', fut: 1.1, cfd: 2.5 }, ES1: { label: 'S&P 500 (ES)', fut: 0.75, cfd: 0.8 } };
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const ny = t => { const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map(x => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, hm: (+p.hour % 24) * 60 + +p.minute }; };

function sessions(bars) {
  const days = new Map();
  for (const [t, o, h, l, c] of bars) { const n = ny(t); if (n.hm < 570 || n.hm >= 960) continue; if (!days.has(n.day)) days.set(n.day, []); days.get(n.day).push({ t, hm: n.hm, o, h, l, c }); }
  return [...days.entries()].filter(([, b]) => b.length >= 70 && b[0].hm === 570); // séance complète seulement
}
// gère une position ouverte à l'index k (prix e) jusqu'à la clôture ; sameBar = la bougie d'entrée peut toucher stop/objectif
function manage(b, k, d, e, sl, tp, sameBar) {
  for (let j = k; j < b.length; j++) {
    const x = b[j], L = d === 1;
    if (j > k || sameBar) {
      if (L ? x.l <= sl : x.h >= sl) return j === k ? sl : (L ? Math.min(x.o, sl) : Math.max(x.o, sl));
      if (L ? x.h >= tp : x.l <= tp) return L ? Math.max(x.o, tp) : Math.min(x.o, tp);
    }
  }
  return b.at(-1).c;
}
function bracket(b, nRange) {
  const R = b.slice(0, nRange), hi = Math.max(...R.map(x => x.h)), lo = Math.min(...R.map(x => x.l)), r = hi - lo;
  if (!(r > 0)) return null;
  for (let k = nRange; k < b.length && b[k].hm < 930; k++) {
    const x = b[k], up = x.h >= hi, dn = x.l <= lo;
    if (up && dn) return null;
    if (!up && !dn) continue;
    const d = up ? 1 : -1, e = up ? Math.max(x.o, hi) : Math.min(x.o, lo), sl = up ? lo : hi;
    return { d, e, risk: Math.abs(e - sl), x: manage(b, k, d, e, sl, up ? hi + 2 * r : lo - 2 * r, true) };
  }
  return null;
}
const STRATS = {
  'A. ORB 5 min Zarattini (10R)': b => { const f = b[0]; if (f.c === f.o) return null; const d = f.c > f.o ? 1 : -1, e = b[1].o, sl = d === 1 ? f.l : f.h, risk = Math.abs(e - sl);
    if (!(d * (e - sl) > 0)) return null; return { d, e, risk, x: manage(b, 1, d, e, sl, e + d * 10 * risk, true) }; },
  'B. Cassure 5 min (2R)': b => bracket(b, 1),
  'C. Cassure 15 min (2R)': b => bracket(b, 3),
  'D. Cassure 1 h (le robot)': b => bracket(b, 12),
};

const rows = [];
for (const [key, mk] of Object.entries(MK)) {
  const f = new URL(`./scalp_data/scalp_${key}_5m.json`, import.meta.url);
  if (!existsSync(f)) continue;
  const S = sessions(JSON.parse(readFileSync(f)));
  for (const [name, fn] of Object.entries(STRATS)) {
    const byMonth = {};
    for (const [day, b] of S) {
      const t = fn(b); if (!t) continue;
      const g = t.d * (t.x - t.e) / t.risk, m = day.slice(0, 7);
      (byMonth[m] ||= []).push({ g, fut: g - mk.fut / t.risk, cfd: g - mk.cfd / t.risk, tiny: t.risk < 2 * mk.cfd });
    }
    for (const [m, tr] of Object.entries(byMonth).sort()) rows.push({ mk: mk.label, name, m, tr });
  }
}
const agg = tr => { const n = tr.length, s = k => tr.reduce((a, t) => a + t[k], 0); return { n, g: s('g'), fut: s('fut'), cfd: s('cfd'), w: tr.filter(t => t.fut > 0).length }; };
const fx = v => (v >= 0 ? '+' : '') + v.toFixed(1);
console.log('Marché        | Stratégie                        | Mois    | Trades | Brut R | Net futures R | Net CFD R');
for (const r of rows) { const a = agg(r.tr); console.log(`${r.mk.padEnd(13)} | ${r.name.padEnd(32)} | ${r.m} | ${String(a.n).padStart(6)} | ${fx(a.g).padStart(6)} | ${fx(a.fut).padStart(13)} | ${fx(a.cfd).padStart(9)}`); }
console.log('\n=== CUMUL depuis le début du suivi (le seul chiffre qui comptera, à partir de ~200 trades) ===');
const keyOf = r => r.mk + ' | ' + r.name, cum = {};
for (const r of rows) (cum[keyOf(r)] ||= []).push(...r.tr);
for (const [k, tr] of Object.entries(cum)) { const a = agg(tr); console.log(`${k.padEnd(48)} | ${String(a.n).padStart(4)} trades | brut ${fx(a.g)}R (${(a.g / a.n).toFixed(3)}/trade) | futures ${fx(a.fut)}R (${(a.fut / a.n).toFixed(3)}/trade) | CFD ${fx(a.cfd)}R (${(a.cfd / a.n).toFixed(3)}/trade)`); }
