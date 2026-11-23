# Ricette Lavorazione Cuscinetti — v6

## Prima di installare
**Non cancellare i dati di Chrome e non disinstallare la PWA finché non hai esportato un backup.**
Le ricette attuali restano su localStorage del browser, chiave `bearing_recipes_lavorazioni_v2`.
Le vecchie chiavi `bearing_recipes*` non vengono cancellate o modificate da v6.
La funzione `↩️ Recupera vecchie ricette` cerca le ricette dei vecchi formati senza eliminare gli originali.

## Miglioramenti
- Backup JSON completo dei **dati della ricetta e URL dei disegni**; import JSON non distruttivo.
- Import CSV con riconoscimento duplicati e prevenzione import della tabella gioco per errore.
- Salvataggi transazionali: niente falso messaggio di successo se lo spazio è esaurito.
- Controllo tolleranze: **mai min/max dedotti, mediati o fallback**. Segnala ambiguità e nessuna corrispondenza.
- Tocco sulla ricetta -> scheda tecnica; modifica/duplica separate; stampa/PDF via browser.
- Foto temporanee per IA; upload R2 automatico *quando configurato*.
- Chiave Gemini non presente nel frontend; IA disponibile solo dopo il collegamento del Worker.

## Configurazione facoltativa Cloudflare R2 + IA
1. Crea un bucket R2 `bearing-recipes-images` in Cloudflare.
2. Crea un Worker usando `cloudflare/worker.js` e configura il binding R2 `BEARING_IMAGES`.
3. Configura `ALLOWED_ORIGIN=https://marconeri70.github.io` e i segreti con `wrangler secret put UPLOAD_TOKEN` e `wrangler secret put GEMINI_API_KEY` (ruota la precedente chiave già pubblicata nel repository).
4. Distribuisci il Worker: conserva il suo URL HTTPS. ATTENZIONE: gli URL delle immagini del Worker sono pubblici per chi li possiede, con identificatore casuale. Non usare per disegni confidenziali senza controllo accessi.
5. Nella PWA premi `☁️ Configura archivio foto`, incolla l'URL e, al primo caricamento, il token segreto del Worker. Il token resta nella sessione del browser, non nel repository.
6. Selezionando/scattando una foto l'app caricherà automaticamente su R2 e compilerà il campo URL; il tasto IA la invierà al Worker per estrarre i valori. Controlla sempre manualmente le schede e le tolleranze.

**Senza Worker già configurato:** backup, ricette, import/export, foto temporanee e schede tecniche restano funzionanti; l'upload automatico e l'estrazione IA online non sono attivi.

## Sicurezza
I precedenti file JavaScript contenevano credenziali IA in chiaro (anche se spezzate in due). Rimuoverle dal codice nuovo **non le elimina dalla cronologia Git**. Revoca/ruota la vecchia chiave dal pannello Google Cloud/AI Studio. Il modulo PIN dimostrativo non fornisce autenticazione sicura: non utilizzarlo per dati riservati.

## Installazione
Sostituisci i file rispettando le cartelle, incluso `js/api/cloud-client.js`. Aggiorna GitHub Pages. Ricarica la pagina normalmente; **non cancellare dati del sito**. Il service worker `v12` sostituisce la cache precedente.