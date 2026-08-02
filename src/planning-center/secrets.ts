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
 * The cost is bigger than "rotating the password breaks it", which is how this was
 * first described, and the difference matters. The key is a function of the whole
 * connection string, so a credential stored by one environment cannot be read by
 * another whose `DATABASE_URL` differs in any way — and they do differ here on
 * purpose: production uses Supabase's transaction pooler on 6543 and local work
 * uses the session pooler on 5432. Each environment can read what it wrote and not
 * what the other did. A pooler hostname changing on Supabase's side would have the
 * same effect.
 *
 * **So set `FOLD_ENCRYPTION_KEY` on any deployment you intend to keep.** It costs
 * one environment variable, set once by the same person who sets the OAuth client
 * id, and it makes the key independent of how the database happens to be reached.
 * The fallback exists so the feature works before anyone has done that, not because
 * it is the better arrangement.
 *
 * Either way the failure is recoverable rather than serious: `decryptSecret`
 * returns `null` rather than throwing, `credentialStatus` reports an `unreadable`
 * state, and the screen asks for the connection again.
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
 * The realistic causes are a rotated database password and a credential stored by
 * a different environment, and the useful response to both is a screen saying
 * "connect again" — not an error boundary on the Setup page, which would take out
 * role management and the tier overview along with it.
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
