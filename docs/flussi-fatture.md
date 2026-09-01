# Controllo di Gestione · Flussi fatture

> Prima consegna: 1 settembre 2026. Il piano completo del controllo di gestione sta in
> `controllo-di-gestione-piano.md`; qui c'è solo ciò che è stato costruito, come si mette in
> funzione e le decisioni prese in corso d'opera.

## A cosa serve

Claudia carica una volta a settimana lo **scadenzario** scaricato da Fattura SMART. L'app lo
legge, distingue le scadenze nuove da quelle già viste e smista tutto in due code:

- **Da pagare** — sotto soglia, o già approvate. Claudia paga e clicca *Pagata*.
- **Da approvare** — sopra soglia. Luca clicca *Approva* e la riga passa a Claudia.

Più una terza lista, **Escono da sole**: RID, SDD e domiciliazioni. Nessuno le paga, ma il
denaro esce comunque e chi guarda la cassa deve saperlo.

Non c'è altro, di proposito. L'attribuzione ai centri di costo, i cruscotti e la previsione di
cassa arrivano dopo, sulle stesse righe già in archivio.

## Chi vede cosa

Tre permessi distinti, si concedono da **Amministrazione › Permessi**:

| Permesso | Apre |
|---|---|
| `Controllo di Gestione` | i cruscotti dei costi (non ancora attivi). **Non** apre i Flussi fatture |
| `Pagamenti` | caricamento del file, coda *Da pagare*, tasto *Pagata* |
| `Approvazione Pagamenti` | tasto *Approva*. Il resto in sola lettura |

La sezione si apre con **uno qualsiasi** dei tre: la porta non ha un permesso proprio. È la
ragione per cui domani un coordinatore potrà guardare il cruscotto del suo centro di costo
senza che nessuno debba ricordarsi di togliergli le fatture — e il motivo per cui questa
struttura non va "semplificata" a un permesso solo.

I coordinatori di centro di costo **non prenderanno un permesso**: il loro accesso in lettura
arriverà dall'essere indicati come responsabile nell'anagrafica Centri di Costo, che esiste già.
Un permesso in più sarebbe un secondo elenco da tenere allineato al primo.

Assegnazione iniziale:

| Persona | Permessi |
|---|---|
| claudia.carena | Pagamenti |
| luca.cordaro | Approvazione Pagamenti · Controllo di Gestione |
| info | Pagamenti · Approvazione Pagamenti |
| dennis.maseri | tutti e tre |

## Messa in funzione

1. **Schema Supabase** — eseguire `supabase/pagamenti_schema.sql` nel SQL editor del progetto.
2. **Soglia** — aggiungere alla lista SharePoint *Parametri* la riga
   `SogliaApprovazionePagamenti` con `Valore = 1500`. Se manca, l'app usa 1500 lo stesso e lo
   scrive nella ricevuta dell'import: non si ferma, ma la mancanza si vede.
3. **Permessi** — `node scripts/provision-pagamenti.mjs` semina le quattro persone.
4. **Primo caricamento** — l'*Elenco scadenze* di Fattura SMART, con la casella «chiudi le
   scadenze che il gestionale dà per pagate» **spuntata**: chiude l'arretrato già saldato senza
   spuntarlo a mano. Dal secondo caricamento in poi si lascia vuota, e va rimessa apposta se
   serve di nuovo. Il campo «storiche prima del» è facoltativo: lasciandolo vuoto entra tutto.

## Le regole scritte nel codice

Queste sono le cose che sembrano dettagli e non lo sono. Se qualcuno le "sistema", il sistema
smette di dire la verità.

**Lo stato del gestionale vale in una direzione sola.** `Stato` e `Data Pagamento` si leggono,
ma possono solo **chiudere** una scadenza, mai riaprirne una chiusa in app — e solo quando chi
carica spunta la casella apposta, che non resta mai accesa da sola. `Pagato` e `Di cui Abbuono`
non si leggono affatto.

Il perché del senso unico: la registrazione contabile arriva *dopo* il bonifico. Se potesse
riaprire, al caricamento successivo la coda si ripopolerebbe da sola con le righe appena chiuse,
e una coda che si ripopola da sola è una coda che si smette di guardare. Il perché della
casella: al primo import l'arretrato già saldato sono centinaia di righe da spuntare a mano.

Le righe chiuse così portano `origine_pagamento = 'gestionale'` e in elenco dicono «secondo il
gestionale»: non le ha guardate nessuno di noi, e questo deve restare visibile. Il campo prevede
già `'banca'` per quando arriverà l'estratto conto.

**La deduplica è sul protocollo interno** (`Numero Documento` + `Suffisso` + `Data`) più la
posizione della rata, non su P.IVA + numero del fornitore: ATC e SOGEGROSS ripetono lo stesso
numero su documenti diversi, e due righe fuse sono peggio di due righe doppie.

**Le note di credito arrivano con importo positivo** e si riconoscono solo dal tipo documento.
All'import il segno si inverte, altrimenti finiscono in coda come fatture da pagare.

**L'importo della scadenza è il netto**, non il totale della fattura: la ritenuta d'acconto non
esce dal conto del fornitore. Per la cassa conta il netto; imponibile e IVA arriveranno
dall'*Elenco documenti*, che è un file diverso e mensile.

**Niente si cancella.** Una scadenza sparita dall'export resta, marcata: è un documento
annullato o un file incompleto, e in entrambi i casi qualcuno deve saperlo.

**Non esiste il tasto «rimanda».** Non approvare *è* la decisione, ed è quella che si prende
quando non c'è liquidità. Perché il silenzio non si confonda con una dimenticanza, ogni riga
porta i giorni di attesa e le più vecchie stanno in cima.

**La modalità di pagamento del file è una dichiarazione del fornitore**, non un fatto nostro:
Amazon compare 24 volte a bonifico e 17 a carta, ed è lo stesso conto. Da qui il rischio del
doppio pagamento, e l'avviso da storico previsto come prossimo passo (`scadenza.alert` esiste
già, nessuno lo valorizza ancora).

## Cosa manca, in ordine

1. Avviso «questo fornitore si paga di solito in negozio» sulle righe a bonifico.
2. Promemoria del lunedì se lo scadenzario non è stato caricato.
3. Import mensile dell'*Elenco documenti* → imponibile, IVA, righe di dettaglio.
4. Attribuzione al centro di costo e cruscotti.
