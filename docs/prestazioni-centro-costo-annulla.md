# Prestazioni · centro di costo e annullamento (21 ott 2026)

## Centro di costo

- Colonna lookup `CentroCosto` sulla lista Prestazioni → lista Centri di Costo
  (`node scripts/provision-prestazioni.mjs`, idempotente: crea la colonna, aggiunge la scelta
  "Annullata" a Stato ed elenca le pratiche aperte senza centro di costo).
- **Obbligatorio nel modulo** nuova prestazione (sezione Prestazione). Se l'anagrafica dei centri
  non risponde, il modulo non lo chiede e la route non lo pretende: si assegna dopo.
- **Pratiche già aperte:** sulla scheda in "Prestazioni attive" compare il riquadro ambra
  "Senza centro di costo" con la tendina; quelle con il centro mostrano il nome e "Cambia".
  Lo modificano il responsabile che ha aperto la pratica e gli amministratori
  (`lib/prestazioni/accesso.ts`). Le pratiche chiuse non si toccano.
- **Registro analitico** (`lib/prestazioni/registro.ts`): quando il prestatore carica la notula
  (stato "Notula ricevuta") si scrive UNA riga di costo: CC della pratica, voce **PROF**
  (decisione di Dennis, B7), importo = **lordo** della notula, competenza = data fine, fonte
  `prestazione_occasionale`, origine = id item SP (idempotente). Se il centro viene assegnato o
  cambiato dopo la notula, la riga si riscrive. Non blocca mai: se fallisce, basta cambiare/
  riassegnare il centro per riscriverla.
- ⚠️ La fonte `prestazione_occasionale` richiede la migrazione `supabase/registro_fonte_prestazione.sql`.

## Annulla pratica

- Tasto "✕ Annulla pratica" sulla scheda, **solo in Bozza** e solo per responsabile/admin.
- Stato → **Annullata**: il record resta (traccia, numerazione senza buchi), sparisce dalle attive.
- Sottocartella `Prestazione_{data}` cancellata solo se vuota; documenti d'identità mai toccati.
- Annullare dopo l'invio DocuSign (ritiro busta) non è previsto.
