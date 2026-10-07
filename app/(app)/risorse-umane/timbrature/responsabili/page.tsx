/**
 * Responsabili e abilitazioni delle timbrature.
 *
 * Chi compila il foglio ore e chi lo valida, tutto in un elenco invece che
 * scheda per scheda. Scrive sugli stessi campi della scheda RU, che resta la
 * fonte di verità: vedi lib/timbrature/responsabili.ts.
 *
 * Solo HR: assegnare i responsabili decide chi vede le ore di chi.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { getRubrica } from '@/lib/core/rubrica'
import { AREA_HR } from '@/lib/timbrature/guard'
import { Responsabili } from './Responsabili'

export const dynamic = 'force-dynamic'

export default async function ResponsabiliPage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA_HR)) redirect('/home')

  // La rubrica serve a scegliere il referente fra gli account veri (niente
  // email battute a mano) e a riconoscere i referenti che non esistono.
  // Se Graph è muto torna vuota e la schermata ricade sull'inserimento a mano.
  const rubrica = await getRubrica()
  return <Responsabili rubrica={rubrica} />
}
