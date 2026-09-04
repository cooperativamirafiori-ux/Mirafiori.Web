# Uscite senza fattura

> Costi con scadenza che non passano dallo SDI: F24, tributi, contributi, rate, ricariche
> delle carte. Decisioni del 4 settembre 2026, con Dennis.
> Contesto: [`controllo-di-gestione-piano.md`](./controllo-di-gestione-piano.md) §
> «Le uscite fisse» · [`flussi-fatture.md`](./flussi-fatture.md)

## Il problema

Lo scadenzario di Webdesk porta le fatture. Ma una parte grossa di quello che esce dal conto
non ha una fattura elettronica dietro: l'F24, le rate di un debito contributivo, il contributo
annuale a Confcooperative, la TARI, la restituzione di una quota sociale, la ricarica delle
carte. Oggi vivono in un foglio Excel tenuto a mano, che nessuno guarda insieme alle fatture.

Un mese di esempio (settembre 2026, file di Dennis): 11 righe, 99.362,60 €. Di queste, il
grosso è costo del lavoro e arriva dal file del consulente; quello che resta a carico di
questa sezione vale circa 8.000 € al mese, su cinque righe.

## Le tre ipotesi scartate

**Un secondo import Excel periodico.** Ricrea in casa il doppio binario che con lo SDI siamo
*costretti* ad avere perché la fonte è esterna. Qui la fonte siamo noi: due verità che
divergono, righe già pagate che restano nel file, doppioni al caricamento successivo.

**Una cartella su SharePoint con un file letto in automatico.** Stesso difetto, più il fatto
che nessuno saprebbe mai se una riga del file è già stata pagata.

**Un template Excel per il caricamento iniziale.** Preparato e poi abbandonato: il file di
esempio era un campione, non l'elenco completo, e ci sarà sempre un tipo di costo nuovo.

## La forma scelta: scadenze senza fattura

**Non sono un oggetto nuovo.** Finiscono in `scadenza` con `fattura_passiva_id` nullo:
stessa tabella, stesse code, stesso tasto PAGATA, stessi totali a 7/30/60/90 giorni.

La ragione è che tutto quello che serve esiste già ed è scritto **sullo stato e sulla data,
non sulla fattura**. Una tabella parallela avrebbe richiesto di riscrivere le code, i totali,
lo scaduto per anzianità e l'audit — e ogni vista futura si sarebbe dovuta ricordare di
sommare due sorgenti. Prima o poi una se lo dimentica, e il numero che esce è sbagliato senza
che nulla lo segnali.

Migrazione: [`supabase/uscite_manuali.sql`](../supabase/uscite_manuali.sql).

| Colonna nuova | A cosa serve |
|---|---|
| `oggetto` | Cosa si paga, quando non c'è un fornitore |
| `natura` | `costo` (va a centro di costo) oppure `flusso` (solo cassa) |
| `origine` | `sdi` o `manuale`. Default `sdi`: tutto il pregresso viene dall'import |
| `inserita_da` | Chi l'ha scritta |
| `note` | Facoltative: quale rata, dove sta il documento |

Due vincoli fanno il resto: `scadenza_identita_chk` (o fattura, o oggetto — mai nessuno dei
due) e `scadenza_origine_chk` (`manuale` implica nessuna fattura, e viceversa).

## Le decisioni, e il perché

**Costo o flusso.** È il campo che Dennis ha chiesto, e vale la pena capire perché non è una
sottigliezza contabile. La rata di un debito contributivo, una ricarica delle carte e la
restituzione di una quota sociale escono dal conto **senza essere un costo di quest'anno**: il
costo è stato registrato quando il debito è nato, o non è un costo affatto. Contarle fra i
costi gonfierebbe i centri di costo di somme già registrate altrove. Applicando questo
criterio alle 11 righe di esempio, quattro cambiano classificazione rispetto a come le
avevamo lette a prima vista — rata INPS, rata tasse, pignoramenti e restituzione della quota
sono `flusso`, non costi.

**Nascono `da_pagare`, mai `da_approvare`.** Un F24 da 80.000 € supererebbe di molto la soglia
dei 1.500 €, ma chi lo inserisce ha in mano il documento e la decisione: nessuno può
rifiutarlo. Farlo approvare ogni mese abitua chi approva a cliccare senza guardare, e
l'abitudine è il rischio vero. La soglia resta sulle fatture.

**`famiglia_modalita = 'bonifico'`.** Non perché lo sia sempre, ma perché è la famiglia che
passa dalle code. `automatica` toglierebbe la riga dalla lista di chi paga, e una riga che
nessuno vede è una riga che nessuno paga.

**Il centro di costo non si chiede all'inserimento.** La riga entra subito nella previsione e
l'attribuzione avviene dopo, nella stessa coda di allocazione delle fatture. Previsione di
cassa e controllo di gestione sono **due orologi**: giorni contro mesi. Legare l'attribuzione
all'inserimento significa o bloccare chi inserisce, o rallentare la previsione — che è la cosa
che serve ogni settimana.

**Niente ricorrenze in questa fase.** L'F24 e gli stipendi tornano ogni mese, ma se devono
avere il tasto PAGATA devono esistere come righe, e generarle in avanti vuol dire righe
stimate su cui qualcuno clicca «pagata» con un importo che non è quello vero. Si inseriscono
quando se ne conosce la cifra — che è comunque il momento in cui la si conosce. Cinque o sei
inserimenti al mese. Se Claudia si stufa, la regola diventa una tabella a parte che genera
righe qui, e questo schema non cambia.

**Il doppione si avvisa, non si blocca.** Inserire due volte lo stesso F24 è l'errore più
probabile di questa mascherina, e a differenza di una fattura non c'è un protocollo che lo
impedisca. Stesso importo e scadenza entro tre giorni fanno rispondere 409 all'API, con la
riga somigliante in chiaro; si conferma una volta e passa. Bloccare sarebbe sbagliato: due
rate uguali nello stesso mese esistono.

**Cancellazione vera, non uno stato.** Una riga inserita per sbaglio non è un fatto storico da
conservare: lasciarla come `stornata` sporcherebbe le liste con roba che non è mai esistita.
La traccia di chi l'ha creata e di chi l'ha tolta sta nel log attività, ed è lì che si guarda.
Una riga già pagata non si tocca: si annulla il pagamento dalla coda, e solo dopo.

## Il punto che poteva rompere tutto

`lib/pagamenti/data.ts` leggeva le scadenze con `fattura_passiva!inner`. Con `!inner`
PostgREST fa un INNER JOIN, e **ogni riga senza fattura sparisce dal risultato**: le uscite a
mano non sarebbero comparse né nelle code né nei totali, senza un solo errore. È una parola
sola, `inner`, e il fatto che non produca nessun sintomo è ciò che la rende pericolosa.

## Il punto che sembrava rompersi e non si rompe

L'import marca `scomparsa = true` le scadenze che non trova più nell'export. Il timore era che
il primo caricamento dopo il rilascio marcasse come sparite tutte le righe di Claudia — che
per definizione non sono in un file di Webdesk.

Non accade, ed è già così per costruzione: `import.ts` costruisce l'insieme delle righe
esistenti con `.in('fattura_passiva_id', blocco)`, dove `blocco` contiene gli id delle fatture
**presenti nel file**. Le righe a mano hanno `fattura_passiva_id` nullo, quindi non entrano
mai in quell'insieme. Tutte le scritture dell'import sono poi filtrate su id che vengono da
lì. Verificato riga per riga prima di scrivere la migrazione.

## I file

| Cosa | Dove |
|---|---|
| Migrazione | `supabase/uscite_manuali.sql` |
| Tipi | `types/pagamenti.ts` (`OrigineScadenza`, `NaturaUscita`, `NuovaUscita`, `NATURE`) |
| Logica | `lib/pagamenti/uscite.ts` (validazione, doppione, crea/modifica/elimina) |
| Lettura | `lib/pagamenti/data.ts` (join esterno, `titolo`) |
| API | `app/api/pagamenti/uscite/` (POST) e `uscite/[id]/` (PATCH, DELETE) |
| Mascherina | `app/(app)/controllo-gestione/flussi-fatture/NuovaUscita.tsx` |

Permesso: `Pagamenti`, lo stesso di chi carica lo scadenzario e chiude una scadenza. Chi tiene
la cassa è chi sa cosa esce.

## Cosa resta aperto

- **Gli stipendi.** Non erano nello scadenzario di esempio e sono l'uscita più grossa. Vengono
  dal file del consulente del lavoro, non da qui: la previsione li vedrà da quella sorgente.
  Da chiarire quando si costruiranno i centri di costo.
- **Il fabbisogno cumulato.** I totali oggi sono finestre (entro 30, entro 60). Il numero che
  serve a Dennis — «quanto devo avere in banca per arrivare coperto al 16» — è il **cumulato
  da oggi a una data**, che è diverso da quanto esce in quel giorno: il denaro uscito prima non
  c'è più. Prova su carta in `../fabbisogno-cassa.html`.
- **Il conto di uscita.** Tenuto fuori per scelta: tutto in un totale unico, gli spostamenti
  fra conti si fanno a mano guardando la banca.
- **L'attribuzione a centro di costo.** La colonna `natura` dice quali righe la vogliono. La
  coda di riparto arriva con i centri di costo.
