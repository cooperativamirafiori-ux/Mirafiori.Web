/**
 * Stato vuoto: il riquadro tratteggiato che dice "qui non c'è ancora niente".
 *
 * Ripetuto tre volte con le stesse classi. Un elenco vuoto e un elenco che sta
 * caricando sono cose diverse: se stai ancora caricando non mostrare questo,
 * altrimenti l'utente legge "nessun risultato" quando i dati stanno arrivando.
 */
export function Vuoto({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-400">
      {children}
    </div>
  )
}
