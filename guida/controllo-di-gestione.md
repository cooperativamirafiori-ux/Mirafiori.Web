---
area: Controllo di Gestione
descrizione: Pagare le fatture dei fornitori, attribuirle ai servizi, guardare i conti Qonto, i costi per centro di costo e i lavori di Cura Ambienti.
pagine:
  - percorso: /controllo-gestione
    titolo: Controllo di Gestione
    accesso: [permesso:Controllo di Gestione, permesso:Pagamenti, permesso:Approvazione Pagamenti, coordinatore-cc]
    cosa: Punto di partenza, con le schede a cui hai accesso.
  - percorso: /controllo-gestione/flussi-fatture
    titolo: Flussi fatture
    accesso: [permesso:Pagamenti, permesso:Approvazione Pagamenti]
    cosa: Fatture e uscite da pagare, da approvare, da verificare; segnare pagato, mandare i bonifici a Qonto.
  - percorso: /controllo-gestione/fatture
    titolo: Fatture del servizio
    accesso: [permesso:Controllo di Gestione, permesso:Pagamenti, coordinatore-cc]
    cosa: Il coordinatore segna quali fatture arrivate sono del suo servizio.
  - percorso: /controllo-gestione/qonto
    titolo: Qonto
    accesso: [permesso:Controllo di Gestione, coordinatore-cc]
    cosa: Elenco dei conti Qonto con il saldo, e l'invio dell'estratto settimanale.
  - percorso: /controllo-gestione/qonto/[id]
    titolo: Qonto · <nome del conto>
    accesso: [permesso:Controllo di Gestione, coordinatore-cc]
    cosa: Saldo, IBAN e ultimi movimenti di un conto; si apre toccando un conto nell'elenco Qonto.
  - percorso: /controllo-gestione/cruscotto
    titolo: Cruscotto
    accesso: [permesso:Controllo di Gestione, coordinatore-cc]
    cosa: Costi, ricavi e ore per centro di costo e per area, anno per anno.
  - percorso: /controllo-gestione/cura-ambienti
    titolo: Cura Ambienti
    accesso: [permesso:Controllo di Gestione, coordinatore-cura-ambienti]
    cosa: Preventivi e consuntivi dei lavori di pulizia e manutenzione nelle strutture e per i clienti esterni.
---

# Controllo di Gestione

Qui si seguono i soldi che escono e dove vanno a finire: le fatture dei fornitori da
pagare, i conti in banca dei servizi, i costi di ogni servizio, i lavori di Cura Ambienti.

## Alcune parole che trovi in queste pagine

- **Centro di costo** (o **servizio**): ogni attività della cooperativa ha un suo codice,
  per esempio «cc18 · Condominio Solidale». Serve a sapere quanto costa e quanto rende
  ogni servizio. Ogni centro di costo ha uno o più **coordinatori**.
- **Imponibile**: l'importo di una fattura **senza IVA**. Il Cruscotto conta i costi così.
- **Sopra soglia**: una fattura che supera una certa cifra (la vedi scritta in cima a
  Flussi fatture, alla voce «soglia di approvazione») prima di essere pagata deve essere
  **approvata** da chi ha il permesso Approvazione Pagamenti.
- **Da verificare**: fatture di cui l'app non sa se vanno ancora pagate. Per esempio la
  fattura non dice come si paga, oppure era già scaduta quando l'app ha cominciato a
  leggere le fatture. Finché qualcuno non risponde, non entrano nelle code e non contano nei
  totali. Meglio una domanda in più che pagare due volte.
- **Escono da sole**: RID, SDD e domiciliazioni. Nessuno le paga a mano, il denaro esce
  da solo alla scadenza.
- **Preventivo / consuntivo**: quanto si pensa che costerà un lavoro prima di farlo, e
  quanto è costato davvero dopo.

## Chi può entrare e cosa vede?

Apri [Controllo di Gestione](/controllo-gestione) dalla Home. Ci entri se hai almeno uno
di questi permessi: «Controllo di Gestione», «Pagamenti», «Approvazione Pagamenti».
Se sei **coordinatore o responsabile d'area di un centro di costo** entri anche senza
nessun permesso: basta essere indicato come coordinatore nell'anagrafica dei centri di costo.

Dentro vedi solo le schede che ti spettano:

| Scheda | Chi la vede |
|---|---|
| «Cruscotto» | permesso Controllo di Gestione (tutta la cooperativa) e coordinatori (solo i loro servizi) |
| «Qonto» | permesso Controllo di Gestione (tutti i conti) e coordinatori (solo il conto del loro servizio) |
| «Fatture del servizio» | coordinatori, e chi ha il permesso Controllo di Gestione o Pagamenti |
| «Cura Ambienti» | coordinatori di Cura Ambienti e chi ha il permesso Controllo di Gestione |
| «Costi per struttura» | coordinatori (le strutture del loro servizio) e chi ha il permesso Amministrazione |
| «Flussi fatture» | solo chi ha il permesso Pagamenti o Approvazione Pagamenti |

Attenzione: il solo permesso «Controllo di Gestione» **non** apre Flussi fatture.

Se vedi la scritta «Qui non c'è ancora niente per te.», non hai schede attive: chiedi
all'ufficio amministrazione.

# Flussi fatture

## A cosa serve Flussi fatture?

È la pagina di chi paga i fornitori. Le fatture elettroniche arrivano da sole e l'app le
smista in quattro elenchi (le linguette in alto):

- «Da verificare» — compare solo se c'è qualcosa: righe su cui serve una risposta.
- «Da pagare» — fatture sotto soglia, o già approvate, e le uscite inserite a mano.
- «Da approvare» — fatture sopra soglia in attesa di approvazione. Ogni riga dice
  «in attesa da N giorni».
- «Escono da sole» — addebiti automatici, solo da guardare.

Le fatture scadute stanno sempre in cima, con la scritta rossa «scaduta da N gg».

Ci sono tre permessi diversi:

- **Pagamenti**: importa le fatture, segna pagato, manda i bonifici a Qonto, inserisce le
  uscite a mano, risponde alle righe da verificare, sceglie il servizio sulle fatture.
- **Approvazione Pagamenti**: approva le fatture sopra soglia. Il resto lo vede in sola
  lettura. Se hai solo questo permesso, la pagina si apre già su «Da approvare».
- **Controllo di Gestione**: serve per Cruscotto e Qonto, non per questa pagina.

## Cosa sono i numeri in alto?

- In cima c'è da quanto tempo non arrivano fatture nuove («Ultimo import oggi / ieri /
  N giorni fa») e la soglia di approvazione. Se è passata una settimana compare
  «nessuna fattura nuova da una settimana: la cartella è stata aggiornata?».
- Le piastrelle: «Scaduto», «Scade entro 7 giorni», «Entro 30 giorni», «Entro 60 giorni»,
  «Entro 90 giorni», «Da approvare». Le finestre si sommano («entro 60» comprende «entro
  30») e **non** comprendono lo scaduto, che ha la sua piastrella.
- La spunta «Includi gli addebiti automatici nelle finestre» aggiunge anche quello che esce
  da solo: allora le piastrelle dicono quanto esce dal conto, non solo quanto devi pagare tu.
- Aprendo «Lo scaduto per anzianità» vedi lo scaduto diviso per quanto è vecchio.

## Come cerco una fattura?

1. Scrivi nella casella «Cerca fornitore, numero fattura, P.IVA o importo».
2. L'elenco aperto si filtra. Se la fattura è in un altro elenco, l'app ti dice
   «Non è in questa coda. Trovata in:» e tocchi il nome dell'elenco giusto.
3. Sotto compare anche «Già pagate o chiuse», con le fatture già chiuse che corrispondono.
4. Per togliere la ricerca tocca la «×» nella casella.

## Come arrivano le fatture nell'app?

Le fatture elettroniche dei fornitori vanno messe nella cartella condivisa
**«fatture da SDI»**. L'app la legge da sola **ogni notte**.

Se hai appena aggiunto dei file e non vuoi aspettare (serve il permesso Pagamenti):

1. Apri [Flussi fatture](/controllo-gestione/flussi-fatture).
2. Nel riquadro «Fatture dallo SDI» premi «Importa adesso».
3. Aspetta: può volerci qualche minuto («Importo… (fino a qualche minuto)»).
4. Leggi il riepilogo: fatture lette, nuove, già note, quante da verificare, quante
   bloccate per l'IBAN. Se dice «Nessun file nuovo nella cartella.» non c'era niente di nuovo.
5. Se compare «N file non letti per limite di tempo: premi di nuovo.», premi ancora
   «Importa adesso».

Dove va ogni fattura lo decide l'app:

- pagata con carta → nasce già pagata;
- RID, SDD, domiciliazione → «Escono da sole»;
- note di credito → non vanno in coda;
- non dice come si paga → pagata se il fornitore è uno che si paga sempre al momento,
  altrimenti «Da verificare»;
- pagamento in contanti → «Da verificare» (in fattura lo scrivono anche quando non è vero);
- tutto il resto → «Da approvare» se sopra soglia, «Da pagare» se sotto.
- Se la fattura non ha la data di scadenza, l'app mette il 30 del mese dopo e scrive
  «scadenza stimata».

## Come rispondo alle fatture «da verificare»?

Serve il permesso Pagamenti.

1. Apri la linguetta «Da verificare» (è arancione; quando c'è qualcosa la pagina si apre lì).
2. Ogni riga dice perché è lì: «la fattura non dice come si paga» oppure «forse già pagata».
3. Spunta una o più righe.
4. Nella barra in basso scegli:
   - «Pagata in negozio» — pagata al momento, il giorno della fattura. L'app impara il
     fornitore: le sue prossime fatture senza modalità nasceranno già pagate.
   - «Già pagata il» — scegli la data accanto, poi premi il bottone.
   - «Da pagare» — va pagata: entra in coda. Se è sopra soglia va prima in «Da approvare».
5. Se hai sbagliato, subito dopo compare «Hai appena risposto su N righe da verificare.
   Sbagliato?»: premi «Annulla».

## Come approvo le fatture sopra soglia?

Serve il permesso Approvazione Pagamenti.

1. Apri la linguetta «Da approvare».
2. Spunta le fatture che vuoi approvare (oppure «Seleziona tutto»).
3. Premi «Approva (N)» nella barra in basso.
4. Le fatture passano in «Da pagare», con la scritta verde «approvata».

Non esiste un tasto «rimanda»: se non approvi, la fattura resta lì, e la scritta «in
attesa da N giorni» lo fa vedere.

## Come segno che una fattura è stata pagata?

Questo serve quando hai pagato **fuori dall'app** (dal sito della banca, in posta, con
PagoPA…). Serve il permesso Pagamenti.

1. Apri «Da pagare».
2. Spunta le fatture pagate. Puoi spuntarne tante insieme, per esempio sette fatture dello
   stesso fornitore saldate con un solo bonifico.
3. In basso, in «Pagate il», metti la data vera del pagamento (di solito è oggi, ma puoi
   cambiarla).
4. Premi «Segna come pagate (N)».
5. Le righe spariscono dalla coda. Se hai sbagliato riga, subito dopo compare «Hai appena
   chiuso N scadenze. Riga sbagliata?»: premi «Annulla».

Le fatture sopra soglia non ancora approvate non si possono segnare pagate.

## Come mando i bonifici a Qonto?

Serve il permesso Pagamenti. L'app prepara su Qonto le **richieste di bonifico**: il
denaro **non parte** finché qualcuno non le approva nell'app di Qonto.

1. Apri «Da pagare».
2. Controlla che ogni fattura abbia il **servizio** scelto (sotto il nome, alla voce
   «Servizio»): il bonifico parte dal conto Qonto di quel servizio.
3. Spunta le fatture.
4. Premi «Invia a Qonto (N)».
5. Leggi il messaggio: quante fatture sono partite, da quale conto, e quali no con il motivo.
6. Le righe inviate mostrano «su Qonto · da approvare».
7. Su Qonto la persona abilitata approva la richiesta.

Dopo l'approvazione su Qonto la fattura diventa **pagata da sola**: l'app controlla di notte
e ogni volta che apri Flussi fatture. Se su Qonto la richiesta viene rifiutata o annullata,
la riga mostra «rifiutata su Qonto» o «annullata su Qonto» e si può inviare di nuovo.

Una fattura **non parte** se: non è ancora approvata; è già stata inviata; è un'uscita
inserita a mano; manca l'IBAN o è cambiato; non ha il servizio; il servizio non ha un conto
Qonto. I messaggi sono in fondo, in «Problemi comuni».

## Come scelgo o correggo il servizio di una fattura?

Di solito lo sceglie il coordinatore in [Fatture del servizio](/controllo-gestione/fatture).
Chi ha il permesso Pagamenti può sceglierlo o correggerlo anche qui:

1. Sulla riga della fattura trova la voce «Servizio».
2. Apri il menu e scegli il servizio. «— da scegliere —» vuol dire che non c'è ancora.
3. L'app salva subito.

## Cosa faccio se una fattura dice «manca l'IBAN» o «IBAN cambiato»?

Serve il permesso Pagamenti.

**Manca l'IBAN:**

1. Premi «Inserisci l'IBAN del fornitore».
2. Scrivi l'IBAN e premi «Salva». L'app controlla che le cifre siano giuste.

**IBAN cambiato** (l'IBAN in fattura è diverso da quello già confermato):

1. Premi «Verifica il nuovo IBAN».
2. **Chiama il fornitore a un numero che hai già**, non a quello scritto in fattura o nella
   mail. Le «nuove coordinate bancarie» sono la truffa più comune.
3. Solo se il fornitore conferma, spunta «Ho verificato al telefono: il nuovo IBAN è giusto».
4. Premi «Conferma il nuovo IBAN».

La conferma vale per il fornitore: sblocca tutte le sue fatture non ancora pagate.

## Come inserisco un'uscita che non ha una fattura (F24, tributi, rate)?

Per i pagamenti che non arrivano come fattura elettronica: F24, tributi, contributi, rate,
ricariche delle carte. Serve il permesso Pagamenti.

1. In Flussi fatture premi «Aggiungi un'uscita».
2. Compila:
   - «Cosa si paga» (per esempio «F24 agosto», «rata INPS»);
   - «Scade il»;
   - «Importo»;
   - «È un costo o solo un movimento di cassa?»: scegli «Costo» se è un costo dell'anno,
     «Solo movimento di cassa» se esce dal conto ma non è un costo di quest'anno (rate di
     debiti, giroconti, restituzioni);
   - «Note», se vuoi.
3. Premi «Metti in coda da pagare».
4. L'uscita entra in «Da pagare» con la scritta «inserita a mano». **Non passa
   dall'approvazione**, anche se è sopra soglia: chi la inserisce l'ha già decisa.
5. Il riquadro resta aperto per inserirne un'altra. Per chiuderlo premi «Chiudi».

Se c'è già un'uscita con lo stesso importo e scadenza vicina, l'app chiede conferma:
«Sono due uscite diverse, inseriscila» oppure «Lascia perdere».

Il servizio non si chiede qui: si sceglie dopo.

**Per cancellarla** (solo se non è ancora pagata): sulla riga premi «elimina», poi
«Cancella». Le uscite inserite a mano non si possono mandare a Qonto: si pagano a mano e
poi si segnano pagate.

## Cosa vogliono dire le scritte colorate sulle righe?

- «inserita a mano» — uscita senza fattura, scritta da una persona.
- «movimento di cassa» — esce dal conto ma non è un costo dell'anno.
- «nota di credito» — documento che riduce quanto devi al fornitore.
- «scadenza stimata» — la fattura non aveva la scadenza, l'app l'ha messa al 30 del mese dopo.
- «approvata» — sopra soglia, già approvata.
- «su Qonto · da approvare» — richiesta di bonifico in attesa su Qonto.
- «sparita dall'export» — riga che non compare più nei dati del gestionale: chiedi
  all'ufficio amministrazione.
- «verifica: forse già pagata in negozio» — controlla prima di pagare.
- «pagata il … · secondo il gestionale» — chiusa perché lo diceva il gestionale, non
  controllata da qualcuno di noi.

Sotto ogni fattura ci sono i collegamenti «PDF» e «XML» per vedere il documento.

# Fatture del servizio

## Come segno le fatture del mio servizio?

Le fatture arrivate senza servizio sono «libere». Il coordinatore prende quelle del suo
servizio: così entrano nei costi giusti e il bonifico parte dal conto giusto.

1. Apri [Fatture del servizio](/controllo-gestione/fatture) da Controllo di Gestione.
2. Resta sulla linguetta «Libere».
3. Se serve, cerca in «Cerca fornitore, numero, descrizione…».
4. Spunta le fatture del tuo servizio. La scritta «di solito: …» ti dice su quale servizio
   sono andate le altre fatture dello stesso fornitore: è solo un suggerimento.
5. Se coordini più servizi, scegli quello giusto in «Scegli il servizio…».
6. Premi il bottone in basso: «Sono di <nome del servizio>» se ne coordini uno solo,
   «Sono del mio servizio» se ne coordini più di uno.

**Vince il primo**: se un collega ha preso la stessa fattura un attimo prima, il messaggio
dice «N le aveva già prese un collega».

Qui vedi solo le fatture elettroniche arrivate dalla cartella delle fatture, non quelle più
vecchie.

## Ho segnato una fattura per sbaglio, come la libero?

1. Apri la linguetta «Del mio servizio» (per chi vede tutto si chiama «Segnate»).
2. Spunta la fattura.
3. Premi «Libera (N)».

Puoi liberarla da solo **finché non è stata pagata**. Dopo, sulla riga compare «pagata» e
devi chiedere a chi ha il permesso Controllo di Gestione o Pagamenti, che possono spostarla.

# Qonto

## Come vedo il saldo del conto del mio servizio?

Ogni servizio ha un suo conto su Qonto, la banca della cooperativa.

1. Da Controllo di Gestione apri «Qonto».
2. Se coordini un solo servizio arrivi dritto al tuo conto. Altrimenti tocca il conto
   nell'elenco (il conto principale ha la ★).
3. Nella scheda del conto vedi:
   - l'IBAN, con il bottone «Copia»;
   - «Disponibile adesso»: il saldo meno i pagamenti con carta ancora in attesa. **È il
     numero da guardare prima di spendere**;
   - «Saldo contabile»;
   - «Ultimi movimenti»: gli ultimi 30, con chi ha pagato o incassato, il tipo, e le
     scritte «In attesa», «Giroconto» (soldi spostati fra conti nostri), «Scontrino»
     (c'è la ricevuta allegata).

I dati si rinnovano ogni minuto. Dall'app **non si fanno pagamenti**: si guarda soltanto.
Chi ha il permesso Controllo di Gestione vede tutti i conti e il totale.

## Come mando l'estratto conto settimanale?

Ogni lunedì mattina l'app manda da sola, a chi tiene la contabilità, un file Excel con i
movimenti della settimana prima (da lunedì a domenica) di tutti i conti. Se serve mandarlo
a mano (solo con il permesso Controllo di Gestione):

1. Apri [Qonto](/controllo-gestione/qonto).
2. In fondo, nel riquadro «Estratto conti settimanale», in «Mandalo a» c'è già la tua mail.
   Puoi scriverne altre, separate da virgola (al massimo 10).
3. Premi «Invia estratto settimanale».
4. Il messaggio conferma a chi è partito, quale settimana, quanti conti e movimenti.

Si manda sempre la settimana precedente: un'altra settimana dall'app non si può scegliere.

# Cruscotto

## Cosa mostra il Cruscotto?

I costi di ogni centro di costo nell'anno. È una **prima versione**: i numeri sono veri ma
incompleti.

1. Da Controllo di Gestione tocca il riquadro blu «Cruscotto».
2. In alto scegli l'anno (l'anno in corso e i due precedenti).
3. Il numero grande sono i costi dei servizi, **IVA esclusa** (imponibile). Chi ha il
   permesso Controllo di Gestione vede tutta la cooperativa, con l'anello «attribuito»
   (quante fatture hanno già un servizio); il coordinatore vede solo i suoi servizi.
4. Sotto ci sono le tessere: «Fatture con servizio», «Da attribuire», «Fatture emesse»,
   «Ore lavorate».
5. «Per area» (solo per chi vede tutto): tocca un'area per vedere solo i suoi servizi.
6. «Centri di costo»: ordina per «Costi», «Ore» o «A–Z», e tocca un servizio per vedere mese
   per mese e i fornitori («Dove si spende»).

## Da dove vengono i numeri del Cruscotto?

Lo spiega anche la voce «Da dove vengono questi numeri» in fondo alla pagina.

- **Costi**: solo le fatture elettroniche (da luglio 2026) **segnate su un servizio**, IVA
  esclusa, alla data della fattura. Le fatture senza servizio finiscono in «Da attribuire»:
  finché restano lì il cruscotto vede solo una parte dei costi. Il bottone «Segna le fatture
  dei servizi →» porta a Fatture del servizio.
- Le fatture più vecchie e i costi scritti a mano in Manutenzioni **non** si contano.
- **Ricavi**: solo le fatture fatte con Richiesta fattura, IVA esclusa.
- **Ore**: le ore timbrate nell'app. Il costo del lavoro non c'è ancora.
- **Budget**: non esiste ancora.

Chi vede tutto può premere «Esempio» (o «Come sarà a regime»): compaiono **dati inventati**,
con la fascia arancione «Dati di esempio, inventati». Per tornare ai numeri veri premi «Dati veri».

# Cura Ambienti

## A cosa serve Cura Ambienti?

Cura Ambienti fa le pulizie e le piccole manutenzioni nelle strutture della cooperativa e
per alcuni clienti esterni. Il personale timbra su Cura Ambienti; il **coordinatore** dice
quante ore sono andate a ogni struttura con un **lavoro**: un preventivo prima e un
consuntivo dopo. Così il costo va al servizio che ha ricevuto il lavoro.

**Importo = ore × tariffa oraria del mese + materiali dedicati.** Detersivi e materiale di
consumo sono già nella tariffa; i «materiali dedicati» sono solo quelli di quel lavoro (un
rubinetto, una serratura). Alcune strutture hanno una tariffa propria: la scheda lo dice.

## Cosa sono i numeri in alto?

Con le frecce ← → cambi mese. Le piastrelle:

- «Ore timbrate» — le ore timbrate su Cura Ambienti nel mese. **Fanno fede.**
- «Ore consuntivate» — le ore scritte nei consuntivi.
- «Ore non addebitate» — la differenza: ore lavorate che nessun servizio paga.
- «Addebitabile» — il totale dei consuntivi.

Se le ore consuntivate superano quelle timbrate compare un avviso: qualche consuntivo è da
rivedere.

## Come creo un nuovo lavoro?

1. Apri [Cura Ambienti](/controllo-gestione/cura-ambienti) e scegli il mese.
2. Premi «+ Nuovo lavoro».
3. Compila:
   - «Per chi»: «Una nostra struttura» oppure «Un cliente esterno»;
   - «Struttura» (l'addebito va sul suo centro di costo) oppure «Cliente»;
   - «Che lavoro è» (per esempio «Pulizia ordinaria»), e «Dettagli» se servono;
   - «Si ripete»: «No, una volta sola», «Ogni mese» o «Ogni settimana» (con «Che giorno»);
   - il **Preventivo**: «Ore pulizie», «Ore manutenzione», «Materiali dedicati (€)».
     L'importo si calcola mentre scrivi.
4. Premi «Salva». Il lavoro nasce in «Bozza».

Per un lavoro **ogni settimana** le ore si scrivono **per volta**: l'app le moltiplica per
quante volte quel giorno cade nel mese (4 o 5) e te lo scrive.

## Come porto avanti un lavoro fino al consuntivo?

Tocca il lavoro nell'elenco. In basso ci sono «Salva» e i bottoni per cambiare stato:

- «Segna come preventivato» — il preventivo è pronto;
- «Segna in corso» — il lavoro è iniziato;
- «Chiudi il consuntivo» — il lavoro è finito;
- «Riporta in bozza», «Annulla il lavoro».

Per il consuntivo:

1. Apri il lavoro (non deve essere in «Bozza»).
2. Nel riquadro verde «Consuntivo» scrivi «Ore pulizie», «Ore manutenzione», «Materiali
   dedicati (€)» e, se vuoi, «Note sul consuntivo». **Servono tutti e tre i valori, anche zero.**
3. Vedi l'importo e la differenza dal preventivo (rosso se costa di più).
4. Premi «Chiudi il consuntivo». I dati appena scritti si salvano insieme.

Gli stati: «Bozza», «Preventivato», «In corso», «Consuntivato», «Addebitato», «Annullato».
«Addebitato» non lo mette nessun bottone: arriva quando il costo è passato al servizio, e da
lì il lavoro **non si modifica più**. Un lavoro consuntivato si può riportare «in corso»
per correggerlo.

## Come preparo i lavori ricorrenti del mese?

Le pulizie che si ripetono non vanno riscritte ogni mese.

1. Vai sul mese giusto con le frecce.
2. Premi «Crea i lavori ricorrenti del mese».
3. L'app crea un lavoro «Preventivato» per ogni ricorrenza attiva. Per quelli mensili il
   preventivo è il consuntivo del mese prima, se c'è.
4. Puoi premerlo più volte: i lavori già creati non si duplicano («I lavori ricorrenti di …
   c'erano già tutti.»).

Poi a fine mese correggi solo il consuntivo.

## Come metto in pausa o fermo una pulizia ricorrente?

Nel riquadro «Ricorrenti», in cima alla pagina:

- «Metti in pausa» — dal prossimo mese non si crea più, finché non premi «Riprendi».
- «Chiudi», poi «Sì, chiudi» — si ferma per sempre. I lavori già creati restano.
  Una ricorrenza chiusa non si riapre: se serve, crea un lavoro nuovo che si ripete.

Ore e orari di una ricorrenza si cambiano aprendo uno dei suoi lavori: le modifiche valgono
anche per i mesi seguenti.

## Problemi comuni

**«Accesso negato» o la pagina mi riporta alla Home.**
Non hai il permesso per quella pagina. Il permesso si chiede all'ufficio amministrazione;
per diventare coordinatore di un servizio bisogna essere indicati come coordinatore
nell'anagrafica dei centri di costo.

**«Serve il permesso "Pagamenti" per registrare un pagamento» / «Serve il permesso
"Approvazione Pagamenti" per approvare».**
Il tuo permesso non permette quel gesto. Chiedi a chi ce l'ha.

**«sopra soglia: manca l'approvazione».**
La fattura è sopra soglia e nessuno l'ha ancora approvata: deve farlo chi ha il permesso
Approvazione Pagamenti.

**Messaggi quando invio a Qonto:**
- «manca il servizio: sceglilo sulla riga» — scegli il servizio alla voce «Servizio».
- «il servizio non ha un sottoconto Qonto» — quel servizio non ha un conto su Qonto: paga
  dal sito della banca e poi «Segna come pagate».
- «IBAN cambiato: va confermato» / «manca l'IBAN» / «IBAN assente o non valido» — vedi la
  domanda sull'IBAN.
- «già inviata a Qonto» — aspetta l'approvazione su Qonto.
- «uscita senza fattura: si paga a mano» — le uscite inserite a mano non vanno a Qonto.
- «la sta già inviando qualcun altro» — un collega l'ha appena inviata.
- «Qonto non è collegato all'app per i bonifici…» — avvisa l'ufficio amministrazione.

**«IBAN non valido: controlla le cifre».**
L'IBAN scritto ha un errore. Ricopialo con attenzione.

**«Scrivi cosa si paga: almeno tre caratteri», «Indica l'importo», «L'importo va scritto
positivo: qui si registrano uscite», «La data sembra sbagliata…».**
Correggi il campo indicato nella mascherina dell'uscita.

**«La scadenza è già pagata: annulla prima il pagamento dalla coda».**
Un'uscita già pagata non si cancella né si modifica.

**«Nessuna fattura ancora importata» o «nessuna fattura nuova da una settimana».**
Controlla che qualcuno abbia messo i file nella cartella «fatture da SDI», poi premi
«Importa adesso».

**Ho segnato pagata la fattura sbagliata e ho già chiuso la pagina.**
Il bottone «Annulla» compare solo subito dopo. Rivolgiti all'ufficio amministrazione.

**«è già stata pagata: per spostarla chiedi al Controllo di Gestione».**
Una fattura pagata non si libera più da soli: chiedi a chi ha il permesso Controllo di
Gestione o Pagamenti.

**«Non coordini questo centro di costo» / «è di un centro di costo che non coordini».**
Puoi segnare e liberare solo fatture dei servizi che coordini.

**«Qonto non risponde in questo momento. Riprova fra qualche minuto.»**
Riprova più tardi. Se dura, avvisa l'ufficio amministrazione.

**«Il tuo centro di costo non ha ancora un conto su Qonto.»**
Il tuo servizio non ha un conto: chiedi all'ufficio amministrazione.

**Nel Cruscotto: «Non hanno risposto: …».**
Una delle fonti non ha risposto e quei numeri non sono contati. Ricarica la pagina più tardi.

**Cura Ambienti: «Prima di chiudere scrivi il consuntivo: ore di pulizia, ore di
manutenzione e materiali (anche zero)».**
Scrivi tutti e tre i valori, anche 0, poi premi di nuovo «Chiudi il consuntivo».

**Cura Ambienti: «La struttura … non ha un centro di costo».**
Quella struttura non ha un servizio collegato: avvisa l'ufficio amministrazione.

**Cura Ambienti: «Per questo mese manca una tariffa oraria».**
Gli importi non si possono calcolare finché non c'è la tariffa: avvisa l'ufficio
amministrazione.

**Cura Ambienti: «Un lavoro addebitato o annullato non si modifica».**
Un lavoro annullato si può riportare in bozza con «Riporta in bozza»; uno addebitato no.

**Cura Ambienti: «Qualcuno ha appena cambiato questo lavoro: ricarica la pagina».**
Ricarica la pagina e riprova.
