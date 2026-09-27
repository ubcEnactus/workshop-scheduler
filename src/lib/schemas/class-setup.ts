import { z } from 'zod'

export const returnToClassesSchema = z.literal('1').optional()

export function isReturningToClassSetup(value: unknown): boolean {
  const parsed = returnToClassesSchema.safeParse(value || undefined)
  return parsed.success && parsed.data === '1'
}
