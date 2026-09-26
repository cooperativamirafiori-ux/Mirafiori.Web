/**
 * POST /api/pagamenti/importa-sdi — "Importa adesso": legge subito la cartella
 * delle fatture XML invece di aspettare il giro notturno.
 *
 * Permesso: 'Pagamenti', come il caricamento dell'Excel che sostituisce.
 */

import { NextResponse } from 'next/server'
import { guardPagamento } from '@/lib/pagamenti/guard'
import { importaFattureSdi } from '@/lib/pagamenti/sdi/import'
import { logAzione } from '@/lib/core/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const g = await guardPagamento()
  if (g.error) return g.error
  try {
    const ricevuta = await importaFattureSdi({ utente: g.email, budgetMs: 240_000 })
    await logAzione({
      utente: g.email,
      nome: g.session.user?.name,
      azione: 'pagamenti.import_sdi',
      entita: 'ImportFattureSdi',
      entitaId: ricevuta.importId,
      dettagli: {
        fatture: ricevuta.fatture,
        nuove: ricevuta.nuove,
        raccordate: ricevuta.raccordate,
        giaImportate: ricevuta.giaImportate,
        errori: ricevuta.errori.length,
        primoImport: ricevuta.primoImport,
      },
    })
    return NextResponse.json({ ricevuta })
  } catch (e: any) {
    console.error('[importa-sdi]', e)
    return NextResponse.json({ error: e?.message ?? 'Import non riuscito' }, { status: 500 })
  }
}
