// js/main.js

// ==========================================
// 1. IMPORTAZIONE DEI MODULI (Separation of Concerns)
// ==========================================
import { initKioskAuth } from './api/auth.js';
import { inizializzaTabellaGioco, calcolaTolleranze } from './api/bearing-logic.js';
import { esportaLavorazioniInCSV, analizzaImportCSV } from './api/csv-manager.js';
import { analizzaScheda } from './api/vision.js';

// ==========================================
// 2. STATO LOCALE DELL'APPLICAZIONE
// ==========================================
const STORAGE_KEY = "bearing_recipes_lavorazioni";
let lavorazioni = [];
let idCorrente = null;
let immagineCorrenteData = "";

// ==========================================
// 3. FUNZIONI DI UTILITÀ E STORAGE
// ==========================================
function generaId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 8);
}

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

function salvaSuStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lavorazioni));
}

function caricaDaStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function leggiNumero(id) {
  const raw = document.getElementById(id).value;
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

// ==========================================
// 4. GESTIONE INTERFACCIA (DOM) E RENDERING
// ==========================================
function mostraForm() {
  document.getElementById("card-form").classList.remove("is-hidden");
}

function nascondiForm() {
  document.getElementById("card-form").classList.add("is-hidden");
}

function aggiornaStatoSchedaButton() {
  const btn = document.getElementById("btn-scheda-tecnica");
  if (btn) btn.disabled = !idCorrente;
}

function aggiornaDisegnoPreview(url) {
  const img = document.getElementById("drawing-image");
  const placeholder = document.getElementById("drawing-placeholder");
  if (url) {
    img.src = url;
    img.style.display = "block";
    placeholder.style.display = "none";
  } else {
    img.src = "";
    img.style.display = "none";
    placeholder.style.display = "block";
  }
}

function aggiornaConteggio() {
  const label = document.getElementById("recipes-count");
  if (label) label.textContent = lavorazioni.length;
}

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

    // Blocco Sinistro: Miniatura e Testi
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

    // Blocco Destro: Badge Tolleranza
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
// 5. DELEGAZIONE LOGICA DI BUSINESS
// ==========================================
function gestisciSubmit(event) {
  event.preventDefault();
  const codice = document.getElementById("codice").value.trim();
  if (!codice) return alert("Inserisci il codice lavorazione (campo obbligatorio).");

  const urlInput = document.getElementById("disegnoUrl");
  const urlNormalizzato = normalizzaUrlImmagine(urlInput.value);
  urlInput.value = urlNormalizzato;

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
    disegnoUrl: urlNormalizzato,
    disegnoData: immagineCorrenteData || ""
  };

  const idx = lavorazioni.findIndex((l) => l.id === lav.id);
  if (idx >= 0) lavorazioni[idx] = lav; else lavorazioni.push(lav);

  salvaSuStorage();
  idCorrente = lav.id;
  renderLista();
  nascondiForm();
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
// 6. INIT E BINDING DEGLI EVENTI
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
