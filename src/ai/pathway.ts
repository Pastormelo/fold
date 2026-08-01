import 'server-only'

import {
  AI_MUST_NOT,
  type AiRecommendation,
  type ChurchProfileEntry,
  type DiscoveryAnswer,
  type DiscoveryQuestion,
  type DiscoverySection,
  type HealthFindingProposal,
  type PathwayProposal,
  aiMayPerform,
  parseChurchProfileEntry,
  parseDiscoveryQuestion,
  parseHealthFindingProposal,
  parsePathwayProposal,
  parseRecommendation,
  validateRecommendationAgainstSession,
} from '@/domain/ai'

import { askForJson } from './client'
import {
  churchProfileSchema,
  discoveryQuestionsSchema,
  healthFindingsSchema,
  blueprintSchema,
  recommendationsSchema,
} from './schemas'

/**
 * The four things the AI does for the Pathway builder — §7, §2.
 *
 * The order of operations in every function here is the same, and it is the point
 * of the module: **check the capability, ask, parse, check the citations.** Only
 * the last step is unusual, and it is the one that matters most. A model asked to
 * cite a church's own answers will cite them; it will also, occasionally, cite an
 * answer id that does not exist. A recommendation that *looks* grounded is worse
 * than one that admits it is generic, so anything with a citation nobody can
 * follow is discarded rather than shown.
 *
 * Answers are labelled `A1`, `A2` … in the prompt rather than by their database
 * uuid. The model cites labels, and this module maps them back. Two reasons: a
 * uuid costs about ten times the tokens of a label and buys nothing, and a
 * fabricated label is obvious where a fabricated uuid is not.
 *
 * Nothing here writes to the database. These functions return proposals; the
 * server actions decide what to do with them, and a person decides after that.
 * That separation is why `AI_MUST_NOT` can be enforced rather than promised.
 */

/* ─────────────────────────── The shared preamble ─────────────────────────── */

/**
 * The boundaries, generated from `AI_MUST_NOT` rather than restated.
 *
 * So the list the code enforces and the list the model is told are the same list.
 * Adding a boundary in one place adds it in both, and they cannot drift into the
 * situation where the prompt promises a limit the code does not hold — or worse,
 * the code holds one the model was never told about, which produces refusals the
 * church experiences as the software being broken.
 */
const BOUNDARIES = Object.values(AI_MUST_NOT)
  .map((reason) => `- ${reason}`)
  .join('\n')

const SYSTEM = `You are helping a church describe how it receives people — its pathway from a first visit to being known by name. You are advising elders and pastors, not deciding for them.

What you must not do, and why:
${BOUNDARIES}

How to work:
- Reason from what this church has told you, not from general church-growth practice. If their answers do not support a conclusion, say the question is still open instead of filling the gap.
- Never supply a denominational or polity requirement they did not state. If a rule seems to be missing, that is a question to ask, not a blank to fill.
- Where you are inferring rather than repeating, say so. An inference presented as policy will be read as policy by the next person.
- Plain language. These are pastors, not systems administrators. Avoid "leverage", "onboarding", "funnel", "engagement" — say what happens to a person.
- Every recommendation names which part is the church's judgment rather than yours. That sentence is not a formality; it is what keeps this advice instead of authority.`

/* ──────────────────────────── Prompt fragments ──────────────────────────── */

export type LabelledAnswer = {
  label: string
  id: string
  section: DiscoverySection
  question: string
  answer: string
}

/** `A1`, `A2` … stable within one prompt, and never stored. */
export function labelAnswers(
  answers: readonly DiscoveryAnswer[]
): LabelledAnswer[] {
  return answers.map((answer, index) => ({
    label: `A${index + 1}`,
    id: answer.id,
    section: answer.section,
    question: answer.question,
    answer: answer.answer,
  }))
}

function answerBlock(answers: readonly LabelledAnswer[]): string {
  if (answers.length === 0) {
    return 'The church has not answered anything yet.'
  }
  return answers
    .map(
      (answer) =>
        `[${answer.label}] (${answer.section}) Q: ${answer.question}\n    A: ${answer.answer}`
    )
    .join('\n')
}

function profileBlock(entries: readonly ChurchProfileEntry[]): string {
  if (entries.length === 0) return 'Nothing established yet.'
  return entries
    .map(
      (entry) =>
        `- ${entry.field}: ${entry.value} (${entry.provenance}${
          entry.sourceNote ? `, from: ${entry.sourceNote}` : ''
        })`
    )
    .join('\n')
}

/** A draft's stages, flattened for a prompt. Only the fields that are filled. */
export type StageForPrompt = {
  name: string
  purpose: string | null
  outcome: string | null
  entryCondition: string | null
  ownerRole: string | null
  requiredActions: readonly string[]
  completionCondition: string | null
  stoppingRule: string | null
  reactivationRule: string | null
  escalationRule: string | null
  /** Fields the church marked as deliberately empty (§8.8). */
  intentionallyAbsent: readonly string[]
}

function stageBlock(stages: readonly StageForPrompt[]): string {
  if (stages.length === 0) return 'The draft has no stages yet.'
  return stages
    .map((stage, index) => {
      const lines = [
        `Stage ${index + 1}: ${stage.name}`,
        field('Purpose', stage.purpose),
        field('Outcome', stage.outcome),
        field('Entry condition', stage.entryCondition),
        field('Owner', stage.ownerRole),
        stage.requiredActions.length > 0
          ? `  Required: ${stage.requiredActions.join('; ')}`
          : '  Required: (none listed)',
        field('Complete when', stage.completionCondition),
        field('Follow-up stops when', stage.stoppingRule),
        field('If they return', stage.reactivationRule),
        field('Escalates when', stage.escalationRule),
      ]
      if (stage.intentionallyAbsent.length > 0) {
        // §8.8: a deliberate absence is not an oversight, and a health check
        // that flags it anyway teaches the church to ignore health checks.
        lines.push(
          `  Deliberately left empty by the church (do NOT report these as missing): ${stage.intentionallyAbsent.join(', ')}`
        )
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

function field(label: string, value: string | null): string {
  return `  ${label}: ${value && value.trim() !== '' ? value : '(empty)'}`
}

/* ────────────────────────────── Discovery ────────────────────────────── */

export type AiResult<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * The next few questions.
 *
 * Asks for the section the interview has reached rather than all seven at once:
 * §2 makes discovery resumable, and a church that is handed forty questions
 * answers them like a form.
 */
export async function askDiscoveryQuestions(input: {
  churchName: string
  section: DiscoverySection
  answers: readonly DiscoveryAnswer[]
}): Promise<AiResult<DiscoveryQuestion[]>> {
  const may = aiMayPerform('ask_questions')
  if (!may.allowed) return { ok: false, error: may.refusal }

  const labelled = labelAnswers(input.answers)
  const call = await askForJson({
    system: SYSTEM,
    schema: discoveryQuestionsSchema,
    prompt: `Church: ${input.churchName}

You are interviewing them about how they currently receive people. You are on the section "${input.section}".

What they have said so far:
${answerBlock(labelled)}

Ask the next three to five questions for this section. Build on what they have already said — do not ask again about anything above, and where an answer opened something up, follow it. If an answer suggests a rule they have not stated, ask about the rule rather than assuming it.`,
  })
  if (!call.ok) return { ok: false, error: call.error }

  const raw = (call.value as { questions?: unknown[] }).questions ?? []
  const questions: DiscoveryQuestion[] = []
  for (const candidate of raw) {
    const parsed = parseDiscoveryQuestion(candidate)
    // One bad question does not spoil the set. A question that fails to parse is
    // one nobody can answer usefully, so it is dropped and the rest stand.
    if (parsed.ok) questions.push(parsed.value)
  }

  if (questions.length === 0) {
    return {
      ok: false,
      error: 'Nothing usable came back, so nothing was saved. Try again.',
    }
  }
  return { ok: true, value: questions }
}

/**
 * Turn answers into profile facts, each carrying where it came from.
 *
 * §2: an inference is never treated as policy. The parser enforces that an
 * inferred entry says what it was inferred from, so an entry that would have been
 * unattributable is dropped here rather than becoming a fact on the profile.
 */
export async function summariseIntoProfile(input: {
  churchName: string
  answers: readonly DiscoveryAnswer[]
}): Promise<AiResult<ChurchProfileEntry[]>> {
  const may = aiMayPerform('summarise_answers')
  if (!may.allowed) return { ok: false, error: may.refusal }

  if (input.answers.length === 0) {
    return {
      ok: false,
      error:
        'There is nothing to summarise yet. Answer some discovery questions first.',
    }
  }

  const labelled = labelAnswers(input.answers)
  const call = await askForJson({
    system: SYSTEM,
    schema: churchProfileSchema,
    prompt: `Church: ${input.churchName}

Their answers:
${answerBlock(labelled)}

Write out what these answers establish about this church, one fact per entry. Mark a fact "confirmed" only where they said it outright. Where you are concluding something from an adjacent answer, mark it "inferred" and say in sourceNote which answer you concluded it from — it will be shown to them as not-yet-policy, and they will confirm or correct it.`,
  })
  if (!call.ok) return { ok: false, error: call.error }

  const raw = (call.value as { entries?: unknown[] }).entries ?? []
  const entries: ChurchProfileEntry[] = []
  for (const candidate of raw) {
    // Normalising the empty-string sourceNote the schema asks for on a confirmed
    // entry: the domain wants it absent, and "" would read as an attribution
    // nobody wrote.
    const shaped =
      typeof candidate === 'object' && candidate !== null
        ? {
            ...candidate,
            sourceNote:
              (candidate as { sourceNote?: string }).sourceNote?.trim() ||
              undefined,
          }
        : candidate
    const parsed = parseChurchProfileEntry(shaped)
    if (parsed.ok) entries.push(parsed.value)
  }

  if (entries.length === 0) {
    return {
      ok: false,
      error:
        'Nothing came back that could be traced to an answer, so nothing was saved.',
    }
  }
  return { ok: true, value: entries }
}

/* ────────────────────────────── Blueprint ────────────────────────────── */

/**
 * Propose a pathway shape.
 *
 * Returns a proposal with real answer ids on every stage. A stage citing an
 * answer the church never gave is dropped; a proposal with no stages left
 * standing is a failure, because a blueprint resting on nothing is exactly the
 * generic four-step pathway §2 refuses to ship.
 */
export async function proposePathway(input: {
  churchName: string
  answers: readonly DiscoveryAnswer[]
  profile: readonly ChurchProfileEntry[]
}): Promise<AiResult<PathwayProposal>> {
  const may = aiMayPerform('propose_stages')
  if (!may.allowed) return { ok: false, error: may.refusal }

  if (input.answers.length === 0) {
    return {
      ok: false,
      error:
        'There is nothing to build from yet. A pathway proposed with no answers would be somebody else’s pathway.',
    }
  }

  const labelled = labelAnswers(input.answers)
  const call = await askForJson({
    system: SYSTEM,
    schema: blueprintSchema,
    prompt: `Church: ${input.churchName}

What they told you:
${answerBlock(labelled)}

What that establishes:
${profileBlock(input.profile)}

Propose the stages of their pathway. Rules:
- Every stage cites the answer labels it rests on, using the labels above (e.g. ["A2","A5"]). Do not invent a label.
- As many stages as their answers support, and no more. Four stages is one church's answer, not a standard.
- Name a specific role as owner, never "the team".
- If their answers do not tell you what happens at some point in the pathway, leave that stage out and let them add it. A stage you filled in from general practice is one they will discover is wrong in front of a guest.`,
  })
  if (!call.ok) return { ok: false, error: call.error }

  const parsed = parsePathwayProposal(call.value)
  if (!parsed.ok) {
    return { ok: false, error: describeErrors(parsed.errors) }
  }

  const known = labelled.map((answer) => answer.label)
  const grounded = parsed.value.stages.filter((stage) =>
    stage.citedAnswerIds.every((label) => known.includes(label))
  )
  if (grounded.length === 0) {
    return {
      ok: false,
      error:
        'Every proposed stage cited an answer this church never gave, so none of it was kept. That usually means discovery needs more answers before a blueprint is worth generating.',
    }
  }

  return {
    ok: true,
    value: {
      ...parsed.value,
      // Labels swapped for the real ids now that they are known to exist.
      stages: grounded.map((stage) => ({
        ...stage,
        citedAnswerIds: stage.citedAnswerIds.map((label) => idFor(label, labelled)),
      })),
    },
  }
}

/* ───────────────────────────── Health check ───────────────────────────── */

/**
 * What is wrong with the draft.
 *
 * The draft only — never what is published. `analysisMayModify` exists in the
 * domain for the same reason, and neither this function nor anything it returns
 * can reach the active pathway: it returns findings, and a person acts on them.
 */
export async function checkDraftHealth(input: {
  churchName: string
  internalName: string
  stages: readonly StageForPrompt[]
  answers: readonly DiscoveryAnswer[]
}): Promise<AiResult<HealthFindingProposal[]>> {
  const may = aiMayPerform('identify_concerns')
  if (!may.allowed) return { ok: false, error: may.refusal }

  if (input.stages.length === 0) {
    return {
      ok: false,
      error:
        'There are no stages to check yet. A pathway with no stages does not receive anyone, which you can already see.',
    }
  }

  const call = await askForJson({
    system: SYSTEM,
    schema: healthFindingsSchema,
    prompt: `Church: ${input.churchName}
Draft pathway: ${input.internalName}

${stageBlock(input.stages)}

${
  input.answers.length > 0
    ? `What they said in discovery, for context:\n${answerBlock(labelAnswers(input.answers))}`
    : 'They have not done a discovery interview, so judge the draft on its own terms.'
}

Check this draft. Look for: a stage with no owner; follow-up with no stopping rule, so it ends whenever whoever is holding it gives up; a stage with no outcome, so nobody can tell when it is done; two rules that contradict each other; a step that adds friction without adding anything; everything resting on one person; nothing connecting a new member to anyone after they join; no route back for somebody who drifts away; anything that would put a person's private situation somewhere the wrong people can read it.

Quote the part of their draft each finding comes from. Do not report a field they marked as deliberately empty — that is a decision, not an oversight. If the draft is sound, return an empty list rather than finding something to say.`,
  })
  if (!call.ok) return { ok: false, error: call.error }

  const raw = (call.value as { findings?: unknown[] }).findings ?? []
  const findings: HealthFindingProposal[] = []
  for (const candidate of raw) {
    const parsed = parseHealthFindingProposal(candidate)
    if (parsed.ok) findings.push(parsed.value)
  }
  // An empty list is a real answer here — the draft may be sound — so unlike the
  // other three this is not treated as a failure.
  return { ok: true, value: findings }
}

/* ─────────────────────────────── Review ─────────────────────────────── */

/**
 * Recommendations with all five parts, grounded in the church's own answers.
 *
 * Ids are assigned here rather than by the model, and the citation check is the
 * domain's — `validateRecommendationAgainstSession`, the same function the tests
 * pin. A recommendation citing an answer nobody gave is dropped silently rather
 * than shown with a warning: a leader reading a list of recommendations should
 * not have to work out which ones are load-bearing.
 */
export async function reviewDraft(input: {
  churchName: string
  internalName: string
  stages: readonly StageForPrompt[]
  answers: readonly DiscoveryAnswer[]
}): Promise<AiResult<AiRecommendation[]>> {
  const may = aiMayPerform('identify_concerns')
  if (!may.allowed) return { ok: false, error: may.refusal }

  if (input.answers.length === 0) {
    return {
      ok: false,
      error:
        'Recommendations have to rest on the church’s own answers, and there are none yet. Run discovery first — general best practice is not usable here.',
    }
  }

  const labelled = labelAnswers(input.answers)
  const call = await askForJson({
    system: SYSTEM,
    schema: recommendationsSchema,
    prompt: `Church: ${input.churchName}
Draft pathway: ${input.internalName}

${stageBlock(input.stages)}

What they told you:
${answerBlock(labelled)}

Where does this draft not match what they said they wanted? Each recommendation gets five parts: what you noticed, why it matters, what happens if nothing changes, the options, and which part is their judgment rather than yours.

Cite the answer labels your reasoning rests on (e.g. ["A3"]). Do not invent a label, and do not make a recommendation you cannot ground in something they said.`,
  })
  if (!call.ok) return { ok: false, error: call.error }

  const raw = (call.value as { recommendations?: unknown[] }).recommendations ?? []
  const known = labelled.map((answer) => answer.label)
  const recommendations: AiRecommendation[] = []

  for (const candidate of raw) {
    const parsed = parseRecommendation({
      ...(candidate as object),
      // Ours, not the model's.
      id: crypto.randomUUID(),
    })
    if (!parsed.ok) continue
    const grounded = validateRecommendationAgainstSession(parsed.value, known)
    if (!grounded.ok) continue
    recommendations.push({
      ...grounded.value,
      citedAnswerIds: grounded.value.citedAnswerIds.map((label) =>
        idFor(label, labelled)
      ),
    })
  }

  return { ok: true, value: recommendations }
}

/* ──────────────────────────────── Shared ──────────────────────────────── */

function idFor(label: string, answers: readonly LabelledAnswer[]): string {
  const match = answers.find((answer) => answer.label === label)
  // Unreachable: every caller filters unknown labels out first. Throwing rather
  // than returning the label would be safer than writing a label into a column
  // that other rows join on by id.
  if (match === undefined) {
    throw new Error(`No answer labelled ${label}. Citations were not checked.`)
  }
  return match.id
}

function describeErrors(errors: readonly string[]): string {
  return `The model’s answer did not hold up, so nothing was saved: ${errors.join('; ')}`
}
