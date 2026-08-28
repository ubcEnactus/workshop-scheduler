import { z } from 'zod'
import { COMMUNITIES } from '@/lib/scheduling/commute'

export const communitySchema = z.enum(COMMUNITIES)

export type CommunityInput = z.infer<typeof communitySchema>

export const optionalCommunitySchema = z
  .string()
  .transform((v) => (v === '' ? null : v))
  .pipe(communitySchema.nullable())
