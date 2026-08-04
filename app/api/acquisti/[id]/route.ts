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
  campiPagamento,
  generaCostoDaAcquisto,
  getAcquistoById,
  normalizzaNomeFornitore,
  acquistiConfigurato,
  AREA_ACQUISTI,
} from '@/lib/acquisti'
import {
  allineaBeniDaRichiesta,
  annullaBeniDaRichiesta,
  creaBeniDaRichiesta,
  getBeniPerRichiesta,
  inventarioConfigurato,
} from '@/lib/inventario'
import {
  emailGestori,
  emailRichiedente,
  registraEsitoConsegna,
  linkGestione,
} from '@/lib/acquisti-flusso'
import { getSPUserLookupId, getStrutture } from '@/lib/sharepoint'
import {
  notificaAssegnazioneAcquisto,
  notificaEsitoValutazione,
  notificaOrdineEffettuato,
} from '@/lib/notifications'
import { logAzione } from '@/lib/audit'
import {
  ESITI_CONSEGNA,
  MESI_GARANZIA_DEFAULT,
  MODALITA_PAGAMENTO,
  aggiungiMesi,
  dataBreve,
  type AggiornaAcquistoPayload,
  type EsitoConsegna,
} from '@/types/acquisti'

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

/**
 * Numeri di serie da assegnare ai pezzi, uno per bene.
 *
 * Accetta sia `serialiInventario` (un pezzo per elemento) sia il vecchio campo
 * singolo `numeroSerie`, che resta valido quando la quantità è 1.
 */
function serialiRichiesti(body: AggiornaAcquistoPayload, quantita: number): string[] {
  const lista = Array.isArray(body.serialiInventario)
    ? body.serialiInventario.map((s) => String(s ?? '').trim())
    : []
  if (lista.length) return lista.slice(0, Math.max(1, quantita))
  const singolo = body.numeroSerie?.trim()
  return singolo ? [singolo] : []
}

/** Azioni riservate a chi ha l'area "Acquisti". */
const AZIONI_GESTORE = new Set([
  'prendi-in-carico', 'assegna', 'approva', 'rifiuta', 'ordina', 'pagamento', 'risolvi', 'note',
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

  /**
   * Messaggi non bloccanti da riportare a chi ha premuto il pulsante: numeri di
   * inventario assegnati, oppure il motivo per cui non lo sono stati. L'azione
   * principale è già andata a buon fine, quindi non sono errori.
   */
  const avvisi: string[] = []

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
        const statoDopoAssegnazione = a.stato === 'Inviata' ? 'Presa in carico' : a.stato
        await aggiornaAcquisto(id, {
          AssegnatoLookupId: lookupId,
          Stato: statoDopoAssegnazione,
        })
        // Chi assegna una richiesta a sé stesso non ha bisogno di una mail.
        if (lookupId !== mioLookupId) {
          notificaAssegnazioneAcquisto({
            to: email,
            assegnatoNome: nomeDaEmail(email),
            assegnataDa: session.user.name ?? session.user.email,
            codice: a.codice,
            descrizione: a.descrizione,
            quantita: a.quantita,
            struttura: a.struttura.value,
            richiedente: a.richiedenteNome,
            categoria: a.categoria,
            urgenza: a.urgenza,
            serveEntro: a.serveEntro ? dataBreve(a.serveEntro) : undefined,
            stato: statoDopoAssegnazione,
            link: a.link,
            linkApp: linkGestione(),
          }).catch(console.error)
        }
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
        // Il totale è digitato, non più calcolato da un'aliquota: la fattura può
        // avere righe con IVA diversa e una percentuale unica falserebbe il conto.
        const totale = Number(body.totale)
        if (!isFinite(totale) || totale <= 0) {
          return err('Indica un totale maggiore di zero.')
        }
        if (totale < imponibile - 0.005) {
          return err('Il totale non può essere inferiore all’imponibile.')
        }
        if (body.pagamento && !MODALITA_PAGAMENTO.includes(body.pagamento as any)) {
          return err('Modalità di pagamento non valida.')
        }
        if (body.daInventariare && !body.marcaModello?.trim()) {
          return err('Per i beni da inventariare marca e modello sono obbligatori.')
        }
        const mesiRaw = Number(body.mesiGaranzia ?? MESI_GARANZIA_DEFAULT)
        if (!isFinite(mesiRaw) || mesiRaw < 0 || mesiRaw > 240) {
          return err('I mesi di garanzia devono essere fra 0 e 240.')
        }
        const mesiGaranzia = Math.round(mesiRaw) || MESI_GARANZIA_DEFAULT

        const fornitore = await normalizzaNomeFornitore(fornitoreRaw)
        const luogoConsegnaId = Number(body.luogoConsegnaId) || a.struttura.id

        await aggiornaAcquisto(
          id,
          campiOrdine({
            fornitore,
            imponibile,
            totale,
            dataOrdine: body.dataOrdine,
            pagamento: body.pagamento,
            dataConsegnaPrevista: body.dataConsegnaPrevista,
            luogoConsegnaId,
            daInventariare: body.daInventariare,
            marcaModello: body.marcaModello,
            numeroSerie: body.numeroSerie,
            extraCee: body.extraCee,
            mesiGaranzia,
          }),
        )

        // ---- Inventario -------------------------------------------------
        // I beni nascono qui e non alla consegna: così la cartella su SharePoint
        // esiste già quando arriva la fattura, che spesso precede il bene.
        if (body.daInventariare) {
          const aggiornata = await getAcquistoById(id)
          const dataAcquisto = (aggiornata.dataOrdine ?? '').slice(0, 10) || undefined
          const scadenza = dataAcquisto ? aggiungiMesi(dataAcquisto, mesiGaranzia) : undefined
          // Il cespite è il singolo pezzo: il valore è la quota unitaria del totale.
          const valoreUnitario =
            Math.round((totale / Math.max(1, a.quantita)) * 100) / 100

          if (!inventarioConfigurato()) {
            avvisi.push(
              'Ordine registrato, ma l’inventario non è configurato: esegui node scripts/provision-inventario.mjs.',
            )
          } else if (aggiornata.inventarioGenerato) {
            // Ordine corretto a posteriori: i numeri restano, i dati si allineano.
            const quanti = await allineaBeniDaRichiesta(a.codice, {
              marcaModello: body.marcaModello,
              fornitore,
              dataAcquisto,
              valore: valoreUnitario,
              mesiGaranzia,
              scadenzaGaranzia: scadenza,
              strutturaId: a.struttura.id,
            }).catch((e) => {
              console.error('[acquisti] allineamento beni fallito', e)
              return 0
            })
            if (quanti) avvisi.push(`Aggiornati anche ${quanti} beni già inventariati.`)
          } else {
            try {
              const beni = await creaBeniDaRichiesta(
                {
                  descrizione: a.descrizione,
                  categoria: a.categoria,
                  marcaModello: body.marcaModello,
                  strutturaId: luogoConsegnaId || a.struttura.id,
                  dataAcquisto,
                  fornitore,
                  valore: valoreUnitario,
                  mesiGaranzia,
                  scadenzaGaranzia: scadenza,
                  codiceRichiesta: a.codice,
                  richiestaItemId: id,
                },
                a.quantita,
                serialiRichiesti(body, a.quantita),
              )
              await aggiornaAcquisto(id, {
                InventarioGenerato: true,
                NumeriInventario: beni.map((b) => b.numero).join(', '),
              })
              avvisi.push(
                beni.length === 1
                  ? `Bene inventariato: ${beni[0].numero}.`
                  : `Beni inventariati: ${beni.map((b) => b.numero).join(', ')}.`,
              )
            } catch (e: any) {
              // L'ordine è già registrato: un inciampo sull'inventario non deve
              // farlo sembrare fallito. Lo si segnala e si riprova aggiornando.
              console.error('[acquisti] inventario non generato', e)
              avvisi.push(
                `Ordine registrato, ma l’inventario non è stato creato: ${e?.message ?? 'errore SharePoint'}. Riprova con "Aggiorna l’ordine".`,
              )
            }
          }
        }

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
      case 'pagamento': {
        // Nessun vincolo di stato: il pagamento arriva quando arriva, di solito
        // a consegna già avvenuta. Una data vuota azzera il campo (correzione).
        const ymd = body.dataPagamento?.trim()
        if (ymd && !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return err('Data di pagamento non valida.')
        if (!a.totale) {
          return err('Registra prima l’ordine: senza importo il pagamento non ha riferimento.', 409)
        }
        await aggiornaAcquisto(id, campiPagamento(ymd))
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
        // I beni eventualmente già numerati non si cancellano: restano nel
        // registro marcati "Annullato", così il progressivo non ha buchi
        // inspiegabili e si vede perché quel numero non è mai stato usato.
        if (a.inventarioGenerato && inventarioConfigurato()) {
          const quanti = await annullaBeniDaRichiesta(a.codice).catch((e) => {
            console.error('[acquisti] beni non annullati', e)
            return 0
          })
          if (quanti) avvisi.push(`Segnati come annullati ${quanti} beni in inventario.`)
        }
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

    const aggiornata = await getAcquistoById(id)
    // I beni tornano insieme alla richiesta: la pagina di gestione mostra i
    // pulsanti di caricamento subito, senza un secondo giro di fetch.
    const beni =
      inventarioConfigurato() && aggiornata.inventarioGenerato
        ? await getBeniPerRichiesta(aggiornata.codice).catch(() => [])
        : []

    return NextResponse.json({ ok: true, acquisto: aggiornata, beni, avvisi })
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
    const beni =
      inventarioConfigurato() && a.inventarioGenerato
        ? await getBeniPerRichiesta(a.codice).catch(() => [])
        : []
    return NextResponse.json({ acquisto: a, beni, linkGestione: linkGestione() })
  } catch (e: any) {
    console.error(`[GET /api/acquisti/${id}]`, e)
    return NextResponse.json({ error: e?.message ?? 'Errore interno' }, { status: 500 })
  }
}
