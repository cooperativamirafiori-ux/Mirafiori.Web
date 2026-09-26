/**
 * Client Qonto dell'app: SOLO LETTURA, con la chiave API.
 *
 * Perché la chiave e non OAuth. Per leggere saldi e movimenti basta la chiave,
 * mentre OAuth su Vercel vorrebbe dire custodire un refresh token monouso che
 * cambia a ogni rinnovo: due richieste parallele che rinnovano insieme e uno
 * dei due token è già morto. OAuth resta agli script che scrivono (sottoconti,
 * giroconti), lanciati dal Mac: `scripts/_qonto.mjs`.
 *
 * Il client espone solo GET di proposito. L'unica scrittura dell'app su Qonto
 * sono le richieste di bonifico (26/09/2026), che Qonto accetta solo con
 * OAuth: stanno in oauth.ts + bonifici.ts, con il token in Supabase e il
 * rinnovo a turno. Il denaro si muove solo dopo l'approvazione nell'app Qonto.
 *
 * Freschezza: ogni risposta vale 60 secondi (cache dei dati di Next). Chi apre
 * la pagina vede Qonto com'era al massimo un minuto fa, e due coordinatori che
 * aprono insieme non fanno due chiamate. Nessuna copia nel nostro database: il
 * saldo è sempre quello della banca.
 *
 * Si importa solo da codice server (pagine server e route): la chiave non deve
 * mai finire in un componente client.
 *
 * Env: QONTO_LOGIN, QONTO_SECRET (chiave generata da un owner/admin: con un
 * utente di ruolo inferiore Qonto nasconde i saldi).
 */

const BASE = 'https://thirdparty.qonto.com/v2'
export const SECONDI_CACHE = 60

export function qontoConfigurato(): boolean {
  return Boolean(process.env.QONTO_LOGIN && process.env.QONTO_SECRET)
}

export async function qontoGet<T>(path: string): Promise<T> {
  const { QONTO_LOGIN, QONTO_SECRET } = process.env
  if (!QONTO_LOGIN || !QONTO_SECRET) throw new Error('Qonto non configurato: mancano QONTO_LOGIN / QONTO_SECRET')
  const res = await fetch(BASE + path, {
    headers: { Authorization: `${QONTO_LOGIN}:${QONTO_SECRET}`, Accept: 'application/json' },
    next: { revalidate: SECONDI_CACHE, tags: ['qonto'] },
  })
  if (!res.ok) {
    const testo = await res.text().catch(() => '')
    throw new Error(`Qonto GET ${path.split('?')[0]} → ${res.status}: ${testo.slice(0, 300)}`)
  }
  return (await res.json()) as T
}
