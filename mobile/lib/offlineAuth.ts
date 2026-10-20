import { secureStorage } from './secureStorage'
import AsyncStorage from '@react-native-async-storage/async-storage'
import bcrypt from 'bcryptjs'

// Lazy-load expo-crypto so missing native module (Expo Go / dev-client without rebuild) doesn't crash.
// Falls back to WebCrypto subtle or pure-JS SHA256 — offline 7-day grace still works.
let Crypto: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-crypto')
  Crypto = mod?.default ?? mod
} catch {
  Crypto = null
}

// bcryptjs needs a CSPRNG for salts: WebCrypto on web, expo-crypto on Hermes.
if (Crypto?.getRandomBytes) {
  bcrypt.setRandomFallback((len: number) =>
    Array.from(Crypto.getRandomBytes(len) as Uint8Array),
  )
}

// Offline secrets are salted bcrypt, not bare SHA-256: on web they fall back
// to localStorage (no Keychain), where a fast unsalted hash is trivially
// brute-forced. Async hash/compare yield to the event loop, so no JS freeze.
const BCRYPT_ROUNDS = 10
const LEGACY_SHA256 = /^[0-9a-f]{64}$/

const hashSecret = (secret: string) => bcrypt.hash(secret, BCRYPT_ROUNDS)

// Returns whether `secret` matches `stored`, and whether `stored` is a legacy
// SHA-256 digest the caller should re-save as bcrypt.
async function verifySecret(
  secret: string,
  legacyInput: string,
  stored: string,
): Promise<{ ok: boolean; upgrade: boolean }> {
  if (LEGACY_SHA256.test(stored)) {
    const ok = (await digestSHA256(legacyInput)) === stored
    return { ok, upgrade: ok }
  }
  try {
    return { ok: await bcrypt.compare(secret, stored), upgrade: false }
  } catch {
    return { ok: false, upgrade: false }
  }
}

async function digestSHA256(input: string): Promise<string> {
  if (Crypto?.digestStringAsync && Crypto?.CryptoDigestAlgorithm?.SHA256) {
    try {
      return await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        input,
      )
    } catch {}
  }
  // WebCrypto fallback (web / modern RN Hermes with crypto.subtle)
  try {
    const g: any = global as any
    const subtle = g.crypto?.subtle ?? (global as any).crypto?.subtle
    if (subtle?.digest) {
      const data = new TextEncoder().encode(input)
      const buf = await subtle.digest('SHA-256', data)
      const arr = Array.from(new Uint8Array(buf))
      return arr.map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {}
  // Pure-JS deterministic fallback — keeps offline login working without native
  // DJB2 expanded to 64 hex chars (consistent, not cryptographically strong but offline-only)
  let h = 5381
  for (let i = 0; i < input.length; i++)
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  const hex = (h >>> 0).toString(16).padStart(8, '0')
  return (hex + hex + hex + hex + hex + hex + hex + hex).slice(0, 64)
}

const OFFLINE_GRACE_DAYS = 7

interface OfflineCredential {
  email: string
  hash: string
  userId: string
  businessId?: string | null
  offlineGraceUntil: number
  createdAt: number
}

// Pre-bcrypt credentials stored SHA256(email+":"+password); kept only to
// verify and upgrade them in place.
const legacyPasswordInput = (password: string, email: string) =>
  `${email.toLowerCase().trim()}:${password}`

export async function cacheOfflineCredential(
  email: string,
  password: string,
  userId: string,
  businessId?: string | null,
) {
  const hash = await hashSecret(password)
  const now = Date.now()
  const cred: OfflineCredential = {
    email: email.toLowerCase().trim(),
    hash,
    userId,
    businessId: businessId || null,
    offlineGraceUntil: now + OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000,
    createdAt: now,
  }
  await secureStorage.setSecure(
    secureStorage.SECURE_KEYS.offlineCred(email),
    JSON.stringify(cred),
  )
  await AsyncStorage.setItem(
    secureStorage.SECURE_KEYS.offlineGrace,
    String(cred.offlineGraceUntil),
  )
  return cred
}

export async function verifyOfflineCredential(
  email: string,
  password: string,
): Promise<OfflineCredential | null> {
  const raw = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.offlineCred(email),
  )
  if (!raw) return null
  try {
    const cred: OfflineCredential = JSON.parse(raw)
    if (Date.now() > cred.offlineGraceUntil) return null
    const { ok, upgrade } = await verifySecret(
      password,
      legacyPasswordInput(password, email),
      cred.hash,
    )
    if (!ok) return null
    if (upgrade) {
      // Keep the original grace window; only the hash format changes.
      const upgraded = { ...cred, hash: await hashSecret(password) }
      await secureStorage.setSecure(
        secureStorage.SECURE_KEYS.offlineCred(email),
        JSON.stringify(upgraded),
      )
      return upgraded
    }
    return cred
  } catch {
    return null
  }
}

export async function getOfflineCredential(
  email: string,
): Promise<OfflineCredential | null> {
  const raw = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.offlineCred(email),
  )
  if (!raw) return null
  try {
    const cred: OfflineCredential = JSON.parse(raw)
    if (Date.now() > cred.offlineGraceUntil) return null
    return cred
  } catch {
    return null
  }
}

export async function hasOfflineCredential(email: string): Promise<boolean> {
  return (await getOfflineCredential(email)) !== null
}

export async function getOfflineGraceDaysLeft(email: string): Promise<number> {
  const raw = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.offlineCred(email),
  )
  if (!raw) return 0
  try {
    const cred: OfflineCredential = JSON.parse(raw)
    const diff = cred.offlineGraceUntil - Date.now()
    return diff > 0 ? Math.ceil(diff / (24 * 60 * 60 * 1000)) : 0
  } catch {
    return 0
  }
}

// PIN + Biometric helpers
export async function setOfflinePin(pin: string) {
  const hash = await hashSecret(pin)
  await secureStorage.setSecure(secureStorage.SECURE_KEYS.pinHash, hash)
}

export async function verifyOfflinePin(pin: string): Promise<boolean> {
  const stored = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.pinHash,
  )
  if (!stored) return false
  const { ok, upgrade } = await verifySecret(pin, pin, stored)
  if (upgrade) await setOfflinePin(pin)
  return ok
}

export async function setBiometricEnabled(enabled: boolean) {
  await secureStorage.setSecure(
    secureStorage.SECURE_KEYS.biometricEnabled,
    enabled ? '1' : '0',
  )
}

export async function isBiometricEnabled(): Promise<boolean> {
  const v = await secureStorage.getSecure(
    secureStorage.SECURE_KEYS.biometricEnabled,
  )
  return v === '1'
}

export function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = global.atob
      ? global.atob(padded)
      : Buffer.from(padded, 'base64').toString()
    const data = JSON.parse(json)
    if (data.exp) return data.exp * 1000
    return null
  } catch {
    return null
  }
}

export function isJwtExpiredOffline(token: string): boolean {
  const exp = decodeJwtExp(token)
  if (!exp) return false
  // Allow 7-day grace even if JWT expired, if offline credential exists
  return Date.now() > exp
}
