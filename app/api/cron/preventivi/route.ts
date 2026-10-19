/**
 * GET /api/cron/preventivi — promemoria giornaliero.
 *
 * A chi ha emesso un preventivo ancora senza esito da almeno GIORNI_SOLLECITO
 * giorni arriva UNA mail con l'elenco dei suoi (non una per preventivo), e poi
 * di nuovo ogni GIORNI_SOLLECITO giorni finché non segna com'è andata.
 * Riunione 19/10/2026: "mando una mail ogni 3 giorni: è accettato questo,
 * questo e questo? Ti basta cliccare".
 *
 * Idempotente nella giornata: UltimoSollecito si scrive dopo l'invio.
 * Sicurezza: Bearer CRON_SECRET, come gli altri cron.
 */

import { NextRequest, NextResponse } from 'next/server'
import { aggiornaCampi, getPreventivi, preventiviConfigurati } from '@/lib/preventivi/data'
import { GIORNI_SOLLECITO } from '@/lib/preventivi/flusso'
import { aggiungiGiorni, oggiIso } from '@/lib/preventivi/calcoli'
import { notificaSollecito } from '@/lib/preventivi/notifiche'
import type { Preventivo } from '@/types/preventivi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }
  if (!preventiviConfigurati()) return NextResponse.json({ ok: true, salto: 'preventivi non configurati' })

  try {
    const soglia = aggiungiGiorni(oggiIso(), -GIORNI_SOLLECITO)
    const daSollecitare = (await getPreventivi()).filter(
      (p) =>
        p.stato === 'emesso' &&
        p.creatoDa &&
        p.emessoIl &&
        p.emessoIl <= soglia &&
        (!p.ultimoSollecito || p.ultimoSollecito.slice(0, 10) <= soglia),
    )
    const perPersona = new Map<string, Preventivo[]>()
    for (const p of daSollecitare) perPersona.set(p.creatoDa, [...(perPersona.get(p.creatoDa) ?? []), p])

    let mail = 0
    for (const [email, elenco] of perPersona) {
      await notificaSollecito(email, elenco)
      mail++
      const adesso = new Date().toISOString()
      for (const p of elenco) await aggiornaCampi(p.spItemId, { UltimoSollecito: adesso })
    }
    return NextResponse.json({ ok: true, preventivi: daSollecitare.length, mail })
  } catch (e) {
    console.error('[cron/preventivi]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'errore' }, { status: 500 })
  }
}
