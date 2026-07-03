import { listHandlers } from '@/lib/ru-api'

export const dynamic = 'force-dynamic'

export const { GET, POST } = listHandlers('dipendenti')
