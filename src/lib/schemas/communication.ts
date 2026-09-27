import { z } from 'zod'

export const communicationSchema = z.object({
  eventId: z.string().min(1).max(200),
  contacted: z.string().trim().min(1, 'Record who you contacted.').max(1000),
  note: z.string().trim().max(2000).default(''),
})
