// ROBOT FTMO v2 — CASSURE DE LA 1re HEURE (indices US, 1h). Test en DÉMO (voir research/RESULTS.md section 28).
// Règles : plage = plus haut / plus bas de la 1re bougie 1h de séance NY (9h30-10h30 NY).
//   Achat si le prix casse le plus haut, vente s'il casse le plus bas (le 1er des deux ; les deux dans la même bougie = rien).
//   Stop de l'autre côté de la plage, objectif 2R, ordres valables jusqu'à 15h30 NY, clôture forcée à la fin de séance (16h NY).
// Le robot (1) envoie à 10h30 NY les 2 ordres stop à placer, (2) SUIT TOUT SEUL chaque trade sur les bougies réelles
//   (forward-test papier, frais déduits) et logue dans orb_log.json — même si les ordres ne sont pas passés sur MT5.
// L'ancien robot (trend 1h + MR-A daily) est archivé dans research/robot_v1_trend_mr.mjs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// ====== RÉGLAGES ======
const RISK_PCT = 0.35;       // % de risque par trade (3 indices -> pire jour ≈ -1,05 %)
const ACCOUNT_SIZE = 100000; // taille du compte ($) pour le calcul de lots
const CONTRACT = { US30: 1, US100: 1, US500: 1 }; // $ par point et par lot (MT5)
const COST_PTS = { US500: 0.8, US100: 2.5, US30: 4, US2000: 0.5 }; // spread + glissement aller-retour (points), déduit du suivi
const TP_R = 2, LAST_ENTRY_NY_H = 14; // dernière bougie où une entrée est possible : 14h30-15h30 NY
const HEARTBEAT_HOUR_UTC = 21;
// ======================

const INSTR = [['^GSPC', 'US500', 'S&P 500'], ['^NDX', 'US100', 'Nasdaq 100'], ['^DJI', 'US30', 'Dow Jones'], ['^RUT', 'US2000', 'Russell 2000']];
// suivis en silence sur papier, sans alerte (Russell 2000 : validé hors échantillon, section 31)
const PAPER = new Set(['US2000']);
const TOKEN = process.env.TELEGRAM_TOKEN, CHAT = process.env.TELEGRAM_CHAT;
const STATE = 'orb_state.json', LOG = 'orb_log.json';
const now = +(process.env.NOW_MS || Date.now());

const nyParts = t => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(new Date(t)).map(p => [p.type, p.value]));
const nyDay = t => { const p = nyParts(t); return `${p.year}-${p.month}-${p.day}`; };
const nyHour = t => +nyParts(t).hour % 24;
const paris = t => new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const f = n => n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2);

async function yahoo(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1h&range=5d`;
  const j = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  const r = j.chart.result[0], ts = r.timestamp || [], q = r.indicators.quote[0], b = [];
  for (let i = 0; i < ts.length; i++) { if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) continue; b.push({ t: ts[i] * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }); }
  return b;
}
async function tg(text) {
  if (!TOKEN || !CHAT) { console.log('[no telegram env]\n' + text + '\n'); return; }
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT, text }) });
  const j = await r.json(); if (!j.ok) console.log('TG error', j.description);
}
const lots = (risk, name) => (ACCOUNT_SIZE * RISK_PCT / 100) / (risk * CONTRACT[name]);

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE)) : {};
const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG)) : [];
if (!state._meta) {
  // reprise de l'offset Telegram de l'ancien robot pour ne pas rejouer les vieilles commandes
  const old = existsSync('research/robot_v1_state.json') ? JSON.parse(readFileSync('research/robot_v1_state.json')) : {};
  state._meta = { lastUpdateId: old._meta?.lastUpdateId || 0, started: new Date(now).toISOString() };
}
const today = new Date(now).toISOString().slice(0, 10);
// variante suivie en parallèle sur papier (section 30) : mêmes entrées, objectif 1R au lieu de 2R
const TP_R_VARIANT = 1;
const totals = (v = 'base', paper = false) => { const c = log.filter(e => e.event === 'CLOSE' && (e.variant || 'base') === v && PAPER.has(e.instrument) === paper); return { n: c.length, r: c.reduce((s, e) => s + e.rNet, 0), w: c.filter(e => e.rNet > 0).length }; };
const bilanTxt = () => `• Objectif 2R (tes alertes) : ${totTxt('base')}\n• Variante objectif 1R (papier) : ${totTxt('1R')}\n• Russell 2000 (papier, 2R / 1R) : ${totTxt('base', true)} / ${totals('1R', true).r.toFixed(2)}R`;
const totTxt = (v, paper = false) => { const tt = totals(v, paper); return `${tt.n} trades, ${tt.w} gagnants, ${tt.r >= 0 ? '+' : ''}${tt.r.toFixed(2)}R net (≈ ${(tt.r * RISK_PCT).toFixed(2)} % du compte)`; };

// --- annonce du changement de stratégie (une seule fois) ---
if (!state._meta.announced) {
  state._meta.announced = true;
  await tg(`🔄 ROBOT FTMO — CHANGEMENT DE STRATÉGIE\n\nLes stratégies trend 1h et MR-A sont ARRÊTÉES (archivées).\nNouveau test en démo : CASSURE DE LA 1re HEURE sur S&P 500, Nasdaq 100 et Dow.\n\nChaque jour de bourse vers ${paris(Date.UTC(2026, 10, 2, 15, 30))} (Paris) je t'envoie, pour chaque indice, 2 ordres stop à placer (achat au-dessus / vente en dessous), avec stop, objectif 2R et lots (risque ${RISK_PCT} %).\n\nJe suis aussi chaque trade tout seul sur les vrais prix : même si tu ne passes pas les ordres, on aura le bilan réel.\n\n⚠️ Si des positions de l'ancien robot sont encore ouvertes sur ta démo, ferme-les à la main.`);
}

// --- commandes Telegram : status / bilan / aide ---
if (TOKEN && CHAT) {
  try {
    const ju = await (await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${(state._meta.lastUpdateId || 0) + 1}&timeout=0`)).json();
    if (ju.ok) for (const u of ju.result) {
      state._meta.lastUpdateId = u.update_id;
      const m = u.message; if (!m || !m.text || String(m.chat.id) !== String(CHAT)) continue;
      const t = m.text.toLowerCase();
      if (/(status|etat|état|bilan|position)/.test(t)) {
        const act = INSTR.map(([, n, lb]) => { const d = state[n]; return d && d.day === nyDay(now) ? `• ${lb}${PAPER.has(n) ? ' (papier)' : ''} : ${d.pos ? `${d.pos.dir === 1 ? 'LONG' : 'SHORT'} ouvert @ ${f(d.pos.e)}` : d.done ? `terminé (${d.result})` : 'ordres en attente'}` : `• ${lb} : rien aujourd'hui`; }).join('\n');
        await tg(`📊 Cassure 1re heure\n\nAujourd'hui :\n${act}\n\nDepuis le début :\n${bilanTxt()}`);
      } else if (/(help|aide|start|commande)/.test(t)) {
        await tg('Commandes :\n- "status" ou "bilan" : trades du jour + bilan depuis le début\n\nLe robot gère tout seul les sorties (stop, objectif 2R, fin de séance).');
      }
    }
  } catch (e) { console.log('cmd err', e.message); }
}

// --- passage des données ---
let ok = 0;
for (const [sym, name, label] of INSTR) {
  const silent = PAPER.has(name);
  let b; try { b = await yahoo(sym); ok++; } catch (e) { console.log(`${name}: ${e.message}`); continue; }
  const day = nyDay(now);
  // 1re bougie de la séance du jour (9h30 NY)
  const i0 = b.findIndex((x, i) => nyDay(x.t) === day && nyHour(x.t) === 9 && (i === 0 || nyDay(b[i - 1].t) !== day));
  if (i0 < 0 || now < b[i0].t + 3600e3) continue; // pas de séance ou 1re heure pas finie
  let d = state[name];
  if (!d || d.day !== day) {
    const fb = b[i0], hi = fb.h, lo = fb.l, r = hi - lo;
    if (!(r > 0)) continue;
    d = state[name] = { day, hi, lo, r, i0T: fb.t, pos: null, done: false, cancelled: false, lastT: fb.t };
    const lt = lots(r, name);
    if (!silent) await tg(`⏰ CASSURE 1re HEURE — ${label} (${name})\n\nPlage 1re heure : ${f(lo)} – ${f(hi)} (${r.toFixed(0)} pts)\n\n🟢 ACHAT STOP à ${f(hi)}\n   SL ${f(lo)} | TP ${f(hi + TP_R * r)}\n🔴 VENTE STOP à ${f(lo)}\n   SL ${f(hi)} | TP ${f(lo - TP_R * r)}\n\n📏 Lots : ~${lt.toFixed(2)} (risque ${RISK_PCT} % = ${f(ACCOUNT_SIZE * RISK_PCT / 100)}$)\n⚙️ Place les 2 ordres. Dès que l'un se déclenche, ANNULE l'autre.\n⌛ Annule les ordres non déclenchés à ${paris(fb.t + 6 * 3600e3)} et ferme toute position à ${paris(fb.t + 6.5 * 3600e3 - 5 * 60e3)} (Paris).`);
  }
  if (d.done) continue;
  // bougies clôturées après la 1re heure (la dernière, 15h30, dure 30 min)
  for (let i = i0 + 1; i < b.length && nyDay(b[i].t) === day; i++) {
    const x = b[i], isLast = nyHour(x.t) === 15, closeT = x.t + (isLast ? 1800e3 : 3600e3);
    if (x.t <= d.lastT || now < closeT + 5 * 60e3) continue;
    d.lastT = x.t;
    if (!d.entered && !d.cancelled) {
      if (nyHour(x.t) > LAST_ENTRY_NY_H) d.cancelled = true;
      else if (x.h >= d.hi && x.l <= d.lo) d.cancelled = true; // les 2 côtés dans la même bougie : ambigu, pas de trade
      else if (x.h >= d.hi || x.l <= d.lo) {
        const dir = x.h >= d.hi ? 1 : -1, e = dir === 1 ? Math.max(x.o, d.hi) : Math.min(x.o, d.lo);
        const sl = dir === 1 ? d.lo : d.hi, tp = dir === 1 ? d.hi + TP_R * d.r : d.lo - TP_R * d.r;
        d.pos = { dir, e, sl, tp, t: x.t, risk: Math.abs(e - sl) };
        d.pos1 = { ...d.pos, tp: dir === 1 ? d.hi + TP_R_VARIANT * d.r : d.lo - TP_R_VARIANT * d.r };
        d.entered = true;
        log.push({ time: new Date(x.t).toISOString(), day, instrument: name, event: 'OPEN', dir: dir === 1 ? 'LONG' : 'SHORT', entry: e, sl, tp });
        if (!silent) await tg(`${dir === 1 ? '🟢' : '🔴'} Déclenché — ${label} : ${dir === 1 ? 'ACHAT' : 'VENTE'} @ ${f(e)}\nAnnule l'autre ordre si ce n'est pas fait.`);
      }
      if (d.cancelled && !d.pos) { d.done = true; d.result = 'pas de trade'; break; }
    }
    // 'pos' = version de base (tes alertes), 'pos1' = variante objectif 1R suivie en silence
    for (const key of ['pos', 'pos1']) {
      const p = d[key]; if (!p) continue;
      const L = p.dir === 1, first = x.t === p.t;
      let exit = null, why = null;
      if (L ? x.l <= p.sl : x.h >= p.sl) { exit = first ? p.sl : (L ? Math.min(x.o, p.sl) : Math.max(x.o, p.sl)); why = 'STOP'; }
      else if (L ? x.h >= p.tp : x.l <= p.tp) { exit = L ? Math.max(x.o, p.tp) : Math.min(x.o, p.tp); why = 'OBJECTIF'; }
      else if (isLast) { exit = x.c; why = 'FIN DE SÉANCE'; }
      if (exit === null) continue;
      const rG = p.dir * (exit - p.e) / p.risk, rNet = rG - COST_PTS[name] / p.risk, res = `${why} ${rNet >= 0 ? '+' : ''}${rNet.toFixed(2)}R`;
      log.push({ time: new Date(closeT).toISOString(), day, instrument: name, event: 'CLOSE', variant: key === 'pos' ? 'base' : '1R', outcome: why, exit, rGross: +rG.toFixed(3), rNet: +rNet.toFixed(3) });
      d[key] = null;
      if (key === 'pos') {
        d.result = res;
        if (!silent) await tg(`${rNet > 0 ? '✅' : '❌'} ${label} — ${why}\nSortie ${f(exit)} : ${rNet >= 0 ? '+' : ''}${rNet.toFixed(2)}R net (${rNet >= 0 ? '+' : '−'}${f(Math.abs(rNet) * ACCOUNT_SIZE * RISK_PCT / 100)}$)`);
      } else d.result1 = res;
    }
    if (d.entered && !d.pos && !d.pos1) { d.done = true; break; }
    if (isLast && !d.pos && !d.pos1) { d.done = true; d.result = d.result || 'pas de trade'; }
  }
}

if (ok === 0) {
  if (!state._meta.dataFail) { state._meta.dataFail = true; await tg('⚠️ ROBOT — impossible de récupérer les prix (Yahoo). Nouvel essai dans 15 min.'); }
} else if (state._meta.dataFail) { state._meta.dataFail = false; await tg('✅ Robot rétabli — données OK.'); }

// --- point quotidien (après la clôture US) ---
if (new Date(now).getUTCHours() >= HEARTBEAT_HOUR_UTC && state._meta.lastHB !== today) {
  state._meta.lastHB = today;
  const dayRes = INSTR.map(([, n, lb]) => state[n]?.day === nyDay(now) ? `• ${lb}${PAPER.has(n) ? ' (papier)' : ''} : ${state[n].result || 'en cours'}${state[n].result1 ? ` (variante 1R : ${state[n].result1})` : ''}` : null).filter(Boolean);
  await tg(`🤖 Point du jour — cassure 1re heure\n\n${dayRes.length ? dayRes.join('\n') : 'Pas de séance aujourd\'hui.'}\n\nBilan depuis le début :\n${bilanTxt()}`);
}

writeFileSync(STATE, JSON.stringify(state, null, 2));
writeFileSync(LOG, JSON.stringify(log, null, 2));
console.log(`Run OK ${new Date(now).toISOString()} | trades clos : ${totals().n}`);
