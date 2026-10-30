/**
 * Domanda di ammissione socio — le regole del flusso.
 *
 *   1. il futuro socio apre la domanda: i dati arrivano dalla sua scheda RU;
 *   2. corregge/completa, salva e scarica il PDF (nessun numero ancora);
 *   3. lo firma e lo carica;
 *   4. al caricamento l'app REGISTRA, da sola (Dennis, 29/10/2026, "A,
 *      automatico"): numero dell'Elenco Generale, scheda RU da non socio a
 *      socio, scheda progressiva in SCHEDE PROGRESSIVE DA STAMPARE, mail a
 *      Claudia con la scheda allegata.
 *
 * Il numero nasce al passo 4 e non prima, così chi abbandona a metà non lascia
 * buchi nell'Elenco Generale. Una volta assegnato si scrive SUBITO sulla
 * domanda: se un passo successivo fallisce, ripetere la registrazione riusa lo
 * stesso numero invece di consumarne un altro. Tutti i passi sono ripetibili.
 *
 * La data di ammissione NON la scrive l'app: per legge l'ammissione la delibera
 * il CdA, e Claudia la inserisce dopo la delibera (nella scheda progressiva di
 * Bertoglio, compilata a mano, era vuota anch'essa).
 */

import type { GraphClient } from '@/lib/core/graph-delegato'
import { logAzione } from '@/lib/core/audit'
import {
  aggiornaCampiTipizzati,
  caricaDocumentoInCartella,
  copiaInCartellaDipendente,
  fileInCartella,
  getItem,
  trovaSchedaPerEmail,
} from '@/lib/risorse-umane/data'
import { generaSchedaSocioBuffer } from '@/lib/risorse-umane/export-scheda-socio'
import type { RURecord } from '@/types/risorse-umane'
import { DATI_VUOTI, etichettaTipo, tipoRU, totaleQuote, type DatiDomanda } from '@/types/soci'
import { aggiornaDomanda, tutteLeDomande, type DomandaInterna } from './data'
import { cartellaAmmissioni, cartellaSchede, nomeScheda } from './documento'
import { mailNuovoSocio } from './notifiche'

const CT_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Il primo numero libero dell'Elenco Generale quando la funzione è partita (Claudia, 29/10/2026). */
const PRIMO_NUMERO = () => Number(process.env.SOCI_PRIMO_NUMERO) || 234

const txt = (v: unknown) => (v == null ? '' : String(v).trim())
export const oggiIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())

/** "Rivoli(TO)" / "Rivoli (TO)" → ["Rivoli", "TO"] */
function luogoEProvincia(s: string): [string, string] {
  const m = /^(.*?)\s*\(\s*([A-Za-z]{2})\s*\)\s*$/.exec(s)
  return m ? [m[1].trim(), m[2].toUpperCase()] : [s.trim(), '']
}

/** I dati del modulo ricavati dalla scheda RU: la persona controlla e completa. */
export function precompila(rec: RURecord | null): DatiDomanda {
  if (!rec) return { ...DATI_VUOTI }
  const [luogo, provN] = luogoEProvincia(txt(rec.LuogoNascita))
  const [comune, provR] = luogoEProvincia(txt(rec.ComuneResidenza))
  return {
    ...DATI_VUOTI,
    cognome: txt(rec.Cognome).toUpperCase(),
    nome: txt(rec.Nome).toUpperCase(),
    luogoNascita: luogo,
    provNascita: provN,
    dataNascita: txt(rec.DataNascita).slice(0, 10),
    codiceFiscale: txt(rec.CodiceFiscale).toUpperCase(),
    cittadinanza: txt(rec.Nazionalita),
    professione: txt(rec.Mansione),
    comuneResidenza: comune,
    provResidenza: provR,
    indirizzo: txt(rec.IndirizzoResidenza),
    telefono: txt(rec.CellPrivato) || txt(rec.CellAziendale),
  }
}

export const eSocio = (rec: RURecord | null) => !!rec && txt(rec.Socio).toLowerCase() === 'si'

export const MSG_GIA_SOCIO = 'Risulti già socio/a della cooperativa: la domanda non si può inviare. Se pensi sia un errore scrivi a risorseumane@cooperativamirafiori.com.'

/**
 * Chi è già socio può vedere e compilare tutta la domanda, ma non inviarla
 * (Dennis, 30/10/2026): si blocca solo il caricamento della firmata.
 *
 * Eccezione: la scheda è "socio" perché l'ha appena segnata QUESTA domanda e
 * la registrazione si è interrotta dopo — allora "Completa la registrazione"
 * deve poter ripartire. Lo si riconosce dal numero: è lo stesso già scritto
 * sulla domanda.
 */
export function giaSocioPerAltro(rec: RURecord | null, domanda?: { numeroElencoGenerale: number | null } | null): boolean {
  if (!eSocio(rec)) return false
  const n = domanda?.numeroElencoGenerale
  return !(n != null && Number(rec!.NumeroElencoGenerale) === n)
}

/** La scheda RU di chi è entrato nell'app (per mail aziendale o personale). */
export async function schedaDi(g: GraphClient, email: string): Promise<RURecord | null> {
  return trovaSchedaPerEmail(g, email)
}

// ------------------------------------------------------------------
// Numero dell'Elenco Generale
// ------------------------------------------------------------------

/**
 * Prossimo numero libero: il più alto già dato a un'altra domanda, più uno —
 * mai sotto SOCI_PRIMO_NUMERO (234, il primo libero indicato da Claudia).
 *
 * ⚠️ NON si guarda il campo NumeroElencoGenerale delle schede RU: al
 * 30/10/2026 era compilato solo su 2 schede, una con un valore palesemente
 * sbagliato (262019), e l'app sarebbe partita da lì. La fonte della
 * numerazione da 234 in poi è la lista delle domande.
 */
async function prossimoNumero(g: GraphClient, escludi: string): Promise<number> {
  let max = PRIMO_NUMERO() - 1
  for (const d of await tutteLeDomande(g)) {
    if (d.spItemId !== escludi && d.numeroElencoGenerale != null && d.numeroElencoGenerale > max) {
      max = d.numeroElencoGenerale
    }
  }
  return max + 1
}

/**
 * Assegna il numero alla domanda e lo scrive subito.
 *
 * SharePoint non ha contatori atomici: se due domande vengono registrate nello
 * stesso istante potrebbero leggere lo stesso massimo. Dopo la scrittura si
 * rilegge: se un'altra domanda ha lo stesso numero ed è stata creata prima,
 * il numero è suo e questa ne prende un altro.
 */
async function assegnaNumero(g: GraphClient, domanda: DomandaInterna): Promise<number> {
  if (domanda.numeroElencoGenerale != null) return domanda.numeroElencoGenerale
  for (let tentativo = 0; tentativo < 5; tentativo++) {
    const n = await prossimoNumero(g, domanda.spItemId)
    await aggiornaDomanda(g, domanda.spItemId, { numero: n })
    const conflitto = (await tutteLeDomande(g)).some(
      (d) => d.spItemId !== domanda.spItemId && d.numeroElencoGenerale === n && Number(d.spItemId) < Number(domanda.spItemId),
    )
    if (!conflitto) return n
  }
  throw new Error('Non riesco ad assegnare un numero dell’Elenco Generale: riprova fra un minuto.')
}

// ------------------------------------------------------------------
// Registrazione
// ------------------------------------------------------------------

interface Differenza {
  campo: string
  scheda: string
  domanda: string
}

const confronta = (a: string, b: string) => a.toLowerCase().replace(/[\s.,'’]/g, '') === b.toLowerCase().replace(/[\s.,'’]/g, '')

/**
 * Cosa scrivere nella scheda RU oltre ai dati da socio.
 *
 * I dati anagrafici del modulo **completano** la scheda: si scrivono solo nei
 * campi vuoti. Quando la scheda ha già un valore diverso non lo si cambia —
 * può essere giusto quello che c'era — e la differenza va nella mail a Claudia,
 * che decide lei.
 */
function completamenti(rec: RURecord, d: DatiDomanda): { campi: Record<string, string>; differenze: Differenza[] } {
  const campi: Record<string, string> = {}
  const differenze: Differenza[] = []
  const coppie: [string, string, string][] = [
    ['CodiceFiscale', 'Codice fiscale', d.codiceFiscale],
    ['DataNascita', 'Data di nascita', d.dataNascita],
    ['LuogoNascita', 'Luogo di nascita', d.provNascita ? `${d.luogoNascita} (${d.provNascita})` : d.luogoNascita],
    ['Nazionalita', 'Cittadinanza', d.cittadinanza],
    ['ComuneResidenza', 'Comune di residenza', d.comuneResidenza],
    ['IndirizzoResidenza', 'Indirizzo di residenza', d.indirizzo],
  ]
  for (const [chiave, etichetta, valore] of coppie) {
    if (!valore) continue
    const attuale = txt(rec[chiave])
    if (!attuale) campi[chiave] = valore
    else if (chiave === 'LuogoNascita' ? !confronta(luogoEProvincia(attuale)[0], d.luogoNascita) : !confronta(attuale, valore)) {
      differenze.push({ campo: etichetta, scheda: attuale, domanda: valore })
    }
  }
  const tel = d.telefono
  if (tel && !txt(rec.CellPrivato) && !confronta(txt(rec.CellAziendale), tel)) campi.CellPrivato = tel
  else if (tel && txt(rec.CellPrivato) && !confronta(txt(rec.CellPrivato), tel) && !confronta(txt(rec.CellAziendale), tel)) {
    differenze.push({ campo: 'Telefono', scheda: txt(rec.CellPrivato), domanda: tel })
  }
  return { campi, differenze }
}

export interface EsitoRegistrazione {
  numero: number
  schedaUrl: string
}

/**
 * Registra il nuovo socio. Ripetibile: ogni passo controlla se è già stato
 * fatto, e il numero, una volta dato, resta quello.
 */
export async function registraSocio(
  g: GraphClient,
  domanda: DomandaInterna,
  attore: { email: string; nome?: string | null },
): Promise<EsitoRegistrazione> {
  if (domanda.stato === 'Registrata' && domanda.numeroElencoGenerale != null) {
    return { numero: domanda.numeroElencoGenerale, schedaUrl: domanda.schedaUrl ?? '' }
  }
  if (!domanda.domandaNome) throw new Error('Manca la domanda firmata: caricala prima di registrare.')

  const d = domanda.dati
  const anno = Number(oggiIso().slice(0, 4))
  const avvisi: string[] = []

  // La domanda firmata deve esserci davvero, prima di consumare un numero.
  const firmata =
    (await fileInCartella(g, cartellaAmmissioni(anno), domanda.domandaNome)) ??
    (await fileInCartella(g, cartellaAmmissioni(anno - 1), domanda.domandaNome))
  if (!firmata) throw new Error('Non trovo la domanda firmata su SharePoint: caricala di nuovo.')

  const rec = await getItem(g, 'dipendenti', domanda.ruItemId)
  if (giaSocioPerAltro(rec, domanda)) {
    throw new Error(MSG_GIA_SOCIO)
  }

  const numero = await assegnaNumero(g, domanda)

  // --- scheda RU: da non socio a socio ---
  const { campi, differenze } = completamenti(rec, d)
  const socio: Record<string, unknown> = { Socio: 'Si', NumeroElencoGenerale: numero }
  if (!txt(rec.QuotaSociale)) socio.QuotaSociale = totaleQuote()
  else if (Number(rec.QuotaSociale) !== totaleQuote()) {
    differenze.push({ campo: 'Quota sociale sottoscritta', scheda: txt(rec.QuotaSociale), domanda: String(totaleQuote()) })
  }
  // Il tipo di rapporto si aggiorna solo nel caso ovvio: un dipendente che
  // diventa socio lavoratore. Negli altri casi si avvisa e basta, perché il
  // tipo di rapporto decide anche chi timbra (lib/timbrature/sync.ts): un
  // "Socio volontario" scritto da solo spegnerebbe il foglio ore di un lavoratore.
  const tipoAttuale = txt(rec.TipoRapporto)
  const tipoNuovo = tipoRU(d.tipoSocio)
  if (d.tipoSocio === 'lavoratore' && (!tipoAttuale || tipoAttuale === 'Dipendente')) {
    socio.TipoRapporto = tipoNuovo
  } else if (tipoNuovo && tipoAttuale !== tipoNuovo) {
    avvisi.push(`Nella domanda ha scelto «${etichettaTipo(d.tipoSocio)}», ma il tipo di rapporto nella scheda è «${tipoAttuale || 'vuoto'}»: non l'ho cambiato, controllalo tu.`)
  }
  const aggiornato = await aggiornaCampiTipizzati(g, 'dipendenti', domanda.ruItemId, { ...campi, ...socio })

  // --- scheda progressiva per Claudia ---
  const nome = nomeScheda(d, numero)
  const xlsx = await generaSchedaSocioBuffer(
    {
      ...aggiornato,
      Cognome: d.cognome,
      Nome: d.nome,
      DataNascita: d.dataNascita,
      LuogoNascita: d.provNascita ? `${d.luogoNascita} (${d.provNascita})` : d.luogoNascita,
      ComuneResidenza: d.comuneResidenza,
      IndirizzoResidenza: d.indirizzo,
      Nazionalita: d.cittadinanza,
      CodiceFiscale: d.codiceFiscale,
      NumeroElencoGenerale: numero,
    },
    {
      tipoSocio: tipoNuovo,
      professione: d.professione,
      capitaleSottoscritto: { data: domanda.dataDomanda ?? oggiIso(), importo: totaleQuote() },
    },
  )
  const scheda = await caricaDocumentoInCartella(g, cartellaSchede(anno), nome, xlsx, CT_XLSX)

  // --- copia della domanda nella cartella personale (facoltativa) ---
  try {
    await copiaInCartellaDipendente(g, firmata.id, domanda.ruItemId, `Socio - ${firmata.nome}`)
  } catch (e) {
    console.error('[soci] copia nella cartella personale non riuscita:', e)
    avvisi.push('Non sono riuscito a copiare la domanda firmata nella cartella personale della persona.')
  }

  await mailNuovoSocio({
    numero,
    dati: d,
    dataDomanda: domanda.dataDomanda ?? oggiIso(),
    domandaUrl: firmata.url,
    schedaUrl: scheda.url,
    schedaNome: nome,
    xlsx,
    differenze,
    avvisi,
    tipoRapportoAggiornato: !!socio.TipoRapporto,
  })

  const esito = [
    ...differenze.map((x) => `Differenza ${x.campo}: scheda «${x.scheda}», domanda «${x.domanda}»`),
    ...avvisi,
  ].join('\n')
  await aggiornaDomanda(g, domanda.spItemId, {
    stato: 'Registrata',
    schedaUrl: scheda.url,
    registrata: true,
    esito,
  })

  await logAzione({
    utente: attore.email,
    nome: attore.nome,
    azione: 'soci.registrazione',
    entita: 'Domanda ammissione socio',
    entitaId: domanda.spItemId,
    dettagli: { numero, tipo: d.tipoSocio, schedaRU: domanda.ruItemId, differenze: differenze.length, avvisi: avvisi.length },
  })

  return { numero, schedaUrl: scheda.url }
}
