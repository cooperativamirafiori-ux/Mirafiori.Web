/**
 * POST /api/assistenza — nuova richiesta di assistenza (qualsiasi utente loggato)
 * GET  /api/assistenza — elenco completo (solo chi ha l'area "IT e Dispositivi")
 *
 * All'invio:
 *   1. crea l'item e assegna il codice ASS-{anno}-{nnn};
 *   2. la priorità la calcola l'app da impatto e blocco, non la sceglie chi chiede;
 *   3. se esiste un solo gestore il ticket nasce già preso in carico da lui
 *      (uno smistamento con un destinatario solo è un'attesa in più);
 *   4. se la priorità è "Critica" avvisa subito la squadra, altrimenti il
 *      ticket viaggia nel digest giornaliero.
 *
 * Aprire una richiesta non richiede alcun permesso: la sezione è di tutti,
 * come Richiesta fattura. Il permesso serve solo per lavorarle.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { guardArea } from '@/lib/core/api-guard'
import {
  assistenzaConfigurata,
  creaTicket,
  getTicket,
  mieiDispositivi,
} from '@/lib/assistenza/data'
import { emailGestori, linkGestione } from '@/lib/assistenza/flusso'
import { notificaTicketCritico } from '@/lib/assistenza/notifiche'
import { getSPUserLookupId } from '@/lib/core/sp'
import { getStrutture } from '@/lib/strutture/data'
import { logAzione } from '@/lib/core/audit'
import {
  AREA_ASSISTENZA,
  CATEGORIE,
  IMPATTI,
  PRIORITA_IMMEDIATE,
  TIPOLOGIE,
  type Impatto,
  type NuovaRichiestaAssistenzaPayload,
} from '@/types/assistenza'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function GET() {
  const g = await guardArea(AREA_ASSISTENZA)
  if (g.error) return g.error
  if (!assistenzaConfigurata()) return err('Sezione assistenza non configurata', 503)
  try {
    return NextResponse.json({ ticket: await getTicket() })
  } catch (e: any) {
    console.error('[GET /api/assistenza]', e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return err('Non autenticato', 401)
  if (!assistenzaConfigurata()) return err('Sezione assistenza non configurata', 503)

  let body: NuovaRichiestaAssistenzaPayload
  try {
    body = await req.json()
  } catch {
    return err('Body non valido')
  }

  const tipologia = (body.tipologia ?? '').trim()
  const categoria = (body.categoria ?? '').trim()
  const impatto = (body.impatto ?? '').trim() as Impatto
  const problema = (body.problema ?? '').trim()
  const bloccante = Boolean(body.bloccante)

  if (!tipologia || !categoria || !impatto || !problema) {
    return err('Compila tipologia, categoria, impatto e descrizione del problema.')
  }
  if (!TIPOLOGIE.includes(tipologia as any)) return err('Tipologia non valida')
  if (!CATEGORIE.includes(categoria as any)) return err('Categoria non valida')
  if (!IMPATTI.includes(impatto as any)) return err('Impatto non valido')
  if (problema.length < 10) {
    return err('Descrivi il problema in una frase: due parole non bastano a chi deve risolverlo.')
  }

  try {
    const email = session.user.email
    const richiedenteLookupId = await getSPUserLookupId(email)

    // Il centro di costo non si chiede: è quello dell'assegnazione attiva del
    // dispositivo scelto. Se il bene non è fra i suoi (o non è un bene
    // censito), il ticket resta senza — meglio vuoto che attribuito a caso.
    const beneId = Number(body.beneId) || 0
    let centroCostoId: number | undefined
    if (beneId) {
      const miei = await mieiDispositivi(email)
      centroCostoId = miei.find((d) => d.id === beneId)?.centroCostoId
    }

    // Un id di lookup inesistente passa silenziosamente su SharePoint e
    // lascerebbe il ticket con un "dove" fantasma: si verifica.
    const strutturaId = Number(body.strutturaId) || 0
    if (strutturaId) {
      const strutture = await getStrutture().catch(() => [])
      if (strutture.length && !strutture.some((s) => s.id === strutturaId)) {
        return err('La sede indicata non esiste in anagrafica.')
      }
    }

    // Un solo gestore → il ticket è già suo: vedi nota in testa.
    const gestori = await emailGestori()
    let assegnatoLookupId: number | undefined
    if (gestori.length === 1) {
      try {
        assegnatoLookupId = await getSPUserLookupId(gestori[0])
      } catch {
        assegnatoLookupId = undefined
      }
    }

    const { spItemId, codice, priorita } = await creaTicket({
      richiedenteLookupId,
      tipologia,
      categoria,
      beneId: beneId || undefined,
      dispositivoAltro: body.dispositivoAltro?.trim(),
      problema,
      daQuando: body.daQuando,
      bloccante,
      impatto,
      strutturaId: strutturaId || undefined,
      recapito: body.recapito?.trim(),
      disponibilita: body.disponibilita?.trim(),
      allegatoUrl: body.allegatoUrl,
      allegatoNome: body.allegatoNome,
      centroCostoId,
      assegnatoLookupId,
    })

    if (PRIORITA_IMMEDIATE.includes(priorita)) {
      const strutture = strutturaId ? await getStrutture().catch(() => []) : []
      notificaTicketCritico({
        to: gestori.length ? gestori : [process.env.MAIL_SENDER_EMAIL!],
        codice,
        richiedente: session.user.name ?? email,
        tipologia,
        categoria,
        dispositivo: body.dispositivoAltro?.trim() || undefined,
        impatto,
        priorita,
        problema,
        struttura: strutture.find((s) => s.id === strutturaId)?.strutturaLabel,
        recapito: body.recapito?.trim(),
        disponibilita: body.disponibilita?.trim(),
        linkApp: linkGestione(),
      }).catch(console.error)
    }

    await logAzione({
      utente: email,
      nome: session.user.name,
      azione: 'assistenza.crea',
      entita: 'RichiestaAssistenza',
      entitaId: codice,
      dettagli: {
        tipologia,
        categoria,
        impatto,
        bloccante,
        priorita,
        beneId: beneId || undefined,
        autoAssegnata: Boolean(assegnatoLookupId),
      },
    })

    return NextResponse.json({ codice, spItemId, priorita }, { status: 201 })
  } catch (e: any) {
    console.error('[POST /api/assistenza]', e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
