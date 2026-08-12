# Richiesta Fattura — setup e decisioni

Sezione aperta a **tutta la cooperativa**: chi si trova davanti a un cliente che chiede la fattura
(il caso di partenza è la Locanda) compila un modulo, i dati finiscono in una lista SharePoint e chi
emette materialmente la fattura riceve un riepilogo via mail.

## Setup

Una volta sola, dalla cartella `web/`:

```bash
node scripts/provision-fatture.mjs
```

Lo script crea la lista **«Fatture inviate»** sul sito Controllo Gestione (lo stesso di costi,
acquisti e inventario) e stampa la riga `SP_LIST_FATTURE=…` da mettere in `.env.local` e su Vercel.
È idempotente: rieseguito, aggiunge solo le colonne mancanti.

Variabili d'ambiente:

Poi l'anagrafica clienti, una volta sola:

```bash
node scripts/provision-clienti.mjs
```

```bash
node scripts/import-clienti.mjs ../clienti.csv --prova
```

Con `--prova` non scrive niente: stampa quanti clienti importerebbe, quali doppioni unisce e come
verrebbe la prima riga. Togliendo `--prova` scrive. È idempotente — le righe già in lista (stessa
denominazione e stessi codici) vengono saltate, quindi si può rilanciare senza duplicare.

Variabili d'ambiente:

| Variabile | Obbligatoria | A cosa serve |
|---|---|---|
| `SP_LIST_FATTURE` | sì | id della lista «Fatture inviate». Se manca, la pagina mostra un avviso invece del form |
| `SP_LIST_CLIENTI` | no | id della lista «Clienti». Senza, il modulo funziona ma non c'è la ricerca né il salvataggio dell'anagrafica |
| `FATTURE_MAIL_TO` | no | destinatari del riepilogo, separati da virgola. Default nel codice: `andrea.granato@cooperativamirafiori.com` |
| `SP_LIST_CENTRI_COSTO` | no | quando esisterà la lista dei centri di costo (vedi sotto) |

Il default del destinatario è nel codice di proposito: se la variabile non viene messa su Vercel, la
richiesta arriva lo stesso a qualcuno invece di sparire.

## Decisioni prese

**Nessun permesso d'area.** La sezione è aperta a chiunque abbia l'accesso all'app. Un permesso
avrebbe significato mantenere l'elenco di mezza cooperativa nella lista Autorizzazioni: un elenco
che si aggiorna solo quando qualcuno si lamenta di non riuscire a entrare.

**Il richiedente non si scrive: si prende dalla sessione.** È l'unico modo perché sia davvero
l'identità di chi ha compilato, e toglie un campo dal modulo.

**Campi obbligatori.** Oltre a quelli indicati dall'ufficio per ciascuna tipologia:

- centro di costo — senza, la fattura non si sa a chi imputarla;
- indirizzo, città e nazione sempre; **CAP e provincia solo per l'Italia**, perché all'estero spesso
  non esistono nella stessa forma e un controllo rigido bloccherebbe una richiesta legittima;
- email — è il recapito con cui si manda la fattura;
- descrizione, importo e data della prestazione.

**Telefono, PEC e note restano facoltativi.** Un privato la PEC quasi mai ce l'ha, e rendere
obbligatorio un campo che metà delle volte non esiste insegna solo a scrivere `-` dentro.

**I formati di codice fiscale e partita IVA si controllano solo per i soggetti italiani.** Sedici
caratteri per le persone fisiche, undici cifre per gli enti (che spesso hanno il CF uguale alla
partita IVA), cinque cifre per il CAP. Per i soggetti esteri nessun controllo di forma.

**Chi fa la richiesta riceve la stessa mail del destinatario.** È la sua ricevuta, e se ha sbagliato
un dato se ne accorge subito invece che a fattura emessa.

**Se la mail non parte, la richiesta resta salvata.** L'invio è dentro un `try` separato: il dato è
già nella lista, e un problema di Graph non deve far ricompilare tutto il modulo all'utente.

**Nel log attività non finiscono codice fiscale né partita IVA.** Sono dati del cliente e non
servono a ricostruire chi ha fatto cosa: il log registra centro di costo, tipologia, intestatario e
importo.

## Anagrafica clienti

Lista SharePoint **«Clienti»**, importata dall'export di Fattura SMART il 12 agosto 2026:
733 righe nel file → **725 clienti**.

**Come funziona nel modulo.** Al caricamento della pagina arriva un indice leggero (una riga per
cliente: denominazione, codici, comune), così la ricerca risponde mentre si scrive senza chiamare il
server a ogni lettera. Si cerca per nome, partita IVA, codice fiscale o comune, e ogni parola
digitata deve comparire da qualche parte: «comune torino» e «bianchi 10135» funzionano entrambi.
Scelto un cliente si chiede la scheda intera (`GET /api/clienti/[id]`) e i campi si compilano.

**Al salvataggio l'anagrafica si aggiorna.** Se il cliente veniva dall'archivio e chi compila ha
corretto un dato, la scheda viene aggiornata e la mail ad Andrea elenca cosa è cambiato, con vecchio
e nuovo valore. Se il cliente è nuovo viene creato. Il modulo avvisa prima di inviare, in entrambi
i casi: nessuna modifica silenziosa all'archivio.

**Un campo lasciato vuoto non cancella quello in archivio.** Chi compila una fattura non sta
dichiarando che il vecchio telefono non esiste più: semplicemente non l'ha scritto. Si aggiornano
solo i campi valorizzati (`differenze()` in `lib/clienti/data.ts`).

**Il riconoscimento non passa solo dalla ricerca.** Se qualcuno scrive i dati a mano senza cercare,
l'API prova comunque a riconoscere il cliente da partita IVA o codice fiscale prima di crearne uno
nuovo: senza quel controllo l'archivio si riempirebbe di doppioni.

**La `nazione` è un codice ISO** (IT, FR, DE), come nell'export: è la forma che vuole la fattura
elettronica. Nel modulo è un menu che mostra il nome del paese e salva il codice. La nazionalità
Italiana/Estera resta un campo a sé perché l'ufficio la vuole dichiarata, ma si imposta da sé in
base alla nazione, e la validazione rifiuta le due cose in contraddizione.

**I campi che il modulo non chiede** (cellulare, codice IPA, codice identificativo estero, tipo
pagamento, scadenza, addebito bollo) stanno in anagrafica e vengono riportati nella mail quando il
cliente è già in archivio: sono dati che Andrea altrimenti cercherebbe a mano nel gestionale.

**Tutta la lista sta in memoria** per dieci minuti (`caricaClienti()`): 725 righe, e ogni scrittura
invalida la cache. Se un giorno i clienti diventassero decine di migliaia, è quella la funzione da
sostituire con una ricerca lato server — non il resto dell'area.

### Doppioni: cosa è stato unito e cosa no

Nell'export 13 gruppi di righe condividevano partita IVA o codice fiscale, e **non erano tutti
doppioni**. Sono stati uniti 8 gruppi (`UNIONI` in `scripts/import-clienti.mjs`), tenendo la riga
indicata e riempiendo i suoi campi vuoti con quelli scartati:

| Chiave | Tenuta | Scartata |
|---|---|---|
| 03292340043 | CEPHEUS VIAGGI DI STEFANO TIRELLO | «cancellare» |
| 06735300011 | POLIEDRA S.P.A. | POLIEDRA SPA |
| 07306200010 | CISA GASSINO | CISA |
| 08645920011 | A.G.P. GAS SRL | AGP GAS |
| 09698100014 | BONO E GUZZINO SNC DI GUZZINO FILIPPO,GUZZINO ROBE | BONO E GUZZINO SNC |
| 97694100013 | MIRAVOLANTE APS | ASSOCIAZIONE MIRAVOLANTE |
| 12411260016 | Rete delle Case del Quartiere ETS | Rete delle Case del Quartiere APS |
| GRGGPP70A47L219S | GARGANO GIUSEPPINA | GARGANO GIUSY |

Gli altri 5 gruppi sono rimasti **righe separate**, perché sono soggetti distinti che condividono la
partita IVA dell'ente: Comune di Torino e il suo ufficio ITER; i tre dipartimenti dell'Università;
le tre sedi di ENGIM Piemonte; ASL Città di Torino 1 e 2; Città della Salute e il suo ufficio
Formazione. Hanno referenti, mail e PEC propri: unirli avrebbe perso l'informazione che serve a
fatturare. È il motivo per cui `trovaClientePerCodici()` ritorna il primo e la scelta consapevole
resta quella fatta con la ricerca.

Le 17 righe senza partita IVA né codice fiscale (fra cui Amazon EU e alcuni esteri) sono state
importate così com'erano.

### Il file di partenza

L'export originale era un `.xlsx` che **exceljs non riesce a leggere**: le stringhe condivise usano
il prefisso `x:`, cosa che fanno gli esportatori .NET. Per questo lo script legge anche CSV, e la
riga delle intestazioni la cerca da sé (nell'export sono alla quarta, sopra c'è il titolo del
report). Se un futuro export dà errore di parsing, si apre e si salva come CSV.

## Il campo "Centro di costo"

Oggi è un **campo di testo libero**: la lista ufficiale Aree/Centri di Costo è ancora in attesa di
approvazione in ufficio.

Non c'è codice da scrivere per agganciarla. Quando la lista esisterà su SharePoint (nome del centro
di costo nella colonna `Title`), basta impostare `SP_LIST_CENTRI_COSTO` con il suo id: da quel
momento `lib/fatture/centri-di-costo.ts` la legge e il campo diventa da sé un menu a tendina.

Sulla lista si salva comunque **la stringa**, non un lookup: così le richieste già inviate restano
leggibili anche se un centro di costo viene poi rinominato o eliminato.

## Dove sta cosa

| Cosa | File |
|---|---|
| Campi per tipologia, etichette, validazione | `types/fatture.ts` — **fonte di verità unica**, la usano sia il form sia l'API |
| Lettura/scrittura SharePoint, numerazione `RF-0001` | `lib/fatture/data.ts` |
| Testo della mail di riepilogo | `lib/fatture/notifiche.ts` |
| Elenco centri di costo | `lib/fatture/centri-di-costo.ts` |
| Anagrafica clienti: cache, ricerca, salvataggio | `lib/clienti/data.ts` + `types/clienti.ts` (ricerca e nazioni) |
| API | `app/api/fatture/route.ts` · `app/api/clienti/[id]/route.ts` |
| Pagina e form | `app/(app)/richiesta-fattura/` |

Aggiungere o togliere un campo a una tipologia si fa in `CAMPI_PER_TIPO` (`types/fatture.ts`), una
volta sola: il form lo mostra e l'API lo pretende, senza che le due parti possano divergere.

## Cosa non c'è (per ora)

- Nessun elenco delle richieste inviate: chi compila vede solo la conferma e la copia via mail.
  Le funzioni di lettura (`getRichiesteFattura`, `getRichiesteFatturaDi`) sono già in `data.ts`,
  pronte per il primo cruscotto.
- Nessuno stato «fatturata»: chi emette la fattura lavora dalla mail. Se servirà tracciarlo, la
  colonna va aggiunta in `scripts/provision-fatture.mjs` e nel mapping di `data.ts`.
- Nessun allegato.
- **Nessuna pagina per gestire l'anagrafica clienti**: si consulta dalla ricerca nel modulo e si
  corregge direttamente su SharePoint. Decisione del 12 agosto 2026 — la pagina si aggiunge se
  serve davvero, non per completezza.
