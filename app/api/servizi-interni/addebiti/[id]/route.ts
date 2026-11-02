/**
 * Un addebito interno.
 *
 * PATCH DatiAddebito → modifica (toglie il visto, nuova mail a chi riceve)
 * DELETE             → toglie
 *
 * Solo chi può scrivere per il servizio che addebita, e solo finché il mese
 * non è chiuso (il 10 del mese dopo).
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardServiziInterni } from '@/lib/servizi-interni/guard'
import { puoScrivereDa } from '@/lib/servizi-interni/accesso'
import { aggiornaAddebito, eliminaAddebito, getAddebito, getCentriScelta } from '@/lib/servizi-interni/data'
import { bloccato, validaAddebito } from '@/lib/servizi-interni/flusso'
import { notificaAddebito } from '@/lib/servizi-interni/notifiche'
import { logAzione } from '@/lib/core/audit'

type Ctx = { params: Promise<{ id: string }> }

async function controlla(id: string) {
  const g = await guardServiziInterni()
  if (g.error) return { errore: g.error } as const
  const prima = await getAddebito(id)
  if (!prima) return { errore: NextResponse.json({ error: 'Addebito non trovato' }, { status: 404 }) } as const
  if (!puoScrivereDa(g.accesso, prima.ccDa)) {
    return { errore: NextResponse.json({ error: 'Puoi modificare solo gli addebiti dei servizi che coordini' }, { status: 403 }) } as const
  }
  if (prima.origine !== 'manuale') {
    const dove = prima.origine === 'manutenzione' ? 'nei Costi della richiesta di manutenzione' : 'nel Lavoro di Cura Ambienti'
    return { errore: NextResponse.json({ error: `Questo addebito lo scrive l'app: si corregge ${dove}` }, { status: 409 }) } as const
  }
  if (prima.bloccato) {
    return { errore: NextResponse.json({ error: 'Il mese è chiuso: rettifica con un addebito nel mese corrente' }, { status: 409 }) } as const
  }
  return { errore: null, g, prima } as const
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const c = await controlla(id)
  if (c.errore) return c.errore
  let dati
  try {
    dati = validaAddebito(await req.json())
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Dati non validi' }, { status: 400 })
  }
  if (!puoScrivereDa(c.g.accesso, dati.ccDa)) {
    return NextResponse.json({ error: 'Puoi addebitare solo per i servizi che coordini' }, { status: 403 })
  }
  if (bloccato(dati.mese)) {
    return NextResponse.json({ error: 'Quel mese è chiuso: scegli il mese corrente' }, { status: 400 })
  }
  try {
    const centri = await getCentriScelta()
    const nome = (x: string) => centri.find((y) => y.codice === x)?.nome ?? x
    const addebito = await aggiornaAddebito(id, dati, c.g.email)
    notificaAddebito({ addebito, nomeDa: nome(dati.ccDa), nomeA: nome(dati.ccA), modificato: true }).catch(console.error)
    await logAzione({
      utente: c.g.email,
      nome: c.g.nome,
      azione: 'addebito-interno.modifica',
      entita: 'AddebitoInterno',
      entitaId: String(addebito.numero),
      dettagli: { prima: c.prima.totale, dopo: addebito.totale },
    })
    return NextResponse.json({ ok: true, addebito })
  } catch (e: any) {
    console.error(`[PATCH /api/servizi-interni/addebiti/${id}]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const c = await controlla(id)
  if (c.errore) return c.errore
  try {
    await eliminaAddebito(id)
    await logAzione({
      utente: c.g.email,
      nome: c.g.nome,
      azione: 'addebito-interno.elimina',
      entita: 'AddebitoInterno',
      entitaId: String(c.prima.numero),
      dettagli: { da: c.prima.ccDa, a: c.prima.ccA, mese: c.prima.mese, totale: c.prima.totale },
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error(`[DELETE /api/servizi-interni/addebiti/${id}]`, e)
    return NextResponse.json({ error: e.message ?? 'Errore interno' }, { status: 500 })
  }
}
