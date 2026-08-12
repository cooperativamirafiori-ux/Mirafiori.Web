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

| Variabile | Obbligatoria | A cosa serve |
|---|---|---|
| `SP_LIST_FATTURE` | sì | id della lista «Fatture inviate». Se manca, la pagina mostra un avviso invece del form |
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
| API | `app/api/fatture/route.ts` |
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
