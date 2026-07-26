/**
 * Schema — HANDOFF.md §2, build order §11 steps 1 and 2.
 *
 * Scope: people, households, folds, leaders, roles, and the confidentiality
 * tier model. Pathways, journeys, and Planning Center mappings come next; the
 * tier model is first because §11 warns that retrofitting it is painful.
 *
 * Nothing One Family specific lives here. Stage counts, follow-up windows,
 * capacity figures, and whether baptism gates membership are all per-church
 * configuration, so they are not schema defaults.
 */

import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { CARE_WINDOWS } from '@/domain/journeys'
import { FOLD_LISTS, SYNC_CATEGORIES } from '@/domain/planning-center'
import { ROLES } from '@/domain/roles'
import { TIER_ORDER } from '@/domain/tiers'

/* ─────────────────────────────── Enums ─────────────────────────────── */

/**
 * Declared from `TIER_ORDER` so the database and the domain cannot disagree
 * about which tiers exist. Postgres enums preserve declaration order, so the
 * ordering that `clearanceReaches` depends on is the ordering stored here.
 */
export const confidentialityTier = pgEnum('confidentiality_tier', TIER_ORDER)

export const roleName = pgEnum('role_name', ROLES)

export const provenance = pgEnum('provenance', [
  'confirmed',
  'imported',
  'inferred',
])

/**
 * Declared from `CARE_WINDOWS`, so the database and `dueDateFor` agree on which
 * windows exist and in what order.
 */
export const careWindow = pgEnum('care_window', CARE_WINDOWS)

export const completionKind = pgEnum('completion_kind', ['done', 'skipped'])

/** Declared from the domain, so the database knows the same categories §6 does. */
export const syncCategory = pgEnum('sync_category', SYNC_CATEGORIES)

export const foldList = pgEnum('fold_list', FOLD_LISTS)

/**
 * `unmapped` and `fold_only` are both "not in Planning Center", kept apart
 * because §8.8 needs a considered omission to be distinguishable from an
 * oversight.
 */
export const mappingState = pgEnum('mapping_state', [
  'mapped',
  'fold_only',
  'unmapped',
])

export const owningSystem = pgEnum('owning_system', ['fold', 'planning_center'])

/* ─────────────────────────────── Church ─────────────────────────────── */

/**
 * Multi-tenant from the start. Every people-bearing table carries `churchId`
 * so a query that forgets to scope is a type error rather than a data leak.
 */
export const churches = pgTable('churches', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const households = pgTable(
  'households',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** Planning Center is the system of record for people data (§6). */
    planningCenterId: text('planning_center_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('households_church_idx').on(table.churchId),
    uniqueIndex('households_pc_id_idx')
      .on(table.churchId, table.planningCenterId)
      .where(sql`${table.planningCenterId} is not null`),
  ]
)

/* ──────────────────────────── People and folds ──────────────────────────── */

/**
 * `folds` and `people` reference each other. Drizzle's `references` takes a
 * callback, so the link is resolved lazily; the `AnyPgColumn` annotation is
 * what stops TypeScript from chasing the cycle.
 */
export const folds = pgTable(
  'folds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /**
     * Exactly one owning elder (§2). `notNull` is the constraint — a fold
     * without a named elder is not a fold, it is an unassigned list of people,
     * and the product's premise is that ownership is never ambiguous.
     *
     * `restrict` on delete: removing a person who owns a fold has to be an
     * explicit reassignment, because the alternative is a fold full of people
     * with no shepherd and nothing surfacing that fact.
     */
    elderId: uuid('elder_id')
      .notNull()
      .references((): AnyPgColumn => people.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('folds_church_idx').on(table.churchId)]
)

export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    householdId: uuid('household_id').references(() => households.id, {
      onDelete: 'set null',
    }),
    /**
     * At most one fold (§2). Null is meaningful and queryable: a member with
     * no fold is an open pastoral matter, not a data gap, so this column is
     * indexed for exactly that report rather than hidden behind a default.
     */
    foldId: uuid('fold_id').references(() => folds.id, {
      onDelete: 'set null',
    }),
    isMember: boolean('is_member').notNull().default(false),
    planningCenterId: text('planning_center_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('people_church_idx').on(table.churchId),
    index('people_fold_idx').on(table.foldId),
    /** Drives the "members with no fold" pastoral report. */
    index('people_unfolded_idx')
      .on(table.churchId)
      .where(sql`${table.foldId} is null and ${table.isMember}`),
    uniqueIndex('people_pc_id_idx')
      .on(table.churchId, table.planningCenterId)
      .where(sql`${table.planningCenterId} is not null`),
  ]
)

/* ──────────────────────────────── Leaders ──────────────────────────────── */

/**
 * A leader is a person holding one or more roles (§2). Roles are rows, not
 * columns, so clearance is computed by reading them all — never stored on the
 * person, per §8.1.
 */
export const leaderRoles = pgTable(
  'leader_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    /**
     * No database default. A person's roles are rows, so "the default role" is
     * a fact about how a person is created rather than about this column —
     * `DEFAULT_ROLE` in @/domain/roles is the one place that decides it, and a
     * column default here would be a second place able to disagree.
     */
    role: roleName('role').notNull(),
    /** Who granted it, and when. A role change is an accountable act. */
    grantedById: uuid('granted_by_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('leader_roles_person_role_idx').on(table.personId, table.role),
    index('leader_roles_church_idx').on(table.churchId),
  ]
)

/* ──────────────────────────── Care journeys ──────────────────────────── */

/**
 * A template for a situation, and the steps it asks for.
 *
 * `isSystemDefault` marks the journeys that ship with the product. §2 says those
 * can be edited but never deleted; that is enforced in `@/domain/journeys`
 * (`canDeleteTemplate`) rather than here, since a check constraint cannot refuse
 * a DELETE. A trigger could, and would be worth adding if templates ever get a
 * delete path that does not go through the domain.
 */
export const journeyTemplates = pgTable(
  'journey_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** The life event that starts this journey. */
    trigger: text('trigger').notNull(),
    /**
     * The tier every note on this journey is written at. A benevolence journey
     * sits at `staff_and_elders`; a restoration one at `elders_only`. No
     * default: the church has to say, because guessing wrong here is the whole
     * failure §3 is about.
     */
    visibilityTier: confidentialityTier('visibility_tier').notNull(),
    isSystemDefault: boolean('is_system_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('journey_templates_church_idx').on(table.churchId)]
)

export const journeySteps = pgTable(
  'journey_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => journeyTemplates.id, { onDelete: 'cascade' }),
    /** Order within the template. The window says *when*; this says *which*. */
    position: integer('position').notNull(),
    title: text('title').notNull(),
    window: careWindow('window').notNull(),
    ownerRole: roleName('owner_role').notNull(),
    guidanceNote: text('guidance_note').notNull().default(''),
  },
  (table) => [
    uniqueIndex('journey_steps_order_idx').on(table.templateId, table.position),
  ]
)

/**
 * A template running on a person.
 *
 * No `current_step`, no `due_at`, no `last_contact_at` — the handoff describes an
 * instance as tracking those, and `journeyProgress` computes all three from the
 * completions below. Storing them would let a due date survive the step it
 * described being finished early (§8.1).
 */
export const journeyInstances = pgTable(
  'journey_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    templateId: uuid('template_id')
      .notNull()
      .references(() => journeyTemplates.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The leader carrying it. A person, never a role. */
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedReason: text('closed_reason'),
  },
  (table) => [
    index('journey_instances_person_idx').on(table.personId),
    index('journey_instances_owner_idx').on(table.ownerId),
    index('journey_instances_church_idx').on(table.churchId),
    /** Ending a journey early is a decision, so it comes with a reason. */
    check(
      'journey_closed_has_reason',
      sql`${table.closedAt} is null or ${table.closedReason} is not null`
    ),
  ]
)

/**
 * One step, finished.
 *
 * The check constraint is the point: a step ends in a logged outcome or a
 * documented skip, and the database will not accept either one empty. §2 puts
 * the same rule on a follow-up touch, and it is what stops a journey being
 * quietly abandoned a step at a time.
 */
export const journeyStepCompletions = pgTable(
  'journey_step_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => journeyInstances.id, { onDelete: 'cascade' }),
    stepId: uuid('step_id')
      .notNull()
      .references(() => journeySteps.id, { onDelete: 'restrict' }),
    completedAt: timestamp('completed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    byId: uuid('by_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    kind: completionKind('kind').notNull(),
    outcome: text('outcome'),
    skipReason: text('skip_reason'),
  },
  (table) => [
    uniqueIndex('journey_step_once_idx').on(table.instanceId, table.stepId),
    check(
      'completion_is_documented',
      sql`(${table.kind} = 'done' and ${table.outcome} is not null and ${table.outcome} <> '')
        or (${table.kind} = 'skipped' and ${table.skipReason} is not null and ${table.skipReason} <> '')`
    ),
  ]
)

/* ──────────────────── Individual grants over role defaults ──────────────────── */

/**
 * Roles are the default; these two tables are the exceptions.
 *
 * An administrator can give any individual any permission, and any clearance
 * tier. What the schema insists on is that the exception is answerable: the
 * granting **person** (not a role — a role cannot be held accountable, §4), the
 * timestamp, and a written reason, none of them nullable.
 *
 * Revoking stamps the row rather than removing it, so "who gave them access to
 * that, and when did it end?" stays answerable. The partial unique indexes
 * allow exactly one live grant of a given thing per person while leaving the
 * full history in place.
 */
export const permissionGrants = pgTable(
  'permission_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
    grantedById: uuid('granted_by_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Not nullable. A grant without a stated reason is not reviewable. */
    reason: text('reason').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedById: uuid('revoked_by_id').references(() => people.id, {
      onDelete: 'restrict',
    }),
  },
  (table) => [
    uniqueIndex('permission_grants_live_idx')
      .on(table.personId, table.permission)
      .where(sql`${table.revokedAt} is null`),
    index('permission_grants_person_idx').on(table.personId),
    index('permission_grants_granted_by_idx').on(table.grantedById),
    check(
      'permission_grants_revocation_is_complete',
      sql`(${table.revokedAt} is null) = (${table.revokedById} is null)`
    ),
  ]
)

/**
 * A granted confidentiality clearance.
 *
 * This is the most consequential row in the database: it is the one way someone
 * reads pastoral notes their role does not reach. It raises clearance only —
 * lowering someone is a role change, so that two mechanisms never disagree
 * about the same question with the permissive one winning by accident.
 *
 * It still does not open restoration cases. Those are by case assignment, and
 * the elders name who carries a case (§3 rule 2).
 */
export const clearanceGrants = pgTable(
  'clearance_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    tier: confidentialityTier('tier').notNull(),
    grantedById: uuid('granted_by_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reason: text('reason').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedById: uuid('revoked_by_id').references(() => people.id, {
      onDelete: 'restrict',
    }),
  },
  (table) => [
    uniqueIndex('clearance_grants_live_idx')
      .on(table.personId, table.tier)
      .where(sql`${table.revokedAt} is null`),
    index('clearance_grants_person_idx').on(table.personId),
    index('clearance_grants_granted_by_idx').on(table.grantedById),
    check(
      'clearance_grants_revocation_is_complete',
      sql`(${table.revokedAt} is null) = (${table.revokedById} is null)`
    ),
  ]
)

/* ────────────────────────── Restoration cases ────────────────────────── */

/**
 * Elder-tier only, and access is by assignment rather than by role (§3).
 *
 * Two named elders, never one. The check constraint enforces that they are two
 * different people — "never one elder alone" is a rule the database can hold,
 * so it holds it here rather than trusting every write path.
 */
export const restorationCases = pgTable(
  'restoration_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    openedAt: timestamp('opened_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leadElderId: uuid('lead_elder_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    secondElderId: uuid('second_elder_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    step: integer('step').notNull().default(1),
    stepLabel: text('step_label').notNull(),
    status: text('status').notNull(),
    /** The written plan, and the decision the elders are carrying. */
    plan: text('plan')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    decisionQuestion: text('decision_question'),
    /** The disclosure circle: who knows, and who deliberately does not. */
    knows: text('knows')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    doesNotKnow: text('does_not_know')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * Closing seals a case, it does not delete it (§3 rule 4). There is no
     * delete path for this table anywhere in the codebase.
     */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** How it ended. Readable even by leaders who cannot read the case. */
    outcome: text('outcome'),
  },
  (table) => [
    check(
      'restoration_two_distinct_elders',
      sql`${table.leadElderId} <> ${table.secondElderId}`
    ),
    check(
      'restoration_closed_has_outcome',
      sql`${table.closedAt} is null or ${table.outcome} is not null`
    ),
    index('restoration_church_idx').on(table.churchId),
    index('restoration_person_idx').on(table.personId),
    index('restoration_lead_idx').on(table.leadElderId),
    index('restoration_second_idx').on(table.secondElderId),
  ]
)

/* ──────────────────────────────── Care notes ──────────────────────────────── */

export const careNotes = pgTable(
  'care_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Fixed at write time (§3 rule 1). Deliberately has no default: a caller
     * that forgets to state the tier gets an error, not the most permissive
     * value. There is no update path for this column.
     */
    visibilityTier: confidentialityTier('visibility_tier').notNull(),
    body: text('body').notNull(),
    /**
     * When set, this note belongs to a restoration case and clearance alone
     * never opens it — the reader must be named on the case.
     */
    restorationCaseId: uuid('restoration_case_id').references(
      () => restorationCases.id,
      { onDelete: 'restrict' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('care_notes_person_idx').on(table.personId, table.occurredAt),
    index('care_notes_church_idx').on(table.churchId),
    index('care_notes_case_idx').on(table.restorationCaseId),
    /**
     * A restoration note filed below the top tier would be readable by staff
     * through the ordinary tier comparison. The database refuses it.
     */
    check(
      'restoration_notes_are_elders_only',
      sql`${table.restorationCaseId} is null or ${table.visibilityTier} = 'elders_only'`
    ),
  ]
)

/* ───────────────────────────── Change log ───────────────────────────── */

/**
 * Every state transition records the acting person and a timestamp (§4).
 * A role string cannot be held accountable, so `actorId` is a person and is
 * not nullable.
 */
export const changeLog = pgTable(
  'change_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    fromState: text('from_state'),
    toState: text('to_state'),
    detail: text('detail'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('change_log_entity_idx').on(table.entity, table.entityId),
    index('change_log_church_idx').on(table.churchId, table.occurredAt),
  ]
)

/* ─────────────────────── Planning Center integration ─────────────────────── */

/**
 * The church's per-category sync choices (§6).
 *
 * The check constraint is the interesting line. §6 says confidential pastoral
 * notes are "not syncable and not switchable", and the domain enforces that — but
 * a row saying otherwise should not be *storable* either, so a future write path
 * that skips `setCategoryEnabled` still cannot record one.
 */
export const syncSettings = pgTable(
  'sync_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    category: syncCategory('category').notNull(),
    enabled: boolean('enabled').notNull(),
    changedById: uuid('changed_by_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    changedAt: timestamp('changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('sync_settings_category_idx').on(
      table.churchId,
      table.category
    ),
    check(
      'confidential_notes_never_sync',
      sql`${table.category} <> 'confidential_pastoral_notes' or ${table.enabled} = false`
    ),
  ]
)

/**
 * A milestone's mapping to something that already exists in Planning Center
 * (§2's `integration_mapping`, §6's constraints).
 *
 * Three states, and the difference between the last two is §8.8: `fold_only`
 * carries a reason and is a decision; `unmapped` is nobody having looked yet.
 * The check constraints make each state carry what it needs, so a "mapped" row
 * with no field or a "fold_only" row with no reason cannot exist.
 */
export const integrationMappings = pgTable(
  'integration_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    /** The Fold-side thing being mapped, e.g. a milestone key. */
    milestoneKey: text('milestone_key').notNull(),
    state: mappingState('state').notNull(),
    /** An id Planning Center already issued. Fold never invents one. */
    externalFieldId: text('external_field_id'),
    /** For a status field, a value Planning Center already accepts. */
    externalValue: text('external_value'),
    owningSystem: owningSystem('owning_system'),
    /** Required when the church chose to keep this in Fold. */
    foldOnlyReason: text('fold_only_reason'),
    decidedById: uuid('decided_by_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('integration_mappings_key_idx').on(
      table.churchId,
      table.milestoneKey
    ),
    check(
      'mapped_has_a_target',
      sql`${table.state} <> 'mapped' or (${table.externalFieldId} is not null and ${table.owningSystem} is not null)`
    ),
    check(
      'fold_only_has_a_reason',
      sql`${table.state} <> 'fold_only' or (${table.foldOnlyReason} is not null and ${table.foldOnlyReason} <> '')`
    ),
  ]
)

/**
 * Where Fold's Family and Guest lists land in Planning Center (§6).
 *
 * Either can be kept Fold-only, which is why `fold_only` is a state here as much
 * as it is for a milestone.
 */
export const foldListMappings = pgTable(
  'fold_list_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    list: foldList('list').notNull(),
    state: mappingState('state').notNull(),
    externalFieldId: text('external_field_id'),
    foldOnlyReason: text('fold_only_reason'),
  },
  (table) => [
    uniqueIndex('fold_list_mappings_list_idx').on(table.churchId, table.list),
    check(
      'list_mapped_has_a_target',
      sql`${table.state} <> 'mapped' or ${table.externalFieldId} is not null`
    ),
    check(
      'list_fold_only_has_a_reason',
      sql`${table.state} <> 'fold_only' or (${table.foldOnlyReason} is not null and ${table.foldOnlyReason} <> '')`
    ),
  ]
)

/**
 * Near matches for a human to resolve (§6).
 *
 * A row here is the whole point of "never merged automatically": the duplicate
 * is recorded and visible, and stays that way until a person decides. There is
 * no automatic resolution path, and `resolvedAt` is only ever set by one.
 */
export const possibleDuplicates = pgTable(
  'possible_duplicates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    otherPersonId: uuid('other_person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    matchedOn: text('matched_on').notNull(),
    surfacedAt: timestamp('surfaced_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedById: uuid('resolved_by_id').references(() => people.id, {
      onDelete: 'set null',
    }),
    resolution: text('resolution'),
  },
  (table) => [
    check(
      'duplicate_is_two_people',
      sql`${table.personId} <> ${table.otherPersonId}`
    ),
    check(
      'resolution_is_attributed',
      sql`${table.resolvedAt} is null or (${table.resolvedById} is not null and ${table.resolution} is not null)`
    ),
    index('possible_duplicates_open_idx')
      .on(table.churchId)
      .where(sql`${table.resolvedAt} is null`),
  ]
)

/* ─────────────────────────── Church profile ─────────────────────────── */

/**
 * Every field carries a provenance (§2, Pathway Builder). An inference is
 * never treated as policy, which is why `provenance` is not nullable and has
 * no default — the writer must say where the value came from.
 */
export const churchProfileEntries = pgTable(
  'church_profile_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    field: text('field').notNull(),
    value: text('value').notNull(),
    provenance: provenance('provenance').notNull(),
    /** Where an imported or inferred value came from. */
    sourceNote: text('source_note'),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('church_profile_field_idx').on(table.churchId, table.field),
  ]
)
