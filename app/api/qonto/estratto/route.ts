/**
 * POST /api/qonto/estratto — manda subito l'estratto conti della settimana
 * precedente (lo stesso Excel che il lunedì arriva ad Alessandro) agli
 * indirizzi scritti nella scheda Qonto. Body: { email: "a@b.it, c@d.it" }.
 *
 * Solo chi vede TUTTI i conti (permesso Controllo di Gestione): l'Excel li
 * contiene tutti, principale compreso. Il bottone sta in
 * app/(app)/controllo-gestione/qonto/ (Dennis, 30/10/2026).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { logAzione } from '@/lib/core/audit'
import { accessoQonto } from '@/lib/qonto/accesso'
import { qontoConfigurato } from '@/lib/qonto/client'
import { preparaEstratto, settimanaPrecedente } from '@/lib/qonto/estratto'
import { mandaEstratto } from '@/lib/qonto/notifiche'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!(await accessoQonto(session.user)).tutti) {
    return NextResponse.json({ error: 'Serve il permesso Controllo di Gestione' }, { status: 403 })
  }
  if (!qontoConfigurato()) return NextResponse.json({ error: 'Qonto non è collegato all’app' }, { status: 503 })

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }
  const indirizzi = String(body.email ?? '').split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean)
  if (!indirizzi.length) return NextResponse.json({ error: 'Scrivi almeno un indirizzo mail' }, { status: 400 })
  const sbagliati = indirizzi.filter((x) => !MAIL.test(x))
  if (sbagliati.length) return NextResponse.json({ error: `Indirizzo non valido: ${sbagliati.join(', ')}` }, { status: 400 })
  if (indirizzi.length > 10) return NextResponse.json({ error: 'Al massimo 10 indirizzi' }, { status: 400 })

  try {
    const settimana = settimanaPrecedente()
    const estratto = await preparaEstratto(settimana)
    const destinatari = await mandaEstratto(estratto, indirizzi)
    const movimenti = estratto.righe.reduce((n, r) => n + r.movimenti.length, 0)
    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: 'qonto.estratto.invio-manuale',
      entita: 'Estratto Qonto',
      dettagli: { dal: settimana.dal, al: settimana.al, destinatari, conti: estratto.righe.length, movimenti },
    })
    return NextResponse.json({ dal: settimana.dal, al: settimana.al, conti: estratto.righe.length, movimenti, destinatari })
  } catch (e) {
    console.error('[POST /api/qonto/estratto]', e)
    return NextResponse.json({ error: 'Qonto non risponde in questo momento: riprova fra qualche minuto.' }, { status: 500 })
  }
}
