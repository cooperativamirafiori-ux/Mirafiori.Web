/**
 * Gli strumenti dell'assistente delle manutenzioni (docs/assistente-manutenzioni.md).
 *
 * Due famiglie:
 *   - LETTURA: si eseguono subito e il risultato torna al modello;
 *   - PROPOSTA (`proponi_*`): NON scrivono niente. Controllano i dati, li
 *     completano con quelli veri (nome del tecnico dalla lista, non dal modello)
 *     e preparano una `AzioneProposta`: la chiamata all'endpoint del Pannello
 *     che parte solo quando l'admin preme «Conferma». Così l'assistente non ha
 *     una strada sua per scrivere: passa dalle stesse API, con gli stessi
 *     controlli, le stesse mail e lo stesso Log Attività.
 */

import { randomUUID } from 'node:crypto'
import { getTutteRichieste } from '@/lib/manutenzioni/data'
import { leggiPratica } from '@/lib/manutenzioni/pratica'
import { leggiCosti, totaleDi } from '@/lib/manutenzioni/costi'
import { getTecnici, getStruttureConIndirizzo, type StrutturaConIndirizzo } from '@/lib/strutture/data'
import type { AzioneProposta, RichiestaManutenzione, Tecnico } from '@/types/manutenzioni'

const MAX_TESTO = 4000

// ---------------------------------------------------------------- definizioni per l'API

const RIF = {
  type: 'string',
  description: 'La richiesta: il numero (es. MAN-2026-047) oppure lo spItemId restituito dalle ricerche.',
}

export const STRUMENTI = [
  {
    name: 'cerca_richieste',
    description:
      "Cerca le richieste di manutenzione. Restituisce per ognuna numero, spItemId, stato, priorità, tipo, data, struttura con indirizzo, tecnico, descrizione, lungo corso e note interne. Senza filtri dà le richieste attive (non completate).",
    input_schema: {
      type: 'object',
      properties: {
        stato: {
          type: 'string',
          enum: ['attive', 'tutte', 'Aperta', 'Presa in carico', 'In lavorazione', 'Completata'],
          description: "'attive' = tutte le non completate (predefinito).",
        },
        tecnico: { type: 'string', description: 'Nome o parte del nome del tecnico/ditta assegnato. "nessuno" = senza tecnico.' },
        struttura: { type: 'string', description: 'Nome, parte del nome o codice della struttura.' },
        testo: { type: 'string', description: 'Parole da cercare in descrizione, tipo, note e richiedente.' },
        lungo_corso: { type: 'boolean', description: 'true = solo lungo corso, false = escludi il lungo corso.' },
        urgenti: { type: 'boolean', description: 'true = solo priorità urgente.' },
        dal: { type: 'string', description: 'Data richiesta da (AAAA-MM-GG).' },
        al: { type: 'string', description: 'Data richiesta fino a (AAAA-MM-GG).' },
        limite: { type: 'integer', description: 'Quante al massimo (predefinito 40, massimo 100).' },
      },
    },
  },
  {
    name: 'leggi_richiesta',
    description:
      'Tutto di una richiesta: dati, indirizzo, messaggi con il richiedente, cose da fare (con il loro id) e costi registrati.',
    input_schema: { type: 'object', properties: { richiesta: RIF }, required: ['richiesta'] },
  },
  {
    name: 'elenco_tecnici',
    description: "Tecnici e ditte a cui si possono assegnare le richieste, con id, ditta, specializzazione e telefono.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'elenco_strutture',
    description: 'Strutture della cooperativa con codice, indirizzo e comune.',
    input_schema: { type: 'object', properties: { cerca: { type: 'string', description: 'Filtro facoltativo sul nome o codice.' } } },
  },
  {
    name: 'proponi_assegna_tecnico',
    description:
      "Propone di assegnare un tecnico: la richiesta passa a In lavorazione e il richiedente riceve una mail con il nome del tecnico e la nota. La nota sostituisce le note interne.",
    input_schema: {
      type: 'object',
      properties: {
        richiesta: RIF,
        tecnico_id: { type: 'integer', description: "L'id del tecnico preso da elenco_tecnici." },
        nota: { type: 'string', description: 'Facoltativa: arriva al richiedente nella mail.' },
      },
      required: ['richiesta', 'tecnico_id'],
    },
  },
  {
    name: 'proponi_presa_in_carico',
    description:
      "Propone di prendere in carico senza tecnico: se era Aperta passa a Presa in carico, la nota va nei messaggi e al richiedente per mail. Può anche segnare il lungo corso.",
    input_schema: {
      type: 'object',
      properties: {
        richiesta: RIF,
        nota: { type: 'string', description: 'Obbligatoria: il messaggio per il richiedente.' },
        lungo_corso: { type: 'boolean' },
        previsione: { type: 'string', description: 'Solo con lungo corso, testo libero (es. "primavera 2027").' },
      },
      required: ['richiesta', 'nota'],
    },
  },
  {
    name: 'proponi_lungo_corso',
    description: 'Propone di mettere o togliere la spunta Lungo corso (con previsione). Nessuna mail.',
    input_schema: {
      type: 'object',
      properties: { richiesta: RIF, lungo_corso: { type: 'boolean' }, previsione: { type: 'string' } },
      required: ['richiesta', 'lungo_corso'],
    },
  },
  {
    name: 'proponi_messaggio',
    description: 'Propone di scrivere un messaggio al richiedente nella conversazione della richiesta. Il richiedente riceve una mail.',
    input_schema: {
      type: 'object',
      properties: { richiesta: RIF, testo: { type: 'string' } },
      required: ['richiesta', 'testo'],
    },
  },
  {
    name: 'proponi_cosa_da_fare',
    description: 'Propone di aggiungere una riga alle cose da fare della richiesta (un lavoro per riga). Nessuna mail.',
    input_schema: {
      type: 'object',
      properties: { richiesta: RIF, testo: { type: 'string', description: 'Massimo 300 caratteri.' } },
      required: ['richiesta', 'testo'],
    },
  },
  {
    name: 'proponi_spunta_cosa_da_fare',
    description: "Propone di spuntare (fatta) o togliere la spunta a una cosa da fare. Serve l'id preso da leggi_richiesta.",
    input_schema: {
      type: 'object',
      properties: { richiesta: RIF, voce_id: { type: 'string' }, fatta: { type: 'boolean' } },
      required: ['richiesta', 'voce_id', 'fatta'],
    },
  },
  {
    name: 'proponi_note_e_data',
    description:
      "Propone di cambiare le note interne (le vede solo la gestione, sostituiscono quelle di prima) e/o la data dell'intervento. Nessuna mail.",
    input_schema: {
      type: 'object',
      properties: {
        richiesta: RIF,
        note_interne: { type: 'string', description: 'Il testo completo delle note: sostituisce quello attuale.' },
        data_intervento: { type: 'string', description: 'AAAA-MM-GG' },
      },
      required: ['richiesta'],
    },
  },
  {
    name: 'proponi_chiusura',
    description:
      "Propone di chiudere la richiesta (Completata). Partono la mail al richiedente e quella alla gestione con il totale dei costi. I costi non si toccano.",
    input_schema: {
      type: 'object',
      properties: {
        richiesta: RIF,
        data_intervento: { type: 'string', description: 'AAAA-MM-GG, facoltativa.' },
        note_interne: { type: 'string', description: 'Facoltative: sostituiscono le note interne.' },
      },
      required: ['richiesta'],
    },
  },
] as const

// ---------------------------------------------------------------- contesto di una domanda

/**
 * Le anagrafiche si leggono una volta per domanda, anche se il modello chiama
 * più strumenti: liste piccole, ma ogni lettura sono secondi.
 */
export class ContestoStrumenti {
  private richieste?: Promise<RichiestaManutenzione[]>
  private tecnici?: Promise<Tecnico[]>
  private strutture?: Promise<StrutturaConIndirizzo[]>
  readonly azioni: AzioneProposta[] = []

  tutteRichieste() {
    return (this.richieste ??= getTutteRichieste())
  }
  elencoTecnici() {
    return (this.tecnici ??= getTecnici())
  }
  elencoStrutture() {
    // L'indirizzo è un di più: se non si legge, le richieste si vedono lo stesso.
    return (this.strutture ??= getStruttureConIndirizzo().catch((e) => {
      console.error('[assistente-manutenzioni] strutture:', e)
      return []
    }))
  }

  async trova(rif: unknown): Promise<RichiestaManutenzione> {
    const r = String(rif ?? '').trim()
    if (!r) throw new Error('Richiesta non indicata.')
    const tutte = await this.tutteRichieste()
    const trovata =
      tutte.find((x) => x.spItemId === r) ??
      tutte.find((x) => x.idRichiesta.toLowerCase() === r.toLowerCase())
    if (!trovata) throw new Error(`Non trovo la richiesta «${r}». Cercala prima con cerca_richieste.`)
    return trovata
  }
}

// ---------------------------------------------------------------- aiuti

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Tutte le parole cercate devono comparire, in qualunque ordine: «Mirco Marrano» trova «Marrano Mirco». */
function contiene(dove: string, cosa: string): boolean {
  const d = norm(dove)
  return norm(cosa).split(/\s+/).filter(Boolean).every((p) => d.includes(p))
}

function giorno(iso?: string): string {
  return iso ? iso.slice(0, 10) : ''
}

function taglia(s: string | undefined, n: number): string {
  const t = (s ?? '').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

function indirizzoDi(r: RichiestaManutenzione, strutture: StrutturaConIndirizzo[]): string {
  const s = strutture.find((x) => x.id === Number(r.struttura.id))
  if (!s) return ''
  return [s.indirizzo, s.comune].filter(Boolean).join(', ')
}

function riga(r: RichiestaManutenzione, strutture: StrutturaConIndirizzo[]) {
  return {
    numero: r.idRichiesta,
    spItemId: r.spItemId,
    stato: r.stato,
    priorita: r.priorita,
    tipo: r.tipoIntervento,
    data_richiesta: giorno(r.dataRichiesta),
    struttura: r.struttura.value,
    indirizzo: indirizzoDi(r, strutture) || '(indirizzo non registrato)',
    richiedente: r.richiedente.displayName,
    tecnico: r.tecnico?.value ?? null,
    descrizione: taglia(r.descrizione, 400),
    lungo_corso: r.lungoCorso || undefined,
    previsione: r.previsioneLungoCorso,
    note_interne: taglia(r.noteResponsabile, 300) || undefined,
    data_intervento: giorno(r.dataIntervento) || undefined,
  }
}

function etichetta(r: RichiestaManutenzione): string {
  return `${r.idRichiesta} · ${r.struttura.value}`
}

function testo(v: unknown, max = MAX_TESTO): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function dataValida(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) {
    throw new Error(`Data non valida: «${String(v)}». Usa AAAA-MM-GG.`)
  }
  // Come fa il Pannello: mezzogiorno, così il fuso non la sposta al giorno prima.
  return new Date(`${v}T12:00:00Z`).toISOString()
}

function nonChiusa(r: RichiestaManutenzione) {
  if (r.stato === 'Completata') throw new Error(`${r.idRichiesta} è già completata.`)
}

function proponi(ctx: ContestoStrumenti, a: Omit<AzioneProposta, 'id'>): string {
  ctx.azioni.push({ id: randomUUID(), ...a })
  return `Proposta preparata, NON ancora eseguita: «${a.titolo}» su ${a.richiesta}. L'admin la vedrà con il bottone «Conferma».`
}

// ---------------------------------------------------------------- esecuzione

export async function eseguiStrumento(ctx: ContestoStrumenti, nome: string, input: any): Promise<unknown> {
  switch (nome) {
    case 'cerca_richieste': {
      const [tutte, strutture] = await Promise.all([ctx.tutteRichieste(), ctx.elencoStrutture()])
      const stato = input?.stato ?? 'attive'
      let l = tutte
      if (stato === 'attive') l = l.filter((r) => r.stato !== 'Completata')
      else if (stato !== 'tutte') l = l.filter((r) => r.stato === stato)
      if (input?.tecnico) {
        l = norm(input.tecnico) === 'nessuno'
          ? l.filter((r) => !r.tecnico)
          : l.filter((r) => r.tecnico && contiene(r.tecnico.value, input.tecnico))
      }
      if (input?.struttura) {
        const cod = new Map(strutture.map((s) => [s.id, s.codice]))
        l = l.filter((r) => contiene(`${r.struttura.value} ${cod.get(Number(r.struttura.id)) ?? ''}`, input.struttura))
      }
      if (input?.testo) {
        l = l.filter((r) =>
          contiene(`${r.descrizione} ${r.tipoIntervento} ${r.noteResponsabile ?? ''} ${r.richiedente.displayName} ${r.idRichiesta}`, input.testo),
        )
      }
      if (typeof input?.lungo_corso === 'boolean') l = l.filter((r) => r.lungoCorso === input.lungo_corso)
      if (input?.urgenti === true) l = l.filter((r) => r.priorita.startsWith('Urgente'))
      if (input?.dal) l = l.filter((r) => giorno(r.dataRichiesta) >= input.dal)
      if (input?.al) l = l.filter((r) => giorno(r.dataRichiesta) <= input.al)
      const limite = Math.min(Math.max(Number(input?.limite) || 40, 1), 100)
      return { trovate: l.length, mostrate: Math.min(l.length, limite), richieste: l.slice(0, limite).map((r) => riga(r, strutture)) }
    }

    case 'leggi_richiesta': {
      const r = await ctx.trova(input?.richiesta)
      const strutture = await ctx.elencoStrutture()
      const [pratica, costi] = await Promise.all([
        leggiPratica(r.spItemId, 'gestione', { segnaLetti: false }).catch(() => null),
        leggiCosti(r.spItemId).catch(() => null),
      ])
      return {
        ...riga(r, strutture),
        descrizione: r.descrizione,
        note_interne: r.noteResponsabile ?? '',
        messaggi: pratica
          ? pratica.messaggi.map((m) => ({ da: m.lato, autore: m.autoreNome, quando: m.creatoIl.slice(0, 16), testo: taglia(m.testo, 800) }))
          : 'non leggibili ora',
        cose_da_fare: pratica
          ? pratica.voci.map((v) => ({ id: v.id, testo: v.testo, fatta: v.fatta }))
          : 'non leggibili ora',
        costi: costi
          ? { totale_euro: totaleDi(costi).totale, voci: costi.map((c) => ({ tipo: c.tipo, data: c.data, importo: c.importo, descrizione: c.descrizione ?? c.fornitore })) }
          : 'non leggibili ora',
      }
    }

    case 'elenco_tecnici': {
      const t = await ctx.elencoTecnici()
      return t.map((x) => ({ id: x.id, nome: x.title, ditta: x.ditta || undefined, specializzazione: x.specializzazione || undefined, telefono: x.telefono || undefined }))
    }

    case 'elenco_strutture': {
      const s = await ctx.elencoStrutture()
      const f = input?.cerca ? s.filter((x) => contiene(`${x.title} ${x.codice}`, input.cerca)) : s
      return f.map((x) => ({ id: x.id, codice: x.codice, nome: x.title, indirizzo: x.indirizzo || undefined, comune: x.comune || undefined }))
    }

    case 'proponi_assegna_tecnico': {
      const r = await ctx.trova(input?.richiesta)
      nonChiusa(r)
      const tecnico = (await ctx.elencoTecnici()).find((t) => t.id === Number(input?.tecnico_id))
      if (!tecnico) throw new Error('Tecnico non trovato: prendi l\'id da elenco_tecnici.')
      const nota = testo(input?.nota)
      return proponi(ctx, {
        titolo: 'Assegna il tecnico',
        richiesta: etichetta(r),
        descrizione: `Tecnico: ${tecnico.title}${tecnico.ditta ? ` (${tecnico.ditta})` : ''}${nota ? `\nNota al richiedente: ${nota}` : ''}`,
        avviso: `Passa a «In lavorazione» e ${r.richiedente.displayName || 'il richiedente'} riceve una mail.${nota && r.noteResponsabile ? ' La nota sostituisce le note interne.' : ''}`,
        metodo: 'PATCH',
        url: `/api/manutenzioni/${r.spItemId}`,
        corpo: { tecnicoId: tecnico.id, tecnicoNome: tecnico.title, ...(nota ? { noteResponsabile: nota } : {}) },
      })
    }

    case 'proponi_presa_in_carico': {
      const r = await ctx.trova(input?.richiesta)
      nonChiusa(r)
      const nota = testo(input?.nota)
      if (!nota) throw new Error('Serve una nota per il richiedente.')
      const lungo = input?.lungo_corso === true
      const previsione = lungo ? testo(input?.previsione, 255) : ''
      return proponi(ctx, {
        titolo: 'Prendi in carico e avvisa',
        richiesta: etichetta(r),
        descrizione: `Nota: ${nota}${lungo ? `\nLungo corso${previsione ? ` — previsione: ${previsione}` : ''}` : ''}`,
        avviso: `${r.stato === 'Aperta' ? 'Passa a «Presa in carico». ' : ''}${r.richiedente.displayName || 'Il richiedente'} riceve una mail.`,
        metodo: 'POST',
        url: `/api/manutenzioni/${r.spItemId}/presa-in-carico`,
        corpo: { nota, lungoCorso: lungo, ...(previsione ? { previsione } : {}) },
      })
    }

    case 'proponi_lungo_corso': {
      const r = await ctx.trova(input?.richiesta)
      if (typeof input?.lungo_corso !== 'boolean') throw new Error('Indica lungo_corso true o false.')
      const previsione = input.lungo_corso ? testo(input?.previsione, 255) : ''
      return proponi(ctx, {
        titolo: input.lungo_corso ? 'Metti nel lungo corso' : 'Togli dal lungo corso',
        richiesta: etichetta(r),
        descrizione: input.lungo_corso ? `Previsione: ${previsione || '—'}` : 'Torna fra le richieste attive.',
        avviso: 'Nessuna mail.',
        metodo: 'PATCH',
        url: `/api/manutenzioni/${r.spItemId}/lungo-corso`,
        corpo: { lungoCorso: input.lungo_corso, ...(previsione ? { previsione } : {}) },
      })
    }

    case 'proponi_messaggio': {
      const r = await ctx.trova(input?.richiesta)
      const t = testo(input?.testo)
      if (!t) throw new Error('Il messaggio è vuoto.')
      return proponi(ctx, {
        titolo: 'Scrivi al richiedente',
        richiesta: etichetta(r),
        descrizione: t,
        avviso: `${r.richiedente.displayName || 'Il richiedente'} riceve una mail con il messaggio.`,
        metodo: 'POST',
        url: `/api/manutenzioni/${r.spItemId}/pratica`,
        corpo: { come: 'gestione', testo: t },
      })
    }

    case 'proponi_cosa_da_fare': {
      const r = await ctx.trova(input?.richiesta)
      nonChiusa(r)
      const t = testo(input?.testo, 300)
      if (!t) throw new Error('La riga è vuota.')
      return proponi(ctx, {
        titolo: 'Aggiungi alle cose da fare',
        richiesta: etichetta(r),
        descrizione: t,
        avviso: 'Nessuna mail.',
        metodo: 'POST',
        url: `/api/manutenzioni/${r.spItemId}/voci`,
        corpo: { come: 'gestione', testo: t },
      })
    }

    case 'proponi_spunta_cosa_da_fare': {
      const r = await ctx.trova(input?.richiesta)
      if (typeof input?.fatta !== 'boolean') throw new Error('Indica fatta true o false.')
      const pratica = await leggiPratica(r.spItemId, 'gestione', { segnaLetti: false })
      const voce = pratica.voci.find((v) => v.id === String(input?.voce_id))
      if (!voce) throw new Error('Riga non trovata: prendi l\'id da leggi_richiesta.')
      return proponi(ctx, {
        titolo: input.fatta ? 'Segna come fatta' : 'Togli la spunta',
        richiesta: etichetta(r),
        descrizione: voce.testo,
        avviso: 'Nessuna mail.',
        metodo: 'PATCH',
        url: `/api/manutenzioni/${r.spItemId}/voci/${voce.id}`,
        corpo: { fatta: input.fatta },
      })
    }

    case 'proponi_note_e_data': {
      const r = await ctx.trova(input?.richiesta)
      const note = typeof input?.note_interne === 'string' ? testo(input.note_interne) : undefined
      const data = dataValida(input?.data_intervento)
      if (note === undefined && !data) throw new Error('Indica le note o la data.')
      const corpo: Record<string, unknown> = {}
      if (note !== undefined) corpo.noteResponsabile = note
      if (data) corpo.dataIntervento = data
      return proponi(ctx, {
        titolo: 'Aggiorna note e data',
        richiesta: etichetta(r),
        descrizione: [
          note !== undefined ? `Note interne: ${note || '(vuote)'}` : '',
          data ? `Data intervento: ${input.data_intervento}` : '',
        ].filter(Boolean).join('\n'),
        avviso: note !== undefined && r.noteResponsabile ? 'Le note sostituiscono quelle di prima. Nessuna mail.' : 'Nessuna mail.',
        metodo: 'PATCH',
        url: `/api/manutenzioni/${r.spItemId}`,
        corpo,
      })
    }

    case 'proponi_chiusura': {
      const r = await ctx.trova(input?.richiesta)
      nonChiusa(r)
      const data = dataValida(input?.data_intervento)
      const note = testo(input?.note_interne)
      return proponi(ctx, {
        titolo: 'Chiudi la richiesta',
        richiesta: etichetta(r),
        descrizione: [
          `Stato → Completata${r.tecnico ? ` (tecnico: ${r.tecnico.value})` : ''}`,
          data ? `Data intervento: ${input.data_intervento}` : '',
          note ? `Note interne: ${note}` : '',
        ].filter(Boolean).join('\n'),
        avviso: `${r.richiedente.displayName || 'Il richiedente'} riceve la mail «Completata»; alla gestione arriva il totale dei costi.`,
        metodo: 'PATCH',
        url: `/api/manutenzioni/${r.spItemId}`,
        corpo: { chiudi: true, ...(data ? { dataIntervento: data } : {}), ...(note ? { noteResponsabile: note } : {}) },
      })
    }

    default:
      throw new Error(`Strumento sconosciuto: ${nome}`)
  }
}
