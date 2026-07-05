import { redirect } from 'next/navigation'

// Il cruscotto HR è stato spostato dentro l'area Risorse Umane.
export default function TimbratureHrRedirect() {
  redirect('/risorse-umane/timbrature')
}
