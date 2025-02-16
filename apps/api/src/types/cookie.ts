import { z } from 'zod'

export const CookieOptions = z.object({
  httpOnly: z.boolean(),
  secure: z.boolean(),
  sameSite: z.enum(['strict', 'lax', 'none']),
  maxAge: z.number().optional(),
})

export type CookieOptions = z.infer<typeof CookieOptions>
