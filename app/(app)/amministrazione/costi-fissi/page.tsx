import { auth } from '@/lib/core/auth'
import { redirect } from 'next/navigation'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { getCostiFissi } from '@/lib/costi-fissi/data'
import { getStruttureCc } from '@/lib/utenze/data'
import { AREA_AMMINISTRAZIONE, type StrutturaCc } from '@/types/utenze'
import type { CostoFisso } from '@/types/costi-fissi'
import { GestioneCostiFissi } from './_componenti/GestioneCostiFissi'

export const dynamic = 'force-dynamic'

/**
 * Costi fissi delle strutture (affitto, assicurazione, IMU, TARI, telefonia…):
 * per ora si inseriscono a mano, e il cruscotto li spalma sui mesi. Quali
 * automatizzare si decide più avanti (Dennis, 09/10/2026).
 */
export default async function CostiFissiPage() {
  const session = await auth()
  if (!session?.user?.permessi?.includes(AREA_AMMINISTRAZIONE)) redirect('/home')

  let costi: CostoFisso[] = []
  let strutture: StrutturaCc[] = []
  let errore = ''
  try {
    ;[costi, strutture] = await Promise.all([getCostiFissi(), getStruttureCc()])
  } catch (e) {
    console.error('[amministrazione/costi-fissi]', e)
    errore = e instanceof Error ? e.message : 'Errore di lettura'
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header title="Costi fissi" backHref="/amministrazione" backLabel="Torna all'Amministrazione" />
      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Costi fissi delle strutture</h2>
        <p className="text-gray-500 mb-6">
          Affitto, assicurazione, IMU, TARI, telefonia: quello che si paga a scadenza fissa.
          Nel cruscotto Costi per struttura ogni voce si divide sui mesi. Luce, gas e acqua
          non vanno qui: arrivano dalle bollette.
        </p>
        <Banner tono="errore">{errore}</Banner>
        {!errore && <GestioneCostiFissi costi={costi} strutture={strutture} />}
      </main>
    </div>
  )
}
