/**
 * Chi può modificare una pratica (annullarla, cambiarne il centro di costo):
 * il responsabile che l'ha aperta e gli amministratori.
 */
import type { Prestazione } from '@/types/prestazioni'

export function puoGestirePratica(
  user: { email?: string | null; isAdmin?: boolean } | undefined | null,
  p: Pick<Prestazione, 'responsabileEmail'>,
): boolean {
  if (!user?.email) return false
  if (user.isAdmin) return true
  return user.email.toLowerCase() === (p.responsabileEmail || '').toLowerCase()
}
