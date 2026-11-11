/**
 * GET /api/cron/fatture-sdi — giro notturno dell'import delle fatture XML.
 *
 * Legge la cartella SharePoint delle fatture, crea le scadenze nei Flussi
 * fatture e sposta i file in "Importate". Idempotente: rigirarlo non duplica
 * niente, e i file già letti non ci sono più.
 *
 * Nello stesso giro (Vercel Hobby: un cron al giorno) si tiene vivo il token
 * OAuth di Qonto, si allineano i bonifici inviati (approvati → pagati) e poi
 * si leggono le uscite di Qonto e si abbinano alle fatture
 * (docs/riconciliazione-qonto.md). L'ordine conta: prima le fatture nuove e i
 * bonifici chiusi, poi l'abbinamento, così trova tutto quello che c'è.
 *
 * Subito dopo le fatture si leggono i file delle carte carburante e si
 * dividono le fatture IP fra i centri di costo (docs/carburante.md): le
 * fatture nuove del fornitore devono già esserci.
 *
 * Sicurezza: Vercel allega `Authorization: Bearer ${CRON_SECRET}` se l'env è
 * impostata.
 */

import { NextRequest, NextResponse } from 'next/server'
import { importaFattureSdi } from '@/lib/pagamenti/sdi/import'
import { mantieniVivo } from '@/lib/qonto/oauth'
import { sincronizzaQonto } from '@/lib/qonto/bonifici'
import { riconciliaQonto } from '@/lib/qonto/riconciliazione'
import { qontoConfigurato } from '@/lib/qonto/client'
import { aggiornaCarburante } from '@/lib/carburante/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }
  try {
    const ricevuta = await importaFattureSdi({ utente: 'cron fatture SDI', budgetMs: 180_000 })
    // Carburante: un guasto qui non deve far sembrare fallito l'import.
    let carburante: unknown
    try {
      const r = await aggiornaCarburante()
      carburante = { ...r, file: r.file.filter((f) => f.esito !== 'invariato') }
    } catch (e: any) {
      console.error('[cron fatture-sdi] carburante', e)
      carburante = { errore: e?.message }
    }
    // Qonto: un guasto qui non deve far sembrare fallito l'import.
    let qonto: unknown
    try {
      qonto = { token: await mantieniVivo(), bonifici: await sincronizzaQonto() }
    } catch (e: any) {
      console.error('[cron fatture-sdi] qonto', e)
      qonto = { errore: e?.message }
    }
    // Riconciliazione: legge con la chiave API, indipendente da OAuth.
    let riconciliazione: unknown = null
    if (qontoConfigurato()) {
      try {
        riconciliazione = await riconciliaQonto()
      } catch (e: any) {
        console.error('[cron fatture-sdi] riconciliazione', e)
        riconciliazione = { errore: e?.message }
      }
    }
    return NextResponse.json({ ok: true, ricevuta, carburante, qonto, riconciliazione })
  } catch (e: any) {
    console.error('[cron fatture-sdi]', e)
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
