# Servizi interni — un sistema unico per tutti i centri di costo

Deciso con Dennis il 1 novembre 2026. Nasce dal ribaltamento di Cura Ambienti (cc24), ma
diversi servizi della cooperativa hanno chiesto la stessa cosa: **addebitare a un altro
centro di costo il lavoro fatto per lui**. Invece di uno strumento per servizio, uno solo.

Ci sono due esigenze diverse, e due strumenti:

| | Servizi interni | Costi generali |
|---|---|---|
| Cosa | un servizio lavora per un altro | i costi dell'amministrazione |
| Come si misura | ore di lavoro + altri costi descritti | non si misura: percentuale fissa |
| Chi lo scrive | il coordinatore del servizio che lavora | nessuno, ogni mese da solo |
| Da | qualunque centro di costo | cc23 Progettazione - Amministrazione |

## Le decisioni di Dennis (1/11/2026)

1. **Un sistema che valga per tutti.** Nessun listino per servizio: ogni servizio si
   organizza da sé, l'app non conosce i suoi prezzi.
2. **Ore di lavoro a forfait: 18 € l'ora**, uguale per tutti. Va **scritto chiaro**
   dove si inserisce l'addebito, così chi addebita e chi riceve sanno da dove viene il numero.
3. Oltre alle ore, si può aggiungere **un altro costo dicendo cos'è** (materiali, un
   acquisto fatto per l'altro servizio, un noleggio…). Quindi un addebito = **numero di ore
   di lavoro + altri costi**, ognuno con la sua descrizione.
4. **Costi generali:** oggi stanno tutti su cc23. Si dividono fra i servizi con una
   **percentuale fissa** per servizio.
5. **Il visto di chi riceve è informativo:** vede l'addebito, può mettere il visto o
   scrivere che non gli torna, ma l'addebito vale comunque.

## Altre decisioni (1/11/2026, seconda risposta)

- **Cura Ambienti e manutenzioni non cambiano**: restano con le loro tariffe (26 €/h,
  24 €/h le pulizie della Locanda) e con le loro schermate. Il forfait di 18 €/h vale per
  gli addebiti fra gli altri servizi.
- **Percentuali dei costi generali**: Dennis non le ha ancora; serve una sezione dove
  inserirle. **Cura Ambienti partecipa** alla ripartizione.
- **Chi scrive un addebito**: il coordinatore del servizio che ha lavorato, più chi ha il
  permesso Controllo di Gestione.
- Il forfait vale da **inizio 2026** (tabella `forfait_orario`, riga `2026-01-01`): un
  addebito di ottobre, ancora aperto fino al 10 novembre, deve avere il suo prezzo.

## Stato (1/11/2026)

Fatto: addebiti interni (schermata, forfait, altri costi, visto, mail al nuovo addebito e
al «non mi torna», chiusura al 10 del mese dopo) e la sezione **Costi generali** per le
percentuali. Schema: `supabase/servizi_interni.sql`.

Fatto il 2/11/2026: Lavori di Cura Ambienti e Costi delle manutenzioni come sorgenti
automatiche, e il cruscotto del Controllo di Gestione che legge addebiti e quota dei costi
generali (§ Ribaltamento, in fondo). Da fare: addebiti ricorrenti; la mail di riepilogo a fine
mese; la porta nel registro.

## Strumento 1 — Addebiti interni

### L'addebito

| Campo | Note |
|---|---|
| Da | centro di costo che ha lavorato (il "fornitore") |
| A | centro di costo che riceve (il "cliente"), più la struttura se serve |
| Mese / data | competenza |
| Cosa | descrizione libera: cosa è stato fatto |
| Ore di lavoro | numero; valgono **ore × forfait orario** |
| Altri costi | righe con **descrizione + importo**, al costo |
| Visto | informativo: visto / "non mi torna" + nota, chi e quando |
| Origine | a mano, oppure da una schermata che lo genera (sotto) |

- **Forfait orario in una tabella con data di validità** (`forfait_orario`: 18 € da
  inizio 2026). Se un giorno cambia, si aggiunge una riga: gli addebiti passati restano al
  forfait del loro mese. Il valore si mostra sempre accanto alle ore («ore × 18 €/h»).
- **Gli altri costi sono al costo**, senza ricarico: l'addebito sposta un costo, non crea
  un guadagno.
- **Chiusura del mese**: dopo la chiusura un addebito non si modifica, si rettifica nel
  mese successivo. Chi riceve deve poter contare su un numero che non cambia sotto i piedi.

### Come nasce

1. **A mano**: il coordinatore del servizio fornitore, dalla schermata «Addebiti interni»
   in Controllo di Gestione. Sceglie a chi, scrive cosa, ore e altri costi.
2. **Ricorrente**: lo stesso addebito ogni mese (con pausa e chiusura), come le ricorrenze
   di Cura Ambienti.
3. **Dalle schermate che già esistono**: i Lavori di Cura Ambienti e i Costi delle richieste
   di manutenzione diventano addebiti di cc24, senza riscriverli.

### Chi vede cosa

- il **coordinatore del fornitore** scrive gli addebiti del suo servizio e vede quanto ha
  recuperato;
- il **coordinatore del cliente** vede gli addebiti verso il suo servizio, mette il visto o
  scrive che non gli torna; a fine mese riceve una **mail di riepilogo**;
- chi ha il permesso **Controllo di Gestione** vede tutto.

## Strumento 2 — Ripartizione dei costi generali

- Una tabella di **percentuali per servizio**, con data di validità (si cambiano una volta
  l'anno, il passato non si riscrive). La somma deve fare 100%.
- Ogni mese il **totale dei costi di cc23** si divide fra i servizi con quelle percentuali.
- Nei cruscotti ogni servizio vede la riga **«Quota costi generali»**; cc23 la vede come
  recuperata. Il dettaglio di cosa c'è dentro resta su cc23.

## Nei numeri: due righe che si annullano

Ogni addebito interno e ogni quota di costi generali sono una **coppia**: costo su chi
riceve, recupero su chi dà, stessa cifra. Sulla cooperativa intera la coppia si annulla, e i
totali della cooperativa la **escludono** (altrimenti lo stesso costo conterebbe due volte).

**Dove si vede, per fasi:**

- **subito**: i cruscotti (Controllo di Gestione e Costi per struttura) leggono addebiti e
  ripartizione direttamente, come oggi leggono fatture e Lavori;
- **poi**: quando il cruscotto passerà a leggere il registro (`movimento`), gli addebiti ci
  entreranno da **una porta sola** che scrive le due metà insieme (voci interne `SINT` /
  `RINT`, colonna `interna` su `voce_analitica`). Il registro oggi è vuoto: farlo prima
  non farebbe vedere niente a nessuno. Dettagli tecnici in `manutenzioni-piano.md`.

## Ordine di lavoro

1. **Addebiti interni**: tabelle, forfait 18 €, schermata «Addebiti interni» (scrivi,
   vedi, visto), mail di fine mese, chiusura del mese.
2. **Cura Ambienti e manutenzioni** collegati: Lavori e Costi delle richieste diventano
   addebiti di cc24.
3. **Ripartizione di cc23**: percentuali, quota mensile nei cruscotti.
4. **Cruscotti**: entrate e uscite interne per servizio, margine di chi lavora per gli altri.
5. **Registro**: la porta unica, quando il cruscotto lo leggerà.


## Ribaltamento — un solo strumento per tutti (2/11/2026)

Dennis: «facciamo il ribaltamento, e controlla che lo stesso strumento sia usato per Cura
Ambienti (pulizie, sostituzione personale, manutenzioni) e per tutte le casistiche in cui un
servizio ribalta un costo su un altro».

**Lo strumento è l'addebito interno.** Oltre a quelli scritti a mano ora ci sono quelli
**automatici**, con `origine_tipo` sull'addebito:

| Origine | Quando nasce | Righe |
|---|---|---|
| `lavoro_cura_ambienti` | Lavoro **consuntivato** per una struttura (non per un cliente esterno: quello si fattura) | una per figura con ore (ore × tariffa del mese) + «Materiali dedicati» |
| `manutenzione` | ogni costo aggiunto/tolto in una richiesta; **uno per richiesta e per mese** | una per fattura (imponibile, «parte» se divisa), gruppo di ore, spesa |
| (costi generali) | non è un addebito salvato: il cruscotto applica le percentuali di cc23 mese per mese | — |

Decisioni (risposte di Dennis del 2/11):

- diventano **addebiti** veri, nella stessa schermata, con visto e chiusura al 10;
- nascono **subito** e si aggiornano fino al 10 del mese dopo, poi sono fermi;
- **sostituzione personale** = nuova figura dei Lavori di Cura Ambienti con la sua tariffa
  (`tariffa_interna` figura `sostituzione`, **da fissare**: finché manca, i lavori con quelle
  ore non si addebitano e la scheda lo dice);
- manutenzioni: **uno per richiesta al mese**;
- costi generali: **stesso trattamento** nei cruscotti (costo per chi riceve, recupero per cc23).

### Regole

- **Importi alle tariffe di Cura Ambienti**, non al forfait di 18 €/h: gli automatici hanno
  `ore = 0` e tutto nelle righe «altri costi», con la tariffa scritta nella descrizione.
- **Un'unica porta**: `addebito_automatico_riscrivi()` (SQL, `supabase/ribaltamento.sql`)
  scrive testata e righe in una transazione, toglie l'addebito con righe vuote, rifiuta un
  mese chiuso, e **toglie il visto solo se cambiano importi o destinatario**. Chiamata da
  `lib/servizi-interni/automatici.ts`, che non sa niente di tariffe: le righe le calcolano
  `lib/cura-ambienti/ribaltamento.ts` e `lib/manutenzioni/ribaltamento.ts`.
- **Mese dell'addebito**: quello del costo/lavoro se ancora aperto, altrimenti il primo mese
  aperto (si rettifica nel mese seguente). Per le manutenzioni si fissa alla creazione del
  costo (`manutenzione_costo.mese_addebito`); per i Lavori si ricava da `consuntivato_il`.
  Così non cambia da solo col passare dei giorni.
- **Mese chiuso**: un costo di manutenzione non si toglie più (409); un Lavoro consuntivato
  per una struttura non si modifica più (`lavoroFermo`) e di notte diventa `addebitato`
  (unico posto che mette quello stato: `segnaLavoriAddebitati`).
- Struttura **senza centro di costo** o con centro **cc24**: niente addebito, il costo resta
  su Cura Ambienti e la schermata lo dice.
- Dalla schermata Addebiti interni gli automatici **non si modificano né si tolgono** (409 in
  API, bottoni nascosti): si correggono all'origine. Niente mail a ogni aggiornamento.
- Se il ribaltamento fallisce al salvataggio, il costo/lavoro resta salvato, la risposta porta
  un avviso e il **giro notturno** `app/api/cron/ribaltamento` (03:45 UTC) riallinea i mesi
  aperti. Idempotente.

### Nei numeri

- **Cruscotto del Controllo di Gestione**: per ogni centro `interniRicevuti` (addebiti
  ricevuti + quota costi generali) e `interniRecuperati` (addebitati agli altri); il costo del
  centro è `costoCentro()` = fatture + diretti + ricevuti − recuperati, e così anche
  `mensileCosti`. Sulla cooperativa la somma è uguale alle sole fatture. Costi generali: base
  = fatture di cc23 del mese (di tutta la cooperativa anche per il coordinatore), versione delle
  percentuali valida a fine mese.
- **Costi per struttura**: invariato (legge già Lavori e costi delle manutenzioni per
  struttura). Non legge gli addebiti, quindi niente doppioni.
- **Registro** (`movimento`): ancora vuoto, nemmeno le fatture ci sono. Gli addebiti ci
  entreranno quando il cruscotto passerà a leggerlo (voci `SINT`/`RINT`): il punto unico da
  cui partire sono gli addebiti interni, automatici compresi.
