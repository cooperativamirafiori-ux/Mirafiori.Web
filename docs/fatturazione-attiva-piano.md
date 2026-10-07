# Fatturazione attiva — piano della sezione

Riunione del 15 settembre 2026 (Andrea Granato, Claudia Carena, Dennis Maseri), 54 minuti.
Questo documento tira fuori quel che è emerso e propone come strutturare la sezione dell'app.
È una proposta da verificare con Andrea nel dettaglio, riga per riga: il processo lo conosce lui.

---

## 1. Cosa è emerso

### I numeri

- Nel 2025 circa **1.000 fatture attive**: 652 alla pubblica amministrazione (592 fatture + 60 note di credito), 322 a privati. Stima 2026 per tenersi larghi: **750**.
- La PA pesa per due terzi ed è la parte che costa più tempo. Il motivo è la frammentazione imposta dagli enti:
  - lo stesso intervento si fattura in parte al Comune e in parte all'ASL (40/60, 50/50, 100% Comune o 100% ASL, cambia per ragazzo);
  - una fattura **per ogni ragazzo**, non più una per servizio;
  - il Comune di Torino è diviso in **4 quadranti** (Nord-Est, Nord-Ovest, Sud-Est, Sud-Ovest) e ogni quadrante vuole la sua fattura. Un servizio con 20 ragazzi che prima faceva 1 fattura oggi ne fa 4, e 8 se c'è la compartecipazione ASL.

### Frase chiave di Andrea

> «Il lavoro grosso non è fare una fattura, il lavoro grosso è recuperare tutti i dati per poter fare la fattura.»

Dennis: circa il 90% del suo tempo va a rincorrere persone e a fare preventivi. La fattura in sé è l'ultimo minuto.

### I flussi oggi, uno per uno

| Flusso | Chi chiede | Preventivo | Ore | Fattura | Criticità |
|---|---|---|---|---|---|
| **Privati – interventi educativi** | referente del servizio (Stefania, Ali…) | Andrea lo fa, la famiglia lo restituisce **firmato con data** | mensili dal servizio | 1 al mese a privato | recupero crediti (ora Alessandro) |
| **Privati – Locanda** | operatori, via WhatsApp | no | – | spot | 70% clienti nuovi con dati mancanti → **già risolto** dalla sezione Richiesta Fattura, che però non era ancora stata messa in uso |
| **Privati – spot** | Luca | no | – | spot | nessuna |
| **Privati – servizi in convenzione** (Città Attiva, Casa HOT, Caritas…) | referente attiva il servizio con tariffa oraria | no, accordo iniziale | mensili | 1 al mese | nessuna |
| **PA – comunità** | coordinatore: «inseriamo una ragazzina, fai il preventivo» | Andrea, con prestazioni aggiuntive da concordare | mensili per ragazzo | 1 per ragazzo per ente pagante | **autorizzazione assente o tardiva**, buono d'ordine ASL, controllo ore Comune |
| **PA – interventi educativi individuali / territoriali** | coordinatore | Andrea; l'autorizzazione dura **6 mesi**, va rinnovata in anticipo | mensili per ragazzo | 1 per ragazzo per quadrante per ente | scadenze non tracciate, preventivi «inutili» a prezzo e ore imposti dal Comune |

### Le regole della PA che il software deve conoscere

1. **Comune di Torino e ASL di Torino**: tariffa oraria imposta, non trattabile, «sempre quella». Il Comune decide anche le ore.
2. **Enti fuori Torino**: si chiede un prezzo più alto, mai contestato. Andrea sa già la cifra; serve un **tariffario** ufficiale deciso dal CDA (lui lo chiede da tempo).
3. **Autorizzazione di inserimento** (Comune / UMVD / servizio sociale): dice cosa è stato riconosciuto del preventivo (ore, prestazioni aggiuntive, accompagnamenti). Per l'amministrativo dell'ente «quel che c'è scritto è legge»: senza autorizzazione il ragazzo non esiste, con 3 ore scritte si pagano 3 ore. Le UMVD si riuniscono una volta al mese.
4. **Buono d'ordine ASL**: la fattura elettronica deve riportare il codice del buono. Due ASL fanno un buono annuale (es. 50.000 € per tutto il 2026, rettificato a fine anno); tutte le altre uno al mese per ragazzo, e non arriva da solo. Lo emette un ufficio diverso da chi controlla le fatture.
5. **Controllo ore del Comune**: per circolare, prima di emettere si mandano le ore del mese, il Comune verifica e risponde «puoi fatturare». Spesso non risponde: il ritardo si è spostato a monte e non produce più interessi di mora.
6. Conseguenza: oggi Andrea tiene a mente decine di «situazioni da risolvere» (autorizzazione mancante, buono mancante, ore contestate, pregresso da fatturare quando si sblocca) senza uno strumento.

### Decisioni prese in riunione

- **I preventivi li faranno i responsabili di servizio**, non più Andrea. Serve uno strumento che faccia i conti al posto loro con **tariffe bloccate** («2+2 fa 4 e non possono scrivere 5»). Andrea aveva già provato con un Excel a tendine, poi abbandonato; Access scartato perché solo in ufficio.
- **Il tariffario lo fissa il CDA** (costo orario, prestazione aggiuntiva, rimborsi km…). I servizi decidono le ore, non i prezzi.
- **Andrea deve stare nelle comunicazioni**: vede il preventivo quando è confermato e sa quanto fatturare. Ogni coordinatore si organizza col proprio ente, ma il tracciamento è unico.
- **Senza autorizzazione non si inizia.** Claudia porterà al prossimo CDA un regolamento interno con sanzione per chi inserisce senza autorizzazione. Alternativa proposta da Andrea: «per quella data avete tutta la documentazione? Altrimenti inseriamo la settimana dopo».
- **Le ore mensili vanno caricate in una piattaforma**, non su schede Excel da duplicare e svuotare ogni mese.
- **Locanda**: partenza della sezione Richiesta Fattura dal 16 settembre. Andrea scrive a Cinzia e Michela; Dennis va in Locanda e mette il link nel telefono di servizio (gruppo WhatsApp «Fatturazione» fissato in alto). Serve la **versione iPhone** dell'app (Andrea, Claudia, la Presidente).
- **Rubrica clienti**: Andrea aggiunge a mano i clienti nuovi dell'ultimo mese; d'ora in poi la rubrica si aggiorna da sola tramite le richieste.
- I coordinatori avranno un **report mensile costi/ricavi del proprio servizio** (già nel piano del controllo di gestione).
- Prossima settimana: Dennis e Andrea scendono nel dettaglio del processo, **per iscritto**.

### Casi aperti citati

- Due ragazzi fermi da marzo/aprile 2026 per prestazioni aggiuntive fatte e non riconosciute (uno servizio Giulia, uno Coop).
- Un ragazzo nuovo con autorizzazione presente ma senza buono ASL.

---

## 2. Il principio del software

Ribaltare il flusso: oggi Andrea **va a cercare** i dati, domani i dati **arrivano a lui** già completi, e l'app gli dice cosa fatturare, a chi, per quante ore, con quale buono. Il rapporto con gli uffici della PA (sollecitare buoni e autorizzazioni) resta suo — il coordinatore non sa nemmeno cosa siano — ma anche quello va tenuto in una lista visibile, non in testa.

Tre oggetti bastano a descrivere tutto: il **Preventivo**, l'**Intervento** (il contratto in essere: un ragazzo, un servizio, uno o più enti paganti, un periodo di validità) e la **Fattura da emettere** (generata ogni mese dall'intervento più le ore). Gli **impedimenti** (autorizzazione, buono, controllo ore) sono stati dell'intervento, non del singolo mese.

```
Tariffario CDA ──► Preventivo ──► (accettato) ──► Intervento ──► Ore del mese ──► Fattura da emettere ──► Emessa in Fattura SMART
                                                      │                                 ▲
                                                      ├── autorizzazione (chi, quanto, fino a quando)
                                                      ├── buono d'ordine ASL (codice, importo, periodo)
                                                      └── controllo ore Comune (ok / in attesa)
```

---

## 3. Le entità

### 3.1 Tariffario (SharePoint, lista amministrata dal CDA)

| Campo | Note |
|---|---|
| Voce | es. «Retta comunità», «Prestazione aggiuntiva», «Accompagnamento», «Rimborso km» |
| Ente / gruppo enti | Comune di Torino, ASL Città di Torino, Fuori Torino, Privati |
| Tipo intervento | comunità, territoriale, educativa individuale… |
| Prezzo | € / unità |
| Unità | ora, giornata, km, forfait |
| Valido dal / al | storicizzato: un prezzo non si sovrascrive, se ne apre uno nuovo |
| Regime IVA | aliquota o esenzione (stesso schema di `REGIMI_NOTI` in `types/fatture.ts`) |

Solo lettura per i servizi; modifica riservata ad Amministrazione. Il preventivo può scegliere solo voci qui presenti.

### 3.2 Anagrafica enti paganti

Estensione dell'anagrafica clienti già importata da Fattura SMART. Per gli enti pubblici servono in più: codice IPA / codice destinatario SDI, **quadrante** (per il Comune di Torino), se richiede buono d'ordine, se richiede controllo ore preventivo, se il buono è annuale o mensile, referente amministrativo (chi controlla le fatture) e referente impegni di spesa (chi emette i buoni) — sono persone diverse.

### 3.3 Utente seguito (il ragazzo)

Solo il minimo indispensabile e con accesso ristretto: identificativo interno, iniziali o codice, servizio di appartenenza, quadrante o distretto, ente/i paganti e percentuali di riparto. Niente dati sanitari. È la chiave che tiene insieme preventivo, autorizzazione, buono, ore e fatture.

### 3.4 Preventivo

| Campo | Note |
|---|---|
| Numero | `PR-0001`, progressivo continuo come `RF-` e `INV-` |
| Servizio / centro di costo | dalla lista Centri di Costo |
| Compilato da | il responsabile del servizio |
| Destinatario | ente/i paganti o famiglia, con riparto % |
| Utente | facoltativo per i privati spot, obbligatorio per PA e interventi educativi |
| Righe | voce di tariffario × quantità (ore/settimana, giornate, km); il prezzo arriva dal tariffario e **non è modificabile** |
| Periodo | dal / al (per gli individuali PA: 6 mesi) |
| Stato | bozza → inviato → **accettato** / modificato / rifiutato / decaduto |
| Esito | quanto è stato riconosciuto (ore, prestazioni), data accettazione, documento firmato o mail dell'ente allegata |
| Generato | PDF con intestazione della cooperativa, inviabile via Graph dal mittente giusto con Andrea in copia |

Regola: un preventivo **inviato** senza esito da N giorni compare come promemoria al responsabile. Quando passa ad **accettato**, l'app propone di aprire l'Intervento con i valori riconosciuti (non quelli chiesti).

### 3.5 Intervento (il cuore)

| Campo | Note |
|---|---|
| Utente, servizio, preventivo di origine | |
| Enti paganti e % | uno o più (Comune 40 / ASL 60) |
| Voci e quantità riconosciute | dal preventivo accettato o dall'autorizzazione |
| Data inizio, data fine autorizzazione | scadenza tracciata, avviso 45 giorni prima per rifare il preventivo |
| **Autorizzazione** | stato (assente / richiesta / ricevuta), protocollo, data, cosa riconosce, allegato |
| **Buono d'ordine ASL** | tipo (annuale/mensile), codice, importo, periodo coperto, residuo; stato del mese corrente |
| **Controllo ore Comune** | per mese: inviato il / ok il / in attesa |
| Stato | attivo, sospeso (impedimento), chiuso |
| Note e diario | «sentito UMVD il 12/09, dicono entro fine mese» — il posto dove oggi Andrea tiene tutto a mente |

Un intervento **attivo senza autorizzazione** è visibile a colpo d'occhio, a Andrea e al coordinatore. È anche la base del regolamento che Claudia porterà in CDA: la data di inserimento e la data di autorizzazione sono registrate.

### 3.6 Ore del mese

Sostituisce le schede Excel duplicate ogni mese. Per ogni intervento attivo l'app genera da sé la riga del mese; il servizio inserisce le ore (o giornate) per voce. Niente più «svuotare e cambiare il mese». Chi entra o esce compare o sparisce da solo.

Dove esistono già le timbrature per progetto (Progettazione), si valuta se agganciarle; per comunità e territoriale le ore fatturabili sono diverse dalle ore lavorate, quindi restano un dato a sé.

Dopo la chiusura del mese, il responsabile **conferma** le ore del servizio: da lì partono le fatture da emettere.

### 3.7 Fattura da emettere (coda di Andrea)

Generata dall'app, una riga per ogni combinazione intervento × ente pagante × mese, con: destinatario, quadrante, righe già valorizzate (ore × tariffa × %), IVA, codice buono d'ordine da riportare, stato del controllo ore. Stato: **pronta** / **bloccata** (con il motivo: manca autorizzazione, manca buono, ore non confermate, controllo Comune in attesa) / **emessa** (numero e data della fattura in Fattura SMART) / **annullata**.

Andrea lavora da qui. Quando emette, scrive numero e data: il Registro del controllo di gestione riceve il ricavo con il suo centro di costo. Il **pregresso bloccato** che oggi si tiene a mente diventa il filtro «bloccate da più di 30 giorni».

Le richieste spot (Locanda, Luca) entrano nella stessa coda dalla sezione Richiesta Fattura già esistente, così Andrea ha **un solo posto** da guardare.

---

## 4. Le schermate

Tutte usabili da telefono, come il resto dell'app.

**Responsabile di servizio**
- *I miei interventi*: elenco per servizio con semaforo (verde autorizzato, giallo in attesa, rosso senza autorizzazione o scaduto) e scadenze in arrivo.
- *Nuovo preventivo*: modulo a tendine dal tariffario, totale calcolato, PDF, invio.
- *Ore del mese*: le righe già pronte, si scrivono solo i numeri, poi «Conferma il mese».
- *Il mio servizio*: il report costi/ricavi mensile (dal controllo di gestione).

**Amministrazione (Andrea)**
- *Da fatturare*: la coda con filtri pronta / bloccata / emessa; azione «Segna emessa».
- *Impedimenti*: tutti gli interventi con un problema aperto, raggruppati per ente e per tipo (autorizzazione, buono, controllo ore), con il diario dei solleciti.
- *Tariffario* ed *Enti* (con il CDA per il tariffario).

**Avvisi automatici (mail via Graph, come le validazioni timbrature)**
- Al coordinatore: preventivo senza esito, autorizzazione in scadenza, ore del mese non confermate.
- Ad Andrea: mese confermato → fatture pronte; buono mensile mancante; controllo ore fermo da X giorni.

---

## 5. Dove stanno i dati

Coerente con il resto dell'app e con il piano del controllo di gestione:

- **SharePoint** (sito Controllo Gestione): Tariffario, Enti paganti (estensione anagrafica clienti), Preventivi, Interventi, allegati (PDF preventivi, autorizzazioni, buoni). Sono anagrafiche e moduli, poche migliaia di righe.
- **Supabase**: Ore del mese e Fatture da emettere, che crescono (750 fatture/anno × righe) e vanno aggregate; e il collegamento al Registro unico per il ricavo. Collegamento sempre per codice centro di costo.
- **Fattura SMART** resta il programma che emette la fattura elettronica: l'app prepara tutto e registra l'emissione, non parla con lo SDI. Se il tracciato di import lo consente si valuta in seguito un export da caricare.
- Permessi: preventivi e ore per servizio tramite la lista Autorizzazioni (il responsabile vede solo il suo centro di costo); coda e impedimenti a chi ha il permesso «Fatturazione»; utenti seguiti con il minimo indispensabile e log attività senza dati personali.

---

## 6. Ordine di realizzazione

1. **Tariffario + preventivi con tariffe bloccate** — è la decisione presa in riunione e sgrava Andrea subito. Servono prima le tariffe dal CDA.
2. **Interventi con stati di autorizzazione e buono** — rende visibile il problema che oggi vive nella memoria di Andrea e dà i dati al regolamento CDA.
3. **Ore del mese** al posto delle schede Excel, con conferma del responsabile.
4. **Coda «Da fatturare»** generata dalle ore, unificata con Richiesta Fattura.
5. **Avvisi automatici** e aggancio al Registro del controllo di gestione.

Prima di scrivere codice: una o due sessioni scritte con Andrea per verificare i casi reali (un ragazzo in comunità con ASL fuori Torino, un territoriale su due quadranti, un privato, una convenzione tipo Caritas) contro questo schema.

---

## 7. Domande da chiarire con Andrea

- Elenco completo degli enti paganti e per ciascuno: buono annuale o mensile? controllo ore sì/no? chi è il referente amministrativo e chi fa gli impegni di spesa?
- Le percentuali di riparto Comune/ASL: dipendono dal tipo di intervento o si decidono caso per caso? Sono scritte nell'autorizzazione?
- Il preventivo PA «inutile» (prezzo e ore imposti dal Comune): serve comunque un documento formale o basta una conferma? Va prodotto lo stesso, ma può essere precompilato al 100%.
- Cosa succede alle note di credito (60 nel 2025): da cosa nascono, come le vuole tracciare?
- Per i privati, la firma sul preventivo: basta la scansione allegata o si vuole DocuSign (già configurato per le prestazioni occasionali)?
- Quali sono le tariffe attuali di fatto, così il CDA parte da numeri reali?
- Fattura SMART: esiste un import di fatture da file? Se sì, in che tracciato?
