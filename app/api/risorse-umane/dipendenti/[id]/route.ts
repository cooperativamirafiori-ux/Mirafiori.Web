import { itemHandlers } from '@/lib/risorse-umane/api'

export const dynamic = 'force-dynamic'

export const { GET, PATCH, DELETE } = itemHandlers('dipendenti')
