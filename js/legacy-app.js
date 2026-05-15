// ============================
// Config gioco radiale (fallback generico)
// ============================
const CLASSI_GIOCO = {
  C2: { min: 2, max: 11 },
  CN: { min: 3, max: 18 },
  C3: { min: 13, max: 28 },
  C4: { min: 23, max: 43 },
  C4H: { min: 30, max: 35 },
  C5: { min: 36, max: 61 },
  C5H: { min: 41, max: 71 }
};

// Tabella caricata da tabella_gioco.csv (se presente)
let tabellaGioco = [];

const STORAGE_KEY = "bearing_recipes_lavorazioni";

let lavorazioni = [];
let idCorrente = null;
let immagineCorrenteData = "";

// ============================
// 1. Normalizzazione URL immagine (Google Drive & co.)
// ============================
function normalizzaUrlImmagine(url) {
  if (!url) return "";
  let u = url.trim();
  if (!u) return "";

  // Link tipo: https://drive.google.com/file/d/ID/view?usp=...
  const matchFile = u.match(/https?:\/\/drive\.google\.com\/file\/d\/([^/]+)\//i);
  if (matchFile && matchFile[1]) {
    const id = matchFile[1];
    return `https://drive.google.com/uc?export=view&id=${id}`;
  }

  // Link tipo: https://drive.google.com/open?id=ID
  const matchOpen = u.match(/https?:\/\/drive\.google\.com\/open\?id=([^&]+)/i);
  if (matchOpen && matchOpen[1]) {
    const id = matchOpen[1];
    return `https://drive.google.com/uc?export=view&id=${id}`;
  }

  return u;
}

// ============================
// 2. Gioco radiale da classe + diametro
// ============================
function trovaGiocoRadialeDaClasseEDiametro(classe, diametro) {
  if (!classe) return null;

  const righeClasse = tabellaGioco.filter(
    (r) => r.classe === classe && r.giocoMin != null && r.giocoMax != null
  );

  if (righeClasse.length > 0) {
    if (diametro != null && !Number.isNaN(diametro)) {
      const match = righeClasse.find((r) => {
        const minOK = r.dMin == null || diametro >= r.dMin;
        const maxOK = r.dMax == null || diametro <= r.dMax;
        return minOK && maxOK;
      });
      if (match) {
        return {
          min: match.giocoMin,
          max: match.giocoMax
        };
      }
    }

    const sommaMin = righeClasse.reduce((s, r) => s + r.giocoMin, 0);
    const sommaMax = righeClasse.reduce((s, r) => s + r.giocoMax, 0);
    const avgMin = Math.round(sommaMin / righeClasse.length);
    const avgMax = Math.round(sommaMax / righeClasse.length);
    return { min: avgMin, max: avgMax };
  }

  const base = CLASSI_GIOCO[classe];
  if (base) {
    return { min: base.min, max: base.max };
  }

  return null;
}

// ============================
// 3. Storage
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
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).substring(2, 8)
  );
}

// ============================
// 4. UI helpers
// ============================
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

function aggiornaStatoSchedaButton() {
  const btn = document.getElementById("btn-scheda-tecnica");
  if (btn) btn.disabled = !idCorrente;
}

function mostraForm() {
  document.getElementById("card-form").classList.remove("is-hidden");
}

function nascondiForm() {
  document.getElementById("card-form").classList.add("is-hidden");
}

// ============================
// 5. Lista lavorazioni (cruscotto)
// ============================
function aggiornaConteggio() {
  const label = document.getElementById("conteggio-lavorazioni");
  if (!label) return;
  if (lavorazioni.length === 0) {
    label.textContent = "Nessuna lavorazione salvata";
  } else if (lavorazioni.length === 1) {
    label.textContent = "1 ricetta salvata";
  } else {
    label.textContent = `${lavorazioni.length} ricette salvate`;
  }
}

function renderLista() {
  const container = document.getElementById("lista-lavorazioni");
  container.innerHTML = "";

  aggiornaConteggio();

  if (lavorazioni.length === 0) {
    const vuoto = document.createElement("div");
    vuoto.className = "riga-lavorazione";
    vuoto.style.cursor = "default";
    vuoto.innerHTML = `<div class="riga-lavorazione-info">
      <span class="riga-codice">Nessuna lavorazione salvata</span>
      <span class="riga-sub">Premi "Nuova" per creare una ricetta di lavorazione.</span>
    </div>`;
    container.appendChild(vuoto);
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
      const top = card.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top, behavior: "smooth" });
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
    const foroTxt = lav.irDiametro != null ? `d=${lav.irDiametro} mm` : "";
    const parts = [irOr, foroTxt, giocoTxt].filter(Boolean);
    sub.textContent = parts.join(" · ");

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

    if (lav.disegnoUrl || lav.disegnoData) {
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
// 6. Form: reset e carica
// ============================
function resetForm() {
  idCorrente = null;
  immagineCorrenteData = "";

  document.getElementById("codice").value = "";
  document.getElementById("irTipo").value = "";
  document.getElementById("irDiametro").value = "";
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

  const fg = document.getElementById("file-galleria");
  const fc = document.getElementById("file-camera");
  if (fg) fg.value = "";
  if (fc) fc.value = "";

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

  const fg = document.getElementById("file-galleria");
  const fc = document.getElementById("file-camera");
  if (fg) fg.value = "";
  if (fc) fc.value = "";

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
// 7. Salvataggio form
// ============================
function leggiNumero(id) {
  const raw = document.getElementById(id).value;
  if (raw === "" || raw === null || raw === undefined) return null;
  const normalized = raw.replace(",", ".");
  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return n;
}

function gestisciSubmit(event) {
  event.preventDefault();

  const codice = document.getElementById("codice").value.trim();
  if (!codice) {
    alert("Inserisci il codice lavorazione (campo obbligatorio).");
    return;
  }

  const urlInput = document.getElementById("disegnoUrl");
  const urlNormalizzato = normalizzaUrlImmagine(urlInput.value);
  urlInput.value = urlNormalizzato; // sovrascrivo il campo con il link corretto

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
  if (idx >= 0) lavorazioni[idx] = lav;
  else lavorazioni.push(lav);

  salvaSuStorage();
  idCorrente = lav.id;
  renderLista();
  nascondiForm();
}

// ============================
// 8. Elimina
// ============================
function eliminaLavorazioneCorrente() {
  if (!idCorrente) return;
  const lav = lavorazioni.find((l) => l.id === idCorrente);
  const nome = lav ? lav.codice : idCorrente;

  if (!confirm(`Vuoi davvero eliminare la lavorazione "${nome}"?`)) return;

  lavorazioni = lavorazioni.filter((l) => l.id !== idCorrente);
  salvaSuStorage();
  idCorrente = null;
  resetForm();
  nascondiForm();
  renderLista();
}

// ============================
// 9. Classe gioco + diametro → min/max
// ============================
function aggiornaGiocoDaClasseEDiametro() {
  const classe = document.getElementById("classeGioco").value;
  const diametro = leggiNumero("irDiametro");

  if (!classe) {
    document.getElementById("giocoMin").value = "";
    document.getElementById("giocoMax").value = "";
    return;
  }

  const result = trovaGiocoRadialeDaClasseEDiametro(classe, diametro);

  if (!result) {
    document.getElementById("giocoMin").value = "";
    document.getElementById("giocoMax").value = "";
    return;
  }

  document.getElementById("giocoMin").value =
    result.min != null ? result.min : "";
  document.getElementById("giocoMax").value =
    result.max != null ? result.max : "";
}

// ============================
// 10. Lettura file disegno (solo per PDF locale)
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
// 11. CSV export/import
// ============================
function escapeCSV(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportToCSV() {
  if (lavorazioni.length === 0) {
    alert("Nessuna lavorazione da esportare.");
    return;
  }

  const headers = [
    "codice",
    "irTipo",
    "irDiametro",
    "orTipo",
    "diametroSfera",
    "numeroSfere",
    "gabbiaTipo",
    "grassoTipo",
    "schermoTipo",
    "pesoMin",
    "pesoMax",
    "classeGioco",
    "giocoMin",
    "giocoMax",
    "disegnoUrl"
  ];

  const rows = lavorazioni.map((l) => [
    l.codice || "",
    l.irTipo || "",
    l.irDiametro ?? "",
    l.orTipo || "",
    l.diametroSfera ?? "",
    l.numeroSfere ?? "",
    l.gabbiaTipo || "",
    l.grassoTipo || "",
    l.schermoTipo || "",
    l.pesoMin ?? "",
    l.pesoMax ?? "",
    l.classeGioco || "",
    l.giocoMin ?? "",
    l.giocoMax ?? "",
    l.disegnoUrl || ""
  ]);

  let csv =
    headers.map(escapeCSV).join(";") +
    "\n" +
    rows.map((r) => r.map(escapeCSV).join(";")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lavorazioni_cuscinetti.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toNumberOrNull(val) {
  if (!val) return null;
  const normalized = val.replace(",", ".");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim());

  function idx(name) {
    return header.indexOf(name);
  }

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep);
    if (parts.length === 1 && parts[0].trim() === "") continue;

    const get = (name) => {
      const id = idx(name);
      if (id === -1 || id >= parts.length) return "";
      return parts[id].trim().replace(/^"|"$/g, "");
    };

    const rec = {
      id: generaId(),
      codice: get("codice"),
      irTipo: get("irTipo"),
      irDiametro: toNumberOrNull(get("irDiametro")),
      orTipo: get("orTipo"),
      diametroSfera: toNumberOrNull(get("diametroSfera")),
      numeroSfere: toNumberOrNull(get("numeroSfere")),
      gabbiaTipo: get("gabbiaTipo"),
      grassoTipo: get("grassoTipo"),
      schermoTipo: get("schermoTipo"),
      pesoMin: toNumberOrNull(get("pesoMin")),
      pesoMax: toNumberOrNull(get("pesoMax")),
      classeGioco: get("classeGioco"),
      giocoMin: toNumberOrNull(get("giocoMin")),
      giocoMax: toNumberOrNull(get("giocoMax")),
      disegnoUrl: normalizzaUrlImmagine(get("disegnoUrl")),
      disegnoData: ""
    };

    if (rec.codice) records.push(rec);
  }

  return records;
}

function importFromCSV(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const nuovi = parseCSV(text);
    if (nuovi.length === 0) {
      alert("Nessun dato valido trovato nel file.");
      return;
    }
    if (
      !confirm(
        `Verranno aggiunte ${nuovi.length} lavorazioni a quelle esistenti. Continuare?`
      )
    ) {
      return;
    }
    lavorazioni = lavorazioni.concat(nuovi);
    salvaSuStorage();
    renderLista();
    alert("Importazione CSV completata.");
  };
  reader.readAsText(file, "utf-8");
}

// ============================
// 12. PDF tutte le ricette
// ============================
function exportToPDF() {
  if (lavorazioni.length === 0) {
    alert("Nessuna lavorazione da esportare.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("Libreria PDF non disponibile.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let y = 12;
  doc.setFontSize(14);
  doc.text("Ricette lavorazione cuscinetti", 10, y);
  y += 6;
  doc.setFontSize(9);

  lavorazioni.forEach((lav, index) => {
    if (y > 270) {
      doc.addPage();
      y = 12;
    }

    doc.setFont(undefined, "bold");
    doc.text(`${index + 1}. ${lav.codice || "(senza codice)"}`, 10, y);
    y += 4;

    doc.setFont(undefined, "normal");
    const line1 = `IR: ${lav.irTipo || "-"} (d=${lav.irDiametro ?? "-"} mm)   OR: ${
      lav.orTipo || "-"
    }`;
    doc.text(line1, 10, y);
    y += 4;

    const line2 = `Sfere: Ø ${lav.diametroSfera ?? "-"}  n=${lav.numeroSfere ?? "-"}   Gabbia: ${
      lav.gabbiaTipo || "-"
    }`;
    doc.text(line2, 10, y);
    y += 4;

    const line3 = `Grasso: ${lav.grassoTipo || "-"}   Schermo: ${
      lav.schermoTipo || "-"
    }`;
    doc.text(line3, 10, y);
    y += 4;

    const line4 = `Peso: ${lav.pesoMin ?? "-"}–${lav.pesoMax ?? "-"} g   Gioco: ${
      lav.classeGioco || "-"
    } ${lav.giocoMin ?? "-"}–${lav.giocoMax ?? "-"} µm`;
    doc.text(line4, 10, y);
    y += 6;
  });

  doc.save("lavorazioni_cuscinetti.pdf");
}

// ============================
// 13. PDF singola scheda tecnica
// ============================
function stampaSchedaCorrente() {
  if (!idCorrente) return;

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("Libreria PDF non disponibile.");
    return;
  }

  const lav = lavorazioni.find((l) => l.id === idCorrente);
  if (!lav) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  let y = 15;
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text(lav.codice || "(senza codice)", 10, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont(undefined, "normal");

  const line1 = `IR: ${lav.irTipo || "-"}  (d=${lav.irDiametro ?? "-"} mm)`;
  const line2 = `OR: ${lav.orTipo || "-"}`;
  const line3 = `Sfere: Ø ${lav.diametroSfera ?? "-"} mm   n=${lav.numeroSfere ?? "-"}`;
  const line4 = `Gabbia: ${lav.gabbiaTipo || "-"}`;
  const line5 = `Grasso: ${lav.grassoTipo || "-"}   Schermo: ${lav.schermoTipo || "-"}`;
  const line6 = `Peso: ${lav.pesoMin ?? "-"}–${lav.pesoMax ?? "-"} g`;
  const line7 = `Gioco radiale: ${lav.classeGioco || "-"}  ${
    lav.giocoMin ?? "-"
  }–${lav.giocoMax ?? "-"} µm`;

  [line1, line2, line3, line4, line5, line6, line7].forEach((t) => {
    doc.text(t, 10, y);
    y += 6;
  });

  const imgData = lav.disegnoData;
  if (imgData) {
    let format = "PNG";
    if (imgData.startsWith("data:image/jpeg")) format = "JPEG";

    const imgWidth = 180;
    const imgHeight = 100;

    if (y + imgHeight > 287) {
      doc.addPage();
      y = 15;
    }

    try {
      doc.addImage(imgData, format, 10, y, imgWidth, imgHeight);
    } catch (e) {
      console.error("Errore addImage:", e);
    }
  }

  const filename =
    "scheda_" + (lav.codice ? lav.codice.replace(/[^\w\-]+/g, "_") : "lavorazione") + ".pdf";
  doc.save(filename);
}

// ============================
// 14. Scheda tecnica (modale)
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
  document.getElementById("scheda-ir-diametro").textContent =
    lav.irDiametro != null ? `${lav.irDiametro} mm` : "-";
  document.getElementById("scheda-sfere").textContent = `Ø ${
    lav.diametroSfera ?? "-"
  } mm · n=${lav.numeroSfere ?? "-"}`;
  document.getElementById("scheda-gabbia").textContent = lav.gabbiaTipo || "-";
  document.getElementById("scheda-grasso").textContent = lav.grassoTipo || "-";
  document.getElementById("scheda-schermo").textContent =
    lav.schermoTipo || "-";
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
// 15. Tabella gioco (da tabella_gioco.csv, opzionale)
// ============================
async function caricaTabellaGioco() {
  try {
    const resp = await fetch("tabella_gioco.csv");
    if (!resp.ok) {
      console.warn("tabella_gioco.csv non trovata");
      return;
    }
    const text = await resp.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length <= 1) return;

    const header = lines[0].split(";").map((h) => h.trim());
    const idx = (name) => header.indexOf(name);

    tabellaGioco = lines.slice(1).map((line) => {
      const parts = line.split(";");
      const get = (name) => {
        const i = idx(name);
        if (i === -1 || i >= parts.length) return "";
        return parts[i].trim();
      };
      const dMin = Number(get("d_min").replace(",", "."));
      const dMax = Number(get("d_max").replace(",", "."));
      const classe = get("classe");
      const gMin = Number(get("gioco_min").replace(",", "."));
      const gMax = Number(get("gioco_max").replace(",", "."));

      return {
        dMin: Number.isNaN(dMin) ? null : dMin,
        dMax: Number.isNaN(dMax) ? null : dMax,
        classe: classe || "",
        giocoMin: Number.isNaN(gMin) ? null : gMin,
        giocoMax: Number.isNaN(gMax) ? null : gMax
      };
    });

    const select = document.getElementById("classeGioco");
    if (select) {
      const classi = Array.from(
        new Set(tabellaGioco.map((r) => r.classe).filter((c) => c))
      ).sort();

      select.innerHTML = "";
      const optEmpty = document.createElement("option");
      optEmpty.value = "";
      optEmpty.textContent = "Seleziona classe…";
      select.appendChild(optEmpty);

      classi.forEach((cls) => {
        const opt = document.createElement("option");
        opt.value = cls;
        opt.textContent = cls;
        select.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Errore caricando tabella_gioco.csv:", e);
  }
}

// ============================
// 16. Init
// ============================
document.addEventListener("DOMContentLoaded", () => {
  caricaTabellaGioco();

  lavorazioni = caricaDaStorage();
  renderLista();
  resetForm();
  nascondiForm();

  const form = document.getElementById("form-lavorazione");
  form.addEventListener("submit", gestisciSubmit);

  document.getElementById("btn-nuova").addEventListener("click", () => {
    resetForm();
    mostraForm();
    const card = document.getElementById("card-form");
    const top = card.getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top, behavior: "smooth" });
  });

  document.getElementById("btn-reset").addEventListener("click", resetForm);
  document
    .getElementById("btn-elimina")
    .addEventListener("click", eliminaLavorazioneCorrente);

  document
    .getElementById("classeGioco")
    .addEventListener("change", aggiornaGiocoDaClasseEDiametro);
  document
    .getElementById("irDiametro")
    .addEventListener("change", aggiornaGiocoDaClasseEDiametro);

  // ✅ conversione automatica dei link Drive appena li incolli
  document
    .getElementById("disegnoUrl")
    .addEventListener("change", (e) => {
      const norm = normalizzaUrlImmagine(e.target.value);
      e.target.value = norm;
      if (!immagineCorrenteData) aggiornaDisegnoPreview(norm);
    });

  document
    .getElementById("btn-file-galleria")
    .addEventListener("click", () =>
      document.getElementById("file-galleria").click()
    );
  document
    .getElementById("btn-file-camera")
    .addEventListener("click", () =>
      document.getElementById("file-camera").click()
    );

  document.getElementById("file-galleria").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) leggiFileDisegno(file);
  });

  document.getElementById("file-camera").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) leggiFileDisegno(file);
  });

  document
    .getElementById("btn-export-csv")
    .addEventListener("click", exportToCSV);
  document
    .getElementById("btn-export-pdf")
    .addEventListener("click", exportToPDF);

  const fileImport = document.getElementById("file-import");
  document.getElementById("btn-import").addEventListener("click", () => {
    fileImport.click();
  });
  fileImport.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importFromCSV(file);
    fileImport.value = "";
  });

  document
    .getElementById("btn-scheda-tecnica")
    .addEventListener("click", apriSchedaTecnica);
  document
    .getElementById("scheda-close")
    .addEventListener("click", chiudiSchedaTecnica);
  document
    .getElementById("scheda-save-pdf")
    .addEventListener("click", stampaSchedaCorrente);
});
