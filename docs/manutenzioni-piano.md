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

## Fase 2 — costi e fatture (1/11/2026)

Nella finestra, sezione **Costi** (`components/manutenzioni/CostiRichiesta.tsx`), visibile solo
alla gestione. Righe di tre tipi, aggiunte in momenti diversi, **anche a richiesta chiusa** (le
fatture arrivano spesso dopo): per questo il Pannello ha in fondo «Completate negli ultimi 4
mesi».

| Tipo | Da dove arriva | Importo |
|---|---|---|
| fattura | fattura SDI su cc24 o ancora libera (collegarla la prende su cc24 con `segna`, vince il primo) | tutta o una parte dell'imponibile |
| ore | ore del personale di Cura Ambienti, figura manutentore o pulizie | ore × `tariffeDi` del mese, **mai salvato** |
| spesa | scontrino, carta | scritto a mano |

- Tabella `manutenzione_costo` (`supabase/manutenzioni_costi.sql`). Struttura e CC si **copiano**
  alla creazione. Un trigger impedisce di distribuire più dell'imponibile della fattura, anche
  con due collegamenti in contemporanea (`for update` sulla fattura).
- Le fatture si collegano **solo dalla finestra** della richiesta. Il lato «Collega a
  manutenzione» dentro Flussi fatture / Fatture del servizio non è ancora fatto.
- **Chiusura:** «Chiudi richiesta» chiude e basta, con conferma. Via «Importo fattura» e «Ore
  lavoro interno» (ok di Dennis), e non si scrive più in Costi Strutture. Le richieste chiuse
  prima tengono le loro righe.
- **Cruscotto Costi per struttura** (`lib/costi-strutture/calcoli.ts`): i costi delle richieste
  entrano in «Manutenzioni» nel mese della loro data, sulla struttura della richiesta. Un ticket
  che ha costi qui non si conta più anche dalla sua riga MAN-… in Costi Strutture (vale l'elenco,
  che è più completo: chiuso alla vecchia maniera e poi arricchito di fatture non fa doppio).
- **Richiedente:** vede il costo totale solo a richiesta completata, aprendo «Messaggi e cose da
  fare».

### Ribaltamento nel registro: rimandato apposta

Il piano di Cura Ambienti prevedeva la coppia `SINT` / `RINT` nel registro. Al 1/11/2026 il
registro (`movimento`) è **vuoto** e nessuna schermata lo legge: il cruscotto del CdG legge le
fatture SDI per centro di costo, Costi per struttura legge le sue fonti. Scrivere lì adesso non
farebbe vedere niente a nessuno. In più la porta del registro (`registro_riscrivi`) vuole che le
righe di un documento sommino quota 1, e la coppia costo + recupero (quota 1 ciascuna) non ci
entra: servirà una funzione SQL che scriva le due metà in una transazione, più le voci `SINT` /
`RINT`, la colonna `interna` su `voce_analitica` e `'ribaltamento'` fra le `fonte` ammesse. Si fa
**una volta per Lavori e manutenzioni**, quando il cruscotto passerà a leggere il registro.

Effetto oggi: nel cruscotto del CdG la fattura resta su **cc24**; nel cruscotto Costi per
struttura il costo sta sulla **struttura**. Quando arriverà il ribaltamento, le due viste
torneranno a coincidere.

## Dati

- SharePoint, lista Richieste: scelta `Presa in carico` nella colonna `Stato`, colonne
  `LungoCorso` (sì/no) e `PrevisioneLungoCorso` (testo).
- Supabase: `supabase/manutenzioni_pratica.sql` (`manutenzione_messaggio`, `manutenzione_voce`),
  `supabase/manutenzioni_costi.sql` (`manutenzione_costo` + trigger sul tetto della fattura).
