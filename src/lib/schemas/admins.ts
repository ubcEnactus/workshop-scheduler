import { z } from 'zod'

export const adminSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
})

export type AdminInput = z.infer<typeof adminSchema>
