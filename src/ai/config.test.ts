import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AI_MODEL,
  AI_NOT_CONFIGURED,
  ANTHROPIC_KEY_VAR,
  anthropicApiKey,
  isAiConfigured,
} from './config'
import { askForJson } from './client'
import { discoveryQuestionsSchema } from './schemas'

/**
 * The unconfigured case, which is the one that ships.
 *
 * A church running Fold without an Anthropic key is a supported state, so "no key"
 * has to behave like a value rather than an exception: the four AI sections render
 * with the reason on them and the rest of Pathway keeps working. A throw here would
 * take the whole page to the error boundary.
 */

const original = process.env[ANTHROPIC_KEY_VAR]

beforeEach(() => {
  delete process.env[ANTHROPIC_KEY_VAR]
})

afterEach(() => {
  if (original === undefined) delete process.env[ANTHROPIC_KEY_VAR]
  else process.env[ANTHROPIC_KEY_VAR] = original
})

describe('the key', () => {
  it('is not exposed to the browser', () => {
    // Next inlines anything prefixed `NEXT_PUBLIC_` into the client bundle, and a
    // key in a page's JavaScript is a key anybody can spend.
    expect(ANTHROPIC_KEY_VAR.startsWith('NEXT_PUBLIC_')).toBe(false)
  })

  it('treats an empty variable as absent', () => {
    // Vercel writes empty strings for variables added without a value. Left
    // truthy-checked somewhere this would fail at the API with a 401 rather than
    // here, where the message can explain itself.
    process.env[ANTHROPIC_KEY_VAR] = ''
    expect(anthropicApiKey()).toBeUndefined()
    expect(isAiConfigured()).toBe(false)

    process.env[ANTHROPIC_KEY_VAR] = '   '
    expect(isAiConfigured()).toBe(false)
  })

  it('is read when it is set', () => {
    process.env[ANTHROPIC_KEY_VAR] = 'sk-ant-example'
    expect(anthropicApiKey()).toBe('sk-ant-example')
    expect(isAiConfigured()).toBe(true)
  })

  it('names the model without a date suffix', () => {
    // The alias is complete as it stands; a remembered date suffix 404s.
    expect(AI_MODEL).toBe('claude-opus-5')
  })
})

describe('asking without a key', () => {
  it('returns the reason rather than throwing', async () => {
    // No network call is made, so this test does not need one.
    const call = await askForJson({
      system: 'unused',
      prompt: 'unused',
      schema: discoveryQuestionsSchema,
    })
    expect(call.ok).toBe(false)
    if (call.ok) throw new Error('unreachable')
    expect(call.error).toBe(AI_NOT_CONFIGURED)
  })

  it('tells the reader which variable to set', () => {
    expect(AI_NOT_CONFIGURED).toContain(ANTHROPIC_KEY_VAR)
  })
})
