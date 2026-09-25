# Qonto nell'app

## Cosa c'è

**Controllo di Gestione → Qonto**: saldo, IBAN e ultimi 30 movimenti dei conti Qonto.

- chi ha il permesso **Controllo di Gestione** vede tutti i conti, compreso il principale;
- il **coordinatore** di un centro di costo vede il sottoconto del suo servizio e nient'altro.
  Chi coordina un solo servizio arriva dritto al suo conto.

## Decisioni (24-25/09/2026)

- **Un sottoconto per centro di costo** (piano Business: 1 + 29). Serve a sapere *quanta
  liquidità ha ancora il servizio*, che è una cosa diversa dal controllo di gestione: le carte
  legate al sottoconto vengono rifiutate dalla banca a saldo zero. La Locanda (cc2) è esclusa:
  ha già un conto suo su un'altra banca.
- **Aggancio conto → centro di costo dal nome**: `cc18 · Condominio Solidale`. Il codice in testa
  è la chiave; il nome dopo il " · " si può cambiare su Qonto.
- **Coordinatore = colonna della lista Centri di Costo**, non un permesso. Nominare qualcuno dà
  l'accesso, toglierlo lo revoca. Un secondo elenco divergerebbe dal primo.
- **Si vede la controparte** dei movimenti (deciso da Dennis).
- **Freschezza**: ogni apertura legge Qonto; le risposte valgono 60 secondi. Nessuna copia nel
  database: il saldo mostrato è quello della banca. I coordinatori si rileggono ogni 5 minuti.
- **"Disponibile adesso"** = `authorized_balance` di Qonto, cioè il saldo meno i pagamenti con
  carta ancora in attesa. È il numero che il coordinatore deve guardare prima di spendere.

## Credenziali

| Dove | Cosa | Perché |
|---|---|---|
| Vercel + `.env.local` | `QONTO_LOGIN`, `QONTO_SECRET` (chiave API) | l'app **legge soltanto**. La chiave va generata da un **titolare/amministratore**: con un ruolo inferiore Qonto nasconde i saldi |
| solo `.env.local` sul Mac | `QONTO_CLIENT_ID`, `QONTO_CLIENT_SECRET` + `web/.qonto-oauth.json` | gli script che **scrivono** (creare/rinominare sottoconti, giroconti). OAuth: access 1 h, refresh 90 giorni **monouso** — su Vercel si brucerebbe al primo rinnovo concorrente |

App OAuth sul Developer Portal: caso d'uso **"Automate your business operations"** (nessuna
revisione da parte di Qonto), redirect `http://localhost:3737/callback`.

## Script

| Script | A cosa serve |
|---|---|
| `scripts/coordinatori-centri-costo.mjs` | elenco coordinatori; nomina/toglie (`--cc cc18 --email … --apply`); la prima volta sistema la colonna ("Coordinatori", più persone) |
| `scripts/qonto-oauth-login.mjs` | login OAuth dal Mac (ogni 90 giorni, o dopo aver rigenerato il client secret) |
| `scripts/provision-qonto-sottoconti.mjs` | crea/rinomina i sottoconti dai centri di costo attivi (dry-run di default) |

## Da fare

- quali spese passano dalla cassa del servizio (solo carte o anche bonifici fornitori) → poi
  "impegnato" (acquisti approvati non pagati) e "disponibile vero";
- ricariche dei sottoconti come giroconti interni, marcati `giroconto = true` nel registro;
- aggiornare la sezione "I conti e le carte" di `controllo-di-gestione-piano.md`: il CC ora arriva
  dal conto, non dall'etichetta sulla spesa.
