// Extraction des bougies 5 min depuis TradingView Desktop (lancé avec --remote-debugging-port=9222).
// L'abonnement ne charge que ~5 000 bougies (≈ 1 mois en 5 min) : on fusionne à chaque passage dans
// scalp_data/scalp_<SYMBOLE>_5m.json pour construire l'historique mois après mois. À lancer au moins toutes les 4 semaines.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const SYMBOLS = ['CME_MINI:NQ1!', 'CME_MINI:ES1!'];
const RES = '5';
const DIR = new URL('./scalp_data/', import.meta.url); mkdirSync(DIR, { recursive: true });

const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find(t => t.type === 'page' && /tradingview\.com\/chart/.test(t.url));
if (!page) { console.log('TradingView n\'est pas ouvert sur un graphique avec le contrôle à distance.'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
let id = 0; const pending = new Map();
ws.onmessage = m => { const j = JSON.parse(m.data); if (pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); } };
const ev = expression => new Promise(res => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })); })
  .then(j => { if (j.result?.exceptionDetails) throw new Error(JSON.stringify(j.result.exceptionDetails).slice(0, 300)); return j.result?.result?.value; });

const SERIES = `window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries()`;
for (const sym of SYMBOLS) {
  await ev(`(async () => { const c = window.TradingViewApi.activeChart(); await new Promise(r => c.setSymbol(${JSON.stringify(sym)}, r)); await new Promise(r => c.setResolution(${JSON.stringify(RES)}, r)); return true; })()`);
  // charger tout l'historique autorisé par l'abonnement
  const n = await ev(`(async () => { const s = ${SERIES}; await new Promise(r => setTimeout(r, 3000)); let same = 0, prev = -1;
    for (let k = 0; k < 60 && same < 3; k++) { const n = s.bars().size(); same = n === prev ? same + 1 : 0; prev = n; try { s.requestMoreData(5000); } catch (e) {} await new Promise(r => setTimeout(r, 2500)); }
    return s.bars().size(); })()`);
  const bars = await ev(`(() => { const b = ${SERIES}.bars(), out = []; for (let i = b.firstIndex(); i <= b.lastIndex(); i++) { const v = b.valueAt(i); if (v) out.push([v[0] * 1000, v[1], v[2], v[3], v[4]]); } return out; })()`);
  const key = sym.split(':')[1].replace(/\W/g, '');
  const f = new URL(`./scalp_${key}_5m.json`, DIR);
  const old = existsSync(f) ? JSON.parse(readFileSync(f)) : [];
  const map = new Map(old.map(b => [b[0], b]));
  // les bougies de la dernière heure peuvent être incomplètes : on ne garde que celles closes depuis 10 min
  for (const b of bars) if (b[0] + 15 * 60e3 < Date.now()) map.set(b[0], b);
  const merged = [...map.values()].sort((a, b) => a[0] - b[0]);
  writeFileSync(f, JSON.stringify(merged));
  console.log(`${sym} : ${bars.length} bougies chargées (${n}) | historique cumulé ${merged.length} bougies, du ${new Date(merged[0][0]).toISOString().slice(0, 10)} au ${new Date(merged.at(-1)[0]).toISOString().slice(0, 10)}`);
}
ws.close();
