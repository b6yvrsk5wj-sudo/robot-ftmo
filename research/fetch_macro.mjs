// Données INTERMARCHÉS jamais utilisées jusqu'ici : volatilité, dollar, taux, obligations.
// Ce sont les variables de contexte que les gérants professionnels utilisent comme filtres de régime.
import { writeFileSync } from 'node:fs';
import { yahoo } from './lib.mjs';

const SERIES = [
  ['^VIX', 'VIX'],          // volatilité implicite S&P
  ['DX-Y.NYB', 'DXY'],      // indice dollar
  ['^TNX', 'TNX'],          // taux 10 ans US
  ['TLT', 'TLT'],           // obligations longues
  ['^VVIX', 'VVIX'],        // volatilité de la volatilité
  ['HYG', 'HYG'],           // crédit high yield (appétit pour le risque)
];
for (const [sym, name] of SERIES) {
  try {
    const b = await yahoo(sym, '1d', 9200);
    writeFileSync(new URL(`./data/${name}_1d.json`, import.meta.url), JSON.stringify(b));
    console.log(`${name.padEnd(5)} : ${b.length} barres, ${new Date(b[0].t).toISOString().slice(0, 10)} -> ${new Date(b[b.length - 1].t).toISOString().slice(0, 10)}`);
  } catch (e) { console.log(`${name.padEnd(5)} : ÉCHEC — ${e.message.slice(0, 80)}`); }
  await new Promise(r => setTimeout(r, 1200));
}
