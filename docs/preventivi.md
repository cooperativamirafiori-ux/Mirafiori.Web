# Preventivi

Primo pezzo della fatturazione attiva (`docs/fatturazione-attiva-piano.md`, § 6 passo 1).
Nasce dalla riunione Dennis–Andrea del **19 ottobre 2026** e dai file che Andrea ha mandato lo
stesso giorno: `Preventivo_MASTER.xlsx` (tre modelli e il foglio MATRICE), la cartella
SharePoint *AMMINISTRAZIONE/CLIENTI/Preventivi*, la *Nuova Tabella Generale*.

## Cosa risolve

Oggi i servizi scrivono ad Andrea "fammi il preventivo per Tizio" e lui lo fa a mano, anche quando
è un rinnovo identico del Comune di Torino con ore e tariffa decise dal Comune. Poi deve
richiamare i referenti per sapere se è stato accettato, perché è da lì che sa cosa fatturare.

Da qui:

- il preventivo lo fa **il coordinatore del servizio**, dall'app, con voci e prezzi presi dal
  **tariffario** (i servizi decidono le quantità, non i prezzi);
- **il rinnovo** è un clic: stesso preventivo, periodo successivo, prezzi del tariffario in vigore;
- il **protocollo** è una serie dedicata `PR-001/2026`, ripartenza ogni anno, assegnato dall'app;
- quando il preventivo è **accettato**, il referente lo segna e Andrea riceve per mail il PDF
  definitivo, archiviato in *Preventivi accettati*;
- chi ha emesso un preventivo senza esito riceve un **promemoria ogni 3 giorni**.

## Decisioni (19/10/2026)

| Tema | Deciso | Da chi |
|---|---|---|
| Dove stanno i dati | SharePoint: liste *Preventivi*, *Tariffario Preventivi*, *Contatti Preventivi* | Dennis |
| Chi entra | coordinatori e responsabili d'area dei CC, senza permesso nuovo (vedono i loro); `Amministrazione` vede tutto | Dennis |
| Protocollo | serie solo preventivi, `PR-NNN/AAAA`, riparte ogni anno | Dennis |
| Cartelle | archiviati solo gli **accettati**, in *Preventivi accettati/<stessa suddivisione>*; gli altri vivono nell'app e il PDF si rigenera | Andrea |
| Mail ad Andrea | solo all'accettazione, con il definitivo | Andrea |
| Destinatari | assistenti sociali / NPI / referenti con il loro ente: rubrica **separata** dall'anagrafica clienti delle fatture, si riempie da sola a ogni emissione | Dennis e Andrea |
| ISTAT | serve un sistema per aggiornare i costi quando arriva l'adeguamento | Dennis |
| CRP | per ora gestita come la Comunità Giulia; *BARRIO* non c'è più | Dennis |

## Come funziona

**Stati.** bozza → *emetti* (assegna il protocollo, PDF) → in attesa → *accettato* / *rifiutato*.
Se l'ente chiede modifiche ("ti riconosco 5 ore invece di 10") si **riapre**: torna bozza con lo
stesso numero, alla nuova emissione sale la **revisione**. Una bozza mai emessa si elimina; una
con protocollo si annulla. Da accettato (o in attesa) si **rinnova** o si **duplica**.

**Modelli.** I tre fogli del master — *Progetto individuale*, *Comunità*, *Casa Artemisia* — più
*Altro* (privati, scuole, coperture ospedaliere). Il modello decide quali voci si vedono.

**Voci e prezzi.** Ogni voce del tariffario ha prezzo, unità (ora, giorno, km, mese, forfait),
regime IVA (5%, 22%, esente, spese F.I.C. escluse art. 15), ambito (Tutti, Comune e ASL di
Torino, Fuori Torino, Privati) e periodo di validità. Può essere:
- **fissa** (le rette comunicate dagli enti): il servizio non la cambia;
- **libera fra un minimo e un massimo**: è lo stato di quasi tutte le voci finché il CDA non
  fissa i prezzi standard che Andrea chiede (oggi 23–28 €/h a seconda dell'ente).
`Amministrazione` può uscire dai limiti; nessuno può usare una voce che non c'è.

Ore e giorni si possono scrivere **a settimana**: il mese è × **4,35**, il fattore che risulta
dalle schede di Andrea (10 h/settimana → 43,5 h "da effettuare"). Il rimborso km è
accompagnamenti × km × €/km, con il percorso.

**Totali** come nel master: totale spese, IVA, + spese F.I.C., costo totale mensile IVA
compresa, totale senza IVA, e in più il totale sul periodo.

**Documento.** xlsx generato con exceljs sullo schema del master (protocollo in alto a destra,
"costo dell'intervento a favore di", voci per sezione, totali, firma della Presidente —
`PREVENTIVI_FIRMA`, default *MELISSARI Stefania*) e convertito in PDF da Graph. Una bozza esce con
"BOZZA — non valida" al posto del protocollo. **Nel nome del file solo protocollo e iniziali**,
mai il nome del ragazzo (regola che CISSA Pianezza chiede esplicitamente e che teniamo per tutti).

## Tariffario e ISTAT

**Il passato non cambia.** Un prezzo non si sovrascrive: *Nuovo prezzo* chiude la riga in vigore il
giorno prima della decorrenza e ne apre una nuova con lo stesso codice. I preventivi già fatti
hanno comunque i loro prezzi fotografati nelle righe (JSON).

**Adeguamento ISTAT** (Tariffario → *Adeguamento ISTAT*): percentuale + data di decorrenza →
anteprima voce per voce (prima → dopo, limiti compresi) → si scelgono le voci (*Tutte*,
*Solo le rette*…) → *Applica*. Il rimborso km resta fuori. Da quella data:
- i **rinnovi** escono già coi prezzi nuovi;
- una **bozza** con periodo dopo la decorrenza mostra l'avviso "il tariffario è cambiato" con
  *Aggiorna i prezzi*.

Andrea deve avvisare quando l'ente comunica l'adeguamento (riunione 19/10).

Il tariffario parte **seminato** dal master (`scripts/provision-preventivi.mjs`): le rette sono
quelle attuali della tabella di Andrea (Giulia 123,49 = 60,69 Comune + 62,81 ASL; CRP 201,78;
Giulia diurno 74,40; Artemisia da 50,09 a 169,18 per numero di ospiti), il resto sono **valori di
partenza da confermare con Andrea** (nota su ogni voce).

## Matrice di Andrea (20/11/2026)

Dopo le prove di Andrea (mail del 18 e 19/11) il tariffario è diventato la sua
`Matrice_App_Preventivi.xlsx`: una riga per **Servizio + Sottotipo + Voce + Ente pagante**, con
prezzo, unità e IVA. Spariscono modelli, ambiti e prezzi liberi fra minimo e massimo (Dennis, 20/11).

| Tema | Deciso | Da chi |
|---|---|---|
| Prezzi | fissi; vuoto = "da definire", lo scrive chi fa il preventivo | Dennis |
| Torino | si sceglie solo fra due **coppie**: Comune di Torino + ASL Città di Torino 1, oppure + ASL 2. Il preventivo va a entrambi, con le due quote e il totale | Dennis |
| Altri enti | tariffe uguali per tutti ("Tutti gli altri enti"); niente distinzione pagante/destinatari | Dennis |
| Giulia con altri enti | retta omnicomprensiva 170 € (la "standard" a quote è solo per le coppie) | Dennis |
| CRP con altri enti | retta dell'inserimento da fuori regione, 240 € | Dennis |
| Artemisia, educativa individuale | 23 € Comune/ASL Torino, 28 € gli altri, come gli accompagnamenti | Dennis |
| Enti | lista **Enti Preventivi** con schermata `/preventivi/enti`: vedere, aggiungere, correggere (chi fa preventivi); nascondere (permesso Preventivi/Amministrazione). Rinominare un ente aggiorna le sue righe del tariffario | Dennis |
| Data di inizio | facoltativa ("DA DEFINIRE"); conta la **durata in mesi**, la fine si calcola | Andrea, Dennis |
| Rette | 31 giorni al mese di default | Andrea |
| Totale sul periodo | nel PDF come nota piccola in basso a sinistra | Dennis |
| Privati | PDF a **lettera** dal modello *Preventivo Individuale Privati_MASTER.docx*; lavoro indiretto 0,5 h/settimana facoltativo (spunta); maggiorazione 5% facoltativa (spunta, sull'imponibile); referenti = chi fa il preventivo + un secondo facoltativo | Andrea, Dennis |
| Firma | immagine della firma di Stefania Melissari nel PDF (`lib/preventivi/firma-presidente.ts`, base64) | Andrea |

La matrice caricata è `scripts/dati/matrice-preventivi.json`, già sistemata con le decisioni sopra
(IVA «5%»/«Esclusa», nome dell'ASL 2 unificato, quote CRP come la Giulia, niente riga «Ore
indirette»). Regola di scelta della tariffa (`vociPerPreventivo` in `lib/preventivi/calcoli.ts`):
per ogni voce prima la riga dell'ente (per la coppia: dell'uno o dell'altro), poi "Tutti", poi
"Tutti gli altri enti" (mai per la coppia). Le coppie si riconoscono dalla **chiave** degli enti
(`comune-torino`, `asl-to1`, `asl-to2`), non dal nome.

## Installazione

Dalla cartella `web/`, un comando alla volta:

```bash
node scripts/provision-preventivi.mjs
```
Crea le quattro liste (o aggiunge le colonne che mancano), trova il drive del sito *docs* e scrive
le variabili in `.env.local`.

```bash
node scripts/preventivi-carica-matrice.mjs --sostituisci
```
Cancella il tariffario di prima, carica la matrice e riempie la lista Enti (senza
`--sostituisci` dice solo cosa farebbe).

```bash
bash scripts/preventivi-env-vercel.sh
```
Le porta su Vercel (compresa `SP_LIST_ENTI_PREVENTIVI`). Facoltative: `PREVENTIVI_MAIL_TO`
(default `FATTURE_MAIL_TO`, poi Andrea), `PREVENTIVI_FIRMA` (nome sotto la firma, default
*Stefania MELISSARI*), `PREVENTIVI_TITOLO_FIRMA` (titolo sopra la firma, default *Il Presidente*), `SP_PREVENTIVI_FOLDER` (default `AMMINISTRAZIONE/CLIENTI/Preventivi`).

Il cron `/api/cron/preventivi` gira alle 8 dei giorni feriali (`vercel.json`).

## Privacy

I preventivi contengono il nome di minori seguiti dai servizi. Quindi: accesso per centro di costo,
nel **Log Attività** solo servizio ed ente (mai il beneficiario), nei **nomi di file** solo le
iniziali. Nessun dato sanitario nei campi.

## Aperto

- Le voci **"da definire"** della matrice (psicoterapia, mediatore, psichiatra, camera doppia
  SCAT.TO…): quando Andrea ha il prezzo, Tariffario → «Nuovo prezzo».
- La **legenda dei codici presenze** (P, C, D, H, R, RP…) e la regola delle assenze: servono al
  secondo servizio, i dati per la fatturazione — rimandati da Dennis.
- Cosa vuol dire **"GP"** in IET/IEPD (Dennis chiede ad Andrea).
- Il passo dopo: dal preventivo accettato nasce l'**Intervento** (piano § 3.5), che porta il
  ragazzo nell'elenco delle timbrature e delle fatture da fare.
