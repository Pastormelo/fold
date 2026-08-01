/**
 * Whether the AI is configured, and what to say when it is not.
 *
 * The key is read from the environment and never from the database, and the
 * variable has no `NEXT_PUBLIC_` prefix — Next inlines anything so prefixed into
 * the browser bundle, and an Anthropic key in a page's JavaScript is a key
 * anybody can spend. `src/ai/client.ts` is the only module that reads it, and it
 * is `server-only`.
 *
 * `null` rather than a throw for the absent case, because "no AI key yet" is a
 * real state this app supports. The four AI tabs then render as unavailable with
 * the reason on them, which is §8.4: do not offer a control the action will
 * refuse. The rest of Pathway — the lifecycle, the stages, the diff, the review
 * record, the publish gate — does not depend on a model and keeps working.
 */

/** No public prefix. See above; this is not decoration. */
export const ANTHROPIC_KEY_VAR = 'ANTHROPIC_API_KEY'

/**
 * The model, named once.
 *
 * Opus rather than a cheaper tier: this reads a church's own answers about
 * membership, polity and pastoral capacity and has to reason about what is
 * missing from them. Getting that wrong wastes an elders' meeting.
 */
export const AI_MODEL = 'claude-opus-5'

/**
 * How hard the model works. `high` is the API default and what these calls want
 * — a health check that skims is worse than no health check, because it reads as
 * clearance.
 */
export const AI_EFFORT = 'high'

export function anthropicApiKey(): string | undefined {
  const value = process.env[ANTHROPIC_KEY_VAR]
  // An empty variable is not a key. Vercel writes empty strings for variables
  // that were added without a value, and an empty one would otherwise pass a
  // truthiness check somewhere and fail at the API with a 401 instead of here.
  return value && value.trim() !== '' ? value : undefined
}

export function isAiConfigured(): boolean {
  return anthropicApiKey() !== undefined
}

export const AI_NOT_CONFIGURED = `The AI is not configured. Set ${ANTHROPIC_KEY_VAR} in the environment — a key from console.anthropic.com — and these four sections start working. Everything else about the pathway works without it.`

/**
 * The same fact in four words, for a disabled button.
 *
 * The long sentence belongs once, at the top of the section. Repeated beside
 * every control it stops being read, and the paragraph a person does need to read
 * gets lost among the copies of itself.
 */
export const AI_NOT_CONFIGURED_SHORT = 'No API key is configured.'
