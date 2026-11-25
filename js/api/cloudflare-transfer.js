const API="https://skf-ricette-api.vocidicassino.workers.dev";
const LOCAL="bearing_recipes_lavorazioni_v2";
const $=id=>document.getElementById(id);
const code=r=>String(r?.codice??"").trim().toLowerCase();
const keyPattern=/^drawings\/[a-f0-9-]{36}\.(jpg|png|webp)$/;
let token="",connected=false,busy=false,local=[],remote=[],raw=null,viewUrl=null,activeView="catalog",sheetCode=null;
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
 $("catalog-list").hidden=!!sheetCode;$("sheet-screen").hidden=!sheetCode;
 $("login-fields").hidden=connected;$("connected-bar").hidden=!connected;
 $("cloud-catalog").hidden=!connected||activeView!=="catalog"||!!draft;
 $("backup-panel").hidden=activeView!=="backup";
 $("nav-catalog").setAttribute("aria-current",activeView==="catalog"?"page":"false");$("nav-backup").setAttribute("aria-current",activeView==="backup"?"page":"false");
 for(const id of ["nav-catalog","nav-backup","back-catalog"])$(id).disabled=busy;
 $("login").disabled=busy||connected;$("key").disabled=busy||connected;
 $("logout").disabled=busy||!connected;$("refresh").disabled=busy||!connected;$("cloud-backup").disabled=busy||!connected;
 $("editor-cancel").disabled=busy;
 $("restore-file").disabled=busy||!connected;$("restore-preview").disabled=busy||!connected||!$("restore-file").files.length;$("restore-run").disabled=busy||!connected||!restorePlan?.length;$("restore-clear").disabled=busy;
 $("skf-apply").disabled=busy||!skfProposal||!draft;
 document.querySelectorAll("[data-action]").forEach(b=>{b.disabled=busy||!connected||b.dataset.blocked==="true";});
}
function button(text,fn,blocked=false){const b=element("button",text);b.type="button";b.dataset.action="1";b.dataset.blocked=String(blocked);b.onclick=fn;return b;}
function photoClear(){closeZoom();if(viewUrl)URL.revokeObjectURL(viewUrl);viewUrl=null;$("photo-view").replaceChildren();}
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
 renderArchived();
 syncControls();
}
function renderCloudCatalog(){
 const remoteList=$("remotes");remoteList.replaceChildren();
 const query=$("cloud-search").value.trim().toLowerCase(), ir=$("cloud-ir").value.trim(), or=$("cloud-or").value.trim();
 const classSelect=$("cloud-class"),selected=classSelect.value;
 const classes=[...new Set(remote.filter(x=>!x.deleted).map(x=>String(x.recipe?.classeGioco||"").trim().toUpperCase()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"it",{numeric:true}));
 classSelect.replaceChildren();for(const value of ["",...classes]){const opt=element("option",value||"Tutte le classi");opt.value=value;classSelect.append(opt);}
 classSelect.value=classes.includes(selected)?selected:"";
 const rows=remote.filter(row=>!row.deleted&&matchesCloud(row.recipe||{},query,ir,or)&&(!classSelect.value||String(row.recipe?.classeGioco||"").trim().toUpperCase()===classSelect.value));
 $("cloud-filter-count").textContent=connected?rows.length+" ricette trovate":"Collega l’archivio per visualizzare le ricette.";
 for(const row of rows){
  const r=row.recipe||{},box=element("article",null,"recipe-row"),info=element("div",null,"recipe-info");
  info.append(element("strong",r.codice||row.code),element("small","IR "+(r.irDiametro??"—")+" mm · OR "+(r.orDiametro??"—")+" mm"),element("small",r.classeGioco?"Gioco "+r.classeGioco+": "+(r.giocoMin??"—")+" – "+(r.giocoMax??"—")+" µm":"Gioco non registrato"));
  if(keyPattern.test(r.disegnoR2Key||""))info.append(element("span","Disegno R2","tag"));else if(r.disegnoUrl)info.append(element("span","Link esterno","tag"));
  info.append(element("span","V"+row.revision,"tag"));
  if($("show-thumbs").checked){if(keyPattern.test(r.disegnoR2Key||"")){const thumb=element("img",null,"recipe-thumb");thumb.alt="";thumb.loading="lazy";box.append(thumb);queueThumb(thumb,r.disegnoR2Key);}else{box.append(element("div",r.disegnoUrl?"LINK":"NO FOTO","recipe-thumb recipe-thumb-empty"));}}
  box.append(info,button("Apri",()=>openSheet(row)));
  box.addEventListener("click",e=>{if(!e.target.closest("button")&&!busy)openSheet(row);});remoteList.append(box);
 }
 if(connected&&!rows.length)remoteList.append(element("p","Nessuna ricetta corrispondente."));
 if(sheetCode&&!remote.some(x=>x.code===sheetCode&&!x.deleted))clearSheet();
 syncControls();
}


const photoCache=new Map(), photoPending=new Map(), photoQueue=[];
let photoEpoch=0, thumbActive=0, zoom=1;
function resetPhotoCache(){photoEpoch++;for(const url of photoCache.values())URL.revokeObjectURL(url);photoCache.clear();photoPending.clear();photoQueue.length=0;}
async function photoURL(key){
 if(!connected||!keyPattern.test(key))throw Error("Disegno non disponibile.");
 if(photoCache.has(key))return photoCache.get(key);
 if(photoPending.has(key))return photoPending.get(key);
 const epoch=photoEpoch;
 const promise=(async()=>{const res=await request("/api/photos?key="+encodeURIComponent(key));const blob=await res.blob();
 if(!connected||epoch!==photoEpoch)throw Error("Sessione terminata.");
 if(!/^image\/(jpeg|png|webp)$/.test(blob.type)||!blob.size||blob.size>8*1024*1024)throw Error("Foto non valida.");
 const url=URL.createObjectURL(blob);if(photoCache.size>=24){const [old,value]=photoCache.entries().next().value;photoCache.delete(old);URL.revokeObjectURL(value);}
 photoCache.set(key,url);return url;})();
 photoPending.set(key,promise);try{return await promise;}finally{if(photoPending.get(key)===promise)photoPending.delete(key);}
}
function queueThumb(img,key){photoQueue.push({img,key,epoch:photoEpoch});queueMicrotask(drainThumbs);}
function drainThumbs(){
 while(thumbActive<2&&photoQueue.length){
  const task=photoQueue.shift();if(!task.img.isConnected||!connected||task.epoch!==photoEpoch)continue;
  thumbActive++;photoURL(task.key).then(url=>{if(task.img.isConnected&&task.epoch===photoEpoch)task.img.src=url;}).catch(()=>{task.img.hidden=true;}).finally(()=>{thumbActive--;drainThumbs();});
 }
}
function closeZoom(){const d=$("zoom-dialog");if(d.open)d.close();$("zoom-image").removeAttribute("src");}
function setZoom(value){zoom=Math.max(1,Math.min(4,value));$("zoom-image").style.width=(zoom*100)+"%";$("zoom-level").textContent=Math.round(zoom*100)+"%";}
function openZoom(url){if(!connected||!url)return;$("zoom-image").src=url;setZoom(1);$("zoom-dialog").showModal();$("zoom-scroll").scrollTo(0,0);}
$("zoom-minus").onclick=()=>setZoom(zoom-.5);$("zoom-plus").onclick=()=>setZoom(zoom+.5);$("zoom-close").onclick=closeZoom;
$("zoom-dialog").addEventListener("close",()=>{$("zoom-image").removeAttribute("src");});
async function attachSheetPhoto(row){
 const key=row.recipe?.disegnoR2Key;if(!keyPattern.test(key||""))return;
 const target=$("sheet-drawing");if(!target)return;
 try{const url=await photoURL(key);if(sheetCode!==row.code||!target.isConnected)return;
 const image=element("img");image.alt="Disegno "+row.recipe.codice;image.src=url;image.onclick=()=>openZoom(url);
 const zoomButton=element("button","Ingrandisci disegno");zoomButton.type="button";zoomButton.className="secondary";zoomButton.onclick=()=>openZoom(url);
 target.replaceChildren(image,zoomButton);
 }catch(e){if(target.isConnected)target.textContent="Disegno non disponibile: "+e.message;}
}
async function printSheet(row){
 if(!connected||busy||sheetCode!==row.code)return;
 await action(async()=>{
  const target=$("sheet-drawing");
  if(keyPattern.test(row.recipe?.disegnoR2Key||"")){
   if(!target?.querySelector("img"))await attachSheetPhoto(row);
   const img=target?.querySelector("img");if(!img)throw Error("Impossibile caricare il disegno per la stampa.");
   await img.decode();
  }
  if(!confirm("Stampare o salvare la scheda PDF? Conserva il documento in un luogo aziendale autorizzato."))return;
  document.body.classList.add("print-sheet");try{window.print();}finally{document.body.classList.remove("print-sheet");}
 });
}

function clearSheet(){sheetCode=null;$("recipe-sheet").replaceChildren();photoClear();$("cloud-history").replaceChildren();}
function renderSheet(row){
 const panel=$("recipe-sheet"),r=row.recipe||{};panel.replaceChildren();
 const box=element("article"),top=element("div",null,"catalog-title"),close=element("button","Chiudi");close.className="secondary";close.onclick=()=>{clearSheet();syncControls();window.scrollTo({top:0,behavior:"instant"});};
 top.append(element("h2",r.codice||row.code),close);box.append(top,element("small","Scheda tecnica · versione "+row.revision));
 const printNote=element("p","Copia della ricetta registrata. Verificare specifica di produzione e revisione approvata.");printNote.id="print-note";box.append(printNote);
 const actions=element("div",null,"sheet-actions no-print");
 const edit=button("Modifica ricetta",()=>openEditor(row)),print=button("Stampa / PDF",()=>printSheet(row)),history=button("Storico",()=>showHistory(row)),duplicate=button("Duplica",()=>openEditor(null,row));
 print.className="secondary";history.className="secondary";duplicate.className="secondary";
 actions.append(edit,print,history,duplicate);box.append(actions);
 const groups=[["Anelli e dimensioni",["irTipo","irDiametro","orTipo","orDiametro"]],["Componenti",["diametroSfera","numeroSfere","gabbiaTipo","schermoTipo"]],["Lubrificazione",["grassoTipo","pesoMin","pesoMax"]],["Controllo gioco radiale",["classeGioco","serieGioco","giocoMin","giocoMax"]]];
 for(const [label,keys] of groups){
  box.append(element("h3",label,"sheet-group"));const grid=element("div",null,"grid sheet-grid");
  for(const k of keys){const item=element("div",null,"metric");item.append(element("small",fieldLabels[k]||k),element("b",String(r[k]??"—")));grid.append(item);}
  box.append(grid);
 }
 const missing=fields.filter(k=>k!=="codice"&&(r[k]==null||r[k]==="")).length;
 if(missing)box.append(element("p",missing+" campi tecnici non compilati. Verifica il disegno prima di completarli.","sheet-missing"));
 box.append(element("h3","Disegno tecnico","sheet-group"));
 if(keyPattern.test(r.disegnoR2Key||"")){const drawing=element("div","Caricamento disegno privato…");drawing.id="sheet-drawing";box.append(drawing);}
 else box.append(element("small",r.disegnoUrl?"Disegno collegato esternamente; seleziona l’originale nella modifica per archiviarlo su R2.":"Nessun disegno associato."));
 const bottom=element("div",null,"sheet-actions no-print");const archive=button("Archivia ricetta",()=>changeArchive(row,true));archive.className="danger";bottom.append(button("Modifica ricetta / foto",()=>openEditor(row)),archive);box.append(bottom);
 panel.append(box);attachSheetPhoto(row);
}
function openSheet(row){if(!connected||busy)return;clearSheet();sheetCode=row.code;renderSheet(row);syncControls();window.scrollTo({top:0,behavior:"instant"});}

function renderArchived(){
 const panel=$("archived-list");panel.replaceChildren();
 const rows=connected?remote.filter(x=>x.deleted):[];
 $("archived-count").textContent=connected?String(rows.length):"—";
 if(!rows.length)panel.append(element("small",connected?"Nessuna ricetta archiviata.":"Collega l’archivio."));
 for(const row of rows){
  const box=element("article",null,"archived-row");box.append(element("strong",row.recipe?.codice||row.code),element("small","Archiviata · versione "+row.revision),button("Ripristina nel catalogo",()=>changeArchive(row,false)));panel.append(box);
 }
}
async function changeArchive(row,deleted){
 if(!connected||busy||!!row.deleted===deleted)return;
 const name=row.recipe?.codice||row.code;
 if(!confirm(deleted?"Archiviare "+name+"? Scomparirà dal catalogo attivo ma dati, foto e storico resteranno conservati.":"Ripristinare "+name+" nel catalogo attivo?"))return;
 await action(async()=>{
  await loadRemote();const latest=remote.find(x=>x.code===row.code);
  if(!latest||latest.revision!==row.revision||!!latest.deleted===deleted)throw Error("La versione è cambiata. Aggiorna il catalogo prima di riprovare.");
  const saved=await json("/api/recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipe:latest.recipe,expectedRevision:latest.revision,deleted})});
  if(saved.code!==row.code||saved.revision!==latest.revision+1||saved.deleted!==deleted)throw Error("Esito non verificato. Aggiorna il catalogo prima di riprovare.");
  await loadRemote();if(!remote.some(x=>x.code===row.code&&x.revision===saved.revision&&x.deleted===deleted))throw Error("Rilettura non riuscita.");
  clearSheet();render();status(deleted?"Ricetta archiviata. Puoi ripristinarla in Cloud e backup.":"Ricetta ripristinata nel catalogo.");
 });
}

function navigate(view){
 if(busy)return;
 if(draft){if(!confirm("Abbandonare la scheda non salvata?"))return;closeEditor();}
 activeView=view;clearSheet();if(view==="backup")readLocal();render();window.scrollTo({top:0,behavior:"instant"});
}
$("nav-catalog").onclick=()=>navigate("catalog");$("nav-backup").onclick=()=>navigate("backup");$("back-catalog").onclick=()=>navigate("catalog");

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
 try{const check=await json("/api/check");if(!check.database||!check.photos)throw Error("Verifica archivi non riuscita.");await loadRemote();connected=true;activeView="catalog";render();status("Catalogo aggiornato. Le ricette cloud sono disponibili.");}catch(e){token="";connected=false;remote=[];render();throw e;}
});
$("logout").onclick=()=>{if(draft&&!confirm("Disconnettere e abbandonare la scheda non salvata?"))return;closeEditor();token="";connected=false;remote=[];resetPhotoCache();activeView="catalog";clearSheet();clearRestore();render();status("Disconnesso.");};
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
function openEditor(row=null,source=null){
 if(!connected||busy)return;
 if(draft&&!confirm("Abbandonare le modifiche non salvate?"))return;
 clearSheet();activeView="catalog";const base= row?{...row.recipe}:source?Object.fromEntries(fields.filter(k=>k!=="codice"&&source.recipe[k]!=null).map(k=>[k,source.recipe[k]])):{};draft={row,base,duplicated:!!source};
 editorFile=null;$("editor-form").reset();$("editor-fields").replaceChildren();$("editor-status").textContent="";$("editor-file-status").textContent="";
 $("editor-title").textContent=row?"Modifica "+row.recipe.codice:source?"Duplica da "+source.recipe.codice:"Nuova ricetta cloud";
 $("editor-revision").textContent=row?"Versione "+row.revision+" · nessuna modifica automatica ai dati locali":source?"Inserisci un nuovo codice, verifica tutti i dati e allega il disegno corretto. Il disegno originale non viene duplicato.":"Nuovo codice nell’archivio online";
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

let restorePlan=null;
const RESTORE_LIMIT=75*1024*1024;
function clearRestore(){
 restorePlan=null;$("restore-file").value="";$("restore-result").replaceChildren();syncControls();
}
function validateBackupRecipe(row,photos){
 if(!row||typeof row!=="object"||row.deleted!==false||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error("Versione non valida o archiviata.");
 const src=row.recipe;if(!src||typeof src!=="object"||Array.isArray(src)||typeof src.codice!=="string"||!src.codice.trim()||src.codice.length>200||row.code!==code(src))throw Error("Codice ricetta non valido.");
 const recipe={};
 for(const k of fields){
  const v=src[k];if(v==null||v==="")continue;
  if(numericFields.has(k)){if(typeof v!=="number"||!Number.isFinite(v)||v<0)throw Error("Valore numerico non valido: "+k);recipe[k]=v;}
  else{if(typeof v!=="string"||v.length>4000)throw Error("Campo non valido: "+k);recipe[k]=v;}
 }
 recipe.codice=recipe.codice.trim();
 for(const [lo,hi] of [["giocoMin","giocoMax"],["pesoMin","pesoMax"]])if(recipe[lo]!=null&&recipe[hi]!=null&&recipe[lo]>recipe[hi])throw Error("Intervallo non valido.");
 let photo=null;
 if(src.disegnoR2Key){
  const k=src.disegnoR2Key;if(typeof k!=="string"||!keyPattern.test(k)||!Object.prototype.hasOwnProperty.call(photos,k))throw Error("Foto R2 mancante nel backup.");
  const data=photos[k];if(typeof data!=="string")throw Error("Foto non valida.");
  const match=data.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match||match[2].length>Math.ceil(8*1024*1024/3)*4)throw Error("Formato o dimensione foto non valido.");
  let bytes;try{bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));}catch{throw Error("Foto base64 non valida.");}
  if(!bytes.length||bytes.length>8*1024*1024)throw Error("Foto oltre il limite di 8 MB.");
  const type=match[1];
  const valid=type==="image/jpeg"?bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==="image/png"?bytes.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if(!valid)throw Error("Contenuto foto non valido.");
  photo=new Blob([bytes],{type});
 }else if(src.disegnoUrl){
  if(typeof src.disegnoUrl!=="string"||src.disegnoUrl.length>4000||!/^https:\/\//i.test(src.disegnoUrl)||new URL(src.disegnoUrl).protocol!=="https:")throw Error("Link immagine non valido.");
  recipe.disegnoUrl=src.disegnoUrl;
 }
 return {recipe,photo};
}
function analyzeBackup(data,existing){
 if(!data||data.formato!=="bearing-recipes-cloudflare-backup"||data.versione!==11||!Array.isArray(data.ricette)||!data.foto||typeof data.foto!=="object"||Array.isArray(data.foto)||data.ricette.length>2000)throw Error("Formato non supportato. Usa un backup cloud JSON esportato dall’app (massimo 2000 ricette).");
 const seen=new Set(),duplicates=new Set(),plan=[],skipped=[],invalid=[];
 for(const row of data.ricette){const k=code(row?.recipe);if(k&&seen.has(k))duplicates.add(k);seen.add(k);}
 for(const row of data.ricette){
  const k=code(row?.recipe),label=typeof row?.recipe?.codice==="string"?row.recipe.codice.slice(0,200):"Senza codice";
  if(duplicates.has(k)){invalid.push(label+": codice duplicato nel file");continue;}
  if(existing.has(k)){skipped.push(label);continue;}
  try{plan.push(validateBackupRecipe(row,data.foto));}catch(e){invalid.push(label+": "+e.message);}
 }
 return {plan,skipped,invalid};
}
$("restore-file").onchange=()=>{restorePlan=null;$("restore-result").replaceChildren();syncControls();};
$("restore-clear").onclick=()=>{if(!busy)clearRestore();};
$("restore-preview").onclick=()=>action(async()=>{
 restorePlan=null;const file=$("restore-file").files[0],out=$("restore-result");out.replaceChildren();
 try{
  if(!file||file.size>RESTORE_LIMIT)throw Error("Seleziona un file JSON fino a 75 MB.");
  let data;try{data=JSON.parse(await file.text());}catch{throw Error("Il file non è un JSON valido.");}
  await loadRemote();
  const result=analyzeBackup(data,new Set(remote.map(x=>x.code)));
  restorePlan=result.plan;
  out.append(element("strong",result.plan.length+" recuperabili · "+result.skipped.length+" già presenti · "+result.invalid.length+" non valide"));
  if(result.plan.length){const list=element("ul");for(const item of result.plan.slice(0,100))list.append(element("li",item.recipe.codice+(item.photo?" · con foto R2":item.recipe.disegnoUrl?" · solo link esterno":" · senza disegno")));out.append(list);if(result.plan.length>100)out.append(element("p","Mostrati i primi 100 codici recuperabili."));}
  if(result.invalid.length){const list=element("ul");for(const item of result.invalid.slice(0,50))list.append(element("li",item));out.append(element("strong","Record esclusi"),list);}
  out.append(element("p","Nessuna modifica effettuata. I codici esistenti, anche archiviati, restano intatti."));
  status("Analisi del backup completata.");
 }catch(e){out.textContent=e.message;throw e;}
});
$("restore-run").onclick=()=>{
 if(!connected||busy||!restorePlan?.length)return;
 if(!confirm("Recuperare fino a "+restorePlan.length+" ricette mancanti su Cloudflare? Conferma solo se autorizzato dall'azienda. Nessuna ricetta esistente verrà sovrascritta."))return;
 const plan=restorePlan;restorePlan=null;
 action(async()=>{
  const out=$("restore-result");const reports=[];let ok=0,skipped=0,failed=0;
  try{
   await loadRemote();
   const existing=new Set(remote.map(x=>x.code));
   for(const item of plan){
    if(!connected||!token)throw Error("Sessione terminata. Operazione interrotta.");
    const recipe={...item.recipe},k=code(recipe);
    if(existing.has(k)){skipped++;reports.push(recipe.codice+": già presente");continue;}
    out.textContent="Recupero in corso: "+recipe.codice+" ("+(ok+skipped+failed+1)+"/"+plan.length+")";
    try{
     if(item.photo)recipe.disegnoR2Key=await upload(item.photo);
     const saved=await json("/api/recipes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipe,expectedRevision:0,deleted:false})});
     if(saved.code!==k||saved.revision!==1||saved.deleted!==false)throw Error("Salvataggio non verificato.");
     existing.add(k);ok++;reports.push(recipe.codice+": salvata");
    }catch(e){failed++;reports.push(recipe.codice+": "+e.message+" (verificare prima di riprovare)");}
   }
   await loadRemote();const checked=new Set(remote.filter(x=>!x.deleted).map(x=>x.code));
   const confirmed=plan.filter(x=>checked.has(code(x.recipe))).length;
   render();status("Recupero completato. "+ok+" nuovi salvataggi confermati dall’API; "+skipped+" saltati; "+failed+" errori.");
   out.textContent=ok+" nuovi salvataggi · "+skipped+" saltati · "+failed+" errori. "+confirmed+" dei codici analizzati risultano attivi dopo la rilettura.\n"+reports.join("\n");
  }catch(e){out.textContent="Recupero interrotto: "+e.message+"\n"+reports.join("\n")+"\nAggiorna il catalogo prima di riprovare.";throw e;}
 });
};

$("new-cloud").onclick=()=>openEditor();
$("key").addEventListener("keydown",e=>{if(e.key==="Enter"&&!busy&&!connected){e.preventDefault();$("login").click();}});
for(const id of ["cloud-search","cloud-ir","cloud-or","cloud-class","show-thumbs"])$(id).addEventListener("input",renderCloudCatalog);
$("editor-file").onchange=e=>chooseEditorFile(e.target.files[0]);
$("editor-capture").onchange=e=>chooseEditorFile(e.target.files[0]);
$("editor-camera").onclick=()=>$("editor-capture").click();
$("editor-cancel").onclick=()=>{if(!busy&&confirm("Chiudere senza salvare?")){closeEditor();render();$("cloud-catalog").scrollIntoView({block:"start"});}};
$("editor-form").onsubmit=saveEditor;

window.addEventListener("pagehide",()=>{token="";connected=false;remote=[];resetPhotoCache();activeView="catalog";closeEditor();clearSheet();clearRestore();render();status("Sessione terminata. Accedi di nuovo.");});
window.addEventListener("pageshow",e=>{if(e.persisted){busy=false;syncControls();}});
let refreshedAt=0;
async function refreshVisible(){
 if(!connected||busy||draft||sheetCode||activeView!=="catalog"||document.visibilityState!=="visible"||Date.now()-refreshedAt<30000)return;
 refreshedAt=Date.now();await action(async()=>{await loadRemote();renderCloudCatalog();$("remote-count").textContent=remote.filter(r=>!r.deleted).length;status("Catalogo aggiornato dal cloud.");});
}
document.addEventListener("visibilitychange",refreshVisible);
window.addEventListener("focus",refreshVisible);
setInterval(refreshVisible,60000);
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
readLocal();render();loadSKF();
