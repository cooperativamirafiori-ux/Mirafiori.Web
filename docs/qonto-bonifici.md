# Qonto · richieste di bonifico dall'app

Decisioni con Dennis del 26/09/2026.

## Il giro

1. La fattura ha un **servizio** (centro di costo): lo segna il coordinatore
   (Fatture del servizio) o chi paga (menu sulla riga di Flussi fatture).
2. Sopra soglia, qualcuno con "Approvazione Pagamenti" la approva nell'app.
3. Chi ha "Pagamenti" (Claudia) seleziona le righe da pagare e preme
   **Invia a Qonto**. L'app crea **una richiesta per sottoconto**
   (`POST /v2/requests/multi_transfers`), dal sottoconto del servizio:
   importo della scadenza, IBAN della riga, beneficiario = fornitore,
   causale "Fatt. N del GG/MM/AAAA".
4. La richiesta risulta **a nome di Dennis** (account del login OAuth) e la
   **approva Claudia** nell'app Qonto, con la conferma di sicurezza. Qonto non
   lascia approvare chi l'ha creata. **L'app non approva mai.**
5. Allineamento (giro notturno, e all'apertura di Flussi fatture al massimo una
   volta al minuto): richiesta approvata → scadenza **pagata**, origine "banca",
   data = quando Qonto l'ha processata; rifiutata o annullata → torna inviabile,
   con il motivo sulla riga.

## Cosa non parte

Non "da pagare"; già inviata e non rifiutata; uscita senza fattura; importo ≤ 0;
blocco IBAN (mancante o cambiato); IBAN non valido; senza servizio; servizio
senza sottoconto (Locanda, cc2). L'app dice il motivo riga per riga.

## Perché OAuth (e come non bruciare il token)

- La chiave API risponde **401 "OAuth2 authentication is required here"** alla
  creazione della richiesta, anche se la documentazione dice il contrario.
- Il token sta in Supabase, tabella `qonto_token` (una riga, RLS senza policy).
- Il **refresh token è monouso**: chi rinnova prende prima il turno
  (`rinnovo_fino`, update condizionato); gli altri aspettano e rileggono.
- Vale ~90 giorni dall'ultimo rinnovo: il giro notturno lo rinnova quando ha più
  di 30 giorni (`mantieniVivo`).
- **Mac e app non devono usare lo stesso token**: `qonto-oauth-a-supabase.mjs`
  rinomina il file locale. Uno script del Mac che serva OAuth rifà il login e
  ottiene un accesso suo.

## Doppio invio

Prima della chiamata le righe si prenotano (`qonto_stato = 'invio'`, update
condizionato). La chiave di idempotenza è l'impronta delle scadenze del gruppo:
un nuovo tentativo sullo stesso gruppo non crea una seconda richiesta.

## Messa in servizio (dal Mac, cartella web/)

1. (Consigliato) Rigenera il client secret sul Developer Portal Qonto e mettilo in `.env.local`.
2. `node scripts/qonto-oauth-login.mjs` — login con l'account di Dennis, permessi con `request_transfers.write`.
3. `node scripts/qonto-env-vercel.mjs` — chiave API e credenziali OAuth su Vercel.
4. `node scripts/qonto-oauth-a-supabase.mjs` — il token passa all'app.
5. Deploy.

Prova: `scripts/qonto-prova-richiesta.mjs ccN --crea --oauth` (0,01 € dal
sottoconto al principale, da rifiutare).

## Da fare

- Allegare il PDF della fattura alla richiesta (`attachment.write`, già nei permessi del login).
- Scegliere la data di esecuzione (oggi: il primo giorno bancario dopo l'approvazione).
