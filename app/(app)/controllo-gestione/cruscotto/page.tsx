/**
 * Cruscotto del controllo di gestione — prima versione (05/10/2026).
 *
 * Chi entra: chi ha il permesso "Controllo di Gestione" vede tutta la
 * cooperativa; un coordinatore (lista SP Centri di Costo) vede solo i suoi
 * servizi. È la stessa regola della scheda Qonto, e per questo la riusa.
 *
 * `?esempio=1` mostra dati inventati (vedi lib/gestione/cruscotto-esempio.ts):
 * solo a chi vede tutto, e la pagina lo dice in un banner fisso.
 */

import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { accessoQonto, puoVedereQonto } from '@/lib/qonto/accesso'
import { leggiCruscotto } from '@/lib/gestione/cruscotto'
import { Cruscotto } from './_componenti/Cruscotto'

export const dynamic = 'force-dynamic'

export default async function CruscottoPage({
  searchParams,
}: {
  searchParams: Promise<{ anno?: string; esempio?: string }>
}) {
  const session = await auth()
  const accesso = await accessoQonto(session?.user)
  if (!puoVedereQonto(accesso)) redirect('/controllo-gestione')

  const { anno: a, esempio: e } = await searchParams
  const annoOggi = new Date().getFullYear()
  const n = Number(a)
  const anno = Number.isInteger(n) && n >= annoOggi - 2 && n <= annoOggi ? n : annoOggi

  const dati = await leggiCruscotto(anno, accesso, { esempio: accesso.tutti && e === '1' })

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header title="Cruscotto" backHref="/controllo-gestione" backLabel="Torna al Controllo di Gestione" />
      <main className="flex-1 px-4 py-6 max-w-6xl mx-auto w-full">
        <Cruscotto dati={dati} />
      </main>
    </div>
  )
}
