import { z } from 'zod'

// Login form input. The Server Action in src/app/login/page.tsx parses with
// this before invoking next-auth `signIn`. Keep this here (rather than inline)
// as the canonical example of the schema pattern for new features:
//
//   src/lib/schemas/<feature>.ts  ─ Zod schema + inferred TypeScript type
//   src/app/<route>/page.tsx       ─ Server Action parses formData with it
//
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
})

export type LoginInput = z.infer<typeof loginSchema>
