'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm'

import {
  type AuditedAiEvent,
  DISCOVERY_SECTIONS,
  VERDICTS,
  type Verdict,
  aiMayPerform,
  blocksPublishing,
  discoveryProgress,
  parseVerdict,
} from '@/domain/ai'
import { permissionCheck } from '@/domain/roles'
import { db, schema } from '@/db/client'
import { getDiscoveryAnswers } from '@/data/ai'
import { getWriter } from '@/data/viewer'
import { AI_NOT_CONFIGURED, isAiConfigured } from '@/ai/config'
import {
  type StageForPrompt,
  askDiscoveryQuestions,
  checkDraftHealth,
  proposePathway,
  reviewDraft,
  summariseIntoProfile,
} from '@/ai/pathway'

/**
 * The AI half of the Pathway builder, as write paths.
 *
 * Four things are true of every action in this file, and they are the reason it
 * is a separate file from `actions.ts` rather than more functions in it.
 *
 * **The model never publishes, and never touches what is live.** Every write here
 * is scoped to the *working* version, found by state and never taken from a form
 * field. `requireDraft` refuses when the only version is active, and the refusal
 * comes from `AI_MUST_NOT` rather than being written again here — §7's boundary is
 * enforced by this code path not existing for the active pathway, not by a comment
 * saying it should not.
 *
 * **Every call is audited before it can matter.** §7 wants prompts, significant
 * recommendations, verdicts, manual edits and publication decisions on the record.
 * A prompt is logged when it is sent, so a call that fails still leaves a trace —
 * otherwise the only AI activity a church could see would be the successful kind.
 *
 * **A failure saves nothing.** Not a partial set of stages, not half a profile.
 * §8.5: an action reporting success must have done something, and its contrapositive
 * is that an action that could not finish must not report success.
 *
 * **The permission is `pathway.edit`.** Directing what the pathway says is editing
 * it. There is no separate "use the AI" permission, because that would let somebody
 * who cannot edit the pathway shape it anyway.
 */

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

/** The working version, or a refusal explaining which case this is. */
async function requireDraft(churchId: string): Promise<
  | { ok: true; pathwayId: string; internalName: string; versionNumber: number }
  | { ok: false; message: string }
> {
  const [working] = await db
    .select({
      id: schema.pathways.id,
      internalName: schema.pathways.internalName,
      versionNumber: schema.pathways.versionNumber,
    })
    .from(schema.pathways)
    .where(
      and(
        eq(schema.pathways.churchId, churchId),
        ne(schema.pathways.state, 'active'),
        ne(schema.pathways.state, 'archived')
      )
    )
    .orderBy(desc(schema.pathways.versionNumber))
    .limit(1)

  if (!working) {
    // Deliberately not offering to create one. §7: the AI proposes changes to a
    // draft, never to what is running, and silently forking the active pathway
    // because a model wanted somewhere to write would be exactly that.
    return {
      ok: false,
      message: `${AI_ACTIVE_REFUSAL} There is no draft to work on — start one, or edit the published version, which forks it into a new draft.`,
    }
  }

  return {
    ok: true,
    pathwayId: working.id,
    internalName: working.internalName,
    versionNumber: working.versionNumber,
  }
}

/** Read out of the domain so the wording is the domain's, not this file's. */
const AI_ACTIVE_REFUSAL = (() => {
  const check = aiMayPerform('change_active_pathway')
  return check.allowed ? '' : check.refusal
})()

/** One audit row. Called before the model, and again after anything is written. */
async function audit(input: {
  churchId: string
  actorId: string
  event: AuditedAiEvent
  detail: string
}): Promise<void> {
  await db.insert(schema.aiAuditLog).values({
    churchId: input.churchId,
    event: input.event,
    actorId: input.actorId,
    detail: input.detail,
  })
}

/** The gate, plus the "is there a key" check, in one place. */
async function ready(): Promise<
  | { ok: true; viewer: Awaited<ReturnType<typeof getWriter>> }
  | { ok: false; message: string }
> {
  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'pathway.edit')
  if (!gate.allowed) return { ok: false, message: gate.note }
  if (!isAiConfigured()) return { ok: false, message: AI_NOT_CONFIGURED }
  return { ok: true, viewer }
}

/* ────────────────────────────── Discovery ────────────────────────────── */

/**
 * Ask the next few questions of the section the interview has reached.
 *
 * Refuses while questions are still outstanding. Two rounds of unanswered
 * questions is a church looking at a wall of forms, which is how discovery stops
 * being an interview.
 */
export async function generateQuestions(): Promise<ActionOutcome> {
  const start = await ready()
  if (!start.ok) return { ok: false, message: start.message }
  const { viewer } = start

  const outstanding = await db
    .select({ id: schema.discoveryQuestions.id })
    .from(schema.discoveryQuestions)
    .where(
      and(
        eq(schema.discoveryQuestions.churchId, viewer.churchId),
        isNull(schema.discoveryQuestions.answer)
      )
    )
  if (outstanding.length > 0) {
    return {
      ok: false,
      message: `There ${outstanding.length === 1 ? 'is' : 'are'} still ${outstanding.length} unanswered ${outstanding.length === 1 ? 'question' : 'questions'}. Answer or skip those first — a second batch on top of them turns an interview into a form.`,
    }
  }

  const answers = await getDiscoveryAnswers()
  const progress = discoveryProgress(answers)
  const section =
    progress.find((entry) => entry.current)?.section ??
    DISCOVERY_SECTIONS[DISCOVERY_SECTIONS.length - 1]

  const [church] = await db
    .select({ name: schema.churches.name })
    .from(schema.churches)
    .where(eq(schema.churches.id, viewer.churchId))
    .limit(1)

  await audit({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    event: 'prompt_sent',
    detail: `Asked for discovery questions on “${section}” with ${answers.length} answer${answers.length === 1 ? '' : 's'} of context`,
  })

  const result = await askDiscoveryQuestions({
    churchName: church?.name ?? 'This church',
    section,
    answers,
  })
  if (!result.ok) return { ok: false, message: result.error }

  await db.insert(schema.discoveryQuestions).values(
    result.value.map((question) => ({
      churchId: viewer.churchId,
      section: question.section,
      question: question.question,
      why: question.why,
    }))
  )

  revalidatePath('/pathway')
  return {
    ok: true,
    message: `${result.value.length} question${result.value.length === 1 ? '' : 's'} to answer. Each one says why it is being asked.`,
  }
}

/**
 * Record an answer.
 *
 * Not an AI action — a person answering a question about their own church — so it
 * needs no key and is not audited as a prompt. It is gated the same way, because
 * these answers are what every later recommendation cites.
 */
export async function answerQuestion(
  formData: FormData
): Promise<ActionOutcome> {
  const questionId = String(formData.get('questionId') ?? '')
  const answer = String(formData.get('answer') ?? '').trim()

  if (questionId === '') return { ok: false, message: 'Say which question.' }
  if (answer === '') {
    return {
      ok: false,
      message:
        'An empty answer is not an answer. Leave it unanswered rather than recording a blank — a blank reads as answered to everything that comes after.',
    }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'pathway.edit')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const [question] = await db
    .select({
      id: schema.discoveryQuestions.id,
      answer: schema.discoveryQuestions.answer,
    })
    .from(schema.discoveryQuestions)
    .where(
      and(
        eq(schema.discoveryQuestions.id, questionId),
        eq(schema.discoveryQuestions.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!question) {
    return { ok: false, message: 'That question is not in this church.' }
  }

  await db
    .update(schema.discoveryQuestions)
    .set({
      answer,
      answeredById: viewer.personId,
      answeredAt: new Date(),
    })
    .where(eq(schema.discoveryQuestions.id, questionId))

  revalidatePath('/pathway')
  return {
    ok: true,
    message:
      question.answer === null
        ? 'Recorded. Recommendations will cite this by name.'
        : 'Answer updated.',
  }
}

/**
 * Summarise the answers into profile facts.
 *
 * Upserted by field name, and a confirmed fact is never overwritten by an
 * inference: a church that has settled a question does not get it un-settled by a
 * later summary reading the same answers differently.
 */
export async function summariseProfile(): Promise<ActionOutcome> {
  const start = await ready()
  if (!start.ok) return { ok: false, message: start.message }
  const { viewer } = start

  const answers = await getDiscoveryAnswers()
  const [church] = await db
    .select({ name: schema.churches.name })
    .from(schema.churches)
    .where(eq(schema.churches.id, viewer.churchId))
    .limit(1)

  await audit({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    event: 'prompt_sent',
    detail: `Summarised ${answers.length} discovery answer${answers.length === 1 ? '' : 's'} into the church profile`,
  })

  const result = await summariseIntoProfile({
    churchName: church?.name ?? 'This church',
    answers,
  })
  if (!result.ok) return { ok: false, message: result.error }

  const existing = await db
    .select({
      field: schema.churchProfileEntries.field,
      provenance: schema.churchProfileEntries.provenance,
    })
    .from(schema.churchProfileEntries)
    .where(eq(schema.churchProfileEntries.churchId, viewer.churchId))

  const confirmed = new Set(
    existing
      .filter((entry) => entry.provenance === 'confirmed')
      .map((entry) => entry.field)
  )

  let written = 0
  let kept = 0
  for (const entry of result.value) {
    if (confirmed.has(entry.field) && entry.provenance === 'inferred') {
      // §2: an inference is never treated as policy, and it certainly does not
      // overwrite one.
      kept += 1
      continue
    }
    await db
      .insert(schema.churchProfileEntries)
      .values({
        churchId: viewer.churchId,
        field: entry.field,
        value: entry.value,
        provenance: entry.provenance,
        sourceNote: entry.sourceNote ?? null,
      })
      .onConflictDoUpdate({
        target: [
          schema.churchProfileEntries.churchId,
          schema.churchProfileEntries.field,
        ],
        set: {
          value: entry.value,
          provenance: entry.provenance,
          sourceNote: entry.sourceNote ?? null,
          recordedAt: new Date(),
        },
      })
    written += 1
  }

  revalidatePath('/pathway')
  return {
    ok: true,
    message:
      `${written} profile ${written === 1 ? 'fact' : 'facts'} recorded.` +
      (kept > 0
        ? ` ${kept} inferred ${kept === 1 ? 'value was' : 'values were'} left out because you have already confirmed those fields.`
        : ''),
  }
}

/* ────────────────────────────── Blueprint ────────────────────────────── */

/**
 * Propose stages onto the draft.
 *
 * Appended, never replacing. A church that has written three stages and asks for a
 * blueprint gets a proposal after theirs to keep, edit or delete — replacing their
 * work with a model's would be the single most destructive thing in this app, and
 * it is prevented by the insert rather than by a warning dialog.
 */
export async function generateBlueprint(): Promise<ActionOutcome> {
  const start = await ready()
  if (!start.ok) return { ok: false, message: start.message }
  const { viewer } = start

  const draft = await requireDraft(viewer.churchId)
  if (!draft.ok) return { ok: false, message: draft.message }

  const answers = await getDiscoveryAnswers()
  const [church] = await db
    .select({ name: schema.churches.name })
    .from(schema.churches)
    .where(eq(schema.churches.id, viewer.churchId))
    .limit(1)

  const profileRows = await db
    .select()
    .from(schema.churchProfileEntries)
    .where(eq(schema.churchProfileEntries.churchId, viewer.churchId))

  await audit({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    event: 'prompt_sent',
    detail: `Asked for a pathway blueprint for version ${draft.versionNumber}`,
  })

  const result = await proposePathway({
    churchName: church?.name ?? 'This church',
    answers,
    profile: profileRows.map((row) => ({
      field: row.field,
      value: row.value,
      provenance: row.provenance,
      sourceNote: row.sourceNote ?? undefined,
    })),
  })
  if (!result.ok) return { ok: false, message: result.error }

  const [last] = await db
    .select({ position: schema.pathwayStages.position })
    .from(schema.pathwayStages)
    .where(eq(schema.pathwayStages.pathwayId, draft.pathwayId))
    .orderBy(desc(schema.pathwayStages.position))
    .limit(1)

  const from = (last?.position ?? 0) + 1

  await db.insert(schema.pathwayStages).values(
    result.value.stages.map((stage, index) => ({
      pathwayId: draft.pathwayId,
      position: from + index,
      name: stage.name,
      purpose: stage.purpose,
      outcome: stage.outcome,
      ownerRole: stage.ownerRole,
      // Everything else is left empty on purpose. A proposal that filled in
      // stopping rules and escalation paths would be a model writing this
      // church's policy, and §8.8 needs those blanks visible so the church
      // decides each one rather than inheriting it.
    }))
  )

  await audit({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    event: 'recommendation_made',
    detail: `Proposed ${result.value.stages.length} stage${result.value.stages.length === 1 ? '' : 's'} — “${result.value.internalName}”: ${result.value.philosophy}`,
  })

  revalidatePath('/pathway')
  return {
    ok: true,
    message: `${result.value.stages.length} proposed ${result.value.stages.length === 1 ? 'stage' : 'stages'} added to the draft, after anything you had already written. Each is yours to edit or delete, and each has the stopping and escalation rules left blank for you to decide.`,
  }
}

/* ───────────────────────────── Health check ───────────────────────────── */

/**
 * Check the draft and record what it finds.
 *
 * Findings nobody has acknowledged are cleared first: a health check is an
 * assessment of the draft as it stands now, and leaving last week's findings
 * beside this week's would make the publish gate count stale problems. Findings
 * somebody acknowledged with a reason stay — that reason is a person's decision
 * and is not the model's to clear.
 */
export async function runHealthCheck(): Promise<ActionOutcome> {
  const start = await ready()
  if (!start.ok) return { ok: false, message: start.message }
  const { viewer } = start

  const draft = await requireDraft(viewer.churchId)
  if (!draft.ok) return { ok: false, message: draft.message }

  const stages = await loadStagesForPrompt(draft.pathwayId)
  const answers = await getDiscoveryAnswers()
  const [church] = await db
    .select({ name: schema.churches.name })
    .from(schema.churches)
    .where(eq(schema.churches.id, viewer.churchId))
    .limit(1)

  await audit({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    event: 'prompt_sent',
    detail: `Ran a health check on version ${draft.versionNumber} (${stages.length} stage${stages.length === 1 ? '' : 's'})`,
  })

  const result = await checkDraftHealth({
    churchName: church?.name ?? 'This church',
    internalName: draft.internalName,
    stages,
    answers,
  })
  if (!result.ok) return { ok: false, message: result.error }

  await db
    .delete(schema.pathwayHealthFindings)
    .where(
      and(
        eq(schema.pathwayHealthFindings.pathwayId, draft.pathwayId),
        isNull(schema.pathwayHealthFindings.dismissedById)
      )
    )

  if (result.value.length > 0) {
    await db.insert(schema.pathwayHealthFindings).values(
      result.value.map((finding) => ({
        pathwayId: draft.pathwayId,
        category: finding.category,
        severity: finding.severity,
        evidence: finding.evidence,
        why: finding.why,
        options: [...finding.options],
        // Derived from severity by the domain, never chosen by the model.
        blocksPublishing: blocksPublishing(finding.severity),
      }))
    )
  }

  const blocking = result.value.filter((finding) =>
    blocksPublishing(finding.severity)
  ).length

  await audit({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    event: 'recommendation_made',
    detail: `Health check on version ${draft.versionNumber}: ${result.value.length} finding${result.value.length === 1 ? '' : 's'}, ${blocking} blocking`,
  })

  revalidatePath('/pathway')

  if (result.value.length === 0) {
    return {
      ok: true,
      message:
        'Nothing found. That is a real answer, not a pass mark — it means nothing in this draft looked wrong to the check, and the check does not know your church the way you do.',
    }
  }

  return {
    ok: true,
    message: `${result.value.length} finding${result.value.length === 1 ? '' : 's'}${
      blocking > 0
        ? `, ${blocking} of which ${blocking === 1 ? 'stands' : 'stand'} between this draft and publishing until ${blocking === 1 ? 'it is' : 'they are'} fixed or acknowledged with a reason`
        : ', none of them blocking'
    }.`,
  }
}

/* ─────────────────────────────── Review ─────────────────────────────── */

/** Generate recommendations against the draft. */
export async function runReview(): Promise<ActionOutcome> {
  const start = await ready()
  if (!start.ok) return { ok: false, message: start.message }
  const { viewer } = start

  const draft = await requireDraft(viewer.churchId)
  if (!draft.ok) return { ok: false, message: draft.message }

  const stages = await loadStagesForPrompt(draft.pathwayId)
  const answers = await getDiscoveryAnswers()
  const [church] = await db
    .select({ name: schema.churches.name })
    .from(schema.churches)
    .where(eq(schema.churches.id, viewer.churchId))
    .limit(1)

  await audit({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    event: 'prompt_sent',
    detail: `Asked for recommendations on version ${draft.versionNumber}`,
  })

  const result = await reviewDraft({
    churchName: church?.name ?? 'This church',
    internalName: draft.internalName,
    stages,
    answers,
  })
  if (!result.ok) return { ok: false, message: result.error }

  if (result.value.length === 0) {
    return {
      ok: true,
      message:
        'Nothing came back that could be grounded in what this church actually said, so nothing was recorded. That is the intended behaviour rather than a failure — a recommendation resting on general practice is not usable here.',
    }
  }

  await db.insert(schema.aiRecommendations).values(
    result.value.map((recommendation) => ({
      churchId: viewer.churchId,
      noticed: recommendation.noticed,
      whyItMatters: recommendation.whyItMatters,
      consequence: recommendation.consequence,
      options: [...recommendation.options],
      humanJudgment: recommendation.humanJudgment,
      citedAnswerIds: [...recommendation.citedAnswerIds],
    }))
  )

  await audit({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    event: 'recommendation_made',
    detail: `${result.value.length} recommendation${result.value.length === 1 ? '' : 's'} on version ${draft.versionNumber}`,
  })

  revalidatePath('/pathway')
  return {
    ok: true,
    message: `${result.value.length} recommendation${result.value.length === 1 ? '' : 's'}, each citing the answers it rests on. Accept, modify, save or reject each one with a reason.`,
  }
}

/**
 * Record a verdict on a recommendation.
 *
 * A reason is required on all four verdicts, not only rejection — a decision
 * recorded without one tells a future reader that something happened but not why.
 * Nothing is deleted: §7 keeps rejections visible so a later leader can see the
 * finding was considered rather than missed.
 */
export async function recordVerdict(
  formData: FormData
): Promise<ActionOutcome> {
  const recommendationId = String(formData.get('recommendationId') ?? '')
  const verdictValue = String(formData.get('verdict') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  if (!isVerdict(verdictValue)) {
    return {
      ok: false,
      message: 'That is not one of accept, modify, save for later, or reject.',
    }
  }

  const viewer = await getWriter()
  const gate = permissionCheck(viewer, 'pathway.edit')
  if (!gate.allowed) return { ok: false, message: gate.note }

  const [recommendation] = await db
    .select({ id: schema.aiRecommendations.id })
    .from(schema.aiRecommendations)
    .where(
      and(
        eq(schema.aiRecommendations.id, recommendationId),
        eq(schema.aiRecommendations.churchId, viewer.churchId)
      )
    )
    .limit(1)

  if (!recommendation) {
    return { ok: false, message: 'That recommendation is not in this church.' }
  }

  // Through the domain parser, so the required reason is the domain's rule and
  // the wording is the one the tests pin.
  const parsed = parseVerdict({
    recommendationId,
    verdict: verdictValue,
    reason,
    decidedById: viewer.personId,
    decidedAt: new Date(),
  })
  if (!parsed.ok) {
    return {
      ok: false,
      message:
        reason === ''
          ? 'Every verdict needs a reason, including an acceptance. In a year the only thing left of this decision will be the sentence you type here.'
          : parsed.errors.join(' '),
    }
  }

  await db
    .insert(schema.recommendationVerdicts)
    .values({
      recommendationId,
      verdict: parsed.value.verdict,
      reason: parsed.value.reason,
      decidedById: viewer.personId,
    })
    .onConflictDoUpdate({
      target: schema.recommendationVerdicts.recommendationId,
      set: {
        verdict: parsed.value.verdict,
        reason: parsed.value.reason,
        decidedById: viewer.personId,
        decidedAt: new Date(),
      },
    })

  await audit({
    churchId: viewer.churchId,
    actorId: viewer.personId,
    event: 'verdict_recorded',
    detail: `${parsed.value.verdict}: ${parsed.value.reason}`,
  })

  revalidatePath('/pathway')
  return { ok: true, message: describeVerdict(parsed.value.verdict) }
}

function isVerdict(value: string): value is Verdict {
  return (VERDICTS as readonly string[]).includes(value)
}

function describeVerdict(verdict: Verdict): string {
  switch (verdict) {
    case 'accepted':
      return 'Accepted, with your reason on the record. Making the change is still yours to do — accepting a recommendation does not edit the draft.'
    case 'modified':
      return 'Recorded as modified. Edit the stage to match what you decided.'
    case 'saved':
      return 'Saved for later. It stays open and keeps showing as needing a decision.'
    case 'rejected':
      return 'Rejected, and it stays visible with your reason so a later leader can see it was considered rather than missed.'
  }
}

/* ────────────────────────────── Shared ────────────────────────────── */

async function loadStagesForPrompt(
  pathwayId: string
): Promise<StageForPrompt[]> {
  const rows = await db
    .select()
    .from(schema.pathwayStages)
    .where(eq(schema.pathwayStages.pathwayId, pathwayId))
    .orderBy(asc(schema.pathwayStages.position))

  return rows.map((row) => ({
    name: row.name,
    purpose: row.purpose,
    outcome: row.outcome,
    entryCondition: row.entryCondition,
    ownerRole: row.ownerRole,
    requiredActions: row.requiredActions,
    completionCondition: row.completionCondition,
    stoppingRule: row.stoppingRule,
    reactivationRule: row.reactivationRule,
    escalationRule: row.escalationRule,
    intentionallyAbsent: row.intentionallyAbsent,
  }))
}
