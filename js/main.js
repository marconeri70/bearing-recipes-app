// js/main.js

// ==========================================
// 1. IMPORTAZIONE DEI MODULI (Separation of Concerns)
// ==========================================
import { initKioskAuth } from './api/auth.js';
import { inizializzaTabellaGioco, calcolaTolleranze } from './api/bearing-logic.js';
import { esportaLavorazioniInCSV, analizzaImportCSV } from './api/csv-manager.js';
import { analizzaScheda } from './api/vision.js';
import { db, collection, getDocs, doc, setDoc, deleteDoc } from './api/firebase-config.js';

// ==========================================
// 2. STATO GLOBALE DELL'APPLICAZIONE
// ==========================================
const COLLECTION_NAME = "ricette_lavorazione";
let lavorazioni = [];
let idCorrente = null;
let immagineCorrenteData = "";

// ==========================================
// 3. FUNZIONI DI UTILITÀ E ARCHIVIAZIONE CLOUD
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

function leggiNumero(id) {
  const raw = document.getElementById(id).value;
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

// --- Operazioni CRUD asincrone su Firebase Firestore ---

async function caricaDaFirestore() {
  try {
    console.log("[SYS] Richiesta dati a Firestore...");
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const dati = [];
    querySnapshot.forEach((doc) => {
      dati.push({ id: doc.id, ...doc.data() });
    });
    return dati;
  } catch (error) {
    console.error("[SYS] Errore critico nel download dal Cloud:", error);
    alert("Errore di sincronizzazione: impossibile scaricare i dati dal Cloud. Verifica la rete di linea.");
    return [];
  }
}

async function salvaSuFirestore(lav) {
  try {
    const docRef = doc(db, COLLECTION_NAME, lav.id);
    await setDoc(docRef, lav);
    console.log(`[SYS] Documento ${lav.id} sincronizzato nel Cloud.`);
  } catch (error) {
    console.error("[SYS] Errore critico nel salvataggio Cloud:", error);
    throw new Error("Sincronizzazione fallita. La ricetta NON è stata salvata nel database centrale.");
  }
}

async function eliminaDaFirestore(id) {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    console.log(`[SYS] Documento ${id} rimosso dal Cloud.`);
  } catch (error) {
    console.error("[SYS] Errore critico nella rimozione Cloud:", error);
    throw new Error("Cancellazione fallita sul database centrale.");
  }
}

async function caricaImmagineSulCloud(base64Data) {
  // SOSTITUISCI QUESTO URL CON QUELLO DEL TUO WORKER (Quello del tasto blu "Visit")
  const WORKER_URL = "https://bearing-image-router.vocidicassino.workers.dev";

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Data })
  });

  if (!response.ok) {
    throw new Error("Sincronizzazione foto fallita. Il server ha respinto il payload.");
  }

  const data = await response.json();
  return data.url; // Ritorna il link leggerissimo di R2
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
  const btnAi = document.getElementById("btn-ai-extract");

  if (url) {
    img.src = url;
    img.style.display = "block";
    placeholder.style.display = "none";
    if (immagineCorrenteData && btnAi) btnAi.classList.remove("is-hidden");
  } else {
    img.src = "";
    img.style.display = "none";
    placeholder.style.display = "block";
    if (btnAi) btnAi.classList.add("is-hidden");
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
      lav.irDiametro != null ? `d=${lav.irDiametro.toString().replace('.', ',')} mm` : "",
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
  document.getElementById("irDiametro").value = lav.irDiametro !== null ? lav.irDiametro.toString().replace('.', ',') : "";
  document.getElementById("orTipo").value = lav.orTipo || "";
  document.getElementById("diametroSfera").value = lav.diametroSfera !== null ? lav.diametroSfera.toString().replace('.', ',') : "";
  document.getElementById("numeroSfere").value = lav.numeroSfere ?? "";
  document.getElementById("gabbiaTipo").value = lav.gabbiaTipo || "";
  document.getElementById("grassoTipo").value = lav.grassoTipo || "";
  document.getElementById("schermoTipo").value = lav.schermoTipo || "";
  document.getElementById("pesoMin").value = lav.pesoMin !== null ? lav.pesoMin.toString().replace('.', ',') : "";
  document.getElementById("pesoMax").value = lav.pesoMax !== null ? lav.pesoMax.toString().replace('.', ',') : "";
  document.getElementById("classeGioco").value = lav.classeGioco || "";
  document.getElementById("giocoMin").value = lav.giocoMin !== null ? lav.giocoMin.toString().replace('.', ',') : "";
  document.getElementById("giocoMax").value = lav.giocoMax !== null ? lav.giocoMax.toString().replace('.', ',') : "";
  document.getElementById("disegnoUrl").value = lav.disegnoUrl || "";

  immagineCorrenteData = lav.disegnoData || "";
  aggiornaDisegnoPreview(immagineCorrenteData || lav.disegnoUrl || "");

  document.getElementById("stato-modifica").textContent = "Modifica lavorazione esistente";
  document.getElementById("btn-elimina").disabled = false;
  aggiornaStatoSchedaButton();
  renderLista();
}

// ==========================================
// 5. DELEGAZIONE LOGICA DI BUSINESS ASINCRONA
// ==========================================
async function gestisciSubmit(event) {
  event.preventDefault();
  const codice = document.getElementById("codice").value.trim();
  if (!codice) return alert("Inserisci il codice lavorazione (campo obbligatorio).");

  const urlInput = document.getElementById("disegnoUrl");
  const urlNormalizzato = normalizzaUrlImmagine(urlInput.value);
  urlInput.value = urlNormalizzato;

  const btnSubmit = event.target.querySelector('button[type="submit"]');
  const textOriginale = btnSubmit.textContent;
  btnSubmit.textContent = "⏳ Sincronizzazione...";
  btnSubmit.disabled = true;

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

  try {
    await salvaSuFirestore(lav);
    
    const idx = lavorazioni.findIndex((l) => l.id === lav.id);
    if (idx >= 0) lavorazioni[idx] = lav; else lavorazioni.push(lav);

    idCorrente = lav.id;
    renderLista();
    nascondiForm();
  } catch (err) {
    alert(err.message);
  } finally {
    btnSubmit.textContent = textOriginale;
    btnSubmit.disabled = false;
  }
}

function aggiornaGiocoIntegrato() {
  const classVal = document.getElementById("classeGioco").value;
  const diametro = leggiNumero("irDiametro");
  
  const tolleranza = calcolaTolleranze(classVal, diametro);
  
  if (tolleranza) {
    document.getElementById("giocoMin").value = tolleranza.min !== null ? tolleranza.min.toString().replace('.', ',') : "";
    document.getElementById("giocoMax").value = tolleranza.max !== null ? tolleranza.max.toString().replace('.', ',') : "";
  } else {
    document.getElementById("giocoMin").value = "";
    document.getElementById("giocoMax").value = "";
  }
}

// ==========================================
// 6. INIT E BINDING DEGLI EVENTI
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[SYS] Avvio Orchestratore Cloud-Linked...");

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

  lavorazioni = await caricaDaFirestore();
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
  
  document.getElementById("btn-elimina").addEventListener("click", async () => {
    if (!idCorrente || !confirm("Vuoi davvero eliminare questa lavorazione dal Cloud centralizzato?")) return;
    
    const btnElimina = document.getElementById("btn-elimina");
    btnElimina.disabled = true;
    
    try {
      await eliminaDaFirestore(idCorrente);
      lavorazioni = lavorazioni.filter((l) => l.id !== idCorrente);
      resetForm(); nascondiForm(); renderLista();
    } catch (err) {
      alert(err.message);
      btnElimina.disabled = false;
    }
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
      reader.onload = async (ev) => {
        try {
          const nuovi = analizzaImportCSV(ev.target.result, generaId, normalizzaUrlImmagine);
          
          for (const nuovo of nuovi) {
            await salvaSuFirestore(nuovo);
          }
          
          lavorazioni = lavorazioni.concat(nuovi);
          renderLista(); 
          alert("Importazione e sincronizzazione Cloud completate.");
        } catch(err) { alert("Errore importazione CSV: " + err.message); }
      };
      reader.readAsText(file, "utf-8");
    }
    fileImport.value = "";
  });

  document.getElementById("btn-scheda-tecnica").addEventListener("click", () => alert("Visualizzazione scheda tecnica attivata (Modalità temporanea)"));

  // ==========================================
  // 7. BINDING INTELLIGENZA ARTIFICIALE (VISION)
  // ==========================================
  const btnAi = document.getElementById("btn-ai-extract");
  if (btnAi) {
    btnAi.addEventListener("click", async () => {
      if (!immagineCorrenteData) return alert("Carica prima un'immagine.");
      
      const textOriginale = btnAi.textContent;
      btnAi.textContent = "⏳ Analisi in corso...";
      btnAi.disabled = true;

      try {
        const datiEstratti = await analizzaScheda(immagineCorrenteData);
        console.log("[SYS] Dati IA estratti:", datiEstratti);

        const mapCampi = {
          "codice": datiEstratti.codice,
          "irTipo": datiEstratti.irTipo,
          "irDiametro": datiEstratti.irDiametro,
          "orTipo": datiEstratti.orTipo,
          "diametroSfera": datiEstratti.diametroSfera,
          "numeroSfere": datiEstratti.numeroSfere,
          "gabbiaTipo": datiEstratti.gabbiaTipo,
          "grassoTipo": datiEstratti.grassoTipo,
          "schermoTipo": datiEstratti.schermoTipo,
          "pesoMin": datiEstratti.pesoMin,
          "pesoMax": datiEstratti.pesoMax,
          "classeGioco": datiEstratti.classeGioco
        };

        for (const [idCampo, valore] of Object.entries(mapCampi)) {
          if (valore !== null && valore !== undefined) {
            const el = document.getElementById(idCampo);
            if (el) {
              el.value = typeof valore === 'number' ? valore.toString().replace('.', ',') : valore;
              el.style.backgroundColor = "#e0f2fe"; 
              el.style.transition = "background-color 0.5s";
              setTimeout(() => el.style.backgroundColor = "", 3000);
            }
          }
        }
        
        if (datiEstratti.classeGioco && datiEstratti.irDiametro) {
           aggiornaGiocoIntegrato();
        }

      } catch (error) {
        alert("Errore estrazione dati: " + error.message);
      } finally {
        btnAi.textContent = textOriginale;
        btnAi.disabled = false;
      }
    });
  }
});
