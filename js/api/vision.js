// js/api/vision.js

// INSERISCI LA TUA VERA CHIAVE QUI SOTTO (Mantenendo le virgolette)
const GEMINI_API_KEY = "AIzaSyBdvQDBipxvoZq7Cy_hoSQ3R9bNJanL5rA"; 

export async function analizzaScheda(base64Image) {
  const apiKey = GEMINI_API_KEY.trim();
  
  if (!apiKey || apiKey.length < 30) {
    throw new Error("API Key mancante o non valida. Verifica il file vision.js.");
  }

  const base64Data = base64Image.split(',')[1];
  const mimeType = base64Image.split(';')[0].split(':')[1] || "image/jpeg";

  // CORREZIONE CHIRURGICA: Rimosso "-latest". L'URL ora punta al modello stabile.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
Sei un ingegnere meccanico. Estrai i parametri tecnici da questa scheda di cuscinetti.
Non inserire spiegazioni. Non usare formattazione Markdown. 
Restituisci ESATTAMENTE E SOLO un oggetto JSON grezzo con queste esatte chiavi. 
Se un dato non è presente nell'immagine o non sei sicuro, imposta il valore a null. I numeri decimali devono usare il punto.

{
  "codice": string|null,
  "irTipo": string|null,
  "irDiametro": number|null,
  "orTipo": string|null,
  "diametroSfera": number|null,
  "numeroSfere": number|null,
  "gabbiaTipo": string|null,
  "grassoTipo": string|null,
  "schermoTipo": string|null,
  "pesoMin": number|null,
  "pesoMax": number|null,
  "classeGioco": string|null
}`;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1, 
      topK: 1,
      topP: 1,
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      console.error("[SYS] Errore API Google Dettagliato:", errorDetails);
      throw new Error(`Errore Server API: ${response.status}. Premi F12 e guarda la Console per i dettagli.`);
    }

    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text;
    
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    return JSON.parse(rawText);

  } catch (error) {
    console.error("[SYS] Errore modulo Vision:", error);
    throw error;
  }
}
