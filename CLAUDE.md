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
6. **Non si importa l'interno di un altro modulo**, solo la sua porta d'ingresso (vedi § Convenzioni).

---

## Mappa: area funzionale → file da toccare

Le aree sono nominate come le chiama Dennis. Se la richiesta riguarda un'area, i file sono questi
e non serve cercare altrove.

| Area | UI | API | Logica (`lib/`) | Altro |
|---|---|---|---|---|
| **Timbrature · Foglio ore** | `app/(app)/timbrature/` (operatore + `validazione/`)<br>`app/(app)/risorse-umane/timbrature/` (cruscotto HR) | `app/api/timbrature/**`<br>`app/api/foglio-ore/[token]/`<br>`app/api/cron/{timbrature-alert,sollecito-timbrature,promemoria-ore}/` | `timbrature.ts` `timbrature-flusso.ts` `timbrature-guard.ts` `timbrature-sync.ts` `foglio-ore-xlsx.ts` `festivita.ts` `supabase.ts` | pubblico tokenizzato: `app/foglio-ore/[token]/`<br>`docs/timbrature-*.md` |
| **Manutenzioni** | `app/(app)/manutenzioni/` `nuova-richiesta/` `mie-richieste/` `dashboard/` `gestione/[id]/` | `app/api/manutenzioni/**` | dentro `sharepoint.ts` ⚠️ (`getRichieste*`, `creaRichiesta`, `aggiornaRichiesta`, `getStrutture`, `getTecnici`) | — |
| **Costi strutture** | `app/(app)/inserisci-costo/` `cruscotto-costi/` | `app/api/costi/` | dentro `sharepoint.ts` ⚠️ (`creaCosto`, `creaCostoDiretto`, `getCosti`) | — |
| **Acquisti** | `app/(app)/acquisti/` (`nuova/` `mie/` `gestione/`) | `app/api/acquisti/**`<br>`app/api/consegna/[token]/`<br>`app/api/cron/acquisti/` | `acquisti.ts` `acquisti-flusso.ts` | pubblico tokenizzato: `app/consegna/[token]/`<br>`../Area Acquisti - Manuale operativo.docx`<br>`scripts/provision-acquisti.mjs` |
| **Prestazioni occasionali** | `app/(app)/prestazioni/` (`nuova/` `attive/`) | `app/api/prestazioni/**`<br>`app/api/prestatori/**`<br>`app/api/notula/[token]/**`<br>`app/api/docusign/callback/` | `prestazioni.ts` `documenti-prestazione.ts` `firma-prestazione.ts` `docusign.ts` `casistiche-gdpr.ts` | modelli docx: `lib/templates/prestazione-occasionale/`<br>allegati: `lib/allegati-prestatore/`<br>pubblico: `app/notula/[token]/`<br>`docs/prestazioni-*.md` `docs/docusign-setup.md` |
| **Risorse Umane** | `app/(app)/risorse-umane/` (`GestioneRU.tsx`, `CartellaDipendente.tsx`, `dipendenti/` `collaboratori/` `tirocini/`) | `app/api/risorse-umane/**` | `risorse-umane.ts` `ru-api.ts` `ru-fetch.ts` `ru-export-xlsx.ts` `gruppo-ru.ts` `graph-delegato.ts` | RU vive su **sito SharePoint dedicato** con auth **delegata** (per il log nativo MS)<br>`docs/risorse-umane-setup.md` `docs/piano-ru-*.md` `docs/runbook-ru-*.md`<br>`scripts/ru-assetto.mjs` + gli `import-*.mjs` |
| **Inventario beni** | `app/(app)/inventario/` | `app/api/inventario/**` | `inventario.ts` | `scripts/provision-inventario.mjs` |
| **Amministrazione · Permessi** | `app/(app)/amministrazione/permessi/` | `app/api/permessi/**` | dentro `sharepoint.ts` ⚠️ (`AREE_PERMESSI`, `getPermessi`, `getUtentiPerArea`, `*Autorizzazione`) | `scripts/provision-autorizzazioni.mjs` `scripts/diagnosi-permessi.mjs` |
| **Amministrazione · Software** | `app/(app)/amministrazione/software/` | `app/api/software/**` | `software.ts` (+ `calendar.ts` per gli alert scadenza) | `scripts/provision-software.mjs` |
| **Log attività** | — | — | `audit.ts` | `docs/log-attivita-setup-sharepoint.md`<br>`scripts/provision-log-attivita.mjs` |
| **Home / hub** | `app/(app)/home/page.tsx` (card + sezioni)<br>`app/(app)/amazing/` | — | — | il layout a card sta tutto in `home/page.tsx` (`Sezione`, `HeroCard`, `FunzioneCard`) |
| **Accesso / login** | `app/(auth)/login/` | `app/api/auth/[...nextauth]/` | `auth.ts` `ms-token.ts` | `middleware.ts` (elenco route pubbliche) |

⚠️ = logica che sta ancora in un file condiviso e va estratta nel proprio modulo quando si tocca
quell'area (vedi § Migrazione).

### Infrastruttura condivisa (si tocca raramente)

`lib/graph.ts` (client Graph app-only) · `lib/graph-delegato.ts` (client Graph delegato, per RU) ·
`lib/ms-token.ts` (token) · `lib/sharepoint.ts` (helper liste + logica ancora da smistare) ·
`lib/api-guard.ts` (guardia sulle route API) · `lib/audit.ts` (log applicativo) ·
`lib/notifications.ts` (invio mail + **tutti** i template) · `lib/upload-diretto.ts` (upload a SP) ·
`lib/calendar.ts` · `lib/supabase.ts` · `components/` · `types/`

---

## Convenzioni: la forma di una "scatola"

Ogni area è un modulo con **la stessa struttura interna**, così i percorsi si deducono dal nome
dell'area senza cercare. Le aree nuove nascono già così; le vecchie ci si portano quando le si tocca.

```
app/(app)/<area>/              UI
  page.tsx                     pagina (server component: auth, permessi, fetch iniziale)
  _componenti/                 pezzi client, uno per file, piccoli
app/api/<area>/                route API (thin: validano, chiamano lib/<area>, rispondono)
lib/<area>/
  index.ts                     ← LA PORTA: l'unica cosa che gli altri moduli importano
  schema.ts                    campi SharePoint, tipi, mapping nomi interni ↔ nomi SP
  data.ts                      letture/scritture (SP o Supabase)
  flusso.ts                    regole di stato e business
  notifiche.ts                 template mail DI QUESTA area (l'invio sta in core)
docs/<area>.md                 setup, decisioni prese, perché
scripts/provision-<area>.mjs   creazione liste/campi SP
```

**Le due regole che tengono separate le scatole:**

1. L'infrastruttura comune sta in `lib/core/` (Graph, SharePoint, auth, audit, mailer, upload,
   api-guard). Roba stabile.
2. Un modulo **non** importa file interni di un altro modulo: solo `lib/<altra-area>` → `index.ts`.
   Se serve un dato dell'inventario dentro acquisti, si passa dalla porta.

Le mail seguono lo stesso principio: `lib/core/mailer.ts` sa **come** spedire, ogni area si porta
i **propri** template. Oggi invece `lib/notifications.ts` (1025 righe) contiene i template di
prestazioni + timbrature + acquisti + manutenzioni tutti insieme: è il motivo per cui una modifica
su un'area trascina dentro le altre quattro.

### Nomi

Cartelle e file in **italiano**, minuscolo, con trattini (`inserisci-costo`, `timbrature-flusso.ts`).
Componenti React in `PascalCase` (`CruscottoTimbrature.tsx`). Le route API rispecchiano il nome
dell'area, sempre.

---

## Migrazione: opportunistica, mai big bang

Quando si tocca un'area per una modifica vera: **prima** si porta nella forma nuova
(`git mv` + aggiustare gli import, pochi minuti), **poi** si fa la modifica. Ogni funzione nuova
nasce già nella forma nuova. Non esiste un momento in cui l'app è rotta.

Ordine consigliato: **acquisti** → **timbrature** (il guadagno maggiore) → **risorse umane** → resto.

Il debito noto, in ordine di peso (verifica con `npm run mappa`):

| File | Righe | Problema |
|---|---|---|
| `lib/timbrature.ts` | ~1090 | 45+ export: date, anagrafica, CRUD, stati mese, responsabili. Va in `lib/timbrature/{schema,data,stati,flusso}.ts` |
| `lib/notifications.ts` | ~1025 | 24 template di 4 aree diverse + `sendEmail`. Va in `lib/core/mailer.ts` + `lib/<area>/notifiche.ts` |
| `app/(app)/risorse-umane/timbrature/CruscottoTimbrature.tsx` | ~37 KB | un solo file client: tabella, filtri, modali, validazione |
| `app/(app)/timbrature/TimbratureOperatore.tsx` | ~36 KB | idem |
| `app/(app)/acquisti/gestione/GestioneAcquisti.tsx` | ~36 KB | idem |
| `app/(app)/risorse-umane/GestioneRU.tsx` | ~34 KB | idem |
| `lib/sharepoint.ts` | ~493 | mescola manutenzioni + costi + permessi + helper Graph: da smistare nei moduli |

---

## Trappole già pagate — non ripeterle

- **Il campo ore su SharePoint è `OrePulizia`**, non `Ore_x0020_Tecnico` (lo spec era sbagliato).
- **I campi lookup e persona di Graph arrivano come stringa**, non come oggetto: usare
  l'helper `lookupValue()` in `lib/sharepoint.ts`.
- **Niente `formData()` per gli upload**: usare `lib/upload-diretto.ts` (sessione + conferma,
  tetto 50 MB). Il vecchio approccio saturava il limite di body di Vercel.
- **`isAdmin()` ha una lista di fallback hardcoded** (dennis, stefano, gabriele) perché
  `SP_LIST_ADMIN` non è configurata. Se si tocca l'auth, tenerne conto.
- **Le route pubbliche tokenizzate vanno escluse dal matcher in `middleware.ts`**, altrimenti
  next-auth le blocca: oggi `notula`, `consegna`, `foglio-ore`, `api/cron`, `api/docusign`.
- **`.env.local` e le variabili su Vercel divergono facilmente.** Prima di dare per rotto qualcosa
  in produzione, verificare che la variabile esista *anche* su Vercel.
- **Timbrature: chi è abilitato** si decide dalla spunta "Timbratura attiva" nell'anagrafica RU;
  la chiave di collegamento è `MailAziendale`.
- **RU usa auth delegata** (`graph-delegato.ts`), non app-only: serve per far comparire l'utente
  reale nel log nativo di Microsoft. Non "semplificarla" a app-only.

---

## Comandi

```bash
npm run dev            # sviluppo locale
npm run build          # verifica che compili (farlo SEMPRE prima di proporre un push)
npm run lint
npm run mappa          # rigenera MAPPA.md: moduli, righe per file, export, file oltre soglia

node scripts/sp-liste.mjs          # elenca le liste SharePoint del sito
node scripts/get-site-id.mjs       # ricava il SHAREPOINT_SITE_ID
node scripts/setup-env-locale.mjs  # rigenera .env.local
node scripts/ru-assetto.mjs        # interruttore A/B dell'area RU
```
