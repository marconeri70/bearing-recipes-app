const API="https://skf-ricette-api.vocidicassino.workers.dev";
const LOCAL="bearing_recipes_lavorazioni_v2";
const $=id=>document.getElementById(id);
const code=r=>String(r?.codice??"").trim().toLowerCase();
const keyPattern=/^drawings\/[a-f0-9-]{36}\.(jpg|png|webp)$/;
let token="",connected=false,busy=false,local=[],remote=[],raw=null,viewUrl=null;
function element(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
function status(text,error=false){$("status").textContent=text;$("status").dataset.error=String(error);}
function download(obj,name){const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:"application/json"}));const a=element("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);}
function filename(){return new Date().toISOString().slice(0,10);}
function readLocal(){
 try{raw=localStorage.getItem(LOCAL);const p=JSON.parse(raw??"[]");if(!Array.isArray(p))throw Error("Formato locale non riconosciuto.");local=p;
 $("local-status").textContent=local.length+" ricette individuate nella memoria di questa app.";}
 catch(e){local=[];$("local-status").textContent="Lettura non riuscita: "+e.message;}
 $("local-count").textContent=local.length;$("local-backup").disabled=raw===null;
}
async function request(path,opts={}){
 if(!token)throw Error("Collega prima l'archivio.");
 const r=await fetch(API+path,{...opts,headers:{"Authorization":"Bearer "+token,...opts.headers},cache:"no-store",credentials:"omit",redirect:"error",referrerPolicy:"no-referrer"});
 if(!r.ok){let msg="HTTP "+r.status;try{msg=(await r.json()).error||msg;}catch{}throw Error(msg);}
 return r;
}
async function json(path,opts){return (await request(path,opts)).json();}
async function loadRemote(){
 let items=[],after="",seen=new Set();
 for(let i=0;i<100;i++){
  const data=await json("/api/recipes?after="+encodeURIComponent(after));
  if(!Array.isArray(data.items))throw Error("Risposta archivio non valida.");
  items.push(...data.items);
  if(!data.next){remote=items;return;}
  if(seen.has(data.next))throw Error("Paginazione ripetuta.");seen.add(data.next);after=data.next;
 }
 throw Error("Archivio troppo grande per questa procedura.");
}
function syncControls(){
 $("login").disabled=busy||connected;$("key").disabled=busy||connected;
 $("logout").disabled=busy||!connected;$("refresh").disabled=busy||!connected;$("cloud-backup").disabled=busy||!connected;
 document.querySelectorAll("[data-action]").forEach(b=>{b.disabled=busy||!connected||b.dataset.blocked==="true";});
}
function button(text,fn,blocked=false){const b=element("button",text);b.type="button";b.dataset.action="1";b.dataset.blocked=String(blocked);b.onclick=fn;return b;}
function photoClear(){if(viewUrl)URL.revokeObjectURL(viewUrl);viewUrl=null;$("photo-view").replaceChildren();}
function render(){
 $("remote-count").textContent=connected?remote.filter(r=>!r.deleted).length:"—";
 const localList=$("locals"),remoteList=$("remotes");localList.replaceChildren();remoteList.replaceChildren();
 if(!local.length)localList.append(element("p","Nessuna ricetta locale disponibile."));
 for(const recipe of local){
  if(!recipe||typeof recipe!=="object")continue;
  const c=code(recipe),existing=remote.find(r=>r.code===c),box=element("article");
  box.append(element("strong",recipe.codice||"Senza codice"),element("small","IR "+(recipe.irDiametro??"—")+" mm · OR "+(recipe.orDiametro??"—")+" mm · "+(recipe.classeGioco||"—")));
  if(existing){box.append(element("p",existing.deleted?"Codice presente nello storico cloud: trasferimento bloccato.":"Codice già presente nel cloud. Confronta i dati: nessuna sovrascrittura."));localList.append(box);continue;}
  const legacyData=recipe.disegnoData||recipe.imageData||"",legacyUrl=recipe.disegnoUrl||recipe.imageUrl||"",oldPrivate=recipe.disegnoStoragePath||recipe.disegnoR2Key;
  const file=element("input");file.type="file";file.accept="image/jpeg,image/png,image/webp";file.setAttribute("aria-label","File disegno originale per "+recipe.codice);
  box.append(element("small",legacyData?"Disegno incorporato: verrà trasferito in R2 se valido.":legacyUrl?"Disegno collegato: seleziona il file originale per trasferirlo.":oldPrivate?"Riferimento privato esistente: seleziona il file originale.":"Nessun disegno registrato. Puoi allegarne uno."),file);
  const retain=element("input");retain.type="checkbox";const label=element("label");label.append(retain,document.createTextNode(" Mantieni solo il vecchio link esterno (non è una copia in R2)"));
  if(legacyUrl&&!legacyData&&!oldPrivate)box.append(label);
  const b=button("Trasferisci questa ricetta",()=>transfer(recipe,file.files[0],retain.checked),!c);
  box.append(b);localList.append(box);
 }
 if(connected&&!remote.length)remoteList.append(element("p","Archivio Cloudflare vuoto."));
 for(const row of remote){
  const r=row.recipe||{},box=element("article");box.append(element("strong",r.codice||row.code),element("small","Versione "+row.revision+(row.deleted?" · eliminata":" · attiva")),element("p","IR "+(r.irDiametro??"—")+" mm · OR "+(r.orDiametro??"—")+" mm · "+(r.classeGioco||"—")));
  if(keyPattern.test(r.disegnoR2Key||""))box.append(button("Apri foto privata",()=>showPhoto(r)));
  else box.append(element("small",r.disegnoUrl?"Solo collegamento esterno: foto non archiviata in R2.":"Nessun disegno R2."));
  const detail=element("details"),summary=element("summary","Dati tecnici");detail.append(summary);
  for(const [k,v] of Object.entries(r)){if(k==="disegnoUrl"||k==="disegnoR2Key")continue;detail.append(element("p",k+": "+String(v)));}
  box.append(detail);remoteList.append(box);
 }
 syncControls();
}
async function action(fn){if(busy)return;busy=true;syncControls();try{await fn();}catch(e){status(e.message||String(e),true);}finally{busy=false;syncControls();}}
async function showPhoto(r){await action(async()=>{photoClear();const response=await request("/api/photos?key="+encodeURIComponent(r.disegnoR2Key));const blob=await response.blob();if(!/^image\/(jpeg|png|webp)$/.test(blob.type))throw Error("Formato foto non valido.");viewUrl=URL.createObjectURL(blob);const img=element("img");img.src=viewUrl;img.alt="Disegno "+r.codice;const close=button("Chiudi foto",photoClear);$("photo-view").append(element("h2",r.codice),img,close);$("photo-view").scrollIntoView({block:"start"});status("Disegno privato visualizzato.");});}
async function upload(blob){if(!blob||!/^image\/(jpeg|png|webp)$/.test(blob.type)||blob.size===0||blob.size>8*1024*1024)throw Error("Foto non valida: JPG, PNG o WebP fino a 8 MB.");const out=await json("/api/photos",{method:"POST",headers:{"Content-Type":blob.type},body:blob});if(!keyPattern.test(out.key||""))throw Error("Riferimento R2 non valido.");const check=await request("/api/photos?key="+encodeURIComponent(out.key));const copy=await check.blob();if(copy.size!==blob.size||copy.type!==blob.type)throw Error("Verifica foto non riuscita. Ricetta non trasferita.");const hash=async b=>new Uint8Array(await crypto.subtle.digest("SHA-256",await b.arrayBuffer()));const a=await hash(blob),b=await hash(copy);if(a.some((v,i)=>v!==b[i]))throw Error("Verifica integrità foto fallita.");return out.key;}
const fields=["codice","irTipo","irDiametro","orTipo","orDiametro","diametroSfera","numeroSfere","gabbiaTipo","grassoTipo","schermoTipo","pesoMin","pesoMax","classeGioco","serieGioco","giocoMin","giocoMax"];
async function transfer(r,file,retain){
 if(!connected||busy)return;
 const legacyData=r.disegnoData||r.imageData||"",legacyUrl=r.disegnoUrl||r.imageUrl||"",oldPrivate=r.disegnoStoragePath||r.disegnoR2Key;
 if(!file&&!legacyData&&(oldPrivate||legacyUrl&&!retain)){status("Seleziona il file originale del disegno, oppure conferma il mantenimento del link esterno se disponibile.",true);return;}
 if(!confirm("Trasferire "+r.codice+" su Cloudflare? Conferma solo se hai autorizzazione aziendale. La copia locale resterà invariata."))return;
 await action(async()=>{
  await loadRemote();if(remote.some(x=>x.code===code(r))){render();throw Error("Codice già presente. Nessuna sovrascrittura.");}
  const recipe=Object.fromEntries(fields.filter(k=>r[k]!=null&&r[k]!=="").map(k=>[k,r[k]]));
  if(file||legacyData){
   let blob=file;
   if(!blob){
    const match=String(legacyData).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
    if(!match)throw Error("Disegno incorporato non supportato. Seleziona il file originale.");
    const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));blob=new Blob([bytes],{type:match[1]});
   }
   status("Caricamento e verifica del disegno...");recipe.disegnoR2Key=await upload(blob);
  }else if(legacyUrl&&retain){if(!/^https:\/\//i.test(legacyUrl))throw Error("Link non HTTPS. Seleziona il file.");recipe.disegnoUrl=legacyUrl;}
  status("Trasferimento ricetta...");
  const saved=await json("/api/recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipe,expectedRevision:0,deleted:false})});
  if(saved.code!==code(r)||saved.revision!==1)throw Error("Salvataggio non verificato. Aggiorna l'elenco prima di riprovare.");
  await loadRemote();if(!remote.some(x=>x.code===code(r)&&x.revision===1&&!x.deleted))throw Error("Rilettura non riuscita. Aggiorna l'elenco.");
  render();status("Ricetta "+r.codice+" trasferita e riletta. "+(recipe.disegnoR2Key?"Disegno R2 verificato.":recipe.disegnoUrl?"Il vecchio link è stato mantenuto.":"Nessun disegno allegato."));
 });
}
$("local-backup").onclick=()=>{if(raw===null)return;download({formato:"bearing-recipes-backup",versione:11,ricette:local,rawLocal:raw,creatoIl:new Date().toISOString()},"backup-locale-ricette-"+filename()+".json");};
$("login").onclick=()=>action(async()=>{
 token=$("key").value;$("key").value="";
 if(token.length<32||token.length>128){token="";throw Error("Inserisci la chiave amministratore creata su GitHub, non il token Cloudflare.");}
 try{const check=await json("/api/check");if(!check.database||!check.photos)throw Error("Verifica archivi non riuscita.");await loadRemote();connected=true;render();status("Archivio Cloudflare collegato. Nessuna ricetta modificata.");}catch(e){token="";connected=false;remote=[];render();throw e;}
});
$("logout").onclick=()=>{token="";connected=false;remote=[];photoClear();render();status("Disconnesso.");};
$("refresh").onclick=()=>action(async()=>{await loadRemote();render();status("Archivio aggiornato.");});
function toData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}
$("cloud-backup").onclick=()=>action(async()=>{
 if(!confirm("Scaricare un backup con disegni privati? Conserva il file in un luogo autorizzato e protetto."))return;
 await loadRemote();
 const recipes=[],photos={},limit=50*1024*1024;let total=0;
 for(const row of remote.filter(x=>!x.deleted)){
  const r=row.recipe||{},k=r.disegnoR2Key;
  if(k&&!photos[k]){status("Backup: lettura disegno "+r.codice+"...");const b=await(await request("/api/photos?key="+encodeURIComponent(k))).blob();total+=b.size;if(total>limit)throw Error("Backup oltre 50 MB: usa un PC o scarica le foto separatamente.");photos[k]=await toData(b);}
  recipes.push(row);
 }
 download({formato:"bearing-recipes-cloudflare-backup",versione:11,creatoIl:new Date().toISOString(),ricette:recipes,foto:photos},"backup-cloudflare-ricette-"+filename()+".json");
 status("Backup delle ricette attive e dei relativi file R2 creato. I link esterni non sono inclusi come immagini.");
});
window.addEventListener("pagehide",()=>{token="";photoClear();});
readLocal();render();
