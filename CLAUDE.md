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
   è la rete di sicurezza — e con `strict: true` copre molto.

---

## Mappa: area funzionale → file da toccare

Le aree sono nominate come le chiama Dennis. Se la richiesta riguarda un'area, i file sono questi
e non serve cercare altrove.

| Area | UI | API | Logica (`lib/`) | Altro |
|---|---|---|---|---|
| **Timbrature · Foglio ore** | `app/(app)/timbrature/` (operatore + `validazione/`)<br>`app/(app)/risorse-umane/timbrature/` (cruscotto HR) | `app/api/timbrature/**`<br>`app/api/foglio-ore/[token]/`<br>`app/api/cron/{timbrature-alert,sollecito-timbrature,promemoria-ore}/` | `lib/timbrature/`: `data.ts` `flusso.ts` `guard.ts` `sync.ts` `notifiche.ts` `foglio-ore-xlsx.ts` `festivita.ts` | pubblico tokenizzato: `app/foglio-ore/[token]/`<br>`docs/timbrature-*.md` |
| **Manutenzioni** | `app/(app)/manutenzioni/` `nuova-richiesta/` `mie-richieste/` `dashboard/` `gestione/[id]/` | `app/api/manutenzioni/**` | `lib/manutenzioni/`: `data.ts` `notifiche.ts`<br>anagrafiche: `lib/strutture/data.ts` | — |
| **Costi strutture** | `app/(app)/inserisci-costo/` `cruscotto-costi/` | `app/api/costi/` | `lib/costi/data.ts` | — |
| **Acquisti** | `app/(app)/acquisti/` (`nuova/` `mie/` `gestione/`) | `app/api/acquisti/**`<br>`app/api/consegna/[token]/`<br>`app/api/cron/acquisti/` | `lib/acquisti/`: `data.ts` `flusso.ts` `notifiche.ts` | pubblico tokenizzato: `app/consegna/[token]/`<br>`../Area Acquisti - Manuale operativo.docx`<br>`scripts/provision-acquisti.mjs` |
| **Prestazioni occasionali** | `app/(app)/prestazioni/` (`nuova/` `attive/`) | `app/api/prestazioni/**`<br>`app/api/prestatori/**`<br>`app/api/notula/[token]/**`<br>`app/api/docusign/callback/` | `lib/prestazioni/`: `data.ts` `documenti.ts` `firma.ts` `docusign.ts` `casistiche-gdpr.ts` `notifiche.ts` | modelli docx: `lib/templates/prestazione-occasionale/`<br>allegati: `lib/allegati-prestatore/`<br>pubblico: `app/notula/[token]/`<br>`docs/prestazioni-*.md` `docs/docusign-setup.md` |
| **Risorse Umane** | `app/(app)/risorse-umane/` (`GestioneRU.tsx`, `CartellaDipendente.tsx`, `dipendenti/` `collaboratori/` `tirocini/`) | `app/api/risorse-umane/**` | `lib/risorse-umane/`: `data.ts` `api.ts` `fetch.ts` `export-xlsx.ts` `gruppo.ts` | RU vive su **sito SharePoint dedicato** con auth **delegata** (`lib/core/graph-delegato.ts`)<br>`docs/risorse-umane-setup.md` `docs/piano-ru-*.md` `docs/runbook-ru-*.md`<br>`scripts/ru-assetto.mjs` + gli `import-*.mjs` |
| **Inventario beni** | `app/(app)/inventario/` | `app/api/inventario/**` | `lib/inventario/data.ts` | `scripts/provision-inventario.mjs` |
| **Amministrazione · Permessi** | `app/(app)/amministrazione/permessi/` | `app/api/permessi/**` | `lib/core/permessi.ts` (sta in core: la usa anche l'autenticazione) | `scripts/provision-autorizzazioni.mjs` `scripts/diagnosi-permessi.mjs` |
| **Amministrazione · Software** | `app/(app)/amministrazione/software/` | `app/api/software/**` | `lib/software/data.ts` (+ `lib/core/calendar.ts` per gli alert scadenza) | `scripts/provision-software.mjs` |
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

Aree presenti: `acquisti` `costi` `inventario` `manutenzioni` `prestazioni` `risorse-umane`
`software` `strutture` `timbrature`.

**Le due regole che tengono separate le scatole:**

1. L'infrastruttura sta in `lib/core/` e **non importa mai da un modulo d'area** (è per questo che
   `permessi` sta in core: `auth` ne ha bisogno).
2. Un modulo importa dai file di primo livello di un altro modulo (`@/lib/inventario/data`), non da
   suoi sotto-file interni. Quando spezzeremo i `data.ts` grossi comparirà un `index.ts` per area
   come unica porta d'ingresso — oggi non c'è ancora, e va bene così.

Le mail seguono lo stesso principio: `lib/core/mailer.ts` sa **come** spedire, ogni area si porta i
**propri** testi in `notifiche.ts`.

### Nomi

Cartelle e file in **italiano**, minuscolo, con trattini (`inserisci-costo`, `foglio-ore-xlsx.ts`).
Componenti React in `PascalCase` (`CruscottoTimbrature.tsx`). Le route API rispecchiano il nome
dell'area, sempre.

---

## Dove siamo nel riordino

Fatto (`scripts/riordino.mjs`, passi 1 e 2): `lib/core/` esiste; `sharepoint.ts` (494 righe, mescolava
manutenzioni + costi + permessi + helper) e `notifications.ts` (1026 righe, 24 template di 4 aree)
sono stati smistati; ogni area ha la sua cartella.

**Prossimo passo — le primitive condivise.** È qui che sta la scalabilità vera, perché oggi
`components/ui/` contiene 3 file per ~60 righe: ogni area si è ricostruita in casa tabella, filtri,
modale, form, allegati. È *per questo* che i componenti sono da 900 righe, non perché facciano
troppo. Due famiglie da estrarre:

- **dati**: un modulo generico "lista SharePoint guidata da uno schema" — il pattern schema-driven di
  Risorse Umane, generalizzato. Dopo, un'area nuova = un file di schema + una pagina.
- **UI**: `components/ui/` diventa un kit vero — `Tabella` (ordinamento, filtri, export),
  `CampoForm`, `Modale`, `Allegati` (che incapsula `core/upload-diretto`).

**Poi i componenti**, e solo allora: a quel punto si sgonfiano da soli, perché il 60-70% di quei file
è tabella + filtri + modale. Questa è l'unica fase che **cambia il comportamento**, quindi va fatta
una schermata alla volta con prova a mano — il compilatore non ti dice se un pulsante ha smesso di
funzionare.

Debito residuo, in ordine di peso (verifica sempre con `npm run mappa`):

| File | Righe | Nota |
|---|---|---|
| `lib/timbrature/data.ts` | ~1090 | 45+ export: date, anagrafica, CRUD, stati mese, responsabili → `{schema,data,stati}.ts` |
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
- **Niente `formData()` per gli upload**: usare `lib/core/upload-diretto.ts` (sessione + conferma,
  tetto 50 MB). Il vecchio approccio saturava il limite di body di Vercel.
- **`isAdmin()` ha una lista di fallback hardcoded** (dennis, stefano, gabriele) perché
  `SP_LIST_ADMIN` non è configurata. Se si tocca l'auth, tenerne conto.
- **Le route pubbliche tokenizzate vanno escluse dal matcher in `middleware.ts`**, altrimenti
  next-auth le blocca: oggi `notula`, `consegna`, `foglio-ore`, `api/cron`, `api/docusign`.
- **`.env.local` e le variabili su Vercel divergono facilmente.** Prima di dare per rotto qualcosa
  in produzione, verificare che la variabile esista *anche* su Vercel.
- **Timbrature: chi è abilitato** si decide dalla spunta "Timbratura attiva" nell'anagrafica RU;
  la chiave di collegamento è `MailAziendale`.
- **RU usa auth delegata** (`lib/core/graph-delegato.ts`), non app-only: serve per far comparire
  l'utente reale nel log nativo di Microsoft. Non "semplificarla" a app-only.
- **Le mail delle timbrature partono da `risorseumane@`**, non dalla casella di sistema: il
  dipendente risponde a chi gli scrive, e la risposta deve finire nella casella giusta.

---

## Comandi

```bash
npm run dev            # sviluppo locale
npx tsc --noEmit       # controllo dei tipi — la rete di sicurezza, non ci sono test
npm run build          # farlo prima di proporre un push
npm run lint
npm run mappa          # rigenera MAPPA.md: aree, righe per file, export, dipendenze

node scripts/riordino.mjs <1|2>     # riordino architetturale (già eseguiti entrambi)
node scripts/sp-liste.mjs           # elenca le liste SharePoint del sito
node scripts/get-site-id.mjs        # ricava il SHAREPOINT_SITE_ID
node scripts/setup-env-locale.mjs   # rigenera .env.local
node scripts/ru-assetto.mjs         # interruttore A/B dell'area RU
```
