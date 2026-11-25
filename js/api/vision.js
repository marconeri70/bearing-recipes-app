// Estrazione intelligente: la chiave del provider resta un segreto del Worker Cloudflare.
// Le immagini vengono inviate solo dopo che l'utente preme "Estrai dati".
import { estraiDatiConCloud } from "./cloud-client.js";

export async function analizzaScheda(base64Image) {
  return estraiDatiConCloud(base64Image);
}