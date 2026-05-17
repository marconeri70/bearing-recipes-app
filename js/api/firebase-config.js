// js/api/firebase-config.js

// 1. Importazione dei moduli Core di Firebase dal CDN ufficiale di Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 2. Le tue chiavi di sicurezza (Sostituisci questi valori con i tuoi reali)
const firebaseConfig = {
  apiKey: "AIzaSyAQxk4xo055FKow482z9d9Svw_HHZt4gKo",
  authDomain: "skf-terminal-ricette.firebaseapp.com",
  projectId: "skf-terminal-ricette",
  storageBucket: "skf-terminal-ricette.firebasestorage.app",
  messagingSenderId: "30386766951",
  appId: "1:30386766951:web:c537aca1dd756ed778c0c2"
};

// 3. Inizializzazione dell'infrastruttura
const app = initializeApp(firebaseConfig);

// 4. Innesco del Database
const db = getFirestore(app);

// 5. ESPORTAZIONE CRITICA: Permette a main.js di usare il database
export { db };
