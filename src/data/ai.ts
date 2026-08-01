import 'server-only'

import { cache } from 'react'

import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm'

import {
  DISCOVERY_SECTIONS,
  type AiRecommendation,
  type ChurchProfileEntry,
  type DiscoveryAnswer,
  type DiscoverySection,
  type RecommendationVerdict,
  discoveryProgress,
  inferenceWarning,
  recommendationsWithVerdicts,
} from '@/domain/ai'
import { type PermissionCheck, permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { AI_NOT_CONFIGURED, isAiConfigured } from '@/ai/config'

import { getViewer } from './viewer'

/**
 * Reading the AI side of the Pathway builder.
 *
 * Every read is scoped by the viewer's own church, resolved here rather than
 * passed in. The gate is evaluated here too and handed to the page as a value, so
 * a section that cannot be used renders with the reason on it (§8.3: the gate and
 * the note come from one evaluation) instead of the page guessing.
 *
 * `recommendationsWithVerdicts` is the domain function that annotates rather than
 * filters — §7 says a rejection stays visible so a future leader can see the
 * finding was considered rather than missed, so there is no query here that hides
 * one.
 */

export type DiscoveryPending = {
  id: string
  section: DiscoverySection
  question: string
  why: string
}

export type DiscoveryAnswered = DiscoveryAnswer & {
  why: string
  answeredByName: string
  /** The label the model saw for this answer, so a citation can be shown. */
  label: string
}

export type DiscoveryView = {
  /** Whether the model is reachable at all, with the reason when it is not. */
  configured: boolean
  configurationNote: string | null
  /** Whether this viewer may run the interview. */
  gate: PermissionCheck
  section: DiscoverySection
  progress: readonly {
    section: DiscoverySection
    answered: number
    current: boolean
  }[]
  pending: readonly DiscoveryPending[]
  answered: readonly DiscoveryAnswered[]
  profile: readonly ChurchProfileEntry[]
  /** §2: what depends on an inference, said out loud. */
  inferenceNote: string | null
}

/**
 * The gate for every AI action on the pathway.
 *
 * `pathway.edit` rather than a permission of its own: running the interview,
 * generating a blueprint and recording a verdict are all ways of changing the
 * draft, and inventing a separate AI permission would let somebody who cannot
 * edit the pathway direct what the pathway says.
 */
export function aiGateFor(viewer: Parameters<typeof permissionCheck>[0]) {
  return permissionCheck(viewer, 'pathway.edit')
}

export const getDiscovery = cache(async (): Promise<DiscoveryView> => {
  const viewer = await getViewer()
  const gate = aiGateFor(viewer)

  const rows = await db
    .select({
      id: schema.discoveryQuestions.id,
      section: schema.discoveryQuestions.section,
      question: schema.discoveryQuestions.question,
      why: schema.discoveryQuestions.why,
      answer: schema.discoveryQuestions.answer,
      answeredAt: schema.discoveryQuestions.answeredAt,
      answeredById: schema.discoveryQuestions.answeredById,
      askedAt: schema.discoveryQuestions.askedAt,
    })
    .from(schema.discoveryQuestions)
    .where(eq(schema.discoveryQuestions.churchId, viewer.churchId))
    .orderBy(asc(schema.discoveryQuestions.askedAt))

  const answerRows = rows.filter(
    (row) => row.answer !== null && row.answeredAt !== null
  )

  const names = await namesFor(
    answerRows
      .map((row) => row.answeredById)
      .filter((id): id is string => id !== null)
  )

  const answered: DiscoveryAnswered[] = answerRows.map((row, index) => ({
    id: row.id,
    section: row.section,
    question: row.question,
    why: row.why,
    answer: row.answer as string,
    answeredAt: row.answeredAt as Date,
    answeredByName: names.get(row.answeredById ?? '') ?? 'Someone',
    // The same labelling `@/ai/pathway` uses, in the same order, so a citation
    // shown on a recommendation names the answer the model actually cited.
    label: `A${index + 1}`,
  }))

  const profileRows = await db
    .select({
      field: schema.churchProfileEntries.field,
      value: schema.churchProfileEntries.value,
      provenance: schema.churchProfileEntries.provenance,
      sourceNote: schema.churchProfileEntries.sourceNote,
    })
    .from(schema.churchProfileEntries)
    .where(eq(schema.churchProfileEntries.churchId, viewer.churchId))
    .orderBy(asc(schema.churchProfileEntries.field))

  const profile: ChurchProfileEntry[] = profileRows.map((row) => ({
    field: row.field,
    value: row.value,
    provenance: row.provenance,
    sourceNote: row.sourceNote ?? undefined,
  }))

  const progress = discoveryProgress(answered)
  const current = progress.find((entry) => entry.current)

  return {
    configured: isAiConfigured(),
    configurationNote: isAiConfigured() ? null : AI_NOT_CONFIGURED,
    gate,
    // Every section answered means the interview is done; park on the last one
    // rather than inventing an eighth.
    section: current?.section ?? DISCOVERY_SECTIONS[DISCOVERY_SECTIONS.length - 1],
    progress,
    pending: rows
      .filter((row) => row.answer === null)
      .map((row) => ({
        id: row.id,
        section: row.section,
        question: row.question,
        why: row.why,
      })),
    answered,
    profile,
    inferenceNote: inferenceWarning(profile),
  }
})

/** The answers in the shape `@/ai/pathway` takes. Answered rows only. */
export const getDiscoveryAnswers = cache(
  async (): Promise<DiscoveryAnswer[]> => {
    const viewer = await getViewer()
    const rows = await db
      .select({
        id: schema.discoveryQuestions.id,
        section: schema.discoveryQuestions.section,
        question: schema.discoveryQuestions.question,
        answer: schema.discoveryQuestions.answer,
        answeredAt: schema.discoveryQuestions.answeredAt,
      })
      .from(schema.discoveryQuestions)
      .where(eq(schema.discoveryQuestions.churchId, viewer.churchId))
      .orderBy(asc(schema.discoveryQuestions.askedAt))

    return rows
      .filter(
        (row): row is typeof row & { answer: string; answeredAt: Date } =>
          row.answer !== null && row.answeredAt !== null
      )
      .map((row) => ({
        id: row.id,
        section: row.section,
        question: row.question,
        answer: row.answer,
        answeredAt: row.answeredAt,
      }))
  }
)

/* ─────────────────────────── Recommendations ─────────────────────────── */

export type RecommendationRow = {
  recommendation: AiRecommendation
  verdict: (RecommendationVerdict & { decidedByName: string }) | null
  open: boolean
  /** The `A1`-style labels for the answers this rests on, for display. */
  citations: readonly string[]
}

export type ReviewView = {
  configured: boolean
  configurationNote: string | null
  gate: PermissionCheck
  rows: readonly RecommendationRow[]
  openCount: number
}

export const getRecommendations = cache(async (): Promise<ReviewView> => {
  const viewer = await getViewer()
  const gate = aiGateFor(viewer)

  const rows = await db
    .select()
    .from(schema.aiRecommendations)
    .where(eq(schema.aiRecommendations.churchId, viewer.churchId))
    .orderBy(desc(schema.aiRecommendations.createdAt))

  const recommendations: AiRecommendation[] = rows.map((row) => ({
    id: row.id,
    noticed: row.noticed,
    whyItMatters: row.whyItMatters,
    consequence: row.consequence,
    options: row.options,
    humanJudgment: row.humanJudgment,
    citedAnswerIds: row.citedAnswerIds,
  }))

  const verdictRows =
    recommendations.length === 0
      ? []
      : await db
          .select()
          .from(schema.recommendationVerdicts)
          .where(
            inArray(
              schema.recommendationVerdicts.recommendationId,
              recommendations.map((entry) => entry.id)
            )
          )

  const names = await namesFor(verdictRows.map((row) => row.decidedById))
  const labels = await labelsForAnswers(viewer.churchId)

  const annotated = recommendationsWithVerdicts(
    recommendations,
    verdictRows.map((row) => ({
      recommendationId: row.recommendationId,
      verdict: row.verdict,
      reason: row.reason,
      decidedById: row.decidedById,
      decidedAt: row.decidedAt,
    }))
  )

  const decorated: RecommendationRow[] = annotated.map((entry) => {
    const row = verdictRows.find(
      (candidate) => candidate.recommendationId === entry.recommendation.id
    )
    return {
      recommendation: entry.recommendation,
      verdict:
        entry.verdict === null || row === undefined
          ? null
          : {
              ...entry.verdict,
              decidedByName: names.get(row.decidedById) ?? 'Someone',
            },
      open: entry.open,
      citations: entry.recommendation.citedAnswerIds.map(
        // A citation whose answer has since gone is shown as unknown rather than
        // silently dropped: the whole point of citations is that a reader can
        // check them, so a broken one has to be visible.
        (id) => labels.get(id) ?? 'an answer no longer on file'
      ),
    }
  })

  return {
    configured: isAiConfigured(),
    configurationNote: isAiConfigured() ? null : AI_NOT_CONFIGURED,
    gate,
    rows: decorated,
    openCount: decorated.filter((row) => row.open).length,
  }
})

/* ──────────────────────────── Audit trail ──────────────────────────── */

export type AuditRow = {
  id: string
  event: string
  actorName: string
  detail: string
  occurredAt: Date
}

/**
 * §7's audit trail. Read newest first and capped — this is a record to consult,
 * not a feed, and a page that renders every prompt a church has ever sent stops
 * being consultable.
 */
export const getAiAudit = cache(async (limit = 25): Promise<AuditRow[]> => {
  const viewer = await getViewer()
  const rows = await db
    .select()
    .from(schema.aiAuditLog)
    .where(eq(schema.aiAuditLog.churchId, viewer.churchId))
    .orderBy(desc(schema.aiAuditLog.occurredAt))
    .limit(limit)

  const names = await namesFor(rows.map((row) => row.actorId))
  return rows.map((row) => ({
    id: row.id,
    event: row.event,
    actorName: names.get(row.actorId) ?? 'Someone',
    detail: row.detail,
    occurredAt: row.occurredAt,
  }))
})

/* ────────────────────────────── Shared ────────────────────────────── */

async function namesFor(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter((id) => id !== '')
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({
      id: schema.people.id,
      firstName: schema.people.firstName,
      lastName: schema.people.lastName,
    })
    .from(schema.people)
    .where(inArray(schema.people.id, unique))
  return new Map(
    rows.map((row) => [row.id, `${row.firstName} ${row.lastName}`])
  )
}

/**
 * Answer id → the `A1` label the prompts use.
 *
 * Unanswered questions are skipped, and the ordering is `askedAt` ascending —
 * both matching `labelAnswers`, because a label that disagreed with the one the
 * model saw would show a reader the wrong answer under a citation, which is worse
 * than showing none.
 */
async function labelsForAnswers(
  churchId: string
): Promise<Map<string, string>> {
  const answered = await db
    .select({ id: schema.discoveryQuestions.id })
    .from(schema.discoveryQuestions)
    .where(
      and(
        eq(schema.discoveryQuestions.churchId, churchId),
        isNotNull(schema.discoveryQuestions.answer)
      )
    )
    .orderBy(asc(schema.discoveryQuestions.askedAt))

  return new Map(answered.map((row, index) => [row.id, `A${index + 1}`]))
}
