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
 * Permesso Graph richiesto: `GroupMember.Read.All` (Application), sola lettura.
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
 * Legge i membri del gruppo. `transitiveMembers` include anche chi appartiene
 * tramite gruppi annidati: oggi non ce ne sono, ma se un domani venissero
 * introdotti la funzione continuerebbe a rispondere correttamente anziché
 * negare l'accesso senza spiegazione.
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
 * Graph non deve quindi nascondere la sezione a chi ne ha diritto: fallire
 * "aperti" sulla visibilità e "chiusi" sui dati è corretto, l'inverso sarebbe
 * sbagliato in entrambi i versi.
 */
export async function eMembroGruppoRU(email: string | null | undefined): Promise<boolean> {
  if (!email) return false

  const ora = Date.now()
  if (_cache && _cache.scadeIl > ora) {
    return _cache.membri.has(email.toLowerCase())
  }

  try {
    const membri = await leggiMembri()
    _cache = { membri, scadeIl: ora + TTL_MS }
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
