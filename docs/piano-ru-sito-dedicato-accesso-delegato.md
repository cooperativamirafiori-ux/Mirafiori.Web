# Piano tecnico — Risorse Umane su sito SharePoint dedicato con accesso delegato

Versione 1 — 30/07/2026

## 0. Obiettivo

Per la **sola** area Risorse Umane (gestione anagrafiche e documenti sensibili):

1. spostare liste e cartelle su un **sito SharePoint dedicato**;
2. far scrivere l'applicazione con l'**identità dell'utente** (accesso delegato), così che
   il log nativo Microsoft — colonne "Creato/Modificato da", cronologia versioni e registro
   Purview — riporti la persona reale.

Fuori perimetro: timbrature, prestazioni occasionali, manutenzioni, costi, software,
permessi. Restano invariati, con identità applicativa sul sito attuale.

**Nessuno scorporo in una seconda app**: l'area è già isolata in un unico modulo
(`lib/risorse-umane.ts`) e una seconda app duplicherebbe autenticazione, sistema permessi
e componenti UI senza aggiungere isolamento.

## 1. Stato attuale accertato dal codice

**Perimetro dati**: due liste — `Dipendenti` (include i collaboratori, distinti dal campo
`CategoriaRU`; la vecchia lista Collaboratori è già stata dismessa) e `Tirocini` — più la
raccolta documenti con le cartelle personali sotto `SP_RU_FOLDER`
(default `Risorse Umane/Dipendenti`).

**Unico punto di accesso**: `lib/risorse-umane.ts`. Legge `SHAREPOINT_SITE_ID`,
`SP_LIST_DIPENDENTI`, `SP_LIST_TIROCINI`, `SP_RU_FOLDER`, `SP_RU_DRIVE_ID` (opzionale) e usa
`graphGet`, `graphGetOrNull`, `graphPost`, `graphPatch`, `graphDelete`, `graphPutBinary`
da `lib/graph.ts` (tutte app-only).

**Funzioni da convertire** (9 esportate + 3 interne):
`getItems`, `getItem`, `creaItem`, `aggiornaItem`, `eliminaItem`,
`ensureCartellaDipendente`, `getDocumentiDipendente`, `caricaDocumentoDipendente`,
`eliminaDocumentoDipendente`; internamente `getDriveId`, `ensureFolderPath`.

**Chiamanti da aggiornare** (6):

| File | Contesto |
|---|---|
| `lib/ru-api.ts` (factory `listHandlers`/`itemHandlers`/`exportHandler`) | API route, sessione presente |
| `app/api/risorse-umane/dipendenti/[id]/cartella/route.ts` | API route |
| `app/api/risorse-umane/dipendenti/[id]/documenti/route.ts` | API route |
| `app/api/risorse-umane/dipendenti/[id]/documenti/[docId]/route.ts` | API route |
| `app/(app)/risorse-umane/PaginaRU.tsx` | Server Component (usa `auth()`) |
| `lib/foglio-ore-xlsx.ts` (import dinamico) | chiamato da `api/timbrature/hr/chiudi` |

**Dipendenze incrociate verificate**: nessun cron tocca le liste RU. `getDipendenti()` di
`lib/timbrature.ts` legge Supabase, non SharePoint. L'unico contatto esterno è
`lib/foglio-ore-xlsx.ts`, che alla chiusura mensile scrive il foglio ore nella cartella
personale: è azionato da una route protetta dallo stesso permesso "Risorse Umane", quindi
c'è sempre un utente HR autenticato. Funziona in delegato senza eccezioni.

**Autenticazione attuale**: `lib/auth.ts`, NextAuth v5 con provider `MicrosoftEntraID`,
scope `openid profile email`, nessun callback `jwt`, callback `session` che arricchisce con
`isAdmin` e `permessi` letti da SharePoint. **Verificato: `AUTH_MICROSOFT_ENTRA_ID_ID` e
`GRAPH_CLIENT_ID` sono la stessa app registration, sullo stesso tenant** — quindi basta
aggiungere i permessi delegati alla registrazione esistente.

## 2. Architettura target

```
                    ┌─────────────────────────────────────┐
 Utente HR ────────▶│  App Mirafiori (unica, su Vercel)   │
                    └──────────┬──────────────┬───────────┘
                               │              │
              token UTENTE     │              │   token APP (client credentials)
              (delegato)       │              │
                               ▼              ▼
                  ┌──────────────────┐  ┌────────────────────────────┐
                  │ Sito SP          │  │ Sito SP                    │
                  │ Risorse Umane    │  │ gruppo_ControlloGestione   │
                  │ • Dipendenti     │  │ • Manutenzioni, Costi,     │
                  │ • Tirocini       │  │   Software, Prestazioni,   │
                  │ • Documenti/     │  │   Autorizzazioni, Log      │
                  │   cartelle       │  │                            │
                  └──────────────────┘  └────────────────────────────┘
                     log nativo MS         log applicativo
                     con nome reale        (identità app)
```

Il log applicativo ("Log Attività") **resta** e continua a essere scritto con identità
applicativa sul sito attuale: serve per la granularità funzionale che il log nativo non ha
(esportazione elenco in Excel, generazione documenti).

## 3. Fase 1 — Sito SharePoint dedicato

**Tipo di sito** — *rivisto il 30/07/2026*. Il piano prevedeva un *Communication site* senza
gruppo Microsoft 365. Il sito che esiste è invece un **Team site `GROUP#0`** con gruppo M365
collegato (`82c6267d-1e45-4b57-b0dc-3772d1f32a4b`), **Teams attivo** e canale General con
contenuti dal 29/09/2025: preesisteva come sito di lavoro dell'HR, quindi **non si ricrea**.

**Permessi** — *rivisti il 30/07/2026*. Il gruppo di sicurezza `RU-Gestione` è stato creato e
poi eliminato: i suoi membri coincidevano esattamente con quelli del gruppo M365, e due liste
identiche gestite in due posti diversi divergono col tempo. Decisione di Dennis: **un solo
meccanismo**, l'appartenenza al gruppo M365.

```
Chi accede ai dati RU  =  membri del gruppo M365 "Risorse Umane"
```

Conseguenza da presidiare: aggiungere una persona al Teams dell'HR le dà accesso alle
anagrafiche complete. Va scritto nell'informativa art. 4 co. 3 e detto al proprietario del
gruppo (Stefano Martino, unico proprietario). Se in futuro il Teams si allarga oltre chi
tratta il personale, l'alternativa è interrompere l'ereditarietà dei permessi sulle due liste
e sulla cartella `Risorse Umane App` — a livello di lista/cartella, non per singolo record.

Stato accertato e corretto sul sito (dettagli e comandi in `runbook-ru-passo2-3.md` §2.1-bis
e §2.3): Membri contiene solo il gruppo M365, Visitatori vuoto, nessun "Tutti tranne gli
utenti esterni", nessun utente esterno, condivisione esterna **disattivata**, collegamenti
"tutta l'organizzazione" **disattivati**, link predefinito impostato su "persone specifiche,
sola lettura". Dennis aggiunto come amministratore della raccolta siti.

**Impostazioni da non dimenticare** (sono ciò che dà valore al log nativo):

- su **entrambe le liste**: Impostazioni elenco → Impostazioni versioni → attivare la
  cronologia versioni e alzare il numero di versioni conservate (es. 500). È la cronologia
  che conserva i **valori precedenti** dei campi;
- sulla **raccolta documenti**: versioning attivo, limite adeguato;
- verificare la retention del Cestino (93 giorni) e la politica di conservazione del tenant.

**Raccolta documenti**: la raccolta predefinita del sito (il codice risolve il drive con
`/sites/{site}/drive`). Sul sito creato si chiama **`Documenti condivisi`** e contiene già la
cartella `Risorse Umane App`, quindi il prefisso di percorso è
`SP_RU_FOLDER=Risorse Umane App/Dipendenti` — la sottocartella `Dipendenti` la crea l'app al
primo accesso tramite `ensureFolderPath`.

## 4. Fase 2 — Permessi Entra ID

Sulla app registration esistente (`8ee54c61-…`, che serve sia il login sia Graph app-only).

### 4.1 Permesso delegato: `Sites.Selected`

**API permissions → Microsoft Graph → Delegated**: aggiungere **`Sites.Selected`** e
`offline_access`, con consenso amministratore.

In `lib/auth.ts`, `authorization.params.scope` diventa:
`openid profile email offline_access https://graph.microsoft.com/Sites.Selected`

Perché `Sites.Selected` e non `Sites.ReadWrite.All` delegato: quest'ultimo permetterebbe
all'applicazione di operare, a nome dell'utente, su **qualunque** sito a cui quella persona
ha accesso (intranet, team site del suo reparto). `Sites.Selected` non concede nulla da sé:
l'accesso esiste solo sui siti espressamente concessi, e su tutto il resto Graph risponde
403.

Ne risulta il minimo possibile:

```
accesso effettivo = (siti concessi all'app) ∩ (diritti SharePoint reali dell'utente)
```

Se la persona non è nel gruppo `RU-Gestione`, riceve 403 anche se l'app ha il grant sul
sito. E viceversa.

**Igiene degli altri scope delegati (accertato il 30/07/2026).** Il ragionamento sopra
regge solo se `Sites.Selected` è l'**unico** permesso SharePoint delegato consentito: Entra
può includere nel token tutti gli scope consentiti per la risorsa, non solo quelli chiesti
nella singola richiesta di autorizzazione. Sulla registrazione risultava già consentito un
delegato `Sites.Manage.All` — mai usato, perché fino a oggi l'app non faceva chiamate Graph
in delega — che avrebbe permesso di operare a nome dell'utente su qualunque sito a cui ha
accesso. È stato rimosso. Scope delegati consentiti ora: `User.Read`, `Sites.Selected`,
`offline_access`. Da ricontrollare se in futuro si aggiungono permessi delegati.

### 4.2 Grant sul sito (obbligatorio, altrimenti 403 su tutto)

`Sites.Selected` richiede una concessione esplicita per sito. Si dà con PnP PowerShell come
amministratore SharePoint:

```powershell
Connect-PnPOnline -Url https://<tenant>.sharepoint.com/sites/RisorseUmane -Interactive
Grant-PnPAzureADAppSitePermission `
  -AppId 8ee54c61-2475-4069-bd6e-a8fccfc7b292 `
  -DisplayName "App Mirafiori" `
  -Permissions Write `
  -Site https://<tenant>.sharepoint.com/sites/RisorseUmane
```

Alternativa via Graph: `POST /sites/{siteId}/permissions`, che però richiede
`Sites.FullControl.All` — con PnP si evita di introdurre quel permesso.

Verifica del grant: `Get-PnPAzureADAppSitePermission -Site <url>`.

### 4.3 Limite documentato, verificato non applicabile

Con `Sites.Selected` la ricerca Graph (`/search/query`) non funziona: richiederebbe
`Sites.Read.All`. Verificato che l'applicazione non usa la ricerca Graph in nessun punto,
quindi non ci riguarda. Da ricordare se in futuro si volesse una ricerca full-text sui
documenti RU.

### 4.4 Permesso applicativo: invariato per ora

`Sites.ReadWrite.All` **Application** resta com'è: tutti gli altri moduli continuano a
funzionare e il rischio di questa fase è nullo. Il passaggio anche dell'applicativo a
`Sites.Selected` resta il passo rimandato del punto 9, e sarà più semplice perché il
meccanismo dei grant sarà già noto.

## 5. Fase 3 — Gestione dei token delegati

### 5.1 Dove conservarli

**Non nel cookie di sessione.** Un access token Graph pesa 2-3 KB e il refresh token circa
1 KB: si supera il limite di 4 KB del cookie e NextAuth lo spezza in più parti, con
comportamenti fragili.

Soluzione: tabella su Supabase (già presente nel progetto, con service role key
server-side).

```sql
create table ms_token (
  email        text primary key,
  access_token text not null,   -- cifrato
  refresh_token text not null,  -- cifrato
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);
```

Cifratura AES-256-GCM con chiave da env `TOKEN_ENC_KEY` (32 byte, base64), tramite
`node:crypto`. La tabella non va esposta a nessuna API pubblica; RLS attiva e nessuna policy
(l'accesso avviene solo con service role key).

### 5.2 Salvataggio al login

In `lib/auth.ts`, aggiungere il callback `jwt`: al primo login (`account` presente) salvare
`access_token`, `refresh_token` e `expires_at` nella tabella, indicizzati per email.
Nel JWT non finisce nulla di nuovo.

### 5.3 Rinnovo

Nuovo modulo `lib/ms-token.ts`:

```
getDelegatedToken(email): Promise<string>
```

- legge la riga; se `expires_at` è oltre 5 minuti nel futuro restituisce il token;
- altrimenti chiama `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
  con `grant_type=refresh_token`, aggiorna la riga (Entra ruota il refresh token: va
  riscritto) e restituisce il nuovo access token;
- se il refresh fallisce, lancia un errore tipizzato `RiautenticazioneRichiesta`.

Gestione della concorrenza: due richieste simultanee possono tentare il refresh insieme.
Accettabile (Entra tollera il riuso del refresh token per una breve finestra), ma conviene
un `update ... where updated_at = <valore letto>` per far vincere una sola scrittura.

### 5.4 Errori verso l'utente

| Situazione | Comportamento |
|---|---|
| Refresh fallito / token revocato | API risponde `401` con `{ codice: 'riautenticazione' }`; il frontend mostra "Sessione scaduta" e reindirizza a `signIn` |
| Utente senza permessi sul sito RU (403 da Graph) | Messaggio esplicito: "Non hai i permessi sul sito Risorse Umane. Contatta Amministrazione." |
| Utente con solo lettura | Lettura ok, scrittura → stesso messaggio, ma in fase di salvataggio |

Senza questa traduzione degli errori, ogni problema di permessi diventa una richiesta di
assistenza.

## 6. Fase 4 — Client Graph delegato e switch del modulo RU

### 6.1 `lib/graph-delegato.ts`

Espone le stesse operazioni di `lib/graph.ts` (`get`, `getOrNull`, `post`, `patch`, `del`,
`putBinary`) ma con il token dell'utente:

```ts
export async function graphPerUtente(email: string): Promise<GraphClient>
```

**Vincolo critico**: nessuna cache a livello di modulo del token, a differenza di
`lib/graph.ts` che cacha il token applicativo in `_tokenCache`. Le funzioni serverless
vengono riutilizzate fra richieste di utenti diversi: una cache globale significherebbe
operare con l'identità di un'altra persona. La cache va tenuta solo dentro l'oggetto client,
per la durata della singola richiesta.

`_driveIdCache` in `lib/risorse-umane.ts` può invece restare: il drive id è una proprietà del
sito, non dell'utente.

### 6.2 `lib/risorse-umane.ts`

Aggiungere come primo parametro il client a tutte le funzioni esportate:

```ts
export async function getItems(g: GraphClient, entity: RUEntity): Promise<RURecord[]>
```

Scelta consapevole: parametro esplicito anziché variabile di contesto implicita
(`AsyncLocalStorage`). È più verboso ma rende evidente in ogni punto con quale identità si
sta scrivendo — su dati RU è un vantaggio, non un costo.

`SITE()` legge la nuova env `SP_SITE_RU`.

### 6.3 Chiamanti

I sei file elencati al punto 1 costruiscono il client da
`session.user.email` e lo passano. In `lib/ru-api.ts` il client si crea una volta dopo
`guardArea(AREA_RU)`, che già garantisce la sessione.

Per `lib/foglio-ore-xlsx.ts`: riceve il client dal chiamante
(`api/timbrature/hr/chiudi`). Se in futuro la chiusura mensile diventasse automatica, quel
percorso non avrebbe più un utente: prevedere già ora un fallback app-only **esplicito e
commentato**, non implicito.

### 6.4 Cosa non cambia

`logAzione` resta identica (identità app, sito attuale). Le pagine, i form, lo schema
`RU_CONFIG`, l'export xlsx e la struttura delle cartelle non si toccano.

## 7. Fase 5 — Migrazione dati

Nuovo script `scripts/migra-ru-sito-dedicato.mjs`, eseguito con identità applicativa
(più semplice: nessun token utente da gestire in uno script batch).

1. Legge le liste sorgente con tutti i campi.
2. Provisiona le liste sul nuovo sito riusando la logica di
   `scripts/provision-risorse-umane.mjs`, parametrizzando il site id (oggi legge
   `SHAREPOINT_SITE_ID`: va reso configurabile via argomento).
3. Ricrea gli item, **preservando `IdAccess`**, e tiene una mappa
   `vecchio spItemId → nuovo spItemId`.
4. Copia le cartelle personali con `POST /drives/{id}/items/{id}/copy` verso il nuovo drive
   (operazione asincrona: serve polling sull'header `Location`). Preferibile al
   download+upload perché non ha il limite dei 4 MB.
5. Ricalcola `CartellaUrl` sui nuovi item.
6. Stampa un report: item per lista, file copiati, eventuali scarti.

**Conseguenza da accettare**: gli `spItemId` cambiano. Il log applicativo esistente contiene
i vecchi id nella colonna `EntitaId`: le righe storiche non saranno più risolvibili verso
l'item. Va annotato nella documentazione del log. Verificato che Supabase (timbrature) non
referenzia gli spItemId RU — la corrispondenza avviene per email.

**Non eliminare subito le liste di partenza**: rinominarle
(es. `ZZ_Dipendenti_dismessa`), togliere i permessi e conservarle qualche settimana.

## 8. Fase 6 — Variabili d'ambiente

Nuove o modificate:

| Variabile | Valore |
|---|---|
| `SP_SITE_RU` | site id di `https://coopmirafiorionlus.sharepoint.com/sites/RisorseUmane` |
| `SP_LIST_DIPENDENTI` | nuovo GUID |
| `SP_LIST_TIROCINI` | nuovo GUID |
| `SP_RU_FOLDER` | `Risorse Umane App/Dipendenti` |
| `SP_RU_DRIVE_ID` | drive id di `Documenti condivisi` sul nuovo sito (evita una chiamata) |
| `TOKEN_ENC_KEY` | chiave AES-256 in base64 |

Da impostare in `.env.local` e su Vercel (production, preview, development) — comandi CLI
pronti al momento dell'esecuzione.

## 9. Fase 7 — Governance

- **Retention del log applicativo**: cron che elimina le righe oltre i 12 mesi
  (l'infrastruttura cron su Vercel esiste già).
- **Retention Purview**: verificare la licenza. Con Audit Standard la conservazione è
  intorno ai 180 giorni; se serve un orizzonte più lungo per il valore probatorio, occorre
  un piano superiore o un export periodico.
- **Informativa (art. 4 co. 3 Statuto dei Lavoratori)**: va documentato che gli addetti HR
  accedono ai dati anche direttamente da SharePoint/OneDrive e che le loro azioni — comprese
  le **consultazioni**, che con il delegato Purview registra col nome reale — sono tracciate.
- **`Sites.Selected`**: dopo il collaudo, valutare la sostituzione di `Sites.ReadWrite.All`
  applicativo, concedendo esplicitamente il solo sito `gruppo_ControlloGestione`. Da testare
  modulo per modulo.
- Aggiornare `Domande_Consulenti_Log_Attivita_GDPR.md` con l'assetto scelto.

## 10. Checklist di collaudo

Funzionale:

- [ ] elenco Dipendenti e Tirocini, filtri, ordinamento
- [ ] creazione, modifica, eliminazione di un record
- [ ] export xlsx con selezione colonne, nel rispetto dei filtri visibili
- [ ] apertura cartella personale su un dipendente che non ne ha ancora una (creazione)
- [ ] upload documento, elenco, eliminazione
- [ ] chiusura mensile timbrature → il foglio ore finisce nella cartella personale
- [ ] filtro `CategoriaRU=Collaboratore` sulla vista collaboratori

Identità e log:

- [ ] su un item appena modificato, "Modificato da" in SharePoint riporta la persona reale
- [ ] la cronologia versioni mostra i valori precedenti
- [ ] Purview registra l'accesso a un file della cartella personale col nome reale
- [ ] il log applicativo continua a registrare l'azione funzionale

Casi limite:

- [ ] utente autenticato ma non nel gruppo `RU-Gestione` → messaggio chiaro, non stack trace
- [ ] utente con sola lettura → errore comprensibile al salvataggio
- [ ] token scaduto durante la sessione → rinnovo silenzioso
- [ ] refresh token revocato → redirect al login senza perdita di dati già salvati
- [ ] due utenti diversi in richieste ravvicinate → nessuno scambio di identità
      (verifica della non-cache del token)

## 11. Rischi e punti da verificare prima di iniziare

1. **Conditional Access — il rischio più concreto.** Se il tenant ha policy che richiedono
   dispositivo conforme o hybrid-joined, il rinnovo del token effettuato **da un server**
   (Vercel) non ha contesto di dispositivo e può essere rifiutato. Va verificato con
   l'amministratore del tenant **prima** di scrivere codice: è l'unica condizione che
   potrebbe rendere impraticabile l'intero approccio.
2. **MFA con riautenticazione frequente**: se le policy forzano il re-login a intervalli
   brevi, gli HR incontreranno redirect al login più spesso. Nei form lunghi serve un
   refresh preventivo all'apertura, o il salvataggio di una bozza locale.
3. **Retention Purview** inferiore alle aspettative (punto 9).
4. **Cambio degli spItemId** e log storico non più risolvibile (punto 7).
5. **`Sites.Selected`**: da non affrontare nello stesso rilascio.

## 12. Ordine di esecuzione consigliato

1. **Verifiche di fattibilità**: Conditional Access, licenza Purview. *(nessun codice)*
2. **Permessi Entra**: `Sites.Selected` + `offline_access` delegati, consenso amministratore.
3. **Nuovo sito RU + provisioning liste a vuoto + grant PnP** sul nuovo sito.
4. **Accesso delegato**: tabella token, `lib/ms-token.ts`, client delegato, switch di
   `lib/risorse-umane.ts`. Prima prova direttamente sul sito RU, che a questo punto esiste.
5. **Migrazione di prova** e confronto dei conteggi.
6. **Cutover**: aggiornamento env, migrazione definitiva, collaudo con la checklist.
7. **Governance**: retention, informativa, documento consulenti.
8. *(rimandato)* `Sites.Selected` anche per l'identità applicativa.

**Nota sull'ordine.** Il sito RU viene creato *prima* di provare il delegato (al contrario
della versione 1 di questo piano): con `Sites.Selected` il grant si dà su un sito specifico,
e conviene darlo direttamente sul bersaglio finale anziché concederlo e revocarlo sul sito
principale.

**Nota sul debug della prima prova.** Con `Sites.Selected` un 403 di Graph può avere tre
cause — Conditional Access, grant di sito mancante, diritti utente insufficienti — e il
messaggio è lo stesso. Conviene quindi procedere in scaletta: ottenimento del token →
`GET /sites/{ru}` → `GET` della lista → `PATCH` di un item di prova. Il primo passo che
fallisce indica quale dei tre livelli non è a posto.

---

## 14. Permessi dell'app dopo il passaggio al delegato — da fare

**Problema accertato il 31/07/2026.** Il permesso `"Risorse Umane"` della lista SP
Autorizzazioni governa **due cose diverse**:

| Cosa apre | Dove stanno i dati | È il cancello vero? |
|---|---|---|
| Anagrafiche dipendenti/tirocini | SharePoint, sito RU | **No** — il cancello è l'appartenenza al gruppo M365 |
| Cruscotto HR delle timbrature (`lib/timbrature-guard.ts`, `AREA_HR`) | Supabase | **Sì** — è l'unico controllo esistente |

Sulle anagrafiche il permesso è diventato un filtro di *visibilità*, non di sicurezza. Ne
derivano due incoerenze, oggi innocue perché i due elenchi coincidono, ma destinate a
divergere:

- permesso **sì**, gruppo M365 **no** → vede la voce di menu, entra, prende 403. Vicolo cieco
- permesso **no**, gruppo M365 **sì** → non vede la sezione nell'app, ma legge i dati
  direttamente da SharePoint

### Stato: codice scritto il 31/07/2026, restano due passaggi manuali

- [x] **(C)** `lib/gruppo-ru.ts` — `eMembroGruppoRU()`, cache a TTL 5 min della lista membri
- [x] **(C)** `AREE_PERMESSI`: `"Risorse Umane"` sostituito da `"Timbrature HR"`
- [x] **(C)** `lib/timbrature-guard.ts` usa `"Timbrature HR"`, con **ripiego temporaneo** sul
      permesso storico per non chiudere il cruscotto prima della migrazione delle righe
- [x] **(C)** `guardMembroRU()` in `lib/api-guard.ts`, usata da `ru-api.ts` e dalle 3 route
      cartella/documenti
- [x] **(C)** pagine: `PaginaRU.tsx` e la home usano `membroRU`; la pagina hub RU mostra solo
      le card a cui la persona ha effettivamente accesso, così nessuna card è un vicolo cieco
- [x] **(C)** `SP_GRUPPO_RU_ID` in `.env.local` (fuori dal blocco A/B: serve sempre) e
      aggiunta a `scripts/vercel-env-ru.sh`
- [x] **(D)** permessi Graph **`GroupMember.Read.All`** e **`User.Read.All`** (Application,
      sola lettura) con consenso amministratore — vedi la lezione qui sotto sul perché
      servono entrambi
- [x] **(D)** righe `Timbrature HR` nella lista SP Autorizzazioni
- [x] **(C)** commit `ac73cb9`, env su Vercel (7 × 3 = 21 valori) e deploy in produzione
- [x] **(C)** ripiego sul permesso storico **rimosso** (31/07/2026): `Timbrature HR` è ora
      l'unico permesso che apre il cruscotto presenze. Chi ha solo la vecchia riga
      `Risorse Umane` in lista Autorizzazioni non lo vede più
- [ ] **(D)** verifica in produzione: home → Risorse Umane → tre card, e apertura del
      **Cruscotto Timbrature** (è il punto delicato: dipende solo dal permesso nuovo)

L'unico `'Risorse Umane'` rimasto nel codice è `AREA_RU` in `lib/ru-api.ts`, che è l'etichetta
dei codici azione del log applicativo (`ru.dipendente.crea` ecc.) e non un permesso.
- [ ] **(D)** pulizia: su Vercel resta `SP_LIST_COLLABORATORI`, che punta alla lista dismessa
      nell'unificazione di luglio. Non fa danni (nessun codice la legge più) ma è una variabile
      che mente sullo stato del sistema

### Assetto scelto (Dennis, 31/07/2026)

**Separare le due cose e allineare le anagrafiche al gruppo**, così ogni accesso ha una sola
fonte di verità.

1. **Nuovo permesso `"Timbrature HR"`** in `AREE_PERMESSI` (`lib/sharepoint.ts`), usato da
   `lib/timbrature-guard.ts` al posto di `AREA_HR = 'Risorse Umane'`. Lì resta il cancello
   vero, perché i dati sono su Supabase e SharePoint non c'entra.
   *Migrazione*: per ogni persona che oggi ha `"Risorse Umane"` e usa il cruscotto presenze,
   aggiungere una riga `Timbrature HR` nella lista Autorizzazioni. **Da fare prima** del
   cambio di codice, altrimenti il cruscotto si chiude a tutti.

2. **Visibilità delle anagrafiche derivata dal gruppo M365.** Nuovo
   `lib/gruppo-ru.ts` con `eMembroGruppoRU(email)`: legge i membri del gruppo
   `82c6267d-1e45-4b57-b0dc-3772d1f32a4b` via Graph app-only
   (`GET /groups/{id}/transitiveMembers`), con cache a TTL breve **per gruppo** — la lista è
   una sola e serve tutti gli utenti, quindi una chiamata ogni pochi minuti basta. Il
   callback `session` di `lib/auth.ts` aggiunge `membroRU: boolean`; `guardArea(AREA_RU)`
   sulle route delle anagrafiche viene sostituito da quel controllo.

3. **Rimuovere `"Risorse Umane"` da `AREE_PERMESSI`** una volta completati 1 e 2: non
   servirebbe più a nulla, e lasciarlo sarebbe un interruttore che non comanda niente — il
   modo più sicuro per far credere a qualcuno di aver revocato un accesso.

**Richiede due permessi Graph nuovi** (Application, sola lettura), aggiunti e consentiti con
la stessa procedura del runbook §1:

| Permesso | A cosa serve |
|---|---|
| `GroupMember.Read.All` | sapere chi è nel gruppo |
| `User.Read.All` | leggere email e UPN di quelle persone |

**Lezione dal primo rilascio, che è andato storto.** Con il solo
`GroupMember.Read.All`, la richiesta dei membri rispondeva **HTTP 200 con
`userPrincipalName` e `mail` a `undefined`**: nessun errore, campi omessi. Il codice ne ha
concluso che nessuno fosse membro del gruppo e ha chiuso la sezione anagrafiche a tutti.

Le due cose da ricordare:

1. **Chiedere a un'API dei dati che non si è autorizzati a vedere non produce necessariamente
   un errore.** Graph ha risposto correttamente omettendo ciò che non poteva mostrare. Da qui
   la guardia in `lib/gruppo-ru.ts`: una lista di membri vuota viene trattata come anomalia —
   e quindi "sezione visibile" — non come la verità sul gruppo.
2. **I permessi applicativi entrano nei token con qualche minuto di ritardo.** Dopo il consenso
   la diagnosi continuava a dare 403 e sembrava un problema di configurazione: era solo
   propagazione. `node scripts/diagnosi-permessi.mjs` legge il claim `roles` del token
   rilasciato in quel momento, che è ciò che Graph valuta davvero.

**Alternativa valutata e scartata**: confrontare gli object id anziché le email, prendendo il
proprio dalla claim `oid` dell'id_token. Non avrebbe richiesto `User.Read.All`, ma avrebbe
imposto a tutti di rifare l'accesso. Deciso di aggiungere il permesso, considerando che l'app
ha già `Sites.ReadWrite.All` su tutto il tenant: accanto a quello, una lettura sui profili non
cambia il profilo di rischio.

**Scelta di progetto da rispettare: in caso di errore nella lettura del gruppo, la sezione
si mostra comunque.** Il cancello di sicurezza è SharePoint, non il menu: un errore transitorio
di Graph non deve nascondere la sezione a chi ne ha diritto, e chi non ne ha diritto prende
comunque 403 dal canale delegato. Fallire "aperti" sulla visibilità e "chiusi" sui dati è
corretto; l'inverso sarebbe sbagliato in entrambi i versi.

---

## 13. Stato di avanzamento

> **Questa è la fonte di verità sullo stato dei lavori.** Va aggiornata a ogni passo
> completato, così il lavoro può riprendere in qualsiasi momento (anche in una nuova
> conversazione) senza ricostruire il contesto.
>
> Legenda: `[ ]` da fare · `[~]` in corso · `[x]` fatto · `(D)` spetta a Dennis/IT ·
> `(C)` spetta a Claude

### ▶ Dove siamo — prossimo passo

**Passi 1-5 completati** (30/07/2026): permessi, sito, codice, migrazione dei 263 dipendenti,
env su Vercel, deploy. In locale l'accesso delegato è verificato — un item creato dall'app
riporta il nome reale della persona nel log nativo Microsoft.

**Produzione verificata il 31/07/2026**: record creato dall'app in produzione (id 265) con
`Creato da` = `Modificato da` = **Dennis Maseri**. Il canale delegato funziona end-to-end.

**Collaudo completato il 31/07/2026** e le 13 persone sono state avvisate. L'area Risorse Umane
è in produzione sul sito dedicato con accesso delegato.

**Resta aperto, in ordine di rilevanza:**

1. **(D)** rinominare le liste sorgente `ZZ_Dipendenti_dismessa` / `ZZ_Tirocini_dismessa` e
   togliere i permessi — tenerle qualche settimana come rete di sicurezza
2. **(C/D)** **punto 14**: separare il permesso `"Timbrature HR"` e allineare la visibilità
   delle anagrafiche al gruppo M365. Decisione presa, progetto scritto, da eseguire
3. **(C/D)** **passo 6, governance**: rimandato, elenco delle dieci cose da guardare più sotto
4. **(D)** chiusura mensile timbrature → il foglio ore finisce nella cartella personale
5. **(D)** **avvisare le 13 persone del gruppo M365**: al primo accesso devono **uscire e
   rientrare**, altrimenti l'area RU risponde "esci e rientra nell'app" (manca il refresh
   token, che nasce solo al login)
6. **(D)** solo dopo il collaudo: rinominare le liste sorgente `ZZ_*_dismessa`, togliere i
   permessi, tenerle qualche settimana

Poi resta il **passo 6** (governance): retention Purview, cron di cancellazione log oltre 12
mesi, informativa art. 4 co. 3 — da aggiornare anche sul fatto che le persone con accesso sono
13 e non 3-4, e che l'accesso segue l'appartenenza al Teams dell'HR.

Prima della migrazione: eliminare l'item di prova "prova prova" dalla lista Dipendenti del
sito RU (spItemId 1).

Valori utili raccolti finora:

Valori utili raccolti finora:

| | |
|---|---|
| `SP_SITE_RU` | `coopmirafiorionlus.sharepoint.com,8d29206d-cb03-41ad-beb7-c7e497bc52d7,8989410b-1617-4ff0-8beb-1b162eddad41` |
| `SP_RU_DRIVE_ID` | `b!bSApjQPLrUG-t8fkl7xS1wtBiYkXFvBPi-sbFi7drUEQKcQJX98kS5a_yJdOOwfy` |
| `SP_RU_FOLDER` | `Risorse Umane App/Dipendenti` |
| Gruppo M365 del sito | `82c6267d-1e45-4b57-b0dc-3772d1f32a4b` |
| App PnP amministrazione | `e44f7f37-6406-401a-b6da-ea604568d7f4` |

**Nuove liste sul sito RU** (create vuote il 30/07/2026). ⚠️ Questi GUID **non** vanno ancora
messi in `SP_LIST_DIPENDENTI` / `SP_LIST_TIROCINI`: quelle env puntano alle liste in
produzione e devono continuare a farlo fino al cutover del passo 5.

| Lista | GUID sul sito RU |
|---|---|
| Dipendenti | `28c1c29d-a3de-424b-a8ae-82b91e26b63c` |
| Tirocini | `a1fb9c0e-e0c2-4372-b103-5c403bb27ed8` |

Per confronto, le liste **attuali in produzione** sul sito Controllo di Gestione:
Dipendenti `0a223f64-141a-4d5d-aa0c-c7895030421e`,
Tirocini `419e5838-03fe-42c2-974a-5b41751acc52`.

Metodo concordato con Dennis: **si decide insieme prima di modificare questo piano.**

### Passo 1 — Verifiche di fattibilità

- [x] **(D)** Conditional Access: verificato il 30/07/2026 — **nessuna policy bloccante**.
      Il rinnovo del token dal server è praticabile. *(rischio 11.1 chiuso)*
Rimandati alla fine (decisione di Dennis, 30/07/2026 — non bloccano nulla, spostati al
passo 6): verifica del piano di audit Purview ed elenco nominativo del gruppo `RU-Gestione`.

### Passo 2 — Permessi Entra ID

- [x] **(C)** Comandi pronti in `runbook-ru-passo2-3.md` §1 (az CLI, id dei permessi letti
      dal service principal di Graph anziché scritti a mano)
- [x] **(D)** Permessi **delegati** `Sites.Selected` + `offline_access` aggiunti alla
      app registration esistente, con consenso amministratore — **fatto il 30/07/2026**.
      Grant verificato: `consentType=AllPrincipals`, id grant
      `e0OPryHzK0SULSm02ErODYvUIclEiutDpWgjDFm5LJI`, SP object id
      `af8f437b-f321-442b-942d-29b4d84ace0d`
- [x] **(D)** Rimosso il delegato **`Sites.Manage.All`** che risultava già consentito e non
      usato da nessuna parte dell'app (vedi punto 4.1). Scope delegati consentiti ora:
      `User.Read Sites.Selected offline_access`
- [x] **(C)** Scope aggiornato in `lib/auth.ts` → `openid profile email offline_access
      https://graph.microsoft.com/Sites.Selected`

⚠ Dopo il consenso serve **logout + login**: il refresh token nasce solo da un consenso
che include `offline_access`.

### Passo 3 — Nuovo sito SharePoint *(anticipato: serve per il grant Sites.Selected)*

- [x] **(C)** Comandi pronti in `runbook-ru-passo2-3.md` §2 (PnP PowerShell)
- [x] **(D)** Creazione sito `RisorseUmane` — fatto il 30/07/2026.
      URL `https://coopmirafiorionlus.sharepoint.com/sites/RisorseUmane`, raccolta
      predefinita `Documenti condivisi`, cartella radice `Risorse Umane App` già creata →
      `SP_RU_FOLDER=Risorse Umane App/Dipendenti`
- [x] **(D)** ~~Gruppo `RU-Gestione`~~ — creato e poi **eliminato**: accesso governato dal
      solo gruppo M365 del sito (vedi punto 3 rivisto)
- [x] **(D)** Blindatura permessi: Visitatori vuoto, nessun "Tutti tranne utenti esterni",
      nessun utente esterno, condivisione esterna disattivata, collegamenti "tutta
      l'organizzazione" disattivati, link predefinito "persone specifiche / sola lettura"
- [x] **(D)** Dennis aggiunto come amministratore della raccolta siti
      (`Set-PnPTenantSite -Owners`), necessario per grant e versioning
- [x] **(D)** Cronologia versioni attivata su `Documenti condivisi`
      (`EnableVersioning True`, `MajorVersionLimit 500`)
- [x] **(D)** `Grant-PnPAzureADAppSitePermission` con `-Permissions Write` sul sito RU —
      **fatto**, `Roles : {write}` verificato. App PnP di amministrazione registrata:
      `PnP-Mirafiori-Admin`, client id `e44f7f37-6406-401a-b6da-ea604568d7f4`
- [x] **(C)** `scripts/get-site-id.mjs` — risolve `SP_SITE_RU` e `SP_RU_DRIVE_ID` dall'URL
      del sito e stampa i comandi `vercel env add` pronti
- [x] **(C)** `provision-risorse-umane.mjs` accetta `--site=<id>` / `SP_SITE_RU`
      (prima leggeva solo `SHAREPOINT_SITE_ID`)
- [x] **(C/D)** Provisioning delle due liste sul nuovo sito (a vuoto) — fatto, GUID sopra
- [ ] **(D)** Versioning sulle due liste appena create

### Passo 4 — Accesso delegato ✅ COMPLETATO 30/07/2026

- [x] **(C/D)** Tabella `ms_token` su Supabase (`supabase/ms_token.sql`, RLS attiva senza
      policy) + `TOKEN_ENC_KEY` da 32 byte
- [x] **(C)** `lib/ms-token.ts` (lettura, cifratura, rinnovo, errore `RiautenticazioneRichiesta`)
- [x] **(C)** Callback `jwt` in `lib/auth.ts` che salva i token al login
- [x] **(C)** `lib/graph-delegato.ts` (senza cache di modulo del token) + `graphRU()`,
      unico punto in cui si decide l'identità e si regge la transizione
- [x] **(C)** `lib/risorse-umane.ts`: primo parametro `GraphClient` su tutte le funzioni
- [x] **(C)** Aggiornamento dei 6 chiamanti
- [x] **(C)** Traduzione errori 401/403 (`lib/ru-fetch.ts` lato client, `errore()` in
      `ru-api.ts` lato server) + avviso "sessione scaduta" sulla pagina di login
- [x] **(C/D)** Prova in scaletta: token → `GET /sites/{ru}` → `GET` lista → creazione item
- [x] **(D)** **Collaudo in locale superato**: item creato e modificato dall'app sul sito RU
      riporta `Creato da` = `Modificato da` = **Dennis Maseri**, verificato con
      `node scripts/ru-chi-ha-scritto.mjs`

**Scostamento tecnico dal piano.** Il §5.1 prevedeva `node:crypto` e il client
`@supabase/supabase-js`. Non è praticabile: `middleware.ts` fa
`export { auth as middleware } from '@/lib/auth'`, quindi `lib/auth.ts` — che importa
`lib/ms-token.ts` per salvare i token — viene compilato **anche per l'Edge runtime**, dove
`node:crypto` non esiste. `lib/ms-token.ts` usa quindi la **Web Crypto API**
(`crypto.subtle`, presente sia in Node sia in Edge) e parla con Supabase via **REST/fetch**.
Da non "correggere": romperebbe il build del middleware.

**Strumenti aggiunti oltre al piano**, perché la transizione ha più stati e sbagliarli su dati
del personale è costoso:

| Script | A cosa serve |
|---|---|
| `scripts/ru-assetto.mjs` | commuta A↔B in `.env.local` garantendo "un solo assetto attivo" |
| `scripts/setup-env-locale.mjs` | completa e **verifica** le env; valida la chiave Supabase leggendone il claim `role` |
| `scripts/ru-chi-ha-scritto.mjs` | legge `createdBy`/`lastModifiedBy` e la cronologia versioni: è la prova dell'obiettivo |
| `scripts/sp-liste.mjs` | rilegge i GUID delle liste da Graph (su Vercel le env sensibili non sono recuperabili) |
| `scripts/get-site-id.mjs` | ricava `SP_SITE_RU` e `SP_RU_DRIVE_ID` dall'URL del sito |

### Passo 5 — Migrazione ✅ ESEGUITA 30/07/2026

- [x] **(C)** `scripts/migra-ru-sito-dedicato.mjs` (dry-run per difetto, `--apply`,
      `--duplicati` per la diagnosi, idempotente)
- [x] **(C/D)** Migrazione di prova + confronto conteggi
- [x] **(D)** **Migrazione definitiva: 263 dipendenti, 5 cartelle personali, 0 errori.**
      Tirocini: lista sorgente vuota, nulla da migrare (accettato da Dennis — la sezione era
      da rivedere)
- [x] **(C)** Nuove env in `.env.local` (blocco assetti) e su Vercel via
      `scripts/vercel-env-ru.sh --apply` — 6 variabili × 3 ambienti
- [x] **(C)** Codice pubblicato: commit `48251ad` su `main`, deploy automatico Vercel
- [ ] **(D)** Collaudo completo con la checklist del punto 10, in produzione
- [ ] **(D)** Avviso alle 13 persone: devono uscire e rientrare nell'app
- [ ] **(D)** Liste sorgente rinominate `ZZ_*_dismessa` e permessi rimossi

**Trappola trovata durante la migrazione, da ricordare.** `IdAccess` **non è univoco** sulla
lista Dipendenti: le tabelle Access PROFILO SOGGETTO e COLLABORATORI avevano numerazioni
indipendenti, entrambe da 1, e l'unificazione del 2026-07 le ha sovrapposte — per ogni valore
1..14 esistono due persone diverse. La prima versione dello script usava `IdAccess` come chiave
primaria e ha scartato 12 collaboratori come falsi doppioni. Corretto anteponendo il codice
fiscale. Se in futuro serve un identificativo stabile per i dipendenti, `IdAccess` non lo è.

**Ordine del cutover, se andasse rifatto.** Prima le env su Vercel, poi il push del codice: le
variabili diventano attive solo al deploy successivo, quindi il build che segue il push applica
insieme codice nuovo e variabili nuove. Nell'ordine inverso, o con un deploy in mezzo, la
produzione girerebbe col codice vecchio e i GUID delle liste nuove — che sul sito vecchio non
esistono.

### Passo 6 — Governance — ⏸ RIMANDATO (decisione di Dennis, 31/07/2026)

Nulla di quanto segue è bloccante per il funzionamento: l'area RU è operativa e il log nativo
registra le persone reali. Sono adempimenti e affinamenti da affrontare in una sessione
dedicata. **Elenco di cosa guardare quando si riprende:**

| # | Cosa | Perché | A chi tocca |
|---|---|---|---|
| 1 | **Piano di audit Purview**: verificare quale licenza è attiva e quanti giorni di conservazione dà (Audit Standard ≈ 180 gg) | Con il delegato Purview registra anche le **consultazioni** col nome reale: è la parte più preziosa del lavoro, ma dura quanto la retention. Se serve un orizzonte probatorio più lungo occorre una licenza superiore o un export periodico | D |
| 2 | **Informativa art. 4 co. 3 Statuto dei Lavoratori**: aggiornarla | Va detto che gli addetti HR accedono anche direttamente da SharePoint/OneDrive e che le loro azioni — comprese le consultazioni — sono tracciate. Due dettagli emersi il 30/07: le persone con accesso sono **13** (il piano ipotizzava 3-4) e l'accesso segue **l'appartenenza al Teams dell'HR**, non un elenco separato | D |
| 3 | **Comunicazione a Stefano Martino** (unico proprietario del gruppo M365) | È di fatto lui che concede l'accesso alle anagrafiche: aggiungere una persona al Teams significa darle IBAN, Legge 104, stato di famiglia di 263 dipendenti | D |
| 4 | **Casella `info@cooperativamirafiori.com` nel gruppo** | È condivisa: le sue azioni risultano come "Info Coop Mirafiori", senza indicare la persona. Su quelle azioni l'obiettivo del lavoro non è raggiunto. Da valutare se togliere l'accesso ai dati RU lasciandola nel Teams | D |
| 5 | **Retention del log applicativo**: cron che cancella le righe oltre i 12 mesi | L'infrastruttura cron su Vercel c'è già. Il log applicativo cresce senza limite e contiene nominativi | C |
| 6 | **Coerenza fra permesso applicativo e gruppo M365** | Vedi punto 14 di questo documento: sono due elenchi separati che possono divergere | C/D |
| 7 | **`Sites.Selected` anche per l'identità applicativa** al posto di `Sites.ReadWrite.All` | Oggi l'app-only può scrivere su qualunque sito del tenant. Il meccanismo dei grant è ormai noto. Da testare modulo per modulo: Manutenzioni, Costi, Software, Prestazioni, Autorizzazioni, Log | C/D |
| 8 | **`Domande_Consulenti_Log_Attivita_GDPR.md`**: aggiornare con l'assetto realizzato | Il documento per i consulenti descrive ancora l'ipotesi, non ciò che è stato fatto | C |
| 9 | **Liste sorgente `ZZ_*_dismessa`**: dopo qualche settimana, valutare l'eliminazione definitiva | Sono la rete di sicurezza post-migrazione; tenerle per sempre significa avere due copie delle anagrafiche | D |
| 10 | **Cronologia versioni**: verificare a distanza di tempo che stia effettivamente accumulando le versioni sulle due liste | Il versioning è stato attivato il 30/07: le modifiche precedenti non ci sono, e vale la pena controllare che quelle successive vengano conservate | D |

### Localizzazione dei dati — accertata il 31/07/2026

Utile per l'informativa: la catena è interamente in UE.

| Dove | Cosa contiene | Localizzazione |
|---|---|---|
| Microsoft 365 / SharePoint | anagrafiche, documenti personali, log nativo | UE *(confermato da Dennis)* |
| Supabase | timbrature di tutti i dipendenti, tabella `ms_token` | UE *(confermato da Dennis)* |
| Vercel — esecuzione del codice | nessuna archiviazione, solo elaborazione | **Francoforte** (`fra1`), impostata in `vercel.json` |

Due precisazioni da non omettere se il documento finisce davanti a un consulente:

- `"regions": ["fra1"]` decide dove le funzioni **vengono eseguite**, non dove i dati stanno.
  Sul piano Hobby si può indicare una sola regione.
- La rete CDN di Vercel resta **globale** e mette in cache gli asset statici in tutto il mondo:
  riguarda pagine e immagini pubbliche, non i dati del personale, che passano solo da funzioni
  dinamiche. Vercel resta comunque un fornitore statunitense che agisce da responsabile del
  trattamento, quindi conta il suo DPA — non la sola scelta della regione.

### Passo 6-bis — Elementi originari del passo 6 (per riferimento)

- [ ] **(D)** Verifica del piano di audit Purview attivo e dei giorni di conservazione
      *(rimandato dal passo 1)*
- [ ] **(D)** Elenco nominativo definitivo del gruppo `RU-Gestione` *(rimandato dal passo 1)*
- [ ] **(C)** Cron di cancellazione log applicativo oltre 12 mesi
- [ ] **(D)** Informativa art. 4 co. 3 aggiornata
- [ ] **(C)** `Domande_Consulenti_Log_Attivita_GDPR.md` aggiornato con l'assetto scelto

### Passo 7 — Rimandato

- [ ] `Sites.Selected` al posto di `Sites.ReadWrite.All` per l'identità applicativa

### Diario

| Data | Cosa è stato fatto |
|---|---|
| 30/07/2026 | Piano redatto e approvato. Accertato che le app registration di login e Graph coincidono. |
| 30/07/2026 | Verifica Purview ed elenco nominativo del gruppo rimandati al passo 6. Confermato `Sites.Selected` come permesso delegato. |
| 30/07/2026 | Conditional Access verificato da Dennis: nessuna policy che richieda dispositivo conforme o hybrid-joined. Via libera all'accesso delegato. |
| 31/07/2026 | **Collaudo in produzione superato** (record creato dall'app riporta "Dennis Maseri"), prove su cartelle e documenti fatte, 13 persone avvisate. Governance **rimandata** su decisione di Dennis: nel passo 6 c'è l'elenco delle dieci cose da riprendere. Accertato che il permesso `"Risorse Umane"` governa anche il cruscotto HR delle timbrature (Supabase), dove è l'unico controllo di accesso: deciso di separare un permesso `"Timbrature HR"` e derivare la visibilità delle anagrafiche dal gruppo M365 — progetto al punto 14, da eseguire. |
| 30/07/2026 | **Passo 5 eseguito: migrazione e cutover.** 263 dipendenti e 5 cartelle personali copiati sul sito RU, 0 errori; lista Tirocini sorgente vuota, nulla da migrare. Scoperto che `IdAccess` non è univoco (numerazioni Access sovrapposte dopo l'unificazione dei collaboratori): la prima versione dello script scartava 12 collaboratori come doppioni, corretta anteponendo il codice fiscale nella chiave di appaiamento. Env impostate su Vercel (6 × 3 ambienti) **prima** del push, così il build applica insieme codice e variabili. Codice pubblicato: commit `48251ad`. Restano collaudo in produzione, avviso alle 13 persone e rinomina delle liste sorgente. |
| 30/07/2026 | **Passo 4 completato e collaudato.** Scritto il codice dell'accesso delegato (`lib/ms-token.ts` con Web Crypto + REST per compatibilità Edge, `lib/graph-delegato.ts` con `graphRU()`, `GraphClient` come primo parametro in `lib/risorse-umane.ts`, 6 chiamanti aggiornati, traduzione errori). Tabella `ms_token` creata su Supabase. Trovate e colmate lacune preesistenti di `.env.local` in locale: mancavano `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` e `SP_LIST_AUTORIZZAZIONI` (per questo l'area RU non era mai comparsa in locale). **Prova superata: un item creato dall'app sul sito RU riporta "Creato/Modificato da: Dennis Maseri".** Aggiunti 5 script di supporto alla transizione. |
| 30/07/2026 | **Passo 3 quasi completato.** Accertato che il sito RU è un Team site `GROUP#0` con gruppo M365 e Teams attivi dal 29/09/2025, non un communication site: non si ricrea. Su richiesta di Dennis di semplificare, `RU-Gestione` **eliminato** e accesso governato dal solo gruppo M365 (13 membri, 1 proprietario). Corrette le impostazioni di condivisione del sito (esterna e link org-wide erano attive). Registrata l'app di amministrazione `PnP-Mirafiori-Admin` (`e44f7f37-…`) con `AllSites.FullControl` + `Sites.FullControl.All`, necessaria perché l'app di Azure CLI non può concedere permessi di sito. **Grant `Sites.Selected` dato sul sito RU: `Roles : {write}`.** Restano: versioning, provisioning liste, env. |
| 30/07/2026 | **Passo 2 completato.** Azure CLI installato, login al tenant come Global Administrator, permessi delegati `Sites.Selected` + `offline_access` aggiunti e consenso amministratore dato (`AllPrincipals`). Scoperto un delegato `Sites.Manage.All` preesistente e mai usato, che avrebbe vanificato la limitazione di `Sites.Selected`: **rimosso** (consenso revocato via PATCH del grant + permesso togliato dalla registrazione). Backup su Desktop di Dennis: `backup-permessi-app-mirafiori.json`, `backup-grant-app-mirafiori.json`. |
| 30/07/2026 | Dennis ha creato il sito `RisorseUmane` e la cartella `Documenti condivisi/Risorse Umane App`. Raccolta in italiano → `SP_RU_FOLDER=Risorse Umane App/Dipendenti` (non `Dipendenti` come nella v1 del piano). Runbook §2.2 e §2.5 adeguati. Permessi Entra, gruppo, blindatura, versioning e grant PnP ancora da fare. |
| 30/07/2026 | **Avvio esecuzione.** Redatto `runbook-ru-passo2-3.md` (tutto da terminale: az CLI per Entra, PnP PowerShell per il sito). Scope aggiornato in `lib/auth.ts`. Aggiunto `scripts/get-site-id.mjs`. `provision-risorse-umane.mjs` ora accetta `--site`/`SP_SITE_RU`. Palla a Dennis per i passi manuali. |
| 30/07/2026 | **Revisione**: permesso delegato `Sites.Selected` al posto di `Sites.ReadWrite.All` (su proposta di Dennis). Conseguenza: serve il grant PnP per sito, quindi il nuovo sito RU va creato *prima* della prova del delegato — passi 3 e 4 invertiti rispetto alla versione 1. Verificato che l'app non usa la ricerca Graph, quindi il limite di `Sites.Selected` sulla ricerca non ci riguarda. |

