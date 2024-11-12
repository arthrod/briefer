import ShortUniqueId from 'short-unique-id'
import CryptoJS from 'crypto-js'

class CryptData {
  constructor(
    public iv = '',
    public data = ''
  ) {}
}

class AesTools {
  private static secKey = 'tmppasswordver1.'

  public static setSecretKey(sec: string): void {
    this.secKey = sec
  }

  public static parseMixedData(data: string, length = 8): CryptData {
    const preIV = data.slice(0, length)
    const preData = data.slice(length, length * 2)
    const endIV = data.slice(length * 2, length * 3)
    const endData = data.slice(length * 3)
    return new CryptData(preIV + endIV, preData + endData)
  }

  public static combineData(encrypted: string, iv: string, length = 8): string {
    const preData = encrypted.slice(0, length)
    const endData = encrypted.slice(length)
    return iv.slice(0, length) + preData + iv.slice(length) + endData
  }

  public static genRandomStr(length = 32): string {
    const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'
    return Array.from({ length }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('')
  }

  public static encrypt(encryptedData: string, encryptKey: string = AesTools.secKey): string {
    const iv = AesTools.getCbcIv()
    const key = CryptoJS.enc.Utf8.parse(encryptKey)

    const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(encryptedData), key, {
      iv: CryptoJS.enc.Utf8.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    })
    return AesTools.combineData(encrypted.toString(), iv)
  }

  public static decrypt(mixedData: string, encryptKey: string = AesTools.secKey): string {
    const { iv, data: encryptedData } = AesTools.parseMixedData(mixedData)
    const key = CryptoJS.enc.Utf8.parse(encryptKey)

    const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
      iv: CryptoJS.enc.Utf8.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    })
    return CryptoJS.enc.Utf8.stringify(decrypted) || ''
  }

  private static getCbcIv(): string {
    let iv = uuid(16)
    if (!iv) {
      iv = AesTools.genRandomStr(16) // 使用备用的随机生成方法
    }
    return iv.length < 16 ? iv.padEnd(16, '0') : iv.slice(0, 16)
  }
}

const uuid = new ShortUniqueId().randomUUID
export { AesTools }
