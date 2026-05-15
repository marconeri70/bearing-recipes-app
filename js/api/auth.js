// js/api/auth.js

// Database locale dei PIN (In futuro verrà sincronizzato con Firebase)
const OPERATOR_CACHE = {
  "1234": { id: "OP_TECH_01", name: "Marco", role: "technician" },
  "0000": { id: "OP_LINE_01", name: "Linea 1", role: "operator" }
};

let currentPin = "";
let sessionTimeout = null;
const SESSION_DURATION_MS = 10 * 60 * 1000; // 10 Minuti di inattività

// Riferimenti agli elementi DOM
const lockScreen = document.getElementById('kiosk-lock-screen');
const appContent = document.getElementById('app-content');
const operatorInfo = document.getElementById('operator-info-display');
const dots = [
  document.getElementById('dot-1'),
  document.getElementById('dot-2'),
  document.getElementById('dot-3'),
  document.getElementById('dot-4')
];

/**
 * Inizializza gli ascoltatori per il tastierino numerico
 */
export function initKioskAuth() {
  // Binding numeri
  document.querySelectorAll('.num-btn[data-val]').forEach(btn => {
    btn.onclick = () => handlePinInput(btn.getAttribute('data-val'));
  });

  // Binding tasti azione
  const btnClear = document.getElementById('btn-clear');
  const btnEnter = document.getElementById('btn-enter');
  
  if (btnClear) btnClear.onclick = clearPin;
  if (btnEnter) btnEnter.onclick = validatePin;

  // Reset del timer ad ogni interazione dell'utente
  document.addEventListener('touchstart', resetInactivityTimer, { passive: true });
  document.addEventListener('click', resetInactivityTimer, { passive: true });
}

function handlePinInput(num) {
  if (currentPin.length < 4) {
    currentPin += num;
    updateDots();
  }
}

function clearPin() {
  currentPin = "";
  updateDots();
}

function updateDots() {
  dots.forEach((dot, index) => {
    if (dot) {
      dot.classList.toggle('active', index < currentPin.length);
    }
  });
}

function validatePin() {
  if (currentPin.length !== 4) return;

  const operator = OPERATOR_CACHE[currentPin];
  
  if (operator) {
    unlockTerminal(operator);
  } else {
    // Feedback visivo errore
    lockScreen.classList.add('error-shake');
    setTimeout(() => {
      lockScreen.classList.remove('error-shake');
      clearPin();
    }, 400);
  }
}

function unlockTerminal(operator) {
  lockScreen.classList.add('is-hidden');
  appContent.style.display = 'block';
  
  if (operatorInfo) {
    operatorInfo.textContent = `Operatore: ${operator.name} | Sessione: ${operator.role.toUpperCase()}`;
  }
  
  // Applica restrizioni di sicurezza in base al ruolo
  const btnNuova = document.getElementById('btn-nuova');
  if (operator.role === 'operator' && btnNuova) {
    btnNuova.remove(); // Un operatore semplice non può creare nuove ricette
  }

  resetInactivityTimer();
  clearPin();
  console.log(`[AUTH] Accesso garantito a ${operator.name}`);
}

export function lockTerminal() {
  lockScreen.classList.remove('is-hidden');
  appContent.style.display = 'none';
  clearTimeout(sessionTimeout);
}

function resetInactivityTimer() {
  if (lockScreen.classList.contains('is-hidden')) {
    clearTimeout(sessionTimeout);
    sessionTimeout = setTimeout(() => {
      lockTerminal();
    }, SESSION_DURATION_MS);
  }
}
