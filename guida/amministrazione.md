---
area: Amministrazione
descrizione: Strumenti riservati all'amministrazione - permessi di accesso, coordinatori dei centri di costo, archivio software e password, utenze, costi fissi e costi per struttura.
pagine:
  - percorso: /amministrazione
    titolo: Amministrazione
    accesso: [permesso:Amministrazione]
    cosa: Punto di partenza dell'area, con una scheda per ogni strumento.
  - percorso: /amministrazione/permessi
    titolo: Permessi Accessi
    accesso: [permesso:Amministrazione]
    cosa: Dare e togliere i permessi delle aree dell'app, per persona o per area.
  - percorso: /amministrazione/centri-costo
    titolo: Coordinatori e Responsabili Centri di Costo
    accesso: [permesso:Amministrazione]
    cosa: Scegliere il responsabile di ogni area e i coordinatori di ogni centro di costo.
  - percorso: /amministrazione/software
    titolo: Gestione Software
    accesso: [permesso:Amministrazione]
    cosa: Archivio di software e abbonamenti, con credenziali, costo, scadenza e fattura.
  - percorso: /amministrazione/password
    titolo: Gestione Password
    accesso: [permesso:Amministrazione]
    cosa: Archivio delle credenziali dei portali usati da più persone (banca, enti, fornitori, utenze).
  - percorso: /amministrazione/utenze
    titolo: Utenze
    accesso: [permesso:Amministrazione]
    cosa: Contatori di luce, gas e acqua collegati alla loro struttura, con le bollette arrivate.
  - percorso: /amministrazione/costi-fissi
    titolo: Costi fissi
    accesso: [permesso:Amministrazione]
    cosa: Affitti, assicurazioni, IMU, TARI, telefonia e altri costi a scadenza fissa delle strutture.
  - percorso: /amministrazione/costi-strutture
    titolo: Costi per struttura
    accesso: [permesso:Amministrazione, admin, coordinatore-cc]
    cosa: Quanto costa ogni struttura nell'anno, diviso per tipo di spesa; i coordinatori vedono solo le loro strutture.
---

# Amministrazione

L'area Amministrazione raccoglie gli **strumenti riservati**: chi può entrare dove, chi
coordina i servizi, gli archivi di software e password, e i costi delle strutture.

## Non vedo la scheda «Amministrazione» nella Home, perché?

La scheda «Amministrazione» compare, nella parte «Aree Riservate» della Home, solo a chi
ha il permesso **Amministrazione**. Se provi ad aprire una pagina dell'area senza il
permesso, l'app ti riporta alla Home.

Unica eccezione: la pagina [Costi per struttura](/amministrazione/costi-strutture) si apre
anche agli amministratori delle manutenzioni e ai coordinatori dei centri di costo (vedi
più sotto).

## Cosa trovo nella pagina Amministrazione?

Apri [Amministrazione](/amministrazione) dalla Home. Trovi queste schede:

- «Permessi Accessi» – chi può entrare nelle aree dell'app;
- «Coordinatori e Responsabili Centri di Costo» – chi coordina i servizi e chi risponde delle aree;
- «Gestione Software» – servizi, credenziali, scadenze e fatture degli abbonamenti;
- «Gestione Password» – credenziali dei portali;
- «Costi per struttura» – il cruscotto dei costi di ogni struttura;
- «Utenze» – contatori di luce, gas e acqua;
- «Costi fissi» – affitto, assicurazione, IMU, TARI, telefonia.


## Come do un permesso a una persona?

1. Apri [Permessi Accessi](/amministrazione/permessi).
2. Resta sulla vista «Per persona».
3. Se la persona è già nell'elenco, premi sul suo nome. Se non c'è, scrivi il nome o
   l'email nella casella «Aggiungi una persona» e sceglila dall'elenco che compare.
4. A destra (sul telefono: sotto) vedi tutte le aree. Premi sull'area da concedere.
5. Il cerchio diventa ✓ e la scritta passa da «Spento» ad «Attivo».

Non c'è un bottone «Salva»: **ogni modifica è salvata subito**. La persona vede la novità
la prossima volta che apre o ricarica una pagina dell'app.

Se la persona non è nella rubrica aziendale, scrivi la sua email aziendale per intero:
l'app la aggiunge lo stesso (con la nota «fuori rubrica»).

## Come tolgo un permesso?

Dalla persona:

1. Apri [Permessi Accessi](/amministrazione/permessi) e premi sul nome della persona.
2. Premi sull'area con la scritta «Attivo».
3. La scritta torna «Spento».

Dall'area:

1. Premi «Per area».
2. Trova l'area e premi la **×** accanto al nome della persona.

Una persona rimasta senza aree resta in elenco finché la pagina è aperta, così se hai
tolto un permesso per sbaglio la ritrovi dov'era.

## Come vedo chi entra in un'area?

1. Apri [Permessi Accessi](/amministrazione/permessi).
2. Premi «Per area».

Per ogni area vedi la sua descrizione, quante persone ci entrano e i loro nomi. Premendo
un nome passi alla vista «Per persona» su quella persona.

Nella vista «Per persona», il numero accanto a ogni nome è quante aree ha.

## Cosa apre ogni permesso?

| Permesso | Cosa apre |
|---|---|
| Amministrazione | Pannello Amministrazione: assegnazione dei permessi, gestione software e abbonamenti. (Apre tutte le schede di questa pagina.) |
| Prestazioni Occasionali | Ritenute d'acconto: nuove prestazioni, prestazioni attive, notule e documenti. |
| Timbrature HR | Cruscotto presenze di tutto il personale, validazione mensile dei fogli ore. |
| Acquisti | Gestione delle richieste d'acquisto: approvazione, ordini e consegne. Apre anche l'Inventario beni, per registrare quello che si è comprato. |
| Beni e IT | Inventario beni, dispositivi e SIM: anagrafica, assegnazione e restituzione, verbali di consegna. Chi non ha questo permesso vede comunque i propri strumenti in "I miei strumenti". |
| Manutenzioni | Richieste manutenzione: apertura di una nuova richiesta e stato delle proprie. Pensato per i responsabili di struttura. Non apre il pannello di controllo né i costi, che restano ai tre amministratori. |
| Controllo di Gestione | Cruscotti dei costi e dei ricavi di tutti i centri di costo. Da solo NON apre i Flussi fatture: le scadenze restano invisibili. |
| Pagamenti | Flussi fatture: caricamento dello scadenzario e coda delle fatture da pagare, con il tasto "Pagata". Le fatture sopra soglia si vedono ma non si approvano. |
| Approvazione Pagamenti | Approvazione delle fatture sopra soglia, prima che l'amministrazione le paghi. Il resto dei Flussi fatture si vede in sola lettura. |

La stessa descrizione la leggi sotto il nome di ogni area, nella pagina Permessi.

## Come do accesso a Risorse Umane?

**Non dal pannello Permessi.** Nell'elenco non c'è un permesso «Risorse Umane».

- Le **anagrafiche del personale** (Dipendenti, Tirocini) si aprono a chi fa parte del
  gruppo Risorse Umane dell'account aziendale. L'inserimento nel gruppo si fa fuori
  dall'app, da chi gestisce gli account della cooperativa.
- Il **Cruscotto Timbrature** si apre con il permesso «Timbrature HR», che invece si dà da qui.

Vedi la guida **Risorse Umane**.

## Come faccio diventare qualcuno amministratore delle manutenzioni?

Dall'app non si può. Gli amministratori delle manutenzioni sono tre persone fisse,
decise da chi gestisce l'app. Il permesso «Manutenzioni» del pannello serve solo a fare
richieste e a vedere le proprie.

## Come do a un coordinatore l'accesso al suo conto e ai costi del suo servizio?

Non serve un permesso: basta nominarlo coordinatore del suo centro di costo (vedi la
sezione qui sotto). Da quel momento vede il conto, le fatture e i costi del suo servizio.


## Dove cambio il coordinatore di un servizio o il responsabile di un'area?

Nella pagina
[Coordinatori e Responsabili Centri di Costo](/amministrazione/centri-costo).

Chi è nominato qui **vede il conto Qonto, le fatture e i costi del suo servizio**; il
responsabile d'area li vede per **tutta l'area**. Chi viene tolto smette di vederli.
Non c'è un permesso da dare a parte.

## Come aggiungo un coordinatore a un servizio?

1. Apri [Coordinatori e Responsabili Centri di Costo](/amministrazione/centri-costo).
2. Resta sulla vista «Per area».
3. Trova l'area (riquadro scuro) e, sotto, il servizio (riquadro verde con il codice,
   es. «cc24»).
4. Nella parte «Coordinamento» premi «+ Aggiungi».
5. Scrivi il nome o l'email e scegli la persona dall'elenco.

Si salva subito. In cima compare «Coordinamento di … aggiornato.»

Un servizio può avere più coordinatori.

## Come tolgo un coordinatore?

1. Trova il servizio nella vista «Per area».
2. Premi la **×** accanto al nome.
3. Alla domanda «Togli …?» premi «Sì» (oppure «No» per lasciarlo).

## Come cambio il responsabile di un'area?

1. Trova l'area nella vista «Per area».
2. Nella parte «Responsabile d'area» (riquadro azzurro):
   - per aggiungere, premi «+ Aggiungi» e scegli la persona;
   - per togliere, premi la **×** accanto al nome e poi «Sì».

Si salva subito. In cima compare «Responsabile d'area di … aggiornato.»

Il responsabile d'area vale per **tutti i servizi dell'area**. Se leggi «I servizi di
quest'area hanno responsabili diversi…», salvando li rendi uguali per tutta l'area.

## Come vedo quali ruoli ha una persona?

1. Premi «Per persona».
2. Per ogni persona vedi di quali aree è «Responsabile d'area» e quali servizi «Coordina».

Questa vista serve solo a controllare: le modifiche si fanno da «Per area».

## Cosa sono i numeri in cima alla pagina?

- «Aree senza responsabile» – aree che non hanno ancora un responsabile;
- «Servizi senza coordinatore» – centri di costo senza nessun coordinatore;
- «Persone con un ruolo» – quante persone sono responsabili o coordinatori.

I servizi chiusi sono nascosti: per vederli spunta «Mostra i centri spenti» (hanno
l'etichetta «spento»).


## Come registro un nuovo software o abbonamento?

1. Apri [Gestione Software](/amministrazione/software).
2. Premi «+ Aggiungi software».
3. Compila almeno «Nome servizio *» e «Centro di costo *» (obbligatori).
4. Se vuoi, aggiungi: «Categoria», «Stato», «Account / email», «Password», «Link al
   portale», «Chi lo usa», «Carta di pagamento», «Costo (€)», «Periodicità», «Scadenza»,
   «Rinnovo automatico», «Note».
5. Premi «Salva».

Per uscire senza salvare premi «Annulla».

## Come faccio a ricordarmi quando scade un abbonamento?

1. Nella scheda del software compila «Scadenza».
2. In «Calendari Outlook (email, separate da virgola)» scrivi le caselle dove deve
   comparire la scadenza. Di partenza c'è già quella dell'ufficio rendicontazione.
3. Salva.

L'app scrive l'evento direttamente in quei calendari, senza invito, con un promemoria
20 giorni prima. Sotto il software leggi «📅 In calendario: …» con le caselle.

Nell'elenco i software sono ordinati per scadenza, i più vicini in alto, con
un'etichetta colorata:

- rossa: «Scaduto il …» o «Scade tra … gg» (entro 20 giorni);
- arancione: scade entro 60 giorni;
- grigia: «Scade il …».

## Come vedo o copio la password di un software?

Nella scheda del software, accanto a «Password», premi «mostra» per leggerla (e
«nascondi» per coprirla) oppure «copia» per copiarla senza mostrarla.

## Come allego la fattura di un abbonamento?

1. Trova il software nell'elenco.
2. In fondo alla scheda premi «Carica fattura» (o «Sostituisci fattura» se ce n'è già una).
3. Scegli il file (massimo 50 MB).

Durante l'invio leggi «Caricamento… %». Poi la fattura compare come collegamento:
premila per aprirla.

## Come modifico o elimino un software?

- «Modifica» apre la scheda: cambi i campi e premi «Salva modifiche».
- «Elimina» lo cancella dopo la conferma. Non si può annullare.

Se un software vecchio mostra «Centro costo: da assegnare», aprilo con «Modifica» e
scegli il centro di costo.


## Dove trovo la password di un portale (banca, INPS, fornitore…)?

1. Apri [Gestione Password](/amministrazione/password).
2. Scrivi nella casella «Cerca» il nome, l'utente o il sito.
   Oppure premi una delle categorie colorate (es. «Banche e pagamenti», «Enti e portali PA»).
   Ripremendo la categoria accesa togli il filtro; «Tutte» mostra tutto.
3. Nella scheda trovi «Utente», «Password», «PIN» e il numero per la «Verifica 2 fattori».

La ricerca non cerca mai dentro le password.

## Come mostro o copio una password?

- Premi «mostra» per leggerla. Dopo **mezzo minuto si richiude da sola**.
- Premi «copia» per copiarla senza mostrarla: la scritta diventa «copiato ✓».

Il numero della verifica in due passaggi si può premere per chiamarlo dal telefono.
«Apri il sito ↗» apre il portale.

## Come aggiungo una nuova credenziale?

1. Premi «+ Nuova voce».
2. Compila «A cosa serve» (obbligatorio), ad esempio «INPS — Cassetto previdenziale».
3. Se vuoi, aggiungi «Categoria», «Nome utente», «Password», «PIN», «Link al sito»,
   «Telefono per il secondo fattore», «Note».
4. Premi «Salva».

Le date di inserimento e di ultimo cambio password le tiene l'app: non si scrivono a mano.

## Ho cambiato una password, come la aggiorno?

1. Trova la voce e premi «Modifica».
2. Scrivi la nuova password e premi «Salva».

La data «password cambiata il …» si aggiorna **solo se cambi davvero la password**.
Se correggi solo le note o il link, resta quella di prima.

## Cosa vuol dire «Da cambiare»?

Una voce ha l'etichetta «Da cambiare · … mesi» quando la password non viene cambiata da
più di un anno. In cima alla pagina il riquadro «Password ferme da oltre 12 mesi» dice
quante sono. È solo un promemoria: cambiala sul portale e poi aggiornala qui.

## Come elimino una credenziale?

Premi «Elimina» sulla voce e conferma. Non si può annullare.


## Come collego un contatore (POD, PDR, acqua) alla sua struttura?

1. Apri [Utenze](/amministrazione/utenze).
2. Premi «+ Nuova utenza» (oppure apri una struttura e premi «+ Aggiungi un'utenza a …»).
3. Compila:
   - «Codice» – POD, PDR o numero utenza dell'acqua, come sta in bolletta;
   - «Tipo» – «Luce (POD)», «Gas (PDR)» o «Acqua (codice utenza SMAT)»;
   - «Struttura»;
   - «Percentuale sulla struttura» – 100 se il contatore serve solo quella struttura.
4. Se vuoi, aggiungi «Fornitore» e «Note».
5. Premi «Salva».

Da quel momento le bollette con quel codice vanno da sole sulla struttura giusta.

## Un contatore serve due strutture, come lo divido?

Fai una riga per ogni struttura con lo stesso codice, ognuna con la sua percentuale.
Il totale deve fare 100. Se non fa 100, sulla riga compare in rosso «il codice somma al …%».

## Cosa sono i «Da collegare»?

Sono codici arrivati nelle bollette che l'elenco non conosce ancora: finché non hanno
una struttura, la loro spesa non va da nessuna parte.

1. Nella sezione «Da collegare» premi «Collega» accanto al codice.
2. Scegli:
   - «Completa una riga esistente» – se in elenco c'è già una riga provvisoria per quel
     contatore («codice da completare»): la riga prende il codice vero;
   - «Nuova utenza» – scegli «Struttura» e «Percentuale».
3. Premi «Collega».

Le bollette già arrivate con quel codice vengono sistemate subito.

## Come cambio la struttura di un contatore?

1. Apri la struttura nell'elenco e premi sul contatore.
2. Cambia «Struttura» o «Percentuale sulla struttura».
3. Se vuoi spostare anche le bollette già registrate, spunta «Applica anche alle bollette
   già registrate». Senza spunta la modifica vale dalle prossime bollette.
4. Premi «Salva».

## Come tolgo un contatore dall'elenco?

1. Apri il contatore e premi «Elimina questa utenza».
2. Conferma con «Sì, elimina» (oppure «No, tienila»).

Le bollette già arrivate restano sulla loro struttura. Se ne arrivano altre con quel
codice, finiscono in «Da collegare».

## Cosa fa «Rileggi le fatture già importate»?

Rilegge le fatture arrivate prima che esistesse l'area Utenze e ne tira fuori le
bollette. Può metterci fino a 4 minuti. Se il messaggio dice «Ne restano …: premi di
nuovo», premilo ancora: riparte da dove era rimasto e non duplica niente.

## Cosa vuol dire l'avviso «… fatture hanno un centro di costo diverso da quello della sua utenza»?

Non sono doppioni, ma il Cruscotto del Controllo di Gestione e Costi per struttura le
mettono in posti diversi. Si sistemano da Controllo di Gestione → Fatture del servizio.


## Come inserisco un affitto, un'assicurazione o la TARI di una struttura?

1. Apri [Costi fissi](/amministrazione/costi-fissi).
2. Premi «+ Nuovo costo fisso».
3. Compila «Descrizione», «Struttura», «Categoria», «Importo per scadenza (€)» e
   «Frequenza» (da «Mensile» ad «Annuale»).
4. Se vuoi, aggiungi «Fornitore o controparte», «Note» e «Valido dal» (il mese da cui il
   costo conta; vuoto = da sempre).
5. Premi «Salva».

Nel cruscotto [Costi per struttura](/amministrazione/costi-strutture) ogni costo si
divide sui mesi.

**Luce, gas e acqua non vanno qui**: arrivano dalle bollette (vedi Utenze).

## L'affitto è aumentato, come lo aggiorno?

Non correggere l'importo: il passato deve restare com'era.

1. Premi sulla voce.
2. Scegli «Cambia da un mese».
3. In «Il cambio vale dal mese di» metti il mese dell'aumento.
4. Scrivi il nuovo importo.
5. Premi «Salva».

La voce vecchia si chiude alla fine del mese prima e ne nasce una nuova: i mesi passati
restano come erano.

## Un costo non c'è più (contratto disdetto), come lo chiudo?

1. Premi sulla voce.
2. Scegli «Termina».
3. In «Ultimo giorno in cui vale» metti la data.
4. Premi «Chiudi la voce».

I mesi in cui il costo c'era restano nel cruscotto.

## Ho scritto un importo sbagliato, come lo correggo?

1. Premi sulla voce.
2. Scegli «Correggi un errore».
3. Correggi e premi «Salva».

Attenzione: la correzione vale **anche per i mesi passati**. Usala solo per gli errori,
non per gli aumenti.

## Dove vedo i costi fissi chiusi?

Premi «Mostra lo storico (…)». Le voci chiuse compaiono più chiare, con l'etichetta
«conclusa». «Nascondi lo storico» le toglie di nuovo.


## Chi può vedere i costi per struttura?

La pagina [Costi per struttura](/amministrazione/costi-strutture) si apre a:

- chi ha il permesso **Amministrazione** e gli **amministratori delle manutenzioni** –
  vedono **tutte** le strutture;
- i **coordinatori** e i **responsabili d'area** di un centro di costo – vedono **solo le
  strutture del loro centro di costo** (in alto leggono «Le tue strutture»).

Chi ha Amministrazione ci arriva dalla pagina Amministrazione. I coordinatori dalla
scheda «Costi per struttura» di Controllo di Gestione; gli amministratori delle
manutenzioni dalla scheda «Cruscotto costi» di Manutenzioni.

Se un coordinatore non vede la pagina, controlla che sia nominato nella pagina
[Coordinatori e Responsabili Centri di Costo](/amministrazione/centri-costo).

## Come leggo il cruscotto dei costi per struttura?

In alto c'è il **totale** del periodo («Tutte le strutture» o «Le tue strutture»), con una
barra colorata e il grafico mese per mese. Se ci sono più anni, sopra trovi i bottoni
degli anni.

I colori sono le voci di spesa: «Utenze», «Manutenzioni», «Pulizie», «Lavori Cura
Ambienti», «Acquisti», «Costi fissi», «Telefonia/Internet», «Altro».

Sotto c'è una scheda per ogni struttura, con il suo totale e le voci.

## Come vedo il dettaglio di una struttura?

1. Premi sulla scheda della struttura.
2. Si apre il dettaglio: grafico dei mesi, totale per voce, consumi di luce, gas e acqua,
   e l'elenco dei «Movimenti».
3. Premi una voce (es. «Utenze») per vedere solo i suoi movimenti; ripremila per
   tornare a tutti.
4. Dove c'è «PDF», puoi aprire il documento.

Se una scheda dice «⚠ … da guardare», nel dettaglio trovi gli avvisi.

## Perché alcuni costi non compaiono?

- Un riquadro azzurro può dire che alcuni costi sono «senza struttura»: stanno solo su un
  centro di costo e in questo cruscotto non compaiono.
- Se una fonte di dati non risponde, compare un riquadro giallo: il numero non è zero,
  semplicemente quella parte manca. Riprova più tardi.

## Problemi comuni

**Vengo riportato alla Home quando apro una pagina di Amministrazione**
Non hai il permesso Amministrazione. Chiedilo a chi gestisce i permessi.

**«Impossibile leggere la lista permessi: …»**
Il pannello Permessi non riesce a leggere gli accessi. Avvisa chi gestisce l'app.

**«Rubrica aziendale non disponibile: scrivi l'email per intero.»**
L'elenco dei colleghi non è disponibile in questo momento. Scrivi l'email aziendale
completa della persona.

**«Nessuna persona trovata. Scrivi l'email per intero per aggiungerla comunque.»**
Il nome non è nella rubrica. Scrivi l'email aziendale completa.

**«Email non valida»**
L'email scritta non è completa o ha un errore. Controllala.

**«Sulla lista Centri di Costo mancano ancora le colonne per salvare…»**
La pagina Coordinatori si può solo guardare finché chi gestisce l'app non sistema
l'impostazione. Avvisalo.

**«Salvataggio non riuscito: riprova fra un momento»**
Riprova dopo qualche secondo. Se torna, avvisa chi gestisce l'app.

**«Il nome del servizio è obbligatorio.» / «Scegli il centro di costo su cui ricade l'abbonamento.»**
In Gestione Software compila «Nome servizio» e scegli il «Centro di costo».

**«Il nome della voce è obbligatorio.»**
In Gestione Password compila «A cosa serve».

**«File troppo grande (max 50 MB)»**
La fattura è troppo pesante. Riducila e riprova.

**«Scrivi il codice (POD, PDR o numero utenza)» / «Scegli il tipo di fornitura» / «Scegli la struttura» / «La percentuale va da 1 a 100»**
Nella scheda dell'utenza manca un dato obbligatorio o la percentuale è sbagliata.

**«Scrivi una descrizione» / «Scegli la categoria» / «L'importo deve essere maggiore di zero» / «Scegli la frequenza»**
Nella scheda del costo fisso manca un dato obbligatorio.

**«Questa voce è già chiusa: modifica quella che vale adesso»**
Stai cambiando una voce vecchia. Apri la voce in vigore (quella senza «conclusa»).

**«Il mese della variazione deve venire dopo l'inizio della voce…»**
Per cambiarla dall'inizio usa «Correggi un errore».

**«La data di fine viene prima dell'inizio della voce»**
Controlla «Ultimo giorno in cui vale».
