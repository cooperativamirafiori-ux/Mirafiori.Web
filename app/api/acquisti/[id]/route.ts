/**
 * PATCH /api/acquisti/[id] — avanza una richiesta di acquisto.
 *
 * L'azione è nel body (`azione`), non nel percorso: le transizioni sono molte e
 * un endpoint per ciascuna moltiplicherebbe i file senza aggiungere chiarezza.
 *
 * Permessi:
 *   - le azioni di gestione richiedono l'area "Acquisti";
 *   - `annulla` è concessa anche al richiedente sulle proprie richieste, purché
 *     non siano già state ordinate;
 *   - `esito` è concessa al richiedente (in app; dalla mail passa dal token).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  aggiornaAcquisto,
  campiOrdine,
  generaCostoDaAcquisto,
  getAcquistoById,
  normalizzaNomeFornitore,
  acquistiConfigurato,
  AREA_ACQUISTI,
} from '@/lib/acquisti'
import {
  emailGestori,
  emailRichiedente,
  registraEsitoConsegna,
  linkGestione,
} from '@/lib/acquisti-flusso'
import { getSPUserLookupId, getStrutture } from '@/lib/sharepoint'
import { notificaEsitoValutazione, notificaOrdineEffettuato } from '@/lib/notifications'
import { logAzione } from '@/lib/audit'
import {
  ALIQUOTE_IVA,
  ESITI_CONSEGNA,
  MODALITA_PAGAMENTO,
  dataBreve,
  type AggiornaAcquistoPayload,
  type EsitoConsegna,
} from '@/types/acquisti'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

/** Azioni riservate a chi ha l'area "Acquisti". */
const AZIONI_GESTORE = new Set([
  'prendi-in-carico', 'assegna', 'approva', 'rifiuta', 'ordina', 'risolvi', 'note',
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!acquistiConfigurato()) return err('Sezione acquisti non configurata', 503)

  const session = await auth()
  if (!session?.user?.email) return err('Non autenticato', 401)

  let body: AggiornaAcquistoPayload
  try {
    body = await req.json()
  } catch {
    return err('Body non valido')
  }

  const azione = body.azione
  if (!azione) return err('Azione mancante')

  const eGestore = session.user.permessi?.includes(AREA_ACQUISTI) ?? false
  if (AZIONI_GESTORE.has(azione) && !eGestore) return err('Accesso negato', 403)

  try {
    const a = await getAcquistoById(id)
    const mioLookupId = await getSPUserLookupId(session.user.email)
    const sonoIlRichiedente = a.richiedenteLookupId === mioLookupId

    if ((azione === 'annulla' || azione === 'esito') && !eGestore && !sonoIlRichiedente) {
      return err('Accesso negato', 403)
    }

    switch (azione) {
      // ----------------------------------------------------------
      case 'prendi-in-carico': {
        if (a.stato !== 'Inviata' && a.stato !== 'Presa in carico') {
          return err(`La richiesta è già in stato "${a.stato}".`, 409)
        }
        await aggiornaAcquisto(id, {
          Stato: 'Presa in carico',
          AssegnatoLookupId: mioLookupId,
        })
        break
      }

      // ----------------------------------------------------------
      case 'assegna': {
        const email = body.assegnatoEmail?.trim()
        if (!email) return err('Indica a chi assegnare la richiesta.')
        const gestori = await emailGestori()
        if (!gestori.includes(email.toLowerCase())) {
          return err('L’utente indicato non ha il permesso "Acquisti".')
        }
        const lookupId = await getSPUserLookupId(email)
        await aggiornaAcquisto(id, {
          AssegnatoLookupId: lookupId,
          Stato: a.stato === 'Inviata' ? 'Presa in carico' : a.stato,
        })
        break
      }

      // ----------------------------------------------------------
      case 'approva': {
        if (!['Inviata', 'Presa in carico'].includes(a.stato)) {
          return err(`Non è possibile approvare una richiesta in stato "${a.stato}".`, 409)
        }
        await aggiornaAcquisto(id, {
          Stato: 'Approvata',
          AssegnatoLookupId: a.assegnatoLookupId ?? mioLookupId,
        })
        const to = await emailRichiedente(a)
        if (to) {
          notificaEsitoValutazione({
            to,
            richiedenteNome: (a.richiedenteNome || '').split(' ')[0] || '',
            codice: a.codice,
            descrizione: a.descrizione,
            esito: 'approvata',
          }).catch(console.error)
        }
        break
      }

      // ----------------------------------------------------------
      case 'rifiuta': {
        const motivo = body.motivo?.trim()
        // Il motivo è obbligatorio per scelta: senza, il richiedente telefona.
        if (!motivo) return err('Il motivo del rifiuto è obbligatorio.')
        if (['Consegnata', 'Annullata', 'Ordinata'].includes(a.stato)) {
          return err(`Non è possibile rifiutare una richiesta in stato "${a.stato}".`, 409)
        }
        await aggiornaAcquisto(id, {
          Stato: 'Non approvata',
          MotivoRifiuto: motivo,
          AssegnatoLookupId: a.assegnatoLookupId ?? mioLookupId,
        })
        const to = await emailRichiedente(a)
        if (to) {
          notificaEsitoValutazione({
            to,
            richiedenteNome: (a.richiedenteNome || '').split(' ')[0] || '',
            codice: a.codice,
            descrizione: a.descrizione,
            esito: 'rifiutata',
            motivo,
          }).catch(console.error)
        }
        break
      }

      // ----------------------------------------------------------
      case 'ordina': {
        if (!['Approvata', 'Presa in carico', 'Ordinata'].includes(a.stato)) {
          return err(`Non è possibile registrare un ordine in stato "${a.stato}".`, 409)
        }
        const fornitoreRaw = body.fornitore?.trim()
        if (!fornitoreRaw) return err('Indica il fornitore.')
        const imponibile = Number(body.imponibile)
        if (!isFinite(imponibile) || imponibile <= 0) {
          return err('Indica un imponibile maggiore di zero.')
        }
        const aliquota = Number(body.aliquotaIva ?? 22)
        if (!ALIQUOTE_IVA.includes(aliquota as any)) return err('Aliquota IVA non valida.')
        if (body.pagamento && !MODALITA_PAGAMENTO.includes(body.pagamento as any)) {
          return err('Modalità di pagamento non valida.')
        }
        if (body.daInventariare && !body.marcaModello?.trim()) {
          return err('Per i beni da inventariare marca e modello sono obbligatori.')
        }

        const fornitore = await normalizzaNomeFornitore(fornitoreRaw)
        const luogoConsegnaId = Number(body.luogoConsegnaId) || a.struttura.id

        await aggiornaAcquisto(
          id,
          campiOrdine({
            fornitore,
            imponibile,
            aliquotaIva: aliquota,
            dataOrdine: body.dataOrdine,
            pagamento: body.pagamento,
            dataConsegnaPrevista: body.dataConsegnaPrevista,
            luogoConsegnaId,
            daInventariare: body.daInventariare,
            marcaModello: body.marcaModello,
            numeroSerie: body.numeroSerie,
            extraCee: body.extraCee,
          }),
        )

        const to = await emailRichiedente(a)
        if (to) {
          const strutture = await getStrutture().catch(() => [])
          const luogo = strutture.find((s) => s.id === luogoConsegnaId)
          notificaOrdineEffettuato({
            to,
            richiedenteNome: (a.richiedenteNome || '').split(' ')[0] || '',
            codice: a.codice,
            descrizione: a.descrizione,
            fornitore,
            dataConsegnaPrevista: body.dataConsegnaPrevista
              ? dataBreve(body.dataConsegnaPrevista)
              : 'da definire',
            luogoConsegna: luogo?.strutturaLabel ?? a.struttura.value,
          }).catch(console.error)
        }
        break
      }

      // ----------------------------------------------------------
      case 'esito': {
        const esito = body.esito
        if (!esito || !ESITI_CONSEGNA.includes(esito)) return err('Esito non valido.')
        const res = await registraEsitoConsegna(id, esito as EsitoConsegna, body.noteEsito)
        if (!res.ok) return err(res.motivo ?? 'Operazione non possibile', 409)
        break
      }

      // ----------------------------------------------------------
      case 'risolvi': {
        if (a.stato !== 'Problema') {
          return err('Solo una richiesta in stato "Problema" può essere risolta.', 409)
        }
        await aggiornaAcquisto(id, {
          Stato: 'Consegnata',
          EsitoConsegna: 'Tutto ok',
          NoteEsito: [a.noteEsito, body.noteEsito?.trim()].filter(Boolean).join('\n'),
          DataConsegnaEffettiva: a.dataConsegnaEffettiva ?? new Date().toISOString(),
        })
        // La spesa entra nel cruscotto costi solo ora: prima l'esito era incerto.
        await generaCostoDaAcquisto(await getAcquistoById(id))
        break
      }

      // ----------------------------------------------------------
      case 'annulla': {
        if (['Consegnata', 'Annullata'].includes(a.stato)) {
          return err(`La richiesta è già in stato "${a.stato}".`, 409)
        }
        // Il richiedente può ritirare la propria richiesta solo finché non è
        // stato speso nulla: dopo l'ordine decide il gestore.
        if (!eGestore && ['Ordinata', 'Problema'].includes(a.stato)) {
          return err('La richiesta è già stata ordinata: contatta chi la gestisce.', 409)
        }
        await aggiornaAcquisto(id, {
          Stato: 'Annullata',
          MotivoRifiuto: body.motivo?.trim() || a.motivoRifiuto || '',
        })
        // Avviso l'altra parte: chi non ha premuto il tasto.
        if (eGestore && !sonoIlRichiedente) {
          const to = await emailRichiedente(a)
          if (to) {
            notificaEsitoValutazione({
              to,
              richiedenteNome: (a.richiedenteNome || '').split(' ')[0] || '',
              codice: a.codice,
              descrizione: a.descrizione,
              esito: 'annullata',
              motivo: body.motivo?.trim(),
            }).catch(console.error)
          }
        }
        break
      }

      // ----------------------------------------------------------
      case 'note': {
        await aggiornaAcquisto(id, { NoteInterne: body.noteInterne?.trim() ?? '' })
        break
      }

      default:
        return err(`Azione non riconosciuta: ${azione}`)
    }

    await logAzione({
      utente: session.user.email,
      nome: session.user.name,
      azione: `acquisto.${azione}`,
      entita: 'RichiestaAcquisto',
      entitaId: a.codice,
      dettagli: { statoPrecedente: a.stato, ...scrubBody(body) },
    })

    return NextResponse.json({ ok: true, acquisto: await getAcquistoById(id) })
  } catch (e: any) {
    console.error(`[PATCH /api/acquisti/${id}]`, e)
    return NextResponse.json({ error: e?.message ?? 'Errore interno' }, { status: 500 })
  }
}

/** Nel log non serve ripetere l'azione né tenere testi lunghi. */
function scrubBody(body: AggiornaAcquistoPayload): Record<string, unknown> {
  const { azione: _azione, noteInterne: _note, ...resto } = body
  return resto
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.email) return err('Non autenticato', 401)
  if (!acquistiConfigurato()) return err('Sezione acquisti non configurata', 503)

  try {
    const a = await getAcquistoById(id)
    const eGestore = session.user.permessi?.includes(AREA_ACQUISTI) ?? false
    if (!eGestore) {
      const mio = await getSPUserLookupId(session.user.email)
      if (a.richiedenteLookupId !== mio) return err('Accesso negato', 403)
    }
    return NextResponse.json({ acquisto: a, linkGestione: linkGestione() })
  } catch (e: any) {
    console.error(`[GET /api/acquisti/${id}]`, e)
    return NextResponse.json({ error: e?.message ?? 'Errore interno' }, { status: 500 })
  }
}
