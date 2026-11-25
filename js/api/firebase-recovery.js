// v9: accesso Google, recupero non distruttivo e archivio versionato opzionale.
import { db } from "./firebase-config.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocsFromServer, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
const LEGACY = ["ricette_lavorazione", "ricette_lavorazioni"];
const ARCHIVE = "bearing_recipes_v9";
const FIELDS = ["codice","irTipo","irDiametro","orTipo","diametroSfera","numeroSfere","gabbiaTipo","grassoTipo","schermoTipo","pesoMin","pesoMax","classeGioco","serieGioco","giocoMin","giocoMax","disegnoUrl","disegnoData"];
const NUMBERS = new Set(["irDiametro","diametroSfera","numeroSfere","pesoMin","pesoMax","giocoMin","giocoMax"]);
const byId = id => document.getElementById(id);
const codeKey = value => String(value ?? "").trim().toLowerCase();

function normalized(raw) {
  const r = {};
  for (const field of FIELDS) {
    const v = raw[field];
    if (NUMBERS.has(field)) {
      const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN);
      r[field] = Number.isFinite(n) ? n : null;
    } else r[field] = typeof v === "string" ? v : "";
  }
  r.codice = r.codice.trim();
  r.serieGioco ||= "storica";
  // Non eseguire URL arbitrari o formati di immagine attivi.
  try { if (new URL(r.disegnoUrl).protocol !== "https:") r.disegnoUrl = ""; } catch { r.disegnoUrl = ""; }
  if (!/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(r.disegnoData)) r.disegnoData = "";
  return r;
}
function fingerprint(r) { return JSON.stringify(normalized(r)); }
async function hash(value) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2,"0")).join("");
}
function errText(e) {
  const errors = {"auth/popup-blocked":"Popup bloccato: apri l'app in Chrome e consenti i popup.","auth/popup-closed-by-user":"Accesso annullato.","auth/unauthorized-domain":"Dominio non autorizzato in Firebase Authentication.","auth/operation-not-allowed":"Provider Google non ancora attivo.","permission-denied":"Accesso negato da Firestore: verifica regole pubblicate e account autorizzato."};
  return errors[e?.code] || String(e?.code || e?.message || "Errore sconosciuto");
}
export async function installFirebasePanel({getLocal, importSelected, download}) {
  const auth = getAuth();
  let busy=false, rows=[], failures=[], generation=0;
  const panel=byId("firebase-panel"), status=byId("firebase-status"), list=byId("firebase-records");
  const login=byId("firebase-login"), logout=byId("firebase-logout"), read=byId("firebase-read"), readArchive=byId("firebase-read-archive"), push=byId("firebase-push"), backup=byId("firebase-backup"), apply=byId("firebase-import-selected");
  if (!panel || !status || !list) return;
  function allowed() { return !!auth.currentUser?.emailVerified; }
  function selected() { return rows.filter((r,i)=>byId("firebase-row-"+i)?.checked && r.valid); }
  function controls() {
    login.disabled=busy || !!auth.currentUser; logout.disabled=busy || !auth.currentUser;
    for (const el of [read,readArchive,push]) el.disabled=busy || !allowed();
    backup.disabled=busy || !allowed() || rows.length===0;
    apply.disabled=busy || !allowed() || selected().length===0;
  }
  function say(s){ status.textContent=s; }
  function render() {
    list.replaceChildren();
    const local=getLocal();
    const localCodes=new Set(local.map(r=>codeKey(r.codice)));
    const groups=new Map();
    for(const r of rows) if(r.valid) groups.set(codeKey(r.recipe.codice),(groups.get(codeKey(r.recipe.codice))||0)+1);
    rows.forEach((r,i)=>{
      const item=document.createElement("label"); item.className="firebase-row";
      const box=document.createElement("input"); box.type="checkbox"; box.id="firebase-row-"+i;
      box.disabled=!r.valid || localCodes.has(codeKey(r.recipe.codice));
      box.checked=!box.disabled && groups.get(codeKey(r.recipe.codice))===1;
      box.addEventListener("change",()=> {
        if(box.checked) rows.forEach((other,j)=>{if(j!==i && codeKey(other.recipe.codice)===codeKey(r.recipe.codice)){const c=byId("firebase-row-"+j);if(c)c.checked=false;}});
        controls();
      });
      const text=document.createElement("span");
      const title=document.createElement("strong");title.textContent=r.recipe.codice || "(codice mancante)";
      const detail=document.createElement("small");
      const parts=[r.source, "ID "+r.docId, r.recipe.classeGioco, r.recipe.giocoMin!=null&&r.recipe.giocoMax!=null?r.recipe.giocoMin+"–"+r.recipe.giocoMax+" µm":"",r.recipe.disegnoUrl||r.recipe.disegnoData?"disegno presente":"",!r.valid?"Non importabile":localCodes.has(codeKey(r.recipe.codice))?"Già sul dispositivo: non sovrascritta":groups.get(codeKey(r.recipe.codice))>1?"Più versioni: scegli una sola":""]; 
      detail.textContent=parts.filter(Boolean).join(" · ");
      text.append(title,detail);item.append(box,text);list.append(item);
    });
    controls();
  }
  function clear(){generation++;rows=[];failures=[];list.replaceChildren();controls();}
  try { await setPersistence(auth,browserSessionPersistence); } catch(e) { say("Persistenza sessione non disponibile: "+errText(e)); throw e; }
  onAuthStateChanged(auth,u=>{
    clear();
    say(u ? (u.emailVerified?"Accesso Google effettuato. Premi Recupera originali.":"Email non verificata: accesso agli archivi non consentito.") : "Accedi con Google per recuperare gli archivi. Nessun dato inviato senza un comando esplicito.");
  });
  async function run(task){
    if(busy)return;busy=true;controls();
    try{await task();}catch(e){say(errText(e));}
    finally{busy=false;controls();}
  }
  login.addEventListener("click",()=>run(async()=>{
    const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});
    await signInWithPopup(auth,provider);
  }));
  logout.addEventListener("click",()=>run(async()=>{await signOut(auth);clear();say("Disconnesso. Le copie importate sul dispositivo restano disponibili.");}));
  async function fetchSources(sources) {
    if(!allowed())throw Error("Accedi prima con Google.");
    const uid=auth.currentUser.uid, g=++generation;
    say("Lettura dal server Firebase...");
    rows=[];failures=[];list.replaceChildren();
    const outcomes=await Promise.allSettled(sources.map(s=>getDocsFromServer(collection(db,s))));
    if(auth.currentUser?.uid!==uid || generation!==g)return;
    for(let i=0;i<outcomes.length;i++){
      const o=outcomes[i],source=sources[i];
      if(o.status==="rejected"){failures.push(source+": "+errText(o.reason));continue;}
      o.value.forEach(d=>{
        const raw=d.data(), recipe=normalized(source===ARCHIVE?(raw.recipe||{}):raw);
        rows.push({source,docId:d.id,raw,recipe,valid:!!recipe.codice});
      });
    }
    rows.sort((a,b)=>a.recipe.codice.localeCompare(b.recipe.codice)||a.source.localeCompare(b.source)||a.docId.localeCompare(b.docId));
    render();
    say(rows.length+" documenti letti. "+(failures.length?"Lettura parziale: "+failures.join(" | "):"Lettura completata.")+" Scarica il backup prima di importare. I codici duplicati richiedono una scelta.");
  }
  read.addEventListener("click",()=>run(()=>fetchSources(LEGACY)));
  readArchive.addEventListener("click",()=>run(()=>fetchSources([ARCHIVE])));
  backup.addEventListener("click",()=>{
    if(!allowed()||!rows.length)return;
    const data={formato:"bearing-recipes-backup",versione:9,creatoIl:new Date().toISOString(),ricette:rows.filter(r=>r.valid).map(r=>({...r.recipe,id:r.docId})),originali:rows.map(r=>({raccolta:r.source,id:r.docId,dati:r.raw})),letturaParziale:failures};
    download(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),"backup-firebase-ricette-"+new Date().toISOString().slice(0,10)+".json");
  });
  apply.addEventListener("click",()=>{
    if(!allowed())return;
    const items=selected();
    if(!items.length)return;
    if(!confirm("Importare "+items.length+" ricette selezionate nella memoria del dispositivo? Gli archivi Firebase e le ricette locali già presenti non verranno modificati."))return;
    importSelected(items.map(r=>r.recipe));render();say("Importazione richiesta. Controlla il messaggio di esito e l'elenco locale.");
  });
  push.addEventListener("click",()=>run(async()=>{
    if(!allowed())throw Error("Accedi prima con Google.");
    const uid=auth.currentUser.uid;
    const records=getLocal().map(normalized).filter(r=>r.codice);
    if(!records.length){say("Nessuna ricetta locale da archiviare.");return;}
    if(!confirm("Archiviare online "+records.length+" ricette come versioni immutabili? Prosegui solo se sei autorizzato a conservare questi dati aziendali su Firebase. Nessuna ricetta originale verrà modificata."))return;
    let added=0,existing=0,skipped=0;
    const errors=[];
    for(const recipe of records){
      if(auth.currentUser?.uid!==uid)break;
      const value=fingerprint(recipe);
      // Firestore: limite di documento 1 MiB; margine per metadati.
      if(new TextEncoder().encode(value).length>850000){skipped++;continue;}
      const id=await hash(value);
      try{
        const result=await runTransaction(db,async tx=>{
          const ref=doc(db,ARCHIVE,id), old=await tx.get(ref);
          if(old.exists())return false;
          tx.set(ref,{recipe,ownerUid:uid,createdAt:new Date().toISOString(),schema:9});
          return true;
        });
        if(result)added++;else existing++;
      }catch(e){errors.push(recipe.codice+": "+errText(e));}
    }
    say("Archivio online: "+added+" nuove versioni, "+existing+" già presenti, "+skipped+" troppo grandi. "+(errors.length?"Errori: "+errors.join(" | "):"Nessuna ricetta originale sovrascritta."));
  }));
  controls();
}
