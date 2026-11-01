// ROBOT FTMO — 2 stratégies. Alertes Telegram sur bougie CLÔTURÉE uniquement.
// #1 TREND : trend-pullback 1h sur indices US + or. SL 3xATR, TP 3R. Cap 3 positions, max 3/jour.
// #2 MR-A : retour à la moyenne DAILY, indices seulement, LONG only (validée 25 ans, voir research/RESULTS.md).
//    Entrée close>SMA200 & RSI2<10. SL 3xATR (catastrophe). Sortie par ALERTE (close>SMA5 ou RSI2>65 ou 10 jours).
// Règle anti-conflit : jamais 2 positions (trend + MR) sur le même instrument en même temps.
// + Heartbeat quotidien, alerte panne, et TAILLE DE POSITION dans chaque alerte.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// ====== RÉGLAGES (modifie ici si besoin) ======
const RISK_PCT = 1.0;        // % de risque par trade
const MAX_CONCURRENT = 3;    // max positions ouvertes en meme temps (cap 3)
const MAX_PER_DAY = 3;       // max nouveaux trades par jour
const ACCOUNT_SIZE = 100000; // <-- METS ICI LA TAILLE DE TON COMPTE FTMO ($) pour le calcul de lots
const HEARTBEAT_HOUR_UTC = 18; // heure UTC du message quotidien (18 UTC = 20h Paris en été)
// Taille du contrat par instrument (valeur en $ par 1 point de mouvement, par lot) — LU SUR TON BROKER.
// Ajoute US100 / US500 ici quand tu auras confirmé leur "Contract size" sur MT5.
const CONTRACT = { XAUUSD: 100, US30: 1, US100: 1, US500: 1 };
// ===============================================

const INSTR=[['^GSPC','US500','S&P 500','index'],['^NDX','US100','Nasdaq 100','index'],['^DJI','US30','Dow Jones','index'],['GC=F','XAUUSD','Or','gold']];
const MR_INSTR=[['^GSPC','US500','S&P 500'],['^NDX','US100','Nasdaq 100'],['^DJI','US30','Dow Jones']]; // stratégie #2 : indices seulement
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

// --- TAILLE DE POSITION : combien risquer pour 1% ---
function sizeText(entry,sl,name){
  const slPts=Math.abs(entry-sl);
  const riskAmount=ACCOUNT_SIZE*RISK_PCT/100;
  const cs=CONTRACT[name];
  let lotLine;
  if(cs){const lots=riskAmount/(slPts*cs);lotLine=`\n→ 📏 LOTS À METTRE : ~${lots.toFixed(2)}`;}
  else lotLine=`\n→ 📏 LOTS : passe par un calculateur (PropRisk.co) — taille de contrat pas encore confirmée pour cet instrument`;
  return `\n💰 TAILLE — risque ${RISK_PCT}% = ${f(riskAmount)}$ (compte ${f(ACCOUNT_SIZE)}$)\n→ Distance SL : ${slPts.toFixed(0)} points${lotLine}\n⚠️ Vise toujours ${RISK_PCT}% de risque en $ (jamais "par points").`;
}

const state=existsSync(STATE)?JSON.parse(readFileSync(STATE)):{};
const log=existsSync(LOG)?JSON.parse(readFileSync(LOG)):[];
const now=Date.now();
const today=new Date().toISOString().slice(0,10);
if(!state._meta) state._meta={date:today,opened:0};
if(state._meta.date!==today){state._meta.date=today;state._meta.opened=0;}

// --- PASS 0 : COMMANDES TELEGRAM (close / status / help) ---
if(TOKEN && CHAT){
  try{
    const ru=await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${(state._meta.lastUpdateId||0)+1}&timeout=0`);
    const ju=await ru.json();
    if(ju.ok) for(const upd of ju.result){
      state._meta.lastUpdateId=upd.update_id;
      const m=upd.message; if(!m||!m.text||String(m.chat.id)!==String(CHAT))continue;
      const t=m.text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
      const ALIAS={XAUUSD:['or','gold','xau'],US500:['us500','sp500','s&p','snp'],US100:['us100','nasdaq','ndx'],US30:['us30','dow']};
      if(/(close|clotur|ferme)/.test(t)){
        let target=null;for(const[nm,al]of Object.entries(ALIAS)){if(al.some(a=>t.includes(a))){target=nm;break;}}
        if(!target) await tg('Instrument non reconnu. Ex: "close or", "close us30", "close nasdaq", "close us500".');
        else if(state[target]?.openTrade){
          let outcome='MANUAL',resR=0;
          if(/\b(tp|win|gagn|gain)\b/.test(t)){outcome='TP';resR=3;}
          else if(/\b(sl|loss|perd|perte)\b/.test(t)){outcome='SL';resR=-1;}
          state[target].openTrade=false;state[target].outcome=outcome;
          log.push({time:new Date().toISOString(),instrument:target,event:'CLOSE',outcome,resultR:resR,manual:true});
          await tg(`✅ ${target} cloture manuellement (${outcome==='TP'?'+3R':outcome==='SL'?'-1R':'resultat non precise'}). Place liberee — le robot peut reprendre un signal dessus.`);
        }
        else if(state['MR_'+target]?.openTrade){
          const p=state['MR_'+target];const resR=+(((p.lastC??p.entry)-p.entry)/p.riskDist).toFixed(2);
          p.openTrade=false;p.outcome='MANUAL';
          log.push({time:new Date().toISOString(),strategy:'MR',instrument:target,event:'CLOSE',outcome:'MANUAL',resultR:resR,manual:true});
          await tg(`✅ Position MR ${target} cloturee manuellement (~${resR}R au dernier cours connu). Place liberee.`);
        }
        else await tg(`Info: ${target} n a aucun trade ouvert sur le robot.`);
      } else if(/(status|etat|position)/.test(t)){
        const op=[];for(const[,nm,lb]of INSTR){if(state[nm]?.openTrade)op.push(`- ${lb} (${nm}) ${state[nm].dir===1?'LONG':'SHORT'} [trend]`);}
        for(const[,nm,lb]of MR_INSTR){if(state['MR_'+nm]?.openTrade)op.push(`- ${lb} (${nm}) LONG [MR — sortie par alerte]`);}
        await tg(`Positions ouvertes:\n${op.length?op.join('\n'):'Aucune.'}`);
      } else if(/(help|aide|start|commande)/.test(t)){
        await tg('Commandes:\n- "close or tp" : cloture or en gain (+3R) et libere la place\n- "close us30 sl" : cloture en perte\n- "close nasdaq" : cloture sans preciser\n- "status" : positions ouvertes\n\n2 strategies actives: [trend] 1h (TP/SL fixes) et [MR] daily (achat rebond, sortie par alerte "VENDS maintenant").');
      }
    }
  }catch(e){console.log('cmd err',e.message);}
}

// PASS 1 : fetch + indicateurs + résoudre les trades ouverts (clôtures)
const data={};let okCount=0;
for(const [sym,name,label,type] of INSTR){
  try{
    const b=await yahoo(sym);if(b.length<210)continue;okCount++;
    let N=b.length-1;while(N>0 && b[N].t+3600_000>now) N--;
    if(N<205)continue;
    const c=b.map(x=>x.c);const e21=ema(c,21),e50=ema(c,50),e200=ema(c,200),r14=rsi(c,14),a14=atr(b,14);
    if(e200[N]==null||a14[N]==null)continue;
    data[name]={b,N,bar:b[N],pv:b[N-1],e21,e50,e200,r14,a14,type,label};
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

// --- ALERTE PANNE / RÉTABLISSEMENT (données) ---
if(okCount===0){
  if(!state._meta.dataFail){state._meta.dataFail=true;await tg(`⚠️ ALERTE ROBOT — problème de données\n\nLe robot n'a pas pu récupérer les prix (source Yahoo). La surveillance est en pause. Il réessaie automatiquement toutes les 15 min.`);}
  writeFileSync(STATE,JSON.stringify(state,null,2));writeFileSync(LOG,JSON.stringify(log,null,2));
  console.log('DATA FAIL — alerte envoyee, arret du run');
  process.exit(0);
} else if(state._meta.dataFail){state._meta.dataFail=false;await tg(`✅ Robot rétabli — récupération des données OK, surveillance reprise.`);}

// Positions ouvertes après clôtures -> compteur pour le cap simultané (cap 3)
let openCount=0;
for(const [, name,,] of INSTR){ if(state[name]?.openTrade) openCount++; }

// PASS 2 : collecter les NOUVEAUX signaux
const candidates=[];
for(const [, name,,] of INSTR){
  const d=data[name];if(!d)continue;
  if(state[name]?.openTrade)continue;
  if(state['MR_'+name]?.openTrade)continue;
  const {bar,pv,e21,e50,e200,r14,a14,N,type,label}=d;
  const aL=bar.c>e50[N]&&e50[N]>e200[N], aS=bar.c<e50[N]&&e50[N]<e200[N];
  const sigL=aL&&pv.l<=e21[N-1]&&bar.c>bar.o&&bar.c>e21[N]&&r14[N]<70;
  const sigS=aS&&pv.h>=e21[N-1]&&bar.c<bar.o&&bar.c<e21[N]&&r14[N]>30;
  if((sigL||sigS) && bar.t!==state[name]?.lastSignalBar){
    const dir=sigL?1:-1;const entry=bar.c;const sl=entry-dir*3*a14[N];const risk=Math.abs(entry-sl);const tp=entry+dir*3*risk;
    const score=Math.abs(e50[N]-e200[N])/a14[N];
    candidates.push({name,label,type,dir,entry,sl,tp,risk,score,barT:bar.t});
  }
}

// PASS 3 : SÉLECTION
candidates.sort((a,b)=>b.score-a.score);
const selected=[];let concurrentSlots=MAX_CONCURRENT-openCount;let daySlots=MAX_PER_DAY-state._meta.opened;
for(const cand of candidates){if(concurrentSlots<=0||daySlots<=0)break;selected.push(cand);concurrentSlots--;daySlots--;}

// PASS 4 : ouvrir + alerter (AVEC taille de position)
let alerts=0;
for(const cand of selected){
  const {name,label,dir,entry,sl,tp,risk,barT}=cand;
  const arrow=dir===1?'🟢 ACHAT (LONG)':'🔴 VENTE (SHORT)';
  const msg=`🚨 SIGNAL FTMO — ${label} (${name})\n\n${arrow}\n\n📍 Entrée : ${f(entry)}\n🛡️ Stop Loss : ${f(sl)}\n🎯 Take Profit : ${f(tp)}${sizeText(entry,sl,cand.name)}\n\n⚙️ Place un ordre + OCO sur FTMO. (1h trend-pullback)`;
  await tg(msg);
  state[name]={openTrade:true,dir,entry,entryT:barT,sl,tp,lastSignalBar:barT,openedAt:new Date().toISOString()};
  log.push({time:new Date(barT).toISOString(),instrument:name,event:'OPEN',dir:dir===1?'LONG':'SHORT',entry,sl,tp,risk});
  state._meta.opened++;alerts++;
  console.log(`ALERTE ${name} ${dir===1?'LONG':'SHORT'} @ ${f(entry)}`);
}
for(const cand of candidates){ if(!selected.includes(cand)){ state[cand.name]={...(state[cand.name]||{}),lastSignalBar:cand.barT}; } }

// ====== STRATÉGIE #2 : MR-A (retour à la moyenne, daily, indices, LONG only) ======
// Une bougie daily Yahoo a t = ouverture US (13:30/14:30 UTC) -> clôturée quand now >= t+7h (~30 min après la clôture US).
function smaArr(v,len){const o=[];let s=0;for(let i=0;i<v.length;i++){s+=v[i];if(i>=len)s-=v[i-len];o.push(i>=len-1?s/len:null);}return o;}
async function yahooD(sym){const p2=Math.floor(Date.now()/1000),p1=p2-500*86400;
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=${p1}&period2=${p2}`;
  const j=await(await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}})).json();const r=j.chart.result[0];const ts=r.timestamp||[];const q=r.indicators.quote[0];
  const b=[];for(let i=0;i<ts.length;i++){if(q.open[i]==null||q.high[i]==null||q.low[i]==null||q.close[i]==null)continue;b.push({t:ts[i]*1000,o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i]});}return b;}
for(const [sym,name,label] of MR_INSTR){
  const key='MR_'+name;
  try{
    const b=await yahooD(sym);if(b.length<210)continue;
    let N=b.length-1;while(N>0&&b[N].t+7*3600_000>now)N--;
    if(N<205)continue;
    const c=b.map(x=>x.c);const s200=smaArr(c,200),s5=smaArr(c,5),r2=rsi(c,2),a14d=atr(b,14);
    if(s200[N]==null||a14d[N]==null||r2[N]==null)continue;
    const pos=state[key];
    if(pos&&pos.openTrade){
      pos.lastC=b[N].c;
      let hit=null;
      for(const x of b){if(x.t<=pos.entryT)continue;if(x.o<=pos.sl){hit=x.o;break;}if(x.l<=pos.sl){hit=pos.sl;break;}}
      if(hit!==null){
        const resR=+(((hit-pos.entry)/pos.riskDist)).toFixed(2);
        pos.openTrade=false;pos.outcome='SL';
        log.push({time:new Date().toISOString(),strategy:'MR',instrument:name,event:'CLOSE',outcome:'SL',exitPx:hit,resultR:resR});
        await tg(`❌ Stop MR touché — ${label} (${name})\n\nSortie : ${f(hit)} (${resR}R)\nTon Stop Loss sur MT5 a dû fermer la position. Rien à faire si c'est le cas.`);
      } else if(b[N].t>pos.entryT){
        let held=0;for(const x of b){if(x.t>pos.entryT&&x.t<=b[N].t)held++;}
        if(b[N].c>s5[N]||r2[N]>65||held>=10){
          const resR=+(((b[N].c-pos.entry)/pos.riskDist)).toFixed(2);
          pos.openTrade=false;pos.outcome='EXIT';
          log.push({time:new Date().toISOString(),strategy:'MR',instrument:name,event:'CLOSE',outcome:'EXIT',exitPx:b[N].c,resultR:resR});
          const usd=Math.round(Math.abs(resR)*ACCOUNT_SIZE*RISK_PCT/100).toLocaleString('en-US');
          await tg(`🔔 SORTIE MR — ${label} (${name})\n\n➡️ VENDS ta position AU MARCHÉ maintenant (et retire le SL).\n\nEntrée ${f(pos.entry)} → sortie ~${f(b[N].c)} : ${resR>=0?'+':'−'}${Math.abs(resR)}R (${resR>=0?'+':'−'}${usd}$)\n\n(Rebond fait — la stratégie MR sort à la clôture US, après ${held} jour${held>1?'s':''}.)`);
        }
      }
    } else {
      if(state[name]?.openTrade)continue;
      const sig=b[N].c>s200[N]&&r2[N]<10;
      if(sig&&b[N].t!==(state[key]?.lastSignalBar)){
        const entry=b[N].c,riskDist=3*a14d[N],sl=entry-riskDist;
        state[key]={openTrade:true,dir:1,entry,entryT:b[N].t,riskDist,sl,lastSignalBar:b[N].t,lastC:entry,openedAt:new Date().toISOString()};
        log.push({time:new Date(b[N].t).toISOString(),strategy:'MR',instrument:name,event:'OPEN',dir:'LONG',entry,sl,risk:riskDist});
        alerts++;
        await tg(`🔵 SIGNAL MR (achat du rebond) — ${label} (${name})\n\n🟢 ACHAT (LONG)\n\n📍 Entrée : ${f(entry)}\n🛡️ Stop Loss : ${f(sl)} (à placer sur MT5)\n🎯 PAS de Take Profit — je t'enverrai l'alerte de sortie (souvent 1 à 4 jours)${sizeText(entry,sl,name)}\n\n⚙️ Stratégie n°2 (MR-A : retour à la moyenne, daily). Place l'ordre + SL, PAS de TP.`);
        console.log(`ALERTE MR ${name} LONG @ ${f(entry)}`);
      }
    }
  }catch(e){console.log(`MR ${name}: ${e.message}`);}
}

// --- HEARTBEAT QUOTIDIEN (1x/jour, ~20h Paris) ---
if(new Date().getUTCHours()>=HEARTBEAT_HOUR_UTC && state._meta.lastHB!==today){
  state._meta.lastHB=today;
  const opens=[];for(const [,name,label] of INSTR){if(state[name]?.openTrade)opens.push(`• ${label} (${name}) ${state[name].dir===1?'LONG':'SHORT'} [trend]`);}
  for(const [,name,label] of MR_INSTR){if(state['MR_'+name]?.openTrade)opens.push(`• ${label} (${name}) LONG [MR]`);}
  const oTxt=opens.length?opens.join('\n'):'Aucune position ouverte.';
  await tg(`🤖 Robot FTMO — point quotidien\n\n✅ En ligne et opérationnel.\n\nPositions ouvertes :\n${oTxt}\n\n${alerts?'':'Pas de nouveau signal pour le moment — normal (~2-3 trades/semaine). Patience. 💪'}`);
}

writeFileSync(STATE,JSON.stringify(state,null,2));
writeFileSync(LOG,JSON.stringify(log,null,2));
console.log(`Run OK ${new Date().toISOString()} | nouveaux signaux: ${alerts} | ouverts aujourd'hui: ${state._meta.opened}/${MAX_PER_DAY}`);
