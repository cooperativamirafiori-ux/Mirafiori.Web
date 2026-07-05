# Sezione Timbrature — setup

Rilevazione presenze operatori + generazione automatica del foglio ore mensile.
Dati transazionali su **Supabase** (Postgres); login, anagrafiche e documenti
restano su Microsoft 365 / SharePoint.

## 1. Progetto Supabase

1. Crea un progetto su https://supabase.com (regione EU).
2. SQL editor → incolla ed esegui `web/supabase/timbrature_schema.sql`
   (crea le tabelle e fa il seed dei ~34 servizi/giustificativi dal foglio `Dati`).
3. Settings → API: copia **Project URL** e **service_role key** (segreta, solo server).

## 2. Variabili d'ambiente

In locale (`web/.env.local`):

```
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
```

Su Vercel (da terminale, nella cartella `web/`):

```bash
# Production
printf '%s' 'https://xxxxxxxx.supabase.co'   | vercel env add SUPABASE_URL production
printf '%s' 'eyJ...service_role...'          | vercel env add SUPABASE_SERVICE_ROLE_KEY production

# Preview (facoltativo, per i branch di anteprima)
printf '%s' 'https://xxxxxxxx.supabase.co'   | vercel env add SUPABASE_URL preview
printf '%s' 'eyJ...service_role...'          | vercel env add SUPABASE_SERVICE_ROLE_KEY preview
```

Nessuna nuova variabile Graph/SharePoint: si riusano quelle già presenti
(la generazione dell'Excel scrive nella cartella personale del dipendente).

## 3. Permessi per area (lista SharePoint "Autorizzazioni")

- **`Timbrature`** → assegnala a tutti gli operatori che devono timbrare.
  Compare la card "Timbrature" in home e la pagina `/timbrature`.
- **`Risorse Umane`** → dà accesso al cruscotto HR `/timbrature/hr`
  (stato di tutti i dipendenti, monte ore, chiusura mese). Già esistente.

## 4. Anagrafica dipendenti

- Al primo accesso a `/timbrature`, l'operatore viene creato in automatico nella
  tabella `dipendente` (email + nome dalla sessione Microsoft).
- Le HR impostano il **monte ore settimanale** dal cruscotto (bottone *Controlla*
  → *Salva monte ore*). Finché non è impostato, le ore attese risultano 0.
- Per far finire il foglio ore nella cartella personale RU, l'email dell'operatore
  deve coincidere con `Mail aziendale` o `Mail personale` nell'anagrafica Risorse
  Umane. Altrimenti il file va in ripiego nella libreria del sito, cartella
  `Foglio Ore/<Nominativo>`.

## 5. Cron di sollecito

`vercel.json` include due cron giornalieri (07:00):

- `/api/cron/promemoria-ore` (prestazioni, già esistente)
- `/api/cron/sollecito-timbrature` (nuovo): nei giorni **1–5 del mese** invia a
  ogni dipendente col mese precedente ancora aperto una mail **ALERT** perentoria
  con i giorni rimanenti e cosa manca. Fuori dalla finestra non fa nulla.

Richiede `CRON_SECRET` (già in uso) e `APP_BASE_URL` per il link nella mail.

## Regole implementate

- **Ore senza arrotondamento** (valore esatto dalle–alle; turni oltre mezzanotte → +24h, flag Notte).
- **Inserimento giornaliero**: righe *dalle–alle + servizio*; giustificativi (Ferie, Permessi, Legge 104, …) occupano il monte ore del giorno.
- **Finestra correzioni**: l'operatore modifica fino al **5 del mese successivo**; poi è in sola lettura.
- **Chiusura HR uno alla volta**: il pulsante *Chiudi* si attiva solo dopo aver aperto *Controlla* per quel dipendente. La chiusura genera il foglio ore Excel nella cartella personale. Solo HR può *Riaprire*.

## Flusso dati

```
Operatore → /timbrature → API /api/timbrature → Supabase (timbratura)
HR        → /timbrature/hr → /api/timbrature/hr/* → Supabase + Graph (Excel in cartella personale)
Cron      → /api/cron/sollecito-timbrature → mail ALERT (Graph Mail.Send)
```
