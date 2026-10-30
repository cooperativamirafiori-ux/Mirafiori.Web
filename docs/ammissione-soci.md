# Domanda di ammissione socio

Decisa il 29/10/2026 da Dennis con Claudia Carena (Risorse Umane). Codice in
`lib/soci/`, schermata `/soci`, card in Home per tutti.

## Il flusso

1. **Chi viene assunto** ha già la scheda nel personale e un account: apre
   *Domanda di ammissione socio* dalla Home. I dati arrivano dalla sua scheda
   RU (riconosciuta dalla mail con cui entra); li controlla e completa.
2. **Salva** → la domanda nasce nella lista SP *Domande Ammissione Soci* (sito
   Risorse Umane) come "In attesa di firma". L'app tiene da parte i dati.
3. **Scarica il PDF**: è il modulo cartaceo della cooperativa rifatto uguale
   (`lib/templates/domanda-socio/`), compilato e convertito in PDF da Graph.
   Nessun numero, nessun archivio: si rigenera ogni volta.
4. **Carica la domanda firmata** (PDF o foto) → va diretta su SharePoint in
   `SOCI/Soci_<anno>/AMMISSIONI SOCI/COGNOME_ domanda ammissione socio.pdf`.
5. Alla conferma del caricamento l'app **registra da sola** (scelta "A,
   automatico"):
   - assegna il **N. Elenco Generale** (il "protocollo" della scheda
     progressiva): il più alto già dato a una domanda + 1, partendo da
     `SOCI_PRIMO_NUMERO` (234, il primo libero indicato da Claudia). Il campo
     delle schede RU **non** fa da base: al 30/10/2026 era compilato su 2
     schede sole, una con 262019;
   - scheda RU: `Socio = Si`, `NumeroElencoGenerale`, `QuotaSociale = 2000`,
     e i dati del modulo **nei campi vuoti**;
   - genera la **scheda progressiva** (`COGNOME_<numero>.xlsx`, stesso modello
     di sempre) in `SOCI/Soci_<anno>/SCHEDE PROGRESSIVE DA STAMPARE`;
   - copia la domanda firmata nella cartella personale;
   - **mail a Claudia** (`SOCI_MAIL_TO`) con la scheda allegata: la stampa sul
     libro vidimato.

## Decisioni e perché

- **Il numero nasce al caricamento della firmata**, non alla compilazione:
  chi abbandona a metà non lascia buchi. Una volta dato si scrive subito sulla
  domanda, così se un passo dopo fallisce "Completa la registrazione" riusa lo
  stesso numero. SharePoint non ha contatori: dopo l'assegnazione si rilegge,
  e a parità di numero vince la domanda creata prima.
- **Identità dell'app, non delegata.** Chi fa domanda non è nel gruppo
  Risorse Umane: con il suo token SharePoint negherebbe tutto. È l'unico punto
  in cui l'area RU scrive con l'identità applicativa; il nome reale resta nel
  Log Attività (`soci.*`) e nella colonna `EmailRichiedente`.
- **La scheda RU si completa, non si sovrascrive.** Se il modulo ha un valore
  diverso da quello in scheda (es. un indirizzo), la scheda resta com'è e la
  differenza finisce nella mail a Claudia.
- **Tipo di rapporto**: cambia da solo solo nel caso ovvio, Dipendente → Socio
  lavoratore. Negli altri casi avviso in mail: il tipo di rapporto decide chi
  timbra (`classeLavoro` in `lib/timbrature/sync.ts`), e un "Socio volontario"
  scritto in automatico spegnerebbe il foglio ore di un lavoratore.
- **Data di ammissione vuota**: l'ammissione la delibera il CdA, la data la
  inserisce Claudia dopo.
- **Chi è già socio** (30/10/2026) vede tutta la procedura con un avviso ben
  visibile in cima, può salvare e scaricare il PDF, ma **l'invio della firmata è
  bloccato** — nella schermata e nel server (`giaSocioPerAltro`). Unica
  eccezione: la scheda è diventata "socio" per questa stessa domanda e la
  registrazione si era interrotta, così "Completa la registrazione" riparte.
- **Quote**: 80 quote mensili da 25 € (2.000 €), bloccate (`types/soci.ts`).

## Setup

```bash
node scripts/provision-soci.mjs
```

Crea la lista sul sito RU, controlla le cartelle, stampa il prossimo numero
che verrà dato e imposta `SP_LIST_DOMANDE_SOCI` e `SOCI_MAIL_TO` in
`.env.local` e su Vercel. Facoltative: `SP_SOCI_FOLDER` (default
`General/RISORSE UMANE/RISORSE UMANE 2/SOCI`), `SOCI_PRIMO_NUMERO` (default 234).
