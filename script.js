// ============================
// Config gioco radiale per classi (valori indicativi, modificabili dall'utente)
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
let idCorrente = null; // null = nuova lavorazione

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

// ============================
// Rendering lista
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
      <span class="riga-sub">Premi "Nuova lavorazione" per crearne una.</span>
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

    riga.appendChild(info);
    riga.appendChild(badge);
    container.appendChild(riga);
  });
}

// ============================
// Form: carica / reset
// ============================
function resetForm() {
  idCorrente = null;
  document.getElementById("codice").value = "";
  document.getElementById("irTipo").value = "";
  document.getElementById("orTipo").value = "";
  document.getElementById("diametroSfera").value = "";
  document.getElementById("numeroSfere").value = "";
  document.getElementById("gabbiaTipo").value = "";
  document.getElementById("grassoTipo").value = "";
  document.getElementById("pesoMin").value = "";
  document.getElementById("pesoMax").value = "";
  document.getElementById("classeGioco").value = "";
  document.getElementById("giocoMin").value = "";
  document.getElementById("giocoMax").value = "";

  document.getElementById("stato-modifica").textContent = "Nuova lavorazione";
  document.getElementById("btn-elimina").disabled = true;

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
  document.getElementById("pesoMin").value = lav.pesoMin ?? "";
  document.getElementById("pesoMax").value = lav.pesoMax ?? "";
  document.getElementById("classeGioco").value = lav.classeGioco || "";
  document.getElementById("giocoMin").value = lav.giocoMin ?? "";
  document.getElementById("giocoMax").value = lav.giocoMax ?? "";

  document.getElementById("stato-modifica").textContent =
    "Modifica lavorazione esistente";
  document.getElementById("btn-elimina").disabled = false;

  renderLista();
}

// ============================
// Gestione submit form
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
    pesoMin: leggiNumero("pesoMin"),
    pesoMax: leggiNumero("pesoMax"),
    classeGioco: document.getElementById("classeGioco").value || "",
    giocoMin: leggiNumero("giocoMin"),
    giocoMax: leggiNumero("giocoMax")
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
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return n;
}

// ============================
// Elimina lavorazione
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
// Classe gioco -> valori min/max automatici
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
// Inizializzazione
// ============================
document.addEventListener("DOMContentLoaded", () => {
  lavorazioni = caricaDaStorage();
  renderLista();
  resetForm(); // imposta stato "nuova"

  const form = document.getElementById("form-lavorazione");
  form.addEventListener("submit", gestisciSubmit);

  document.getElementById("btn-nuova").addEventListener("click", () => {
    resetForm();
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    resetForm();
  });

  document
    .getElementById("btn-elimina")
    .addEventListener("click", eliminaLavorazioneCorrente);

  document
    .getElementById("classeGioco")
    .addEventListener("change", aggiornaGiocoDaClasse);
});
