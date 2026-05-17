// js/main.js (Versione Corazzata con OCR Interattivo locale)

import { initKioskAuth } from './api/auth.js';
import { inizializzaTabellaGioco, calcolaTolleranze } from './api/bearing-logic.js';
import { esportaLavorazioniInCSV, analizzaImport CSV } from './api/csv-manager.js';

// ==========================================
// 1. STATO LOCALE E UTILITY
// ==========================================
const STORAGE_KEY = "bearing_recipes_lavorazioni";
let lavorazioni = [];
let idCorrente = null;
let immagineCorrenteData = "";

function generaId() { return Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 8); }

function normalizzaUrlImmagine(url) {
  if (!url) return "";
  let u = url.trim();
  if (!u) return "";
  const matchFile = u.match(/https?:\/\/drive\.google\.com\/file\/d\/([^/]+)\//i);
  if (matchFile && matchFile[1]) return `https://drive.google.com/uc?export=view&id=${matchFile[1]}`;
  const matchOpen = u.match(/https?:\/\/drive\.google\.com\/open\?id=([^&]+)/i);
  if (matchOpen && matchOpen[1]) return `https://drive.google.com/uc?export=view&id=${matchOpen[1]}`;
  return u;
}

function salvaSuStorage() { localStorage.setItem(STORAGE_KEY, JSON.stringify(lavorazioni)); }
function caricaDaStorage() { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
function leggiNumero(id) { const raw = document.getElementById(id).value; if (!raw) return null; const n = Number(raw.replace(",", ".")); return Number.isNaN(n) ? null : n; }

// ==========================================
// 2. GESTIONE INTERFACCIA (UI/DOM) E OCR INTERATTIVO
// ==========================================
function mostraForm() { document.getElementById("card-form").classList.remove("is-hidden"); }
function nascondiForm() { document.getElementById("card-form").classList.add("is-hidden"); }
function aggiornaStatoSchedaButton() { const btn = document.getElementById("btn-scheda-tecnica"); if (btn) btn.disabled = !idCorrente; }

// --- NUOVO SISTEMA OCR INTERATTIVO LOCALE ---
async function inizializzaOcrInterattivo(imageSrc) {
  const container = document.querySelector(".drawing-preview");
  if (!container) return;

  // Pulizia vecchi overlay per non intasare il DOM
  const vecchiOverlay = container.querySelectorAll('.ocr-text-overlay');
  vecchiOverlay.forEach(o => o.remove());

  console.log("[OCR] Avvio scansione Tesseract locale per testo selezionabile...");

  const imgElement = document.getElementById("drawing-image");
  if(!imgElement) return;

  try {
    // 1. Esegui OCR su Tesseract sul tablet (scanziona solo l'immagine, non i moduli)
    const result = await Tesseract.recognize(imageSrc, 'eng', { logger: m => console.log(`[OCR-Local] ${m.status}: ${m.progress}`) });
    const { words } = result.data;

    if (!words || words.length === 0) return;

    // 2. Calcola lo scaling tra l'immagine originale e l'immagine visualizzata sul DOM
    const imgRatioX = imgElement.clientWidth / imgElement.naturalWidth;
    const imgRatioY = imgElement.clientHeight / imgElement.naturalHeight;
    const offsetX = imgElement.offsetLeft;
    const offsetY = imgElement.offsetTop;

    const overlayDiv = document.createElement("div");
    overlayDiv.className = "ocr-text-overlay";
    overlayDiv.style.pointerEvents = "auto"; // Permetti interazione (selezione)

    // 3. Crea e posiziona ogni parola come un box di testo selezionabile
    words.forEach(word => {
      if (word.text.trim().length === 0) return;
      const span = document.createElement("span");
      span.textContent = word.text;
      
      // Posizionamento chirurgico Flexbox: convertiamo le coordinate dell'immagine
      // in pixel DOM locali, applicando lo scaling corretto.
      const style = span.style;
      style.position = "absolute";
      style.left = `${(word.bbox.x0 * imgRatioX) + offsetX}px`;
      style.top = `${(word.bbox.y0 * imgRatioY) + offsetY}px`;
      style.width = `${(word.bbox.x1 - word.bbox.x0) * imgRatioX}px`;
      style.height = `${(word.bbox.y1 - word.bbox.y0) * imgRatioY}px`;
      style.fontSize = `${(word.font_size * imgRatioY) * 0.8}px`; // Scaling font per non sforare
      
      // CSS per renderlo trasparente ma selezionabile
      style.color = "transparent";
      style.backgroundColor = "rgba(59, 130, 246, 0.03)"; // Giallo molto sbiadito
      style.userSelect = "text"; 
      
      overlayDiv.appendChild(span);
    });

    container.appendChild(overlayDiv);
    console.log("[OCR] Scansione interattiva completata.");
  } catch (error) {
    console.error("[OCR] Errore scansione locale:", error);
  }
}

function aggiornaDisegnoPreview(url) {
  const img = document.getElementById("drawing-image");
  const placeholder = document.getElementById("drawing-placeholder");
  const btnIA = document.getElementById("btn-analizza-ia");
  
  if (url) {
    img.src = url; img.style.display = "block"; placeholder.style.display = "none";
    if (url.startsWith("data:image") && btnIA) btnIA.classList.remove("is-hidden"); 
    // Innesca la scansione Tesseract locale appena l'immagine è caricata nel DOM
    img.onload = () => {
      if (url.startsWith("data:image")) inizializzaOcrInterattivo(url);
    };
  } else {
    img.src = ""; img.style.display = "none"; placeholder.style.display = "block";
    if (btnIA) btnIA.classList.add("is-hidden");
    const container = document.querySelector(".drawing-preview");
    if(container) {
      const overlay = container.querySelector('.ocr-text-overlay');
      if(overlay) overlay.remove();
    }
  }
}

// ... (Resto del file invariato fino a analizzaConIA) ...

function aggiornaConteggio() { const label = document.getElementById("recipes-count"); if (label) label.textContent = lavorazioni.length; }

function renderLista() {
  const container = document.getElementById("lista-lavorazioni");
  if (!container) return;
  container.innerHTML = "";
  aggiornaConteggio();

  if (lavorazioni.length === 0) {
    container.innerHTML = `<div class="riga-lavorazione" style="cursor: default;">
      <div class="riga-left-content">
        <div class="riga-lavorazione-info">
          <span class="riga-codice">Nessuna lavorazione salvata</span>
          <span class="riga-sub">Premi "Nuova" o importa un CSV.</span>
        </div>
      </div>
    </div>`;
    return;
  }

  lavorazioni.forEach((lav) => {
    const riga = document.createElement("div");
    riga.className = "riga-lavorazione";
    if (lav.id === idCorrente) riga.classList.add("active");

    riga.addEventListener("click", () => {
      caricaLavorazioneInForm(lav.id);
      mostraForm();
      const card = document.getElementById("card-form");
      window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
    });

    const leftContent = document.createElement("div");
    leftContent.className = "riga-left-content";

    if (lav.disegnoData || lav.disegnoUrl) {
      const thumb = document.createElement("img");
      thumb.className = "riga-thumb";
      thumb.src = lav.disegnoData || lav.disegnoUrl;
      thumb.alt = "Disegno";
      leftContent.appendChild(thumb);
    }

    const info = document.createElement("div");
    info.className = "riga-lavorazione-info";
    
    const codice = document.createElement("span");
    codice.className = "riga-codice";
    codice.textContent = lav.codice || "(senza codice)";

    const sub = document.createElement("span");
    sub.className = "riga-sub";
    const parts = [
      [lav.irTipo, lav.orTipo].filter(Boolean).join(" | "),
      lav.irDiametro != null ? `d=${lav.irDiametro} mm` : "",
      lav.classeGioco && lav.giocoMin != null ? `Gioco ${lav.classeGioco}: ${lav.giocoMin}–${lav.giocoMax} µm` : ""
    ].filter(Boolean);
    sub.textContent = parts.join(" · ");

    info.append(codice, sub);
    leftContent.appendChild(info);
    riga.appendChild(leftContent);

    const badgeContainer = document.createElement("div");
    badgeContainer.className = "riga-actions";

    if (lav.classeGioco) {
      const b = document.createElement("span");
      b.className = "badge badge-gioco";
      b.textContent = `${lav.classeGioco} ${lav.giocoMin ?? "?"}–${lav.giocoMax ?? "?"} µm`;
      badgeContainer.appendChild(b);
    }

    riga.appendChild(badgeContainer);
    container.appendChild(riga);
  });
}

function resetForm() {
  idCorrente = null;
  immagineCorrenteData = "";
  document.getElementById("form-lavorazione").reset();
  
  const fileInput = document.getElementById("file-galleria");
  if(fileInput) fileInput.value = ""; 
  
  document.getElementById("stato-modifica").textContent = "Nuova lavorazione";
  document.getElementById("btn-elimina").disabled = true;
  aggiornaDisegnoPreview("");
  aggiornaStatoSchedaButton();
}

function caricaLavorazioneInForm(id) {
  const lav = lavorazioni.find((l) => l.id === id);
  if (!lav) return;
  idCorrente = id;
  document.getElementById("codice").value = lav.codice || "";
  document.getElementById("irTipo").value = lav.irTipo || "";
  document.getElementById("irDiametro").value = lav.irDiametro ?? "";
  document.getElementById("orTipo").value = lav.orTipo || "";
  document.getElementById("diametroSfera").value = lav.diametroSfera ?? "";
  document.getElementById("numeroSfere").value = lav.numeroSfere ?? "";
  document.getElementById("gabbiaTipo").value = lav.gabbiaTipo || "";
  document.getElementById("grassoTipo").value = lav.grassoTipo || "";
  document.getElementById("schermoTipo").value = lav.schermoTipo || "";
  document.getElementById("pesoMin").value = lav.pesoMin ?? "";
  document.getElementById("pesoMax").value = lav.pesoMax ?? "";
  document.getElementById("classeGioco").value = lav.classeGioco || "";
  document.getElementById("giocoMin").value = lav.giocoMin ?? "";
  document.getElementById("giocoMax").value = lav.giocoMax ?? "";
  document.getElementById("disegnoUrl").value = lav.disegnoUrl || "";

  immagineCorrenteData = lav.disegnoData || "";
  aggiornaDisegnoPreview(immagineCorrenteData || lav.disegnoUrl || "");

  document.getElementById("stato-modifica").textContent = "Modifica lavorazione esistente";
  document.getElementById("btn-elimina").disabled = false;
  aggiornaStatoSchedaButton();
  renderLista();
}

// ==========================================
// 3. INFRASTRUTTURA CLOUD E IA (Cloudflare / Gemini)
// ==========================================

async function caricaImmagineSulCloud(base64Data) {
  // INSERISCI QUI IL TUO LINK CLOUDFLARE WORKER (SENZA SLASH FINALE)
  const WORKER_URL = "https://bearing-image-router.vocidicassino.workers.dev"; 

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Data })
  });

  if (!response.ok) throw new Error("Sincronizzazione foto fallita. Il server ha respinto il payload.");
  const data = await response.json();
  return data.url; 
}

async function analizzaConIA() {
  if (!immagineCorrenteData) return alert("Carica prima un'immagine.");
  
  const btnIA = document.getElementById("btn-analizza-ia");
  const originalText = btnIA.textContent;
  btnIA.textContent = "⏳ Analisi in corso...";
  btnIA.disabled = true;

  try {
    // INSERISCI QUI IL TUO LINK CLOUDFLARE WORKER + "/analyze"
    const WORKER_IA_URL = "https://bearing-image-router.vocidicassino.workers.dev/analyze"; 

    const response = await fetch(WORKER_IA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: immagineCorrenteData })
    });

    if (!response.ok) throw new Error("Errore durante l'estrazione IA");
    const dati = await response.json();

    const mappatura = {
      "codice": dati.codice,
      "irDiametro": dati.irDiametro,
      "diametroSfera": dati.diametroSfera,
      "numeroSfere": dati.numeroSfere,
      "pesoMin": dati.pesoMin,
      "pesoMax": dati.pesoMax,
      "giocoMin": dati.giocoMin,
      "giocoMax": dati.giocoMax,
      "classeGioco": dati.classeGioco
    };

    // Compila i campi e applica il feedback visivo (Human-in-the-Loop)
    for (const [idElemento, valore] of Object.entries(mappatura)) {
      if (valore !== null && valore !== undefined) {
        const campo = document.getElementById(idElemento);
        if (campo) {
          campo.value = valore;
          campo.style.backgroundColor = "#fef08a"; // Giallo allerta
          setTimeout(() => campo.style.backgroundColor = "", 5000);
        }
      }
    }
  } catch (error) {
    alert("Analisi fallita: " + error.message);
  } finally {
    btnIA.textContent = originalText;
    btnIA.disabled = false;
  }
}

// ==========================================
// 4. LOGICA DI BUSINESS E SALVATAGGIO
// ==========================================

async function gestisciSubmit(event) {
  event.preventDefault();
  const codice = document.getElementById("codice").value.trim();
  if (!codice) return alert("Inserisci il codice lavorazione (campo obbligatorio).");

  const btnSubmit = document.querySelector("#form-lavorazione button[type='submit']");
  const originalText = btnSubmit.textContent;
  btnSubmit.textContent = "Upload su Cloudflare R2...";
  btnSubmit.disabled = true;

  try {
    let finalImageUrl = normalizzaUrlImmagine(document.getElementById("disegnoUrl").value);

    if (immagineCorrenteData && immagineCorrenteData.startsWith("data:image")) {
      finalImageUrl = await caricaImmagineSulCloud(immagineCorrenteData);
      immagineCorrenteData = ""; // Distrugge il Base64 per salvare il Database
    }

    const lav = {
      id: idCorrente || generaId(),
      codice,
      irTipo: document.getElementById("irTipo").value.trim(),
      irDiametro: leggiNumero("irDiametro"),
      orTipo: document.getElementById("orTipo").value.trim(),
      diametroSfera: leggiNumero("diametroSfera"),
      numeroSfere: leggiNumero("numeroSfere"),
      gabbiaTipo: document.getElementById("gabbiaTipo").value.trim(),
      grassoTipo: document.getElementById("grassoTipo").value.trim(),
      schermoTipo: document.getElementById("schermoTipo").value.trim(),
      pesoMin: leggiNumero("pesoMin"),
      pesoMax: leggiNumero("pesoMax"),
      classeGioco: document.getElementById("classeGioco").value || "",
      giocoMin: leggiNumero("giocoMin"),
      giocoMax: leggiNumero("giocoMax"),
      disegnoUrl: finalImageUrl, 
      disegnoData: ""            
    };

    const idx = lavorazioni.findIndex((l) => l.id === lav.id);
    if (idx >= 0) lavorazioni[idx] = lav; else lavorazioni.push(lav);

    salvaSuStorage();
    idCorrente = lav.id;
    renderLista();
    nascondiForm();

  } catch (error) {
    alert("Errore critico di sistema: " + error.message);
  } finally {
    btnSubmit.textContent = originalText;
    btnSubmit.disabled = false;
  }
}

function aggiornaGiocoIntegrato() {
  const classe = document.getElementById("classeGioco").value;
  const diametro = leggiNumero("irDiametro");
  const tolleranza = calcolaTolleranze(classe, diametro);
  if (tolleranza) {
    document.getElementById("giocoMin").value = tolleranza.min ?? "";
    document.getElementById("giocoMax").value = tolleranza.max ?? "";
  } else {
    document.getElementById("giocoMin").value = "";
    document.getElementById("giocoMax").value = "";
  }
}

// ==========================================
// 5. INIT E BINDING DEGLI EVENTI DOM
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[SYS] Avvio Orchestratore...");

  initKioskAuth();

  const classiDisponibili = await inizializzaTabellaGioco("tabella_gioco.csv");
  const selectClasse = document.getElementById("classeGioco");
  if (selectClasse && classiDisponibili.length > 0) {
    selectClasse.innerHTML = '<option value="">Seleziona classe…</option>';
    classiDisponibili.forEach(cls => {
      const opt = document.createElement("option");
      opt.value = cls;
      opt.textContent = cls;
      selectClasse.appendChild(opt);
    });
  }

  lavorazioni = caricaDaStorage();
  renderLista();
  resetForm();
  nascondiForm();

  document.getElementById("form-lavorazione").addEventListener("submit", gestisciSubmit);
  
  const btnNuova = document.getElementById("btn-nuova");
  if(btnNuova) {
      btnNuova.addEventListener("click", () => {
        resetForm();
        mostraForm();
        window.scrollTo({ top: document.getElementById("card-form").getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
      });
  }

  document.getElementById("btn-reset").addEventListener("click", resetForm);
  document.getElementById("btn-elimina").addEventListener("click", () => {
    if (!idCorrente || !confirm("Vuoi davvero eliminare questa lavorazione?")) return;
    lavorazioni = lavorazioni.filter((l) => l.id !== idCorrente);
    salvaSuStorage();
    resetForm(); nascondiForm(); renderLista();
  });

  document.getElementById("classeGioco").addEventListener("change", aggiornaGiocoIntegrato);
  document.getElementById("irDiametro").addEventListener("change", aggiornaGiocoIntegrato);

  document.getElementById("disegnoUrl").addEventListener("change", (e) => {
    e.target.value = normalizzaUrlImmagine(e.target.value);
    if (!immagineCorrenteData) aggiornaDisegnoPreview(e.target.value);
  });

  // GESTIONE FOTOCAMERA / GALLERIA
  const fileHandler = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        immagineCorrenteData = ev.target.result;
        aggiornaDisegnoPreview(immagineCorrenteData);
      };
      reader.readAsDataURL(file);
    }
  };
  
  document.getElementById("btn-file-galleria").addEventListener("click", () => document.getElementById("file-galleria").click());
  document.getElementById("file-galleria").addEventListener("change", fileHandler);

  // BINDING TASTO IA
  const btnIA = document.getElementById("btn-analizza-ia");
  if(btnIA) {
    btnIA.addEventListener("click", analizzaConIA);
  }

  document.getElementById("btn-export-csv").addEventListener("click", () => {
    if (lavorazioni.length === 0) return alert("Nessuna lavorazione da esportare.");
    esportaLavorazioniInCSV(lavorazioni);
  });

  const fileImport = document.getElementById("file-import");
  document.getElementById("btn-import").addEventListener("click", () => fileImport.click());
  fileImport.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const nuovi = analizzaImportCSV(ev.target.result, generaId, normalizzaUrlImmagine);
          lavorazioni = lavorazioni.concat(nuovi);
          salvaSuStorage(); renderLista(); alert("Importazione completata.");
        } catch(err) { alert("Errore importazione CSV: " + err.message); }
      };
      reader.readAsText(file, "utf-8");
    }
    fileImport.value = "";
  });

  document.getElementById("btn-scheda-tecnica").addEventListener("click", () => alert("Visualizzazione scheda tecnica attivata (Modalità temporanea)"));
});
