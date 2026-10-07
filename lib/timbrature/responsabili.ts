/**
 * Responsabili e abilitazioni: chi compila il foglio ore e chi lo valida, visto
 * tutto insieme invece che scheda per scheda.
 *
 * NON è una seconda anagrafica. Legge e scrive gli stessi tre campi della scheda
 * RU (`TimbraturaAttiva`, `NonTimbra`, `ReferenteFoglioOre`) e dopo ogni
 * scrittura passa da `sincronizzaRecordRU`, esattamente come il salvataggio
 * della scheda. La sezione Timbrature della scheda RU resta dov'è.
 *
 * Il database delle timbrature si legge solo per confronto: dice chi è
 * "disallineato" (scheda cambiata direttamente su SharePoint, che non
 * sincronizza nulla) e chi è abilitato senza orario teorico.
 *
 * Scrive con l'identità di chi è collegato (`graphRU`): serve quindi sia il
 * permesso "Timbrature HR" sia l'appartenenza al sito Risorse Umane.
 */

import { getItem, getItems, aggiornaCampiParziali } from '@/lib/risorse-umane/data'
import { getDipendenti, getDipendenteByEmail } from '@/lib/timbrature/data'
import {
  abilitazione,
  classeLavoro,
  mailChiave,
  nominativoRU,
  referenteRU,
  nonTimbraRU,
  rapportoChiuso,
  sincronizzaRecordRU,
} from '@/lib/timbrature/sync'
import { supabase } from '@/lib/core/supabase'
import { isAccessoNegato, isRiautenticazione, type GraphClient } from '@/lib/core/graph-delegato'
import type { RUEntity, RURecord } from '@/types/risorse-umane'
import type {
  Dipendente,
  EsitoModificaAbilitazione,
  ModificaAbilitazione,
  PersonaAbilitazione,
} from '@/types/timbrature'

/** Dominio degli account: un referente fuori dominio non potrebbe mai entrare a validare. */
const DOMINIO = 'cooperativamirafiori.com'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Oltre questo numero di modifiche per chiamata la funzione serverless rischia il timeout. */
export const MAX_MODIFICHE = 60

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

type StatoDb = Pick<Dipendente, 'id' | 'attivo' | 'referenteEmail' | 'nonTimbra'>

function categoria(entity: RUEntity, rec: RURecord): string {
  if (entity === 'tirocini') {
    const c = str(rec.CategoriaCollaborazione)
    return c === 'SERVIZIO CIVILE' ? 'Servizio civile' : 'Tirocinio'
  }
  return str(rec.CategoriaRU) || 'Dipendente'
}

/** Dipendenti (id) che hanno almeno un orario teorico. */
async function conOrario(): Promise<Set<number>> {
  const { data, error } = await supabase().from('profilo_orario').select('dipendente_id')
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r: { dipendente_id: number }) => r.dipendente_id))
}

async function haOrario(id: number): Promise<boolean> {
  const { count, error } = await supabase()
    .from('profilo_orario')
    .select('id', { count: 'exact', head: true })
    .eq('dipendente_id', id)
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

function componi(
  entity: RUEntity,
  rec: RURecord,
  db: StatoDb | null,
  orario: boolean,
): PersonaAbilitazione {
  const ab = abilitazione(rec)
  const mail = mailChiave(rec)
  const referente = referenteRU(rec)
  const nonTimbra = nonTimbraRU(rec)
  const abilitata = ab.attivo && !!mail

  const disallineata = db
    ? db.attivo !== abilitata ||
      (abilitata && ((db.referenteEmail ?? null) !== referente || db.nonTimbra !== nonTimbra))
    : abilitata

  return {
    entity,
    spItemId: rec.spItemId,
    nominativo: nominativoRU(rec),
    mail,
    categoria: categoria(entity, rec),
    statoRapporto: entity === 'tirocini' ? str(rec.StatoTirocinio) : str(rec.StatoRapporto),
    chiuso: rapportoChiuso(rec),
    lavoro: classeLavoro(rec),
    timbraturaAttiva: ab.spuntata,
    nonTimbra,
    referente,
    abilitata,
    decaduta: ab.decaduta,
    db: db ? { attivo: db.attivo, referente: db.referenteEmail ?? null, nonTimbra: db.nonTimbra } : null,
    disallineata,
    senzaOrario: abilitata && !!db && !orario,
  }
}

/**
 * Tutte le persone che contano per le timbrature: i rapporti in corso, più i
 * chiusi che hanno ancora la spunta o sono ancora attivi nel database (sono
 * quelli da sistemare). I cessati senza spunta non servono a niente qui.
 */
export async function elencoAbilitazioni(gc: GraphClient): Promise<PersonaAbilitazione[]> {
  const [dipendenti, tirocini, db, orari] = await Promise.all([
    getItems(gc, 'dipendenti'),
    getItems(gc, 'tirocini'),
    getDipendenti(false),
    conOrario(),
  ])
  const perMail = new Map(db.map((d) => [d.email.toLowerCase(), d]))

  const out: PersonaAbilitazione[] = []
  const blocchi: [RUEntity, RURecord[]][] = [['dipendenti', dipendenti], ['tirocini', tirocini]]
  for (const [entity, records] of blocchi) {
    for (const rec of records) {
      const mail = mailChiave(rec)
      const d = mail ? perMail.get(mail) ?? null : null
      const p = componi(entity, rec, d, d ? orari.has(d.id) : false)
      if (p.chiuso && !p.timbraturaAttiva && !p.db?.attivo) continue
      // Soci volontari, fruitori, sovventori: non hanno un foglio ore e qui
      // sarebbero solo rumore. Restano visibili solo se hanno la spunta o sono
      // ancora attivi nel database, cioè se c'è qualcosa da sistemare.
      if (p.lavoro === 'non-lavoratore' && !p.timbraturaAttiva && !p.db?.attivo) continue
      out.push(p)
    }
  }
  return out.sort((a, b) => a.nominativo.localeCompare(b.nominativo, 'it'))
}

/** Normalizza e controlla il referente. Ritorna [valore, errore]. */
function referenteValido(v: unknown, mailPersona: string): [string | null, string | null] {
  if (v === null || v === '') return [null, null]
  const e = str(v).toLowerCase()
  if (!EMAIL_RE.test(e)) return [null, `"${e}" non è un indirizzo email valido.`]
  if (!e.endsWith(`@${DOMINIO}`)) {
    return [null, `Il referente deve avere un account @${DOMINIO}: è con quello che entra a validare.`]
  }
  if (mailPersona && e === mailPersona) {
    return [null, 'Una persona non può essere referente di sé stessa: il foglio ore lo valida qualcun altro.']
  }
  return [e, null]
}

/**
 * Applica UNA modifica: scrive sulla scheda RU solo i campi richiesti, poi
 * sincronizza come il salvataggio della scheda. Lancia solo per sessione
 * scaduta o accesso negato al sito RU; ogni altro problema diventa un esito.
 */
export async function applicaModifica(
  gc: GraphClient,
  m: ModificaAbilitazione,
): Promise<EsitoModificaAbilitazione> {
  const base = { spItemId: m.spItemId }
  try {
    if (m.entity !== 'dipendenti' && m.entity !== 'tirocini') {
      return { ...base, ok: false, errore: 'Tipo di scheda non valido.' }
    }
    const prima = await getItem(gc, m.entity, m.spItemId)
    const campi: Record<string, string | null> = {}

    if (m.timbraturaAttiva === true) {
      const classe = classeLavoro(prima)
      if (classe === 'non-lavoratore') {
        return {
          ...base,
          ok: false,
          errore: `${nominativoRU(prima)}: "${str(prima.TipoRapporto)}" non è un rapporto di lavoro, le timbrature non si attivano.`,
        }
      }
      if (classe === 'incerto') {
        return {
          ...base,
          ok: false,
          errore: `${nominativoRU(prima)}: manca il "Tipo di rapporto". Va scelto nella scheda in Risorse Umane prima di attivare le timbrature.`,
        }
      }
    }
    if (typeof m.timbraturaAttiva === 'boolean') campi.TimbraturaAttiva = m.timbraturaAttiva ? 'Si' : 'No'
    if (typeof m.nonTimbra === 'boolean') campi.NonTimbra = m.nonTimbra ? 'Si' : 'No'
    if (m.referente !== undefined) {
      const [ref, err] = referenteValido(m.referente, mailChiave(prima))
      if (err) return { ...base, ok: false, errore: `${nominativoRU(prima)}: ${err}` }
      campi.ReferenteFoglioOre = ref
    }
    if (Object.keys(campi).length === 0) return { ...base, ok: false, errore: 'Nessuna modifica.' }

    const dopo = await aggiornaCampiParziali(gc, m.entity, m.spItemId, campi)
    const sync = await sincronizzaRecordRU(dopo)

    const mail = mailChiave(dopo)
    const d = mail ? await getDipendenteByEmail(mail) : null
    const persona = componi(m.entity, dopo, d, d ? await haOrario(d.id) : false)
    return { ...base, ok: true, persona, avviso: sync.avviso ? `${persona.nominativo}: ${sync.avviso}` : undefined }
  } catch (e) {
    // Sessione scaduta o niente accesso al sito RU: inutile proseguire con le
    // altre modifiche, l'API lo trasforma nella risposta giusta.
    if (isRiautenticazione(e) || isAccessoNegato(e)) throw e
    return { ...base, ok: false, errore: e instanceof Error ? e.message : 'Errore salvataggio' }
  }
}
