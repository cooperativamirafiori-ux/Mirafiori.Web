# Timbrature — flusso di validazione mensile

Sostituisce il vecchio schema "correzioni fino al 5 del mese successivo + chiusura HR".

## Il percorso del mese

| Stato | Chi ha la palla | Cosa può fare |
|---|---|---|
| **In compilazione** (`aperto`) | il dipendente | inserisce le ore di **oggi e dei 2 giorni precedenti**; ferie/permessi/malattia senza limiti di data |
| **Da validare** (`da_validare`) | il responsabile | controlla, corregge le righe, valida |
| **Attesa conferma** (`validato`) | il dipendente | ha ricevuto il PDF via mail: conferma o segnala un errore |
| **Confermato** (`confermato`) | nessuno | PDF definitivo nella cartella personale |
| **Contestato** (`contestato`) | il responsabile | corregge e valida di nuovo |

**Quando si chiude il mese.** La finestra è di 3 giorni per ogni singola giornata, quindi
l'ultimo giorno del mese resta modificabile per altri 2 giorni: un mese di 31 giorni si
chiude **il 3 del mese successivo**. È la stessa data per tutti.

## Le regole, e perché

- **3 giorni per le ore di lavoro.** È il vincolo che fa compilare il foglio giorno per
  giorno invece che a fine mese.
- **Ferie, permessi e malattia sono esenti.** Si programmano prima di partire (ed è così
  che si evita di sollecitare chi è in vacanza) e il certificato arriva quando arriva.
- **Il responsabile può correggere.** Scaduti i 3 giorni il dipendente è bloccato, ma il
  responsabile può aggiungere o correggere le righe dei suoi finché non valida. Senza
  questa valvola, una malattia o una dimenticanza diventerebbero ore perse — e le ore
  lavorate si pagano.
- **Le righe scritte da altri si vedono.** Sono marcate "per conto" nel cruscotto, nella
  pagina di conferma e nel PDF. La conferma del dipendente ha senso solo se sa cosa sta
  confermando.
- **Nessuna conferma automatica.** Se il dipendente non risponde il foglio resta in
  sospeso e riceve un promemoria ogni giorno; è il responsabile che, se serve, chiude
  d'ufficio. Resta scritto sul documento che l'ok è presunto e non dato.

## Chi valida

Non è un permesso da assegnare: **si è responsabile perché qualcuno ti indica come
"Referente foglio ore"** sulla propria scheda in Risorse Umane. Il cruscotto mostra solo
i propri collaboratori.

- Nessuno valida sé stesso.
- Referente vuoto ⇒ il foglio è in carico alle Risorse Umane, che nel cruscotto vedono
  l'elenco dei "senza referente".
- Le HR (permesso `Timbrature HR`) vedono tutti, possono validare al posto di un
  responsabile assente e sono le sole a poter riaprire un mese.

Ingressi: `/timbrature/validazione` per i responsabili, `/risorse-umane/timbrature` per le HR
(è la stessa pagina).

## Le mail

| Quando | A chi | Cosa |
|---|---|---|
| ogni sera (`/api/cron/timbrature-alert`) | dipendente | giornate senza ore che si chiudono entro domani, con avviso che poi le ore non vengono conteggiate |
| ogni mattina, giorni 1–2 | dipendente | il mese sta per chiudersi e ci sono buchi |
| il 3, e poi ogni giorno | responsabile | elenco dei fogli da validare |
| alla validazione | dipendente | PDF del foglio ore + pulsanti *Confermo* / *Segnalo un errore* |
| ogni giorno finché non risponde | dipendente | promemoria di conferma |
| alla contestazione | responsabile | cosa non torna, per correggere |

I pulsanti nella mail portano a `/foglio-ore/<token>`: nessun login, come per la conferma
consegna degli Acquisti. Il token si azzera appena usato.

## Il PDF

Non c'è nessuna libreria PDF nel progetto. Il foglio ore viene generato in Excel, caricato
nella cartella personale e **convertito da Microsoft Graph** (`?format=pdf`). Nella cartella
finiscono entrambi: `.xlsx` per la rendicontazione, `.pdf` come copia da confermare.
Se la conversione fallisce la validazione va comunque a buon fine e la mail parte senza
allegato (il cruscotto lo segnala).

## Da fare una volta sola

Eseguire la migrazione nel SQL editor di Supabase:

```
web/supabase/timbrature_validazione.sql
```

Aggiunge gli stati nuovi, le colonne del percorso di validazione, il tracciamento delle
righe scritte per conto e l'indice sul referente. I mesi già chiusi con il vecchio flusso
vengono convertiti in `confermato`.

Poi, in anagrafica RU, verificare che **ogni persona che timbra abbia il Referente foglio
ore compilato** con la mail aziendale giusta: chi non lo ha resta in carico alle HR.

## Trappola nota

Se il **monte ore non è impostato**, le ore attese sono 0, ogni giornata risulta completa
e **nessun alert parte mai**. Il drawer del cruscotto lo segnala quando le ore attese del
mese sono zero.
