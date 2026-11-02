/**
 * GET /api/cron/ribaltamento — giro notturno del ribaltamento dei servizi interni
 * (docs/servizi-interni-piano.md § Ribaltamento, 2/11/2026).
 *
 *   1. I Lavori di Cura Ambienti consuntivati il cui mese di addebito è chiuso
 *      (dopo il 10 del mese dopo) diventano «addebitati»: da lì non si toccano.
 *   2. Riallinea gli addebiti automatici dei mesi ancora aperti — Lavori e
 *      manutenzioni — nel caso uno non si fosse aggiornato al salvataggio.
 *
 * Idempotente: rigirarlo non cambia niente se è tutto allineato (stessi importi
 * = il visto di chi riceve resta).
 *
 * Sicurezza: Vercel allega `Authorization: Bearer ${CRON_SECRET}` se l'env è impostata.
 */

import { NextRequest, NextResponse } from 'next/server'
import { segnaLavoriAddebitati, lavoriDaRiallineare, ribaltaLavoro } from '@/lib/cura-ambienti/ribaltamento'
import { riallineaManutenzioni } from '@/lib/manutenzioni/ribaltamento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SISTEMA = 'ribaltamento-notturno'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const errori: string[] = []
  let lavori = 0
  // Prima si riallineano i mesi aperti, poi si chiudono quelli scaduti.
  try {
    for (const id of await lavoriDaRiallineare()) {
      try {
        await ribaltaLavoro(id, SISTEMA)
        lavori++
      } catch (e) {
        errori.push(`lavoro ${id}: ${e instanceof Error ? e.message : e}`)
      }
    }
  } catch (e) {
    errori.push(`lavori: ${e instanceof Error ? e.message : e}`)
  }

  let manutenzioni = 0
  try {
    const r = await riallineaManutenzioni(SISTEMA)
    manutenzioni = r.richieste
    errori.push(...r.errori)
  } catch (e) {
    errori.push(`manutenzioni: ${e instanceof Error ? e.message : e}`)
  }

  let addebitati = 0
  try {
    addebitati = await segnaLavoriAddebitati()
  } catch (e) {
    errori.push(`lavori addebitati: ${e instanceof Error ? e.message : e}`)
  }

  if (errori.length) console.error('[cron/ribaltamento]', errori)
  return NextResponse.json({ ok: errori.length === 0, lavori, manutenzioni, addebitati, errori })
}
