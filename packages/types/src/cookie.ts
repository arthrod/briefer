import { z } from 'zod'
import type { CookieSerializeOptions as BaseCookieOptions } from 'cookie'

export const CookieOptions = z.object({
  httpOnly: z.boolean(),
  secure: z.boolean(),
  sameSite: z.enum(['strict', 'lax', 'none']),
  maxAge: z.number().optional(),
})

export type CookieOptions = z.infer<typeof CookieOptions> & BaseCookieOptions
