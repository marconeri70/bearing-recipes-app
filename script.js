// ============================
// Config gioco radiale per classi
// ============================
const CLASSI_GIOCO = {
  C2: { min: 2, max: 11 },
  CN: { min: 3, max: 18 },
  C3: { min: 13, max: 28 },
  C4: { min: 23, max: 43 },
  C5: { min: 36, max: 61 }
};

const STORAGE_KEY = "bearing_recipes_lavorazioni";

let lavorazioni = [];
let idCorrente = null;
let immagineCorrenteData = "";

// ============================
// Utility
// ============================
function salvaSuStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lavorazioni));
}

function caricaDaStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Errore parsing storage:", e);
    return [];
  }
}

function generaId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 8);
}

function aggiornaDisegnoPreview(url) {
  const img = document.getElementById("drawing-image");
  const placeholder = document.getElementById("drawing-placeholder");

  if (url && url.trim() !== "") {
    img.src = url.trim();
    img.style.display = "block";
    placeholder.style.display = "none";
  } else {
    img.src = "";
    img.style.display = "none";
    placeholder.style.display = "block";
  }
}

function aggiornaStatoSchedaButton() {
  const btn = document.getElementById("btn-scheda-tecnica");
  btn.disabled = !idCorrente;
}

// ============================
// Lista lavorazioni
// ============================
function renderLista() {
  const container = document.getElementById("lista-lavorazioni");
  container.innerHTML = "";

  if (lavorazioni.length === 0) {
    const vuoto = document.createElement("div");
    vuoto.className = "riga-lavorazione";
    vuoto.style.cursor = "default";
    vuoto.innerHTML = `<div class="riga-lavorazione-info">
      <span class="riga-codice">Nessuna lavorazione salvata</span>
      <span class="riga-sub">Premi "Nuova" per crearne una.</span>
    </div>`;
    container.appendChild(vuoto);
    return;
  }

  lavorazioni.forEach((lav) => {
    const riga = document.createElement("div");
    riga.className = "riga-lavorazione";
    if (lav.id === idCorrente) {
      riga.classList.add("active");
    }

    riga.addEventListener("click", () => {
      caricaLavorazioneInForm(lav.id);
    });

    const info = document.createElement("div");
    info.className = "riga-lavorazione-info";

    const codice = document.createElement("span");
    codice.className = "riga-codice";
    codice.textContent = lav.codice || "(senza codice)";

    const sub = document.createElement("span");
    sub.className = "riga-sub";
    const irOr = [lav.irTipo, lav.orTipo].filter(Boolean).join(" | ");
    const giocoTxt =
      lav.classeGioco && lav.giocoMin != null && lav.giocoMax != null
        ? `Gioco ${lav.classeGioco}: ${lav.giocoMin}–${lav.giocoMax} µm`
        : "";
    sub.textContent = irOr ? `${irOr}${giocoTxt ? " · " + giocoTxt : ""}` : giocoTxt;

    info.appendChild(codice);
    info.appendChild(sub);

    const badge = document.createElement("div");
    badge.className = "riga-actions";

    if (lav.classeGioco) {
      const b = document.createElement("span");
      b.className = "badge badge-gioco";
      const minStr = lav.giocoMin != null ? lav.giocoMin : "?";
      const maxStr = lav.giocoMax != null ? lav.giocoMax : "?";
      b.textContent = `${lav.classeGioco} ${minStr}–${maxStr} µm`;
      badge.appendChild(b);
    }

    if ((lav.disegnoData && lav.disegnoData !== "") || (lav.disegnoUrl && lav.disegnoUrl !== "")) {
      const d = document.createElement("span");
      d.className = "badge badge-disegno";
      d.textContent = "Disegno";
      badge.appendChild(d);
    }

    riga.appendChild(info);
    riga.appendChild(badge);
    container.appendChild(riga);
  });
}

// ============================
// Form: reset e carica
// ============================
function resetForm() {
  idCorrente = null;
  immagineCorrenteData = "";

  document.getElementById("codice").value = "";
  document.getElementById("irTipo").value = "";
  document.getElementById("orTipo").value = "";
  document.getElementById("diametroSfera").value = "";
  document.getElementById("numeroSfere").value = "";
  document.getElementById("gabbiaTipo").value = "";
  document.getElementById("grassoTipo").value = "";
  document.getElementById("schermoTipo").value = "";
  document.getElementById("pesoMin").value = "";
  document.getElementById("pesoMax").value = "";
  document.getElementById("classeGioco").value = "";
  document.getElementById("giocoMin").value = "";
  document.getElementById("giocoMax").value = "";
  document.getElementById("disegnoUrl").value = "";
  const fileInput = document.getElementById("disegnoFile");
  if (fileInput) fileInput.value = "";

  document.getElementById("stato-modifica").textContent = "Nuova lavorazione";
  document.getElementById("btn-elimina").disabled = true;

  aggiornaDisegnoPreview("");
  aggiornaStatoSchedaButton();
  renderLista();
}

function caricaLavorazioneInForm(id) {
  const lav = lavorazioni.find((l) => l.id === id);
  if (!lav) return;

  idCorrente = id;
  document.getElementById("codice").value = lav.codice || "";
  document.getElementById("irTipo").value = lav.irTipo || "";
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

  const fileInput = document.getElementById("disegnoFile");
  if (fileInput) fileInput.value = "";

  immagineCorrenteData = lav.disegnoData || "";

  const sorgente = immagineCorrenteData || lav.disegnoUrl || "";
  aggiornaDisegnoPreview(sorgente);

  document.getElementById("stato-modifica").textContent =
    "Modifica lavorazione esistente";
  document.getElementById("btn-elimina").disabled = false;

  aggiornaStatoSchedaButton();
  renderLista();
}

// ============================
// Salvataggio form
// ============================
function gestisciSubmit(event) {
  event.preventDefault();

  const codice = document.getElementById("codice").value.trim();
  if (!codice) {
    alert("Inserisci il codice lavorazione (campo obbligatorio).");
    return;
  }

  const lav = {
    id: idCorrente || generaId(),
    codice,
    irTipo: document.getElementById("irTipo").value.trim(),
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
    disegnoUrl: document.getElementById("disegnoUrl").value.trim(),
    disegnoData: immagineCorrenteData
  };

  const idx = lavorazioni.findIndex((l) => l.id === lav.id);
  if (idx >= 0) {
    lavorazioni[idx] = lav;
  } else {
    lavorazioni.push(lav);
  }

  salvaSuStorage();
  idCorrente = lav.id;
  caricaLavorazioneInForm(lav.id);
  renderLista();
}

function leggiNumero(id) {
  const raw = document.getElementById(id).value;
  if (raw === "" || raw === null || raw === undefined) return null;
  const normalized = raw.replace(",", ".");
  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return n;
}

// ============================
// Elimina
// ============================
function eliminaLavorazioneCorrente() {
  if (!idCorrente) return;
  const lav = lavorazioni.find((l) => l.id === idCorrente);
  const nome = lav ? lav.codice : idCorrente;

  if (!confirm(`Vuoi davvero eliminare la lavorazione "${nome}"?`)) return;

  lavorazioni = lavorazioni.filter((l) => l.id !== idCorrente);
  salvaSuStorage();
  resetForm();
  renderLista();
}

// ============================
// Classe gioco → min/max
// ============================
function aggiornaGiocoDaClasse() {
  const classe = document.getElementById("classeGioco").value;
  const campoMin = document.getElementById("giocoMin");
  const campoMax = document.getElementById("giocoMax");

  if (!classe || !CLASSI_GIOCO[classe]) return;

  const { min, max } = CLASSI_GIOCO[classe];
  campoMin.value = min;
  campoMax.value = max;
}

// ============================
// File disegno
// ============================
function leggiFileDisegno(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    immagineCorrenteData = dataUrl;
    aggiornaDisegnoPreview(dataUrl);
  };
  reader.readAsDataURL(file);
}

// ============================
// Export CSV / Import CSV / Export PDF
// (uguale alla versione precedente)
// ============================
/* ... per brevità, qui va tutto il codice di exportToCSV, importFromCSV, exportToPDF
   che ti ho dato nel messaggio precedente: copialo identico, NON cambiare nulla.  */

/* --- INCOLLA QUI da "function escapeCSV" fino alla fine delle funzioni export/import PDF
   del file precedente (sono identiche) --- */

/* Per non farti impazzire: puoi anche riusare direttamente il tuo script.js
   precedente e solo AGGIUNGERE sotto le nuove funzioni di scheda tecnica
   che metto qui sotto. Se preferisci, però, sostituisci l'intero file con
   quello che avevi prima + queste funzioni aggiuntive. */

// ============================
// Scheda tecnica (modale)
// ============================
function apriSchedaTecnica() {
  if (!idCorrente) return;
  const lav = lavorazioni.find((l) => l.id === idCorrente);
  if (!lav) return;

  document.getElementById("scheda-codice").textContent =
    lav.codice || "(senza codice)";

  const subParts = [];
  if (lav.irTipo) subParts.push(`IR: ${lav.irTipo}`);
  if (lav.orTipo) subParts.push(`OR: ${lav.orTipo}`);
  document.getElementById("scheda-sub").textContent = subParts.join(" · ");

  document.getElementById("scheda-ir").textContent = lav.irTipo || "-";
  document.getElementById("scheda-or").textContent = lav.orTipo || "-";
  document.getElementById("scheda-sfere").textContent = `Ø ${
    lav.diametroSfera ?? "-"
  } mm · n=${lav.numeroSfere ?? "-"}`;
  document.getElementById("scheda-gabbia").textContent = lav.gabbiaTipo || "-";
  document.getElementById("scheda-grasso").textContent = lav.grassoTipo || "-";
  document.getElementById("scheda-schermo").textContent = lav.schermoTipo || "-";
  document.getElementById("scheda-peso").textContent =
    lav.pesoMin != null || lav.pesoMax != null
      ? `${lav.pesoMin ?? "-"} – ${lav.pesoMax ?? "-"} g`
      : "-";
  document.getElementById("scheda-gioco").textContent =
    lav.classeGioco || lav.giocoMin != null || lav.giocoMax != null
      ? `${lav.classeGioco || ""} ${
          lav.giocoMin ?? "-"
        } – ${lav.giocoMax ?? "-"} µm`
      : "-";

  const img = document.getElementById("scheda-drawing-image");
  const ph = document.getElementById("scheda-drawing-placeholder");
  const src = lav.disegnoData || lav.disegnoUrl || "";

  if (src) {
    img.src = src;
    img.style.display = "block";
    ph.style.display = "none";
  } else {
    img.src = "";
    img.style.display = "none";
    ph.style.display = "block";
  }

  document.getElementById("scheda-modal").classList.remove("hidden");
}

function chiudiSchedaTecnica() {
  document.getElementById("scheda-modal").classList.add("hidden");
}

// ============================
// Init
// ============================
document.addEventListener("DOMContentLoaded", () => {
  lavorazioni = caricaDaStorage();
  renderLista();
  resetForm();

  const form = document.getElementById("form-lavorazione");
  form.addEventListener("submit", gestisciSubmit);

  document.getElementById("btn-nuova").addEventListener("click", resetForm);
  document.getElementById("btn-reset").addEventListener("click", resetForm);
  document
    .getElementById("btn-elimina")
    .addEventListener("click", eliminaLavorazioneCorrente);

  document
    .getElementById("classeGioco")
    .addEventListener("change", aggiornaGiocoDaClasse);

  document
    .getElementById("disegnoUrl")
    .addEventListener("change", (e) => {
      if (!immagineCorrenteData) {
        aggiornaDisegnoPreview(e.target.value);
      }
    });

  const fileDisegno = document.getElementById("disegnoFile");
  fileDisegno.addEventListener("change", (e) => {
    const file = e.target.files[0];
    leggiFileDisegno(file);
  });

  // IMPORT/EXPORT: lascia quelli che hai già (btn-export-csv, btn-export-pdf, btn-import)

  // Scheda tecnica
  document
    .getElementById("btn-scheda-tecnica")
    .addEventListener("click", apriSchedaTecnica);
  document
    .getElementById("scheda-close")
    .addEventListener("click", chiudiSchedaTecnica);
  document
    .getElementById("scheda-modal")
    .addEventListener("click", (e) => {
      if (e.target.id === "scheda-modal" || e.target.classList.contains("modal-backdrop")) {
        chiudiSchedaTecnica();
      }
    });
});
