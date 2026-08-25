/**
 * Rubrica degli account della cooperativa.
 *
 * Serve a smettere di battere le email a mano: dove l'app chiede "chi?"
 * (oggi i permessi, domani chiunque altro), si sceglie da questo elenco.
 *
 * Fonte: Entra ID via Graph `/users`, non l'anagrafica Risorse Umane. Motivo:
 * la rubrica deve contenere *tutto ciò a cui si può dare un accesso*, quindi
 * anche le caselle condivise (info@, risorseumane@) e chi ha un account prima
 * di comparire a ruolino. L'anagrafica RU risponde a un'altra domanda — chi è
 * assunto — e vive per giunta su un sito con autenticazione delegata.
 *
 * Permesso Graph richiesto: `User.Read.All` (Application). È già concesso:
 * lo usa `lib/risorse-umane/gruppo.ts` per leggere i membri del gruppo RU.
 * Per verificare cosa l'app può fare adesso: `node scripts/diagnosi-permessi.mjs`.
 *
 * ⚠️ Trappola già pagata in gruppo.ts, vale anche qui: se il permesso manca,
 * Graph non risponde con un errore — risponde 200 omettendo i campi. Da qui il
 * filtro su chi ha davvero un indirizzo e la guardia sulla lista vuota in chi
 * chiama (la UI ricade sull'inserimento libero, non si blocca).
 */

import { graphGet } from '@/lib/core/graph'

export interface VoceRubrica {
  /** Email in minuscolo: è la chiave con cui l'app identifica una persona. */
  email: string
  /** Nome leggibile. Se Entra non ce l'ha, ripiega sulla parte prima della @. */
  nome: string
}

/** Dominio degli indirizzi della cooperativa. Fuori da qui non entra in rubrica. */
const DOMINIO = 'cooperativamirafiori.com'

/**
 * Cache di modulo. Lecita per lo stesso motivo di `gruppo.ts`: è una proprietà
 * del tenant, non dell'utente, quindi il riuso della funzione serverless fra
 * utenti diversi non può causare scambi di identità.
 */
const TTL_MS = 10 * 60_000
let _cache: { voci: VoceRubrica[]; scadeIl: number } | null = null

interface UtenteGraph {
  displayName?: string
  mail?: string
  userPrincipalName?: string
  accountEnabled?: boolean
}

/**
 * Tutti gli account attivi della cooperativa, ordinati per nome.
 *
 * Non lancia: se Graph fallisce o il permesso manca, ritorna un array vuoto.
 * Una rubrica assente deve degradare in "scrivi l'email a mano", non rompere
 * la pagina dei permessi.
 */
export async function getRubrica(): Promise<VoceRubrica[]> {
  const ora = Date.now()
  if (_cache && _cache.scadeIl > ora) return _cache.voci

  try {
    const voci = await leggiTutti()
    _cache = { voci, scadeIl: ora + TTL_MS }
    return voci
  } catch (err) {
    console.error('[Graph] rubrica non leggibile', err)
    return []
  }
}

/** Svuota la cache. Usata dal parametro `?fresco=1` dell'API. */
export function invalidaRubrica(): void {
  _cache = null
}

async function leggiTutti(): Promise<VoceRubrica[]> {
  const voci: VoceRubrica[] = []
  const visti = new Set<string>()

  // `accountEnabled` non è filtrabile senza ConsistencyLevel eventual: si
  // filtra qui sotto, in memoria. Il tenant è di qualche decina di account.
  let url =
    '/users?$select=displayName,mail,userPrincipalName,accountEnabled&$top=999'

  // Il guinzaglio sulle pagine evita che un errore di paginazione diventi un
  // ciclo infinito dentro una funzione serverless.
  for (let pagina = 0; url && pagina < 10; pagina++) {
    const res = await graphGet<{ value: UtenteGraph[]; '@odata.nextLink'?: string }>(url)

    for (const u of res.value ?? []) {
      if (u.accountEnabled === false) continue
      const email = (u.mail ?? u.userPrincipalName ?? '').toLowerCase().trim()
      if (!email.endsWith(`@${DOMINIO}`)) continue
      if (visti.has(email)) continue
      visti.add(email)
      voci.push({ email, nome: (u.displayName ?? '').trim() || email.split('@')[0] })
    }

    const next = res['@odata.nextLink']
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : ''
  }

  return voci.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
}
