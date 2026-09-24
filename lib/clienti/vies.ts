/**
 * Dati di un'azienda dalla sua partita IVA, dal servizio europeo VIES.
 *
 * Serve al modulo Richiesta Fattura: chi compila scrive le 11 cifre e si vede
 * proporre nome e indirizzo, invece di doverli copiare lettera per lettera.
 * È il servizio pubblico e gratuito della Commissione europea; per l'Italia
 * restituisce denominazione e sede registrate all'Agenzia delle Entrate.
 *
 * **È una proposta, non una verità.** Il modulo mostra quello che ha trovato e
 * chi compila decide se usarlo. VIES a volte non risponde (è la rete dei singoli
 * Stati): in quel caso si torna `null` e il modulo lascia scrivere a mano, senza
 * errori a schermo — il servizio è un aiuto, non un passaggio obbligato.
 *
 * Risposta del servizio (la parte che serve):
 *   { isValid: true, name: "POLIEDRA S.P.A.", address: "VIA …\n10100 TORINO TO\n" }
 */

export interface DatiVies {
  denominazione: string
  indirizzo: string
  cap: string
  citta: string
  provincia: string
}

const URL_VIES = (piva: string) =>
  `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat/${piva}`

/** VIES scrive «---» dove un dato non c'è. */
const pulito = (s: unknown) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t === '---' ? '' : t
}

/**
 * L'indirizzo italiano arriva su due righe: via e civico, poi «CAP COMUNE PR».
 * Se la seconda riga non ha quella forma si tiene tutto come via: meglio un
 * indirizzo da sistemare a mano che un comune inventato.
 */
export function leggiIndirizzoVies(address: string): Omit<DatiVies, 'denominazione'> {
  const righe = String(address ?? '')
    .split(/\r?\n/)
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .filter((r) => r && r !== '---')
  const vuoto = { indirizzo: '', cap: '', citta: '', provincia: '' }
  if (!righe.length) return vuoto

  for (let i = righe.length - 1; i >= 0; i--) {
    const m = righe[i].match(/^(\d{5})\s+(.+?)\s+([A-Z]{2})$/)
    if (m) {
      return {
        indirizzo: righe.slice(0, i).join(' '),
        cap: m[1],
        citta: capitalizza(m[2]),
        provincia: m[3],
      }
    }
  }
  return { ...vuoto, indirizzo: righe.join(' ') }
}

/** «SAN MAURO TORINESE» → «San Mauro Torinese»: com'è scritto nell'elenco dei comuni. */
function capitalizza(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase())
}

export async function cercaPartitaIva(piva: string): Promise<DatiVies | null> {
  const numero = piva.replace(/\s/g, '')
  if (!/^\d{11}$/.test(numero)) return null
  try {
    const res = await fetch(URL_VIES(numero), {
      headers: { Accept: 'application/json' },
      // Chi compila sta aspettando davanti al cliente: oltre qualche secondo
      // conviene lasciarlo scrivere a mano.
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data: any = await res.json()
    if (!data?.isValid) return null
    const denominazione = pulito(data.name)
    if (!denominazione) return null
    return { denominazione, ...leggiIndirizzoVies(data.address) }
  } catch (err) {
    console.warn('[vies] servizio non raggiungibile', err)
    return null
  }
}
