/**
 * I documenti della domanda di ammissione socio.
 *
 * - il **modulo di domanda**: il cartaceo della cooperativa rifatto uguale in
 *   lib/templates/domanda-socio/Domanda_Ammissione_Socio_TEMPLATE.docx,
 *   compilato con docxtemplater e convertito in PDF da Graph;
 * - la **scheda progressiva** del libro soci per Claudia: la genera
 *   lib/risorse-umane/export-scheda-socio.ts dal modello di sempre.
 *
 * Dove finiscono (raccolta "Documenti condivisi" del sito Risorse Umane, la
 * cartella che usa già Claudia):
 *   <SP_SOCI_FOLDER>/Soci_<anno>/AMMISSIONI SOCI/COGNOME_ domanda ammissione socio.pdf
 *   <SP_SOCI_FOLDER>/Soci_<anno>/SCHEDE PROGRESSIVE DA STAMPARE/COGNOME_<numero>.xlsx
 * Sono i nomi che Claudia dava già ai file a mano. Se l'anno nuovo non ha
 * ancora la sua cartella, la crea l'app.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import type { GraphClient } from '@/lib/core/graph-delegato'
import { pdfDaDocumento } from '@/lib/risorse-umane/data'
import { IMPORTO_QUOTA, quoteDi, totaleQuote, type DatiDomanda } from '@/types/soci'

const MODELLO = join(process.cwd(), 'lib', 'templates', 'domanda-socio', 'Domanda_Ammissione_Socio_TEMPLATE.docx')
const CT_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const RADICE = () =>
  (process.env.SP_SOCI_FOLDER || 'General/RISORSE UMANE/RISORSE UMANE 2/SOCI').replace(/^\/+|\/+$/g, '')

export const cartellaAmmissioni = (anno: number) => `${RADICE()}/Soci_${anno}/AMMISSIONI SOCI`
export const cartellaSchede = (anno: number) => `${RADICE()}/Soci_${anno}/SCHEDE PROGRESSIVE DA STAMPARE`
/** Dove nasce e muore il .docx da convertire. */
const cartellaLavoro = () => `${RADICE()}/_app`

/** "Bertoglio" → "BERTOGLIO", senza caratteri che SharePoint rifiuta. */
function cognomeFile(cognome: string): string {
  return (cognome || 'SOCIO').toUpperCase().replace(/[\\/:*?"<>|#%]/g, '').replace(/\s+/g, ' ').trim()
}

export function nomeDomandaFirmata(dati: DatiDomanda, estensione: string): string {
  const ext = /^[a-z0-9]{2,5}$/i.test(estensione) ? estensione.toLowerCase() : 'pdf'
  return `${cognomeFile(dati.cognome)}_ domanda ammissione socio.${ext}`
}

export const nomeScheda = (dati: DatiDomanda, numero: number) => `${cognomeFile(dati.cognome)}_${numero}.xlsx`

/** "2026-10-29" → "29/10/2026" */
export function dataIt(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const casella = (si: boolean) => (si ? '☒' : '☐')

/** Il .docx compilato. Separato dal PDF per poterlo provare senza Graph. */
export function generaDocxDomanda(dati: DatiDomanda, dataDomanda: string): Buffer {
  const zip = new PizZip(readFileSync(MODELLO))
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
  doc.render({
    nominativo: `${dati.cognome} ${dati.nome}`.trim(),
    luogoNascita: dati.luogoNascita,
    provNascita: dati.provNascita,
    dataNascita: dataIt(dati.dataNascita),
    codiceFiscale: dati.codiceFiscale,
    professione: dati.professione,
    comuneResidenza: dati.comuneResidenza,
    provResidenza: dati.provResidenza,
    indirizzo: dati.indirizzo,
    telefono: dati.telefono,
    cLav: casella(dati.tipoSocio === 'lavoratore'),
    cVol: casella(dati.tipoSocio === 'volontario'),
    cSov: casella(dati.tipoSocio === 'sovventore'),
    numeroQuote: String(quoteDi(dati)),
    importoQuota: euro(IMPORTO_QUOTA),
    totale: euro(totaleQuote(quoteDi(dati))),
    cTratt: casella(dati.modalita === 'trattenute'),
    cCassa: casella(dati.modalita === 'cassa'),
    dataDomanda: dataIt(dataDomanda),
  })
  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer
}

/** Il PDF della domanda, pronto da stampare e firmare. */
export async function pdfDomanda(g: GraphClient, idDomanda: string, dati: DatiDomanda, dataDomanda: string): Promise<Buffer> {
  const docx = generaDocxDomanda(dati, dataDomanda)
  return pdfDaDocumento(g, cartellaLavoro(), `domanda-${idDomanda}-${Date.now()}.docx`, docx, CT_DOCX)
}
