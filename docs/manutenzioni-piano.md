# Manutenzioni — la richiesta diventa una pratica

Deciso con Dennis il 31 ottobre 2026. Dennis gestisce le manutenzioni e aveva tre problemi:

1. alcune richieste sono lavori di **mesi**: devono stare in una sezione a parte, ma il
   richiedente deve sapere che sono state viste, **senza assegnare un tecnico**;
2. deve poter **scrivere al richiedente** e il richiedente deve poter **rispondere**, dentro la
   finestra della manutenzione, con una mail di avviso;
3. una manutenzione ha **più fatture e più costi, in tempi diversi** (esempio vero: una sola
   richiesta con luce fulminata + due doccini + asse del water), e tutto passa da
   **Cura Ambienti (cc24)**, che poi ribalta sul centro di costo della struttura.

## L'idea

La richiesta MAN-… resta su SharePoint com'è (numero, struttura, richiedente, stato) e diventa la
finestra unica di quella manutenzione: **stato · cose da fare · messaggi · costi**. Quello che ha
tante righe (messaggi, cose da fare, costi) sta su **Supabase**, legato all'id SharePoint della
richiesta: è lì che stanno già fatture, Lavori di Cura Ambienti e registro.

## Decisioni di Dennis (31/10/2026)

- **Il richiedente può rispondere** ai messaggi; quando risponde **arriva una mail a Dennis**
  (`MANUTENZIONI_MAIL_TO`, default dennis.maseri@). Quando scrive la gestione, la mail va al
  richiedente.
- **I costi li vede solo la gestione.** Il richiedente vedrà **solo il costo totale, a richiesta
  chiusa** (fase 2).
- **Cose da fare: sì**, righe che si spuntano; le può aggiungere **anche il richiedente**. Le
  spunta solo la gestione.
- **«Chiudi ticket»**: quando ci sarà la sezione Costi, i campi «Importo fattura» e «Ore lavoro
  interno» si tolgono dalla chiusura (ok di Dennis). Le richieste già chiuse tengono i loro valori.
- **Importo ribaltato = imponibile** (IVA esclusa): Dennis non ha scelto, si è tenuta la regola
  del cruscotto del 5/10/2026. Sta in un punto solo, così si cambia facilmente.
- **«Note responsabile» resta nota interna**, separata dai messaggi (il segnaposto dice già
  «Note interne…»).

## Fase 1 — presa in carico, lungo corso, messaggi, cose da fare (31/10/2026)

**Stato nuovo «Presa in carico»** fra Aperta e In lavorazione (scelta aggiunta alla colonna Stato
da `scripts/provision-manutenzioni-pratica.mjs`). Il bottone «Prendi in carico» del Pannello
scrive una nota che arriva al richiedente per mail e resta nella conversazione. Non serve il
tecnico. Su una richiesta già In lavorazione non si torna indietro: resta solo il messaggio.

**Lungo corso è una spunta, non uno stato** (`LungoCorso` + `PrevisioneLungoCorso`, testo libero
tipo «primavera 2027»): una pratica lunga può essere prima presa in carico e poi in lavorazione
senza uscire dalla sua sezione. Nel Pannello le richieste di lungo corso hanno una sezione a parte.

**Conversazione** (`manutenzione_messaggio`): ogni messaggio ha un `lato` (`gestione` |
`richiedente`) e un `tipo` (`messaggio`, `presa_in_carico`, `tecnico_assegnato`, `chiusura`).
Anche assegnazione del tecnico e chiusura lasciano una riga, così la storia sta tutta lì.
`letto_il` si scrive quando l'altra parte apre la conversazione: serve al pallino «nuovo» nelle
due schermate. Se Supabase non risponde, l'operazione su SharePoint va avanti comunque (la
conversazione è un di più, non deve bloccare un'assegnazione).

**Cose da fare** (`manutenzione_voce`): righe con testo, chi e quando le ha aggiunte, spunta.

**Chi può cosa:** la gestione è `isAdmin` (i tre in codice). Il richiedente è chi ha aperto la
richiesta, riconosciuto dal `RichiedenteLookupId` della lista: non c'è una vista «richieste della
mia struttura», come prima.

## Fase 2 — costi e fatture (da fare)

Nella finestra, sezione **Costi**, visibile solo alla gestione. Righe di tre tipi, aggiunte in
momenti diversi:

| Tipo | Da dove arriva | Importo |
|---|---|---|
| fattura | fattura SDI già presa su cc24 | tutta o una parte (imponibile) |
| ore | ore del manutentore | ore × tariffa interna valida in quel mese |
| spesa | scontrino, carta Qonto di cc24 | scritto a mano |

**Collegare una fattura, dai due lati:** in Flussi fatture, quando la si prende su cc24, compare
«Collega a manutenzione»; nella finestra, «Collega fattura» cerca fra le fatture di cc24 non
ancora distribuite. Una fattura si può dividere fra più manutenzioni e lasciare un resto su cc24
(consumo). L'app impedisce di distribuirne più del suo importo.

**Ribaltamento:** la fattura resta un costo vero di cc24. Ogni riga di costo scrive nel registro
la coppia `SINT` (costo, CC della struttura) / `RINT` (recupero, cc24) del piano di Cura Ambienti,
**nel mese della riga**: un lavoro di mesi arriva alla struttura un pezzo per volta. Materiali al
costo (su cc24 si annullano), ore alla tariffa interna (su cc24 resta il margine). È il passo 3 di
`cura-ambienti-piano.md`: si scrive una volta e vale per pulizie e manutenzioni.

Con la fase 2 la chiusura non scrive più in Costi Strutture importo + ore × «Costo orario pulizie»
(sarebbe doppio): «Chiudi» chiude e basta, e il richiedente vede il totale.

## Dati

- SharePoint, lista Richieste: scelta `Presa in carico` nella colonna `Stato`, colonne
  `LungoCorso` (sì/no) e `PrevisioneLungoCorso` (testo).
- Supabase: `supabase/manutenzioni_pratica.sql` (`manutenzione_messaggio`, `manutenzione_voce`).
