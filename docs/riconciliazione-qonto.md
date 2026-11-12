# Riconciliazione Qonto ↔ fatture

Decisa con Dennis il 1° novembre 2026. Prima di questa data l'app sapeva che una fattura era
pagata in due modi: o lo dichiarava la fattura (carta, contanti, addebito diretto), o qualcuno
premeva *Pagata* (o la richiesta di bonifico inviata dall'app veniva approvata su Qonto).
Da qui in avanti **il pagato si controlla da quello che è uscito su Qonto**.

## Le regole (parole di Dennis, 1/11/2026)

1. **Un'uscita su Qonto chiude la fattura che paga**, quando l'abbinamento è sicuro. Se l'app non
   è sicura, non tocca niente: l'uscita resta in **Da abbinare** e si abbina a mano.
2. **Il centro di costo lo dice Qonto**: la fattura pagata da un sottoconto `ccN · …` va su `ccN`.
   Se la fattura aveva già un altro centro di costo (un coordinatore l'aveva presa), **vince Qonto**
   e la differenza resta scritta sulla riga. Pagata dal conto principale: il centro di costo resta
   quello della fattura.
3. **Fatture «già pagate» (carta, e dal 1/11 anche contanti) senza movimento su Qonto** → in coda
   *Da pagare* di Claudia con l'avviso «La fattura dice che è già pagata, ma su Qonto non trovo il
   movimento». Il movimento di solito arriva prima della fattura; se arriva dopo (una carta resta
   «in attesa» qualche giorno), al giro dopo la fattura si chiude da sola.
   Vale per le fatture **datate dal 1° novembre 2026**: prima Qonto non era il conto di tutte le
   spese e le vecchie regole restano.
4. **RID, SDD, domiciliazioni restano come sono** («escono da sole»): non sono ancora su Qonto.
5. **Niente più contanti dal 1° novembre 2026.** Una fattura con «contanti» (MP01) datata da quel
   giorno si tratta come una carta (punto 3).
6. **Prima di inviare un bonifico a Qonto**: se su Qonto c'è già un'uscita non abbinata compatibile
   con quella fattura (stesso importo, stesso fornitore), l'invio si ferma e lo dice.
7. **Amazon**: ogni centro di costo compra con la sua carta, e le fatture Amazon portano il centro di
   costo nei riferimenti (causale / numero d'ordine). L'app lo legge (`cc_indicato`) e lo usa due
   volte: per scegliere fra due fatture dello stesso importo, e per non abbinare in automatico se il
   centro di costo della fattura e il sottoconto della carta non coincidono.

## Quando l'abbinamento è «sicuro»

Tutte insieme, altrimenti si va a mano:

- **stesso importo, al centesimo**;
- **fornitore riconosciuto**: per i bonifici dall'IBAN della controparte (quello della fattura o
  quello noto del fornitore); per le carte dal nome della controparte su Qonto confrontato con la
  ragione sociale, oppure da un abbinamento fatto a mano in passato (l'app impara:
  tabella `qonto_controparte`) — **oppure stessa data**: importo al centesimo e movimento dello
  stesso giorno della fattura bastano anche se il nome non torna (Dennis, 12/11/2026: la carta
  scrive «Carrefour», la fattura «GS S.p.A.»);
- **date vicine**: il movimento fra 45 giorni prima e 180 giorni dopo la data della fattura;
- **un solo candidato da tutte e due le parti**: quel movimento ha una sola fattura possibile e
  quella fattura ha un solo movimento possibile. Fra più fatture dello stesso importo decide il
  centro di costo indicato in fattura, se coincide con il sottoconto;
- **bonifico cumulativo**: un bonifico a un fornitore riconosciuto dall'IBAN che salda esattamente
  più fatture aperte dello stesso fornitore, e una sola combinazione torna.

Si abbinano solo movimenti **contabilizzati**: quelli in attesa possono cambiare o sparire.

Le fatture già segnate pagate (a mano, o da una richiesta di bonifico approvata) dal 1/11 in poi
si **collegano** al loro movimento senza cambiare stato, così non restano fra i movimenti da
abbinare.

## Cosa si vede

**Flussi fatture → Da abbinare (Qonto)**, per chi ha il permesso `Pagamenti`:

- i movimenti in uscita dal 1/11/2026 senza fattura: per ciascuno le fatture candidate (stesso
  importo o stesso fornitore), con **Abbina** (anche più fatture insieme) e **Non serve fattura**
  (stipendi, commissioni, giroconti verso terzi…; con la spunta «sempre per questa controparte»
  l'app lo ricorda);
- gli abbinamenti fatti negli ultimi 30 giorni, automatici e a mano, con **Annulla**.

Sulle righe delle code: la pillola «già pagata secondo la fattura, nessun movimento su Qonto».

## Come gira

Ogni notte, nel cron `fatture-sdi`, in quest'ordine: import degli XML → richieste di bonifico
approvate → **lettura dei movimenti Qonto** (`qonto_movimento`, finestra di 120 giorni dal 1/11) →
**abbinamento**. Lo stesso giro parte dopo «Importa adesso» e con il tasto «Controlla Qonto adesso»
nella scheda Da abbinare.

| Cosa | Dove |
|---|---|
| regole di abbinamento (funzioni pure) | `lib/qonto/abbina.ts` |
| lettura movimenti, abbinamento, azioni a mano | `lib/qonto/riconciliazione.ts` |
| regole d'import dal 1/11 | `lib/pagamenti/sdi/regole.ts` (`PARTENZA_QONTO`) |
| blocco all'invio | `lib/qonto/bonifici.ts` |
| schermata | `app/(app)/controllo-gestione/flussi-fatture/AbbinaQonto.tsx` |
| API | `app/api/pagamenti/qonto-movimenti/**` |
| schema | `supabase/qonto_riconciliazione.sql` |
| prova delle regole | `npx --yes tsx scripts/prova-abbina-qonto.ts` |
| giro a mano / storico | `scripts/riconcilia-qonto.mjs` → `app/api/cron/riconcilia-qonto` |

## Giro una tantum sullo storico (1/11/2026)

Chiesto da Dennis: prima di partire, confrontare **tutte** le uscite di Qonto (da settembre 2026)
con le fatture ancora aperte, per trovare quelle già pagate. Stesse regole: chiude solo se sicuro.
Le uscite di prima del 1/11 che non hanno nessuna fattura aperta plausibile si archiviano
(«storico prima del 1/11/2026», non compaiono fra i sistemati); restano in *Da abbinare* solo
quelle con un candidato. Dal terminale, chiamando l'app in produzione:

    node scripts/riconcilia-qonto.mjs --storico --prova
    node scripts/riconcilia-qonto.mjs --storico

(route `app/api/cron/riconcilia-qonto`, con `CRON_SECRET`; non è fra i cron automatici).

## Da tenere d'occhio

- Il nome della controparte delle carte Qonto non è sempre la ragione sociale («AMZN Mktp IT» per
  Amazon): il primo abbinamento a mano insegna all'app quel nome.
- Uno stipendio o un F24 pagati da Qonto restano fra i *Da abbinare* finché qualcuno non preme
  *Non serve fattura*: la spunta «sempre» li toglie per sempre per quell'IBAN.
- Non ancora gestite: le uscite manuali (F24, rate) abbinate in automatico — si fanno a mano.
