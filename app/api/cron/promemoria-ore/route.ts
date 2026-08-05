/**
 * GET /api/cron/promemoria-ore — eseguito da Vercel Cron (1 volta al giorno).
 *
 * Invia al prestatore una mail "invia il foglio ore a {responsabile}" quando
 * mancano 3 giorni (o meno) alla data fine della prestazione, una sola volta
 * (flag PromemoriaOreInviato).
 *
 * Sicurezza: Vercel allega automaticamente `Authorization: Bearer ${CRON_SECRET}`
 * se l'env CRON_SECRET è impostata. Se CRON_SECRET non è impostata, la route
 * resta accessibile (utile in locale) ma è comunque innocua (solo invio mail).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPrestazioniAttive, aggiornaPrestazione } from '@/lib/prestazioni/data'
import { notificaPromemoriaFoglioOre } from '@/lib/prestazioni/notifiche'
import { dataBreve } from '@/lib/prestazioni/documenti'
import { verificaEScaricaFirma } from '@/lib/prestazioni/firma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const oggi = new Date()
  const limite = new Date()
  limite.setDate(limite.getDate() + 3)
  const oggiYmd = ymd(oggi)
  const limiteYmd = ymd(limite)

  try {
    const attive = await getPrestazioniAttive()
    const daAvvisare = attive.filter((p) => {
      const fine = (p.dataFine || '').slice(0, 10)
      return (
        !p.promemoriaOreInviato &&
        !!p.email &&
        !!p.responsabileEmail &&
        fine >= oggiYmd &&
        fine <= limiteYmd
      )
    })

    let inviati = 0
    for (const p of daAvvisare) {
      await notificaPromemoriaFoglioOre({
        to: p.email,
        prestatoreNome: p.nome,
        idPrestazione: p.idPrestazione,
        dataFine: dataBreve(p.dataFine),
        responsabileEmail: p.responsabileEmail,
      })
      await aggiornaPrestazione(p.spItemId, { PromemoriaOreInviato: true })
      inviati++
    }

    // Fase 2: controlla le firme DocuSign in sospeso e archivia i firmati
    const inAttesaFirma = attive.filter(
      (p) => p.stato === 'Contratto inviato' && p.docusignEnvelopeId,
    )
    let firmati = 0
    for (const p of inAttesaFirma) {
      try {
        const esito = await verificaEScaricaFirma(p)
        if (esito.firmato) firmati++
      } catch (e) {
        console.error('[cron] verifica firma fallita', p.idPrestazione, e)
      }
    }

    return NextResponse.json({
      ok: true,
      candidati: daAvvisare.length,
      inviati,
      firmeControllate: inAttesaFirma.length,
      firmati,
    })
  } catch (err: any) {
    console.error('[GET /api/cron/promemoria-ore]', err)
    return NextResponse.json({ error: err?.message ?? 'Errore interno' }, { status: 500 })
  }
}
