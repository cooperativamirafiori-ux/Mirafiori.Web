/**
 * Lavori di Cura Ambienti.
 *
 *   GET  ?mese=YYYY-MM → { lavori, riepilogo, strutture }
 *   POST {dati}        → crea un lavoro in bozza
 *
 * Accesso: coordinatori di cc24 o permesso "Controllo di Gestione"
 * (lib/cura-ambienti/accesso.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardCuraAmbienti } from '@/lib/cura-ambienti/guard'
import { creaLavoro, getMese, getStruttureScelta } from '@/lib/cura-ambienti/data'
import { leggiDati, normalizzaMese } from '@/lib/cura-ambienti/flusso'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardCuraAmbienti()
  if (g.error) return g.error
  const mese = normalizzaMese(req.nextUrl.searchParams.get('mese'))
  if (!mese) return NextResponse.json({ error: 'Mese non valido' }, { status: 400 })
  try {
    const [dati, strutture] = await Promise.all([getMese(mese), getStruttureScelta()])
    return NextResponse.json({ ...dati, strutture })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Errore di lettura' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardCuraAmbienti()
  if (g.error) return g.error
  let b: Record<string, unknown>
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }
  const letto = leggiDati(b)
  if ('problemi' in letto) return NextResponse.json({ error: letto.problemi.join(' · ') }, { status: 400 })
  try {
    const lavoro = await creaLavoro(letto.dati, g.email)
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'cura_ambienti.crea_lavoro',
      entita: 'LavoroCuraAmbienti',
      entitaId: lavoro.id,
      dettagli: { numero: lavoro.numero, titolo: lavoro.titolo, cc: lavoro.ccCodice, mese: lavoro.mese },
    })
    return NextResponse.json({ lavoro })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Salvataggio non riuscito' }, { status: 400 })
  }
}
