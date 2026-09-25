'use client'

/**
 * Passo «Per quale servizio?» — il centro di costo, detto con la parola che usa
 * chi lavora: il servizio.
 *
 * Compare solo quando non lo sappiamo già: chi ha mandato altre richieste parte
 * dal servizio dell'ultima (`getCentriRecentiDi`), e lo cambia solo se serve.
 * I servizi usati di recente sono bottoni grandi; tutti gli altri stanno in un
 * menu sotto, o in un campo di testo finché la lista dei centri di costo non è
 * configurata.
 */

import { Campo } from '@/components/ui/Campo'
import { BottoniScelta, Domanda } from '@/components/ui/Bottoni'

export function PassoServizio({
  valore,
  errore,
  recenti,
  centriDiCosto,
  onScegli,
}: {
  valore: string
  errore?: string
  recenti: string[]
  centriDiCosto: string[]
  onScegli: (v: string) => void
}) {
  const altri = centriDiCosto.filter((c) => !recenti.includes(c))
  const inAltri = Boolean(valore) && !recenti.includes(valore)

  return (
    <Domanda
      titolo="Per quale servizio è la fattura?"
      spiegazione="Scegli il servizio dove lavori o dove il cliente ha comprato."
    >
      {recenti.length > 0 && (
        <BottoniScelta
          opzioni={recenti.map((r) => ({ valore: r, etichetta: r }))}
          valore={valore}
          onScegli={onScegli}
          errore={altri.length || !centriDiCosto.length ? undefined : errore}
        />
      )}

      {centriDiCosto.length > 0 ? (
        altri.length > 0 && (
          <Campo
            grande
            etichetta={recenti.length ? 'Un altro servizio' : 'Servizio'}
            tipo="choice"
            scelte={altri}
            valore={inAltri ? valore : ''}
            onChange={(v) => v && onScegli(v)}
            vuoto="— Tocca per scegliere —"
            errore={errore}
          />
        )
      ) : (
        <Campo
          grande
          etichetta={recenti.length ? 'Oppure scrivi il servizio' : 'Scrivi il servizio'}
          valore={inAltri ? valore : ''}
          onChange={onScegli}
          segnaposto="Es. Locanda"
          errore={errore}
        />
      )}
    </Domanda>
  )
}
