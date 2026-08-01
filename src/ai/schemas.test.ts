import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import {
  ANALYSIS_CONCERNS,
  DISCOVERY_SECTIONS,
  PROVENANCE,
  SEVERITIES,
  aiRecommendationSchema,
  churchProfileEntrySchema,
  discoveryQuestionSchema,
  healthFindingProposalSchema,
  pathwayProposalSchema,
  stageProposalSchema,
} from '@/domain/ai'

import {
  blueprintSchema,
  churchProfileSchema,
  discoveryQuestionsSchema,
  healthFindingsSchema,
  recommendationsSchema,
} from './schemas'

/**
 * The JSON Schemas sent to the model and the zod schemas that validate what comes
 * back describe the same objects, and these tests are what keeps them describing
 * the same objects.
 *
 * The failure this prevents is quiet and bad: add a required field to a zod schema
 * and forget the JSON Schema, and the model is never asked for it, so every
 * response fails validation and the tab appears broken. Do it the other way round
 * and the model returns a field nothing reads.
 *
 * `id` is the one deliberate difference, asserted rather than assumed — the server
 * assigns ids, because an identifier a model invented is one nothing can be joined
 * on.
 */

/** The property names of a JSON Schema object, wherever it is nested. */
function propertiesOf(schema: unknown): string[] {
  const properties = (schema as { properties?: Record<string, unknown> })
    .properties
  return Object.keys(properties ?? {})
}

function itemsOf(schema: unknown, key: string): unknown {
  const properties = (schema as { properties: Record<string, unknown> })
    .properties
  return (properties[key] as { items: unknown }).items
}

function requiredOf(schema: unknown): string[] {
  return (schema as { required: string[] }).required
}

/** A zod object's keys, including through a `.refine()` wrapper. */
function keysOf(schema: z.ZodObject): string[] {
  return Object.keys(schema.shape)
}

describe('every field the model is asked for is required', () => {
  const all = [
    ['discovery questions', discoveryQuestionsSchema],
    ['church profile', churchProfileSchema],
    ['blueprint', blueprintSchema],
    ['health findings', healthFindingsSchema],
    ['recommendations', recommendationsSchema],
  ] as const

  it('lists every property in required, at the top level', () => {
    // An optional field in a model response is one the model omits under
    // pressure, and each of these fields exists because §7 says it cannot be
    // skipped.
    for (const [name, schema] of all) {
      expect(requiredOf(schema).sort(), name).toEqual(propertiesOf(schema).sort())
    }
  })

  it('refuses anything not asked for', () => {
    for (const [name, schema] of all) {
      expect(
        (schema as { additionalProperties: boolean }).additionalProperties,
        name
      ).toBe(false)
    }
  })
})

describe('the JSON Schema matches the zod schema it mirrors', () => {
  it('discovery questions', () => {
    const items = itemsOf(discoveryQuestionsSchema, 'questions')
    expect(propertiesOf(items).sort()).toEqual(
      keysOf(discoveryQuestionSchema).sort()
    )
  })

  it('church profile entries', () => {
    const items = itemsOf(churchProfileSchema, 'entries')
    expect(propertiesOf(items).sort()).toEqual(
      keysOf(churchProfileEntrySchema).sort()
    )
  })

  it('the blueprint, and its stages', () => {
    expect(propertiesOf(blueprintSchema).sort()).toEqual(
      keysOf(pathwayProposalSchema).sort()
    )
    const stages = itemsOf(blueprintSchema, 'stages')
    expect(propertiesOf(stages).sort()).toEqual(
      keysOf(stageProposalSchema).sort()
    )
  })

  it('health findings, minus the field the model may not set', () => {
    const items = itemsOf(healthFindingsSchema, 'findings')
    expect(propertiesOf(items).sort()).toEqual(
      keysOf(healthFindingProposalSchema).sort()
    )
    // Stated as its own assertion: whether a finding blocks publishing is
    // derived from severity by the domain, and a model that could set it could
    // block a church's pathway on its own reasoning.
    expect(propertiesOf(items)).not.toContain('blocksPublishing')
  })

  it('recommendations, minus the id the server assigns', () => {
    const items = itemsOf(recommendationsSchema, 'recommendations')
    expect(propertiesOf(items).sort()).toEqual(
      keysOf(aiRecommendationSchema)
        .filter((key) => key !== 'id')
        .sort()
    )
    expect(propertiesOf(items)).not.toContain('id')
  })
})

describe('the enums offered to the model are the domain’s', () => {
  const enumAt = (schema: unknown, key: string): unknown[] => {
    const properties = (schema as { properties: Record<string, unknown> })
      .properties
    return (properties[key] as { enum: unknown[] }).enum
  }

  it('discovery sections', () => {
    expect(enumAt(itemsOf(discoveryQuestionsSchema, 'questions'), 'section')).toEqual([
      ...DISCOVERY_SECTIONS,
    ])
  })

  it('provenance', () => {
    expect(enumAt(itemsOf(churchProfileSchema, 'entries'), 'provenance')).toEqual([
      ...PROVENANCE,
    ])
  })

  it('analysis concerns and severities', () => {
    const findings = itemsOf(healthFindingsSchema, 'findings')
    expect(enumAt(findings, 'category')).toEqual([...ANALYSIS_CONCERNS])
    expect(enumAt(findings, 'severity')).toEqual([...SEVERITIES])
  })
})
