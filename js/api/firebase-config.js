// js/api/firebase-config.js

// Importazione diretta dai server Google (Versione 10.11.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// ==========================================
// INSERISCI QUI LE TUE CHIAVI FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAQxk4xo055FKow482z9d9Svw_HHZt4gKo",
  authDomain: "skf-terminal-ricette.firebaseapp.com",
  projectId: "skf-terminal-ricette",
  storageBucket: "skf-terminal-ricette.firebasestorage.app",
  messagingSenderId: "30386766951",
  appId: "1:30386766951:web:c537aca1dd756ed778c0c2"
};

// Inizializza l'app Firebase
const app = initializeApp(firebaseConfig);

// Inizializza e esporta il database Firestore
export const db = getFirestore(app);

// Esporta anche le funzioni necessarie per le query
export { collection, getDocs, doc, setDoc, deleteDoc };

console.log("[SYS] Firebase Firestore Inizializzato.");
