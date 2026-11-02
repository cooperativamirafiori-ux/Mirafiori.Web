# Assistente "?" — aiuto all'uso dell'app

Deciso con Dennis il 30 ott 2026. Un bottone tondo «?» in basso a destra su tutte le pagine
dell'app apre una chat: la persona chiede come si fa una cosa, l'assistente risponde
usando **solo** la guida d'uso in `guida/` e dà il link diretto alla pagina, oppure dice
che serve un permesso.

## Decisioni di Dennis

- Aperto a **tutti** quelli che entrano nell'app.
- **Registro delle domande anonimo**.
- Deve dare **il link diretto** alla pagina giusta, o dire che non si ha il permesso.
- Prima le guide di tutte le aree, poi l'assistente che le usa.

## Come funziona

| Pezzo | File |
|---|---|
| Bottone e chat (montati una volta in `app/(app)/layout.tsx`) | `components/assistente/Assistente.tsx` |
| Domanda → risposta | `app/api/assistente/route.ts` → `lib/assistente/chiedi.ts` |
| "Ti è stata utile?" | `app/api/assistente/[id]/route.ts` |
| Lettura della guida e delle schede | `lib/assistente/guida.ts` |
| Chi è la persona, nel vocabolario della guida | `lib/assistente/profilo.ts` |
| Registro anonimo e tetto giornaliero | `lib/assistente/registro.ts`, `supabase/assistente.sql` |
| Schermata del registro | `app/(app)/amministrazione/domande-assistente/` (permesso Amministrazione) |

**Link e permessi non li decide il modello.** Ogni guida ha in testa una scheda con
percorso, titolo e `accesso` di ogni pagina (vocabolario in `guida/LEGGIMI.md`). Il server
calcola le voci della persona (permessi, admin, gruppo RU, coordinatore, responsabile
timbrature), passa all'assistente l'elenco delle pagine con «può aprire: sì/no», e alla fine
**ricontrolla ogni link** della risposta (`ripulisciLink`): un link a una pagina che la
persona non può aprire diventa testo semplice.

**Il registro è anonimo davvero.** Due tabelle non collegate:
- `assistente_domanda`: pagina, domanda, risposta, utile sì/no — nessun dato su chi;
- `assistente_uso`: solo un contatore giornaliero per il tetto di domande, con un'impronta
  che cambia ogni giorno (sha256 di mail + giorno + `AUTH_SECRET`). Si cancella dopo 7 giorni.

## Modello e costi

- Modello: `claude-haiku-5-5` (cambiabile con la variabile `ASSISTENTE_MODELLO`).
  Stessa chiave della lettura documenti: `ANTHROPIC_API_KEY`.
- Tetto: 40 domande al giorno per persona (`ASSISTENTE_LIMITE_GIORNO`).

### ⚠️ La soglia dei 100.000 token — e perché si mandano solo alcune guide

Per Haiku 5.5, una richiesta che supera i **100.000 token di ingresso** paga **tutto**
(ingresso, cache, risposta) a prezzo quintuplo. La cache conta per la soglia. A fine ott
2026 la guida intera pesava ~89.000 token: ogni domanda era a un passo dalla soglia.

**Dal 1 nov 2026 l'assistente non manda più tutta la guida** (`lib/assistente/scelta.ts`):

1. una prima chiamata a Haiku, piccola (~2.000 token: l'indice delle aree con descrizione
   e titoli delle pagine, più le ultime due battute), risponde `{"aree":[…]}` con al massimo
   3 guide utili;
2. la domanda vera riceve: guida **generale** (sempre) + guida dell'**area della pagina
   aperta** + le guide scelte. L'elenco di **tutte** le pagine con i permessi resta, così
   l'assistente sa comunque dove mandare la persona;
3. se la scelta fallisce (errore, niente JSON, oltre 8 secondi) si mandano **tutte** le
   guide come prima: la risposta arriva lo stesso, a prezzo pieno. Nei log Vercel ogni
   domanda scrive `[assistente] guide scelte|tutte: … — N token`.

Cache di un'ora su due blocchi: istruzioni + generale (uguale per tutti) e le guide scelte,
sempre nell'ordine dei file, così le stesse aree nell'ora si leggono dalla cache.

Ordine di grandezza (prezzi di nov 2026): una domanda pesa 10–30.000 token invece di
~90.000; nel caso peggiore (le 4 guide più pesanti) ~50.000. La chiamata di scelta costa
circa 0,02 centesimi.

`node scripts/controlla-guida.mjs` stampa il peso totale e quello della richiesta più pesante;
avvisa se questa supera 92.000, se tutta la guida supera 95.000 (il ripiego sforerebbe) e se
una singola guida supera 25.000 token (meglio dividerla). Non accorciare le guide per stare
sotto: sono anche il manuale per le persone.

## Verifica fatta (30 ott 2026)

Prova con la chiave vera e profili finti: "dove trovo i ruoli responsabili e coordinatori?"
→ senza permesso spiega che serve Amministrazione e non dà il link; con il permesso dà
`/amministrazione/centri-costo`. Mutua, fattura con Satispay, domanda fuori tema e
approvazione sopra soglia con il solo permesso Pagamenti: risposte corrette, 3-7 secondi.

## Da tenere a mente

- **La guida va tenuta aggiornata** (regola 11 in `CLAUDE.md`): l'assistente non sa niente
  che non sia scritto lì.
- Pagine con una barra di bottoni fissa in fondo: il «?» si alza, elenco
  `CON_BARRA_IN_FONDO` in `Assistente.tsx`.
- Anthropic va nel registro dei trattamenti GDPR anche per questo uso (le domande possono
  contenere dati personali, nonostante l'avviso nella chat).
