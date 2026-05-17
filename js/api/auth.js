// js/api/auth.js

// Database locale dei PIN (In futuro verrà sincronizzato con Firebase)
const OPERATOR_CACHE = {
  "1234": { id: "OP_TECH_01", name: "Marco", role: "technician" },
  "0000": { id: "OP_LINE_01", name: "Linea 1", role: "operator" }
};

let sessionTimeout = null;
const SESSION_DURATION_MS = 10 * 60 * 1000; // 10 Minuti di inattività

/**
 * Inizializza gli ascoltatori per il nuovo tastierino nativo
 */
export function initKioskAuth() {
  const btnUnlock = document.getElementById('btn-kiosk-unlock');
  const pinInput = document.getElementById('kiosk-pin');

  // Binding del bottone Sblocca
  if (btnUnlock) {
    btnUnlock.addEventListener('click', validatePin);
  }

  // Binding del tasto "Invio" sulla tastiera del tablet
  if (pinInput) {
    pinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') validatePin();
    });
  }

  // Reset del timer ad ogni interazione dell'utente sulla linea (Null-safe)
  document.addEventListener('touchstart', resetInactivityTimer, { passive: true });
  document.addEventListener('click', resetInactivityTimer, { passive: true });
  document.addEventListener('keypress', resetInactivityTimer, { passive: true });
}

function validatePin() {
  const pinInput = document.getElementById('kiosk-pin');
  const errorMsg = document.getElementById('kiosk-error');
  
  if (!pinInput) return; // Programmazione difensiva
  const currentPin = pinInput.value;

  const operator = OPERATOR_CACHE[currentPin];
  
  if (operator) {
    if (errorMsg) errorMsg.classList.add('is-hidden');
    unlockTerminal(operator);
  } else {
    // Feedback visivo errore
    if (errorMsg) errorMsg.classList.remove('is-hidden');
    pinInput.value = ""; // Svuota il campo per riprovare
    pinInput.focus();
    
    // Nascondi l'errore dopo 2 secondi
    setTimeout(() => {
      if (errorMsg) errorMsg.classList.add('is-hidden');
    }, 2000);
  }
}

function unlockTerminal(operator) {
  const lockScreen = document.getElementById('kiosk-overlay');
  const pinInput = document.getElementById('kiosk-pin');

  // Sblocco dell'interfaccia
  if (lockScreen) lockScreen.classList.add('is-hidden');
  if (pinInput) pinInput.value = ""; // Pulisce il PIN dalla memoria visiva

  // Gestione permessi e ruoli
  const btnNuova = document.getElementById('btn-nuova');
  if (operator.role === 'operator' && btnNuova) {
    btnNuova.style.display = 'none'; // Un operatore semplice non può creare nuove ricette
  } else if (btnNuova) {
    btnNuova.style.display = 'inline-block'; // Ripristina per i tecnici
  }

  resetInactivityTimer();
  console.log(`[AUTH] Accesso garantito a ${operator.name}`);
}

export function lockTerminal() {
  const lockScreen = document.getElementById('kiosk-overlay');
  if (lockScreen) {
    lockScreen.classList.remove('is-hidden');
    const pinInput = document.getElementById('kiosk-pin');
    if (pinInput) {
      pinInput.value = "";
      // Leggera pausa per permettere al DOM di riattivarsi prima di forzare il focus
      setTimeout(() => pinInput.focus(), 100); 
    }
  }
  clearTimeout(sessionTimeout);
}

function resetInactivityTimer() {
  const lockScreen = document.getElementById('kiosk-overlay');
  
  // FIX CRITICO ALLA RIGA 108: Programmazione difensiva contro i null.
  // Controlla che lockScreen esista prima di cercare le sue classi.
  if (lockScreen && lockScreen.classList.contains('is-hidden')) {
    clearTimeout(sessionTimeout);
    sessionTimeout = setTimeout(() => {
      lockTerminal();
    }, SESSION_DURATION_MS);
  }
}
