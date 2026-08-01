import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import { AI_EFFORT, AI_MODEL, AI_NOT_CONFIGURED, anthropicApiKey } from './config'
import type { OutputSchema } from './schemas'

/**
 * The one place that talks to Anthropic.
 *
 * `server-only`, because the key is read here. Next maps that import to a module
 * that throws if anything in a client bundle reaches it, so an accidental
 * `import` from a `'use client'` component fails at build rather than shipping a
 * key to a browser.
 *
 * Every failure comes back as a value, never as a throw. A pastor clicking
 * "check the draft" on a Sunday afternoon should get a sentence explaining what
 * happened — the key is missing, the API is rate-limited, the model answered
 * something that would not parse — rather than the error boundary. §8.5 also
 * applies in reverse here: an action that reports success must have done
 * something, so a partial or malformed response is a failure, not a shrug.
 *
 * The model is asked for JSON against a schema (structured outputs), so a reply
 * in the wrong shape is refused by the API before it reaches this process. That
 * is the outer guard; `@/domain/ai`'s parsers are the inner one, and they are the
 * only door into the types the rest of the app uses.
 */

export type AiCall<T> =
  | { ok: true; value: T; usage: AiUsage }
  | { ok: false; error: string }

export type AiUsage = {
  inputTokens: number
  outputTokens: number
}

/**
 * Output ceiling. Well under the streaming threshold — these calls return a
 * handful of questions or findings, not a document — so a plain request cannot
 * sit long enough to hit an HTTP timeout.
 */
const MAX_TOKENS = 16_000

/**
 * Built per call rather than kept in a module-level variable.
 *
 * The key can be added to the environment while the process is running (a Vercel
 * env change, a restarted dev server picking up `.env.local`), and a cached
 * client built during the unconfigured window would keep failing afterwards for
 * no visible reason.
 */
function clientFor(apiKey: string): Anthropic {
  return new Anthropic({ apiKey })
}

/**
 * Ask the model a question and get JSON back, or a sentence saying why not.
 *
 * `schema` constrains the reply. `system` carries the church's context and the
 * boundaries; `prompt` is the specific ask.
 */
export async function askForJson(input: {
  system: string
  prompt: string
  schema: OutputSchema
}): Promise<AiCall<unknown>> {
  const apiKey = anthropicApiKey()
  if (apiKey === undefined) return { ok: false, error: AI_NOT_CONFIGURED }

  let response: Anthropic.Message
  try {
    response = await clientFor(apiKey).messages.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      system: input.system,
      // Adaptive: the model decides how much to think per request. Reading a
      // church's answers about its own polity and working out what is missing
      // from them is not a lookup.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: AI_EFFORT,
        format: { type: 'json_schema', schema: input.schema },
      },
      messages: [{ role: 'user', content: input.prompt }],
    })
  } catch (error) {
    return { ok: false, error: describeApiError(error) }
  }

  // Checked before reading content: on a refusal the content array is empty or
  // partial, and indexing into it would throw here instead of explaining itself.
  if (response.stop_reason === 'refusal') {
    return {
      ok: false,
      error:
        'The model declined to answer this one. That is unusual for pathway work — if it keeps happening, the draft may contain something being read as a different kind of request, and it is worth telling somebody rather than retrying.',
    }
  }

  if (response.stop_reason === 'max_tokens') {
    return {
      ok: false,
      error:
        'The answer was cut off before it was complete, so nothing was saved rather than saving half of it. Try again with a smaller section of the draft.',
    }
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')

  if (text.trim() === '') {
    return { ok: false, error: 'The model returned nothing to read.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Should be unreachable: the schema is enforced by the API. Kept because
    // "unreachable" and "cannot happen" are different things, and the honest
    // answer to a broken response is to discard it.
    return {
      ok: false,
      error:
        'The model answered in a shape this could not read, so nothing was saved.',
    }
  }

  return {
    ok: true,
    value: parsed,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  }
}

/**
 * API failures in the words of somebody who is not debugging them.
 *
 * Typed exception classes rather than string-matching messages, so an SDK
 * wording change cannot turn a rate limit into an unknown error.
 */
function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Anthropic rejected the API key. It may have been revoked or copied incompletely.'
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return `That key does not have access to ${AI_MODEL}.`
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Anthropic is rate-limiting this key. Wait a minute and try again — nothing was saved.'
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Could not reach Anthropic. Check the connection and try again.'
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic returned an error (${error.status ?? 'no status'}): ${error.message}`
  }
  return 'Something went wrong talking to Anthropic, and nothing was saved.'
}
