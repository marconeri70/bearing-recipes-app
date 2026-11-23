// Configurazione cloud personale. NON inserire token o chiavi segrete nel repository.
const ENDPOINT_KEY = "bearing_recipes_cloud_endpoint";
const SESSION_TOKEN_KEY = "bearing_recipes_cloud_session_token";

export function getCloudEndpoint() {
  try {
    const endpoint = localStorage.getItem(ENDPOINT_KEY) || "";
    const url = new URL(endpoint);
    return url.protocol === "https:" ? url.origin : "";
  } catch { return ""; }
}

export function configuraCloud() {
  const current = getCloudEndpoint();
  const answer = prompt("Indirizzo HTTPS del Worker Cloudflare per immagini e IA (lascia vuoto per disabilitare):", current);
  if (answer === null) return;
  if (!answer.trim()) {
    localStorage.removeItem(ENDPOINT_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    return;
  }
  try {
    const u = new URL(answer.trim());
    if (u.protocol !== "https:" || !u.hostname) throw new Error("Solo HTTPS");
    localStorage.setItem(ENDPOINT_KEY, u.origin);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    alert("Collegamento configurato. Il token privato sarà richiesto al primo caricamento della sessione.");
  } catch {
    alert("Inserisci un indirizzo HTTPS valido del tuo Worker Cloudflare.");
  }
}

function tokenSessione() {
  let token = sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (!token) {
    token = prompt("Token segreto del tuo archivio Cloudflare (non viene pubblicato su GitHub):", "");
    if (!token || !token.trim()) throw new Error("Token non inserito: operazione annullata");
    sessionStorage.setItem(SESSION_TOKEN_KEY, token.trim());
  }
  return token;
}

async function callCloud(path, init) {
  const endpoint = getCloudEndpoint();
  if (!endpoint) throw new Error("Archivio cloud non configurato. Premi Configura archivio foto.");
  const token = tokenSessione();
  let response;
  try {
    response = await fetch(endpoint + path, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new Error("Connessione cloud non riuscita. Verifica indirizzo Worker e connessione.");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) sessionStorage.removeItem(SESSION_TOKEN_KEY);
    let data;
    try { data = await response.json(); } catch { data = {}; }
    throw new Error(data.error || `Errore cloud HTTP ${response.status}`);
  }
  return response.json();
}

export async function caricaFotoSuCloud(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Usa JPG, PNG o WebP");
  const result = await callCloud("/upload", {
    method: "POST", headers: { "Content-Type": file.type }, body: file
  });
  if (!result.url || !result.url.startsWith("https://")) throw new Error("L'archivio non ha restituito un URL valido");
  return result.url;
}

export async function estraiDatiConCloud(base64Image) {
  if (!base64Image?.startsWith("data:image/")) throw new Error("Carica prima una foto");
  const result = await callCloud("/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image })
  });
  if (!result.fields || typeof result.fields !== "object") throw new Error("Risposta IA non valida");
  return result.fields;
}