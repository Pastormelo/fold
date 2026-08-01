/**
 * AI behaviour and guardrails — HANDOFF.md §7, build order §11 step 7.
 *
 * Three rules do the work here.
 *
 * **Malformed output never reaches pathway configuration.** Every shape the AI
 * can produce has a schema, and the only way to obtain one of these types is
 * through a parser that returns errors rather than throwing them at a caller
 * mid-write. There is no cast anywhere in this module.
 *
 * **A recommendation carries five parts, and the fifth is not optional.** What it
 * noticed, why it matters, the consequence, the options, and *which part is the
 * church's judgment rather than the AI's*. `humanJudgment` is a required
 * non-empty string, so a recommendation that omits it fails to parse.
 *
 * **Reasoning cites the church's own answers, not general best practice.** A
 * recommendation with no citations is invalid, and one citing an answer the
 * church never gave is invalid too — the difference between "add a membership
 * interview" and "because your polity requires elder approval…".
 *
 * What is deliberately absent: any function that lets the AI act. §7's must-not
 * list is enforced by `aiMayPerform` refusing, not by nothing having been built
 * yet.
 */

import { z } from 'zod'

/* ─────────────────────── What the AI may and may not do ─────────────────────── */

/** §7: the AI may do these. */
export const AI_MAY = [
  'ask_questions',
  'summarise_answers',
  'identify_concerns',
  'propose_stages',
  'propose_milestones',
  'draft_communications',
  'recommend_assignments',
  'analyse_capacity',
  'generate_documentation',
] as const

/**
 * §7: the AI must not do these, and the reasons are not interchangeable — each
 * one is refused for its own reason, because a generic denial teaches a reader
 * nothing about where the boundary is.
 */
export const AI_MUST_NOT = {
  publish_pathway:
    'Publishing is a human act. The AI can prepare a version; a person approves and publishes it.',
  change_active_pathway:
    'The active pathway is what the church is living. The AI proposes changes to a draft, never to what is running.',
  decide_membership:
    'Membership is decided by the church, not computed. The AI can prepare the question.',
  decide_theology:
    'Theological conclusions belong to the elders. The AI can lay out what the church has already said.',
  classify_pastoral_risk:
    'The AI does not label a person a risk. A leader who knows them decides what a situation is.',
  assign_confidential_case:
    'Who carries a confidential case is an elder decision, made by name.',
  invent_denominational_requirement:
    'The AI does not supply requirements the church did not state. If a polity rule is missing, it asks.',
  claim_spiritual_authority:
    'A recommendation is advice. It is never presented as spiritual authority, and it always says which part is the church’s judgment.',
} as const

export type AiCapability = (typeof AI_MAY)[number]
export type ForbiddenAiAction = keyof typeof AI_MUST_NOT

export type AiActionCheck =
  | { allowed: true; capability: AiCapability }
  | { allowed: false; refusal: string }

/**
 * Whether the AI may take an action.
 *
 * Unknown actions are refused rather than allowed. An action nobody has
 * classified is one nobody has thought about, and the safe answer for a system
 * writing to pastoral records is no.
 */
export function aiMayPerform(action: string): AiActionCheck {
  if ((AI_MAY as readonly string[]).includes(action)) {
    return { allowed: true, capability: action as AiCapability }
  }
  if (action in AI_MUST_NOT) {
    return { allowed: false, refusal: AI_MUST_NOT[action as ForbiddenAiAction] }
  }
  return {
    allowed: false,
    refusal: `“${action}” is not something the AI has been cleared to do. Add it to AI_MAY deliberately, or leave it to a person.`,
  }
}

/* ──────────────────────────── Parsing, once ──────────────────────────── */

export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; errors: readonly string[] }

/**
 * The only door into every type below.
 *
 * §7: "Validate before persisting. Malformed AI output must never reach pathway
 * configuration." Returning errors rather than throwing keeps a bad model
 * response from becoming an exception halfway through a write.
 */
function parseWith<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  const result = schema.safeParse(raw)
  if (result.success) return { ok: true, value: result.data }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.join('.')
      return path === '' ? issue.message : `${path}: ${issue.message}`
    }),
  }
}

/**
 * A non-empty string, trimmed.
 *
 * The message is attached to both the type error and the length error, so an
 * omitted field and a blank one report the same sentence. Otherwise a missing
 * field falls back to zod's "expected string, received undefined", and whoever
 * reads the log loses the part that explains *why* the field matters.
 *
 * Trimming first means padding a required field with spaces is the same as
 * leaving it out.
 */
const required = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)

/* ───────────────────────────── Discovery ───────────────────────────── */

/** §2: seven sections, resumable. */
export const DISCOVERY_SECTIONS = [
  'church_and_context',
  'what_happens_now',
  'membership_and_theology',
  'people_and_capacity',
  'discipleship',
  'communication',
  'review_and_governance',
] as const

export type DiscoverySection = (typeof DISCOVERY_SECTIONS)[number]

export const discoveryAnswerSchema = z.object({
  id: required('An answer id'),
  section: z.enum(DISCOVERY_SECTIONS),
  question: required('The question'),
  answer: required('The answer'),
  answeredAt: z.coerce.date(),
})

export type DiscoveryAnswer = z.infer<typeof discoveryAnswerSchema>

export function parseDiscoveryAnswer(
  raw: unknown
): ParseResult<DiscoveryAnswer> {
  return parseWith(discoveryAnswerSchema, raw)
}

/**
 * A question the AI wants to ask.
 *
 * `why` is required for the same reason `humanJudgment` is required on a
 * recommendation: a church being interviewed about its own polity is entitled to
 * know what a question is for before answering it. A question with no stated
 * purpose reads as a form to complete rather than a conversation, and the
 * answers get worse.
 *
 * The id is assigned by whoever stores the question, not by the model — an
 * identifier a model invented is one nothing can be joined on reliably.
 */
export const discoveryQuestionSchema = z.object({
  section: z.enum(DISCOVERY_SECTIONS),
  question: required('The question'),
  why: required('Why this is being asked'),
})

export type DiscoveryQuestion = z.infer<typeof discoveryQuestionSchema>

export function parseDiscoveryQuestion(
  raw: unknown
): ParseResult<DiscoveryQuestion> {
  return parseWith(discoveryQuestionSchema, raw)
}

/** Where a discovery session has got to. Derived, never stored. */
export function discoveryProgress(answers: readonly DiscoveryAnswer[]): {
  section: DiscoverySection
  answered: number
  /** The section the interview should be working on now. */
  current: boolean
}[] {
  const firstUnfinished = DISCOVERY_SECTIONS.find(
    (section) => !answers.some((answer) => answer.section === section)
  )
  return DISCOVERY_SECTIONS.map((section) => ({
    section,
    answered: answers.filter((answer) => answer.section === section).length,
    current: section === firstUnfinished,
  }))
}

/* ─────────────────────────── Church profile ─────────────────────────── */

export const PROVENANCE = ['confirmed', 'imported', 'inferred'] as const
export type Provenance = (typeof PROVENANCE)[number]

/**
 * §2: every field carries a provenance, and **an inference is never treated as
 * policy**. An inferred entry must say what it was inferred from, so a reader can
 * judge it rather than take it.
 */
export const churchProfileEntrySchema = z
  .object({
    field: required('A profile field name'),
    value: required('A profile value'),
    provenance: z.enum(PROVENANCE),
    sourceNote: z.string().trim().optional(),
  })
  .refine(
    (entry) =>
      entry.provenance === 'confirmed' ||
      (entry.sourceNote !== undefined && entry.sourceNote.length > 0),
    {
      message:
        'An imported or inferred value must say where it came from. An inference nobody can trace is treated as fact by the next reader.',
      path: ['sourceNote'],
    }
  )

export type ChurchProfileEntry = z.infer<typeof churchProfileEntrySchema>

export function parseChurchProfileEntry(
  raw: unknown
): ParseResult<ChurchProfileEntry> {
  return parseWith(churchProfileEntrySchema, raw)
}

/** §2: an inference is never policy. Anything depending on one says so. */
export function isPolicyGrade(entry: ChurchProfileEntry): boolean {
  return entry.provenance !== 'inferred'
}

export function inferenceWarning(
  entries: readonly ChurchProfileEntry[]
): string | null {
  const inferred = entries.filter((entry) => entry.provenance === 'inferred')
  if (inferred.length === 0) return null
  const fields = inferred.map((entry) => entry.field).join(', ')
  return inferred.length === 1
    ? `This depends on 1 inferred value (${fields}), which is not confirmed policy.`
    : `This depends on ${inferred.length} inferred values (${fields}), which are not confirmed policy.`
}

/* ────────────────────────── Recommendations ────────────────────────── */

/**
 * §7's five parts. The fifth is a required field rather than a convention,
 * because the whole point of it is that it cannot be skipped when a
 * recommendation is in a hurry.
 */
export const aiRecommendationSchema = z.object({
  id: required('A recommendation id'),
  noticed: required('What the AI noticed'),
  whyItMatters: required('Why it matters'),
  consequence: required('The consequence if nothing changes'),
  options: z
    .array(required('An option'))
    .min(1, 'A recommendation offers at least one possible response'),
  humanJudgment: required(
    'Which part is the church’s judgment rather than the AI’s'
  ),
  /**
   * Discovery answer ids this reasoning rests on. §7: reasoning cites the
   * church's own answers, not general best practice — so an empty list is not a
   * valid recommendation.
   */
  citedAnswerIds: z
    .array(required('An answer id'))
    .min(
      1,
      'Reasoning must cite the church’s own answers. A recommendation resting on general best practice is not usable here.'
    ),
})

export type AiRecommendation = z.infer<typeof aiRecommendationSchema>

export function parseRecommendation(
  raw: unknown
): ParseResult<AiRecommendation> {
  return parseWith(aiRecommendationSchema, raw)
}

/**
 * A citation naming an answer the church never gave.
 *
 * Schema validation cannot catch this, because whether an id exists is a fact
 * about the session rather than about the shape. Left uncaught it is the worse
 * failure of the two: a recommendation that *looks* grounded.
 */
export function danglingCitations(
  recommendation: AiRecommendation,
  knownAnswerIds: readonly string[]
): string[] {
  return recommendation.citedAnswerIds.filter(
    (id) => !knownAnswerIds.includes(id)
  )
}

export function validateRecommendationAgainstSession(
  recommendation: AiRecommendation,
  knownAnswerIds: readonly string[]
): ParseResult<AiRecommendation> {
  const dangling = danglingCitations(recommendation, knownAnswerIds)
  if (dangling.length > 0) {
    return {
      ok: false,
      errors: [
        `Cites ${dangling.length === 1 ? 'an answer' : 'answers'} the church never gave: ${dangling.join(', ')}.`,
      ],
    }
  }
  return { ok: true, value: recommendation }
}

/* ───────────────────────────── Verdicts ───────────────────────────── */

export const VERDICTS = ['accepted', 'modified', 'saved', 'rejected'] as const
export type Verdict = (typeof VERDICTS)[number]

/**
 * §7: every recommendation supports accept, modify, save for later, and reject
 * with a documented reason — and §2 puts a reason on each of them, not only the
 * rejection. A verdict recorded with no reason tells a future reader that
 * something was decided without telling them why.
 */
export const recommendationVerdictSchema = z.object({
  recommendationId: required('A recommendation id'),
  verdict: z.enum(VERDICTS),
  reason: required('A reason for the verdict'),
  decidedById: required('The person who decided'),
  decidedAt: z.coerce.date(),
})

export type RecommendationVerdict = z.infer<typeof recommendationVerdictSchema>

export function parseVerdict(raw: unknown): ParseResult<RecommendationVerdict> {
  return parseWith(recommendationVerdictSchema, raw)
}

/**
 * §7: "Rejections stay visible so a future leader can see the finding was
 * considered rather than missed."
 *
 * So this returns every recommendation with its verdict attached, rejections
 * included. There is no filter that hides them, which is why the function is
 * shaped as "all of them, annotated" rather than "the open ones".
 */
export function recommendationsWithVerdicts(
  recommendations: readonly AiRecommendation[],
  verdicts: readonly RecommendationVerdict[]
): {
  recommendation: AiRecommendation
  verdict: RecommendationVerdict | null
  /** Still needing a decision. */
  open: boolean
}[] {
  return recommendations.map((recommendation) => {
    const verdict =
      verdicts.find(
        (candidate) => candidate.recommendationId === recommendation.id
      ) ?? null
    return {
      recommendation,
      verdict,
      open: verdict === null || verdict.verdict === 'saved',
    }
  })
}

/* ─────────────────────── Import and improve ─────────────────────── */

/** §7's list of what analysis looks for. */
export const ANALYSIS_CONCERNS = [
  'missing_outcome',
  'redundant_stage',
  'unnecessary_friction',
  'unclear_ownership',
  'contradictory_rules',
  'theological_inconsistency',
  'absent_stopping_rule',
  'scalability_limit',
  'excessive_pastoral_dependency',
  'weak_post_membership_connection',
  'absent_disciple_making',
  'privacy_risk',
] as const

export type AnalysisConcern = (typeof ANALYSIS_CONCERNS)[number]

/**
 * §7: "Analysis quotes the line it came from."
 *
 * `quotedLine` is required, which makes an unquotable observation unrepresentable.
 * A finding a church cannot trace back to its own document is one they have no
 * way to check.
 */
export const importFindingSchema = z.object({
  concern: z.enum(ANALYSIS_CONCERNS),
  quotedLine: required(
    'The line from the church’s own document that this came from'
  ),
  noticed: required('What the AI noticed'),
  whyItMatters: required('Why it matters'),
  humanJudgment: required('Which part is the church’s judgment'),
})

export type ImportFinding = z.infer<typeof importFindingSchema>

export function parseImportFinding(raw: unknown): ParseResult<ImportFinding> {
  return parseWith(importFindingSchema, raw)
}

/**
 * §7: "Analysis never modifies the active pathway."
 *
 * Stated as a function rather than a comment so a caller has something to check,
 * and so the refusal reads the same way everywhere.
 */
export function analysisMayModify(): AiActionCheck {
  return aiMayPerform('change_active_pathway')
}

/* ────────────────────────── Health findings ────────────────────────── */

export const SEVERITIES = ['low', 'medium', 'high'] as const
export type Severity = (typeof SEVERITIES)[number]

/**
 * A finding about the church's *own draft*, in the shape a health check returns.
 *
 * Note what is not in here: `blocksPublishing`. Whether a finding stands between
 * a church and publishing is a rule, not an opinion, so it is derived below from
 * severity rather than being a field the model fills in. A model that could set
 * it would be a model that can block a church's pathway on its own reasoning,
 * and §7 puts that decision on the other side of the line.
 *
 * `evidence` is required and must quote the draft, for the same reason
 * `quotedLine` is required on an import finding: a finding a church cannot trace
 * back to its own words is one they have no way to check.
 */
export const healthFindingProposalSchema = z.object({
  category: z.enum(ANALYSIS_CONCERNS),
  severity: z.enum(SEVERITIES),
  evidence: required('The part of the draft this came from'),
  why: required('Why it matters'),
  options: z
    .array(required('An option'))
    .min(1, 'A finding offers at least one possible response'),
  humanJudgment: required('Which part is the church’s judgment'),
})

export type HealthFindingProposal = z.infer<typeof healthFindingProposalSchema>

export function parseHealthFindingProposal(
  raw: unknown
): ParseResult<HealthFindingProposal> {
  return parseWith(healthFindingProposalSchema, raw)
}

/**
 * Which findings stand in the way of publishing.
 *
 * One line, and it is the whole rule: high severity blocks, everything else is
 * advice. It lives here so it is inspectable and tested rather than being a
 * value a model chose, and §4 still lets a church publish past it by
 * acknowledging it with a reason.
 */
export function blocksPublishing(severity: Severity): boolean {
  return severity === 'high'
}

/* ─────────────────────────── Proposals ─────────────────────────── */

/**
 * A stage the AI proposes. Deliberately thinner than an editable stage: a
 * proposal is a suggestion for a person to shape, and pretending otherwise would
 * invite it being written straight through.
 */
export const stageProposalSchema = z.object({
  name: required('A stage name'),
  purpose: required('The purpose of the stage'),
  outcome: required('What the stage should produce'),
  ownerRole: required('Who owns the stage'),
  /** §7 again: proposals rest on the church's answers. */
  citedAnswerIds: z
    .array(required('An answer id'))
    .min(1, 'A proposed stage must rest on something the church said'),
})

export type StageProposal = z.infer<typeof stageProposalSchema>

export const pathwayProposalSchema = z.object({
  internalName: required('An internal name'),
  publicName: required('A public name'),
  philosophy: required('The philosophy behind the pathway'),
  stages: z
    .array(stageProposalSchema)
    .min(1, 'A pathway proposal needs at least one stage'),
})

export type PathwayProposal = z.infer<typeof pathwayProposalSchema>

export function parsePathwayProposal(
  raw: unknown
): ParseResult<PathwayProposal> {
  return parseWith(pathwayProposalSchema, raw)
}

export const milestoneProposalSchema = z.object({
  name: required('A milestone name'),
  stageName: required('The stage it belongs to'),
  recordedBy: required('Who records it'),
})

export type MilestoneProposal = z.infer<typeof milestoneProposalSchema>

export function parseMilestoneProposal(
  raw: unknown
): ParseResult<MilestoneProposal> {
  return parseWith(milestoneProposalSchema, raw)
}

export const communicationPlanSchema = z.object({
  audience: required('Who the communication is for'),
  channel: required('How it reaches them'),
  message: required('The message'),
  /** Drafting is allowed; sending is a person's act. */
  requiresHumanSend: z.literal(true),
})

export type CommunicationPlan = z.infer<typeof communicationPlanSchema>

export function parseCommunicationPlan(
  raw: unknown
): ParseResult<CommunicationPlan> {
  return parseWith(communicationPlanSchema, raw)
}

export const implementationStepSchema = z.object({
  title: required('A step title'),
  ownerRole: required('Who does it'),
  /** Notes what a person must decide before this step can happen. */
  humanDecisionNeeded: z.string().trim().optional(),
})

export const implementationPlanSchema = z.object({
  steps: z
    .array(implementationStepSchema)
    .min(1, 'An implementation plan needs at least one step'),
})

export type ImplementationPlan = z.infer<typeof implementationPlanSchema>

export function parseImplementationPlan(
  raw: unknown
): ParseResult<ImplementationPlan> {
  return parseWith(implementationPlanSchema, raw)
}

/* ──────────────────────────── Audit trail ──────────────────────────── */

export const AUDITED_AI_EVENTS = [
  'prompt_sent',
  'recommendation_made',
  'verdict_recorded',
  'manual_edit',
  'publication_decision',
] as const

export type AuditedAiEvent = (typeof AUDITED_AI_EVENTS)[number]

/**
 * §7: "Maintain an audit trail of prompts, significant recommendations, accepted
 * and rejected verdicts with reasons, manual edits, and publication decisions."
 *
 * `actorId` is a person even for a model-generated event — the person on whose
 * behalf it ran. A row attributed to "the AI" answers nobody's question later.
 */
export const aiAuditEntrySchema = z.object({
  event: z.enum(AUDITED_AI_EVENTS),
  actorId: required('The person this was done for or by'),
  occurredAt: z.coerce.date(),
  detail: required('What happened'),
})

export type AiAuditEntry = z.infer<typeof aiAuditEntrySchema>

export function parseAuditEntry(raw: unknown): ParseResult<AiAuditEntry> {
  return parseWith(aiAuditEntrySchema, raw)
}
