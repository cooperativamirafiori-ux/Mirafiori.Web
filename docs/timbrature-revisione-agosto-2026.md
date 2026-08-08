# Timbrature — revisione di agosto 2026

Decisioni prese con Dennis l'8 agosto 2026, punto per punto, e come sono state
implementate. Le decisioni contano più del codice: il codice si legge, il *perché*
no.

**Contesto che ha semplificato tutto:** la sezione Timbrature **non era ancora in
uso**. Nessuna compatibilità da rispettare, nessun dato vecchio da salvare.

---

## Le decisioni

### 1. Chiusura anticipata del mese

Il mese passava a `da_validare` solo per calendario (fine mese + 2 giorni, via
cron), e `validaFoglio()` rifiutava esplicitamente un mese ancora aperto.

**Deciso:** si valida anche a mese aperto, **se non ha nemmeno una giornata
scoperta**. Nessuno stato nuovo, nessun passaggio in più: è stato rimosso il
divieto, non aggiunto un tasto. Il tasto diventa "Chiudi e valida" e lo vedono
**sia il responsabile sia le HR**.

**Un foglio con i buchi non si chiude, per nessuno.** Nessuna forzatura, nemmeno
per le HR.

Le ore di lavoro non si inseriscono in anticipo, quindi un mese risulta completo
prima della fine solo se i giorni restanti sono coperti da assenze o non
lavorativi: è il caso "sono in ferie dal 20 al 31, il mio foglio è finito".

### 2. Flag "Notte"

La colonna `notte` esisteva già ma si accendeva **da sé** quando l'uscita
precedeva l'ingresso, e significava "il turno ha scavallato la data" — cosa
diversa da "turno notturno" (un 20:00–24:00 è notturno e non scavalla).

**Deciso:** spunta **manuale**, mai calcolata, **mai proposta accesa**. La
maggiorazione notturna è **forfettaria a notte**, non a ore: quindi nessun calcolo
di ore in fascia notturna, si contano le **notti dichiarate**.

La colonna è stata riusata invece di aggiungerne una: con il punto 3 nessuna riga
scavalla più la mezzanotte, quindi il vecchio significato si estingue da sé e non
resta una colonna morta accanto a una nuova.

**Trappola evitata:** contando le righe spuntate, un turno diviso su due giorni
pagherebbe **due forfait per una notte**. Si è scelto zero colonne in più: la
spunta si mette una volta sola, sulla riga in cui si inizia. Il dipendente viene
istruito, il referente controlla.

### 3. Turni oltre la mezzanotte

Le ore restavano **tutte sul giorno di inizio**: un 17:00–08:00 metteva 15 ore sul
giorno 1 e lasciava il giorno 2 scoperto — quindi un giorno lavorato che faceva
scattare i solleciti e bloccava la chiusura.

**Deciso:** il dipendente digita una volta sola, il sistema salva **due righe
indipendenti** (fino a 24:00 sul giorno 1, da 00:00 sul giorno 2) e lo dice con un
messaggio. Niente coppia, niente vincoli: si correggono separatamente.

Le ore del giorno 2 sono **ore lavorate di quel giorno a tutti gli effetti**:
coprono il suo monte ore, e l'eccedenza va in flessibilità.

Un turno a cavallo di due mesi deposita ore nel mese successivo, ed è corretto. Se
il mese di destinazione è già validato il salvataggio viene rifiutato con il
motivo, invece di infilare ore in un foglio definitivo.

### 4. Flag "Reperibilità"

**Deciso:** semplice spunta sulla riga, come "Mutua". Non incide su nessun
conteggio: serve alle HR per il costo orario.

Il buco noto — reperibilità senza chiamata, che non lascia traccia perché non c'è
nessuna riga di ore da spuntare — **non si applica a Mirafiori**: la reperibilità
si accompagna sempre a un turno di servizio, quindi una riga c'è sempre.

### 5. Assenze su più giorni

**Deciso:** azione "dal–al" che scrive una giornata intera per ogni giorno.
Generica per tutti i giustificativi, con Ferie in testa. Vale anche al contrario
(rimozione su un periodo).

**Solo giornate intere.** Per prendere alcune ore si va sul singolo giorno, dove
si scelgono gli orari.

Salta i giorni non lavorativi e quelli già compilati, e **a fine inserimento dice
quali e perché**. Un periodo che scavalca il mese funziona.

In più: il **tag della voce sul giorno** nella vista mese, per vedere la forma del
mese senza aprire quattordici giornate.

### 6. Data di restituzione quota sociale

Non è Timbrature: è **RU → Dipendenti → sezione Socio**, che aveva l'importo
restituito ma non il quando. Campo data `DataRestituzioneQuota` subito sotto
l'importo. **Non** va nella scheda socio. Una data sola: la restituzione è un
evento unico.

### 7. Etichetta ammissione/dimissione soci — **IN SOSPESO**

Le date esistono già in RU. Cosa manchi non è chiaro: riferimento alla delibera
CDA? registro consultabile? etichetta di stato? Da riprendere.

### 8. Cruscotti ed estrazione dati — **IN SOSPESO**

Spostato sul database dipendenti (RU), non su Timbrature. Da riprendere.

Quando si riapre, la forma è già nota dai cedolini: le paghe distinguono `ore
lavorate ordinarie` da `flessibilità lavorata`, quindi l'export utile è una riga
per dipendente per mese con ore ordinarie, flessibilità lavorata, flessibilità
recuperata, ferie, F.S., permessi, 104, notti, reperibilità. Non un export
generico da cui ricavare i totali a mano: **il documento che le paghe si
aspettano**.

### 9. Variazione orario con allegato

`profilo_orario` versionava già il monte ore per decorrenza, ma l'interfaccia lo
usava male: decorrenza **forzata al primo del mese** visualizzato, **storico
invisibile** (l'API restituiva tutte le versioni, la schermata mostrava una),
nessun motivo, nessun documento, e **nessuna cancellazione**.

Non è un problema d'archivio: `profiloVigente` determina le ore attese di ogni
giornata, quindi completezza, solleciti, scostamento e flessibilità. Una
variazione con la data sbagliata **riscrive in silenzio le ore attese dei mesi
passati**.

**Deciso:** è il **cambio di orario contrattuale** (30 → 20 ore, con lettera
firmata), non la rotazione dei turni — quella il modello non la esprime e servirebbe
altro. Storico visibile, decorrenza libera, motivo in chiaro, cancellazione,
allegato.

L'allegato passa da `lib/core/upload-diretto`, come tutti gli altri file dell'app:
i byte non toccano il nostro server. Il ponte fra i due mondi è
`trovaSchedaPerEmail` — in Timbrature la persona è la sua mail, la cartella
personale sta su una scheda RU — la stessa funzione che usa l'archiviazione del
foglio ore, estratta perché ora ha due chiamanti.

La lettera si carica **prima** di registrare la variazione: se il caricamento
fallisce non resta una variazione che dichiara un documento inesistente.

Il pannello sta in `_componenti/VariazioniOrario.tsx`: ha stato suo, due chiamate
sue e nessun legame col resto della schermata, e il cruscotto era arrivato a 1025
righe. Estratto, è tornato a 848.

### 10. Foglio ore in doppia copia

Andava in **un solo posto**, e se il match per mail con l'anagrafica RU falliva
finiva **di nascosto** in `Foglio Ore/<Nominativo>`, dove nessuno guardava.

**Deciso:** seconda copia in `Fogli Ore/<anno>/<mese>/`, **solo PDF**, **solo
fogli definitivi** (quindi alla conferma, non alla validazione).

**Il ripiego è stato eliminato.** Se la persona non è in anagrafica la validazione
**si ferma**, non archivia niente, e parte una mail alle HR — non al responsabile,
che un buco in anagrafica non lo può chiudere. «Non può essere che il dipendente
non sia in anagrafica: appena assunto gli si fa la mail e deve finire in
anagrafica.»

### 11–12. Flessibilità

Il verso è quello della banca ore classica: **si accumula lavorando, si consuma
assentandosi**, e può andare in negativo.

I cedolini hanno confermato la regola **dalla busta paga stessa**: le paghe tengono
due causali distinte, `907 FLESSIBILITA' LAVORATA` e `908 FLESSIBILITA'
RECUPERATA`, e il riquadro ratei le somma in maturazione/godute/residuo. Quindi
l'app produce **esattamente quei due numeri**, e la riconciliazione mensile si fa
riga per riga.

- **lavorata** = ore di lavoro oltre il monte ore del giorno, al netto di quanto
  quel giorno era già coperto da assenze. Calcolo **giorno per giorno**: è questo
  che rende il contatore vivo mentre il mese scorre.
- **recuperata** = ore dichiarate sulla voce `Flessibilità`.

Nei giorni a monte ore zero (domeniche, festivi) **ogni** ora lavorata accumula.

**Asimmetria da conoscere:** le ore in più le prende il sistema da sé, le ore in
meno solo se il dipendente le dichiara. Il saldo **non è la somma degli
scostamenti**: è la somma di quello che è stato dichiarato. Una giornata scoperta e
non dichiarata resta incompleta e blocca la chiusura, quindi qualcosa deve
scrivere — ma può coprirla con le ferie, e allora il saldo non si muove.

**Nessun blocco e nessuna soglia:** il saldo negativo si vede in rosso, il
responsabile entra nel cruscotto e ne parla col dipendente. La colonna è
**ordinabile**: senza ordinamento, "controllare periodicamente" cento righe non si
fa.

**Niente contatori memorizzati.** Tutto si ricalcola dalle righe a ogni lettura.
Un saldo salvato divergerebbe: basta una riga corretta, una cancellata, una
variazione di monte ore registrata in ritardo. Ricalcolando, "in tempo reale" non è
una funzione in più — è come funziona.

**Il residuo disponibile è IN SOSPESO** (vedi sotto): dipende dalle dotazioni di
inizio mese.

### Dotazioni di inizio mese (ferie, F.S., flessibilità) — **IN SOSPESO**

Ogni voce presa ad ore ha una dotazione, che si carica a inizio mese dai cedolini;
il residuo scende con l'uso. Dato **indicativo**, non millimetrico: il conteggio
ufficiale è quello delle paghe, e ogni mese si riallinea.

Cosa si sa già, letto su due cedolini di luglio 2026:

- le quantità sono in **ore**, non in giorni (FERIE godute A.C. 135,00 con 23
  giorni = 115,00 ore nel mese: 135 giorni non esistono). Nessuna conversione;
- **solo tre voci** hanno un rateo: `FERIE`, `F.S.`, `FLES.`, con quattro colonne
  (residuo A.P., maturazione A.C., godute A.C., **residuo**). Serve l'ultima;
- L.104, permessi retribuiti e congedo parentale **non hanno rateo**: non sono
  dotazioni che maturano. Quindi mostreranno solo le ore usate, e la regola "il
  residuo si mostra dove l'import porta un numero" cade al punto giusto senza
  configurazioni;
- i residui **possono essere negativi** (visti −0,88 e −1,60);
- la chiave **non è la mail** (nel cedolino non c'è): sono **matricola** e **codice
  fiscale**, entrambi presenti in anagrafica RU;
- il PDF è **leggibile a macchina** (una pagina, testo estraibile), e il tracciato
  regge sia sul part-time sia sul full time — cambia solo la posizione nella
  pagina, quindi si cerca per etichetta e non per numero di riga;
- il cedolino porta anche le ore contrattuali (`DIV.ORARIO`, part-time e
  percentuale): lo stesso import può segnalare se l'anagrafica dice 30 ore e il
  cedolino 25, che è la rete sotto il punto 9.

**Sospeso perché** Dennis valuta un'alternativa: un export CSV dal software paghe
invece della lettura dei PDF.

---

## Cosa è stato scritto

### Migrazione

`supabase/timbrature_revisione_agosto_2026.sql` — da eseguire una volta nel SQL
editor. Idempotente.

### Riordino, prima di aggiungere

`lib/timbrature/data.ts` era a 1103 righe con 45+ export, primo debito in
`CLAUDE.md`, e i punti 1, 3, 5 e 11 atterravano tutti lì. Spezzato per mestiere,
senza anelli:

| file | cosa contiene |
|---|---|
| `date.ts` | date, orari, aritmetica delle ore, spezzamento a mezzanotte. **Funzioni pure** |
| `anagrafica.ts` | servizi e centri di costo, dipendenti, variazioni di orario |
| `stati.ts` | stato del mese |
| `righe.ts` | chi può scrivere cosa, e la scrittura di **una** voce |
| `assenze.ts` | ferie e permessi su un periodo di giorni consecutivi |
| `riepilogo.ts` | dai dati ai numeri: giorni, settimane, flessibilità, cruscotti |

`assenze.ts` è separato da `righe.ts` perché è un mestiere diverso: `righe.ts`
scrive una voce e sa dire di no, mentre su un periodo il "no" su una giornata non
ferma le altre e va raccontato a fine corsa — ed è per questo che l'esito non è un
booleano ma quattro elenchi.

`data.ts` resta la **porta d'ingresso**: chi sta fuori importa da lì e nessun altro
file è stato toccato.

`leggiRiga()` è ora l'unico punto in cui si leggono i campi di una riga: quattro
route scrivono timbrature, e una spunta nuova va aggiunta una volta, non quattro.

### File toccati

- `lib/timbrature/{date,anagrafica,stati,righe,riepilogo,data}.ts` — nuovi + porta
- `lib/timbrature/{flusso,notifiche,foglio-ore-xlsx}.ts`
- `lib/risorse-umane/data.ts` — `caricaDocumentoInCartella` per la copia HR
- `types/timbrature.ts`, `types/risorse-umane.ts`
- `app/api/timbrature/assenza/route.ts` — nuova
- `app/api/timbrature/hr/profilo/route.ts` — storico, motivo, cancellazione
- le 4 route di scrittura righe, ora sottili
- `app/(app)/timbrature/TimbratureOperatore.tsx`
- `app/(app)/risorse-umane/timbrature/CruscottoTimbrature.tsx`
- `scripts/aggiungi-colonna-ru.mjs` — nuovo

### Verifica

`npx tsc --noEmit` verde. La logica dello spezzamento a mezzanotte è stata provata
in sandbox con 13 controlli (turno dentro la giornata, 20:00–08:00, 17:00–08:00,
22:00–02:00, uscita esatta a mezzanotte che **non** deve creare una riga da zero
ore, scavalco di mese e di anno, minuti non tondi, `24:00` ammesso e `24:30`
rifiutato): tutti verdi.

## Cosa resta

1. **Dotazioni e residui** di ferie, F.S. e flessibilità (import in pausa: si
   valuta il CSV dalle paghe invece della lettura dei PDF).
2. **Punti 7 e 8.**
3. `npm run build` in locale: nella sandbox non sta nei tempi (filesystem
   montato), quindi va lanciato sul Mac prima del push.
