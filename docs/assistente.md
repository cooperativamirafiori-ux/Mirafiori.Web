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
- Tutta la guida va nel prompt di sistema con **cache di un'ora**: dalla seconda domanda
  dell'ora si paga la lettura in cache (0,01 $/milione di token).
- Ordine di grandezza (prezzi di ott 2026, guida da ~85.000 token): circa 0,1 centesimi a
  domanda con la cache calda, circa 2 centesimi per la prima domanda dell'ora.
- Tetto: 40 domande al giorno per persona (`ASSISTENTE_LIMITE_GIORNO`).

### ⚠️ La soglia dei 100.000 token

Per Haiku 5.5, una richiesta che supera i **100.000 token di ingresso** paga **tutto** a
prezzo quintuplo. A ott 2026 la guida ne pesa ~85.000. `node scripts/controlla-guida.mjs`
stampa la stima e avvisa sopra i 92.000; il server scrive un avviso nei log sopra i 95.000.

Quando ci si arriva, la strada è mandare solo le guide che servono: `generale.md` sempre,
più quella dell'area della pagina corrente e quelle delle aree nominate nella domanda.
Non accorciare le guide per stare sotto: sono anche il manuale per le persone.

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
