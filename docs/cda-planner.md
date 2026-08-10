# Task del CDA verso Planner

Come i mandati decisi in Consiglio di Amministrazione finiscono in Microsoft Planner
senza reinserirli a mano.

## Il flusso

1. La skill `verbale-cda-mirafiori` compila il verbale `.docx` dalla trascrizione.
2. Dalla stessa trascrizione la skill estrae i task e li mostra come tabella in chat.
3. **Dennis conferma o corregge la tabella.** Passaggio volutamente manuale: capire
   quale frase è un impegno e quale è solo discussione è interpretativo, e un task
   sbagliato su Planner poi si cancella a mano.
4. La skill scrive il JSON confermato e lancia `scripts/verbale-a-planner.mjs`.
5. Lo script crea il bucket della riunione e i task dentro il piano CDA.

## Decisioni prese

**Identità app-only, non delegata.** Lo script usa le credenziali applicative
(`GRAPH_*`) e il permesso `Tasks.ReadWrite.All` (Application, id
`44e666d1-d276-445b-a5fc-8815eeb81d55`). Conseguenza accettata: nell'attività di
Planner i task risultano creati dall'app, non dalla persona. La strada delegata
avrebbe richiesto di aggiungere `Tasks.ReadWrite` a `SCOPE_DELEGATO`, con re-login
forzato per tutti gli utenti già autenticati e uno strappo alla policy di igiene
degli scope del piano RU — costo troppo alto per un'automazione periodica.

**Un piano per anno, un bucket per riunione.** Il piano è fisso
(`PLANNER_PLAN_CDA`, oggi "CDA 2026"), ogni verbale crea un bucket
`CDA AAAA-MM-GG`. Lo storico dei mandati dell'anno sta in un posto e si vede a
colpo d'occhio quali riunioni hanno lasciato lavoro aperto.

**Idempotenza su bucket + titolo.** Rilanciare lo stesso JSON non duplica: lo
script salta i task il cui titolo è già presente in quel bucket. Non aggiorna i
task esistenti — se un titolo cambia nasce un task nuovo e il vecchio va chiuso a
mano. Scelta consapevole: aggiornare in automatico un task che qualcuno ha già
spostato o commentato fa più danni che bene.

**I responsabili si scrivono per nome, non per mail.** Il campo `responsabile` del
JSON accetta indifferentemente `"Michela Debenedittis"` o una mail: i nomi si
risolvono contro i membri del gruppo M365 del piano, che sono comunque gli unici
assegnabili. Così non esiste da nessuna parte una mappa nome→mail da tenere
aggiornata, e non si rischia di inventare un indirizzo assumendo il formato
`nome.cognome@`. Il confronto ignora ordine, maiuscole e accenti; se un nome
corrisponde a più membri lo script si ferma e chiede la mail invece di scegliere.
L'elenco dei nomi validi:

```
node scripts/verbale-a-planner.mjs --membri
```

**Niente scadenze inventate.** Se il verbale non indica una data, il task nasce
senza scadenza. Il marcatore `[verbale:AAAA-MM-GG#n]` in fondo alle note lega il
task al punto del verbale da cui nasce.

**Nessun `lib/cda/`, per ora.** Tutta la logica sta nello script. Quando servirà
una pagina web (`/cda`) la logica si porta in `lib/cda/data.ts` e lo script
diventa un chiamante sottile. Aggiungere il modulo adesso significherebbe
mantenere un'astrazione con un solo consumatore.

## Setup, già fatto il 10/08/2026

Permesso applicativo sull'app registration esistente (app id
`8ee54c61-2475-4069-bd6e-a8fccfc7b292`):

```
az ad app permission add --id $APP_ID --api 00000003-0000-0000-c000-000000000000 --api-permissions 44e666d1-d276-445b-a5fc-8815eeb81d55=Role
```

```
az ad app permission admin-consent --id $APP_ID
```

`permission add` dichiara il permesso ma non lo concede, e la CLI suggerisce
fuorviantemente `permission grant`, che serve per gli scope **delegati**: per un
permesso applicativo il secondo comando è `admin-consent`. Senza di quello ogni
endpoint Planner risponde 403 con "You do not have the required permissions to
access this item", che si somiglia troppo a un problema di accesso al piano.
Per distinguere i due casi:

```
node scripts/verbale-a-planner.mjs --diagnosi
```

stampa i `roles` presenti nel token applicativo e prova gruppo, piani, piano e
bucket uno per uno.

Verificato in produzione il 10/08/2026: con `Tasks.ReadWrite.All` applicativo
funzionano sia le letture sia le scritture (creazione bucket, task, assegnazione,
descrizione e checklist). L'asimmetria lettura/scrittura temuta per Planner
app-only non si è manifestata.

Gruppo e piano esistono già — team "CDA", piano "CDA 2026" — e i loro id stanno
in `.env.example`: basta copiare le due righe `PLANNER_GROUP_CDA` e
`PLANNER_PLAN_CDA` in `.env.local`.

L'id di un piano si legge dall'URL di Planner (`.../plan/<id>?tid=...`). Se in
futuro serve ritrovarlo, o se il piano dell'anno va creato da zero:

```
node scripts/verbale-a-planner.mjs --piani
```

```
node scripts/verbale-a-planner.mjs --crea-piano "CDA 2027"
```

Entrambi stampano la riga `PLANNER_PLAN_CDA=<id>` da incollare in `.env.local`.
`--piani` guarda solo il gruppo in `PLANNER_GROUP_CDA`, non tutti i gruppi del
tenant.

Con un piano per anno il cambio di gennaio è la sostituzione di una variabile: i
bucket delle riunioni vecchie restano nel piano dell'anno precedente, che è il
comportamento desiderato.

Nota: lo script non gira su Vercel, quindi le due variabili servono solo in
locale. Se in futuro l'automazione passa da una pagina web, vanno aggiunte anche
alle env Vercel.

## Rimediare a un invio sbagliato

Lo script cancella un bucket con tutti i suoi task. Senza `--conferma` mostra
soltanto cosa toccherebbe:

```
node scripts/verbale-a-planner.mjs --elimina-bucket "CDA 2026-08-10"
```

```
node scripts/verbale-a-planner.mjs --elimina-bucket "CDA 2026-08-10" --conferma
```

Dopo la cancellazione il JSON si può reinviare da zero: il bucket viene ricreato.
Attenzione, cancella anche i task che qualcuno ha già lavorato o commentato — è
pensato per ripulire subito dopo un invio sbagliato, non a distanza di settimane.

## Limiti da conoscere

- Un task Planner si assegna **solo** a membri del gruppo M365 proprietario del
  piano. Se il responsabile è fuori dal gruppo il task nasce non assegnato e lo
  script lo segnala; il nome resta nelle note.
- La checklist di un task Planner accetta al massimo 20 voci.
- `plannerTaskDetails` richiede `If-Match` con l'etag corrente: descrizione e
  checklist si scrivono con una GET dei details seguita da una PATCH, mai in
  creazione. È il motivo per cui ogni task costa tre chiamate Graph.

## File

- `scripts/verbale-a-planner.mjs` — script unico: `--diagnosi`, `--membri`,
  `--piani`, `--crea-piano`, `--prova`, invio, `--elimina-bucket`.
- `scripts/verbale-a-planner.esempio.json` — forma del JSON in input.
