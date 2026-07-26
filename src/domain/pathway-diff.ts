/**
 * Draft state, derived — HANDOFF.md §8.6, §8.7, §8.8.
 *
 * Three failures this module exists to prevent, all of which the prototype hit:
 *
 * - **§8.6** Draft state is computed by diffing the working draft against the
 *   published snapshot, never set by hand. A hand-set dirty flag lets a no-op
 *   edit forge a dirty state the user then cannot clear.
 * - **§8.7** The diff must cover *every* editable field, including arrays. A
 *   partial diff makes real changes invisible — someone rewrites a stopping rule
 *   and the app reports no changes. Field coverage here is enforced by the
 *   compiler, not by anyone remembering to update a list.
 * - **§8.8** Deliberate absence is not a defect. A stage left with no completion
 *   condition *on purpose* must be distinguishable from one where it was
 *   forgotten, so stages carry `intentionallyAbsent`.
 */

/* ─────────────────────────── The editable shape ─────────────────────────── */

/**
 * The stage fields a church can edit. Exercised by the prototype and listed in
 * §2; not every stage uses every field.
 */
export type EditableStage = {
  id: string
  name: string
  publicName: string
  subtitle: string
  purpose: string
  outcome: string
  entryCondition: string
  requiredActions: readonly string[]
  optionalActions: readonly string[]
  ownerRole: string
  completionCondition: string
  stoppingRule: string
  reactivationRule: string
  escalationRule: string
  milestones: readonly string[]
  /**
   * Field names left empty on purpose (§8.8). A stage with no stopping rule and
   * `intentionallyAbsent: ['stoppingRule']` is a decision; the same stage
   * without it is an oversight, and the health check should say so.
   */
  intentionallyAbsent: readonly string[]
}

export type EditablePathway = {
  internalName: string
  publicName: string
  philosophy: string
  discipleDefinition: string
  stages: readonly EditableStage[]
}

/* ──────────────────────── Compile-enforced coverage ──────────────────────── */

const STAGE_FIELDS = [
  'name',
  'publicName',
  'subtitle',
  'purpose',
  'outcome',
  'entryCondition',
  'requiredActions',
  'optionalActions',
  'ownerRole',
  'completionCondition',
  'stoppingRule',
  'reactivationRule',
  'escalationRule',
  'milestones',
  'intentionallyAbsent',
] as const

const PATHWAY_FIELDS = [
  'internalName',
  'publicName',
  'philosophy',
  'discipleDefinition',
] as const

/**
 * `id` is identity, not content, and `stages` is diffed structurally rather than
 * as a value — everything else must appear in `STAGE_FIELDS`.
 *
 * These two lines are the §8.7 guarantee. Add a field to `EditableStage` without
 * adding it to `STAGE_FIELDS` and the build fails, because `Missing` stops being
 * `never`. That is the difference between an invariant and a good intention.
 */
type MissingStageField = Exclude<
  keyof EditableStage,
  (typeof STAGE_FIELDS)[number] | 'id'
>
const _stageFieldsAreExhaustive: MissingStageField extends never
  ? true
  : ['STAGE_FIELDS is missing', MissingStageField] = true

type MissingPathwayField = Exclude<
  keyof EditablePathway,
  (typeof PATHWAY_FIELDS)[number] | 'stages'
>
const _pathwayFieldsAreExhaustive: MissingPathwayField extends never
  ? true
  : ['PATHWAY_FIELDS is missing', MissingPathwayField] = true

// Referenced so the checks are not stripped as unused.
void _stageFieldsAreExhaustive
void _pathwayFieldsAreExhaustive

export const DIFFED_STAGE_FIELDS: readonly string[] = STAGE_FIELDS
export const DIFFED_PATHWAY_FIELDS: readonly string[] = PATHWAY_FIELDS

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  publicName: 'Public name',
  subtitle: 'Subtitle',
  purpose: 'Purpose',
  outcome: 'Outcome',
  entryCondition: 'Entry condition',
  requiredActions: 'Required actions',
  optionalActions: 'Optional actions',
  ownerRole: 'Owner',
  completionCondition: 'Completion condition',
  stoppingRule: 'Stopping rule',
  reactivationRule: 'Reactivation rule',
  escalationRule: 'Escalation rule',
  milestones: 'Milestones',
  intentionallyAbsent: 'Deliberate omissions',
  internalName: 'Internal name',
  philosophy: 'Philosophy',
  discipleDefinition: 'Definition of a disciple',
}

function label(field: string): string {
  return FIELD_LABELS[field] ?? field
}

/* ──────────────────────────────── The diff ──────────────────────────────── */

export type FieldChange = {
  field: string
  label: string
  before: string
  after: string
}

export type StageDiff = {
  stageId: string
  stageName: string
  status: 'added' | 'removed' | 'changed' | 'unchanged'
  changes: readonly FieldChange[]
}

export type PathwayDiff = {
  pathwayChanges: readonly FieldChange[]
  stages: readonly StageDiff[]
  /** Stages added, removed, or altered. Derived from `stages`. */
  changedStageCount: number
  /** §8.6: this, and only this, is what "the draft is dirty" means. */
  hasChanges: boolean
  /** A sentence for the publish screen, pluralised from the counts. */
  summary: string
}

/**
 * Diff a working draft against a published snapshot.
 *
 * Named arguments on purpose. §8.2 warns that the subject of a claim must match
 * what it was computed from — "already reflected in the published pathway" has to
 * be tested against the published pathway, not the working draft. Positional
 * arguments are exactly how those two get swapped.
 */
export function diffPathway({
  draft,
  published,
}: {
  draft: EditablePathway
  published: EditablePathway | null
}): PathwayDiff {
  // No published version yet: everything is new, and that is not the same thing
  // as "no changes".
  if (published === null) {
    const stages = draft.stages.map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      status: 'added' as const,
      changes: [],
    }))
    return finish({
      pathwayChanges: PATHWAY_FIELDS.map((field) => ({
        field,
        label: label(field),
        before: '',
        after: render(draft[field]),
      })).filter((change) => change.after !== ''),
      stages,
    })
  }

  const pathwayChanges: FieldChange[] = []
  for (const field of PATHWAY_FIELDS) {
    const before = render(published[field])
    const after = render(draft[field])
    if (before !== after) {
      pathwayChanges.push({ field, label: label(field), before, after })
    }
  }

  const publishedById = new Map(
    published.stages.map((stage) => [stage.id, stage])
  )
  const draftById = new Map(draft.stages.map((stage) => [stage.id, stage]))

  const stages: StageDiff[] = []

  for (const stage of draft.stages) {
    const previous = publishedById.get(stage.id)
    if (!previous) {
      stages.push({
        stageId: stage.id,
        stageName: stage.name,
        status: 'added',
        changes: [],
      })
      continue
    }

    const changes: FieldChange[] = []
    for (const field of STAGE_FIELDS) {
      const before = render(previous[field])
      const after = render(stage[field])
      if (before !== after) {
        changes.push({ field, label: label(field), before, after })
      }
    }

    stages.push({
      stageId: stage.id,
      stageName: stage.name,
      status: changes.length > 0 ? 'changed' : 'unchanged',
      changes,
    })
  }

  // Removed stages matter as much as added ones, and a diff that only walks the
  // draft would never see them.
  for (const stage of published.stages) {
    if (!draftById.has(stage.id)) {
      stages.push({
        stageId: stage.id,
        stageName: stage.name,
        status: 'removed',
        changes: [],
      })
    }
  }

  return finish({ pathwayChanges, stages })
}

function finish({
  pathwayChanges,
  stages,
}: {
  pathwayChanges: readonly FieldChange[]
  stages: readonly StageDiff[]
}): PathwayDiff {
  const changedStageCount = stages.filter(
    (stage) => stage.status !== 'unchanged'
  ).length
  const hasChanges = pathwayChanges.length > 0 || changedStageCount > 0

  return {
    pathwayChanges,
    stages,
    changedStageCount,
    hasChanges,
    summary: summarise(pathwayChanges.length, changedStageCount),
  }
}

/** Every number here is counted from the diff itself, never passed in (§8.1). */
function summarise(pathwayChanges: number, changedStages: number): string {
  if (pathwayChanges === 0 && changedStages === 0) {
    return 'No changes against the published pathway.'
  }
  const parts: string[] = []
  if (changedStages > 0) {
    parts.push(
      changedStages === 1
        ? '1 stage changed'
        : `${changedStages} stages changed`
    )
  }
  if (pathwayChanges > 0) {
    parts.push(
      pathwayChanges === 1
        ? '1 pathway field changed'
        : `${pathwayChanges} pathway fields changed`
    )
  }
  return `${parts.join(', ')}.`
}

/**
 * Render a value for comparison and display.
 *
 * Arrays are joined with a separator unlikely to appear inside an element, so
 * `['a b']` and `['a', 'b']` are not treated as equal — §8.7's "including
 * arrays" is only met if element boundaries survive. Not airtight: text
 * containing ` ¶ ` would still collide. It survives the ordinary case that a
 * plain `join(' ')` gets wrong, and a structural comparison would be the fix if
 * that ever matters.
 */
function render(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(' ¶ ')
  }
  return String(value)
}

/* ─────────────────────────────── Draft state ─────────────────────────────── */

/**
 * §8.6. The one legitimate way to ask whether a draft differs from what is
 * published. There is no setter, and no stored flag to fall out of step.
 */
export function draftHasUnpublishedChanges(args: {
  draft: EditablePathway
  published: EditablePathway | null
}): boolean {
  return diffPathway(args).hasChanges
}

/* ────────────────────── Deliberate absence, not oversight ────────────────────── */

export type AbsentField = {
  stageId: string
  stageName: string
  field: string
  label: string
  /** §8.8: the whole point of the distinction. */
  deliberate: boolean
}

/** Fields that carry a rule and so are meaningful to leave empty. */
const OPTIONAL_RULE_FIELDS = [
  'completionCondition',
  'stoppingRule',
  'reactivationRule',
  'escalationRule',
  'outcome',
] as const satisfies readonly (keyof EditableStage)[]

/**
 * Empty rule fields across a pathway, each marked deliberate or not.
 *
 * A health check must be able to say "this stage has no stopping rule, and that
 * looks like an oversight" without also flagging the stage where the church
 * decided one was unnecessary and said so.
 */
export function absentFields(pathway: EditablePathway): AbsentField[] {
  const absent: AbsentField[] = []
  for (const stage of pathway.stages) {
    for (const field of OPTIONAL_RULE_FIELDS) {
      if (render(stage[field]) !== '') continue
      absent.push({
        stageId: stage.id,
        stageName: stage.name,
        field,
        label: label(field),
        deliberate: stage.intentionallyAbsent.includes(field),
      })
    }
  }
  return absent
}

/** Absences that look like oversights — the ones worth raising. */
export function unexplainedAbsences(pathway: EditablePathway): AbsentField[] {
  return absentFields(pathway).filter((entry) => !entry.deliberate)
}
