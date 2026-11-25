# SKF classi divise — aggiornamento v8 (04/01/2021)

Aggiunti 114 intervalli dal documento fotografato SKF «Complete Bearing, Cylindrical bore, Metric series C, Special radial clearance C2L–C3H with measuring load», stampato il **04/01/2021** (copia non registrata).

- Nuovo `tabella_gioco_diviso_skf.csv`: 19 fasce foro × 6 classi C2L, C2H, CNL, CNH, C3L e C3H. Misura in micrometri; d_min esclusivo e d_max incluso; BCG02, BCG04, BCG06 in serie distinte.
- Le classi divise vengono lette in aggiunta a `tabella_gioco_normale_skf.csv`; non sovrascrivono i limiti normali né `tabella_gioco.csv`.
- Il selettore "Riferimento SKF" indica che le serie includono normale e diviso; le classi vengono popolate anche usando il nuovo CSV.
- `sw.js` ha nuova versione cache e include la tabella divisa.
- Nessuna migrazione o azzeramento dei salvataggi. **Esporta un backup JSON prima di cancellare i dati del browser**.

**Avvertenza**: il documento fotografato è marcato «This is an unregistered copy and will not be updated». Confrontare limiti, codici e carico di misura con la documentazione di produzione approvata prima dell'uso per accettazione/scarto. Le classi divise e la tabella normale dipendono dalle serie BCG; non mescolarle senza verificare il riferimento.
