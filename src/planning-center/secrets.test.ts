import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { decryptSecret, encryptSecret, secretHint } from './secrets'

const original = process.env.FOLD_ENCRYPTION_KEY
const originalDb = process.env.DATABASE_URL

beforeEach(() => {
  process.env.FOLD_ENCRYPTION_KEY = 'a-test-key'
})

afterEach(() => {
  if (original === undefined) delete process.env.FOLD_ENCRYPTION_KEY
  else process.env.FOLD_ENCRYPTION_KEY = original
  if (originalDb === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalDb
})

describe('storing a third-party token', () => {
  it('round-trips', () => {
    const stored = encryptSecret('pco_secret_value')
    expect(decryptSecret(stored)).toBe('pco_secret_value')
  })

  it('does not store the token in readable form', () => {
    // The whole point: a database dump should not hand somebody working access
    // to another system.
    const stored = encryptSecret('pco_secret_value')
    expect(stored).not.toContain('pco_secret_value')
  })

  it('produces a different ciphertext each time', () => {
    // A fresh IV per encryption, so two churches storing the same token do not
    // produce the same row, and neither does one church re-saving it.
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  it('returns null rather than rubbish when the key has changed', () => {
    // The realistic cause is a rotated database password. AES-GCM authenticates,
    // so this fails loudly rather than decrypting to plausible nonsense.
    const stored = encryptSecret('pco_secret_value')
    process.env.FOLD_ENCRYPTION_KEY = 'a-different-key'
    expect(decryptSecret(stored)).toBeNull()
  })

  it('returns null on a tampered value', () => {
    const stored = encryptSecret('pco_secret_value')
    const [iv, tag, payload] = stored.split(':')
    const flipped = `${iv}:${tag}:${Buffer.from('not the payload').toString('base64')}`
    expect(decryptSecret(flipped)).toBeNull()
    expect(decryptSecret('nonsense')).toBeNull()
    void payload
  })

  it('falls back to the database URL when no key is set', () => {
    // What makes the feature usable without a terminal: no new environment
    // variable is required to connect Planning Center from the Setup screen.
    delete process.env.FOLD_ENCRYPTION_KEY
    process.env.DATABASE_URL = 'postgresql://user:pw@host:5432/db'
    const stored = encryptSecret('pco_secret_value')
    expect(decryptSecret(stored)).toBe('pco_secret_value')
  })

  it('cannot read a value encrypted under the other key source', () => {
    // Stated so the trade is visible: switching key source, or rotating the
    // database password, means re-entering the token.
    const stored = encryptSecret('pco_secret_value')
    delete process.env.FOLD_ENCRYPTION_KEY
    process.env.DATABASE_URL = 'postgresql://user:pw@host:5432/db'
    expect(decryptSecret(stored)).toBeNull()
  })
})

describe('the hint shown on screen', () => {
  it('shows the last four characters and nothing else', () => {
    expect(secretHint('pco_secret_abcd')).toBe('••••abcd')
  })

  it('shows nothing at all for a very short value', () => {
    expect(secretHint('ab')).toBe('••••')
  })
})
