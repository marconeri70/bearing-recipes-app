// js/main.js - Ricette Lavorazione Cuscinetti
import { analizzaScheda } from "./api/vision.js";
// Versione stabile localStorage + import CSV robusto + Google Drive thumbnail.

const STORAGE_KEY = "bearing_recipes_lavorazioni_v2";

const CLASSI_FALLBACK = {
  C2: { min: 2, max: 11 },
  CN: { min: 3, max: 18 },
  C3: { min: 13, max: 28 },
  C3L: { min: 14, max: 23 },
  C3H: { min: 17, max: 43 },
  C4: { min: 23, max: 43 },
  C4L: { min: 22, max: 53 },
  C4H: { min: 30, max: 35 },
  C5: { min: 36, max: 61 },
  C5L: { min: 35, max: 62 },
  C5H: { min: 41, max: 71 },
  CNL: { min: 10, max: 16 },
  CNH: { min: 10, max: 28 }
};

let tabellaGioco = [];
let lavorazioni = [];
let idCorrente = null;
let immagineCorrenteData = "";
let filtroTesto = "";
let filtroClasse = "";

function $(id) {
  return document.getElementById(id);
}

function generaId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function leggiNumero(id) {
  return toNumberOrNull($(id).value);
}

function escapeCSV(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[;",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function parseCsvLine(line, sep) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(v => v.trim());
}

function detectSeparator(firstLine) {
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  return semi >= comma ? ";" : ",";
}

function estraiGoogleDriveId(url) {
  if (!url) return "";
  const u = String(url).trim();
  let m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (m && m[1]) return m[1];
  m = u.match(/[?&]id=([^&]+)/i);
  if (m && m[1]) return decodeURIComponent(m[1]);
  return "";
}

function normalizzaUrlImmagine(url) {
  if (!url) return "";
  const u = String(url).trim();
  if (!u) return "";

  const driveId = estraiGoogleDriveId(u);
  if (driveId) {
    // Endpoint più affidabile per <img> rispetto a /uc?export=view.
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w2000`;
  }

  return u;
}

function aggiornaDisegnoPreview(url) {
  const img = $("drawing-image");
  const placeholder = $("drawing-placeholder");
  const btnIA = $("btn-analizza-ia");
  if (!img || !placeholder) return;

  const finalUrl = normalizzaUrlImmagine(url);
  const isBase64Image = typeof finalUrl === "string" && finalUrl.startsWith("data:image");

  if (btnIA) {
    // L'estrazione IA funziona sulla foto caricata/scattata, non su link Drive esterni.
    btnIA.classList.toggle("is-hidden", !isBase64Image);
  }

  if (!finalUrl) {
    img.removeAttribute("src");
    img.style.display = "none";
    placeholder.textContent = "Nessun disegno caricato";
    placeholder.style.display = "block";
    return;
  }

  placeholder.textContent = "Caricamento disegno...";
  placeholder.style.display = "block";
  img.style.display = "none";

  img.onload = () => {
    placeholder.style.display = "none";
    img.style.display = "block";
  };
  img.onerror = () => {
    placeholder.textContent = "Immagine non disponibile: controlla permessi Drive o URL.";
    placeholder.style.display = "block";
    img.style.display = "none";
  };
  img.src = finalUrl;
  img.onclick = () => apriZoomImmagine(finalUrl);
}

function apriZoomImmagine(src) {
  const modal = $("image-zoom-modal");
  const img = $("zoomed-image");
  if (!modal || !img || !src) return;
  img.src = src;
  modal.classList.remove("is-hidden");
}

function chiudiZoomImmagine() {
  const modal = $("image-zoom-modal");
  if (modal) modal.classList.add("is-hidden");
}

function mostraForm() {
  const card = $("card-form");
  if (card) card.classList.remove("is-hidden");
}

function nascondiForm() {
  const card = $("card-form");
  if (card) card.classList.add("is-hidden");
}

function aggiornaStatoSchedaButton() {
  const btn = $("btn-scheda-tecnica");
  if (btn) btn.disabled = !idCorrente;
}

function salvaSuStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lavorazioni));
  } catch (error) {
    console.error(error);
    alert("Memoria locale piena. Usa link URL per le immagini, non foto interne grandi.");
  }
}

function caricaDaStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function aggiornaConteggio() {
  const label = $("recipes-count");
  if (label) label.textContent = lavorazioni.length;
}

function ricetteFiltrate() {
  let lista = [...lavorazioni];
  if (filtroTesto) {
    const q = filtroTesto.toLowerCase();
    lista = lista.filter(lav => [lav.codice, lav.irTipo, lav.orTipo, lav.gabbiaTipo, lav.schermoTipo]
      .filter(Boolean).join(" ").toLowerCase().includes(q));
  }
  if (filtroClasse) lista = lista.filter(lav => lav.classeGioco === filtroClasse);
  lista.sort((a, b) => String(a.codice || "").localeCompare(String(b.codice || "")));
  return lista;
}

function renderLista() {
  const container = $("lista-lavorazioni");
  if (!container) return;
  container.innerHTML = "";
  aggiornaConteggio();

  const lista = ricetteFiltrate();
  if (lista.length === 0) {
    container.innerHTML = `<div class="riga-lavorazione empty-row"><div class="riga-lavorazione-info"><span class="riga-codice">Nessuna ricetta trovata</span><span class="riga-sub">Premi “Nuova” o modifica i filtri.</span></div></div>`;
    return;
  }

  lista.forEach((lav) => {
    const riga = document.createElement("div");
    riga.className = "riga-lavorazione";
    if (lav.id === idCorrente) riga.classList.add("active");

    riga.addEventListener("click", () => {
      caricaLavorazioneInForm(lav.id);
      mostraForm();
      const card = $("card-form");
      if (card) window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
    });

    const left = document.createElement("div");
    left.className = "riga-left-content";

    const imgUrl = normalizzaUrlImmagine(lav.disegnoUrl || "");
    if (imgUrl) {
      const thumb = document.createElement("img");
      thumb.className = "riga-thumb";
      thumb.src = imgUrl;
      thumb.alt = "Disegno";
      thumb.referrerPolicy = "no-referrer";
      left.appendChild(thumb);
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
      lav.classeGioco ? `Gioco ${lav.classeGioco}: ${lav.giocoMin ?? "?"}–${lav.giocoMax ?? "?"} µm` : ""
    ].filter(Boolean);
    sub.textContent = parts.join(" · ");
    info.append(codice, sub);
    left.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "riga-actions";
    if (lav.classeGioco) {
      const badge = document.createElement("span");
      badge.className = "badge badge-gioco";
      badge.textContent = lav.classeGioco;
      actions.appendChild(badge);
    }
    if (lav.disegnoUrl) {
      const badge = document.createElement("span");
      badge.className = "badge badge-disegno";
      badge.textContent = "Disegno";
      actions.appendChild(badge);
    }

    riga.append(left, actions);
    container.appendChild(riga);
  });
}

function resetForm() {
  idCorrente = null;
  immagineCorrenteData = "";
  const form = $("form-lavorazione");
  if (form) form.reset();
  const fileGalleria = $("file-galleria");
  const fileCamera = $("file-camera");
  if (fileGalleria) fileGalleria.value = "";
  if (fileCamera) fileCamera.value = "";
  $("stato-modifica").textContent = "Nuova lavorazione";
  $("btn-elimina").disabled = true;
  aggiornaDisegnoPreview("");
  aggiornaStatoSchedaButton();
  renderLista();
}

function caricaLavorazioneInForm(id) {
  const lav = lavorazioni.find(l => l.id === id);
  if (!lav) return;
  idCorrente = id;
  $("codice").value = lav.codice || "";
  $("irTipo").value = lav.irTipo || "";
  $("irDiametro").value = lav.irDiametro ?? "";
  $("orTipo").value = lav.orTipo || "";
  $("diametroSfera").value = lav.diametroSfera ?? "";
  $("numeroSfere").value = lav.numeroSfere ?? "";
  $("gabbiaTipo").value = lav.gabbiaTipo || "";
  $("grassoTipo").value = lav.grassoTipo || "";
  $("schermoTipo").value = lav.schermoTipo || "";
  $("pesoMin").value = lav.pesoMin ?? "";
  $("pesoMax").value = lav.pesoMax ?? "";
  $("classeGioco").value = lav.classeGioco || "";
  $("giocoMin").value = lav.giocoMin ?? "";
  $("giocoMax").value = lav.giocoMax ?? "";
  $("disegnoUrl").value = lav.disegnoUrl || "";
  immagineCorrenteData = lav.disegnoData || "";
  aggiornaDisegnoPreview(immagineCorrenteData || lav.disegnoUrl || "");
  $("stato-modifica").textContent = "Modifica lavorazione esistente";
  $("btn-elimina").disabled = false;
  aggiornaStatoSchedaButton();
  renderLista();
}

function leggiDatiForm() {
  const rawUrl = $("disegnoUrl").value;
  const finalUrl = normalizzaUrlImmagine(rawUrl);
  $("disegnoUrl").value = finalUrl;
  return {
    id: idCorrente || generaId(),
    codice: $("codice").value.trim(),
    irTipo: $("irTipo").value.trim(),
    irDiametro: leggiNumero("irDiametro"),
    orTipo: $("orTipo").value.trim(),
    diametroSfera: leggiNumero("diametroSfera"),
    numeroSfere: leggiNumero("numeroSfere"),
    gabbiaTipo: $("gabbiaTipo").value.trim(),
    grassoTipo: $("grassoTipo").value.trim(),
    schermoTipo: $("schermoTipo").value.trim(),
    pesoMin: leggiNumero("pesoMin"),
    pesoMax: leggiNumero("pesoMax"),
    classeGioco: $("classeGioco").value,
    giocoMin: leggiNumero("giocoMin"),
    giocoMax: leggiNumero("giocoMax"),
    disegnoUrl: finalUrl,
    // Salvo data solo se immagine caricata da file. Consiglio: usare URL per molte ricette.
    disegnoData: immagineCorrenteData || ""
  };
}

function gestisciSubmit(event) {
  event.preventDefault();
  const lav = leggiDatiForm();
  if (!lav.codice) return alert("Inserisci il codice lavorazione.");
  const idx = lavorazioni.findIndex(l => l.id === lav.id);
  if (idx >= 0) lavorazioni[idx] = lav;
  else lavorazioni.push(lav);
  idCorrente = lav.id;
  salvaSuStorage();
  renderLista();
  nascondiForm();
  alert("Lavorazione salvata.");
}

function eliminaCorrente() {
  if (!idCorrente) return alert("Nessuna lavorazione selezionata.");
  const lav = lavorazioni.find(l => l.id === idCorrente);
  if (!confirm(`Eliminare “${lav?.codice || idCorrente}”?`)) return;
  lavorazioni = lavorazioni.filter(l => l.id !== idCorrente);
  salvaSuStorage();
  resetForm();
  nascondiForm();
}

async function inizializzaTabellaGioco() {
  try {
    const resp = await fetch("./tabella_gioco.csv", { cache: "no-store" });
    if (!resp.ok) throw new Error("CSV gioco non trovato");
    const text = await resp.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return Object.keys(CLASSI_FALLBACK).sort();
    const sep = detectSeparator(lines[0]);
    const header = parseCsvLine(lines[0], sep);
    const idx = name => header.indexOf(name);
    tabellaGioco = lines.slice(1).map(line => {
      const p = parseCsvLine(line, sep);
      return {
        dMin: toNumberOrNull(p[idx("d_min")]),
        dMax: toNumberOrNull(p[idx("d_max")]),
        classe: p[idx("classe")] || "",
        giocoMin: toNumberOrNull(p[idx("gioco_min")]),
        giocoMax: toNumberOrNull(p[idx("gioco_max")])
      };
    }).filter(r => r.classe);
    return Array.from(new Set(tabellaGioco.map(r => r.classe))).sort();
  } catch (error) {
    console.warn("Tabella gioco fallback:", error);
    return Object.keys(CLASSI_FALLBACK).sort();
  }
}

function calcolaTolleranze(classe, diametro) {
  if (!classe) return null;
  const d = Number(diametro);
  const righe = tabellaGioco.filter(r => r.classe === classe);
  if (righe.length && !Number.isNaN(d)) {
    const match = righe.find(r => {
      const minOk = r.dMin == null || d >= r.dMin;
      const maxOk = r.dMax == null || d <= r.dMax;
      return minOk && maxOk;
    });
    if (match) return { min: match.giocoMin, max: match.giocoMax };
  }
  if (righe.length) return { min: righe[0].giocoMin, max: righe[0].giocoMax };
  return CLASSI_FALLBACK[classe] || null;
}

function aggiornaGiocoIntegrato() {
  const classe = $("classeGioco").value;
  const diametro = leggiNumero("irDiametro");
  const result = calcolaTolleranze(classe, diametro);
  $("giocoMin").value = result?.min ?? "";
  $("giocoMax").value = result?.max ?? "";
}

function exportToCSV() {
  if (!lavorazioni.length) return alert("Nessuna lavorazione salvata.");
  const headers = ["codice", "irTipo", "irDiametro", "orTipo", "diametroSfera", "numeroSfere", "gabbiaTipo", "grassoTipo", "schermoTipo", "pesoMin", "pesoMax", "classeGioco", "giocoMin", "giocoMax", "disegnoUrl"];
  const rows = lavorazioni.map(lav => headers.map(h => escapeCSV(lav[h] ?? "")).join(";"));
  const csv = headers.join(";") + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lavorazioni_cuscinetti.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getByHeader(row, header, aliases) {
  for (const a of aliases) {
    const i = header.indexOf(a);
    if (i >= 0) return row[i] || "";
  }
  return "";
}

function parseImportCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = detectSeparator(lines[0]);
  const headerRaw = parseCsvLine(lines[0], sep).map(h => h.trim());
  const header = headerRaw.map(h => h.replace(/^\uFEFF/, ""));
  const hasHeader = header.some(h => ["codice", "code", "irTipo", "irType", "classeGioco", "clearanceClass"].includes(h));
  const start = hasHeader ? 1 : 0;
  const records = [];

  for (let i = start; i < lines.length; i++) {
    const row = parseCsvLine(lines[i], sep);
    let rec;
    if (hasHeader) {
      rec = {
        id: generaId(),
        codice: getByHeader(row, header, ["codice", "code", "Codice", "Codice lavorazione"]),
        irTipo: getByHeader(row, header, ["irTipo", "irType", "IR", "IR - Tipo"]),
        irDiametro: toNumberOrNull(getByHeader(row, header, ["irDiametro", "irBore", "Diametro foro IR", "d_min", "diametro"])),
        orTipo: getByHeader(row, header, ["orTipo", "orType", "OR", "OR - Tipo"]),
        diametroSfera: toNumberOrNull(getByHeader(row, header, ["diametroSfera", "ballDiameter", "Sfera - Diametro (mm)"])),
        numeroSfere: toNumberOrNull(getByHeader(row, header, ["numeroSfere", "ballCount", "Sfera - Numero sfere (n)"])),
        gabbiaTipo: getByHeader(row, header, ["gabbiaTipo", "cageType", "Gabbia - Tipo"]),
        grassoTipo: getByHeader(row, header, ["grassoTipo", "greaseType", "Grasso - Tipo"]),
        schermoTipo: getByHeader(row, header, ["schermoTipo", "sealType", "Schermo / Tenuta"]),
        pesoMin: toNumberOrNull(getByHeader(row, header, ["pesoMin", "weightMin"])),
        pesoMax: toNumberOrNull(getByHeader(row, header, ["pesoMax", "weightMax"])),
        classeGioco: getByHeader(row, header, ["classeGioco", "clearanceClass", "classe"]),
        giocoMin: toNumberOrNull(getByHeader(row, header, ["giocoMin", "clearanceMin", "gioco_min"])),
        giocoMax: toNumberOrNull(getByHeader(row, header, ["giocoMax", "clearanceMax", "gioco_max"])),
        disegnoUrl: normalizzaUrlImmagine(getByHeader(row, header, ["disegnoUrl", "imageUrl", "URL immagine"])),
        disegnoData: ""
      };
    } else {
      rec = {
        id: generaId(),
        codice: row[0] || "",
        irTipo: row[1] || "",
        irDiametro: toNumberOrNull(row[2]),
        orTipo: row[3] || "",
        diametroSfera: toNumberOrNull(row[4]),
        numeroSfere: toNumberOrNull(row[5]),
        gabbiaTipo: row[6] || "",
        grassoTipo: row[7] || "",
        schermoTipo: row[8] || "",
        pesoMin: toNumberOrNull(row[9]),
        pesoMax: toNumberOrNull(row[10]),
        classeGioco: row[11] || "",
        giocoMin: toNumberOrNull(row[12]),
        giocoMax: toNumberOrNull(row[13]),
        disegnoUrl: normalizzaUrlImmagine(row[14] || ""),
        disegnoData: ""
      };
    }
    if (rec.codice) records.push(rec);
  }
  return records;
}

function importFromCSV(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const nuovi = parseImportCSV(ev.target.result);
      if (!nuovi.length) return alert("Nessun dato valido trovato nel CSV.");
      if (!confirm(`Importare ${nuovi.length} ricette?`)) return;
      lavorazioni = lavorazioni.concat(nuovi);
      salvaSuStorage();
      renderLista();
      alert("Importazione completata.");
    } catch (error) {
      console.error(error);
      alert("Errore importazione CSV: " + error.message);
    }
  };
  reader.readAsText(file, "utf-8");
}

function apriSchedaTecnica() {
  const lav = lavorazioni.find(l => l.id === idCorrente);
  if (!lav) return alert("Seleziona prima una lavorazione.");
  $("scheda-codice").textContent = lav.codice || "Scheda tecnica";
  $("scheda-sub").textContent = `IR: ${lav.irTipo || "-"} · OR: ${lav.orTipo || "-"}`;
  $("scheda-ir").textContent = lav.irTipo || "-";
  $("scheda-or").textContent = lav.orTipo || "-";
  $("scheda-ir-diametro").textContent = lav.irDiametro != null ? `${lav.irDiametro} mm` : "-";
  $("scheda-sfere").textContent = `Ø ${lav.diametroSfera ?? "-"} mm · n=${lav.numeroSfere ?? "-"}`;
  $("scheda-gabbia").textContent = lav.gabbiaTipo || "-";
  $("scheda-grasso").textContent = lav.grassoTipo || "-";
  $("scheda-schermo").textContent = lav.schermoTipo || "-";
  $("scheda-peso").textContent = lav.pesoMin != null || lav.pesoMax != null ? `${lav.pesoMin ?? "-"} – ${lav.pesoMax ?? "-"} g` : "-";
  $("scheda-gioco").textContent = lav.classeGioco || lav.giocoMin != null || lav.giocoMax != null ? `${lav.classeGioco || ""} ${lav.giocoMin ?? "-"} – ${lav.giocoMax ?? "-"} µm` : "-";

  const img = $("scheda-drawing-image");
  const ph = $("scheda-drawing-placeholder");
  const src = lav.disegnoData || normalizzaUrlImmagine(lav.disegnoUrl || "");
  img.style.display = "none";
  ph.style.display = "block";
  if (!src) {
    img.removeAttribute("src");
    ph.textContent = "Nessun disegno caricato";
  } else {
    ph.textContent = "Caricamento disegno...";
    img.onload = () => { ph.style.display = "none"; img.style.display = "block"; };
    img.onerror = () => { ph.textContent = "Immagine non disponibile: controlla condivisione Drive."; img.style.display = "none"; };
    img.src = src;
  }
  $("scheda-modal").classList.remove("is-hidden");
}

function chiudiSchedaTecnica() {
  const modal = $("scheda-modal");
  if (modal) modal.classList.add("is-hidden");
}

function stampaScheda() {
  const content = document.querySelector("#scheda-modal .modal-content");
  if (!content) return;
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>${$("scheda-codice").textContent}</title><link rel="stylesheet" href="./css/styles.css"></head><body>${content.outerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

function impostaCampoSePresente(id, valore) {
  const campo = $(id);
  if (!campo || valore === null || valore === undefined || valore === "") return false;
  campo.value = String(valore).replace(",", ".");
  campo.classList.add("campo-estratto");
  setTimeout(() => campo.classList.remove("campo-estratto"), 3500);
  return true;
}

function applicaDatiEstratti(dati) {
  if (!dati || typeof dati !== "object") return 0;

  let compilati = 0;
  const mappa = {
    codice: "codice",
    irTipo: "irTipo",
    irDiametro: "irDiametro",
    orTipo: "orTipo",
    diametroSfera: "diametroSfera",
    numeroSfere: "numeroSfere",
    gabbiaTipo: "gabbiaTipo",
    grassoTipo: "grassoTipo",
    schermoTipo: "schermoTipo",
    pesoMin: "pesoMin",
    pesoMax: "pesoMax",
    classeGioco: "classeGioco"
  };

  Object.entries(mappa).forEach(([chiave, id]) => {
    if (impostaCampoSePresente(id, dati[chiave])) compilati++;
  });

  if (dati.classeGioco || dati.irDiametro) {
    aggiornaGiocoIntegrato();
  }

  return compilati;
}

async function analizzaSchedaConIA() {
  if (!immagineCorrenteData || !immagineCorrenteData.startsWith("data:image")) {
    alert("Per estrarre i dati devi prima scegliere una foto dalla galleria o scattare una foto. I link Drive esterni servono per visualizzare il disegno, non per l'estrazione automatica.");
    return;
  }

  const btn = $("btn-analizza-ia");
  const testoOriginale = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Estrazione in corso...";
  }

  try {
    const dati = await analizzaScheda(immagineCorrenteData);
    const compilati = applicaDatiEstratti(dati);
    if (compilati > 0) {
      alert(`Estrazione completata: ${compilati} campi compilati. Controlla sempre i valori prima di salvare.`);
    } else {
      alert("L'IA non ha trovato dati sicuri da compilare. Prova con una foto più nitida e ben illuminata.");
    }
  } catch (error) {
    console.error(error);
    alert("Estrazione dati non riuscita: " + (error.message || error));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = testoOriginale || "🤖 Estrai dati dalla scheda";
    }
  }
}

function caricaFileDisegno(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    immagineCorrenteData = ev.target.result;
    aggiornaDisegnoPreview(immagineCorrenteData);
  };
  reader.readAsDataURL(file);
}

function aggiornaSelectClassi(classi) {
  const select = $("classeGioco");
  const filtro = $("filtro-classe");
  if (!select) return;
  select.innerHTML = '<option value="">Seleziona...</option>';
  if (filtro) filtro.innerHTML = '<option value="">Tutte le classi</option>';
  classi.forEach(cls => {
    const opt = document.createElement("option");
    opt.value = cls;
    opt.textContent = cls;
    select.appendChild(opt);
    if (filtro) {
      const opt2 = document.createElement("option");
      opt2.value = cls;
      opt2.textContent = cls;
      filtro.appendChild(opt2);
    }
  });
}

function disattivaKiosk() {
  const overlay = $("kiosk-overlay");
  if (overlay) overlay.classList.add("is-hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  disattivaKiosk();
  const classi = await inizializzaTabellaGioco();
  aggiornaSelectClassi(classi);

  lavorazioni = caricaDaStorage();
  renderLista();
  resetForm();
  nascondiForm();

  $("form-lavorazione").addEventListener("submit", gestisciSubmit);
  $("btn-nuova").addEventListener("click", () => {
    resetForm();
    mostraForm();
    const card = $("card-form");
    if (card) window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
  });
  $("btn-reset").addEventListener("click", resetForm);
  $("btn-elimina").addEventListener("click", eliminaCorrente);
  $("classeGioco").addEventListener("change", aggiornaGiocoIntegrato);
  $("irDiametro").addEventListener("change", aggiornaGiocoIntegrato);

  $("disegnoUrl").addEventListener("input", (e) => {
    // Non tocchiamo mentre l'utente scrive, ma aggiorniamo se è già link drive completo.
    if (estraiGoogleDriveId(e.target.value)) aggiornaDisegnoPreview(normalizzaUrlImmagine(e.target.value));
  });
  $("disegnoUrl").addEventListener("change", (e) => {
    e.target.value = normalizzaUrlImmagine(e.target.value);
    if (!immagineCorrenteData) aggiornaDisegnoPreview(e.target.value);
  });

  $("btn-file-galleria").addEventListener("click", () => $("file-galleria").click());
  $("file-galleria").addEventListener("change", (e) => {
    caricaFileDisegno(e.target.files[0]);
    e.target.value = "";
  });

  $("btn-file-camera").addEventListener("click", () => $("file-camera").click());
  $("file-camera").addEventListener("change", (e) => {
    caricaFileDisegno(e.target.files[0]);
    e.target.value = "";
  });

  $("btn-analizza-ia")?.addEventListener("click", analizzaSchedaConIA);
  $("btn-export-csv").addEventListener("click", exportToCSV);
  $("btn-import").addEventListener("click", () => $("file-import").click());
  $("file-import").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importFromCSV(file);
    e.target.value = "";
  });

  $("btn-scheda-tecnica").addEventListener("click", apriSchedaTecnica);
  $("scheda-close").addEventListener("click", chiudiSchedaTecnica);
  $("scheda-save-pdf").addEventListener("click", stampaScheda);
  document.querySelector("#scheda-modal .modal-backdrop")?.addEventListener("click", chiudiSchedaTecnica);
  $("btn-close-zoom")?.addEventListener("click", chiudiZoomImmagine);

  $("filtro-ricette")?.addEventListener("input", (e) => { filtroTesto = e.target.value; renderLista(); });
  $("filtro-classe")?.addEventListener("change", (e) => { filtroClasse = e.target.value; renderLista(); });
});
