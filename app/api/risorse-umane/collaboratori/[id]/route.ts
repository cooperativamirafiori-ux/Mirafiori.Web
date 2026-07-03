import { itemHandlers } from '@/lib/ru-api'

export const dynamic = 'force-dynamic'

export const { GET, PATCH, DELETE } = itemHandlers('collaboratori')
