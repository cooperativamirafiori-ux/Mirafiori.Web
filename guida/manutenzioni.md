---
area: Manutenzioni
descrizione: Segnalare un guasto o un intervento in una struttura e seguirlo fino alla chiusura; per gli amministratori, assegnare i tecnici, chiudere i ticket e registrare i costi.
pagine:
  - percorso: /manutenzioni
    titolo: Manutenzioni
    accesso: [permesso:Manutenzioni, admin]
    cosa: Punto di partenza dell'area, con le schede per nuova richiesta e le mie richieste (gli amministratori vedono anche le schede di gestione).
  - percorso: /nuova-richiesta
    titolo: Nuova Richiesta
    accesso: [permesso:Manutenzioni, admin]
    cosa: Modulo per segnalare un intervento di manutenzione in una struttura.
  - percorso: /mie-richieste
    titolo: Le mie richieste
    accesso: [permesso:Manutenzioni, admin]
    cosa: Elenco delle richieste che hai inviato, con lo stato e il tecnico assegnato.
  - percorso: /dashboard
    titolo: Pannello di controllo
    accesso: [admin]
    cosa: Tutte le richieste non ancora completate, con assegnazione del tecnico e chiusura del ticket.
  - percorso: /manutenzioni/fornitori
    titolo: Fornitori
    accesso: [admin]
    cosa: Anagrafica delle ditte e dei tecnici a cui si affidano le manutenzioni.
  - percorso: /inserisci-costo
    titolo: Inserisci Costo
    accesso: [admin]
    cosa: Registrare un costo diretto su un centro di costo o una struttura, senza aprire una richiesta.
  - percorso: /cruscotto-costi
    titolo: Cruscotto Costi
    accesso: [admin]
    cosa: Totale dei costi dell'anno, per centro di costo o per struttura.
---

# Manutenzioni

L'area Manutenzioni serve a **segnalare un problema in una struttura** (un guasto, un
lavoro da fare, una pulizia straordinaria) e a seguire la richiesta finché l'intervento è
fatto.

Ci sono due livelli:

- chi ha il **permesso Manutenzioni** (di solito i responsabili di struttura) può inviare
  richieste e vedere le proprie;
- gli **amministratori delle manutenzioni** gestiscono tutte le richieste: assegnano il
  tecnico, chiudono il ticket, registrano i costi e tengono l'anagrafica dei fornitori.

## Non vedo la scheda «Manutenzioni» nella Home, perché?

La scheda «Manutenzioni» compare nella Home solo a chi ha il permesso Manutenzioni o è
amministratore delle manutenzioni. Se non la vedi, non hai il permesso.

Il permesso si assegna dal pannello Permessi dell'Amministrazione. Chiedi all'ufficio
amministrazione o al tuo responsabile se ti serve.

Se provi ad aprire una pagina dell'area senza permesso, l'app ti riporta alla Home.

## Cosa trovo nella pagina Manutenzioni?

Apri [Manutenzioni](/manutenzioni) dalla Home. Trovi:

- «Nuova richiesta» – per segnalare un intervento;
- «Le mie richieste» – per controllare lo stato delle tue segnalazioni.

Gli amministratori vedono anche, con l'etichetta «Admin»:

- «Pannello di controllo» – gestire e assegnare le richieste;
- «Inserisci costo» – registrare un costo diretto su una struttura;
- «Cruscotto costi» – costi per struttura (manutenzioni, utenze, costi fissi). Questa scheda
  porta al cruscotto dei costi per struttura dell'Amministrazione;
- «Fornitori» – anagrafica di ditte e tecnici.

## Come segnalo un guasto o un intervento?

1. Dalla Home tocca «Manutenzioni».
2. Tocca «Nuova richiesta».
3. In «Struttura» scegli la struttura dove c'è il problema.
4. In «Tipo intervento» scegli una voce:
   «Manutenzione ordinaria», «Manutenzione straordinaria», «Guasto urgente»,
   «Pulizia straordinaria» oppure «Altro».
5. In «Priorità» scegli «Normale», «Alta» oppure «Urgente (esecuzione in giornata)».
6. In «Descrizione problema» spiega cosa succede: dove, cosa non funziona, da quando.
7. Tocca «Invia richiesta».

Tutti i campi sono obbligatori.

Quando la richiesta è salvata compare il messaggio «Richiesta inviata» con il suo numero,
per esempio `MAN-2026-047`. Accanto c'è «Vedi le mie richieste →» per andare all'elenco.
Il modulo si svuota, così puoi inviarne subito un'altra.

## Cosa succede dopo che ho inviato la richiesta?

1. La richiesta nasce nello stato **Aperta**.
2. Parte una mail di avviso per gli amministratori delle manutenzioni. Se hai scelto la
   priorità «Urgente (esecuzione in giornata)», l'oggetto della mail comincia con
   «[URGENTE]».
3. Un amministratore assegna un tecnico: la richiesta passa a **In lavorazione** e **ti
   arriva una mail** «Tecnico assegnato» con il nome del tecnico ed eventuali note del
   responsabile. Puoi contattare il tecnico per concordare giorno e ora.
4. Quando l'intervento è fatto, l'amministratore chiude il ticket: la richiesta passa a
   **Completata** e **ti arriva una mail** «Completata».

## Dove vedo lo stato delle mie richieste?

1. Dalla pagina [Manutenzioni](/manutenzioni) tocca «Le mie richieste».
2. In alto leggi quante richieste hai («… richieste trovate»).
3. Per ogni richiesta vedi il numero, la data, la struttura, il tipo, la priorità, la
   descrizione e un'etichetta colorata con lo stato:
   - **Aperta** (rossa): non ha ancora un tecnico;
   - **In lavorazione** (arancione): il tecnico è stato assegnato;
   - **Completata** (verde): l'intervento è chiuso.
4. Se c'è un tecnico, leggi «Tecnico assegnato:» con il suo nome e, se c'è, il telefono.

Se non hai mai inviato richieste leggi «Nessuna richiesta trovata.» e il collegamento
«Inserisci la prima».

## Posso modificare o cancellare una richiesta già inviata?

No, dall'app non si può. Se hai sbagliato qualcosa o il problema si è risolto da solo,
avvisa gli amministratori delle manutenzioni. Puoi anche inviare una nuova richiesta con i
dati giusti.

## Il tecnico non si è fatto sentire, cosa faccio?

Guarda in [Le mie richieste](/mie-richieste) il nome e il telefono del tecnico assegnato e
chiamalo. Se la richiesta è ancora **Aperta**, nessun tecnico è stato ancora assegnato:
contatta gli amministratori delle manutenzioni.

---

# Per gli amministratori

## Come vedo tutte le richieste da gestire?

1. Da [Manutenzioni](/manutenzioni) tocca «Pannello di controllo».
2. In alto ci sono quattro numeri: «Aperte», «In lavorazione», «Urgenti», «Da assegnare».
3. Sotto c'è l'elenco «Richieste attive»: tutte le richieste **non ancora completate**, le
   più recenti prima. Le completate qui non compaiono.

Ogni richiesta mostra numero, struttura, stato, priorità, da quanti giorni è aperta (in
rosso se più di 7), richiedente e tecnico. Se il tecnico manca leggi «⚠ Tecnico da
assegnare».

Se non c'è nulla da fare leggi «Nessuna richiesta attiva 🎉».

## Come assegno un tecnico a una richiesta?

1. Nel [Pannello di controllo](/dashboard) tocca la richiesta: si apre il dettaglio.
2. Nel riquadro «Assegna tecnico» scegli il tecnico dall'elenco. Sotto compare il suo
   telefono.
3. Se vuoi, scrivi una nota nel campo «Note per il richiedente (facoltativo)»: finisce
   nella mail che riceve il richiedente.
4. Tocca «Assegna».

Compare «Tecnico assegnato». La richiesta passa a **In lavorazione** e al richiedente arriva
una mail con il nome del tecnico e le tue note.

Il tecnico si sceglie fra quelli dell'anagrafica [Fornitori](/manutenzioni/fornitori). Se
manca, aggiungilo lì prima.

## Come chiudo un ticket quando l'intervento è fatto?

1. Nel [Pannello di controllo](/dashboard) tocca la richiesta.
2. Nel riquadro «Chiudi ticket» compila almeno uno dei due campi:
   - «Importo fattura (€)» – quanto ha fatturato il fornitore;
   - «Ore lavoro interno» – le ore fatte dal nostro personale.
3. Se vuoi, metti la «Data intervento» e le «Note responsabile».
4. Tocca «Chiudi ticket».

Compare «Chiusa — Totale: €…». Cosa succede:

- la richiesta passa a **Completata** e sparisce dal pannello;
- l'app registra il costo sulla struttura della richiesta, con il centro di costo di quella
  struttura. Il totale è l'importo della fattura più le ore moltiplicate per la tariffa
  oraria interna;
- una richiesta di tipo «Guasto urgente» viene registrata nei costi come «Manutenzione
  straordinaria»;
- arriva una mail di chiusura agli amministratori e una al richiedente.

Se non metti né importo né ore, compare «Inserisci almeno importo o ore».

Una richiesta completata non si può più riaprire né chiudere di nuovo dall'app.

## Voglio solo salvare una nota, senza chiudere il ticket

1. Apri la richiesta nel [Pannello di controllo](/dashboard).
2. Scrivi nel campo «Note responsabile».
3. Tocca «Salva note».

Compare «Salvato». La richiesta resta nello stato in cui era.

## Come aggiungo o modifico un fornitore?

1. Da [Manutenzioni](/manutenzioni) tocca «Fornitori».
2. Per aggiungerne uno tocca «+ Nuovo fornitore». Per modificarne uno, toccalo
   nell'elenco. Puoi cercare con «Cerca per nome, ditta, P.IVA…».
3. Compila i campi. Solo «Nome» è obbligatorio: è il nome che compare quando si assegna una
   richiesta. Gli altri sono «Ditta / ragione sociale», «Specializzazione», «Telefono»,
   «Email», «Partita IVA», «PEC», «Indirizzo», «Note».
4. Tocca «Salva».

Chi aggiungi qui si può assegnare subito alle richieste dal Pannello di controllo.

Un fornitore **non si può eliminare** dall'app, perché le richieste già fatte restano
collegate a lui.

## Come registro un costo senza aprire una richiesta?

Serve per costi che non nascono da un ticket (per esempio una bolletta, l'assicurazione,
una spesa diretta).

1. Da [Manutenzioni](/manutenzioni) tocca «Inserisci costo».
2. «Struttura»: scegli la struttura, oppure lascia «— Nessuna struttura —» per i servizi
   senza sede fisica. Se la scegli, l'app compila da sola il centro di costo (puoi
   cambiarlo).
3. «Centro di costo»: obbligatorio.
4. «Categoria»: obbligatoria. Puoi scegliere fra i suggerimenti (per esempio «Utenze»,
   «Manutenzione ordinaria», «IMU», «Assicurazione») o scriverne una nuova.
5. «Importo (€)» e «Data costo»: obbligatori. La data parte da oggi.
6. «Fornitore» e «Causale / descrizione»: facoltativi.
7. Tocca «Registra costo».

Compare «Costo registrato su …» con l'importo, e il collegamento «Vai al cruscotto →».
Struttura, centro di costo e data restano compilati, così puoi inserire subito un altro
costo.

## Dove vedo quanto si è speso?

Ci sono due cruscotti:

- la scheda «Cruscotto costi» della pagina [Manutenzioni](/manutenzioni) porta al
  cruscotto dei costi per struttura dell'Amministrazione (utenze, manutenzioni, costi fissi
  e altro);
- il [Cruscotto Costi](/cruscotto-costi) dell'area Manutenzioni, che si apre dopo aver
  registrato un costo con «Vai al cruscotto →».

Nel [Cruscotto Costi](/cruscotto-costi):

1. In alto scegli «Per centro di costo» oppure «Per struttura».
2. A destra scegli l'anno.
3. Leggi il totale dell'anno, quanti centri o strutture hanno costi e quanti movimenti ci
   sono.
4. Tocca una riga per vedere la divisione «Per categoria» e l'elenco dei «Movimenti».

Le righe a zero compaiono in grigio. I costi senza centro di costo (o senza struttura)
sono raggruppati in fondo, e un avviso giallo ti dice quanti sono: vanno sistemati.

## Problemi comuni

**«⚠️ Compila tutti i campi obbligatori.»**
Nella nuova richiesta mancano struttura, tipo, priorità o descrizione. Compilali e
riprova.

**«Non hai il permesso per aprire richieste di manutenzione.»**
Non hai il permesso Manutenzioni. Chiedilo all'ufficio amministrazione.

**«Utente SP non trovato: …»**
L'app non è riuscita a riconoscere il tuo account. Aspetta qualche secondo e riprova a
inviare la richiesta. Se il messaggio torna, avvisa l'ufficio amministrazione.

**La struttura che cerco non c'è nell'elenco.**
L'elenco delle strutture lo gestisce l'amministrazione: chiedi di aggiungerla.

**«Richiesta già completata»** (amministratori)
Il ticket è già stato chiuso, magari da un altro amministratore. Ricarica il Pannello di
controllo.

**«Inserisci almeno importo o ore»** (amministratori)
Per chiudere un ticket serve almeno l'importo della fattura o le ore di lavoro interno.

**«⚠️ Compila centro di costo, categoria, importo e data.»** /
**«⚠️ L'importo deve essere un numero maggiore di zero.»** (amministratori)
Nell'inserimento di un costo manca un campo obbligatorio o l'importo è zero.

**«Il nome è obbligatorio»**, **«Email non valida»**, **«PEC non valida»** (amministratori)
Nell'anagrafica fornitori manca il nome o un indirizzo email è scritto male.

**«Accesso negato»**
L'operazione è riservata agli amministratori delle manutenzioni.
