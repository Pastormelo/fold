import { describe, expect, it } from 'vitest'

import { isTransactionPooler } from './client'

/**
 * Which pooler a connection string points at decides whether prepared statements
 * are safe, and the two directions fail very differently.
 *
 * Wrong towards "session pooler" and every parameterised query on the transaction
 * pooler hangs until `57014 canceling statement due to statement timeout` — the
 * app appears to lock up. Wrong towards "transaction pooler" and queries merely
 * cost two round trips instead of one. So these cases exist to keep the failure on
 * the recoverable side of that line.
 */
describe('telling the poolers apart', () => {
  const host = 'aws-1-us-west-2.pooler.supabase.com'

  it('recognises the transaction pooler by its port', () => {
    expect(
      isTransactionPooler(`postgres://user:pw@${host}:6543/postgres`)
    ).toBe(true)
  })

  it('recognises the session pooler, which shares the hostname', () => {
    // Only the port differs, which is why this is not read from the host.
    expect(
      isTransactionPooler(`postgres://user:pw@${host}:5432/postgres`)
    ).toBe(false)
  })

  it('treats a direct connection as safe for prepared statements', () => {
    expect(
      isTransactionPooler('postgres://postgres:pw@db.abc.supabase.co:5432/postgres')
    ).toBe(false)
  })

  it('leaves prepared statements on when no port is given', () => {
    // Postgres' default is 5432, and nothing reaches the transaction pooler
    // without asking for 6543 explicitly.
    expect(isTransactionPooler('postgres://user:pw@localhost/fold')).toBe(false)
  })

  it('assumes the transaction pooler when it cannot tell', () => {
    // The safe direction: slow rather than hanging.
    expect(isTransactionPooler('not-a-url')).toBe(true)
    expect(isTransactionPooler('')).toBe(true)
  })

  it('is not fooled by 6543 appearing elsewhere in the string', () => {
    expect(
      isTransactionPooler(`postgres://user:pw6543@${host}:5432/postgres`)
    ).toBe(false)
    expect(
      isTransactionPooler(`postgres://user:pw@${host}:5432/db6543`)
    ).toBe(false)
  })
})
