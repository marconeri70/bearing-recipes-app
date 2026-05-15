// js/api/bearing-logic.js

const CLASSI_GIOCO = {
  C2: { min: 2, max: 11 },
  CN: { min: 3, max: 18 },
  C3: { min: 13, max: 28 },
  C4: { min: 23, max: 43 },
  C4H: { min: 30, max: 35 },
  C5: { min: 36, max: 61 },
  C5H: { min: 41, max: 71 }
};

let tabellaGiocoConfig = [];

/**
 * Scarica e analizza in background il file CSV delle configurazioni di base.
 * Ritorna le classi di gioco disponibili in modo che la UI possa creare la select.
 */
export async function inizializzaTabellaGioco(url = "tabella_gioco.csv") {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[SYS] File configurazione ${url} non trovato. Fallback ai valori standard.`);
      return Object.keys(CLASSI_GIOCO); 
    }
    const text = await resp.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length <= 1) return Object.keys(CLASSI_GIOCO);

    const header = lines[0].split(";").map((h) => h.trim());
    const idx = (name) => header.indexOf(name);

    tabellaGiocoConfig = lines.slice(1).map((line) => {
      const parts = line.split(";");
      const get = (name) => {
        const i = idx(name);
        if (i === -1 || i >= parts.length) return "";
        return parts[i].trim();
      };
      
      const dMin = Number(get("d_min").replace(",", "."));
      const dMax = Number(get("d_max").replace(",", "."));
      const gMin = Number(get("gioco_min").replace(",", "."));
      const gMax = Number(get("gioco_max").replace(",", "."));

      return {
        dMin: Number.isNaN(dMin) ? null : dMin,
        dMax: Number.isNaN(dMax) ? null : dMax,
        classe: get("classe") || "",
        giocoMin: Number.isNaN(gMin) ? null : gMin,
        giocoMax: Number.isNaN(gMax) ? null : gMax
      };
    });

    // Ritorna un array pulito di classi per popolare la UI
    return Array.from(new Set(tabellaGiocoConfig.map((r) => r.classe).filter(Boolean))).sort();

  } catch (e) {
    console.error("[SYS] Errore critico nel parsing della tabella gioco:", e);
    return Object.keys(CLASSI_GIOCO);
  }
}

/**
 * Calcola il gioco radiale esatto. Motore di calcolo puro.
 * Restituisce { min: number, max: number } oppure null.
 */
export function calcolaTolleranze(classe, diametro) {
  if (!classe) return null;

  const righeClasse = tabellaGiocoConfig.filter(
    (r) => r.classe === classe && r.giocoMin != null && r.giocoMax != null
  );

  if (righeClasse.length > 0) {
    // Cerca il match esatto per il diametro
    if (diametro != null && !Number.isNaN(diametro)) {
      const match = righeClasse.find((r) => {
        const minOK = r.dMin == null || diametro >= r.dMin;
        const maxOK = r.dMax == null || diametro <= r.dMax;
        return minOK && maxOK;
      });
      if (match) return { min: match.giocoMin, max: match.giocoMax };
    }

    // Media di fallback se il diametro non è specificato
    const avgMin = Math.round(righeClasse.reduce((s, r) => s + r.giocoMin, 0) / righeClasse.length);
    const avgMax = Math.round(righeClasse.reduce((s, r) => s + r.giocoMax, 0) / righeClasse.length);
    return { min: avgMin, max: avgMax };
  }

  // Fallback alle costanti hardcodate
  const base = CLASSI_GIOCO[classe];
  return base ? { min: base.min, max: base.max } : null;
}
