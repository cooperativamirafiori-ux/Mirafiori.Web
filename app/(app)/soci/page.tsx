import { auth } from '@/lib/core/auth'
import { Header } from '@/components/ui/Header'
import { Banner } from '@/components/ui/Banner'
import { domandaDi, graphSoci, perIlBrowser, sociConfigurato } from '@/lib/soci/data'
import { giaSocioPerAltro, precompila, schedaDi } from '@/lib/soci/flusso'
import { DomandaSocio } from './_componenti/DomandaSocio'

export const dynamic = 'force-dynamic'

/**
 * Domanda di ammissione a socio — aperta a tutti, nessun permesso.
 *
 * Chi la apre si riconosce dalla mail con cui è entrato: i dati del modulo
 * arrivano dalla sua scheda nel personale. Senza scheda non si parte, perché
 * la registrazione deve sapere quale scheda far diventare "socio".
 */
export default async function SociPage() {
  const session = await auth()
  const email = session?.user?.email ?? ''

  const guscio = (contenuto: React.ReactNode) => (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-cyan/10 via-white to-white">
      <Header title="Domanda di ammissione socio" backHref="/home" backLabel="Torna alla Home" />
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">{contenuto}</main>
    </div>
  )

  if (!sociConfigurato()) {
    return guscio(<Banner tono="avviso">La sezione non è ancora configurata: avvisa le Risorse Umane.</Banner>)
  }

  let errore = ''
  let scheda = null
  let domanda = null
  try {
    const g = graphSoci()
    ;[scheda, domanda] = await Promise.all([schedaDi(g, email), domandaDi(g, email)])
  } catch (e) {
    console.error('[soci] lettura iniziale', e)
    errore = 'Non riesco a leggere i tuoi dati in questo momento. Riprova fra qualche minuto.'
  }
  if (errore) return guscio(<Banner tono="errore">{errore}</Banner>)

  if (!scheda) {
    return guscio(
      <Banner tono="avviso">
        Non troviamo la tua scheda nell’elenco del personale con la mail <strong>{email}</strong>.
        Scrivi a <a className="underline" href="mailto:risorseumane@cooperativamirafiori.com">risorseumane@cooperativamirafiori.com</a>{' '}
        e ti aiutiamo noi.
      </Banner>,
    )
  }

  const inCorso = domanda && domanda.stato !== 'Registrata' ? domanda : null
  const registrata = domanda && domanda.stato === 'Registrata' ? domanda : null

  // Chi è già socio vede tutta la procedura, con l'avviso in cima; l'invio
  // della firmata gli è bloccato (Dennis, 30/10/2026). Il numero viene dalla
  // sua domanda registrata, altrimenti dalla scheda RU.
  const giaSocio = giaSocioPerAltro(scheda, inCorso)
    ? { numero: registrata?.numeroElencoGenerale ?? (scheda.NumeroElencoGenerale ? Number(scheda.NumeroElencoGenerale) : null) }
    : null

  return guscio(
    <DomandaSocio
      iniziali={inCorso ? inCorso.dati : precompila(scheda)}
      domanda={inCorso ? perIlBrowser(inCorso) : null}
      giaSocio={giaSocio}
    />,
  )
}
