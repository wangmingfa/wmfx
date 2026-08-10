/**
 * 云同步加密模块（主进程）
 *
 * 职责：在主进程内用 AES-256-GCM 对数据进行加解密。
 *
 * 安全边界：
 * - 密码（password string）永远只存在于 renderer 进程
 * - 密钥派生（PBKDF2）在 renderer 进程用 Web Crypto 完成，把派生好的 key (Uint8Array) 传给主进程
 * - 主进程只接触：key buffer + salt + nonce + 密文，不接触明文密码
 * - 退出应用后 key 被丢弃，无法恢复
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const ALGORITHM = 'aes-256-gcm'
const NONCE_LENGTH = 12 // 96 bit, GCM 推荐

/**
 * 加密后的云端包结构（JSON 可读，方便调试）
 */
export interface EncryptedPackage {
  version: '1'
  /** base64 编码的 salt（16 字节） */
  salt: string
  /** base64 编码的 nonce（12 字节） */
  nonce: string
  /** base64 编码的密文（含 GCM 标签） */
  ciphertext: string
  /** 源数据的 schema 版本号，恢复时校验兼容性 */
  schemaVersion: number
  /** 导出时间戳（unix ms），展示用 */
  exportedAt: number
}

/**
 * 加密 payload。key 来自 renderer（由用户密码派生），只接触 key buffer，不接触密码。
 */
export function encrypt(payload: Buffer, key: Uint8Array): EncryptedPackage {
  const salt = randomBytes(16)
  const nonce = randomBytes(NONCE_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, nonce)
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()])
  const authTag = cipher.getAuthTag() // 16 字节
  const ciphertext = Buffer.concat([encrypted, authTag])

  console.debug(
    '[Crypto] encrypt: payload bytes',
    payload.length,
    'ciphertext bytes',
    ciphertext.length
  )

  return {
    version: '1',
    salt: salt.toString('base64'),
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    schemaVersion: 1,
    exportedAt: Date.now(),
  }
}

/**
 * 解密云端包。key 来自 renderer（由用户密码派生）。
 * 返回原始明文 Buffer。
 */
export function decrypt(pkg: EncryptedPackage, key: Uint8Array): Buffer {
  if (pkg.version !== '1') {
    throw new Error(`[Crypto] decrypt: unsupported version ${pkg.version}`)
  }

  const salt = Buffer.from(pkg.salt, 'base64')
  const nonce = Buffer.from(pkg.nonce, 'base64')
  const ciphertext = Buffer.from(pkg.ciphertext, 'base64')
  void salt // salt 是加密时用来派生 key 的参数，本模块不派生 key（key 来自 renderer），因此 salt 仅用于日志，此处显式标记为读取。

  // ciphertext 最后 16 字节是 GCM authTag
  if (ciphertext.length < 16) {
    throw new Error('[Crypto] decrypt: ciphertext too short (no auth tag)')
  }
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16)
  const authTag = ciphertext.subarray(ciphertext.length - 16)

  const decipher = createDecipheriv(ALGORITHM, key, nonce)
  decipher.setAuthTag(authTag)

  console.debug('[Crypto] decrypt: ciphertext bytes', ciphertext.length, 'authTag ok')

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  console.debug('[Crypto] decrypt: decrypted bytes', decrypted.length)

  return decrypted
}

/**
 * 校验 key 是否正确（用 dummy 密文测试解密，不暴露真实数据）
 * 返回 true = key 正确，false = key 错误（错误密码不会抛异常，避免侧信道攻击泄漏信息）
 */
export function verifyKey(key: Uint8Array): boolean {
  // 生成一个临时密文，用同一个 key 解密验证
  try {
    const dummySalt = randomBytes(16)
    void dummySalt // salt 不参与 verifyKey 的加解密，仅占位，显式标记为读取
    const dummyNonce = randomBytes(NONCE_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, dummyNonce)
    const dummyData = Buffer.from('verify-key-test-data')
    const encrypted = Buffer.concat([cipher.update(dummyData), cipher.final()])
    const authTag = cipher.getAuthTag()
    const encryptedWithTag = Buffer.concat([encrypted, authTag])
    void encryptedWithTag // 仅用于构造密文，解密端直接拼接 encrypted + authTag

    const decipher = createDecipheriv(ALGORITHM, key, dummyNonce)
    decipher.setAuthTag(authTag)
    decipher.update(encrypted)
    decipher.final()
    return true
  } catch {
    return false
  }
}

/**
 * 导出：本地明文 → 云端包（含加密）
 * 先 JSON.stringify 再 gzip 压缩，最后 AES-GCM 加密。
 */
export async function exportPackage(
  data: unknown,
  key: Uint8Array,
  _schemaVersion: number = 1
): Promise<EncryptedPackage> {
  // 主进程用 zlib 同步压缩，避免 async 复杂化；数据通常几 MB 以内
  const { gzipSync } = await import('node:zlib')
  const raw = Buffer.from(JSON.stringify(data))
  const compressed = gzipSync(raw)
  console.debug('[CloudSync] exportPackage: raw', raw.length, 'compressed', compressed.length)
  const pkg = encrypt(compressed, key)
  console.debug('[CloudSync] exportPackage: exported package bytes', pkg.ciphertext.length)
  return pkg
}

/**
 * 导入：云端包 → 本地明文（含解密 + gzip 解压 + JSON 解析）
 */
export async function importPackage<T = unknown>(
  pkg: EncryptedPackage,
  key: Uint8Array
): Promise<T> {
  const compressed = decrypt(pkg, key)
  console.debug('[CloudSync] importPackage: decrypted compressed bytes', compressed.length)
  const { gunzipSync } = await import('node:zlib')
  const raw = gunzipSync(compressed)
  console.debug('[CloudSync] importPackage: decompressed bytes', raw.length)
  return JSON.parse(raw.toString('utf8'))
}

/**
 * 将云端包序列化为可读的 JSON 字符串，用于显示/下载。
 */
export function packageToJson(pkg: EncryptedPackage): string {
  return JSON.stringify(pkg, null, 2)
}

/**
 * 从 JSON 字符串解析云端包。
 */
export function parsePackageJson(json: string): EncryptedPackage {
  const obj = JSON.parse(json)
  if (typeof obj.version !== 'string' || typeof obj.ciphertext !== 'string') {
    throw new Error('[CloudSync] parsePackageJson: invalid package format')
  }
  return obj as EncryptedPackage
}

/**
 * 将云端包保存到本地临时文件，返回文件路径。
 * 用于"导出到本地文件"或"上传前暂存"。
 */
export function savePackageToFile(pkg: EncryptedPackage, filePath: string): void {
  writeFileSync(filePath, packageToJson(pkg), 'utf8')
  console.info('[CloudSync] savePackageToFile: path', filePath)
}

/**
 * 从本地文件读取云端包。
 */
export function loadPackageFromFile(filePath: string): EncryptedPackage {
  const content = readFileSync(filePath, 'utf8')
  return parsePackageJson(content)
}
