---
area: Timbrature (Risorse Umane)
descrizione: Per le Risorse Umane e i responsabili — cruscotto dei fogli ore di tutti, orari contrattuali, responsabili e abilitazioni, ore per progetto.
pagine:
  - percorso: /risorse-umane/timbrature
    titolo: Fogli ore da validare
    accesso: [permesso:Timbrature HR]
    cosa: Cruscotto dei fogli ore di tutti i dipendenti abilitati, con validazione, riapertura del mese e variazioni d'orario.
  - percorso: /risorse-umane/timbrature/responsabili
    titolo: Responsabili e abilitazioni
    accesso: [permesso:Timbrature HR]
    cosa: Chi compila il foglio ore e chi lo controlla, per tutte le persone in un solo elenco.
  - percorso: /risorse-umane/timbrature/progetti
    titolo: Ore per progetto
    accesso: [permesso:Timbrature HR, responsabile-timbrature]
    cosa: Ore registrate sui progetti in un periodo, per la rendicontazione dei bandi.
---

# Timbrature — Risorse Umane

Questa guida è per chi ha il permesso **Timbrature HR** e, per la parte «Ore per progetto»,
anche per i responsabili. Come si compila il foglio ore, e come un responsabile valida i
fogli dei suoi collaboratori, è spiegato nella guida **Timbrature**.

## Come entro nel cruscotto?

Da [Risorse Umane](/risorse-umane), card **«Cruscotto Timbrature»**, oppure direttamente da
[Fogli ore da validare](/risorse-umane/timbrature).

Serve il permesso **Timbrature HR** (si assegna dal pannello Permessi). Senza permesso la
pagina rimanda alla Home.

È la stessa pagina che usano i responsabili, ma con le Risorse Umane si vede **«Vista Risorse
Umane: tutti i dipendenti»** e compaiono comandi in più: «Sincronizza da anagrafica»,
«Riapri», «Variazioni orario» e il bottone **«Responsabili →»**.

## Chi compare nell'elenco?

Chi ha **«Timbratura attiva»** sulla propria scheda in Risorse Umane. Accanto a ogni nome:
lo stato del mese, le ore fatte su quelle previste, lo scostamento del mese intero, e i
bottoni **«PDF»** ed **«Excel»** quando il foglio è già stato prodotto.

L'etichetta **«non più attivo»** indica chi non è più abilitato: resta in elenco per poter
chiudere il suo ultimo mese.

Gli stati sono: **In compilazione**, **Da validare**, **Attesa conferma**, **Confermato**,
**Contestato**.

Con **«Ordina per»** → **«flessibilità»** si vedono in cima i saldi di flessibilità più
negativi. Il saldo negativo non blocca niente: serve per parlarne con la persona.

## Come abilito una persona alle timbrature?

Il modo più rapido è la pagina [Responsabili e abilitazioni](/risorse-umane/timbrature/responsabili)
(vedi sotto). In alternativa, dalla scheda della persona in Risorse Umane, sezione
**Timbrature**:

1. Metti **«Timbratura attiva (accesso al foglio ore)»** su Sì.
2. Se la persona non timbra giorno per giorno, metti anche **«Non timbra (foglio ore da
   orario teorico)»** su Sì. Le due spunte vanno **insieme**.
3. Compila **«Referente foglio ore (mail)»** con la mail aziendale del suo responsabile.
   Se lo lasci vuoto, il foglio lo validano le Risorse Umane.
4. Salva la scheda.

Regole da sapere:

- Si abilita **solo chi lavora**. Conta il «Tipo di rapporto» della scheda: i soci non
  lavoratori (volontari, fruitori, sovventori) non hanno foglio ore anche con la spunta. Se
  il tipo di rapporto è vuoto, la persona viene considerata lavoratore solo se ha un tipo di
  contratto o una matricola.
- Se il **rapporto è chiuso**, l'accesso si spegne da solo anche con la spunta accesa.
- Serve la **mail aziendale** sulla scheda: è con quella che la persona entra.
- Bisogna impostare l'**orario** (vedi «Come imposto il monte ore?»), altrimenti le ore
  previste sono zero.

Se hai cambiato le schede e il cruscotto non è aggiornato, premi **«Sincronizza da
anagrafica»**: alla fine leggi quante schede sono state esaminate, aggiunte, riattivate o
disattivate, e gli eventuali avvisi (spunta attiva ma rapporto chiuso, senza mail
aziendale).

## Come imposto il monte ore o un cambio d'orario?

Il monte ore decide le ore previste di ogni giornata: da lì dipendono le giornate complete,
i solleciti, lo scostamento e la flessibilità.

1. Nel cruscotto premi **«Controlla»** sulla persona.
2. Nella scheda trovi il riquadro **«Variazioni orario»**, con lo storico delle variazioni
   («dal …», ore dei giorni, totale settimanale, motivo, chi l'ha registrata, lettera).
3. Scrivi le ore di ogni giorno, da **Lun** a **Dom**.
4. Scegli la **«Decorrenza»**: il giorno da cui vale il nuovo orario (può essere anche a metà
   mese).
5. Scrivi il **«Motivo»** (es. passaggio a part-time).
6. Se c'è, carica la **«Lettera di variazione firmata»**: finisce nella cartella personale
   della persona.
7. Premi **«Registra variazione»**.

Per ogni giorno vale la variazione più recente che parte da quella data o da prima.
**Attenzione alla decorrenza**: una data sbagliata cambia le ore previste anche dei mesi
passati. Se hai sbagliato, premi **«elimina»** sulla variazione: da quel giorno torna a
valere quella precedente.

Se leggi **«Nessun orario registrato»**, la persona non ha monte ore: nessuna giornata
risulta mai incompleta e non partono solleciti.

## Come imposto l'orario teorico di chi non timbra?

Per chi ha «Non timbra», dentro «Variazioni orario» compare il riquadro **«Orario
teorico»**: da qui si genera il mese con il bottone «Compila …».

1. Scrivi **«Ingresso»**, **«Uscita»** e il **«Servizio»**.
2. Per la pausa pranzo premi **«+ aggiungi una fascia (pausa pranzo)»** e scrivi la seconda
   fascia.
3. Tocca i giorni in cui vale (Lun, Mar, …).
4. Premi **«Applica ai giorni scelti»**. Sui giorni scelti l'orario precedente viene
   sostituito, non sommato.
5. Correggi i giorni diversi: la **×** accanto a una fascia la toglie.
6. Imposta decorrenza e motivo e premi **«Registra variazione»**.

Nei giorni coperti dall'orario teorico le ore non si scrivono più: la casella diventa grigia
e le ore si calcolano dalle fasce.

Poi, nella stessa scheda, il riquadro **«Foglio ore da orario teorico»** permette di
premere **«Compila …»** o **«Rigenera»** per quella persona (vedi la guida Timbrature, «Non
timbro»).

## Come valido o correggo un foglio ore?

Come un responsabile (vedi la guida Timbrature, parte «Per i responsabili»): **«Controlla»**,
correggi con **«+ riga»**, **«Modifica»**, **«Elimina»**, poi **«✓ Valida il foglio ore e
invia al dipendente»**.

Le Risorse Umane vedono **tutti** e possono validare al posto di un responsabile assente.
Non puoi validare il tuo foglio ore.

Le righe che scrivi restano segnate **«inserita dal responsabile»**.

## Come riapro un mese già chiuso?

Solo le Risorse Umane possono farlo.

- Dall'elenco: **«Riapri»** (compare sui fogli «Attesa conferma» e «Confermato»).
- Dalla scheda della persona: **«Riapri il mese al dipendente»**.

Conferma. Il mese torna **«In compilazione»** e il percorso di validazione ricomincia da
capo.

## Cosa significa l'avviso «Senza referente foglio ore in anagrafica»?

Sono persone che non hanno un referente sulla scheda. I loro fogli non arrivano a nessun
responsabile e restano in carico alle Risorse Umane. Per assegnarli usa
[Responsabili e abilitazioni](/risorse-umane/timbrature/responsabili).

## Il foglio di una persona non si archivia: cosa faccio?

Se la persona non è in anagrafica Risorse Umane, la validazione si ferma, non viene archiviato
niente e alle Risorse Umane arriva una mail **«… non è in anagrafica: foglio ore bloccato»**.
Inserisci o correggi la scheda (la mail aziendale deve essere quella con cui la persona
entra), poi fai validare di nuovo.

---

# Responsabili e abilitazioni

## A cosa serve questa pagina?

[Responsabili e abilitazioni](/risorse-umane/timbrature/responsabili) mostra in un solo
elenco **chi compila il foglio ore e chi lo controlla**. Ci si arriva dal cruscotto con il
bottone **«Responsabili →»**. Solo Risorse Umane.

Non è un secondo archivio: scrive sugli stessi campi della scheda in Risorse Umane.

Ha due schede:

- **«Chi valida chi»**: le persone con le timbrature attive, raggruppate per responsabile.
  Il gruppo **«Risorse Umane»** raccoglie chi non ha un responsabile.
- **«Tutte le persone»**: tutti, con i filtri **«Tutti»**, **«Abilitati»**, **«Non
  abilitati»**, **«Non timbrano»**.

In alto c'è **«Cerca un nome…»**.

## Cosa c'è nel riquadro «Da sistemare»?

Compare solo se c'è qualcosa da sistemare. Ogni riga dice il problema e cosa fare, con il
bottone **«Vedi chi»** per vedere le persone. I casi:

- **un referente che non esiste**: nessuno riceverà il foglio, scegli il responsabile giusto;
- **senza «Tipo di rapporto»**: finché manca non si possono attivare le timbrature; si
  sceglie nella scheda in Risorse Umane;
- **con la spunta delle timbrature ma senza un rapporto di lavoro**: l'accesso è già spento,
  puoi togliere la spunta per fare ordine;
- **senza orario teorico**: le ore previste sono zero e non parte nessun sollecito; si
  imposta dal cruscotto;
- **con timbrature attive ma senza mail aziendale**: non possono entrare;
- **con rapporto chiuso e spunta ancora attiva**: l'accesso è già spento;
- **schede modificate fuori dall'app**: premi **«Riallinea»**.

## Come cambio il responsabile di una persona?

1. Tocca la riga della persona.
2. Sotto **«Chi controlla il suo foglio ore»** cerca il responsabile per nome o mail. Chi è
   già responsabile di qualcuno ha la nota «già responsabile».
3. Oppure premi **«Lo validano le Risorse Umane»**.
4. Premi **«Salva»**.

Per un **responsabile nuovo** basta cercarlo qui: da quel momento vede la sua squadra in
«Fogli ore da validare». Una persona non può controllare il proprio foglio ore.

Nella stessa finestra ci sono le levette **«Timbrature attive»** e **«Non timbra»**. «Non
timbra» funziona solo insieme a «Timbrature attive». La levetta «Timbrature attive» non si
accende per chi non è un lavoratore o non ha il tipo di rapporto.

## Come cambio il responsabile a più persone insieme?

1. Premi **«Seleziona più persone»**.
2. Tocca le persone, oppure **«Prendi tutti»** su un gruppo.
3. Nella barra in fondo premi **«Cambia responsabile»**, scegli e premi **«Conferma»**.

Dalla stessa barra, **«Attiva timbrature»** attiva le timbrature alle persone scelte che
sono lavoratori; le altre vengono saltate e il messaggio lo dice. **«Fine»** chiude la
selezione.

---

# Ore per progetto

## Dove vedo le ore fatte su ogni progetto?

Dal cruscotto, bottone **«Ore per progetto →»**, oppure da
[Ore per progetto](/risorse-umane/timbrature/progetti).

Possono entrare le Risorse Umane (vedono tutti) e i responsabili (vedono solo i propri
collaboratori).

1. Scegli il periodo con **«Dal»** e **«Al»**, oppure con i bottoni **«mese»**, **«anno»**,
   **«anno scorso»**.
2. In alto leggi **«Ore totali»**, **«Su un progetto»** e **«Progetti con ore»**.
3. Tocca un progetto per vedere le ore di ogni persona.

Contano solo i servizi che chiedono il progetto (oggi **Progettazione**). La riga **«Senza
progetto»** sono ore di progettazione non attribuite a un bando: si sistemano dalla scheda
della persona nel cruscotto, correggendo la riga.

## Come aggiungo o chiudo un progetto?

Non si fa da questa pagina: l'elenco dei progetti non si cambia dall'app. Chiedi a chi
gestisce l'app. Un progetto chiuso sparisce dal menu, ma le ore già registrate restano.

## Problemi comuni

**«Accesso negato»** o la pagina torna alla Home
Manca il permesso **Timbrature HR**. Lo assegna l'amministrazione dal pannello Permessi.

**«Nessun dipendente abilitato. …»**
Nessuna scheda ha «Timbratura attiva». Mettila sulle schede, poi premi «Sincronizza da
anagrafica».

**«Il monte ore settimanale non puo' essere zero: indica le ore di almeno un giorno.»**
Nella variazione d'orario scrivi le ore di almeno un giorno.

**«Indica la data di decorrenza»**
Scegli la data da cui vale la variazione.

**«Scegli almeno un giorno» / «Scegli il servizio su ogni riga» / «L'uscita (…) deve essere dopo l'ingresso (…)»**
Nell'orario teorico: tocca almeno un giorno, scegli il servizio su ogni fascia, controlla
gli orari.

**«File troppo grande (max … MB)»**
La lettera è troppo pesante: riducila (per esempio scansione in bianco e nero).

**«… timbra: le ore si inseriscono giorno per giorno. Se non deve timbrare, metti la spunta "Non timbra" sulla sua scheda in Risorse Umane.»**
«Compila …» funziona solo per chi ha «Non timbra».

**«Il mese ha ancora giornate scoperte: …»**
Il mese non si può chiudere in anticipo con giornate vuote. Completa le giornate o aspetta
la chiusura del mese.

**«Il foglio ore e gia definitivo.»**
Il foglio è già confermato. Per cambiarlo va prima riaperto con «Riapri».

**«Non puoi validare il tuo foglio ore: deve farlo il tuo responsabile o le Risorse Umane.»**
Il proprio foglio lo valida un'altra persona.

**«Foglio validato e mail inviata, ma la conversione in PDF non è riuscita: l’allegato manca.»**
La mail al dipendente è partita senza PDF. Il foglio è comunque validato.

**«Sessione Microsoft scaduta: esci e rientra nell'app.»**
Esci dall'app e rientra, poi riprova.

**«Non hai i permessi sul sito Risorse Umane. Contatta Amministrazione.»**
Ti mancano i diritti sull'archivio delle Risorse Umane: scrivi all'amministrazione.

**«Al massimo … persone per volta: dividi la selezione.»**
Hai scelto troppe persone insieme: fai la modifica in più volte.

**«Il referente deve avere un account @…: è con quello che entra a validare.»**
Il responsabile deve avere una mail della cooperativa. Sceglilo dalla ricerca.

**«… manca il "Tipo di rapporto". Va scelto nella scheda in Risorse Umane prima di attivare le timbrature.»**
Apri la scheda della persona in Risorse Umane e scegli il tipo di rapporto.

**«Il periodo finisce prima di iniziare»** (Ore per progetto)
La data «Al» viene prima di «Dal»: correggila.
