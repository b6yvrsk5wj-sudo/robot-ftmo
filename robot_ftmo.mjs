// ROBOT FTMO — trend-pullback 1h sur indices US + or. Alerte Telegram sur signal (bougie CLÔTURÉE).
// Règles: 1 position/instrument, max 1 indice + l'or en simultané, max 2 NOUVEAUX trades/jour,
// et si plusieurs signaux -> garde les MEILLEURS (force de tendance + diversification).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const RISK_PCT=1.0, MAX_PER_DAY=2;
const INSTR=[['^GSPC','US500','S&P 500','index'],['^NDX','US100','Nasdaq 100','index'],['^DJI','US30','Dow Jones','index'],['GC=F','XAUUSD','Or','gold']];
const TOKEN=process.env.TELEGRAM_TOKEN, CHAT=process.env.TELEGRAM_CHAT;
const STATE='state.json', LOG='ftmo_signals_log.json';

async function yahoo(sym){const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1h&range=60d`;
  const j=await(await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}})).json();const r=j.chart.result[0];const ts=r.timestamp||[];const q=r.indicators.quote[0];
  const b=[];for(let i=0;i<ts.length;i++){if(q.open[i]==null||q.high[i]==null||q.low[i]==null||q.close[i]==null)continue;b.push({t:ts[i]*1000,o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i]});}return b;}
function ema(v,len){const k=2/(len+1);let p=null;const o=[];for(let i=0;i<v.length;i++){if(i<len-1){o.push(null);continue;}if(p===null){let s=0;for(let j=i-len+1;j<=i;j++)s+=v[j];p=s/len;}else p=v[i]*k+p*(1-k);o.push(p);}return o;}
function rsi(c,len){const o=[null];let aG=0,aL=0;for(let i=1;i<c.length;i++){const ch=c[i]-c[i-1],g=Math.max(ch,0),l=Math.max(-ch,0);if(i<=len){aG+=g;aL+=l;o.push(null);if(i===len){aG/=len;aL/=len;o[o.length-1]=aL===0?100:100-100/(1+aG/aL);}}else{aG=(aG*(len-1)+g)/len;aL=(aL*(len-1)+l)/len;o.push(aL===0?100:100-100/(1+aG/aL));}}return o;}
function atr(b,len){let p=null;const tr=[],o=[];for(let i=0;i<b.length;i++)tr.push(i===0?b[i].h-b[i].l:Math.max(b[i].h-b[i].l,Math.abs(b[i].h-b[i-1].c),Math.abs(b[i].l-b[i-1].c)));for(let i=0;i<b.length;i++){if(i<len){o.push(null);continue;}if(p===null){let s=0;for(let j=i-len+1;j<=i;j++)s+=tr[j];p=s/len;}else p=(p*(len-1)+tr[i])/len;o.push(p);}return o;}
const f=n=>n>=100?Math.round(n).toLocaleString('en-US'):n.toFixed(2);
async function tg(text){if(!TOKEN||!CHAT){console.log('[no telegram env] '+text);return;}
  const r=await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:CHAT,text})});
  const j=await r.json();if(!j.ok)console.log('TG error',j.description);}

const state=existsSync(STATE)?JSON.parse(readFileSync(STATE)):{};
const log=existsSync(LOG)?JSON.parse(readFileSync(LOG)):[];
const now=Date.now();
const today=new Date().toISOString().slice(0,10);
if(!state._meta || state._meta.date!==today) state._meta={date:today,opened:0}; // reset compteur quotidien

// PASS 1 : fetch + indicateurs + résoudre les trades ouverts (clôtures)
const data={};
for(const [sym,name,label,type] of INSTR){
  try{
    const b=await yahoo(sym);if(b.length<210)continue;
    let N=b.length-1;while(N>0 && b[N].t+3600_000>now) N--;
    if(N<205)continue;
    const c=b.map(x=>x.c);const e21=ema(c,21),e50=ema(c,50),e200=ema(c,200),r14=rsi(c,14),a14=atr(b,14);
    if(e200[N]==null||a14[N]==null)continue;
    data[name]={b,N,bar:b[N],pv:b[N-1],e21,e50,e200,r14,a14,type,label};
    // résoudre trade ouvert ?
    const pos=state[name];
    if(pos && pos.openTrade){
      let closed=null,exitPx=null;
      for(const x of b){ if(x.t<=pos.entryT) continue;
        if(pos.dir===1){ if(x.l<=pos.sl){closed='SL';exitPx=pos.sl;break;} if(x.h>=pos.tp){closed='TP';exitPx=pos.tp;break;} }
        else { if(x.h>=pos.sl){closed='SL';exitPx=pos.sl;break;} if(x.l<=pos.tp){closed='TP';exitPx=pos.tp;break;} }
      }
      if(closed){
        pos.openTrade=false;pos.outcome=closed;
        log.push({time:new Date().toISOString(),instrument:name,event:'CLOSE',outcome:closed,exitPx,resultR:closed==='TP'?3:-1});
        await tg(`${closed==='TP'?'✅':'❌'} Trade clôturé — ${label} (${name})\n\n${closed==='TP'?'🎯 Take Profit atteint (+3R)':'🛡️ Stop Loss touché (−1R)'}\nSortie : ${f(exitPx)}`);
      }
    }
  }catch(e){console.log(`${name}: ${e.message}`);}
}

// Positions encore ouvertes (après clôtures) -> contraintes de corrélation
let hasOpenIndex=false, hasOpenGold=false;
for(const [, name,, type] of INSTR){ if(state[name]?.openTrade){ if(type==='index')hasOpenIndex=true; if(type==='gold')hasOpenGold=true; } }

// PASS 2 : collecter les NOUVEAUX signaux (candidats)
const candidates=[];
for(const [, name,,] of INSTR){
  const d=data[name];if(!d)continue;
  if(state[name]?.openTrade)continue; // déjà en position
  const {bar,pv,e21,e50,e200,r14,a14,N,type,label}=d;
  const aL=bar.c>e50[N]&&e50[N]>e200[N], aS=bar.c<e50[N]&&e50[N]<e200[N];
  const sigL=aL&&pv.l<=e21[N-1]&&bar.c>bar.o&&bar.c>e21[N]&&r14[N]<70;
  const sigS=aS&&pv.h>=e21[N-1]&&bar.c<bar.o&&bar.c<e21[N]&&r14[N]>30;
  if((sigL||sigS) && bar.t!==state[name]?.lastSignalBar){
    const dir=sigL?1:-1;const entry=bar.c;const sl=entry-dir*3*a14[N];const risk=Math.abs(entry-sl);const tp=entry+dir*3*risk;
    const score=Math.abs(e50[N]-e200[N])/a14[N]; // force de tendance (séparation EMA / volatilité)
    candidates.push({name,label,type,dir,entry,sl,tp,risk,score,barT:bar.t});
  }
}

// PASS 3 : SÉLECTION des meilleurs, dans les règles
candidates.sort((a,b)=>b.score-a.score); // meilleurs en premier
const selected=[];
let allowIndex=!hasOpenIndex; // max 1 indice (en comptant ceux déjà ouverts)
let allowGold=!hasOpenGold;
let slots=MAX_PER_DAY - state._meta.opened; // max 2 nouveaux/jour
for(const cand of candidates){
  if(slots<=0)break;
  if(cand.type==='index'){ if(!allowIndex)continue; allowIndex=false; }
  if(cand.type==='gold'){ if(!allowGold)continue; allowGold=false; }
  selected.push(cand); slots--;
}

// PASS 4 : ouvrir + alerter
let alerts=0;
for(const cand of selected){
  const {name,label,dir,entry,sl,tp,risk,barT}=cand;
  const arrow=dir===1?'🟢 ACHAT (LONG)':'🔴 VENTE (SHORT)';
  const msg=`🚨 SIGNAL FTMO — ${label} (${name})\n\n${arrow}\n\n📍 Entrée : ${f(entry)}\n🛡️ Stop Loss : ${f(sl)}\n🎯 Take Profit : ${f(tp)}\n📏 Risque : ${RISK_PCT}% du capital (${f(risk)} pts)\n\n⚙️ Place un ordre + OCO sur FTMO. (1h trend-pullback)`;
  await tg(msg);
  state[name]={openTrade:true,dir,entry,entryT:barT,sl,tp,lastSignalBar:barT,openedAt:new Date().toISOString()};
  log.push({time:new Date(barT).toISOString(),instrument:name,event:'OPEN',dir:dir===1?'LONG':'SHORT',entry,sl,tp,risk});
  state._meta.opened++; alerts++;
  console.log(`ALERTE ${name} ${dir===1?'LONG':'SHORT'} @ ${f(entry)} (score ${cand.score.toFixed(2)})`);
}
// marquer les candidats non retenus (éviter de les ré-évaluer en boucle sur la même bougie)
for(const cand of candidates){ if(!selected.includes(cand)){ state[cand.name]={...(state[cand.name]||{}),lastSignalBar:cand.barT}; } }

writeFileSync(STATE,JSON.stringify(state,null,2));
writeFileSync(LOG,JSON.stringify(log,null,2));
console.log(`Run OK ${new Date().toISOString()} | candidats: ${candidates.length} | retenus: ${alerts} | ouverts aujourd'hui: ${state._meta.opened}/${MAX_PER_DAY}`);
