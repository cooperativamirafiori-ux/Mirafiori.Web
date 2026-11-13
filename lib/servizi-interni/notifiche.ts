/** Mail degli addebiti interni. */

import { sendEmail, BOX, BTN, RIGA, TABELLA } from '@/lib/core/mailer'
import { getCoordinatoriCentri } from '@/lib/centri-costo/data'
import type { AddebitoInterno } from '@/types/servizi-interni'

const APP = () => (process.env.APP_BASE_URL || 'https://mirafiori-web.vercel.app').replace(/\/+$/, '')

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
const meseIt = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })

/**
 * Nuovo addebito (o addebito cambiato) → ai coordinatori del servizio che lo
 * riceve. Il visto è informativo: la mail lo dice.
 */
export async function notificaAddebito(opts: {
  addebito: AddebitoInterno
  nomeDa: string
  nomeA: string
  modificato: boolean
}): Promise<void> {
  const a = opts.addebito
  const destinatari = (await getCoordinatoriCentri())[a.ccA] ?? []
  if (!destinatari.length) return
  const ore = a.ore > 0
    ? RIGA('Ore di lavoro', `${a.ore.toLocaleString('it-IT')} h × ${a.euroOra != null ? euro(a.euroOra) : '—'}/h (forfait uguale per tutti)`)
    : ''
  const altri = a.altriCosti.map((c) => RIGA(esc(c.descrizione), euro(c.importo))).join('')
  await sendEmail({
    to: destinatari,
    subject: `${opts.modificato ? 'Addebito interno modificato' : 'Nuovo addebito interno'}: ${opts.nomeDa} → ${opts.nomeA}`,
    html: BOX(`
      ${a.ccDa
        ? `<p><strong>${esc(opts.nomeDa)}</strong> ha ${opts.modificato ? 'modificato un addebito' : 'addebitato un lavoro'} a <strong>${esc(opts.nomeA)}</strong> per ${meseIt(a.mese)}.</p>`
        : `<p>${opts.modificato ? 'È stato modificato un costo esterno' : 'È stato attribuito un costo esterno'} (pagato senza fattura) a <strong>${esc(opts.nomeA)}</strong> per ${meseIt(a.mese)}.</p>`}
      ${TABELLA(RIGA('Cosa', esc(a.descrizione)) + ore + altri + RIGA('Totale', a.totale != null ? euro(a.totale) : '—'))}
      <p style="color:#555">Puoi mettere il visto o scrivere che non ti torna. Il visto serve a sapere che l'hai visto: l'addebito vale comunque.</p>
      ${BTN(`${APP()}/controllo-gestione/addebiti-interni?r=${a.id}`, 'Apri l\'addebito', '#1f4e79')}
    `),
  })
}

/** "Non mi torna" → ai coordinatori del servizio che ha addebitato, con la nota. */
export async function notificaNonTorna(opts: {
  addebito: AddebitoInterno
  nomeDa: string
  nomeA: string
  chi: string
}): Promise<void> {
  const a = opts.addebito
  // Un costo esterno non ha un servizio di partenza a cui scrivere.
  if (!a.ccDa) return
  const destinatari = (await getCoordinatoriCentri())[a.ccDa] ?? []
  if (!destinatari.length) return
  await sendEmail({
    to: destinatari,
    subject: `Addebito interno n. ${a.numero}: a ${opts.nomeA} non torna`,
    html: BOX(`
      <p><strong>${esc(opts.chi)}</strong> (${esc(opts.nomeA)}) ha scritto che l'addebito n. ${a.numero} di ${meseIt(a.mese)} non gli torna:</p>
      <p style="margin:12px 0;padding:10px 12px;background:#f6f7f9;border-left:3px solid #c9ced6;white-space:pre-line">${esc(a.vistoNota ?? '')}</p>
      ${TABELLA(RIGA('Cosa', esc(a.descrizione)) + RIGA('Totale', a.totale != null ? euro(a.totale) : '—'))}
      <p style="color:#555">L'addebito vale comunque. Se va corretto, modificalo entro il 10 del mese dopo; poi con un addebito nel mese corrente.</p>
      ${BTN(`${APP()}/controllo-gestione/addebiti-interni?r=${a.id}`, 'Apri l\'addebito', '#1f4e79')}
    `),
  })
}
