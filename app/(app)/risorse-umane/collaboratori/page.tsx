import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * La sezione "Collaboratori" è stata unificata con i Dipendenti: ora sono
 * un'unica anagrafica distinta dalla colonna "Categoria RU". Questa pagina
 * resta solo come reindirizzamento per vecchi link/segnalibri.
 */
export default function CollaboratoriPage() {
  redirect('/risorse-umane/dipendenti?categoria=Collaboratore')
}
