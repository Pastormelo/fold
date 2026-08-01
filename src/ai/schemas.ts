/**
 * The JSON Schemas the model is constrained to answer in.
 *
 * These are the *outer* guard. The Anthropic API enforces the shape of the reply
 * against these, which stops a malformed response existing at all; then every
 * response still goes through the matching parser in `@/domain/ai` before it is
 * allowed near a pathway (§7: "Malformed AI output must never reach pathway
 * configuration"). Two layers, because the API guarantees the shape and only the
 * domain knows the rules — that a recommendation without `humanJudgment` is not
 * a recommendation, that a citation must name an answer the church actually gave.
 *
 * Written by hand rather than generated from the zod schemas, because structured
 * outputs support a subset of JSON Schema: `minLength`, `minItems` and
 * `.refine()` predicates have no representation, and generating would silently
 * emit keywords the API rejects. `schemas.test.ts` asserts every property here
 * matches the zod object it mirrors, so the two cannot drift apart.
 *
 * Every schema sets `additionalProperties: false` and lists every property as
 * required — an optional field in a model response is one the model will omit
 * under pressure, and each of these fields exists precisely because §7 says it
 * cannot be skipped.
 *
 * Ids are absent everywhere on purpose. An identifier a model invented is one
 * nothing can be joined on; the server assigns them.
 */

import {
  ANALYSIS_CONCERNS,
  DISCOVERY_SECTIONS,
  PROVENANCE,
  SEVERITIES,
} from '@/domain/ai'

/** A JSON Schema object, only as much of one as these schemas use. */
export type OutputSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
  additionalProperties: false
}

const strings = (description: string) => ({
  type: 'array' as const,
  items: { type: 'string' as const },
  description,
})

/**
 * An object with every property required, which is the only kind used here.
 *
 * Derives `required` from the properties rather than repeating them, so adding a
 * field cannot leave it optional by omission.
 */
function object(properties: Record<string, unknown>): OutputSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

/* ───────────────────────────── Discovery ───────────────────────────── */

export const discoveryQuestionsSchema = object({
  questions: {
    type: 'array',
    description:
      'The questions to ask next. Three to five. Fewer if the section is nearly done.',
    items: object({
      section: {
        type: 'string',
        enum: [...DISCOVERY_SECTIONS],
        description: 'Which section of the interview this belongs to.',
      },
      question: {
        type: 'string',
        description:
          'The question, in plain language a church leader would use rather than church-systems jargon.',
      },
      why: {
        type: 'string',
        description:
          'Why you are asking, in one sentence. The church is entitled to know what a question is for before answering it.',
      },
    }),
  },
})

/**
 * Facts the interview established, each with where it came from.
 *
 * §2: an inference is never treated as policy. `provenance` and `sourceNote` are
 * both required so a reader can judge an inferred value instead of taking it.
 */
export const churchProfileSchema = object({
  entries: {
    type: 'array',
    description: 'What the answers establish. Omit anything not yet said.',
    items: object({
      field: {
        type: 'string',
        description:
          'A short snake_case name for the fact, e.g. membership_requires_interview.',
      },
      value: { type: 'string', description: 'What the church said it is.' },
      provenance: {
        type: 'string',
        enum: [...PROVENANCE],
        description:
          '"confirmed" only when the church stated this outright. "inferred" when you concluded it from something adjacent — that is not policy and will be shown as not policy.',
      },
      sourceNote: {
        type: 'string',
        description:
          'For an imported or inferred value, what it was inferred from. Empty string when confirmed.',
      },
    }),
  },
})

/* ───────────────────────────── Blueprint ───────────────────────────── */

export const blueprintSchema = object({
  internalName: {
    type: 'string',
    description: 'What the staff would call this pathway.',
  },
  publicName: {
    type: 'string',
    description:
      'What a guest is told it is called, which is usually gentler than the internal name.',
  },
  philosophy: {
    type: 'string',
    description:
      'The thinking behind the shape, in the church’s own terms, referring to what they told you.',
  },
  stages: {
    type: 'array',
    description:
      'The stages, in order. As many as the church’s answers support and no more.',
    items: object({
      name: { type: 'string', description: 'The internal stage name.' },
      purpose: { type: 'string', description: 'Why the stage exists at all.' },
      outcome: {
        type: 'string',
        description: 'What is different about the person afterwards.',
      },
      ownerRole: {
        type: 'string',
        description:
          'Which job carries it. A stage nobody owns does not happen, so never answer "the team" or "everyone".',
      },
      citedAnswerIds: strings(
        'The ids of the church’s own answers this stage rests on. Never empty — a stage resting on general best practice is not usable here.'
      ),
    }),
  },
})

/* ──────────────────────────── Health check ──────────────────────────── */

export const healthFindingsSchema = object({
  findings: {
    type: 'array',
    description:
      'What is wrong or missing in this draft. Empty array if nothing is.',
    items: object({
      category: {
        type: 'string',
        enum: [...ANALYSIS_CONCERNS],
        description: 'Which kind of problem this is.',
      },
      severity: {
        type: 'string',
        enum: [...SEVERITIES],
        description:
          '"high" only for something that will fail a real person — a stage with no owner, follow-up that never stops, a rule contradicting another. Not for polish.',
      },
      evidence: {
        type: 'string',
        description:
          'Quote the part of their draft this came from, or name the stage and field that is empty. A finding they cannot trace to their own words is one they cannot check.',
      },
      why: {
        type: 'string',
        description:
          'Why it matters, in terms of what happens to a person going through this pathway.',
      },
      options: strings(
        'Possible responses. At least one. Options, not instructions.'
      ),
      humanJudgment: {
        type: 'string',
        description:
          'Which part of this is the church’s call rather than yours. Required.',
      },
    }),
  },
})

/* ────────────────────────────── Review ────────────────────────────── */

export const recommendationsSchema = object({
  recommendations: {
    type: 'array',
    description: 'Recommendations, each with all five parts. May be empty.',
    items: object({
      noticed: { type: 'string', description: 'What you noticed.' },
      whyItMatters: { type: 'string', description: 'Why it matters.' },
      consequence: {
        type: 'string',
        description: 'What happens if nothing changes.',
      },
      options: strings('Possible responses. At least one.'),
      humanJudgment: {
        type: 'string',
        description:
          'Which part of this is the church’s judgment rather than yours. Required, and never a throwaway line — it is the part that keeps this advice rather than authority.',
      },
      citedAnswerIds: strings(
        'The ids of the church’s own answers your reasoning rests on. Never empty.'
      ),
    }),
  },
})
