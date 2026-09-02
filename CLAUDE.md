# Mirafiori Web — mappa del progetto

> **Leggi questo file prima di toccare qualsiasi cosa.**
> Per l'indice dei file sempre aggiornato: `npm run mappa` → genera `MAPPA.md`.

## Cos'è

Gestionale interno della **Cooperativa Mirafiori**. Uso quotidiano da parte di dipendenti,
responsabili e amministrazione. Non è un prototipo: è in produzione su Vercel.

**Stack:** Next.js 15 (App Router) · next-auth v5 (provider Microsoft Entra ID) ·
Microsoft Graph su SharePoint Lists (dati anagrafici e documentali) ·
Supabase Postgres (solo timbrature) · Tailwind · docxtemplater + exceljs (documenti).

**Deploy:** Vercel, auto-deploy dal branch `main` di `cooperativamirafiori-ux/Mirafiori.Web`.
Cartella del progetto: `web/` (la radice del repo git è `web/`, non la cartella padre).

---

## Regole operative — non negoziabili

1. **Mai `git push` né deploy senza ok esplicito di Dennis.** Si mostra il diff, si chiede, poi si spinge.
2. **Push dalla copia in `/tmp`.** Il mount del Mac nega `unlink` su `.git`, quindi git fallisce in
   place: si copia il repo in `/tmp`, si committa e si spinge da là.
3. **Variabili d'ambiente Vercel: sempre come comandi CLI pronti da incollare**, mai istruzioni
   "vai nella dashboard e clicca". Vale per qualsiasi passaggio: prima il comando da terminale,
   il manuale solo se non esiste alternativa.
4. **Automatizzare.** Se un'operazione va fatta più di una volta, diventa uno script in `scripts/`.
5. **File oltre ~500 righe = segnale di spezzarlo.** `npm run mappa` li elenca in cima al report.
6. **Non si scava negli interni di un altro modulo** (vedi § Convenzioni).
7. **Prima di proporre un push: `npx tsc --noEmit`.** L'app non ha test automatici, il compilatore
   è la rete di sicurezza — e con `strict: true` copre molto. Questo lo lancia Claude.
8. **`npm run build` lo lancia sempre Dennis sul Mac** (26 ago 2026). Nella sandbox il progetto è
   una cartella montata e la compilazione ci striscia: si pianta sulla prima riga per un quarto
   d'ora, mentre ogni chiamata scade dopo tre minuti — e ucciderla lascia una `.next` a metà che
   poi rompe `npm run dev`. Quindi: Claude fa `tsc`, e il comando del build lo **dà** a Dennis
   come ultimo passaggio, aspettando l'esito prima di proporre il commit.
9. **Non controllare mai il deploy su Vercel.** Parte da sé dopo il push e va per conto suo: niente
   `list_deployments`, niente attese, niente "ti confermo quando è READY". Finito il push, finito.
10. **Comandi da terminale: uno per volta.** Si scrive chiaramente cosa deve copiare, **un solo blocco
   per messaggio**, poi si aspetta che Dennis dica "ok" prima di dare il successivo. Mai una sequenza
   di cinque comandi da eseguire in fila: se il secondo fallisce, gli altri tre fanno danno.
   Ricorda anche che è **zsh**: nessun commento `#` sulla stessa riga del comando, finisce fra gli
   argomenti (vedi § Comandi).
   **Unica eccezione: `git add` e `git commit` vanno nello stesso blocco** (25 ago 2026). Sono un
   gesto solo, e se `add` fallisce `&&` ferma il commit da sé. Il `push` resta separato, dopo l'ok.

---

## Mappa: area funzionale → file da toccare

Le aree sono nominate come le chiama Dennis. Se la richiesta riguarda un'area, i file sono questi
e non serve cercare altrove.

| Area | UI | API | Logica (`lib/`) | Altro |
|---|---|---|---|---|
| **Timbrature · Foglio ore** | `app/(app)/timbrature/` (operatore + `validazione/`)<br>`app/(app)/risorse-umane/timbrature/` (cruscotto HR) | `app/api/timbrature/**`<br>`app/api/foglio-ore/[token]/`<br>`app/api/cron/{timbrature-alert,sollecito-timbrature,promemoria-ore}/` | `lib/timbrature/`: **`data.ts` è la porta** e riesporta `date.ts` `anagrafica.ts` `stati.ts` `righe.ts` `riepilogo.ts`<br>più `flusso.ts` `guard.ts` `sync.ts` `notifiche.ts` `foglio-ore-xlsx.ts` `festivita.ts` | pubblico tokenizzato: `app/foglio-ore/[token]/`<br>`docs/timbrature-*.md` — **le decisioni stanno in `docs/timbrature-revisione-agosto-2026.md`** |
| **Manutenzioni** | `app/(app)/manutenzioni/` `nuova-richiesta/` `mie-richieste/` `dashboard/` `gestione/[id]/` | `app/api/manutenzioni/**` | `lib/manutenzioni/`: `data.ts` `notifiche.ts`<br>anagrafiche: `lib/strutture/data.ts` | **due livelli**: il permesso `Manutenzioni` (`AREA_MANUTENZIONI` in `types/manutenzioni.ts`) apre richiesta e "le mie richieste" — pensato per i responsabili di struttura, si assegna dal pannello Permessi; `dashboard/` `gestione/` `inserisci-costo/` `cruscotto-costi/` restano su `isAdmin`<br>la regola sta in `puoRichiedereManutenzione()` (gli admin passano senza il permesso)<br>`scripts/seed-permessi-manutenzioni.mjs` semina il permesso dai responsabili delle Strutture |
| **Costi strutture** | `app/(app)/inserisci-costo/` `cruscotto-costi/` | `app/api/costi/` | `lib/costi/data.ts` | il cruscotto ha due viste: per centro di costo (default) e per struttura |
| **Centri di costo** | — (anagrafica) | — | `lib/centri-costo/data.ts` | lista SP `SP_LIST_CENTRI_COSTO`, 23 CC raggruppati in 10 aree<br>`scripts/provision-centri-costo.mjs` `provision-centri-costo-collegamenti.mjs` `backfill-centro-costo-costi.mjs`<br>`docs/centri-di-costo-piano.md` |
| **Acquisti** | `app/(app)/acquisti/` (`nuova/` `mie/` `gestione/`) | `app/api/acquisti/**`<br>`app/api/consegna/[token]/`<br>`app/api/cron/acquisti/` | `lib/acquisti/`: `data.ts` `flusso.ts` `notifiche.ts` | pubblico tokenizzato: `app/consegna/[token]/`<br>`../Area Acquisti - Manuale operativo.docx`<br>`scripts/provision-acquisti.mjs` |
| **Assistenza IT** | `app/(app)/assistenza/` (`nuova/` `mie/` `gestione/`) | `app/api/assistenza/**`<br>`app/api/cron/assistenza/` | `lib/assistenza/`: `data.ts` `flusso.ts` `notifiche.ts` `allegati.ts` | aperta a **tutti**: il permesso `IT e Dispositivi` serve solo a `gestione/`<br>il ticket lo chiude l'IT, il richiedente può riaprirlo entro 15 giorni<br>`scripts/provision-assistenza.mjs` · `docs/assistenza-it.md` |
| **Richiesta fattura** | `app/(app)/richiesta-fattura/` | `app/api/fatture/`<br>`app/api/clienti/[id]/` | `lib/fatture/`: `data.ts` `notifiche.ts` `centri-di-costo.ts`<br>anagrafica: `lib/clienti/data.ts`<br>campi e validazione in `types/fatture.ts` | aperta a **tutti** gli utenti, nessun permesso d'area<br>`scripts/provision-fatture.mjs` `provision-clienti.mjs` `import-clienti.mjs`<br>`docs/richiesta-fattura.md` |
| **Prestazioni occasionali** | `app/(app)/prestazioni/` (`nuova/` `attive/`) | `app/api/prestazioni/**`<br>`app/api/prestatori/**`<br>`app/api/notula/[token]/**`<br>`app/api/docusign/callback/` | `lib/prestazioni/`: `data.ts` `documenti.ts` `firma.ts` `docusign.ts` `casistiche-gdpr.ts` `notifiche.ts` | modelli docx: `lib/templates/prestazione-occasionale/`<br>allegati: `lib/allegati-prestatore/`<br>pubblico: `app/notula/[token]/`<br>`docs/prestazioni-*.md` `docs/docusign-setup.md` |
| **Risorse Umane** | `app/(app)/risorse-umane/` (`GestioneRU.tsx`, `CartellaDipendente.tsx`, `dipendenti/` `collaboratori/` `tirocini/`) | `app/api/risorse-umane/**` | `lib/risorse-umane/`: `data.ts` `api.ts` `fetch.ts` `export-xlsx.ts` `gruppo.ts` | RU vive su **sito SharePoint dedicato** con auth **delegata** (`lib/core/graph-delegato.ts`)<br>`docs/risorse-umane-setup.md` `docs/piano-ru-*.md` `docs/runbook-ru-*.md`<br>`scripts/ru-assetto.mjs` + gli `import-*.mjs` |
| **Inventario beni** | `app/(app)/inventario/` | `app/api/inventario/**` | `lib/inventario/data.ts` | `scripts/provision-inventario.mjs` |
| **Amministrazione · Permessi** | `app/(app)/amministrazione/permessi/` (`GestionePermessi.tsx` elenco+dettaglio, `SceltaPersona.tsx` autocompletamento, `VistaPerArea.tsx`) | `app/api/permessi/**`<br>`app/api/rubrica/` | `lib/core/permessi.ts` (sta in core: la usa anche l'autenticazione)<br>`lib/core/rubrica.ts` (account del tenant da Graph) | `scripts/provision-autorizzazioni.mjs` `scripts/diagnosi-permessi.mjs` `scripts/diagnosi-rubrica.mjs` |
| **Amministrazione · Software** | `app/(app)/amministrazione/software/` | `app/api/software/**` | `lib/software/data.ts` (+ `lib/core/calendar.ts` per gli alert scadenza) | `scripts/provision-software.mjs` `provision-software-centro-costo.mjs`<br>centro di costo obbligatorio (lookup, come Costi e Acquisti) |
| **Controllo di Gestione · Flussi fatture** | `app/(app)/controllo-gestione/` (hub) + `flussi-fatture/` (`FlussiFatture.tsx`) | `app/api/pagamenti/**` | `lib/pagamenti/`: `xlsx.ts` (lettore .xlsx proprio) `tracciato.ts` `import.ts` `data.ts` `flusso.ts` `guard.ts` | dati su **Supabase** (`supabase/pagamenti_schema.sql`)<br>⚠️ l'export di Fattura SMART **non si legge con exceljs** (namespace `x:`, celle senza `r=`): vedi `lib/pagamenti/xlsx.ts`<br>**tre permessi**: `Controllo di Gestione` (cruscotti), `Pagamenti` (paga), `Approvazione Pagamenti` (approva) — la sezione si apre con uno qualsiasi<br>soglia dalla lista SP Parametri (`SogliaApprovazionePagamenti`)<br>`docs/flussi-fatture.md` · piano completo in `docs/controllo-di-gestione-piano.md` |
| **Log attività** | — | — | `lib/core/audit.ts` | `docs/log-attivita-setup-sharepoint.md`<br>`scripts/provision-log-attivita.mjs` |
| **Home / hub** | `app/(app)/home/page.tsx` (card + sezioni)<br>`app/(app)/amazing/` | — | — | il layout a card sta tutto in `home/page.tsx` (`Sezione`, `HeroCard`, `FunzioneCard`) |
| **Accesso / login** | `app/(auth)/login/` | `app/api/auth/[...nextauth]/` | `lib/core/auth.ts` `lib/core/ms-token.ts` | `middleware.ts` (elenco route pubbliche) |

---

## Struttura di `lib/`

```
lib/core/          infrastruttura: si tocca raramente, la usano tutte le aree
  graph.ts           client Graph app-only
  graph-delegato.ts  client Graph delegato (serve a RU per il log nativo MS)
  ms-token.ts        token
  auth.ts            next-auth
  permessi.ts        isAdmin, aree autorizzate  ← in core perché la usa anche auth
  rubrica.ts         account della cooperativa da Entra (nome + email), per scegliere le persone
  sp.ts              base delle SharePoint Lists: listBase, lookupValue, utenti SP, parametri
  mailer.ts          sendEmail + mattoncini HTML (BOX, RIGA, TABELLA, BTN)
  audit.ts           log applicativo
  api-guard.ts       guardia sulle route API
  upload-diretto.ts  upload a SP (sessione + conferma, tetto 50 MB)
  calendar.ts        eventi calendario via Graph
  supabase.ts        client Supabase

lib/<area>/        una cartella per area di dominio
  data.ts            letture/scritture
  flusso.ts          regole di stato e business
  notifiche.ts       testi delle mail DI QUESTA area
  guard.ts           controlli d'accesso specifici (dove serve)

types/<area>.ts    tipi, già una per area
```

Aree presenti: `acquisti` `assistenza` `centri-costo` `clienti` `costi` `fatture` `inventario` `it`
`manutenzioni` `prestazioni` `risorse-umane` `software` `strutture` `timbrature`.

`centri-costo`, `clienti` e `strutture` sono **anagrafiche**: non hanno schermate proprie, le usa chi ne ha bisogno
(oggi `fatture` la prima, `manutenzioni` e `acquisti` la seconda).

**Le due regole che tengono separate le scatole:**

1. L'infrastruttura sta in `lib/core/` e **non importa mai da un modulo d'area** (è per questo che
   `permessi` sta in core: `auth` ne ha bisogno).
2. Un modulo importa dai file di primo livello di un altro modulo (`@/lib/inventario/data`), non da
   suoi sotto-file interni. Quando spezzeremo i `data.ts` grossi comparirà un `index.ts` per area
   come unica porta d'ingresso — oggi non c'è ancora, e va bene così.

Le mail seguono lo stesso principio: `lib/core/mailer.ts` sa **come** spedire, ogni area si porta i
**propri** testi in `notifiche.ts`.

---

## Kit UI — `components/ui/`

I mattoncini condivisi dell'interfaccia. **Prima di scrivere a mano un blocco
`label` + `input`, una piastrella con un numero, o un pannello sovrapposto, guarda qui.**

| Componente | A cosa serve | Note |
|---|---|---|
| `Campo` | campo di form completo: etichetta, controllo, aiuto, errore | il controllo lo scegli con `tipo` (`text` `textarea` `choice` `date` `number` `currency` `email` `tel`), stesso vocabolario di `RUField`. Ha `maiuscolo`, `min`/`max`/`maxLength`, e `scelte` che accetta stringhe o coppie `{valore, etichetta}` per i select dove il valore salvato è diverso da quello mostrato. `senzaVuoto` toglie la voce "niente" dai select che partono già con un valore. Esporta `inputCls` e `labelCls` per i casi grezzi |
| `Allegato` | campo file: etichetta, nome e peso del file scelto, avviso se sfora | separato da `Campo` perché lega un `File | null`, non una stringa. Il tetto è quello di `core/upload-diretto`, controllato qui una volta per tutte |
| `Kpi` | piastrella di riepilogo: numero grande + didascalia | `dimensione="lg"` per i conteggi brevi, `tenue` per la variante su fondo grigio |
| `Voce` | voce di dettaglio etichetta/valore, dentro un `<dl>` | props `t` / `v` / `span` |
| `Pill` | etichetta tonda con pallino, per stati e categorie | usa `tono` nel codice nuovo; `cls` accetta classi esplicite |
| `Banner` | messaggio di errore, conferma, avviso | non renderizza niente se non c'è testo: `<Banner tono="errore">{errore}</Banner>` |
| `Vuoto` | riquadro tratteggiato "qui non c'è niente" | non mostrarlo mentre stai ancora caricando |
| `Modale` | pannello sovrapposto | foglio dal basso su telefono, card centrata su desktop; gestisce Esc, blocco scorrimento e clic sullo sfondo |
| `StatoBadge` | stati delle manutenzioni | scorciatoia specifica, più grande di `Pill`: restano separati di proposito |
| `Header`, `LogoutButton` | intestazione, uscita e navigazione | `backHref`/`backLabel` per il link "torna a…" — vedi § Navigazione |

Niente file barile: si importa il singolo componente (`@/components/ui/Kpi`), così da
`npm run mappa` si vede chi usa cosa.

### Nomi

Cartelle e file in **italiano**, minuscolo, con trattini (`inserisci-costo`, `foglio-ore-xlsx.ts`).
Componenti React in `PascalCase` (`CruscottoTimbrature.tsx`). Le route API rispecchiano il nome
dell'area, sempre.

---

## Navigazione — tasti indietro/home

Decisa il 5 ago 2026 con Dennis, dopo una revisione di tutta l'app: erano cresciuti almeno sette
testi diversi ("← Indietro", "← Home", "← Torna alla home", "← Acquisti"...) sparsi in punti diversi
della pagina (sopra il titolo, accanto, in fondo, dentro la barra blu solo in Timbrature), con una
pagina (`gestione/[id]`) senza alcun link e un'altra (Timbrature) con due link ridondanti.

**Regola unica**: il link di navigazione verso la sezione superiore vive dentro `Header`
(`components/ui/Header.tsx`), mai scritto a mano pagina per pagina.

```tsx
<Header title="Gestione Software" backHref="/amministrazione" backLabel="Torna all'Amministrazione" />
```

- **Sempre nello stesso punto**: riga sopra il titolo, dentro la barra blu. Mai a metà pagina, mai in
  fondo, mai duplicato.
- **`backLabel` è la frase intera**, articolo compreso ("Torna alla Home", "Torna a Risorse Umane",
  "Torna all'Amministrazione") — `Header` la stampa così com'è, non compone lui l'articolo giusto.
- **Un livello alla volta**: si torna al genitore diretto nella gerarchia (Permessi → Amministrazione,
  Dipendenti → Risorse Umane), non sempre a Home. Le sezioni di primo livello (figlie di `/home`:
  Acquisti, Manutenzioni, Timbrature, Risorse Umane, Amministrazione, Prestazioni, Amazing) tornano a
  Home. Così il link funziona anche da breadcrumb implicito.
- **`backHref` si omette solo in `/home`** (nessun genitore) e nelle pagine token-based fuori
  dall'app (`/foglio-ore/[token]`, `/notula/[token]`, `/consegna/[token]`, `/login`).
- **Non è lo stesso link del pulsante "Annulla/Indietro" in fondo ai form** (accanto a "Salva"):
  quello è un'azione di cancellazione del form, resta dov'è e come sempre.
- **Non è lo stesso caso del "torna all'elenco" dentro `GestioneRU`**: lì non si cambia pagina, si
  torna a una vista interna (stato React). Resta un bottone semplice nel corpo della pagina, non va
  dentro `Header` — altrimenti sembra un cambio di sezione quando non lo è.

**Aggiungendo un'area nuova**: passare sempre `backHref`/`backLabel` al primo `Header` della pagina,
verso il genitore nella tabella § Mappa. Vedi anche `mirafiori-architettura` e i memo del 5 ago 2026
in cui è stata decisa questa convenzione.

---

## Aggiungere un'area nuova

Dennis dirà solo il nome, con la parola che userebbe lui: «nuova sezione Formazione». Il resto si
ricava da qui, senza fargli ricordare niente.

**Prima, le quattro cose che non si possono indovinare — chiederle:**

1. Dove stanno i dati: una lista **SharePoint** (come quasi tutto) o **Supabase** (come le timbrature)?
2. Chi ci entra: serve una voce nuova in `AREE_PERMESSI` (`lib/core/permessi.ts`) o basta l'accesso generale?
3. Manda **email**? → `lib/<area>/notifiche.ts` appoggiato a `core/mailer`.
4. Servono **allegati** (→ `core/upload-diretto` + `Allegato`) o un **promemoria automatico**
   (→ `app/api/cron/<area>/`)?

**Poi, la scatola:**

- `lib/<area>/`: `schema.ts` (campi e mapping SP), `data.ts` (letture/scritture), `flusso.ts` (regole
  di stato), `notifiche.ts` (testi delle mail) — solo quelli che servono davvero
- `app/(app)/<area>/`: `page.tsx` (server component: auth, permessi, fetch iniziale) + `_componenti/`
- `app/api/<area>/`: route sottili, che validano e chiamano `lib/<area>`
- `types/<area>.ts` per i tipi
- `scripts/provision-<area>.mjs` se ci sono liste o campi da creare su SharePoint
- `docs/<area>.md` con setup e **decisioni prese**: il perché, che dal codice non si ricava

**UI col kit** (§ Kit UI): non riscrivere a mano campi, piastrelle, banner, stati vuoti, modali.

**Registrare l'area in due posti, o la mappa mente:**

- l'elenco `AREE` in `scripts/mappa.mjs` — se si salta, i suoi file compaiono in "non mappati"
- la tabella § Mappa qui sopra

Infine la card sulla home (`app/(app)/home/page.tsx`, nella sezione giusta), poi `npm run mappa` e
`npx tsc --noEmit` prima di proporre il commit.

---

## Dove siamo nel riordino

Fatto (`scripts/riordino.mjs`, passi 1 e 2): `lib/core/` esiste; `sharepoint.ts` (494 righe, mescolava
manutenzioni + costi + permessi + helper) e `notifications.ts` (1026 righe, 24 template di 4 aree)
sono stati smistati; ogni area ha la sua cartella.

Fatto (passo 3, prima parte): il **kit UI** in `components/ui/` — vedi la sezione sopra. È additivo,
nessuna schermata è cambiata. Adottato in `GestioneAcquisti` e `InventarioBeni`, dove `Kpi` e `Voce`
erano duplicati identici (58 righe di copia-incolla in meno).

Una cosa da sapere, perché ribalta l'ipotesi di partenza: **queste schermate non usano tabelle.**
C'è un solo `<table>` in tutta l'app (in `CruscottoTimbrature`); le altre sono elenchi di card con
`grid-cols`. Quindi il pezzo grosso da estrarre non è una `Tabella` generica — è il **campo di form**
(`Campo`), perché i blocchi `label` + `input` scritti a mano sono 21 in `NuovaPrestazioneForm`,
15 in `GestioneSoftware`, 14 in `GestioneAcquisti`, ognuno con classi Tailwind leggermente diverse.

Fatto: **`NuovaPrestazioneForm` convertita** — 16 campi con `Campo`, 4 con `Allegato`, i due banner
con `Banner`. Da 561 a 544 righe, e le tre costanti di stile locali sono sparite. È rimasto scritto a
mano un solo `label`: la ricerca prestatore, che non è un campo del form ma una ricerca con tendina.

Convertire il primo form è servito anche a **scoprire cosa mancava a `Campo`**: maiuscolo forzato
(codice fiscale, IBAN), limiti numerici (`min`), e scelte con valore diverso dall'etichetta
(casistica GDPR). Aggiunte perché le ha chieste un form vero, non per completezza.

**Decisione presa: lo stile dei campi è uno solo**, quello del kit. Le schermate che avevano un loro
`inputClass` cambiano leggermente aspetto quando le si converte — angoli, imbottitura, colore
dell'anello di focus. È il senso di avere un kit; l'alternativa (una variante per schermata) avrebbe
solo spostato il problema più in là.

**Prossimo passo — `GestioneSoftware`** (15 blocchi a mano), poi `GestioneAcquisti` (14). Ogni
schermata un commit suo.

### Come verificare una conversione senza l'app in piedi

L'app vera è dietro il login Entra ID e parla con SharePoint, quindi Claude non può provarla
end-to-end. Può però **montare il singolo componente in un Chromium headless nella sua sandbox** e
verificare comportamento e dati inviati — che è quasi tutto quello che serve. Ricetta (rifatta da
zero ogni volta, non serve niente nel repo):

1. cartella di lavoro con `react`, `react-dom`, `esbuild`, `tailwindcss`;
2. si copiano il componente, il kit e i moduli `lib` che gli servono; si sostituiscono con finti solo
   `next/navigation` e `lib/core/upload-diretto`;
3. si sostituisce `window.fetch` con una versione che **registra ogni chiamata** e risponde finto;
4. si impacchetta con esbuild (`--alias:@/components=…`), si costruisce il CSS con la vera
   `tailwind.config`, e si pilota la pagina con Playwright.

Il pezzo che paga più di tutti è il punto 3: leggendo il corpo delle richieste registrate si verifica
che **i dati che partono siano quelli giusti** — è così che si è confermato che la casistica GDPR
invia la chiave (`COMUNITA`) e non l'etichetta. Sulla conversione di `NuovaPrestazioneForm` sono
passati 35 controlli su 35.

E **guarda lo screenshot a fine corsa**: è stato quello, non i controlli verdi, a far notare che dopo
il salvataggio il nome del file restava scritto accanto a "Choose File" (React non svuota un input
file — ora lo fa `Allegato`).

Il modulo dati generico ("lista SharePoint guidata da uno schema", generalizzando `RU_CONFIG` in
`types/risorse-umane.ts`) è **rimandato di proposito**: c'è un solo esempio da cui astrarre, quindi
farlo adesso sarebbe indovinare. Si fa quando una seconda area lo chiede davvero.

Debito residuo, in ordine di peso (verifica sempre con `npm run mappa`):

| File | Righe | Nota |
|---|---|---|
| ~~`lib/timbrature/data.ts`~~ | — | **fatto** (8 ago 2026): spezzato in `date` `anagrafica` `stati` `righe` `riepilogo`, con `data.ts` come unica porta d'ingresso. Nessun altro file toccato |
| `app/(app)/acquisti/gestione/GestioneAcquisti.tsx` | ~973 | aspetta il kit UI |
| `app/(app)/risorse-umane/GestioneRU.tsx` | ~935 | idem |
| `app/(app)/timbrature/TimbratureOperatore.tsx` | ~794 | idem |
| `app/(app)/risorse-umane/timbrature/CruscottoTimbrature.tsx` | ~783 | idem |
| `app/(app)/prestazioni/nuova/NuovaPrestazioneForm.tsx` | ~561 | idem |
| `app/api/acquisti/[id]/route.ts` | ~528 | route troppo grassa: la logica va in `lib/acquisti/flusso.ts` |
| `app/(app)/amministrazione/software/GestioneSoftware.tsx` | ~524 | aspetta il kit UI |

---

## Trappole già pagate — non ripeterle

- **Il campo ore su SharePoint è `OrePulizia`**, non `Ore_x0020_Tecnico` (lo spec era sbagliato).
- **I campi lookup e persona di Graph arrivano come stringa**, non come oggetto: usare
  l'helper `lookupValue()` in `lib/core/sp.ts`.
- **L'export di Fattura SMART non è un .xlsx a norma** e exceljs non lo legge («Unexpected xml
  node in parseOpen»): prefisso di namespace `x:` in `sharedStrings`/`styles`, celle senza
  riferimento, parti dichiarate e assenti. Si legge con `lib/pagamenti/xlsx.ts`, e le date
  arrivano come numeri seriali.
- **Riconoscendo una modalità di pagamento, confrontare per parola intera.** Con la sottostringa
  «Bollettino di c/c **pos**tale» risultava una carta, e quei bollettini nascevano già pagati.
- **Niente `formData()` per gli upload**: usare `lib/core/upload-diretto.ts` (sessione + conferma,
  tetto 50 MB). Il vecchio approccio saturava il limite di body di Vercel.
- **`isAdmin()` ha una lista hardcoded** (`ADMIN_HARDCODED`: dennis, stefano, gabriele) perché
  `SP_LIST_ADMIN` non è configurata — ed è una scelta, non un residuo: sono i tre che gestiscono
  le manutenzioni. Il controllo su `LIST('admin')` è **esplicito**, non affidato al `catch`:
  se la lista venisse creata vuota, altrimenti i tre perderebbero l'accesso in silenzio.
- **Le route pubbliche tokenizzate vanno escluse dal matcher in `middleware.ts`**, altrimenti
  next-auth le blocca: oggi `notula`, `consegna`, `foglio-ore`, `api/cron`, `api/docusign`.
- **`.env.local` e le variabili su Vercel divergono facilmente.** Prima di dare per rotto qualcosa
  in produzione, verificare che la variabile esista *anche* su Vercel.
- **Timbrature: chi è abilitato** si decide dalla spunta "Timbratura attiva" nell'anagrafica RU;
  la chiave di collegamento è `MailAziendale`.
- **Il foglio ore non ha più una cartella di ripiego.** Se la persona non è in anagrafica RU la
  validazione si ferma e avvisa le HR: prima archiviava in silenzio in `Foglio Ore/<Nominativo>`
  e nessuno se ne accorgeva.
- **`timbratura.notte` è una spunta manuale, non un calcolo.** Prima si accendeva da sé quando il
  turno scavallava la data; adesso i turni oltre la mezzanotte sono spezzati in due righe, quindi
  nessuna riga scavalla e la colonna significa "turno notturno dichiarato". La maggiorazione è
  forfettaria a notte: si contano le notti, non le ore in fascia.
- **Nelle timbrature non esistono contatori memorizzati.** Ogni totale (flessibilità compresa) si
  ricalcola dalle righe a ogni lettura, perché un saldo salvato divergerebbe alla prima riga
  corretta a posteriori. Non "ottimizzare" salvandolo.
- **RU usa auth delegata** (`lib/core/graph-delegato.ts`), non app-only: serve per far comparire
  l'utente reale nel log nativo di Microsoft. Non "semplificarla" a app-only.
- **Le mail delle timbrature partono da `risorseumane@`**, non dalla casella di sistema: il
  dipendente risponde a chi gli scrive, e la risposta deve finire nella casella giusta.

---

## Comandi

**Nota:** Dennis usa **zsh**, che *non* ignora i commenti `#` a fine riga incollati nel terminale.
Nei comandi da dare a lui, mai commenti sulla stessa riga: la spiegazione va sopra, o fuori dal blocco.

```bash
npm run dev
npx tsc --noEmit
npm run build
npm run lint
npm run mappa
```

`npx tsc --noEmit` è il controllo dei tipi: la rete di sicurezza, dato che non ci sono test.
`npm run build` va fatto prima di proporre un push. `npm run mappa` rigenera `MAPPA.md`.

```bash
node scripts/riordino.mjs 1
node scripts/riordino.mjs 2
node scripts/sp-liste.mjs
node scripts/get-site-id.mjs
node scripts/setup-env-locale.mjs
node scripts/ru-assetto.mjs
```

Nell'ordine: i due passi del riordino architetturale (già eseguiti entrambi); l'elenco delle liste
SharePoint del sito; il `SHAREPOINT_SITE_ID`; la rigenerazione di `.env.local`; l'interruttore A/B
dell'area RU.
