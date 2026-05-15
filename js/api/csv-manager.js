// js/api/csv-manager.js

// Funzione interna pura
function escapeCSV(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toNumberOrNull(val) {
  if (!val) return null;
  const n = Number(val.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

/**
 * Riceve un array di ricette e innesca il download del file.
 */
export function esportaLavorazioniInCSV(lavorazioniArray) {
  if (!Array.isArray(lavorazioniArray) || lavorazioniArray.length === 0) {
    throw new Error("Nessun dato fornito per l'esportazione.");
  }

  const headers = [
    "codice", "irTipo", "irDiametro", "orTipo", "diametroSfera", "numeroSfere",
    "gabbiaTipo", "grassoTipo", "schermoTipo", "pesoMin", "pesoMax",
    "classeGioco", "giocoMin", "giocoMax", "disegnoUrl"
  ];

  const rows = lavorazioniArray.map((l) => [
    l.codice || "", l.irTipo || "", l.irDiametro ?? "", l.orTipo || "",
    l.diametroSfera ?? "", l.numeroSfere ?? "", l.gabbiaTipo || "",
    l.grassoTipo || "", l.schermoTipo || "", l.pesoMin ?? "", l.pesoMax ?? "",
    l.classeGioco || "", l.giocoMin ?? "", l.giocoMax ?? "", l.disegnoUrl || ""
  ]);

  const csvContent = headers.map(escapeCSV).join(";") + "\n" +
                     rows.map((r) => r.map(escapeCSV).join(";")).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `lavorazioni_export_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Analizza una stringa testuale CSV e restituisce un array strutturato di ricette.
 */
export function analizzaImportCSV(csvText, generaIdCallback, normalizzaUrlCallback) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new Error("File CSV vuoto.");

  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim());
  const idx = (name) => header.indexOf(name);
  
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep);
    if (parts.length === 1 && parts[0].trim() === "") continue;

    const get = (name) => {
      const id = idx(name);
      return (id === -1 || id >= parts.length) ? "" : parts[id].trim().replace(/^"|"$/g, "");
    };

    const codice = get("codice");
    if (!codice) continue; // Salta righe invalide senza codice

    records.push({
      id: generaIdCallback(), 
      codice: codice,
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
      disegnoUrl: normalizzaUrlCallback(get("disegnoUrl")),
      disegnoData: ""
    });
  }

  return records;
}
