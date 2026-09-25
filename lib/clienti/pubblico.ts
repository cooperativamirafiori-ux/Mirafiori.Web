/**
 * Nuovo cliente dal QR — la parte server.
 *
 * La pagina è pubblica, quindi valgono tre regole che il resto dell'area non ha:
 *
 * 1. **Non si legge mai niente dell'anagrafica verso fuori.** L'unica cosa che
 *    la risposta dice è «c'eri già» o «ti abbiamo aggiunto». Nessun dato di un
 *    cliente esistente torna al browser, nemmeno per precompilare il modulo.
 * 2. **Niente doppioni** (decisione di Dennis, 25 set 2026): se partita IVA *o*
 *    codice fiscale coincidono con un cliente già in elenco, si aggiorna quello.
 *    Prima però si chiede conferma al cliente (`conferma: false` → esito
 *    `esiste`), così sa che c'era già.
 * 3. **Nessuna mail** (decisione di Dennis, 25 set 2026): il cliente finisce
 *    nell'elenco Clienti e basta, nessuno viene avvisato.
 */

import { caricaClienti, salvaCliente, type DatiCliente } from '@/lib/clienti/data'
import type { Cliente } from '@/types/clienti'
import { denominazioneDi, type NuovoClienteInput } from '@/types/nuovo-cliente'

const piatto = (s: string) => (s ?? '').replace(/\s/g, '').toUpperCase()

/**
 * Il cliente che ha la stessa partita IVA o lo stesso codice fiscale — in
 * qualunque dei due campi, perché per gli enti il codice fiscale è spesso la
 * partita IVA e in archivio sta ora nell'uno ora nell'altro.
 */
export async function trovaPerCodici(partitaIva: string, codiceFiscale: string): Promise<Cliente | null> {
  const codici = [piatto(partitaIva), piatto(codiceFiscale)].filter(Boolean)
  if (!codici.length) return null
  const clienti = await caricaClienti()
  return (
    clienti.find((c) => {
      const suoi = [piatto(c.partitaIva), piatto(c.codiceFiscale)].filter(Boolean)
      return suoi.some((x) => codici.includes(x))
    }) ?? null
  )
}

function datiDa(c: NuovoClienteInput): DatiCliente {
  return {
    denominazione: denominazioneDi(c),
    cognome: c.cognome.trim(),
    nome: c.nome.trim(),
    tipoSoggetto: c.tipoSoggetto,
    indirizzo: c.indirizzo.trim(),
    comune: c.citta.trim(),
    cap: c.cap.trim(),
    provincia: c.provincia.trim().toUpperCase(),
    nazione: c.nazione.trim().toUpperCase(),
    partitaIva: piatto(c.partitaIva),
    codiceFiscale: piatto(c.codiceFiscale),
    telefono: c.telefono.trim(),
    email: c.email.trim(),
    pec: c.pec.trim(),
    codiceSdi: piatto(c.codiceSdi),
  }
}

export type EsitoRegistrazione = 'esiste' | 'creato' | 'aggiornato' | 'invariato'

export async function registraCliente(
  c: NuovoClienteInput,
  conferma: boolean,
): Promise<EsitoRegistrazione> {
  const esistente = await trovaPerCodici(c.partitaIva, c.codiceFiscale)
  if (esistente && !conferma) return 'esiste'

  const { esito } = await salvaCliente(datiDa(c), esistente?.spItemId)
  return esito
}
