// Télécharge et met en cache les données Yahoo : 21+ ans daily, ~2 ans 1h.
import { writeFileSync, mkdirSync } from 'node:fs';
import { INSTR, yahoo } from './lib.mjs';

mkdirSync(new URL('./data/', import.meta.url), { recursive: true });

for (const [sym, name] of INSTR) {
  for (const [interval, days] of [['1d', 9200], ['1h', 728]]) {
    const b = await yahoo(sym, interval, days);
    const f = new URL(`./data/${name}_${interval}.json`, import.meta.url);
    writeFileSync(f, JSON.stringify(b));
    const from = new Date(b[0].t).toISOString().slice(0, 10), to = new Date(b[b.length - 1].t).toISOString().slice(0, 10);
    console.log(`${name} ${interval}: ${b.length} barres, ${from} -> ${to}`);
    await new Promise(r => setTimeout(r, 1500));
  }
}
