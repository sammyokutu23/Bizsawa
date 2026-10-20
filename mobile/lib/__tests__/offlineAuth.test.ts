import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// No native expo-crypto under vitest: offlineAuth falls back to WebCrypto.
vi.mock('expo-crypto', () => {
  throw new Error('native module unavailable')
})

const store = new Map<string, string>()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v)
    }),
  },
}))

vi.mock('../secureStorage', () => ({
  secureStorage: {
    SECURE_KEYS: {
      offlineCred: (email: string) => `cred_${email.toLowerCase().trim()}`,
      offlineGrace: 'grace',
      pinHash: 'pin',
    },
    getSecure: vi.fn(async (k: string) => store.get(k) ?? null),
    setSecure: vi.fn(async (k: string, v: string) => {
      store.set(k, v)
    }),
  },
}))

import {
  cacheOfflineCredential,
  setOfflinePin,
  verifyOfflineCredential,
  verifyOfflinePin,
} from '../offlineAuth'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const storedCred = () => JSON.parse(store.get('cred_amina@shop.co.ke')!)

beforeEach(() => {
  store.clear()
})

describe('offline credential', () => {
  it('stores a salted bcrypt hash, never the bare SHA-256', async () => {
    await cacheOfflineCredential('Amina@shop.co.ke', 'hunter22', 'u1')
    const { hash } = storedCred()
    expect(hash).toMatch(/^\$2[aby]\$10\$/)
    expect(hash).not.toBe(sha256('amina@shop.co.ke:hunter22'))
  })

  it('verifies the right password and rejects a wrong one', async () => {
    await cacheOfflineCredential('amina@shop.co.ke', 'hunter22', 'u1')
    expect(
      await verifyOfflineCredential('amina@shop.co.ke', 'hunter22'),
    ).not.toBeNull()
    expect(
      await verifyOfflineCredential('amina@shop.co.ke', 'hunter23'),
    ).toBeNull()
  })

  it('accepts a legacy SHA-256 credential once and upgrades it to bcrypt', async () => {
    const graceUntil = Date.now() + 86_400_000
    store.set(
      'cred_amina@shop.co.ke',
      JSON.stringify({
        email: 'amina@shop.co.ke',
        hash: sha256('amina@shop.co.ke:hunter22'),
        userId: 'u1',
        offlineGraceUntil: graceUntil,
        createdAt: Date.now(),
      }),
    )

    expect(
      await verifyOfflineCredential('amina@shop.co.ke', 'hunter22'),
    ).not.toBeNull()
    const upgraded = storedCred()
    expect(upgraded.hash).toMatch(/^\$2[aby]\$/)
    expect(upgraded.offlineGraceUntil).toBe(graceUntil)
    expect(
      await verifyOfflineCredential('amina@shop.co.ke', 'hunter22'),
    ).not.toBeNull()
  })

  it('does not upgrade a legacy credential on a wrong password', async () => {
    const legacy = sha256('amina@shop.co.ke:hunter22')
    store.set(
      'cred_amina@shop.co.ke',
      JSON.stringify({
        email: 'amina@shop.co.ke',
        hash: legacy,
        userId: 'u1',
        offlineGraceUntil: Date.now() + 1000,
        createdAt: 0,
      }),
    )
    expect(await verifyOfflineCredential('amina@shop.co.ke', 'nope')).toBeNull()
    expect(storedCred().hash).toBe(legacy)
  })
})

describe('offline PIN', () => {
  it('hashes with bcrypt and verifies', async () => {
    await setOfflinePin('4821')
    expect(store.get('pin')).toMatch(/^\$2[aby]\$/)
    expect(await verifyOfflinePin('4821')).toBe(true)
    expect(await verifyOfflinePin('4822')).toBe(false)
  })

  it('upgrades a legacy SHA-256 PIN on successful verify', async () => {
    store.set('pin', sha256('4821'))
    expect(await verifyOfflinePin('4821')).toBe(true)
    expect(store.get('pin')).toMatch(/^\$2[aby]\$/)
  })
})
