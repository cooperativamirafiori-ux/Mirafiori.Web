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

## 3. Accessi

- **`/timbrature`** (operatore) è riservato a chi è **abilitato dall'anagrafica
  Risorse Umane**: campo `TimbraturaAttiva` = `Si` sulla scheda della persona.
  Chi non lo è vede una schermata che spiega di rivolgersi alle HR.
  Il collegamento fra i due mondi è la **mail aziendale** (`MailAziendale`), che
  è anche l'account Microsoft 365 di accesso.
- **`Timbrature HR`** (permesso per area, lista SharePoint "Autorizzazioni") → dà
  accesso al cruscotto `/risorse-umane/timbrature` (stato di tutti i dipendenti
  abilitati, monte ore, chiusura mese).

### Abilitare una persona

1. Risorse Umane → Dipendenti (o Tirocini) → scheda della persona → **Modifica**.
2. Sezione **Timbrature**:
   - `Timbratura attiva` = **Si**
   - `Referente foglio ore (mail)` → finisce nell'intestazione del foglio ore
3. Salva. Il salvataggio crea o riattiva subito la persona nel database timbrature.
4. Cruscotto Timbrature → **Controlla** sulla persona → imposta il **monte ore
   settimanale**. Senza monte ore le ore attese sono 0 e i giustificativi valgono
   0 ore: è il passaggio da non dimenticare.

Il pulsante **Sincronizza da anagrafica** nel cruscotto riallinea tutto in blocco
(primo popolamento, o dopo modifiche fatte direttamente su SharePoint). È
idempotente.

### Decadenza automatica

L'accesso decade da sé, anche a spunta lasciata su `Si`, quando il rapporto si
chiude: dipendenti con `StatoRapporto = Cessato`, tirocini con `StatoTirocinio`
`INTERROTTO` o `TERMINATO`. Nessuno deve ricordarsi di togliere la spunta; se la
persona rientra basta rimettere lo stato in corso.

Le disattivazioni sono **morbide** (`attivo = false`): righe di ore e mesi chiusi
non vengono mai cancellati. Chi non è più abilitato continua a comparire nel
cruscotto **nei mesi in cui ha lasciato qualcosa**, con l'etichetta *non più
attivo*, così le HR possono chiudere l'ultimo mese e generare il foglio ore
finale. Queste persone sono escluse dalle mail di sollecito.

L'anagrafica RU è la fonte di verità per nominativo, referente e stato attivo. Il
**monte ore** invece resta di competenza delle HR e non viene mai sovrascritto
dalla sincronizzazione.

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
