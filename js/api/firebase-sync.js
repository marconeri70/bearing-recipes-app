// v10: sincronizzazione conservativa, attivazione esplicita, storico immutabile.
import {db} from "./firebase-config.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {collection,doc,getDocsFromServer,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
const COLL="bearing_recipes_v10";
const FIELDS=["codice","irTipo","irDiametro","orTipo","diametroSfera","numeroSfere","gabbiaTipo","grassoTipo","schermoTipo","pesoMin","pesoMax","classeGioco","serieGioco","giocoMin","giocoMax","disegnoUrl","disegnoData"];
const NUM=new Set(["irDiametro","diametroSfera","numeroSfere","pesoMin","pesoMax","giocoMin","giocoMax"]);
const el=id=>document.getElementById(id), key=s=>String(s??"").trim().toLowerCase();
function recipe(r){
 const out={};
 for(const f of FIELDS){const v=r?.[f];if(NUM.has(f)){const n=v==null||v===""?NaN:Number(String(v).replace(",","."));out[f]=Number.isFinite(n)?n:null;}else out[f]=typeof v==="string"?v:"";}
 out.codice=out.codice.trim();out.serieGioco||="storica";
 const D=r?.orDiametro==null||String(r.orDiametro).trim()===""?NaN:Number(String(r.orDiametro).replace(",","."));
 if(Number.isFinite(D)&&D>0)out.orDiametro=D;
 return out;
}
const serial=r=>JSON.stringify(recipe(r));
async function hash(s){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,"0")).join("");}
function validate(r){
 if(!r.codice)throw Error("Codice mancante");
 if(r.disegnoUrl && !/^https:\/\//i.test(r.disegnoUrl))throw Error("URL disegno non HTTPS");
 if(r.disegnoData && !/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(r.disegnoData))throw Error("Formato disegno non supportato");
 if(new TextEncoder().encode(JSON.stringify(r)).length>850000)throw Error("Ricetta troppo grande per Firestore: conserva il backup JSON");
}
export function plan(local,remote,base,pending){
 if(remote?.deleted){
  if(!local)return "mark";
  if(base&&base.rev===remote.rev&&pending===local.hash)return "conflict";
  if(base&&base.hash===local.hash&&base.rev<remote.rev)return "pull-delete";
  return "conflict";
 }
 if(!remote){if(local)return base?"conflict":"push";return "none";}
 if(!local){
  if(pending&&pending===remote.hash)return "delete";
  if(pending)return "conflict";
  // Mancanza locale senza cancellazione esplicita: recupera, non cancella online.
  return "pull";
 }
 if(local.hash===remote.hash)return "mark";
 if(!base)return "conflict";
 if(base.rev===remote.rev&&base.hash===remote.hash)return "push";
 if(base.hash===local.hash&&base.rev<remote.rev)return "pull";
 return "conflict";
}
export function installSync({getLocal,replaceLocal,canApply,download}){
 const auth=getAuth();let user=null,enabled=false,busy=false,queued=false,meta={base:Object.create(null),deletes:Object.create(null)},conflicts=[],heads=new Map(),timer=null,deleting=0;
 const status=el("sync-status"),toggle=el("sync-toggle"),now=el("sync-now"),hist=el("sync-history"),badge=el("sync-badge"),confBox=el("sync-conflicts"),historyBox=el("sync-history-list");
 const metaKey=()=> "bearing_recipes_sync_v10_"+user.uid;
 function say(s,state="neutral"){status.textContent=s;badge.textContent=state==="ok"?"Cloud allineato":state==="error"?"Cloud da verificare":enabled?"Cloud attivo":"Solo locale";badge.dataset.state=state;}
 function store(){try{localStorage.setItem(metaKey(),JSON.stringify({...meta,enabled}));return true;}catch(e){enabled=false;toggle.checked=false;say("Impossibile salvare lo stato di sincronizzazione. Cloud sospeso; esporta un backup.","error");return false;}}
 function controls(){toggle.disabled=!user||busy;now.disabled=!user||!enabled||busy;hist.disabled=!user||busy;el("sync-export").disabled=!user||!heads.size;}
 function active(){return user&&enabled&&auth.currentUser?.uid===user.uid;}
 function localMap(){const m=new Map();for(const r of getLocal()){const k=key(r.codice);if(k){if(m.has(k))throw Error("Codici duplicati nel dispositivo: verifica l'archivio locale.");m.set(k,r);}}return m;}
 async function loadHeads(){
  const snap=await getDocsFromServer(collection(db,COLL)),m=new Map();
  snap.forEach(d=>{const v=d.data();if(typeof v.code==="string"&&Number.isInteger(v.rev)&&v.rev>0&&typeof v.hash==="string"&&v.recipe&&key(v.recipe.codice)===v.code){m.set(v.code,{...v,id:d.id});}else throw Error("Documento cloud non riconosciuto: "+d.id);});return m;
 }
 async function commit(k,r,deleted,expected){
  validate(r);const id=await hash(k),h=await hash(serial(r)),uid=user.uid;
  if(!active())throw Error("Sincronizzazione sospesa.");
  return runTransaction(db,async tx=>{
   const ref=doc(db,COLL,id),snap=await tx.get(ref),old=snap.exists()?snap.data():null;
   if((old?.rev??0)!==(expected?.rev??0)||(old?.hash??"")!==(expected?.hash??"")||!!old?.deleted!==!!expected?.deleted)throw Error("Versione cloud cambiata: riprova la sincronizzazione.");
   if(old&&old.hash===h&&!!old.deleted===deleted)return {...old,id};
   const v={code:k,recipe:r,hash:h,rev:(old?.rev??0)+1,deleted,ownerUid:uid,updatedAt:serverTimestamp(),schema:10};
   tx.set(doc(db,COLL,id,"history",String(v.rev)),v);
   tx.set(ref,v);
   return {...v,id};
  });
 }
 function mark(k,h,uid){if(!active()||user.uid!==uid)throw Error("Sessione modificata: sincronizzazione sospesa.");meta.base[k]={rev:h.rev,hash:h.hash,deleted:!!h.deleted};delete meta.deletes[k];if(!store())throw Error("Stato locale non salvato.");}
 function apply(k,remote,expected){
  if(!active()||!canApply()||deleting)return false;
  const current=localMap().get(k);
  if((current?serial(current):null)!==(expected?serial(expected):null))return false;
  return replaceLocal(k,remote.deleted?null:recipe(remote.recipe));
 }
 function showConflicts(){
  confBox.replaceChildren();
  for(const c of conflicts){
   const box=document.createElement("div");box.className="sync-conflict";
   const title=document.createElement("strong");title.textContent=c.local?.codice||c.remote?.recipe?.codice||c.k;
   const info=document.createElement("p");info.textContent="Versioni differenti. Nessuna sovrascrittura automatica. Salva un backup prima di scegliere.";
   box.append(title,info);
   if(c.local&&c.remote){
    for(const [label,mode] of [["Mantieni copia locale","local"],["Usa versione cloud","remote"]]){
     const b=document.createElement("button");b.type="button";b.className="btn btn-light";b.textContent=label;b.onclick=()=>resolve(c,mode);box.append(b);
    }
   }else if(c.remote){
    const b=document.createElement("button");b.type="button";b.className="btn btn-light";b.textContent="Ripristina versione cloud";b.onclick=()=>resolve(c,"remote");box.append(b);
   }
   confBox.append(box);
  }
 }
 async function resolve(c,mode){
  if(busy||!active()||!canApply())return;
  if(!confirm("Confermi la scelta per "+c.k+"? Le versioni precedenti restano nello storico cloud; esporta prima il backup locale."))return;
  busy=true;controls();const uid=user.uid;
  try{
   const m=await loadHeads(),r=m.get(c.k),l=localMap().get(c.k);
   if(!active()||user.uid!==uid)throw Error("Sessione modificata.");
   if(!r||r.rev!==c.remote.rev||r.hash!==c.remote.hash||(l?serial(l):null)!==(c.local?serial(c.local):null))throw Error("Le versioni sono cambiate: sincronizza di nuovo.");
   if(mode==="remote"){if(!apply(c.k,r,l))throw Error("Chiudi la scheda di modifica e riprova.");mark(c.k,r,uid);}
   else {const saved=await commit(c.k,recipe(l),false,r);mark(c.k,saved,uid);}
   say("Conflitto risolto. Aggiorna la sincronizzazione.","ok");
  }catch(e){say(String(e.message||e),"error");}finally{busy=false;controls();schedule();}
 }
 async function sync(){
  if(!active()||busy||deleting||!navigator.onLine||!canApply())return;
  busy=true;controls();conflicts=[];showConflicts();const uid=user.uid;
  try{
   heads=await loadHeads();if(!active()||user.uid!==uid)return;
   const keys=new Set([...heads.keys(),...localMap().keys(),...Object.keys(meta.deletes)]);
   let changed=0,issues=[];
   for(const k of keys){
    if(!active()||user.uid!==uid||!canApply()||deleting){queued=true;break;}
    try{
     const l=localMap().get(k),r=heads.get(k),p=meta.deletes[k];
     const lh=l?{hash:await hash(serial(l))}:null;
     if(!active()||user.uid!==uid||deleting||meta.deletes[k]!==p){queued=true;break;}
     const action=plan(lh,r,meta.base[k],p);
     if(action==="mark"){mark(k,r,uid);continue;}
     if(action==="push"){
      const saved=await commit(k,recipe(l),false,r);heads.set(k,saved);mark(k,saved,uid);changed++;
     }else if(action==="delete"){
      const saved=await commit(k,recipe(r.recipe),true,r);heads.set(k,saved);mark(k,saved,uid);changed++;
     }else if(action==="pull"||action==="pull-delete"){
      if(apply(k,r,l)){mark(k,r,uid);changed++;}else queued=true;
     }else if(action==="conflict"){conflicts.push({k,local:l,remote:r});}
     else if(!r&&!l&&p){delete meta.deletes[k];store();}
    }catch(e){issues.push(k+": "+String(e.message||e));}
   }
   showConflicts();
   say("Ultimo controllo "+new Date().toLocaleTimeString("it-IT")+" · "+heads.size+" versioni correnti · "+changed+" aggiornamenti · "+conflicts.length+" conflitti."+(issues.length?" Errori: "+issues.join(" | "):""),issues.length||conflicts.length?"error":"ok");
  }catch(e){say("Cloud non disponibile: "+(e.code==="permission-denied"?"regole Firestore v10 da pubblicare.":String(e.code||e.message||e)),"error");}
  finally{busy=false;controls();if(queued){queued=false;setTimeout(sync,1500);}}
 }
 function schedule(){if(!active())return;if(busy){queued=true;return;}clearTimeout(timer);timer=setTimeout(sync,500);}
 onAuthStateChanged(auth,u=>{
  user=u?.emailVerified?u:null;enabled=false;meta={base:Object.create(null),deletes:Object.create(null)};heads=new Map();conflicts=[];confBox.replaceChildren();historyBox.replaceChildren();
  if(user)try{const saved=JSON.parse(localStorage.getItem(metaKey())||"{}");meta={base:Object.assign(Object.create(null),saved.base||{}),deletes:Object.assign(Object.create(null),saved.deletes||{})};enabled=saved.enabled===true;}catch{}
  toggle.checked=enabled;controls();say(user?(enabled?"Sincronizzazione abilitata su questo dispositivo.":"Accesso effettuato. Attiva la sincronizzazione solo se autorizzato."):"Accedi con Google dal pannello Cloud.");
  if(active())schedule();
 });
 toggle.onchange=()=>{
  if(!user){toggle.checked=false;return;}
  if(toggle.checked&&!confirm("Attivare la sincronizzazione con Firebase su questo dispositivo? I dati tecnici saranno archiviati online. Conferma solo se autorizzato dall'azienda. Le raccolte originali non saranno modificate.")){toggle.checked=false;return;}
  enabled=toggle.checked;if(!store())return;controls();say(enabled?"Sincronizzazione attivata.":"Sincronizzazione sospesa.");if(enabled)schedule();
 };
 now.onclick=()=>sync();
 el("sync-export").onclick=()=>{
  if(!user||!heads.size)return;
  download(new Blob([JSON.stringify({formato:"bearing-recipes-backup",versione:10,ricette:[...heads.values()].filter(r=>!r.deleted).map(r=>r.recipe),versioniCorrenti:[...heads.values()]},null,2)],{type:"application/json"}),"backup-cloud-v10-"+new Date().toISOString().slice(0,10)+".json");
 };
 hist.onclick=async()=>{
  if(!user||busy)return;const k=key(el("sync-history-code").value);if(!k){say("Inserisci un codice per consultare lo storico.");return;}
  busy=true;controls();historyBox.replaceChildren();
  try{
   const id=await hash(k),s=await getDocsFromServer(collection(db,COLL,id,"history"));
   const records=s.docs.map(x=>x.data()).sort((a,b)=>b.rev-a.rev);
   if(!records.length)historyBox.textContent="Nessuna versione nello storico.";
   for(const v of records){
    const row=document.createElement("div");row.className="sync-conflict";
    const label=document.createElement("strong");label.textContent="Versione "+v.rev+" · "+(v.deleted?"Cestino":"Ricetta")+" · "+(v.updatedAt?.toDate?.().toLocaleString("it-IT")||"");
    const p=document.createElement("p");p.textContent=v.recipe.codice+" · "+(v.recipe.classeGioco||"")+" · "+(v.recipe.giocoMin??"–")+" / "+(v.recipe.giocoMax??"–")+" µm";
    const b=document.createElement("button");b.type="button";b.className="btn btn-light";b.textContent="Ripristina come nuova versione";b.disabled=!enabled;
    b.onclick=async()=>{
     if(busy||!active()||!canApply())return;
     if(!confirm("Ripristinare questa versione sul dispositivo e nel cloud? Le versioni precedenti restano nello storico."))return;
     busy=true;controls();const uid=user.uid;try{
      const m=await loadHeads(),current=m.get(k),l=localMap().get(k);
      if(!active()||user.uid!==uid)throw Error("Sessione modificata.");
      if(!current)throw Error("Ricetta cloud non trovata.");
      const saved=await commit(k,recipe(v.recipe),false,current);heads.set(k,saved);
      if(!active()||user.uid!==uid||!apply(k,saved,l))throw Error("Versione archiviata online; copia locale non aggiornata. Sincronizza di nuovo.");
      mark(k,saved,uid);say("Versione ripristinata.","ok");
     }catch(e){say("Ripristino: "+String(e.message||e),"error");}finally{busy=false;controls();}
    };
    row.append(label,p,b);historyBox.append(row);
   }
  }catch(e){say(String(e.code||e.message||e),"error");}finally{busy=false;controls();}
 };
 setInterval(()=>{if(active()&&document.visibilityState==="visible")schedule();},30000);
 window.addEventListener("online",schedule);
 return {changed:schedule,deleted:async r=>{
  if(!user||!enabled||!r)return;
  const uid=user.uid,k=key(r.codice);deleting++;
  try{const h=await hash(serial(r));if(!active()||user.uid!==uid)return;meta.deletes[k]=h;store();}finally{deleting--;schedule();}
 }};
}
