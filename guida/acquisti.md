---
area: Richieste Acquisto
descrizione: Chiedere un bene o un servizio da comprare, seguirne lo stato fino alla consegna e, per chi gestisce gli acquisti, valutare, ordinare e chiudere le richieste.
pagine:
  - percorso: /acquisti
    titolo: Richieste Acquisto
    accesso: [tutti]
    cosa: Punto di partenza, con i tasti per nuova richiesta e le mie richieste (chi gestisce gli acquisti vede anche Gestione acquisti).
  - percorso: /acquisti/nuova
    titolo: Nuova richiesta di acquisto
    accesso: [tutti]
    cosa: Modulo di una schermata per chiedere un articolo o un servizio.
  - percorso: /acquisti/mie
    titolo: Le mie richieste di acquisto
    accesso: [tutti]
    cosa: Le tue richieste con lo stato, la conferma di consegna, il riordino rapido e l'annullamento.
  - percorso: /acquisti/gestione
    titolo: Gestione acquisti
    accesso: [permesso:Acquisti]
    cosa: Tutte le richieste, per prenderle in carico, approvarle, registrare l'ordine, il pagamento e chiuderle.
  - percorso: /consegna/[token]
    titolo: Com'è andata la consegna?
    accesso: [pubblico]
    cosa: Pagina aperta dai pulsanti della mail per confermare se la merce è arrivata.
---

# Richieste Acquisto

Qui chiedi alla cooperativa di comprare qualcosa che ti serve per il lavoro: materiale di
consumo, attrezzature, arredi, informatica, servizi e altro. Puoi poi seguire la richiesta
fino alla consegna.

Chi ha il **permesso Acquisti** gestisce le richieste: le valuta, fa l'ordine e controlla
la consegna.

## Chi può chiedere un acquisto?

Tutti quelli che entrano nell'app con l'account della cooperativa. La scheda «Richieste
Acquisto» è sempre nella Home, nella sezione «Operatività».

## Come chiedo di comprare qualcosa?

1. Dalla Home tocca «Richieste Acquisto».
2. Tocca «Nuova richiesta».
3. «Centro di costo»: scegli a chi va imputata la spesa (il tuo servizio).
4. «Cosa serve»: descrivi l'articolo, più preciso possibile. Esempio: «Carta A4 bianca
   80 g, risme da 500 fogli».
5. «Quantità»: quanti pezzi (almeno 1).
6. «Urgenza»: «Normale», «Alta» oppure «Urgente».
7. «Categoria di spesa»: scegli fra «Materiale di consumo», «Attrezzatura», «Arredi»,
   «Informatica», «Cancelleria», «Pulizia e igiene», «Alimentari», «DPI e sicurezza»,
   «Manutenzione», «Servizi», «Altro».
8. «Serve entro il» (facoltativo): la data entro cui ti serve.
9. «Link al prodotto» (facoltativo): l'indirizzo della pagina del prodotto, se l'hai
   trovato in internet.
10. Tocca «Invia richiesta».

Compare «Richiesta inviata» con il codice, per esempio `ACQ-2026-001`.

Sono obbligatori centro di costo, «Cosa serve», quantità, urgenza e categoria.

## Devo indicare dove consegnare la merce?

No. Il posto dove arriva la merce (il «servizio di consegna») lo sceglie chi prende in
carico la richiesta. Se deve arrivare in un posto preciso, scrivilo nel campo «Cosa
serve».

## Devo chiedere più articoli diversi, come faccio?

Ogni articolo è una richiesta. Dopo aver inviato la prima:

1. Tocca «+ Chiedi un altro articolo».
2. Il modulo tiene il centro di costo e la categoria, e svuota il resto.
3. Compila il nuovo articolo e tocca «Invia richiesta».

## Come richiedo una cosa che ho già chiesto in passato?

1. Apri [Le mie richieste](/acquisti/mie).
2. Tocca «Tutte» per vedere anche le richieste chiuse.
3. Sulla richiesta che ti interessa tocca «⧉ Duplica».
4. Si apre una nuova richiesta già compilata con centro di costo, descrizione, quantità,
   categoria e link. Controlla, cambia se serve e tocca «Invia richiesta».

## Cosa succede dopo che ho inviato la richiesta?

La richiesta passa per questi stati:

| Stato | Cosa vuol dire |
|---|---|
| **Inviata** | È arrivata, nessuno l'ha ancora presa. |
| **Presa in carico** | Qualcuno degli acquisti la sta guardando. |
| **Approvata** | Si compra. |
| **Non approvata** | Non si compra. Vedi il motivo. |
| **Ordinata** | L'ordine è partito, si aspetta la consegna. |
| **Consegnata** | La merce è arrivata, la richiesta è chiusa. |
| **Problema** | Alla consegna qualcosa non andava (merce da restituire). |
| **Annullata** | La richiesta è stata ritirata. |

Le mail che ricevi tu:

- quando è **approvata** («Acquisto … — approvato») o **non approvata** («Acquisto … —
  non approvato», con il motivo);
- quando è **ordinata** («Acquisto … — ordinato»), con il fornitore e la data di consegna
  prevista;
- il giorno della **consegna prevista**, una mail «… — è arrivato tutto?» con due
  pulsanti per rispondere;
- se la richiesta la annulla chi gestisce gli acquisti («Acquisto … — annullato»).

Chi gestisce gli acquisti riceve una mail al giorno con le richieste nuove. Le richieste
**Urgenti** gli arrivano subito con una mail a parte.

## Dove vedo a che punto sono le mie richieste?

1. Dalla pagina [Richieste Acquisto](/acquisti) tocca «Le mie richieste».
2. In alto scegli «In corso» (le richieste ancora aperte) oppure «Tutte».
3. Per ogni richiesta vedi codice, data, stato, cosa hai chiesto, centro di costo,
   categoria, urgenza e «serve entro».
4. Quando il servizio di consegna è stato deciso leggi «consegna presso …».
5. Se è stata ordinata vedi fornitore, consegna prevista, totale ed esito.
6. Se non è stata approvata vedi il «Motivo».

Da qui puoi anche aprire una «+ Nuova» richiesta.

## Come confermo che la merce è arrivata?

Puoi farlo in due modi.

**Dalla mail.** Il giorno della consegna prevista ricevi una mail con due pulsanti:
«✅ Tutto ok» e «↩️ Da restituire».

1. Tocca il pulsante giusto: si apre la pagina «Com'è andata la consegna?».
2. Controlla i dati (cosa, fornitore, dove, quando).
3. Se hai scelto «Da restituire», scrivi in «Cosa è successo?» il problema (per esempio
   «sono arrivate 3 risme invece di 5»).
4. Tocca «Conferma».

Compare «Grazie, registrato». Non serve entrare nell'app. Toccare il pulsante nella mail
da solo non registra nulla: serve sempre «Conferma».

**Dall'app.** In [Le mie richieste](/acquisti/mie), sulle richieste in stato **Ordinata**
trovi «È arrivato?» con i pulsanti «Tutto ok» e «Da restituire».

Cosa succede:

- **Tutto ok**: la richiesta diventa **Consegnata** e la spesa viene registrata nei costi.
- **Da restituire**: la richiesta diventa **Problema** e chi ha fatto l'ordine viene
  avvisato e si occupa del reso.

In tutti e due i casi chi gestisce gli acquisti riceve una mail con l'esito.

## Non ho confermato la consegna, cosa succede?

- 3 giorni dopo la consegna prevista ricevi un promemoria «Promemoria: com'è andata la
  consegna di …?».
- 10 giorni dopo la consegna prevista la richiesta si chiude da sola come **Consegnata**,
  con l'esito «Consegnata senza riscontro».

Se la richiesta non ha una data di consegna prevista non partono né la mail né il
promemoria.

## La merce arriva in ufficio e non da me: chi conferma?

Per le consegne in una sede presidiata (oggi l'ufficio di Strada del Drosso) la consegna
non la confermi tu: la confermano i referenti dell'ufficio, che ricevono la mail al posto
tuo. In [Le mie richieste](/acquisti/mie) leggi «La consegna viene confermata dai
referenti di …».

Appena confermano, ti arriva la mail «… — il tuo ordine è arrivato, puoi ritirarlo» e
puoi passare a prenderlo.

## Posso annullare una richiesta?

Sì, finché non è stata ordinata (stato **Inviata**, **Presa in carico** o **Approvata**):

1. Apri [Le mie richieste](/acquisti/mie).
2. Sulla richiesta tocca «Annulla richiesta».
3. Conferma.

La richiesta diventa **Annullata**. Se è già **Ordinata** non puoi più annullarla da solo:
contatta chi gestisce gli acquisti.

## Posso modificare una richiesta già inviata?

No, dall'app non si può. Annullala (se non è ancora ordinata) e fanne una nuova, magari con
«⧉ Duplica» per non riscrivere tutto.

---

# Per chi gestisce gli acquisti

Serve il permesso **Acquisti**. Nella pagina [Richieste Acquisto](/acquisti) vedi la scheda
«Gestione acquisti», con un numero: quante richieste aspettano di essere lavorate.

## Cosa vedo nella pagina Gestione acquisti?

In alto quattro numeri: «Da valutare», «Approvate, da ordinare», «In attesa di consegna»,
«Problemi aperti». Sotto leggi quanto è stato ordinato in tutto: la spesa entra nei costi
solo quando la consegna è confermata.

Puoi filtrare:

- per stato («In corso», «Tutti gli stati» o un solo stato);
- per categoria;
- cercando con «Cerca codice, articolo, fornitore…».

Tocca una richiesta per aprirla. Dentro trovi i dettagli e i riquadri per lavorarla.

## Come prendo in carico una richiesta?

1. Apri la richiesta (stato **Inviata**).
2. Nel riquadro «Servizio di consegna» scegli dove va consegnata la merce.
3. Tocca «Prendi in carico».

La richiesta passa a **Presa in carico** ed è assegnata a te.

Senza servizio di consegna non si approva e non si ordina. Se c'è un solo gestore, le
richieste nascono già prese in carico da lui: il servizio va comunque scelto e salvato con
«Salva il servizio».

Per cambiare il servizio più tardi scegli quello nuovo e tocca «Sposta la consegna qui».
Non si può più cambiare quando la richiesta è chiusa.

## Come passo una richiesta a un altro gestore?

Se i gestori sono più di uno, nella richiesta trovi «Assegna a».

1. Scegli prima il servizio di consegna.
2. In «Assegna a» scegli il gestore.

La richiesta passa a lui (e diventa **Presa in carico** se era **Inviata**). Lui riceve
una mail «… — assegnata a te».

## Come approvo o rifiuto una richiesta?

Nel riquadro «Valutazione»:

- tocca «Approva»: la richiesta diventa **Approvata** e il richiedente riceve la mail;
- per rifiutare scrivi il motivo nel campo «Motivo del rifiuto (obbligatorio per non
  approvare)» e tocca «Non approvare»: la richiesta diventa **Non approvata** e il
  richiedente riceve la mail con il motivo.

## Come registro l'ordine?

Nel riquadro «Registra l'ordine» (si può fare da **Presa in carico** o **Approvata**):

1. «Fornitore»: scrivi il nome, l'app propone quelli già usati.
2. «Imponibile €» e «Totale €»: li leggi sulla fattura. L'«IVA» la calcola l'app come
   differenza.
3. «Data ordine» (parte da oggi) e «Consegna prevista».
4. «Pagamento»: «Fattura posticipata», «Bonifico», «Carta» o «Contanti».
5. Se serve, spunta «Acquisto extra CEE (IVA a 0)».
6. Se è un bene da mettere in inventario, spunta «Da inventariare» e compila:
   - «Marca e modello» (obbligatorio);
   - «Garanzia (mesi)», 12 se non lo cambi. L'app mostra quando scade;
   - il numero di serie, uno per pezzo (facoltativo).
7. Tocca «Registra ordine e avvisa il richiedente».

La richiesta diventa **Ordinata** e il richiedente riceve la mail con fornitore e data
prevista. Il giorno della consegna prevista l'app gli chiede se è arrivato tutto.

Se hai spuntato «Da inventariare», l'app crea subito un bene in inventario per ogni pezzo
e ti mostra i numeri assegnati (per esempio «Bene inventariato: INV-0007.»).

Per correggere un ordine già registrato usa lo stesso riquadro, che si chiama «Correggi
l'ordine», e tocca «Aggiorna l'ordine». I numeri di inventario restano gli stessi.

## Come carico fattura e garanzia di un bene inventariato?

Nella richiesta, nel riquadro «Inventario», per ogni bene trovi:

1. «Carica fattura» e «Carica garanzia»: tocca e scegli il file.
2. Quando il file è caricato il pulsante diventa «Fattura ✓ sostituisci» (o «Garanzia ✓
   sostituisci») e compare «apri fattura» / «apri garanzia».

Caricando un nuovo file sostituisci il precedente. Con «apri cartella» vedi tutti i
documenti del bene, con «apri l'inventario» vai all'[Inventario](/inventario).

## Come segno che un ordine è stato pagato?

Dopo aver registrato l'ordine compare il riquadro «Pagamento», con «da pagare» o «pagato
il …».

1. Metti la data del pagamento.
2. Tocca «Salva».

Per annullare la registrazione svuota la data e tocca «Salva».

## La merce è da restituire: come chiudo il problema?

Una richiesta in stato **Problema** mostra «Problema segnalato: …».

1. Risolvi con il fornitore (reso, sostituzione).
2. Se vuoi, scrivi in «Come è stato risolto (facoltativo)».
3. Tocca «Risolto — chiudi e registra il costo».

La richiesta diventa **Consegnata** e la spesa entra nei costi.

## Come annullo una richiesta da gestore?

Tocca «Annulla richiesta» e conferma. Si può fare finché la richiesta non è **Consegnata**,
**Annullata** o **Non approvata**. Il richiedente riceve una mail. Se c'erano beni già in
inventario, restano nell'elenco segnati come annullati.

## Problemi comuni

**«Compila centro di costo, descrizione e categoria.»**
Nella nuova richiesta manca un campo obbligatorio.

**«La quantità deve essere almeno 1.»**
Metti una quantità di almeno 1.

**«Hai già risposto per questa richiesta.» / «Hai già risposto»**
La consegna era già stata confermata, da te o da qualcun altro. Non serve fare altro.

**«Link non valido» / «Link non valido o scaduto»**
Il link della mail non corrisponde a nessuna richiesta. Controlla in
[Le mie richieste](/acquisti/mie) o scrivi a chi gestisce gli acquisti.

**«Non c'è nulla da confermare»**
La richiesta non è in attesa di consegna (per esempio è stata annullata).

**«Questa consegna la confermano i referenti di …»**
La merce arriva in una sede presidiata: conferma l'ufficio, tu ricevi la mail quando puoi
ritirare.

**«La richiesta è già stata ordinata: contatta chi la gestisce.»**
Una richiesta ordinata non si può annullare da soli.

**«Utente SP non trovato: …»**
L'app non è riuscita a riconoscere il tuo account. Aspetta qualche secondo e riprova. Se
torna, avvisa l'ufficio amministrazione.

**Per chi gestisce gli acquisti:**

- «Scegli il servizio di consegna.» / «Scegli prima il servizio di consegna.» – scegli e
  salva il servizio di consegna prima di approvare o ordinare.
- «Il motivo del rifiuto è obbligatorio.» – scrivi il motivo prima di «Non approvare».
- «Indica il fornitore.», «Indica un imponibile maggiore di zero.», «Indica un totale
  maggiore di zero.», «Il totale non può essere inferiore all'imponibile.» – controlla i
  dati dell'ordine.
- «Per i beni da inventariare marca e modello sono obbligatori.»
- «I mesi di garanzia devono essere fra 0 e 240.»
- «Registra prima l'ordine: senza importo il pagamento non ha riferimento.»
- «L'utente indicato non ha il permesso "Acquisti".» – puoi assegnare solo a chi ha il
  permesso Acquisti.
- «Ordine registrato, ma l'inventario non è stato creato: …» – l'ordine è salvato; riprova
  con «Aggiorna l'ordine».
- «Accesso negato» – serve il permesso Acquisti.
