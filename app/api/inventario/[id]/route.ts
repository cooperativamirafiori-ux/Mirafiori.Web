/**
 * GET   /api/inventario/[id] — scheda di un bene
 * PATCH /api/inventario/[id] — aggiorna i campi di vita del bene
 *
 * La PATCH accetta soltanto stato, ubicazione, struttura, data di dismissione e
 * note: tutto il resto (numero, importi, fornitore, garanzia) viene dalla
 * richiesta di acquisto ed è di sola lettura, così registro e richiesta non
 * divergono. Per correggere quei dati si corregge l'ordine, che riallinea i beni.
 *
 * Protetta: area "Acquisti".
 */

import { NextRequest, NextResponse } from 'next/server'
import { guardArea } from '@/lib/core/api-guard'
import { AREA_ACQUISTI } from '@/lib/acquisti/data'
import { aggiornaVitaBene, getBeneById, inventarioConfigurato } from '@/lib/inventario/data'
import { logAzione } from '@/lib/core/audit'
import { STATI_BENE, type AggiornaBenePayload } from '@/types/inventario'

export const dynamic = 'force-dynamic'

const err = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA_ACQUISTI)
  if (g.error) return g.error
  if (!inventarioConfigurato()) return err('Inventario non configurato', 503)

  const { id } = await params
  try {
    return NextResponse.json({ bene: await getBeneById(id) })
  } catch (e: any) {
    console.error(`[GET /api/inventario/${id}]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardArea(AREA_ACQUISTI)
  if (g.error) return g.error
  if (!inventarioConfigurato()) return err('Inventario non configurato', 503)

  const { id } = await params
  if (!id) return err('ID bene mancante')

  let body: AggiornaBenePayload
  try {
    body = await req.json()
  } catch {
    return err('Body non valido (atteso JSON)')
  }

  if (body.statoBene && !STATI_BENE.includes(body.statoBene)) {
    return err('Stato del bene non valido.')
  }
  if (
    body.dataDismissione &&
    !/^\d{4}-\d{2}-\d{2}$/.test(String(body.dataDismissione).slice(0, 10))
  ) {
    return err('Data di dismissione non valida.')
  }

  try {
    const prima = await getBeneById(id)
    const bene = await aggiornaVitaBene(prima, body)

    await logAzione({
      utente: g.session.user.email,
      nome: g.session.user.name,
      azione: 'inventario.aggiorna',
      entita: 'BeneInventario',
      entitaId: bene.numero,
      dettagli: {
        statoPrecedente: prima.statoBene,
        stato: bene.statoBene,
        ubicazione: bene.ubicazione,
        strutturaId: bene.struttura?.id,
        dataDismissione: bene.dataDismissione,
      },
    })

    return NextResponse.json({ bene })
  } catch (e: any) {
    console.error(`[PATCH /api/inventario/${id}]`, e)
    return err(e?.message ?? 'Errore interno', 500)
  }
}
