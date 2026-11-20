---
area: Preventivi
descrizione: Fare i preventivi dei servizi agli enti (emetterli, segnare l'esito, rinnovarli) e calcolare il prezzo di un catering della Locanda.
pagine:
  - percorso: /preventivi
    titolo: Preventivi
    accesso: [coordinatore-cc, permesso:Amministrazione, admin]
    cosa: Punto di partenza, con i due tasti Preventivi Servizi e Preventivi Catering.
  - percorso: /preventivi/servizi
    titolo: Preventivi Servizi
    accesso: [coordinatore-cc, permesso:Amministrazione, admin]
    cosa: Elenco dei preventivi agli enti, con i filtri per stato e il tasto per farne uno nuovo.
  - percorso: /preventivi/nuovo
    titolo: Nuovo preventivo
    accesso: [coordinatore-cc, permesso:Amministrazione, admin]
    cosa: Il modulo vuoto per fare un preventivo nuovo.
  - percorso: /preventivi/[id]
    titolo: Preventivo
    accesso: [coordinatore-cc, permesso:Amministrazione, admin]
    cosa: Scheda di un singolo preventivo, si apre toccandolo nell'elenco dei Preventivi Servizi.
  - percorso: /preventivi/tariffario
    titolo: Tariffario preventivi
    accesso: [coordinatore-cc, permesso:Amministrazione, admin]
    cosa: I prezzi dei preventivi per servizio ed ente (la tabella di Andrea); l'Amministrazione li cambia e fa l'adeguamento ISTAT.
  - percorso: /preventivi/enti
    titolo: Enti dei preventivi
    accesso: [coordinatore-cc, permesso:Amministrazione, admin]
    cosa: Gli enti a cui si fanno i preventivi, col nome usato in fattura; si aggiungono e si correggono.
  - percorso: /preventivi/catering
    titolo: Preventivi Catering
    accesso: [coordinatore-cc, permesso:Amministrazione, admin]
    cosa: Calcolatore del prezzo di un catering della Locanda, totale e a persona.
---

# Preventivi

Qui si fanno due cose diverse:

- **Preventivi Servizi**: i preventivi che mandiamo agli enti (Comuni, ASL, consorzi, famiglie,
  scuole) per un intervento educativo, una comunità, Casa Artemisia. L'app dà il numero di
  protocollo, prepara il PDF e ricorda di segnare se l'ente ha accettato.
- **Preventivi Catering**: un calcolatore per sapere quanto chiedere per un catering della Locanda.
  Non si salva niente.

## Chi può entrare nei Preventivi?

- I **coordinatori** e i **responsabili d'area** dei centri di costo. Vedono e fanno solo i
  preventivi dei **loro** servizi. Non serve chiedere un permesso.
- Chi ha il permesso **Amministrazione** (e gli amministratori). Vede tutti i preventivi,
  cambia il tariffario, fa l'adeguamento ISTAT e può cambiare il prezzo di una voce nel preventivo.

Se non sei in nessuno dei due gruppi, la scheda «Preventivi» non compare in Home e la pagina ti
riporta alla Home. Se pensi di dover essere coordinatore di un servizio, chiedi all'ufficio
amministrazione: i coordinatori si assegnano in Amministrazione → Centri di costo.

## Come apro i Preventivi?

1. Apri la Home.
2. Tocca la scheda «Preventivi» («Preventivi agli enti e preventivi catering»).
3. Alla domanda «Che preventivo devi fare?» tocca «Preventivi Servizi» oppure «Preventivi Catering».

Oppure vai qui: [Preventivi](/preventivi).

---

## Come faccio un preventivo nuovo per un ente?

1. Vai in [Preventivi Servizi](/preventivi/servizi).
2. Tocca «+ Nuovo preventivo».
3. Compila **«Che preventivo è»**:
   - «Centro di costo»: vedi solo quelli che coordini. Se ne coordini uno solo, è già scelto.
   - «Servizio»: per esempio «Comunità educativa Giulia – inserimento residenziale», «Casa Artemisia»,
     «Progetto individuale (Ambientale)», «Privati – intervento educativo». Il servizio decide quali
     voci e quali prezzi puoi usare.
   - «Ente» (non c'è per i privati): per **Torino** scegli una delle due coppie,
     «Comune di Torino + ASL Città di Torino 1» oppure «… + ASL Città di Torino 2». Il preventivo
     va a tutti e due e porta le due quote (Comune e ASL) con il totale. Per qualunque altro ente
     sceglilo dall'elenco «Altri enti»: per loro le tariffe sono le stesse. Se l'ente non c'è,
     tocca «L'ente non c'è? Aggiungilo».
   - «Tipo (sottotipo)»: c'è solo per alcuni servizi (per esempio «Retta standard» o
     «Retta omnicomprensiva» per la Giulia, «PIPPI» o «PPM» per i progetti individuali).
     La «Retta standard» della Giulia c'è solo con le coppie di Torino.
   - «Cartella in cui archiviarlo»: dove finirà il PDF se il preventivo viene accettato.
     La propone l'app dal servizio.
4. Compila **«A chi lo mandi»**: sotto l'ente tocca «+ Aggiungi una persona» per ogni persona
   (assistente sociale, NPI, referente). Se l'hai già usata in un altro preventivo, scrivendo il
   nome si compilano da soli ruolo ed email. Puoi metterne più di una.
5. Compila **«Per chi e per cosa»**:
   - «Costo dell'intervento a favore di» (obbligatorio): il nome del ragazzo o della persona.
     Compare nel documento; nei nomi dei file l'app mette solo le iniziali.
   - «Oggetto» e «Tipo di progetto / intervento».
   - «Ripartizione Comune/Consorzio / ASL»: la dice l'ente. Se non la sai, chiedila prima di emettere:
     è il motivo più frequente per cui un preventivo torna indietro.
   - «Inizio» e «Durata in mesi» (i tasti «3 mesi», «6 mesi», «12 mesi»). La fine la calcola
     l'app. Se non sai ancora quando inizia, spunta «Non si sa ancora quando inizia»: nel PDF
     esce «DA DEFINIRE» e i conti si fanno sulla durata.
6. Aggiungi le **voci** (vedi la domanda qui sotto).
7. Se serve, scrivi le «Note in fondo al documento».
8. Tocca «Salva la bozza».

Una bozza si salva anche se è incompleta. Puoi tornarci quando vuoi.

Quando scegli servizio ed ente, le **rette** si mettono da sole: con le coppie di Torino le due
quote (Comune e ASL), altrimenti la retta unica (per esempio 170 € la Giulia omnicomprensiva,
240 € la CRP per gli enti fuori Torino). Le rette partono da 31 giorni al mese. Se cambi ente,
le voci già scritte passano ai prezzi del nuovo ente; quelle che non valgono più si tolgono e
in alto leggi quali.

## Come aggiungo le voci e le quantità?

1. Nella parte «Voci» tocca «+ Aggiungi voce».
2. Si apre «Aggiungi una voce»: ci sono solo le voci di quel servizio, con i prezzi di
   quell'ente, divise per sezione, con il prezzo, l'unità (ora, giorno, km, mese, incontro,
   forfait) e l'IVA. Tocca quella che ti serve.
3. Scrivi la quantità. Per ore e giorni puoi scegliere:
   - «Scrivo quante a settimana»: scrivi le ore a settimana, l'app calcola il mese (× 4,35);
   - «Scrivo il totale del mese»: scrivi direttamente il totale del mese.
4. Per il rimborso chilometrico scrivi «Accompagnamenti al mese», «Km per accompagnamento»
   e il «Percorso da/a».
5. Per togliere una voce tocca «Togli».

Sotto ogni voce vedi il conto (quantità × prezzo). Più in basso, nei «Totali», vedi il
«Costo totale mensile (IVA compresa)», il «Totale a pagare senza IVA» e il totale sul periodo.
Nel PDF il totale sul periodo è una nota piccola in basso a sinistra.

Rimborso km, pedaggi, budget e quota ospitalità sono **esclusi da IVA** (spese F.I.C.):
nei totali stanno a parte.

## Posso cambiare il prezzo di una voce?

- Se la voce ha un prezzo nel tariffario, è **fisso**: non si cambia.
- Se il tariffario non ha ancora un prezzo («da definire», per esempio psicoterapia o
  mediatore culturale), lo **scrivi tu** nel preventivo. Sotto il campo leggi «Il tariffario non
  ha ancora un prezzo: scrivilo tu».
- Chi ha il permesso Amministrazione può cambiare anche i prezzi fissi.

Se qualcosa non va, accanto alla voce compare un'etichetta rossa, per esempio «il prezzo è fisso
a …», «Scrivi il prezzo» o «Non vale per questo servizio o ente: toglila». Nessuno può usare una
voce che non è nel tariffario.

## Come faccio un preventivo a un privato (una famiglia)?

1. In «Servizio» scegli «Privati – intervento educativo» oppure «Privati – intervento OSS».
   L'ente non c'è.
2. In «A chi lo mandi» aggiungi la famiglia («+ Aggiungi una persona»).
3. Aggiungi la voce «Costo orario» e scrivi le ore a settimana. Se serve, aggiungi anche il
   «Budget mensile socializzazione» (se lo lasci a zero, nel documento esce «da concordare con
   la famiglia»).
4. Nella parte «Preventivo ai privati»:
   - spunta «Aggiungi il lavoro indiretto» se servono le 0,5 h a settimana di lavoro indiretto;
   - spunta «Maggiorazione del 5%» se va aumentato il costo del 5% (prima dell'IVA);
   - i referenti nella lettera sono **chi fa il preventivo** e, se vuoi, un **secondo referente**
     (nome, ruolo, email).
5. Emetti come gli altri.

Il PDF dei privati è una **lettera** come quella che si usava prima: costo orario con l'IVA,
ore a settimana, budget, l'addebito di 1 h se l'intervento non viene disdetto entro 24 h,
la frase «La fatturazione avverrà mensilmente e solo per le ore effettivamente svolte», i
referenti e la firma della Presidente.

## Come mando il preventivo all'ente?

1. Controlla tutto. Se vuoi vedere il documento prima, tocca «Anteprima PDF»: esce con la
   scritta di bozza al posto del numero.
2. Tocca «Emetti e scarica il PDF».
3. L'app salva, dà il **numero di protocollo** (per esempio `PR-012/2026`) e apre il PDF in
   un'altra scheda.
4. **Manda tu il PDF all'ente**, per mail. L'app non lo spedisce all'ente.

Il preventivo passa allo stato «Inviato, in attesa».
Il numero nasce solo quando emetti: le bozze non hanno numero.

Se manca qualcosa, leggi «Per emettere manca: …» (per esempio l'ente, a favore di chi,
la durata, almeno una voce, le quantità, il prezzo di una voce «da definire»).
La data di inizio invece può restare da definire.

## L'ente ha risposto: come segno se l'ha accettato?

1. Apri il preventivo dall'elenco (scheda «In attesa»).
2. Tocca «È stato accettato» oppure «È stato rifiutato».
3. Scegli la data («Accettato il» / «Rifiutato il») e, se vuoi, scrivi una «Nota»
   (per esempio «conferma via mail dell'assistente sociale», un numero di autorizzazione,
   o perché è stato rifiutato).
4. Tocca «Conferma».

**Se l'ha accettato**:
- l'app archivia il PDF definitivo nella cartella dei preventivi accettati;
- **l'ufficio amministrazione riceve una mail** con il PDF, così sa cosa fatturare;
- nella scheda compare «Apri il PDF archiviato in «Preventivi accettati»».

**Se l'ha rifiutato**, il preventivo resta nell'elenco dei rifiutati.

**Attenzione:** se l'ente ha accettato ma ha cambiato qualcosa (meno ore, altre prestazioni),
non confermare. Chiudi la finestra, tocca «Riapri per correggere», correggi e riemetti.
L'ufficio amministrazione deve ricevere quello che l'ente ha davvero riconosciuto.

## L'ente vuole delle modifiche: come correggo un preventivo già inviato?

1. Apri il preventivo.
2. Tocca «Riapri per correggere». Il preventivo torna «Bozza».
3. Correggi.
4. Tocca di nuovo «Emetti e scarica il PDF».

Il numero di protocollo resta lo stesso; sale la **revisione** (nell'elenco leggi «rev. 2»).
Si può riaprire solo un preventivo inviato e ancora senza esito.

## Come rinnovo un preventivo per il periodo dopo?

1. Apri il preventivo accettato (o ancora in attesa).
2. Tocca «Rinnova».
3. L'app crea una **bozza nuova** uguale, con il periodo subito dopo quello vecchio e la stessa
   durata, e con i prezzi del tariffario in vigore. L'oggetto comincia con «Rinnovo».
   Se l'inizio del vecchio era da definire, anche nel rinnovo resta da definire.
4. Se qualche prezzo è cambiato, in alto leggi quanti prezzi sono stati portati al tariffario in vigore.
5. Controlla e tocca «Emetti e scarica il PDF».

Una voce che non è più nel tariffario non viene copiata.

## Qual è la differenza tra «Rinnova» e «Duplica»?

- «Rinnova»: bozza nuova per il **periodo successivo**, prezzi aggiornati.
- «Duplica»: bozza nuova con **lo stesso periodo**, utile come base per un preventivo simile
  (per esempio un altro ragazzo con lo stesso progetto). Si può duplicare un preventivo in
  qualsiasi stato.

## Ho fatto una bozza per sbaglio: come la tolgo?

- «Elimina la bozza»: c'è solo se la bozza non ha mai avuto un numero. La bozza sparisce.
- «Annulla la bozza»: il preventivo passa allo stato «Annullato» e resta nell'elenco degli annullati.

Un preventivo già inviato non si annulla: si segna «È stato rifiutato», oppure si riapre e si corregge.

## Cosa vuol dire l'avviso «Il tariffario per questo periodo è cambiato»?

Da quando hai fatto la bozza è cambiato il prezzo di qualche voce (per esempio dopo l'adeguamento ISTAT).
L'avviso dice quali voci e come cambiano.
Tocca «Aggiorna i prezzi» per usare i prezzi nuovi, poi «Salva la bozza».

## Come trovo un preventivo?

In [Preventivi Servizi](/preventivi/servizi):

- In alto vedi i numeri: «Bozze», «In attesa», «In attesa da più di 3 giorni»,
  «Accettati quest'anno».
- Tocca un filtro: «Aperti» (bozze e in attesa), «Bozze», «In attesa», «Accettati»,
  «Rifiutati», «Annullati».
- Nella casella di ricerca scrivi protocollo, nome del ragazzo, ente o servizio.

I preventivi in attesa da più di 3 giorni hanno il bordo arancione.

## Perché mi arrivano mail di promemoria?

Se hai emesso un preventivo e dopo 3 giorni non hai ancora segnato l'esito, ti arriva una mail
di promemoria. Si ripete ogni 3 giorni finché non segni «È stato accettato» o «È stato rifiutato».

## Dove scarico il PDF di un preventivo?

Apri il preventivo e tocca «Scarica il PDF» (o «Anteprima PDF» se è una bozza).
Il PDF si apre in un'altra scheda.

---

## Dove vedo i prezzi delle voci?

1. In [Preventivi Servizi](/preventivi/servizi) tocca «Tariffario»
   (per l'Amministrazione si chiama «Tariffario e ISTAT»).
2. Vedi le voci divise per servizio. Ogni voce dice il sottotipo (se c'è), l'ente a cui vale
   (nessuna etichetta = tutti gli enti; «Tutti gli altri enti» = ogni ente che non ha una riga
   sua), il prezzo o «da definire», l'unità, l'IVA e da quando vale.
3. Puoi scegliere un solo «Servizio» o cercare una voce o un ente in «Cerca».
4. Spunta «Mostra anche i prezzi non più in vigore» per vedere i prezzi vecchi.

I coordinatori possono solo guardare. I prezzi li cambia solo chi ha il permesso Amministrazione.

## Come cambio un prezzo del tariffario? (solo Amministrazione)

1. Apri il [Tariffario](/preventivi/tariffario).
2. Accanto alla voce tocca «Nuovo prezzo».
3. Scegli «Da quando vale» e scrivi il «Prezzo». Lascialo vuoto se il prezzo è da definire.
4. Tocca «Applica il nuovo prezzo».

Il prezzo di prima si chiude il giorno prima e resta sui preventivi già fatti: **il passato non cambia**.

Altri tasti sulla voce:
- «Modifica»: corregge servizio, sottotipo, nome, ente pagante, sezione e note.
  Il prezzo non si cambia da qui.
- «Chiudi»: scegli l'«Ultimo giorno di validità». I preventivi già fatti la tengono; nei nuovi
  non si potrà più scegliere.
- «+ Nuova voce», in alto: aggiunge una voce al tariffario (servizio, nome, ente pagante, unità,
  IVA, prezzo o vuoto se da definire).

## Dove vedo e aggiungo gli enti?

1. In [Preventivi Servizi](/preventivi/servizi) tocca «Enti».
2. Vedi gli enti con il nome che compare in fattura e i servizi per cui sono stati fatturati.
3. «+ Nuovo ente» aggiunge un ente; «Modifica» corregge nome, servizi e note.
4. Chi ha il permesso Amministrazione può anche «Nascondi» un ente che non si usa più.

Se correggi il nome di un ente, l'app corregge anche le sue tariffe nel tariffario.
Comune di Torino, ASL Città di Torino 1 e 2 e «Privato» non si nascondono: servono alle coppie
di Torino e ai privati.

## Come faccio l'adeguamento ISTAT? (solo Amministrazione)

Si fa una volta l'anno, quando gli enti comunicano l'adeguamento.

1. Apri il [Tariffario](/preventivi/tariffario) e tocca «Adeguamento ISTAT».
2. Scrivi la «Percentuale (%)» e «Da quando vale».
3. Tocca «Vedi l'anteprima»: vedi voce per voce il prezzo prima e dopo.
4. Scegli le voci: «Tutte», «Nessuna», «Solo le rette», oppure spunta a mano.
5. Tocca «Applica a … voci».

Restano fuori rimborso km, spese escluse da IVA e voci senza prezzo. I preventivi già fatti non cambiano.
Da quella data i rinnovi escono già con i prezzi nuovi.

---

## Come calcolo il prezzo di un catering?

1. Vai in [Preventivi Catering](/preventivi/catering).
2. Nella parte «L'evento» scrivi:
   - «Quanti ospiti?»
   - «Costo del SOLO CIBO a persona (€)»
   - «Costo del BERE a persona (€)» (vuoto se il bere non è compreso)
   - «Km dalla Locanda (SOLO ANDATA)»: il ritorno lo conta l'app
   - «Quante persone di servizio?» e «Per quante ore?» (dalla partenza al rientro)
3. Se ci sono altre spese (per esempio il noleggio di un gazebo), tocca «+ Aggiungi un costo extra»
   e scrivi «Cosa» e «Costo (€)».
4. In fondo leggi il «Prezzo al cliente con IVA» e il «Prezzo a persona», con tutto il conto voce per voce.

**Scrivi i COSTI, non i prezzi di vendita.** Il ricarico e l'IVA li aggiunge l'app:
il totale in fondo è già il prezzo da proporre al cliente.

## Come mando il conto del catering al cliente?

Tocca «Copia riepilogo»: il conto viene copiato e puoi incollarlo in una mail o in un messaggio.

Il preventivo catering **non si salva** nell'app e non ha un numero di protocollo.
Se chiudi la pagina, i numeri scritti si perdono.

## Dove cambio il costo al km, il costo orario o il ricarico?

Tocca «⚙️ Parametri». Ci sono costo al km, costo orario del personale, costo del coperto,
ricarico e IVA.

- Tutti li possono vedere.
- Solo chi ha il permesso Amministrazione li può cambiare: scrive i valori e tocca «Salva».
  Valgono subito per tutti.

## Problemi comuni

**«Per emettere manca: …»**
Completa quello che è scritto (ente, a favore di chi, durata, almeno una voce, le quantità,
il prezzo delle voci da definire) e tocca di nuovo «Emetti e scarica il PDF».

**«… il prezzo è fisso a …»**
Il prezzo di quella voce è deciso nel tariffario. Se pensi che sia sbagliato, chiedi all'ufficio
amministrazione.

**«… non vale per questo servizio e questo ente: toglila» / «Non vale per questo servizio o ente»**
Hai cambiato servizio o ente e quella voce non c'è più (per esempio le quote Comune/ASL con un
ente fuori Torino). Toglila e, se serve, aggiungi quella giusta.

**«Scrivi quanti mesi dura (da 1 a 60)»**
Scrivi la «Durata in mesi», oppure tocca «3 mesi», «6 mesi» o «12 mesi».

**«… non è (più) nel tariffario» / «Voce non più nel tariffario per questo periodo»**
La voce non vale per le date del preventivo. Togli la voce e aggiungine una valida, oppure
controlla la data di inizio.

**«Si modifica solo una bozza: riaprilo prima»**
Il preventivo è già stato inviato. Tocca «Riapri per correggere».

**«Una delle email non è valida»**
Ricontrolla l'email delle persone a cui mandi il preventivo.

**Non trovo l'ente nell'elenco.**
Tocca «L'ente non c'è? Aggiungilo» sotto il campo «Ente». Per Torino non si sceglie il Comune
da solo: scegli la coppia Comune + ASL.

**«Puoi fare preventivi solo per i tuoi servizi» / «Non è un preventivo dei tuoi servizi»**
Non sei coordinatore di quel servizio. Chiedi all'ufficio amministrazione.

**Il PDF non si apre.**
Il telefono o il browser può bloccare la scheda nuova. Permetti le finestre per l'app e riprova.

**Non vedo la scheda «Preventivi Servizi», solo il Catering.**
La parte dei preventivi agli enti non è ancora pronta. Avvisa l'ufficio amministrazione.

**«Accesso negato»**
Non sei coordinatore di nessun servizio e non hai il permesso Amministrazione.
