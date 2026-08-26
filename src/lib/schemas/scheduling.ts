import { z } from 'zod'

// Row-level scheduling actions address a single workshop by id. The action
// re-checks that the workshop belongs to the open cycle — an id alone is not
// authorization.
export const workshopIdSchema = z.object({
  id: z.string().min(1),
})

export type WorkshopIdInput = z.infer<typeof workshopIdSchema>
