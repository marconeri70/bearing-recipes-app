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
 $("editor-cancel").disabled=busy;
 $("skf-apply").disabled=busy||!skfProposal||!draft;
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
 renderCloudCatalog();
 syncControls();
}
function renderCloudCatalog(){
 const remoteList=$("remotes");remoteList.replaceChildren();
 const query=$("cloud-search").value.trim().toLowerCase(), ir=$("cloud-ir").value.trim(), or=$("cloud-or").value.trim();
 const rows=remote.filter(row=>!row.deleted&&matchesCloud(row.recipe||{},query,ir,or));
 $("cloud-filter-count").textContent=connected?rows.length+" ricette trovate":"Collega l’archivio per visualizzare le ricette.";
 for(const row of rows){
  const r=row.recipe||{},box=element("article");box.append(element("strong",r.codice||row.code),element("small","Versione "+row.revision+(row.deleted?" · eliminata":" · attiva")),element("p","IR "+(r.irDiametro??"—")+" mm · OR "+(r.orDiametro??"—")+" mm · "+(r.classeGioco||"—")));
  if(keyPattern.test(r.disegnoR2Key||""))box.append(button("Apri foto privata",()=>showPhoto(r)));
  else box.append(element("small",r.disegnoUrl?"Solo collegamento esterno: foto non archiviata in R2.":"Nessun disegno R2."));
  box.append(button("Modifica ricetta / foto",()=>openEditor(row)),button("Storico",()=>showHistory(row)));
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
$("logout").onclick=()=>{if(draft&&!confirm("Disconnettere e abbandonare la scheda non salvata?"))return;closeEditor();token="";connected=false;remote=[];$("cloud-history").replaceChildren();photoClear();render();status("Disconnesso.");};
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

const numericFields=new Set(["irDiametro","orDiametro","diametroSfera","numeroSfere","pesoMin","pesoMax","giocoMin","giocoMax"]);
const fieldLabels={codice:"Codice lavorazione",irTipo:"Tipo IR",irDiametro:"Foro IR (mm)",orTipo:"Tipo OR",orDiametro:"Esterno OR (mm)",diametroSfera:"Diametro sfera (mm)",numeroSfere:"Numero sfere",gabbiaTipo:"Gabbia",grassoTipo:"Grasso",schermoTipo:"Schermo",pesoMin:"Peso minimo (g)",pesoMax:"Peso massimo (g)",classeGioco:"Classe gioco",serieGioco:"Riferimento SKF (serie)",giocoMin:"Gioco minimo (µm)",giocoMax:"Gioco massimo (µm)"};
let draft=null,editorFile=null;
function numberValue(x){
 const v=String(x??"").trim();
 if(!v||!/^\d+(?:[.,]\d+)?$/.test(v))return null;
 const n=Number(v.replace(",","."));return Number.isFinite(n)?n:null;
}
function matchesCloud(r,q,ir,or){
 const has=(k,v)=>!v||(numberValue(v)!==null&&numberValue(v)>0&&numberValue(r[k])===numberValue(v));
 return (!q||[r.codice,r.irTipo,r.orTipo,r.classeGioco].some(v=>String(v??"").toLowerCase().includes(q)))&&has("irDiametro",ir)&&has("orDiametro",or);
}

let skfRows=[],skfReady=false,skfProposal=null;
function parseSKF(raw,kind){
 const lines=raw.replace(/^\uFEFF/,"").split(/\r?\n/).filter(l=>l.trim());
 const cols=lines.shift().split(";").map(v=>v.trim()),idx=k=>cols.indexOf(k);
 if(["d_min","d_max","classe","gioco_min","gioco_max"].some(k=>idx(k)<0)||kind!=="storica"&&idx("serie")<0)throw Error("Tabella SKF non riconosciuta.");
 return lines.map(l=>{
  const row=l.split(";"), get=k=>(row[idx(k)]??"").trim();
  return {serie:kind==="storica"?"storica":get("serie"),classe:get("classe").toUpperCase(),lo:numberValue(get("d_min")),hi:numberValue(get("d_max")),min:numberValue(get("gioco_min")),max:numberValue(get("gioco_max")),kind};
 }).filter(x=>x.classe&&["storica","BCG02","BCG04","BCG06"].includes(x.serie)&&[x.lo,x.hi,x.min,x.max].every(n=>n!==null)&&x.hi>=x.lo&&x.max>=x.min);
}
function lookupSKF(rows,serie,classe,d){
 if(!serie||!classe||d===null||d<=0)return {state:"incomplete"};
 const hits=rows.filter(x=>x.serie===serie&&x.classe===classe.trim().toUpperCase()&&(x.lo===x.hi?serie==="storica"&&d===x.hi:d>x.lo&&d<=x.hi));
 if(!hits.length)return {state:"missing"};
 if(new Set(hits.map(x=>x.min+"|"+x.max)).size!==1)return {state:"ambiguous"};
 return {state:"ok",min:hits[0].min,max:hits[0].max,kind:hits[0].kind};
}
async function loadSKF(){
 try{
  const inputs=[["tabella_gioco.csv","storica"],["tabella_gioco_normale_skf.csv","normale"],["tabella_gioco_diviso_skf.csv","diviso"]];
  const lists=await Promise.all(inputs.map(async ([path,kind])=>{const res=await fetch("./"+path,{cache:"no-store",credentials:"omit"});if(!res.ok)throw Error("Tabella non disponibile");const rows=parseSKF(await res.text(),kind);if(!rows.length)throw Error("Tabella vuota");return rows;}));
  skfRows=lists.flat();skfReady=true;
 }catch{skfReady=false;}
 if(draft)previewSKF();
}
function previewSKF(){
 const output=$("skf-result"),apply=$("skf-apply");skfProposal=null;apply.disabled=true;
 if(!draft)return;
 if(!skfReady){output.textContent="Tabelle SKF non disponibili. Usa esclusivamente limiti verificati sul disegno.";return;}
 const serie=$("ed-serieGioco").value,classe=$("ed-classeGioco").value,d=numberValue($("ed-irDiametro").value);
 const result=lookupSKF(skfRows,serie,classe,d);
 if(result.state==="incomplete"){output.textContent="Seleziona riferimento, classe e foro IR.";return;}
 if(result.state==="missing"){output.textContent="Nessun intervallo disponibile per questa combinazione. Mantieni o inserisci i limiti controllati sul disegno.";return;}
 if(result.state==="ambiguous"){output.textContent="Valori discordanti nella tabella: nessuna proposta automatica. Verifica il documento.";return;}
 const source=result.kind==="storica"?"Tabella storica non verificata":result.kind==="diviso"?"SKF classi divise, stampa 04/01/2021":"SKF normale, stampa 20/07/2020";
 const load=({BCG02:"±2",BCG04:"±5",BCG06:"±15"})[serie];
 output.textContent="Proposta: "+result.min+" – "+result.max+" µm. "+source+(load?" · carico indicato "+load+" daN":"")+". Controlla il riferimento di produzione.";
 skfProposal=result;apply.disabled=busy;
}
$("skf-apply").onclick=()=>{
 if(!draft||busy||!skfProposal)return;
 if(!confirm("Applicare i limiti proposti? Conferma dopo il confronto con la specifica approvata."))return;
 $("ed-giocoMin").value=skfProposal.min;$("ed-giocoMax").value=skfProposal.max;
};
async function showHistory(row){
 await action(async()=>{
  const panel=$("cloud-history");panel.replaceChildren(element("h2","Storico · "+row.recipe.codice));
  const data=await json("/api/history?code="+encodeURIComponent(row.code));
  if(!Array.isArray(data.items))throw Error("Storico non disponibile.");
  for(const version of data.items){
   const r=version.recipe||{},box=element("article");
   box.append(element("strong","Versione "+version.revision+(version.deleted?" · eliminata":"")),element("small",version.updatedAt||""));
   const d=element("details");d.append(element("summary","Dati della versione"));
   for(const [k,v] of Object.entries(r))if(k!=="disegnoUrl"&&k!=="disegnoR2Key")d.append(element("p",k+": "+String(v)));
   box.append(d);
   if(keyPattern.test(r.disegnoR2Key||""))box.append(button("Apri disegno di questa versione",()=>showPhoto(r)));
   panel.append(box);
  }
  if(data.next)panel.append(element("small","Mostrate le 100 versioni più recenti."));
  const close=element("button","Chiudi storico");close.className="secondary";close.onclick=()=>panel.replaceChildren();panel.append(close);panel.scrollIntoView({block:"start"});
 });
}

function closeEditor(){
 draft=null;editorFile=null;$("editor-form").reset();$("editor-file-status").textContent="";$("editor-status").textContent="";$("cloud-editor").hidden=true;
}
function openEditor(row=null){
 if(!connected||busy)return;
 if(draft&&!confirm("Abbandonare le modifiche non salvate?"))return;
 photoClear();draft={row,base:row?{...row.recipe}:{}};
 editorFile=null;$("editor-form").reset();$("editor-fields").replaceChildren();$("editor-status").textContent="";$("editor-file-status").textContent="";
 $("editor-title").textContent=row?"Modifica "+row.recipe.codice:"Nuova ricetta cloud";
 $("editor-revision").textContent=row?"Versione "+row.revision+" · nessuna modifica automatica ai dati locali":"Nuovo codice nell’archivio online";
 for(const k of fields){
  const label=element("label",fieldLabels[k]||k,k==="codice"?"wide":"");
  const input=element(k==="serieGioco"?"select":"input");input.id="ed-"+k;
  if(k==="serieGioco"){const values=["","storica","BCG02","BCG04","BCG06"];const prior=draft.base[k]||"";if(prior&&!values.includes(prior))values.push(prior);for(const v of values){const opt=element("option",v||"Seleziona riferimento");opt.value=v;input.append(opt);}}
  input.value=draft.base[k]??"";input.maxLength=k==="codice"?200:4000;
  if(["serieGioco","classeGioco","irDiametro"].includes(k))input.addEventListener("input",previewSKF);
  if(k==="codice"){input.required=true;input.readOnly=!!row;}
  if(numericFields.has(k))input.inputMode="decimal";
  if(k==="serieGioco")input.placeholder="storica / BCG02 / BCG04 / BCG06";
  label.append(input);$("editor-fields").append(label);
 }
 $("editor-drawing").textContent=draft.base.disegnoR2Key?"Disegno privato R2 presente.":draft.base.disegnoUrl?"Vecchio link presente. Seleziona una foto per sostituirlo con il file R2.":"Nessun disegno associato.";
 $("cloud-editor").hidden=false;$("cloud-editor").scrollIntoView({block:"start"});syncControls();previewSKF();
}
function chooseEditorFile(f){
 if(!draft||busy||!f)return;
 if(!/^image\/(jpeg|png|webp)$/.test(f.type)||!f.size||f.size>8*1024*1024){$("editor-file").value="";$("editor-capture").value="";editorFile=null;$("editor-file-status").textContent="Formato non valido: JPG, PNG, WebP, fino a 8 MB.";return;}
 editorFile=f;$("editor-file-status").textContent="Foto selezionata: "+f.name+". Verrà caricata al salvataggio.";
}
async function saveEditor(event){
 event.preventDefault();if(!draft||busy||!connected)return;
 const current=draft, file=editorFile, recipe={};
 $("editor-status").textContent="";
 try{
  for(const k of fields){
   const v=$("ed-"+k).value.trim();if(!v)continue;
   if(numericFields.has(k)){const n=numberValue(v);if(n===null||(["irDiametro","orDiametro","diametroSfera","numeroSfere"].includes(k)&&n<=0)||(k==="numeroSfere"&&!Number.isInteger(n)))throw Error("Controlla "+fieldLabels[k]+".");recipe[k]=n;}
   else recipe[k]=v;
  }
  if(!code(recipe))throw Error("Inserisci il codice.");
  if(recipe.giocoMin!=null&&recipe.giocoMax!=null&&recipe.giocoMin>recipe.giocoMax)throw Error("Gioco minimo superiore al massimo.");
  if(recipe.pesoMin!=null&&recipe.pesoMax!=null&&recipe.pesoMin>recipe.pesoMax)throw Error("Peso minimo superiore al massimo.");
  for(const k of ["disegnoUrl","disegnoR2Key"])if(current.base[k])recipe[k]=current.base[k];
 }catch(e){$("editor-status").textContent=e.message;return;}
 if(!confirm("Salvare "+recipe.codice+" nell’archivio Cloudflare? Conferma solo se autorizzato dall’azienda. La versione precedente resta nello storico."))return;
 await action(async()=>{
  $("editor-form").inert=true;
  try{
   await loadRemote();
   const existing=remote.find(r=>r.code===code(recipe)),revision=current.row?.revision??0;
   if((existing?.revision??0)!==revision||existing?.deleted)throw Error("Il codice esiste già o la versione è cambiata. Nessuna sovrascrittura: aggiorna e riapri la scheda.");
   if(file){$("editor-status").textContent="Caricamento e verifica della foto...";recipe.disegnoR2Key=await upload(file);delete recipe.disegnoUrl;}
   $("editor-status").textContent="Salvataggio ricetta...";
   const saved=await json("/api/recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipe,expectedRevision:revision,deleted:false})});
   if(saved.code!==code(recipe)||saved.revision!==revision+1)throw Error("Salvataggio non verificato. Aggiorna il catalogo prima di riprovare.");
   await loadRemote();
   if(!remote.some(r=>r.code===saved.code&&r.revision===saved.revision&&!r.deleted))throw Error("Rilettura non riuscita. Aggiorna il catalogo.");
   closeEditor();render();status("Ricetta "+recipe.codice+" salvata e riletta su Cloudflare.");$("cloud-catalog").scrollIntoView({block:"start"});
  }catch(e){$("editor-status").textContent=e.message;throw e;}finally{$("editor-form").inert=false;}
 });
}
$("new-cloud").onclick=()=>openEditor();
for(const id of ["cloud-search","cloud-ir","cloud-or"])$(id).addEventListener("input",renderCloudCatalog);
$("editor-file").onchange=e=>chooseEditorFile(e.target.files[0]);
$("editor-capture").onchange=e=>chooseEditorFile(e.target.files[0]);
$("editor-camera").onclick=()=>$("editor-capture").click();
$("editor-cancel").onclick=()=>{if(!busy&&confirm("Chiudere senza salvare?"))closeEditor();};
$("editor-form").onsubmit=saveEditor;

window.addEventListener("pagehide",()=>{token="";connected=false;remote=[];closeEditor();$("cloud-history").replaceChildren();photoClear();render();});
readLocal();render();loadSKF();
