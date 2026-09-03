import { z } from 'zod'

export const paSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
})

export const paIdSchema = z.object({
  id: z.string().min(1),
})

export type PAInput = z.infer<typeof paSchema>
