import crypto from 'crypto'

export function encrypt(raw: string, hexKey: string): string {
  const binKey = new Uint8Array(Buffer.from(hexKey, 'hex').buffer)
  const randomBytes = crypto.randomBytes(16)
  const iv = new Uint8Array(randomBytes.buffer)
  const cipher = crypto.createCipheriv('aes-256-ctr', binKey, iv)

  const encrypted = Buffer.concat([
    new Uint8Array(cipher.update(raw).buffer),
    new Uint8Array(cipher.final().buffer),
  ])

  // Convert to hex strings for storage
  const ivHex = Buffer.from(iv.buffer).toString('hex')
  const encryptedHex = Buffer.from(encrypted.buffer).toString('hex')
  return `${ivHex}:${encryptedHex}`
}

export function decrypt(encrypted: string, hexKey: string): string {
  const [ivHex, contentHex] = encrypted.split(':')
  if (!ivHex || !contentHex) {
    throw new Error('Invalid encrypted data')
  }

  const binKey = new Uint8Array(Buffer.from(hexKey, 'hex').buffer)
  const iv = new Uint8Array(Buffer.from(ivHex, 'hex').buffer)
  const content = new Uint8Array(Buffer.from(contentHex, 'hex').buffer)

  const decipher = crypto.createDecipheriv(
    'aes-256-ctr',
    binKey,
    iv
  )

  const decrypted = Buffer.concat([
    new Uint8Array(decipher.update(content).buffer),
    new Uint8Array(decipher.final().buffer),
  ])

  return decrypted.toString()
}
