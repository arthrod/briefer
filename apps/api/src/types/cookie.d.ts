declare module 'cookie' {
  export interface CookieSerializeOptions {
    domain?: string
    encode?(value: string): string
    expires?: Date
    httpOnly?: boolean
    maxAge?: number
    path?: string
    sameSite?: boolean | 'lax' | 'strict' | 'none'
    secure?: boolean
    signed?: boolean
  }

  export function parse(str: string, options?: CookieSerializeOptions): { [key: string]: string }
  export function serialize(name: string, value: string, options?: CookieSerializeOptions): string
}
