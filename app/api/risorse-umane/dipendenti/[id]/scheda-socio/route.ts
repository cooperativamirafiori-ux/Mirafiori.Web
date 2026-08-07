import { schedaSocioHandler } from '@/lib/risorse-umane/api'

export const dynamic = 'force-dynamic'

export const { GET } = schedaSocioHandler('dipendenti')
