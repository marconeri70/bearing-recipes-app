# Ricette Lavorazione Cuscinetti — integrazione tabella SKF normale (v7)

Questa versione parte dal pacchetto v6: **non azzera o migra** il localStorage delle ricette.

## Nuova tabella
Dalla fotografia della tabella SKF (stampata 20/07/2020) sono state trascritte 109 coppie min/max in micrometri per **C2, CN, C3, C4, C5** per cuscinetto completo, foro cilindrico, precisione normale, d ≤ 180 mm, con carico di misura.

File: `tabella_gioco_normale_skf.csv` (colonne `serie;d_min;d_max;classe;gioco_min;gioco_max;codice_min;codice_max;carico_misura_documento;fonte`).
Le serie nel documento sono BCG02 (d>2,5–7), BCG04 (d>7–120), BCG06 (d>24–180). BCG04 e BCG06 **si sovrappongono** per alcuni diametri e hanno valori diversi: la nuova scelta della serie elimina l'ambiguità.
I codici `BCGxxK`/`BCGxxG` riprendono le intestazioni di colonna originali; il campo `carico_misura_documento` trascrive testualmente ±2, ±5, ±15 dalla colonna del documento, senza interpretare ulteriormente le condizioni di prova.
Per d>2,5 a ≤7 la foto non riporta limiti C5: il CSV non inventa valori.

## Utilizzo
Nel modulo «Parametri di Qualità» scegli «Riferimento SKF del gioco radiale»:
* `Tabella precedente` — mantiene la vecchia tabella, incluse le classi speciali (C3H, C4H, ecc.). È il valore implicito per ogni ricetta già salvata.
* `SKF normale · BCG02 / BCG04 / BCG06` — usa **solo** il nuovo CSV per classe e diametro. Senza corrispondenza il programma lascia vuoti min/max. 

La serie viene salvata nella ricetta, esportata/importata nel CSV e mostrata nella scheda tecnica. Nessuna ricetta esistente viene ricalcolata in silenzio.

## Avvertenze
Questi valori sono estratti dalla **foto** di una copia non registrata e che non sarà aggiornata, come scritto sul documento. Verifica il disegno di produzione, versione della specifica e procedura/carico di misura prima di usarli come limiti di accettazione; in caso di contrasto vale la documentazione ufficiale approvata in stabilimento.

## Installazione e sicurezza
Valgono tutte le istruzioni del `README-AGGIORNAMENTO-v6.md`: esporta un backup JSON dal telefono prima di eliminare dati browser/PWA. Il salvataggio delle foto nel cloud e l'IA richiedono comunque il Worker Cloudflare/R2 da configurare. Non pubblicare segreti o chiavi nel repository.