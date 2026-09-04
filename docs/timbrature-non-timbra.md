# Timbrature — chi non timbra (settembre 2026)

## Il problema

Alcune persone non timbrano, ma un foglio ore devono averlo lo stesso: è quello
che finisce in Pulse.

- **I responsabili.** Non timbrano, ma il foglio ore va fatto e lo compilano da sé.
- **Le squadre tipo Locanda.** Non timbrano, e il foglio ore lo fa per tutti la
  loro responsabile.

Per entrambe le categorie l'orario è quello del contratto, sempre uguale.
L'unica informazione che il sistema non può dedurre è **quando non hanno
lavorato, e perché** — ferie, mutua, permessi.

## La forma scelta

Si rovescia il verso della compilazione: invece di inserire trenta giornate
uguali e sperare che nessuno sbagli, il mese si **genera** dall'orario teorico e
si inseriscono a mano **solo le eccezioni**.

### 1. La spunta «Non timbra»

In anagrafica Risorse Umane, sezione Timbrature, accanto a «Timbratura attiva».
Campo SharePoint `NonTimbra`, colonna Supabase `dipendente.non_timbra`.

Le due spunte **vanno insieme**, non una al posto dell'altra: «Timbratura
attiva» dice che la persona ha un foglio ore, «Non timbra» dice come si riempie.
Chi ha solo la seconda riceve un avviso al salvataggio della scheda.

Effetti collaterali della spunta:

- **la finestra dei tre giorni non si applica.** Esiste per far compilare il
  foglio giorno per giorno, che è la cosa che qui non si fa. Il bottone scrive
  anche i giorni futuri;
- **il sollecito cambia destinatario.** Il cron non scrive più al dipendente
  (che non deve fare niente) ma al suo referente, una mail sola con l'elenco dei
  fogli da compilare.

### 2. L'orario teorico

Tabella `profilo_fascia`, figlia di `profilo_orario` — non di `dipendente`.
La scelta è voluta: l'orario cambia quando cambia il contratto, e deve cambiare
**con la stessa decorrenza**. Appeso al dipendente, un passaggio a part-time
riscriverebbe in silenzio anche i mesi già chiusi.

Ogni fascia dice giorno della settimana, ingresso, uscita e **servizio** (quindi
il centro di costo: un coordinatore può stare in due strutture diverse in due
giorni diversi). Più fasce sullo stesso giorno sono la pausa pranzo.

Si imposta dal Cruscotto Timbrature → scheda della persona → «Variazioni
orario», dove per chi non timbra compare il riquadro **Orario teorico**: si
scrive l'orario una volta, si spuntano i giorni in cui vale, si applica, poi si
correggono i giorni diversi.

Quando un giorno ha delle fasce, **le sue ore non si digitano più**: vengono
calcolate dalle fasce e la casella diventa grigia. Ore e fasce sono lo stesso
dato scritto due volte, e due copie che possono divergere sono una copia
sbagliata che aspetta.

### 3. Il bottone «Compila il mese»

`POST /api/timbrature/da-profilo`. Lo premono tre mani, con la stessa semantica:

| chi | dove |
| --- | --- |
| la persona su di sé | Timbrature → vista Mese (è il caso dei responsabili) |
| il responsabile sui suoi | Fogli ore da validare → scheda del collaboratore |
| le HR su chiunque | Cruscotto Timbrature → scheda della persona |

Si può premere **il primo del mese o quando si vuole**, e si può ripremere:
riempie solo le giornate ancora vuote. Salta e lo dice:

- i giorni che hanno già qualcosa (ferie messe in anticipo, righe corrette a mano);
- festivi, domeniche e giorni senza fasce nell'orario teorico.

Si ferma davanti a un mese già validato: quello si riapre prima.

**Perché un bottone e non un cron notturno.** Un lavoro notturno riempirebbe il
giorno appena concluso, cioè sempre con un giorno di ritardo e senza che nessuno
se ne accorga. Chi non timbra ha un orario che non cambia: non c'è niente da
aspettare.

**Perché righe vere e non calcolate al volo.** Riepilogo, scostamento, foglio
ore xlsx, PDF e costo del lavoro leggono tutti da `timbratura`. Righe virtuali
vorrebbero dire riscrivere la stessa regola in cinque posti, e quattro di quei
posti prima o poi la scriverebbero in modo leggermente diverso.

### 4. `origine`: manuale o profilo

Colonna nuova su `timbratura`. Le righe generate valgono `'profilo'`, tutte le
altre `'manuale'`. Regge le due cose che rendono il meccanismo usabile:

- **Rigenera** (secondo bottone) cancella e riscrive **solo** le righe
  `'profilo'`. È la via d'uscita quando l'orario teorico era sbagliato:
  correggerlo dopo non risistema da sé un mese già compilato, e ventidue
  giornate non si rifanno a mano. Ferie e correzioni restano dove sono.
- **Un giustificativo scavalca una giornata teorica.** La mutua si sa il giorno
  dopo, quando la riga generata c'è già: senza questo darebbe «giorno già
  compilato» e toccherebbe cancellare a mano una riga che non ha scritto
  nessuno. Vale sia dal singolo giorno sia dall'assenza su periodo.

  Se il giustificativo copre solo una parte della giornata (permesso di due ore
  su otto teoriche) la sostituzione è comunque totale, ma l'app lo dice e
  chiede di registrare le ore lavorate residue: sono l'unica cosa che il sistema
  non può sapere.

### 5. Quello che NON cambia

Il flusso di validazione resta identico: `da_validare → validato → confermato`,
con il PDF via mail e la conferma del dipendente. **La conferma non si salta
nemmeno per chi non timbra**, anzi lì vale il doppio: un foglio ore generato da
un profilo è pur sempre una dichiarazione firmata, e la conferma è la garanzia
che qualcuno l'ha guardata.

Nota organizzativa: il referente di tutti i responsabili è la casella Risorse
Umane, altrimenti il loro foglio resterebbe fermo in `da_validare` senza un
destinatario.

## Messa in opera

1. **Supabase** — eseguire `supabase/timbrature_non_timbra.sql` nel SQL editor.
2. **SharePoint** — `node scripts/provision-risorse-umane.mjs` aggiunge la
   colonna `NonTimbra` alle liste Dipendenti e Tirocini (idempotente).
3. **Anagrafica** — mettere «Non timbra = Si» sulle schede interessate, poi
   `node scripts/sync-timbrature-anagrafica.mjs` (in sola lettura) e
   `--apply` per allineare Supabase.
4. **Orario teorico** — impostarlo dal Cruscotto Timbrature per ogni persona
   con la spunta, altrimenti il bottone non ha da cosa generare.

## Verifica

`node scripts/prova-da-profilo.mjs` fa girare la compilazione contro un finto
Supabase in memoria: nessuna variabile d'ambiente, nessuna rete. Controlla che
le ferie inserite prima non vengano toccate, che ripremere il bottone non
duplichi niente, che la mutua scavalchi la giornata teorica, che «Rigenera»
lasci stare le righe manuali e che chi timbra venga rifiutato con un messaggio
che dice cosa fare.
