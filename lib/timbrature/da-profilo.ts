/**
 * Il mese generato dall'orario teorico, per chi non timbra.
 *
 * Ci sono persone che un foglio ore devono averlo — va in Pulse — ma che non
 * timbrano: i responsabili, e le squadre il cui foglio lo compila per tutti la
 * responsabile. Per loro l'orario è quello scritto nel contratto, sempre uguale,
 * e chiedere trenta inserimenti al mese per riscrivere trenta volte lo stesso
 * numero non produce un dato più vero: produce solo un dato più tardi.
 *
 * Quindi si rovescia: il mese si riempie da sé con l'orario teorico, e si
 * inserisce a mano solo quello che l'orario teorico non può sapere — i giorni
 * NON lavorati e il loro motivo (ferie, mutua, permesso).
 *
 * PERCHÉ UN BOTTONE E NON UN CRON. Un lavoro notturno riempirebbe il giorno
 * appena concluso, cioè con un giorno di ritardo e senza che nessuno se ne
 * accorga. Chi non timbra ha un orario che non cambia: non c'è niente da
 * aspettare. Il bottone si preme il primo del mese, o quando si vuole, e si può
 * ripremere — riempie solo i giorni ancora vuoti, quindi non rovina niente.
 *
 * PERCHÉ RIGHE VERE E NON CALCOLATE AL VOLO. Riepilogo, scostamento, foglio ore
 * xlsx, PDF e costo del lavoro leggono tutti dalla tabella `timbratura`. Righe
 * virtuali vorrebbero dire riscrivere la stessa regola in cinque posti, e
 * quattro di quei posti prima o poi la scriverebbero in modo leggermente
 * diverso. Le righe generate si distinguono per `origine = 'profilo'`, ed è
 * quella colonna a rendere possibili le due cose che servono: rigenerare senza
 * toccare quello che ha scritto una persona, e lasciare che un giustificativo
 * scavalchi una giornata teorica.
 */

import { supabase } from '@/lib/core/supabase'
import { getDipendenteById, getProfili, servizioById } from '@/lib/timbrature/anagrafica'
import { addGiorni, dataIt, primoUltimoGiorno, weekdayIso } from '@/lib/timbrature/date'
import { festivitaAnno } from '@/lib/timbrature/festivita'
import { inserisci, listTimbrature } from '@/lib/timbrature/righe'
import { MOTIVO_STATO, statoMese } from '@/lib/timbrature/stati'
import type {
  EsitoCompilazioneProfilo,
  ProfiloOrario,
  Servizio,
} from '@/types/timbrature'

export interface OpzioniCompilazione {
  /**
   * Cancella prima le righe già generate da profilo e le riscrive.
   * È la via d'uscita quando l'orario teorico era sbagliato: correggerlo dopo
   * non tocca da sé un mese già compilato, e trenta giornate non si rifanno a
   * mano. Le righe scritte da una persona non vengono mai toccate.
   */
  rigenera?: boolean
  /** Chi preme il bottone non è il diretto interessato (responsabile o HR). */
  perConto?: boolean
}

/**
 * Riempie un mese con l'orario teorico del dipendente.
 *
 * Salta, e lo dice:
 *   - i giorni che hanno già qualcosa scritto — ferie messe in anticipo, o una
 *     riga corretta a mano: quelle vincono sempre sul teorico;
 *   - i festivi e i giorni senza fasce nell'orario teorico.
 *
 * Non applica la finestra dei tre giorni, ed è voluto: la finestra esiste per
 * far compilare il foglio giorno per giorno, che è esattamente la cosa che qui
 * non si fa. Si ferma invece davanti a un mese già validato — quello si riapre
 * prima, non si riscrive di nascosto.
 */
export async function compilaMeseDaProfilo(
  dipendenteId: number,
  anno: number,
  mese: number,
  creataDa: string,
  opts: OpzioniCompilazione = {},
): Promise<EsitoCompilazioneProfilo> {
  const dip = await getDipendenteById(dipendenteId)
  if (!dip) throw new Error('Dipendente non trovato')
  if (!dip.nonTimbra) {
    throw new Error(
      `${dip.cognomeNome} timbra: le ore si inseriscono giorno per giorno. Se non deve ` +
        'timbrare, metti la spunta "Non timbra" sulla sua scheda in Risorse Umane.',
    )
  }

  const stato = await statoMese(dipendenteId, anno, mese)
  if (stato === 'validato' || stato === 'confermato') {
    throw new Error(`${MOTIVO_STATO[stato]}: per rifarlo va prima riaperto.`)
  }

  const { from, to } = primoUltimoGiorno(anno, mese)

  // I profili si leggono tutti in una volta e si sceglie in memoria: un mese
  // sono trenta giornate, e una query per giornata sarebbe trenta query per
  // rispondere sempre la stessa cosa. Il profilo può cambiare a metà mese
  // (un part-time che parte il 16), quindi la scelta va comunque fatta giorno
  // per giorno, non una volta sola sul primo.
  const profili = await getProfili(dipendenteId)
  const vigente = (g: string): ProfiloOrario | null =>
    profili.find((p) => p.decorrenza <= g) ?? null

  const esito: EsitoCompilazioneProfilo = {
    compilate: [], righe: 0, giaCompilati: [], nonLavorativi: [], rimosse: 0, errori: [],
  }

  if (opts.rigenera) esito.rimosse = await eliminaRigheDaProfilo(dipendenteId, from, to)

  const festivita = festivitaAnno(anno)
  const occupati = new Set((await listTimbrature(dipendenteId, from, to)).map((t) => t.data))
  const servizi = new Map<number, Servizio>()

  for (let g = from; g <= to; g = addGiorni(g, 1)) {
    const prof = vigente(g)
    const fasce = (prof?.fasce ?? []).filter((f) => f.giorno === weekdayIso(g))

    if (festivita[g] || !fasce.length) {
      esito.nonLavorativi.push(g)
      continue
    }
    if (occupati.has(g)) {
      esito.giaCompilati.push(g)
      continue
    }

    try {
      for (const f of fasce) {
        let serv = servizi.get(f.servizioId)
        if (!serv) {
          serv = await servizioById(f.servizioId)
          servizi.set(f.servizioId, serv)
        }
        await inserisci(
          dipendenteId,
          { data: g, servizioId: serv.id, oraInizio: f.oraInizio, oraFine: f.oraFine },
          serv,
          creataDa,
          !!opts.perConto,
          { data: g, oraInizio: f.oraInizio, oraFine: f.oraFine, ore: oreFascia(f.oraInizio, f.oraFine) },
          'profilo',
        )
        esito.righe++
      }
      esito.compilate.push(g)
    } catch (e) {
      esito.errori.push({ data: g, motivo: e instanceof Error ? e.message : 'Errore' })
    }
  }

  esito.avviso = raccontaEsito(esito, !!opts.rigenera)
  return esito
}

function oreFascia(oraInizio: string, oraFine: string): number {
  // Le fasce non scavallano la mezzanotte (lo impedisce il vincolo sulla
  // tabella), quindi qui basta la differenza: niente spezzamento.
  const min = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
  return Math.round(((min(oraFine) - min(oraInizio)) / 60) * 10000) / 10000
}

/**
 * Toglie le righe generate dall'orario teorico in un periodo.
 * Non tocca mai quelle scritte da una persona: è tutto il senso della colonna
 * `origine`.
 */
export async function eliminaRigheDaProfilo(
  dipendenteId: number,
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await supabase()
    .from('timbratura')
    .delete()
    .eq('dipendente_id', dipendenteId)
    .eq('origine', 'profilo')
    .gte('data', from)
    .lte('data', to)
    .select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length
}

/** Quante righe teoriche ci sono in un mese: serve alla UI per dire cosa fa il bottone. */
export async function contaRigheDaProfilo(
  dipendenteId: number,
  anno: number,
  mese: number,
): Promise<number> {
  const { from, to } = primoUltimoGiorno(anno, mese)
  const { count, error } = await supabase()
    .from('timbratura')
    .select('id', { count: 'exact', head: true })
    .eq('dipendente_id', dipendenteId)
    .eq('origine', 'profilo')
    .gte('data', from)
    .lte('data', to)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * L'esito in una frase.
 *
 * Un bottone che riempie trenta giornate deve dire cosa ha fatto, altrimenti
 * l'unico modo di scoprirlo è contare le righe a mano. In particolare va detto
 * cosa NON ha toccato: è la domanda che si fa chi ha appena premuto e vede un
 * numero più basso di quello che si aspettava.
 */
function raccontaEsito(e: EsitoCompilazioneProfilo, rigenerato: boolean): string | undefined {
  const pezzi: string[] = []
  if (rigenerato && e.rimosse) pezzi.push(`rimosse ${e.rimosse} righe generate in precedenza`)
  pezzi.push(
    e.compilate.length
      ? `compilate ${e.compilate.length} giornate (${e.righe} righe)`
      : 'nessuna giornata da compilare',
  )
  if (e.giaCompilati.length) {
    pezzi.push(
      `${e.giaCompilati.length} lasciate come stavano perche' avevano gia' qualcosa ` +
        `(${elenco(e.giaCompilati)})`,
    )
  }
  if (e.nonLavorativi.length) pezzi.push(`${e.nonLavorativi.length} non lavorative`)
  if (e.errori.length) pezzi.push(`${e.errori.length} con un problema`)
  return `${pezzi.join(', ')}.`
}

/** I primi giorni per esteso, poi "e altri N": un elenco di trenta date non si legge. */
function elenco(giorni: string[], max = 4): string {
  const primi = giorni.slice(0, max).map(dataIt).join(', ')
  return giorni.length > max ? `${primi} e altri ${giorni.length - max}` : primi
}
