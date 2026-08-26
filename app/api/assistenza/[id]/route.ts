/**
 * PATCH /api/assistenza/[id] — fa avanzare un ticket di assistenza.
 *
 * L'azione è nel body (`azione`), non nel percorso: le transizioni sono molte e
 * un endpoint per ciascuna moltiplicherebbe i file senza aggiungere chiarezza.
 * È la stessa forma di /api/acquisti/[id].
 *
 * Permessi:
 *   - le azioni di lavorazione richiedono l'area "IT e Dispositivi";
 *   - `riapri` è del **richiedente**, sul proprio ticket e solo entro la
 *     finestra di riapertura;
 *   - `annulla` è concessa anche al richiedente, ma solo finché nessuno ha
 *     ancora messo mano al ticket: dopo, il tempo speso va rendicontato.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import {
  aggiornaTicket,
  assistenzaConfigurata,
  campiRisoluzione,
  getTicketById,
} from '@/lib/assistenza/data'
import {
  AZIONI_GESTORE,
  azioneAmmessa,
  campiRiapertura,
  destinatariLavoro,
  emailGestori,
  emailRichiedente,
  linkGestione,
  linkMie,
  statoDopoAssegnazione,
  STATO_DOPO,
} from '@/lib/assistenza/flusso'
import {
  notificaAnnullato,
  notificaAssegnazioneTicket,
  notificaPresaInCarico,
  notificaRiapertura,
  notificaRichiestaInfo,
  notificaRisolto,
} from '@/lib/assistenza/notifiche'
import { getSPUserLookupId } from '@/lib/core/sp'
import { logAzione } from '@/lib/core/audit'
import {
  AREA_ASSISTENZA,
  GIORNI_RIAPERTURA,
  PRIORITA,
  dispositivoDi,
  type AggiornaAssistenzaPayload,
  type AzioneAssistenza,
} from '@/types/assistenza'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

/**
 * Nome di cortesia dal solo indirizzo email: la lista dei permessi contiene
 * indirizzi, non nomi, e un "Ciao mario.rossi@..." in apertura di mail stona.
 */
function nomeDaEmail(email: string): string {
  const nome = email.split('@')[0].split(/[._-]/)[0]
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : ''
}

/** Prima parola del nome: nelle mail si dà del tu. */
const nomeProprio = (nome?: string) => (nome || '').split(' ')[0] || ''

/** Aggiunge una riga datata alle note interne invece di sovrascriverle. */
function appendiNota(esistenti: string | undefined, riga: string): string {
  return [esistenti, `${new Date().toLocaleDateString('it-IT')} — ${riga}`]
    .filter(Boolean)
    .join('\n')
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!assistenzaConfigurata()) return err('Sezione assistenza non configurata', 503)

  const session = await auth()
  if (!session?.user?.email) return err('Non autenticato', 401)
  const email = session.user.email
  const ioNome = session.user.name ?? nomeDaEmail(email)

  let body: AggiornaAssistenzaPayload
  try {
    body = await req.json()
  } catch {
    return err('Body non valido')
  }

  const azione = body.azione as AzioneAssistenza
  if (!azione) return err('Azione mancante')

  try {
    const t = await getTicketById(id)

    // --- permessi ------------------------------------------------
    const eGestore = session.user.permessi?.includes(AREA_ASSISTENZA) ?? false
    const mioLookupId = await getSPUserLookupId(email).catch(() => 0)
    const eMio = mioLookupId > 0 && mioLookupId === t.richiedenteLookupId

    if (AZIONI_GESTORE.includes(azione)) {
      const annullaDelRichiedente = azione === 'annulla' && eMio && t.stato === 'Inviata'
      if (!eGestore && !annullaDelRichiedente) {
        return err(
          azione === 'annulla'
            ? 'Il ticket è già in lavorazione: chiedi all’IT di annullarlo.'
            : 'Accesso negato',
          403,
        )
      }
    } else if (azione === 'riapri') {
      if (!eMio) return err('Puoi riaprire solo le tue richieste.', 403)
    } else {
      return err('Azione sconosciuta')
    }

    // --- ammissibilità -------------------------------------------
    const ammessa = azioneAmmessa(t, azione)
    if (!ammessa.ok) return err(ammessa.motivo, 409)

    const statoNuovo = STATO_DOPO[azione]
    let fields: Record<string, unknown> = statoNuovo ? { Stato: statoNuovo } : {}
    let dettagli: Record<string, unknown> = {}

    switch (azione) {
      // ---------------------------------------------------------
      case 'prendi-in-carico': {
        // Chi prende in carico se lo intesta, se non c'è già un responsabile:
        // un ticket "preso in carico da nessuno" è un ticket che nessuno guarda.
        if (!t.assegnatoLookupId && mioLookupId) {
          fields.AssegnatoLookupId = mioLookupId
        }
        await aggiornaTicket(id, fields)

        const to = await emailRichiedente(t)
        if (to) {
          notificaPresaInCarico({
            to,
            richiedenteNome: nomeProprio(t.richiedenteNome),
            codice: t.codice,
            problema: t.problema,
            operatore: ioNome,
            priorita: t.priorita,
            linkApp: linkMie(),
          }).catch(console.error)
        }
        break
      }

      // ---------------------------------------------------------
      case 'assegna': {
        const destinatario = (body.assegnatoEmail ?? '').trim().toLowerCase()
        if (!destinatario.includes('@')) return err('Scegli a chi assegnare il ticket.')

        const gestori = await emailGestori()
        if (gestori.length && !gestori.map((g) => g.toLowerCase()).includes(destinatario)) {
          return err('Quella persona non ha il permesso dell’area IT: assegnaglielo prima da Amministrazione → Permessi.')
        }

        const lookupId = await getSPUserLookupId(destinatario)
        fields.AssegnatoLookupId = lookupId
        const promosso = statoDopoAssegnazione(t.stato)
        if (promosso) fields.Stato = promosso
        await aggiornaTicket(id, fields)

        // Chi si assegna un ticket da sé non riceve la mail: lo sa già.
        if (destinatario !== email.toLowerCase()) {
          notificaAssegnazioneTicket({
            to: destinatario,
            assegnatoNome: nomeDaEmail(destinatario),
            assegnataDa: ioNome,
            codice: t.codice,
            richiedente: t.richiedenteNome,
            tipologia: t.tipologia,
            categoria: t.categoria,
            dispositivo: dispositivoDi(t) || undefined,
            priorita: t.priorita,
            problema: t.problema,
            struttura: t.struttura?.value,
            recapito: t.recapito,
            disponibilita: t.disponibilita,
            linkApp: linkGestione(),
          }).catch(console.error)
        }
        dettagli = { a: destinatario }
        break
      }

      // ---------------------------------------------------------
      case 'priorita': {
        const p = body.priorita
        if (!p || !PRIORITA.includes(p)) return err('Priorità non valida')
        await aggiornaTicket(id, { Priorita: p })
        dettagli = { da: t.priorita, a: p }
        break
      }

      // ---------------------------------------------------------
      case 'lavora':
        await aggiornaTicket(id, fields)
        break

      // ---------------------------------------------------------
      case 'attesa-fornitore': {
        // Se si aspetta qualcuno di fuori, l'assistenza è esterna: la spunta
        // si scrive da sé, invece di lasciarla a chi si ricorda di metterla.
        fields.AssistenzaEsterna = true
        const fornitore = body.fornitoreEsterno?.trim()
        if (fornitore) fields.FornitoreEsterno = fornitore
        await aggiornaTicket(id, fields)
        dettagli = { fornitore }
        break
      }

      // ---------------------------------------------------------
      case 'chiedi-info': {
        const messaggio = (body.messaggio ?? '').trim()
        if (!messaggio) return err('Scrivi cosa ti serve sapere: la mail la legge il richiedente.')

        fields.NoteInterne = appendiNota(t.noteInterne, `Chiesto al richiedente: ${messaggio}`)
        await aggiornaTicket(id, fields)

        const to = await emailRichiedente(t)
        if (!to) {
          return err(
            'Non riesco a risalire alla mail del richiedente: la domanda non è partita.',
            502,
          )
        }
        notificaRichiestaInfo({
          to,
          richiedenteNome: nomeProprio(t.richiedenteNome),
          codice: t.codice,
          problema: t.problema,
          messaggio,
          operatore: ioNome,
          linkApp: linkMie(),
        }).catch(console.error)
        break
      }

      // ---------------------------------------------------------
      case 'risolvi': {
        const interventi = (body.interventi ?? '').trim()
        if (!interventi) {
          return err(
            'Scrivi cosa hai fatto: è quello che il richiedente legge nella mail di chiusura, ed è lo storico del dispositivo.',
          )
        }
        fields = campiRisoluzione({
          interventi,
          analisi: body.analisi,
          oreLavoro: body.oreLavoro,
          assistenzaEsterna: body.assistenzaEsterna,
        })
        await aggiornaTicket(id, fields)

        const to = await emailRichiedente(t)
        if (to) {
          notificaRisolto({
            to,
            richiedenteNome: nomeProprio(t.richiedenteNome),
            codice: t.codice,
            problema: t.problema,
            interventi,
            operatore: ioNome,
            giorniRiapertura: GIORNI_RIAPERTURA,
            linkApp: linkMie(),
          }).catch(console.error)
        }
        dettagli = { oreLavoro: body.oreLavoro, assistenzaEsterna: body.assistenzaEsterna }
        break
      }

      // ---------------------------------------------------------
      case 'annulla': {
        const motivo = (body.motivo ?? '').trim()
        if (!motivo) return err('Scrivi perché il ticket viene annullato.')
        fields.MotivoAnnullamento = motivo
        fields.DataChiusura = new Date().toISOString().slice(0, 10) + 'T12:00:00Z'
        await aggiornaTicket(id, fields)

        // Se lo annulla il richiedente non gli si manda la mail di sé stesso;
        // l'IT lo vede sparire dalla coda, ed è sufficiente.
        if (!eMio) {
          const to = await emailRichiedente(t)
          if (to) {
            notificaAnnullato({
              to,
              richiedenteNome: nomeProprio(t.richiedenteNome),
              codice: t.codice,
              problema: t.problema,
              motivo,
              operatore: ioNome,
            }).catch(console.error)
          }
        }
        dettagli = { motivo, daRichiedente: eMio }
        break
      }

      // ---------------------------------------------------------
      case 'note': {
        const nota = (body.noteInterne ?? '').trim()
        if (!nota) return err('La nota è vuota.')
        await aggiornaTicket(id, { NoteInterne: appendiNota(t.noteInterne, `${ioNome}: ${nota}`) })
        break
      }

      // ---------------------------------------------------------
      case 'riapri': {
        await aggiornaTicket(id, campiRiapertura(t, body.perche))

        const to = await destinatariLavoro(t)
        if (to.length) {
          notificaRiapertura({
            to,
            codice: t.codice,
            richiedente: t.richiedenteNome,
            problema: t.problema,
            perche: body.perche?.trim(),
            riaperture: (t.riaperture ?? 0) + 1,
            linkApp: linkGestione(),
          }).catch(console.error)
        }
        dettagli = { riaperture: (t.riaperture ?? 0) + 1 }
        break
      }
    }

    await logAzione({
      utente: email,
      nome: session.user.name,
      azione: `assistenza.${azione}`,
      entita: 'RichiestaAssistenza',
      entitaId: t.codice,
      dettagli: { statoPrima: t.stato, ...dettagli },
    })

    return NextResponse.json({ ticket: await getTicketById(id) })
  } catch (e: any) {
    console.error(`[PATCH /api/assistenza/${id}]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}

/** GET /api/assistenza/[id] — dettaglio, al richiedente o a chi fa assistenza. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!assistenzaConfigurata()) return err('Sezione assistenza non configurata', 503)

  const session = await auth()
  if (!session?.user?.email) return err('Non autenticato', 401)

  try {
    const t = await getTicketById(id)
    const eGestore = session.user.permessi?.includes(AREA_ASSISTENZA) ?? false
    if (!eGestore) {
      const mioLookupId = await getSPUserLookupId(session.user.email).catch(() => 0)
      if (!mioLookupId || mioLookupId !== t.richiedenteLookupId) return err('Accesso negato', 403)
      // Al richiedente non servono — e non spettano — le note di lavorazione.
      return NextResponse.json({ ticket: { ...t, noteInterne: undefined, analisi: undefined } })
    }
    return NextResponse.json({ ticket: t })
  } catch (e: any) {
    console.error(`[GET /api/assistenza/${id}]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
