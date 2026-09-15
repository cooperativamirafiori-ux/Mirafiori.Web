# Controllo di Gestione · Il registro — fondamenta

> Fase 1 del piano, scritta il 7 settembre 2026. Il piano completo sta in
> [`controllo-di-gestione-piano.md`](./controllo-di-gestione-piano.md); qui c'è solo ciò che è
> stato costruito, come si mette in funzione, e le decisioni prese in corso d'opera —
> comprese le tre che si scostano dal piano.
>
> **Nessuna schermata nuova.** Questa fase è il modello dati e la porta di scrittura: serve a
> far sì che ogni fase successiva sia solo interfaccia.

## Cos'è

Un registro solo, `movimento`, dove finiscono tutti i costi e tutti i ricavi nella stessa
forma. Cruscotti, report, budget e alert leggeranno da lì e da nient'altro.

Ogni riga porta due date (`data_competenza` per «come va il servizio», `data_cassa` per «quanto
esce dal conto»), un centro di costo, una voce del piano dei conti, l'identità del documento da
cui viene, e **quanto ci si può credere** — perché un'attribuzione dedotta da una regola non è
lo stesso fatto di un centro di costo scritto sul documento, e in un elenco la differenza deve
vedersi.

## Messa in funzione — **fatta il 7/09/2026**

Applicata direttamente sul progetto Supabase *Timbrature Mirafiori*, in quattro migrazioni:
`gestione_registro_fondamenta`, `gestione_registro_rls`, `gestione_registro_search_path`,
`gestione_registro_quota_omessa`. In archivio ci sono 14 tabelle nuove, 3 funzioni, 24 centri di
costo (23 + il segnaposto) con le aree, 24 voci analitiche e i 3 conti. Registro vuoto.

`supabase/gestione_schema.sql` resta il documento di riferimento e rieseguirlo non fa danno: è
idempotente. Non ci sono permessi nuovi (`Controllo di Gestione` esiste già) né variabili
d'ambiente nuove.

Resta da fare, quando arriveranno i dati:

- **Conti** — le tre righe di `conto` sono senza IBAN e senza fido. Quando arrivano si riempiono
  con un `update`; la previsione di cassa non parte prima.
- **Anagrafica** — `node scripts/sync-centri-costo-supabase.mjs` (prima a vuoto, poi `--apply`)
  riallinea lo specchio quando su SharePoint si aggiunge, rinomina o spegne un centro di costo.
  Non serve oggi: i 23 codici sono già allineati e le aree caricate.

### La RLS è accesa senza policy, come nel resto del progetto

Tutte e 14 le tabelle nuove hanno `enable row level security` e **zero policy**. Non è una
contraddizione con la frase «la RLS resta disattivata» di `pagamenti_schema.sql`: quella vuol
dire che non ci sono policy da scrivere, perché l'autorizzazione la fanno next-auth e i guard.

Accesa senza policy significa che la chiave pubblica — quella che sta nel browser — non legge
niente, mentre la service role passa perché la bypassa. Erano nate spente, ed è stato corretto:
su `cedolino_mese` ci sono gli stipendi per persona e su `conto` gli IBAN.

Il linter di Supabase segnala `rls_enabled_no_policy` come **INFO** su tutte e 25 le tabelle del
progetto: è l'assetto voluto, non un residuo. Segnalava anche `function_search_path_mutable`
come **WARN** sulle tre funzioni, ed è stato chiuso fissando `search_path = public, pg_temp` —
su una funzione che è l'unica porta di scrittura del registro conta più che altrove.

## Il piano dei conti analitico

Ventiquattro voci: venti di costo, quattro di ricavo. `voce_bilancio` tiene il ponte verso il
bilancio civilistico, così un totale del cruscotto si può riconciliare con una voce del CE.

| | Voci | Bilancio |
|---|---|---|
| Beni | ALIM alimentari · CONS consumo e pulizia · CANC cancelleria · CARB carburanti · ATTR attrezzature e beni minori | B6 |
| Servizi | UTEN utenze · TELE telefonia · MANU manutenzioni · SERV servizi e appalti · PROF consulenze e prestazioni · FORM formazione · ASSI assicurazioni · TRAS trasporti | B7 |
| Beni di terzi | AFFI affitti · NOLE noleggi e leasing · SOFT software e canoni | B8 |
| Personale | PERS costo del personale | B9 |
| Altro | TRIB imposte e tributi · BANC oneri bancari · ALTR altri costi | B14 · C17 |
| Ricavi | CORR corrispettivi · CONV convenzioni e rette · CONT contributi e bandi · RALT altri ricavi | A1 · A5 |

**Sono state ricavate dai fornitori veri**, non da un piano dei conti generico: le prime venti
ragioni sociali per importo dello scadenzario coprono tutte queste voci e nessun'altra —
SOGEGROSS e CHIURLO alimentari, ALD Automotive noleggio, ATC e PRIMA IMMOBILIARE affitti, QUID
e IL NODO consulenze, SMAT e TIM utenze, GRENKE leasing.

Venti voci e non cinquanta perché con cinquanta nessuno classifica più niente: il campo si
compila una volta per documento, e la precisione in più si paga con la classificazione che non
viene fatta.

## Le decisioni scritte nel codice

Queste sono le cose che sembrano dettagli e non lo sono. Se qualcuno le "sistema", il registro
smette di dire la verità.

**Il segno lo impone il database.** Costo negativo, ricavo positivo, e non per convenzione: la
foreign key composta `(voce, tipo) → voce_analitica(codice, tipo)` più `movimento_segno_chk`
rifiutano un costo positivo e un costo classificato con una voce di ricavo. Nei report i costi
tornano positivi — il segno è coerenza interna, non un modo di presentare un numero.

**`origine_tipo` e `origine_id` sono obbligatori.** Il piano li dava facoltativi. Ma il vincolo
di unicità che impedisce il doppio conteggio è `unique (origine_tipo, origine_id, cc_codice)`, e
in PostgreSQL due NULL non sono uguali: con quei campi vuoti lo stesso documento sarebbe
rientrato infinite volte senza che niente lo segnalasse. Le rettifiche a mano portano
`origine_tipo = 'manuale'` e un uuid generato da chi scrive.

**`DA_ATTRIBUIRE` è una riga dell'anagrafica, non un NULL** — per la stessa ragione. E
`movimento_attribuzione_chk` lega il segnaposto alla confidenza: non esiste una riga sul
segnaposto data per certa, né una riga su un centro di costo vero marcata «da attribuire». Se
le due cose si separassero, un costo non attribuito finirebbe nei totali di un servizio con
l'aria di essere a posto.

**Il centro di costo esiste per davvero.** `centro_di_costo` è lo specchio della lista
SharePoint e ogni riferimento è una foreign key. Un codice storpiato non passa: prima si
sarebbe sbagliato in silenzio, e un importo sbagliato che sembra giusto è l'errore peggiore
perché nessuno lo cerca. La fonte di verità resta SharePoint — permessi, responsabili, storico
leggibile — e lo specchio serve a due cose che SharePoint non può dare: le foreign key e il
GROUP BY.

**Si scrive solo da `registro_riscrivi()`.** È una funzione SQL, non due chiamate dall'app, e
non è pignoleria: riattribuire un documento da `DA_ATTRIBUIRE` a un centro di costo vero
significa togliere una riga e metterne un'altra, e le due chiavi sono diverse — il vincolo di
unicità non lo impedisce. Senza una scrittura atomica bastava un errore di rete fra le due
operazioni per lasciare il documento contato due volte, o (invertendo l'ordine) per farlo
sparire del tutto. PostgREST non ha transazioni; il corpo di una funzione sì.

**La somma delle quote la controlla la funzione**, perché è l'unico posto che vede tutte le
righe di un documento insieme: un `check` di tabella non può sommare fra righe. Tolleranza
0,0002, altrimenti un documento diviso in tre non passerebbe mai.

**Le aggregazioni stanno in SQL.** `registro_per_cc()` e `registro_per_voce()`: PostgREST non
sa fare GROUP BY, e l'alternativa era scaricare tutte le righe del periodo e sommarle in
JavaScript — 36.000 righe l'anno, con un cruscotto che rallenta ogni mese. Nessuna vista
materializzata: sarebbe un secondo posto in cui la verità può divergere.

**Nessun trigger.** Come in `pagamenti_schema.sql`, e per la stessa ragione: un trigger che
riscrive righe è la cosa più difficile da trovare quando un numero non torna.

## Lo scostamento dal piano che vale la pena sapere

**`appaiamento` punta a `scadenza`, non a `fattura_passiva`.** Il piano è stato scritto prima
che i Flussi fatture esistessero. Quello che si paga è la rata, non il documento: con la fattura
come chiave, una fattura con due rate saldate da due bonifici diversi non si sarebbe potuta
rappresentare.

**`uscita_fissa` non è la stessa cosa delle uscite senza fattura.** Quelle di
[`uscite-senza-fattura.md`](./uscite-senza-fattura.md) sono scadenze vere, con un importo noto e
il tasto PAGATA. `uscita_fissa` è una **regola** per la sola previsione di cassa — «il 27 di
ogni mese escono gli stipendi» — e non diventa mai un movimento: se lo diventasse, il costo del
lavoro sarebbe contato due volte, una dal cedolino e una dalla previsione.

**`cedolino_mese` si riconcilia per matricola, `costo_lavoro` per id dipendente.** La tabella
`dipendente` di Supabase ha come chiave la mail aziendale e non ha la matricola, che vive
nell'anagrafica RU su SharePoint. Quindi `cedolino_mese.dipendente_id` è **nullable** e lo
risolve l'import: le righe che non trovano corrispondenza restano visibili come lista da
guardare, non nascoste come errore.

## Revolut, che non c'è ancora

Le tabelle `carta` (una per persona, con `cc_default`, tetti e ultime cifre) e le colonne
`movimento_bancario.carta_id`, `etichetta_cc`, `ricevuta_url` sono già nello schema, vuote.
L'attivazione è in corso con l'assistenza; il modello dati si decide una volta sola, e il giorno
in cui il conto si apre non ci deve essere una migrazione da fare.

Resta scritto il perché della carta **per persona e non per centro di costo**: troppe persone
lavorano su più servizi — lo dicono le timbrature — e il centro di costo arriva dall'etichetta
messa sulla singola spesa. `cc_default` è un ripiego, non una risposta: la riga che lo usa nasce
con confidenza `alta` e si segnala, mai `certa`.

## Le prove fatte

Otto prove sui vincoli, girate in una transazione poi annullata, tutte con l'esito atteso:

| Cosa | Esito |
|---|---|
| voce vuota su una fattura appena importata | ammessa (la FK composta non scatta con un NULL) |
| voce di ricavo su un costo | rifiutata |
| costo con importo positivo | rifiutato |
| centro di costo inventato | rifiutato |
| segnaposto `DA_ATTRIBUIRE` dato per certo | rifiutato |
| centro di costo vero marcato `da_attribuire` | rifiutato |
| stesso documento e stesso CC due volte | rifiutato |
| stesso documento ripartito su due CC | ammesso |

Più `registro_per_cc()` su dati finti, che somma i costi giusti, esclude il periodo fuori
intervallo e mette `DA_ATTRIBUIRE` in fondo con il suo totale.

### Il collaudo sul database vero, e l'errore che ha trovato

Un documento da 1.000 € ripartito 60/40 fra Locanda e Cosmica, poi riattribuito tutto alla
Locanda, poi cancellato:

| Passo | Esito |
|---|---|
| prima scrittura, ripartita 60/40 | 2 righe, totale −1.000 |
| riattribuzione a un solo CC, **quota omessa** | 1 riga |
| totale dopo la riattribuzione | **−1.000 su 1 riga**, non −2.000: le vecchie righe sono sparite nella stessa transazione |
| `registro_per_cc` | cc2 La Locanda nel Parco (Ristorazione): 1.000 |
| `registro_per_voce` | Alimentari e bevande: 1.000 |
| cancellazione | 0 righe, registro vuoto |

**Il secondo passo la prima volta è fallito**, ed è la ragione per cui il collaudo sul database
vero non si salta. Il controllo della somma leggeva `(r->>'quota')::numeric` secco: una riga che
**omette** la chiave `quota` — il caso normale di un documento non ripartito, cioè la quasi
totalità — sommava a NULL, quindi 0, e la funzione rifiutava una scrittura perfettamente
legittima. L'insert invece leggeva già `coalesce(…, 1)`. Le due letture ora sono la stessa.

Da fuori l'errore non si vedeva: le prove sui vincoli passavano tutte, perché passavano sempre
`quota` esplicita. E `lib/gestione/registro.ts` manda sempre `quota: r.quota ?? 1`, quindi
l'app non ci sarebbe mai inciampata — ci sarebbe inciampato il primo script scritto a mano, cioè
il travaso.

## Verifiche di anagrafica, al 7/09/2026

- **Nessun servizio di lavoro attivo è senza centro di costo.** I 14 servizi con
  `centro_costo_codice` nullo sono gli 8 giustificativi (ferie, 104, permessi: non sono lavoro)
  più 6 voci già spente.
- Tutti e 23 i centri di costo compaiono in `servizio`, con i nomi allineati.
- Su **cc21 Pian della Mussa** e **cc22 Amazing** non timbra nessuno, come previsto. Su **cc3
  Una Serra per Mirafiori** c'è **una** riga di timbratura: il piano la dava a zero. Su 61
  timbrature totali è ancora rodaggio, ma va guardata.

Resta da fare su SharePoint, e non lo può fare l'app: **popolare la colonna `Responsabile`**
della lista Centri di Costo. Le nomine sono già state fatte fuori dall'app; finché la colonna è
vuota, i coordinatori non potranno vedere in lettura il cruscotto del proprio centro di costo,
perché quell'accesso arriva da lì e non da un permesso.

## I costi: doppia scrittura, e la quadratura

Deciso con Dennis il 7/09/2026. La lista SharePoint Costi **resta**: il cruscotto costi, gli
allegati e i permessi continuano a funzionare come oggi, e `creaCosto()` — che è già il collo di
bottiglia unico dei tre flussi (costo diretto, chiusura manutenzione, consegna acquisto) — scrive
**anche** nel registro.

Il prezzo della doppia scrittura è che lo stesso costo sta in due posti, e se qualcuno corregge
un importo a mano su SharePoint il registro non se ne accorge. Si paga con
`scripts/travaso-costi-registro.mjs`, che **non è un travaso una volta sola: è lo strumento di
quadratura.** `origine_id` è l'id dell'item SharePoint, quindi rilanciarlo non duplica niente —
riscrive le stesse righe. Serve in tre momenti: adesso per lo storico, quando un riversamento in
diretta è fallito, e ogni volta che si vuole verificare che i due archivi dicano la stessa cosa.

**Se il registro non risponde, `creaCosto()` non fallisce.** Il costo su SharePoint c'è già ed è
la cosa che conta: far fallire tutta l'operazione metterebbe l'utente davanti a un errore per un
costo che invece è stato registrato, e lo farebbe reinserire — creando il doppione vero. Si
scrive un warning nei log e il buco si richiude al prossimo giro dello script.

### La traduzione categoria → voce sta in tabella, non nel codice

`mappa_categoria_voce` su Supabase, letta sia da `lib/gestione/voci.ts` sia dallo script di
travaso — che è JavaScript e non potrebbe importare dal TypeScript. Tre ragioni: `Categoria` su
SharePoint è **testo libero con suggerimenti**, non una scelta chiusa, quindi prima o poi
comparirà un valore nuovo; una correzione è un `update` e non un deploy; e duplicare la mappa in
due linguaggi vuol dire vederla divergere.

Le 19 righe seminate coprono i valori che i flussi scrivono davvero: i tipi di intervento delle
manutenzioni, i suggerimenti del form del costo diretto, e le undici categorie di spesa delle
richieste d'acquisto.

**Due categorie restano volutamente senza voce.** `Altro` non dice niente, e `Acquisti` è
l'etichetta generica che `lib/acquisti/data.ts` scrive su ogni costo da richiesta. Tradurle in
«Altri costi» sarebbe **peggio** che lasciarle vuote: una riga classificata ha l'aria di essere a
posto e nessuno la va più a rivedere, mentre una riga vuota resta nella lista di cosa manca.

Per i costi da richiesta d'acquisto la voce si recupera meglio: il costo porta il codice della
richiesta in testa al `Title`, e sulla richiesta c'è la categoria di spesa vera (Alimentari,
Attrezzatura, Cancelleria…). Lo script la va a prendere da lì.

### Come si distingue una manutenzione da un costo diretto

Non si distinguono dalla colonna `Fonte`: la chiusura di un ticket e i ripieghi dei form
scrivono entrambi `Manuale`. Ma la chiusura scrive il costo con `Title` = **id della richiesta**,
quindi lo script confronta il titolo con l'elenco dei Title delle richieste di manutenzione. È
l'unico modo non inventato di saperlo; `creaCosto()`, che quell'elenco non lo ha, scrive
`costo_diretto` e lascia allo script la correzione.

## Cosa manca, in ordine

1. **Anagrafica soggetti unica + Inserisci Spesa** (fase 3 del piano). Va prima
   dell'attribuzione perché è l'unico pezzo che chiede un cambio di abitudini: più presto parte,
   più dichiarazioni esistono quando le fatture arrivano.
3. **Import mensile dell'Elenco documenti** → imponibile, IVA, righe di dettaglio sulle 2.125
   fatture già in archivio.
4. **Cascata di attribuzione** e primo cruscotto per centro di costo.

## I file

| Cosa | Dove |
|---|---|
| Migrazione | `supabase/gestione_schema.sql` |
| Tipi | `types/gestione.ts` |
| Porta di scrittura e letture | `lib/gestione/registro.ts` |
| Traduzione categoria → voce | `lib/gestione/voci.ts` + tabella `mappa_categoria_voce` |
| Doppia scrittura dei costi | `lib/costi/data.ts` (`creaCosto` → `riversaNelRegistro`) |
| Travaso e quadratura | `scripts/travaso-costi-registro.mjs` |
| Sincronizzazione dell'anagrafica | `scripts/sync-centri-costo-supabase.mjs` |

## Una cosa che non ho potuto provare da qui

Dalla sandbox **non si raggiunge né Microsoft Graph né l'endpoint REST di Supabase** (il
connettore MCP esce per un'altra strada). Quindi le funzioni sono provate a livello SQL, ma la
chiamata via PostgREST — `/rpc/registro_riscrivi` con `p_righe` come array JSON, che è la strada
che usano sia `lib/gestione/registro.ts` sia lo script — si prova al primo giro a vuoto del
travaso. È lì che va guardata, prima di `--apply`.
