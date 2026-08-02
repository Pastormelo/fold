import 'server-only'

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto'

/**
 * Encrypting a third-party token before it goes in the database.
 *
 * A Planning Center token reads a church's entire directory, and unlike the rows
 * beside it, it is a key to *another system* — the confidentiality tiers, the
 * permission checks and the church scoping that protect everything else in this
 * database do not reach into Planning Center. So a database dump should not hand
 * somebody working access to it. AES-256-GCM, which authenticates as well as
 * encrypts: a wrong key fails loudly instead of returning plausible rubbish.
 *
 * **Where the key comes from, and the trade this makes.** Deriving it from
 * `DATABASE_URL` rather than adding an environment variable is what makes the
 * whole feature usable: the point of this change is that an administrator can
 * connect Planning Center from the Setup screen without a terminal, and a
 * mandatory new secret would put the terminal straight back in the way. Set
 * `FOLD_ENCRYPTION_KEY` and it is used instead, which is the better answer for a
 * deployment that can manage one.
 *
 * The cost is real and worth stating: rotating the database password makes stored
 * credentials unreadable. That is recoverable rather than serious — the app says
 * so plainly and asks for the token again, which takes a minute — and it is the
 * reason `decryptSecret` returns `null` on failure rather than throwing.
 *
 * It also means the key lives in the same place as the database credentials, so
 * this does not defend against somebody who has the running environment. It
 * defends against a leaked backup, which is the likelier of the two.
 */

const ALGORITHM = 'aes-256-gcm'

/**
 * A fixed salt.
 *
 * Normally a per-secret random salt is right, because it stops one rainbow table
 * covering every user's password. Here the input is not a password — it is a
 * high-entropy connection string — and the derived key has to be reproducible
 * across processes with nothing else stored, so a constant is correct rather
 * than lazy.
 */
const SALT = 'fold.planning-center.v1'

function keyMaterial(): string {
  const explicit = process.env.FOLD_ENCRYPTION_KEY?.trim()
  if (explicit) return explicit
  const fallback = process.env.DATABASE_URL?.trim()
  if (fallback) return fallback
  throw new Error(
    'Neither FOLD_ENCRYPTION_KEY nor DATABASE_URL is set, so a stored credential cannot be encrypted.'
  )
}

function key(): Buffer {
  return scryptSync(keyMaterial(), SALT, 32)
}

/** `iv:tag:ciphertext`, all base64. One column, no schema for the envelope. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

/**
 * `null` when it cannot be read, rather than a throw.
 *
 * The realistic cause is a rotated database password, and the useful response to
 * that is a screen saying "enter the token again" — not an error boundary on the
 * Setup page, which would take out role management and the tier overview along
 * with it.
 */
export function decryptSecret(stored: string): string | null {
  const parts = stored.split(':')
  if (parts.length !== 3) return null
  const [iv, tag, payload] = parts
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key(),
      Buffer.from(iv!, 'base64')
    )
    decipher.setAuthTag(Buffer.from(tag!, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(payload!, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

/**
 * The last four characters, for showing which token is stored.
 *
 * So an administrator can tell whether the thing in the database is the token
 * they think it is without the app ever sending the token back to a browser.
 */
export function secretHint(plaintext: string): string {
  return plaintext.length <= 4 ? '••••' : `••••${plaintext.slice(-4)}`
}
