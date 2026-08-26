# Assistenza IT — come funziona

> Scritta il 26 agosto 2026. È il punto 14 di `docs/it-dispositivi-piano.md`
> ("Registro Assistenza IT: fase successiva"), realizzato.

## In una riga

Chiunque apre un ticket dall'app; l'ufficio IT lo prende in carico, lo assegna, lo
lavora e lo chiude; le mail seguono lo stesso schema di Acquisti — digest per la
routine, avviso immediato per l'urgenza e per il lavoro assegnato a una persona.

## Da dove viene

Sul sito `gruppo_it` esisteva una lista *Registro Assistenza IT*: **vuota**, con il
lookup `Dispositivo` puntato a una colonna `IDDispositivo` che non esiste più.
Non è stata migrata perché non c'era niente da migrare, e perché da quel sito non
si può fare lookup verso `Inventario Beni`, che sta sul sito principale.
La lista nuova, `Assistenza IT` (`SP_LIST_ASSISTENZA`), sta quindi qui e **riusa lo
stesso vocabolario di tendine** scritto a suo tempo dall'ufficio IT: chi lo usava
non deve reimparare niente. Quella vecchia resta come archivio, con le altre quattro.

## Le decisioni

1. **Sezione aperta a tutti.** Nessun permesso per aprire una richiesta o vedere le
   proprie, come Richiesta fattura. Il permesso `IT e Dispositivi` — quello che già
   esiste, non uno nuovo — protegge solo `/assistenza/gestione` e le azioni di
   lavorazione nelle API.
2. **La priorità non la sceglie chi chiede.** Al richiedente si chiedono due cose
   che sa davvero: se è bloccato e quante persone tocca. `prioritaProposta()` ne
   ricava Bassa/Media/Alta/Critica, e chi prende in carico conferma o cambia. Se la
   priorità la scegliesse il richiedente sarebbe Critica ogni volta.
3. **Chiude l'IT, non il richiedente.** Niente conferma tokenizzata come nelle
   consegne di Acquisti: lì la domanda era "è arrivato?", qui è "ho finito". In
   compenso il richiedente ha, per **15 giorni** (`GIORNI_RIAPERTURA`), il pulsante
   *"Il problema si è ripresentato"* in "Le mie richieste": il ticket torna in
   lavorazione con tutto lo storico e il contatore `Riaperture` sale. Un ticket
   riaperto tre volte dice che il guasto non era quello che si pensava.
4. **Solo per sé.** Non si apre un ticket per un collega, e i ticket telefonici
   restano fuori dall'app: perciò non esiste il campo `Modalità richiesta` della
   lista storica.
5. **Un allegato facoltativo**, caricato dal browser direttamente su SharePoint
   (`lib/core/upload-diretto`), in un'unica cartella col codice del ticket nel nome —
   stessa scelta dei verbali IT. Se la libreria non è configurata, il campo non
   compare e il ticket si apre lo stesso.
6. **Il legame col bene è il lookup `Bene`**, ed è l'unico punto in cui il ticketing
   tocca l'anagrafica: da lì la scheda del dispositivo potrà mostrare il suo storico
   di guasti. Il centro di costo è una **fotografia** presa dall'assegnazione attiva
   al momento del ticket, non un lookup vivo: se domani il portatile passa a un altro
   servizio, il costo dell'intervento resta dov'è maturato.
7. **`Ore lavoro` e `Assistenza esterna` restano**, come nella lista storica: sono i
   due campi che serviranno al controllo di gestione. Oggi non generano righe di costo.

## Il flusso

```
Inviata → Presa in carico → In lavorazione ⇄ Attesa fornitore
                                          ⇄ Attesa utente
       → Risolta → (riaperta dal richiedente entro 15 gg) → In lavorazione
       → Annullata
```

Azioni (`AzioneAssistenza`, tutte su `PATCH /api/assistenza/[id]`):
`prendi-in-carico` · `assegna` · `priorita` · `lavora` · `attesa-fornitore` ·
`chiedi-info` · `risolvi` · `annulla` · `note` — riservate all'area IT;
`riapri` — del richiedente. `annulla` è concessa anche al richiedente, ma solo
finché il ticket è ancora *Inviata*: dopo, qualcuno ci ha già speso del tempo.

Le regole di ammissibilità stanno in `azioneAmmessa()` in `lib/assistenza/flusso.ts`,
in un posto solo, e i motivi di rifiuto sono scritti per essere mostrati all'utente.

## Le mail

| Quando | A chi | Cosa |
|---|---|---|
| ticket **Critico** aperto | squadra IT | subito, con recapito e reperibilità |
| ogni mattina (`/api/cron/assistenza`, 7:45) | squadra IT | digest dei nuovi + quelli aperti da oltre 7 giorni |
| assegnazione | l'operatore | solo a lui; chi si assegna un ticket da sé non la riceve |
| presa in carico | richiedente | "se ne occupa Tizio" |
| `chiedi-info` | richiedente | la domanda, e il ticket va in *Attesa utente* |
| `risolvi` | richiedente | cosa è stato fatto + come riaprire |
| `annulla` da parte dell'IT | richiedente | con il motivo |
| riapertura | chi ha il ticket in mano, o tutta la squadra | quante volte è già successo |

Il digest tace se non ci sono né novità né arretrati: una mail che dice "niente"
tutti i giorni insegna a non aprire le mail.

## Setup

```
node scripts/provision-assistenza.mjs
```

Idempotente: crea la lista, i tre lookup (`Bene`, `Struttura`, `CentroCosto`),
allinea le tendine, scrive `SP_LIST_ASSISTENZA` in `.env.local` e su Vercel.
Rilanciarlo aggiunge solo ciò che manca — utile se al primo giro mancava
`SP_LIST_CENTRI_COSTO` o `SP_LIST_INVENTARIO`.

Variabili facoltative: `ASSISTENZA_MAIL_TO` (casella dell'ufficio in copia al
digest), `SP_ASSISTENZA_DRIVE_ID` e `SP_ASSISTENZA_FOLDER` (dove finiscono gli
allegati; senza, la libreria predefinita del sito e "Allegati Assistenza").

## Cosa non c'è, di proposito

SLA con contatore, base di conoscenza, costo generato in automatico dall'assistenza
esterna (arriverà col controllo di gestione), firma dei verbali, ticket aperti per
conto di terzi.
