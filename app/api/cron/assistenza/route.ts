/**
 * GET /api/cron/assistenza — job giornaliero dell'Assistenza IT.
 *
 * Due compiti soli:
 *   1. digest dei ticket nuovi → squadra IT (una mail al giorno, non una per
 *      ticket: è la differenza fra una casella letta e una ignorata);
 *   2. nella stessa mail, l'elenco di quelli aperti da più di GIORNI_ARRETRATO
 *      giorni. Non chiude niente e non solleva nessuno: li rende visibili.
 *
 * Niente solleciti al richiedente né chiusure d'ufficio, a differenza di
 * Acquisti: qui il ticket lo chiude l'IT, e un ticket che nessuno chiude è un
 * lavoro non fatto, non una risposta che manca.
 *
 * Sicurezza: Vercel allega `Authorization: Bearer ${CRON_SECRET}` se l'env è
 * impostata. Il digest è idempotente (flag DigestInviato), quindi una doppia
 * esecuzione non produce doppie mail.
 */

import { NextRequest, NextResponse } from 'next/server'
import { aggiornaTicket, assistenzaConfigurata, getTicket } from '@/lib/assistenza/data'
import { emailGestori, linkGestione } from '@/lib/assistenza/flusso'
import { destinatariAssistenza, notificaDigestAssistenza } from '@/lib/assistenza/notifiche'
import { STATI_APERTI, arretrato, dispositivoDi, giorniDa } from '@/types/assistenza'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }
  if (!assistenzaConfigurata()) {
    return NextResponse.json({ ok: true, salto: 'sezione assistenza non configurata' })
  }

  try {
    const tutti = await getTicket()
    const gestori = await emailGestori()
    const to = destinatariAssistenza(gestori)

    const nuovi = tutti.filter((t) => !t.digestInviato && t.stato !== 'Annullata')
    const arretrati = tutti.filter(arretrato)

    // Nessuna novità e nessun arretrato: si tace. Una mail che dice "niente"
    // tutti i giorni insegna a non aprire le mail.
    if (!nuovi.length && !arretrati.length) {
      return NextResponse.json({ ok: true, digest: 0, arretrati: 0 })
    }
    if (!to.length) {
      return NextResponse.json({
        ok: true,
        salto: 'nessun destinatario: manca il permesso "IT e Dispositivi" a qualcuno',
        daInviare: nuovi.length,
      })
    }

    await notificaDigestAssistenza({
      to,
      nuovi: nuovi.map((t) => ({
        codice: t.codice,
        richiedente: t.richiedenteNome,
        categoria: t.categoria,
        dispositivo: dispositivoDi(t) || undefined,
        priorita: t.priorita,
        problema: t.problema,
      })),
      arretrati: arretrati.map((t) => ({
        codice: t.codice,
        giorni: giorniDa(t.dataApertura) ?? 0,
        stato: t.stato,
        problema: t.problema,
      })),
      linkApp: linkGestione(),
    })

    for (const t of nuovi) {
      await aggiornaTicket(t.spItemId, { DigestInviato: true })
    }

    return NextResponse.json({
      ok: true,
      digest: nuovi.length,
      arretrati: arretrati.length,
      aperti: tutti.filter((t) => STATI_APERTI.includes(t.stato)).length,
    })
  } catch (e: any) {
    console.error('[GET /api/cron/assistenza]', e)
    return NextResponse.json({ error: e?.message ?? 'Errore interno' }, { status: 500 })
  }
}
