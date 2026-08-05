/**
 * Una voce di dettaglio: etichetta sopra, valore sotto. Va dentro un `<dl>`.
 *
 * Era duplicata identica, byte per byte, in GestioneAcquisti e InventarioBeni
 * (20 chiamate in tutto). I nomi corti `t` e `v` sono volutamente rimasti quelli
 * originali: così adottare questo file è cancellare la funzione locale e
 * aggiungere un import, senza toccare una sola chiamata.
 */
export function Voce({ t, v, span }: { t: string; v: string; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : undefined}>
      <dt className="text-gray-500">{t}</dt>
      <dd className="text-gray-800 font-medium whitespace-pre-wrap">{v}</dd>
    </div>
  )
}
