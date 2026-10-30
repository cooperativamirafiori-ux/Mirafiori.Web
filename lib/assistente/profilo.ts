/**
 * Chi è la persona, nel vocabolario della guida (`accesso:` nelle schede, vedi
 * guida/LEGGIMI.md). Serve all'assistente per sapere quali link può dare.
 *
 * Ogni controllo che interroga un'anagrafica è protetto: se una fonte non
 * risponde la voce manca, e l'assistente al massimo dice "non hai il permesso"
 * a chi lo avrebbe. Meglio così che dare un link che poi rimanda alla Home.
 */

import type { Session } from 'next-auth'
import { getCentriCoordinati } from '@/lib/centri-costo/data'
import { eResponsabile } from '@/lib/timbrature/data'
import { CC_CURA_AMBIENTI } from '@/types/cura-ambienti'
import type { PaginaGuida } from './guida'

export async function vociAccesso(user: Session['user'] | undefined): Promise<Set<string>> {
  const voci = new Set<string>(['tutti', 'pubblico'])
  if (!user) return voci
  for (const p of user.permessi ?? []) voci.add(`permesso:${p}`)
  if (user.isAdmin) voci.add('admin')
  if (user.membroRU) voci.add('gruppo-ru')

  const email = user.email ?? ''
  const [centri, responsabile] = await Promise.all([
    getCentriCoordinati(email).catch(() => [] as string[]),
    email ? eResponsabile(email).catch(() => false) : Promise.resolve(false),
  ])
  if (centri.length) voci.add('coordinatore-cc')
  if (centri.includes(CC_CURA_AMBIENTI)) voci.add('coordinatore-cura-ambienti')
  if (responsabile) voci.add('responsabile-timbrature')
  return voci
}

export function puoAprire(pagina: PaginaGuida, voci: Set<string>): boolean {
  return pagina.accesso.some((v) => voci.has(v))
}

/** Le voci in parole, per dire all'assistente chi ha davanti. */
export function descriviVoci(voci: Set<string>): string {
  const parole: string[] = []
  const permessi = [...voci].filter((v) => v.startsWith('permesso:')).map((v) => v.slice(9))
  parole.push(permessi.length ? `permessi: ${permessi.join(', ')}` : 'nessun permesso particolare')
  if (voci.has('admin')) parole.push('amministratore delle manutenzioni')
  if (voci.has('gruppo-ru')) parole.push('fa parte del gruppo Risorse Umane')
  if (voci.has('coordinatore-cc')) parole.push('coordinatore di almeno un centro di costo')
  if (voci.has('coordinatore-cura-ambienti')) parole.push('coordinatore di Cura Ambienti')
  if (voci.has('responsabile-timbrature')) parole.push('valida i fogli ore di qualcuno')
  return parole.join('; ')
}
