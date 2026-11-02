---
area: Manutenzioni
descrizione: Segnalare un guasto o un intervento in una struttura, scriversi con chi gestisce le manutenzioni e seguirlo fino alla chiusura; per gli amministratori, prendere in carico, tenere i lavori di lungo corso, assegnare i tecnici, chiudere i ticket e registrare i costi.
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
    cosa: Elenco delle richieste che hai inviato, con lo stato, il tecnico assegnato, i messaggi e le cose da fare.
  - percorso: /dashboard
    titolo: Pannello di controllo
    accesso: [admin]
    cosa: Tutte le richieste non ancora completate, con presa in carico, lungo corso, messaggi, cose da fare, costi (fatture, ore, spese), assegnazione del tecnico e chiusura; c'è anche l'assistente a cui chiedere elenchi e operazioni a parole.
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
3. Quando un amministratore vede la richiesta, può **prenderla in carico** anche prima di
   avere un tecnico: la richiesta passa a **Presa in carico** e **ti arriva una mail**
   «Presa in carico» con una sua nota. Se è un lavoro che richiede mesi, nella mail e
   nella richiesta leggi «Lavoro di lungo corso» e, se c'è, la previsione.
4. Un amministratore assegna un tecnico: la richiesta passa a **In lavorazione** e **ti
   arriva una mail** «Tecnico assegnato» con il nome del tecnico ed eventuali note del
   responsabile. Puoi contattare il tecnico per concordare giorno e ora.
5. Quando l'intervento è fatto, l'amministratore chiude la richiesta: passa a
   **Completata** e **ti arriva una mail** «Completata». Da quel momento, aprendo
   «Messaggi e cose da fare», leggi anche il **costo totale dell'intervento** (se sono
   stati registrati dei costi). Prima della chiusura i costi non si vedono.

## Dove vedo lo stato delle mie richieste?

1. Dalla pagina [Manutenzioni](/manutenzioni) tocca «Le mie richieste».
2. In alto leggi quante richieste hai («… richieste trovate»).
3. Per ogni richiesta vedi il numero, la data, la struttura, il tipo, la priorità, la
   descrizione e un'etichetta colorata con lo stato:
   - **Aperta** (rossa): nessuno l'ha ancora presa in carico;
   - **Presa in carico** (azzurra): è stata vista, ma non c'è ancora un tecnico;
   - **In lavorazione** (arancione): il tecnico è stato assegnato;
   - **Completata** (verde): l'intervento è chiuso.
4. Se c'è un tecnico, leggi «Tecnico assegnato:» con il suo nome e, se c'è, il telefono.
5. Se è un lavoro lungo leggi «⏳ Lavoro di lungo corso» e, se c'è, la previsione.
6. Sotto ogni richiesta c'è il tasto «Messaggi e cose da fare». Se ci sono messaggi che
   non hai ancora letto, accanto compare «1 nuovo» o «… nuovi».

Se non hai mai inviato richieste leggi «Nessuna richiesta trovata.» e il collegamento
«Inserisci la prima».

## Come scrivo a chi gestisce le manutenzioni?

1. Apri [Le mie richieste](/mie-richieste).
2. Sotto la richiesta tocca «Messaggi e cose da fare».
3. Nel riquadro «Messaggi» leggi quello che ti hanno scritto: i tuoi messaggi sono a
   destra, quelli degli amministratori a sinistra.
4. Scrivi nel campo «Scrivi a chi gestisce le manutenzioni…» e tocca «Invia messaggio».

A chi gestisce le manutenzioni arriva una mail «Nuovo messaggio». Quando ti rispondono
arriva una mail anche a te, con il tasto «Rispondi nella richiesta» che apre direttamente
quella richiesta.

Puoi scrivere anche su una richiesta già **Completata**, per esempio se il problema è
tornato.

## La mia richiesta contiene più lavori: come li elenco?

Nel riquadro «Cose da fare» puoi scrivere i lavori uno per riga (per esempio «luce
fulminata in camera», «tubo del doccino», «asse del water»).

1. Apri [Le mie richieste](/mie-richieste) e tocca «Messaggi e cose da fare».
2. Scrivi un lavoro nel campo sotto «Cose da fare» e tocca «Aggiungi».
3. Ripeti per ogni lavoro.

Quando un lavoro è fatto, l'amministratore lo spunta: lo vedi con il segno ✓ e la data, e
in alto leggi «… di … fatte». Tu non puoi spuntare né togliere le righe. Su una richiesta
completata non si aggiungono più righe.

## Posso modificare o cancellare una richiesta già inviata?

No, dall'app non si può. Se hai sbagliato qualcosa o il problema si è risolto da solo,
scrivilo nei messaggi della richiesta (vedi sopra). Puoi anche inviare una nuova richiesta con i
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
   più recenti prima, tranne quelle di lungo corso.
4. Più in basso c'è la sezione «⏳ Lungo corso», con i lavori di mesi.
5. Se un richiedente ha scritto su una richiesta già completata, compare anche la sezione
   «Completate, con messaggi».

Ogni richiesta mostra numero, struttura, stato, priorità, da quanti giorni è aperta (in
rosso se più di 7), richiedente e tecnico. Se il tecnico manca leggi «⚠ Tecnico da
assegnare». Se il richiedente ti ha scritto e non hai ancora letto, compare «✉ 1 messaggio
nuovo»: si toglie quando apri la richiesta.

«Da assegnare» conta le richieste Aperte o Prese in carico senza tecnico, fuori dal lungo
corso.

Se non c'è nulla da fare leggi «Nessuna richiesta attiva 🎉».

## Posso chiedere le richieste a parole, per esempio quelle di un tecnico?

Sì. Nel [Pannello di controllo](/dashboard), sotto i quattro numeri, c'è «Chiedi
all'assistente». Si apre una chat dove scrivi quello che ti serve, per esempio:

- «Elenco delle richieste attive di Mirco, con cosa fare, sede e indirizzo»;
- «Quali richieste aperte non hanno ancora un tecnico?»;
- «Cosa c'è di urgente alla Locanda?».

L'assistente guarda le richieste (anche quelle completate, se lo chiedi), le strutture con
il loro indirizzo e i tecnici, e ti risponde con un elenco.

Puoi anche chiedergli di **fare** le cose: assegnare un tecnico, prendere in carico con una
nota, mettere o togliere il lungo corso, scrivere al richiedente, aggiungere o spuntare le
cose da fare, cambiare note interne e data dell'intervento, chiudere una richiesta.

1. Scrivi cosa vuoi fare, per esempio «Assegna la MAN-2026-047 a Mirco e scrivi alla
   responsabile che passa giovedì».
2. L'assistente prepara una scheda per ogni operazione, con cosa cambia e chi riceve una
   mail.
3. Controlla la scheda e tocca «Conferma». Se sono più di una puoi toccare «Conferma
   tutte». Con «Annulla» la scarti.

Finché non tocchi «Conferma» non cambia niente e non parte nessuna mail. Dopo la conferma
la scheda diventa verde con «✓ Fatto» e il Pannello si aggiorna. Le mail sono le stesse
che partono dal Pannello.

Non fa: registrare i costi, aggiungere fornitori, cancellare le cose da fare. Per questi
usa il Pannello.

L'assistente può sbagliare: leggi sempre la scheda prima di confermare. Se una scheda
diventa rossa, sotto c'è il motivo; tocca «Riprova» o fallo dal Pannello.

## Come avviso il richiedente che ho visto la richiesta, senza assegnare un tecnico?

1. Nel [Pannello di controllo](/dashboard) tocca la richiesta (deve essere **Aperta**).
2. Nel riquadro «Prendi in carico» scrivi la nota per il richiedente, per esempio «Abbiamo
   visto la richiesta, ci vorranno alcuni mesi perché…».
3. Se è un lavoro di mesi, spunta «Lavoro di lungo corso» e, se vuoi, scrivi la
   previsione (per esempio «primavera 2027»).
4. Tocca «Prendi in carico e avvisa».

Compare «Presa in carico: il richiedente riceve la mail». La richiesta passa a **Presa in
carico**, la nota resta nei messaggi della richiesta e al richiedente arriva una mail.
Il tecnico lo assegni quando vuoi, come sempre.

## Cos'è la sezione «Lungo corso» e come ci metto una richiesta?

Serve a tenere da parte i lavori che richiedono mesi, così non affollano le richieste
attive. «Lungo corso» non è uno stato: una richiesta può essere di lungo corso e intanto
Presa in carico o In lavorazione.

- Se la richiesta è **Aperta**, spunta «Lavoro di lungo corso» mentre la prendi in carico
  (vedi sopra).
- Altrimenti apri la richiesta, nel riquadro «Lungo corso» spunta «Lavoro di lungo corso»,
  scrivi la previsione se vuoi e tocca «Salva».

Per toglierla dalla sezione togli la spunta e tocca «Salva». Spostarla non manda mail:
se vuoi avvisare il richiedente, scrivigli un messaggio.

## Come scrivo al richiedente?

1. Apri la richiesta nel [Pannello di controllo](/dashboard).
2. Nel riquadro «Messaggi» scrivi nel campo «Scrivi al richiedente…».
3. Tocca «Invia messaggio».

Al richiedente arriva una mail «Nuovo messaggio» con il tasto per aprire la richiesta. Le
sue risposte compaiono qui, e a te arriva una mail con il tasto «Rispondi nella
richiesta», che apre direttamente quella richiesta nel Pannello.

Nei messaggi restano anche la presa in carico, l'assegnazione del tecnico (con la nota)
e la chiusura, così la storia della richiesta sta tutta in un posto.

Le «Note responsabile» del riquadro «Chiudi richiesta» invece sono **interne**: il
richiedente non le vede.

## Come gestisco le cose da fare di una richiesta?

Quando una richiesta contiene più lavori, nel riquadro «Cose da fare»:

- scrivi un lavoro e tocca «Aggiungi» (anche il richiedente può aggiungerne);
- spunta la casella quando il lavoro è fatto (la vede anche il richiedente);
- tocca «Togli» per eliminare una riga.

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

## Come registro i costi di una manutenzione (fatture, ore, spese)?

I costi di una manutenzione si scrivono nella richiesta, nel riquadro «Costi», quando
arrivano: anche più fatture in mesi diversi, e anche dopo la chiusura. Li vedi solo tu;
il richiedente vede solo il totale, a richiesta chiusa.

1. Apri la richiesta nel [Pannello di controllo](/dashboard). Se è già chiusa, la trovi
   in fondo in «Completate negli ultimi 4 mesi».
2. Nel riquadro «Costi» scegli:
   - **«+ Collega fattura»**: compare l'elenco delle fatture di Cura Ambienti e di quelle
     ancora libere (puoi cercare per fornitore, numero o descrizione). Tocca la fattura,
     controlla «Quanto va su questa manutenzione (€)» — parte già da tutto quello che
     resta da distribuire — e tocca «Collega alla richiesta». Se una fattura serve a più manutenzioni,
     scrivi solo la parte di questa: il resto resta da collegare alle altre. Una fattura
     **libera**, collegandola, passa da sola su Cura Ambienti;
   - **«+ Ore»**: le ore fatte dal personale di Cura Ambienti, la data e chi (manutentore o
     addetto pulizie). L'importo lo calcola l'app con la tariffa interna di quel mese;
   - **«+ Spesa senza fattura»**: scontrini e acquisti con la carta che non arrivano come
     fattura elettronica. Scrivi cosa, importo, data e, se vuoi, dove.
3. In alto leggi il «Totale». Per togliere una riga tocca «Togli» e poi «Sì, togli»: una
   fattura tolta torna disponibile da collegare.

Delle fatture conta l'**imponibile** (IVA esclusa), come nel cruscotto del controllo di
gestione. Le fatture si collegano solo se stanno su Cura Ambienti (cc24) o sono ancora
libere: una fattura già presa da un altro servizio non compare.

⚠️ Se un acquisto arriva poi anche come fattura elettronica (succede con Amazon), non
registrarlo due volte: o la spesa o la fattura.

I costi finiscono nel cruscotto «Costi per struttura», alla voce Manutenzioni della
struttura della richiesta, nel mese della loro data.

Ogni mese Cura Ambienti **addebita** i costi della richiesta al centro di costo della
struttura: l'addebito nasce da solo e lo trovi negli Addebiti interni del Controllo di
Gestione, con una riga per ogni fattura, gruppo di ore e spesa. Fino al **10 del mese dopo**
puoi aggiungere o togliere costi e l'addebito si aggiorna; dopo, quel mese è chiuso: un costo
di quel mese non si toglie più, e un costo nuovo con una data vecchia va nel primo mese
ancora aperto. Se la struttura non ha un centro di costo (o è Cura Ambienti stessa) i costi
restano su Cura Ambienti e il riquadro lo dice.

## Come chiudo una richiesta quando l'intervento è fatto?

1. Nel [Pannello di controllo](/dashboard) tocca la richiesta.
2. Nel riquadro «Chiudi richiesta» metti, se vuoi, la «Data intervento» e le «Note
   responsabile» (interne, il richiedente non le vede).
3. Tocca «Chiudi richiesta» e poi «Sì, chiudi».

Compare «Chiusa — Totale costi: €…». La richiesta passa a **Completata**, arriva una mail
di chiusura agli amministratori (con il totale) e una al richiedente.

Non serve aver già messo i costi: le fatture che arrivano dopo le colleghi alla richiesta
chiusa (vedi sopra).

Una richiesta completata non si può più riaprire dall'app.

## Voglio solo salvare una nota, senza chiudere la richiesta

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

**«Non riesco a caricare la conversazione: …»**
I messaggi non si sono caricati. Il resto della richiesta funziona lo stesso: chiudi e
riapri la richiesta, o ricarica la pagina. Se il messaggio torna, avvisa l'ufficio
amministrazione.

**«Scrivi una nota per il richiedente»** (amministratori)
Per prendere in carico una richiesta serve la nota che arriva al richiedente.

**«Di questa fattura restano da distribuire … €»** /
**«Questa fattura è già stata distribuita tutta su altre manutenzioni»** (amministratori)
Hai scritto un importo più alto di quello che resta della fattura. Correggi l'importo, o
togli la fattura da un'altra manutenzione.

**«La fattura è già sul centro di costo …»** (amministratori)
Un altro servizio ha preso la fattura. Se era di Cura Ambienti, chiedi a chi gestisce le
fatture del servizio di spostarla.

**«tariffa mancante»** accanto a delle ore (amministratori)
Per quel mese non c'è la tariffa interna di Cura Ambienti: le ore restano fuori dal
totale finché non viene inserita.

**«⚠️ Compila centro di costo, categoria, importo e data.»** /
**«⚠️ L'importo deve essere un numero maggiore di zero.»** (amministratori)
Nell'inserimento di un costo manca un campo obbligatorio o l'importo è zero.

**«Il nome è obbligatorio»**, **«Email non valida»**, **«PEC non valida»** (amministratori)
Nell'anagrafica fornitori manca il nome o un indirizzo email è scritto male.

**«Accesso negato»**
L'operazione è riservata agli amministratori delle manutenzioni.
