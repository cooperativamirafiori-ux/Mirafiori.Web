/**
 * Appartenenza al gruppo Microsoft 365 "Risorse Umane".
 *
 * È l'unica fonte di verità su chi accede alle anagrafiche del personale: dopo
 * il passaggio al sito dedicato con accesso delegato, il cancello vero è
 * SharePoint, che concede in base all'appartenenza a questo gruppo. Il permesso
 * applicativo "Risorse Umane" della lista Autorizzazioni non era più una
 * barriera ma un secondo elenco destinato a divergere — vedi il punto 14 di
 * docs/piano-ru-sito-dedicato-accesso-delegato.md.
 *
 * ─── Due permessi, e perché servono entrambi ───
 *
 * Accertato il 31/07/2026 con scripts/diagnosi-gruppo-ru.mjs:
 * `GroupMember.Read.All` autorizza a sapere CHI appartiene al gruppo — gli `id`
 * arrivano — ma NON a leggerne le proprietà. Con quel solo permesso
 * `userPrincipalName` e `mail` tornavano `undefined` **con HTTP 200 e nessun
 * errore**: è così che il primo rilascio ha concluso, sbagliando, che nessuno
 * fosse membro del gruppo, e ha chiuso la sezione a tutti.
 *
 * ⚠️ **Il modo di fallire, più del fallimento, è la cosa da ricordare.** Graph
 * non ha detto "non ti è permesso": ha risposto correttamente omettendo i campi.
 * Chiedere a un'API dei dati che non si è autorizzati a vedere non produce
 * necessariamente un errore. Da qui la guardia sulla lista vuota qui sotto.
 *
 * Serve quindi anche `User.Read.All` (Application). Alternativa valutata e
 * scartata: confrontare gli object id, prendendo il proprio dalla claim `oid`
 * dell'id_token — nessun permesso in più, ma avrebbe richiesto a tutti di
 * rifare l'accesso. Deciso di aggiungere il permesso, considerando che l'app ha
 * già `Sites.ReadWrite.All` su tutto il tenant: accanto a quello una lettura sui
 * profili non cambia il profilo di rischio.
 *
 * Nota sui tempi: dopo il consenso, Entra può metterci qualche minuto a
 * includere un ruolo nuovo nei token. Per verificare cosa l'app può fare
 * *adesso*: `node scripts/diagnosi-permessi.mjs`, che legge il claim `roles`
 * del token — l'unica fonte che non lascia margine di interpretazione.
 *
 * Permessi Graph richiesti (Application, sola lettura):
 *   GroupMember.Read.All   chi è nel gruppo
 *   User.Read.All          email e UPN di quelle persone
 *
 * Env: `SP_GRUPPO_RU_ID` (object id del gruppo M365 del sito Risorse Umane).
 */

import { graphGet } from '@/lib/graph'

/** Durata della cache. Le variazioni di composizione del gruppo sono rare. */
const TTL_MS = 5 * 60_000

/**
 * Cache della LISTA dei membri, non del singolo utente.
 *
 * È lecito tenerla a livello di modulo — al contrario dei token in
 * lib/ms-token.ts — perché è una proprietà del gruppo e non dell'utente: la
 * stessa lista risponde correttamente a qualunque richiesta, quindi il riuso
 * della funzione serverless fra utenti diversi non può causare scambi di
 * identità. In più evita una chiamata Graph per ogni pagina.
 */
let _cache: { membri: Set<string>; scadeIl: number } | null = null

function gruppoId(): string {
  const id = process.env.SP_GRUPPO_RU_ID
  if (!id) {
    throw new Error(
      'SP_GRUPPO_RU_ID non impostata: serve l’object id del gruppo Microsoft 365 ' +
        'del sito Risorse Umane.',
    )
  }
  return id
}

interface MembroGraph {
  userPrincipalName?: string
  mail?: string
}

/**
 * Email e UPN dei membri del gruppo.
 *
 * `transitiveMembers` include anche chi appartiene tramite gruppi annidati:
 * oggi non ce ne sono, ma se un domani venissero introdotti la funzione
 * continuerebbe a rispondere correttamente anziché negare l'accesso senza
 * spiegazione. Il cast `/microsoft.graph.user` scarta i membri che non sono
 * persone.
 *
 */
async function leggiMembri(): Promise<Set<string>> {
  const membri = new Set<string>()
  let path: string | null =
    `/groups/${gruppoId()}/transitiveMembers/microsoft.graph.user` +
    `?$select=userPrincipalName,mail&$top=200`

  while (path) {
    const res: { value?: MembroGraph[]; '@odata.nextLink'?: string } = await graphGet(path)
    for (const m of res.value ?? []) {
      if (m.userPrincipalName) membri.add(m.userPrincipalName.toLowerCase())
      // Le caselle condivise e alcuni account hanno `mail` diversa dall'UPN:
      // si indicizzano entrambe, così il confronto con l'email di sessione
      // funziona in ogni caso.
      if (m.mail) membri.add(m.mail.toLowerCase())
    }
    const prossimo = res['@odata.nextLink']
    path = prossimo ? prossimo.replace('https://graph.microsoft.com/v1.0', '') : null
  }

  return membri
}

/**
 * True se l'utente è membro del gruppo Risorse Umane.
 *
 * ⚠️ **In caso di errore restituisce `true`.** Non è una svista: questa funzione
 * governa la VISIBILITÀ della sezione, non l'accesso ai dati. Il cancello di
 * sicurezza è SharePoint, che risponde 403 a chi non è membro — tradotto in un
 * messaggio comprensibile da lib/graph-delegato.ts. Un errore transitorio di
 * Graph non deve nascondere la sezione a chi ne ha diritto: fallire "aperti"
 * sulla visibilità e "chiusi" sui dati è corretto, l'inverso sarebbe sbagliato
 * in entrambi i versi.
 */
export async function eMembroGruppoRU(email: string | null | undefined): Promise<boolean> {
  if (!email) return false

  const ora = Date.now()
  if (_cache && _cache.scadeIl > ora) {
    return _cache.membri.has(email.toLowerCase())
  }

  try {
    const membri = await leggiMembri()

    // Un gruppo senza membri non è uno stato plausibile: il sito RU esiste
    // perché qualcuno ci lavora. Se la lista arriva vuota è quasi certamente un
    // problema di lettura — un endpoint che risponde 200 con `value: []`, un
    // permesso revocato, un id di gruppo sbagliato — non la verità sul gruppo.
    // Trattarlo come "nessuno è membro" chiuderebbe la sezione a tutti senza
    // che nessuno abbia deciso niente, ed è esattamente quello che è successo
    // al primo rilascio.
    if (membri.size === 0) {
      console.error(
        '[gruppo-ru] la lista dei membri è vuota: trattata come anomalia, la sezione resta ' +
          'visibile. Controlla SP_GRUPPO_RU_ID e i permessi GroupMember.Read.All e User.Read.All ' +
          '(diagnosi: node scripts/diagnosi-gruppo-ru.mjs).',
      )
      return true
    }

    _cache = { membri, scadeIl: ora + TTL_MS }
    // Registrato una volta per ricarica della cache: distingue il
    // funzionamento corretto dal ripiego "fallisci aperto", che a video sono
    // indistinguibili — in entrambi i casi la sezione si vede.
    console.info(`[gruppo-ru] ${membri.size} identificativi letti dal gruppo`)
    return membri.has(email.toLowerCase())
  } catch (e) {
    console.error('[gruppo-ru] lettura dei membri non riuscita, la sezione resta visibile', e)
    return true
  }
}

/** Svuota la cache. Utile dopo una modifica ai membri, per non attendere il TTL. */
export function invalidaCacheGruppoRU(): void {
  _cache = null
}
