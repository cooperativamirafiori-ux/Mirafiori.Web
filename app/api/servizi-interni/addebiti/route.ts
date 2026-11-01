/**
 * Addebiti interni (docs/servizi-interni-piano.md).
 *
 * GET  ?anno=2026 → addebiti visibili (fatti dai propri servizi o ricevuti),
 *                    centri di costo, forfait, cosa può fare chi guarda
 * POST DatiAddebito → nuovo addebito + mail ai coordinatori di chi lo riceve
 *
 * Scrive il coordinatore del servizio che ha lavorato, o chi ha
 * "Controllo di Gestione".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardServiziInterni } from '@/lib/servizi-interni/guard'
import { puoScrivereDa } from '@/lib/servizi-interni/accesso'
import { creaAddebito, getAddebiti, getCentriScelta, getForfait } from '@/lib/servizi-interni/data'
import { bloccato, validaAddebito } from '@/lib/servizi-interni/flusso'
import { notificaAddebito } from '@/lib/servizi-interni/notifiche'
import { logAzione } from '@/lib/core/audit'

export async function GET(req: NextRequest) {
  const g = await guardServiziInterni()
  if (g.error) return g.error
  const anno = Number(req.nextUrl.searchParams.get('anno')) || new Date().getFullYear()
  try {
    const [addebiti, centri, forfait] = await Promise.all([getAddebiti(anno, g.accesso), getCentriScelta(), getForfait()])
    return NextResponse.json({
      anno,
      addebiti,
      centri,
      forfait,
      tutti: g.accesso.tutti,
      mieiCentri: g.accesso.tutti ? centri.map((c) => c.codice) : g.accesso.codici,
    })
  } catch (e: any) {
    console.error('[GET /api/servizi-interni/addebiti]', e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await guardServiziInterni()
  if (g.error) return g.error
  let dati
  try {
    dati = validaAddebito(await req.json())
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Dati non validi' }, { status: 400 })
  }
  if (!puoScrivereDa(g.accesso, dati.ccDa)) {
    return NextResponse.json({ error: 'Puoi addebitare solo per i servizi che coordini' }, { status: 403 })
  }
  if (bloccato(dati.mese)) {
    return NextResponse.json({ error: 'Quel mese è chiuso: metti l\'addebito nel mese corrente' }, { status: 400 })
  }
  try {
    const centri = await getCentriScelta()
    const nome = (c: string) => centri.find((x) => x.codice === c)?.nome ?? c
    if (!centri.some((c) => c.codice === dati.ccA)) {
      return NextResponse.json({ error: 'Servizio di destinazione non trovato' }, { status: 400 })
    }
    const addebito = await creaAddebito(dati, g.email)
    notificaAddebito({ addebito, nomeDa: nome(dati.ccDa), nomeA: nome(dati.ccA), modificato: false }).catch(console.error)
    await logAzione({
      utente: g.email,
      nome: g.nome,
      azione: 'addebito-interno.crea',
      entita: 'AddebitoInterno',
      entitaId: String(addebito.numero),
      dettagli: { da: dati.ccDa, a: dati.ccA, mese: dati.mese, totale: addebito.totale },
    })
    return NextResponse.json({ ok: true, addebito })
  } catch (e: any) {
    console.error('[POST /api/servizi-interni/addebiti]', e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
