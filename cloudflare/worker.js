// Cloudflare Worker: R2 upload + Gemini OCR. Non include segreti.
// Configura le variabili/binding nel pannello Cloudflare (vedi README).
const MAX_PHOTO = 8 * 1024 * 1024;
const PROMPT = `Sei un tecnico esperto di disegni di cuscinetti. Estrai SOLO i dati leggibili.
Restituisci un JSON senza markdown con queste chiavi, null se non identificabile:
{"codice":null,"irTipo":null,"irDiametro":null,"orTipo":null,"diametroSfera":null,"numeroSfere":null,"gabbiaTipo":null,"grassoTipo":null,"schermoTipo":null,"pesoMin":null,"pesoMax":null,"classeGioco":null}
Non dedurre valori non presenti, non aggiungere misure non visibili. Numeri con punto decimale.`;

function json(value, status = 200, origin = "") {
  return new Response(JSON.stringify(value), { status, headers: {
    "Content-Type": "application/json;charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin || "null",
    "Vary": "Origin"
  }});
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "https://marconeri70.github.io";
    const cors = origin === allowed ? allowed : "";
    if (request.method === "OPTIONS") {
      if (!cors) return new Response(null, {status: 403});
      return new Response(null, {status: 204, headers: {
        "Access-Control-Allow-Origin": cors,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin"
      }});
    }
    if (request.method === "GET" && u.pathname.startsWith("/image/")) {
      const key = u.pathname.slice(7);
      if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) return new Response("Not found",{status:404});
      const object = await env.BEARING_IMAGES.get(key);
      if (!object) return new Response("Not found",{status:404});
      return new Response(object.body, {
        headers: {
          "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
          "Cache-Control": "public,max-age=86400",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }
    if (!cors) return json({error: "Origine non autorizzata"}, 403, cors);
    if (request.method !== "POST" || !["/upload","/vision"].includes(u.pathname)) return json({error:"Route non disponibile"},404,cors);
    if (!env.UPLOAD_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.UPLOAD_TOKEN}`) {
      return json({error:"Token non valido"},401,cors);
    }
    try {
      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > MAX_PHOTO * 1.4) return json({error:"File troppo grande"},413,cors);
      if (u.pathname === "/upload") {
        const type = request.headers.get("Content-Type") || "";
        const extension = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[type];
        if (!extension) return json({error:"Solo JPG/PNG/WebP"},415,cors);
        const buffer = await request.arrayBuffer();
        if (!buffer.byteLength || buffer.byteLength > MAX_PHOTO) return json({error:"Foto vuota o > 8MB"},413,cors);
        const key = crypto.randomUUID() + "." + extension;
        await env.BEARING_IMAGES.put(key, buffer, {httpMetadata:{contentType:type}});
        return json({url:`${u.origin}/image/${key}`},201,cors);
      }
      if (!env.GEMINI_API_KEY) return json({error:"Chiave IA non configurata nel Worker"},503,cors);
      const body = await request.json();
      const image = typeof body.image === "string" ? body.image : "";
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
      if (!match || image.length > MAX_PHOTO * 1.4) return json({error:"Immagine non valida"},400,cors);
      const provider = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(env.GEMINI_API_KEY), {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({contents:[{parts:[{text:PROMPT},{inlineData:{mimeType:match[1],data:match[2]}}]}],generationConfig:{temperature:0.1,responseMimeType:"application/json"}})
      });
      if (!provider.ok) return json({error:`Provider IA HTTP ${provider.status}`},502,cors);
      const result = await provider.json();
      const raw = result.candidates?.[0]?.content?.parts?.find(p=>p.text)?.text;
      if (!raw) return json({error:"Nessuna informazione letta dalla foto"},422,cors);
      const fields = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      return json({fields},200,cors);
    } catch(e) {
      console.error("Worker error",e);
      return json({error:"Errore interno Worker"},500,cors);
    }
  }
};