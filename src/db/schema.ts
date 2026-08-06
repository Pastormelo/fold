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
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { AUDITED_AI_EVENTS, DISCOVERY_SECTIONS, VERDICTS } from '@/domain/ai'
import { CARE_WINDOWS } from '@/domain/journeys'
import { MILESTONE_KINDS } from '@/domain/milestones'
import {
  MIGRATION_CHOICES,
  PATHWAY_ACTIONS,
  PATHWAY_STATES,
} from '@/domain/pathway'
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

/** Declared from the domain, so `recursAnnually` cannot be asked about a kind
 * the database allows and the code has never heard of. */
export const milestoneKind = pgEnum('milestone_kind', MILESTONE_KINDS)

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

export const verdictKind = pgEnum('verdict_kind', VERDICTS)

export const aiAuditEvent = pgEnum('ai_audit_event', AUDITED_AI_EVENTS)

/** §2's seven sections, declared from the domain so the interview cannot be
 * resumed into a section the code has never heard of. */
export const discoverySection = pgEnum('discovery_section', DISCOVERY_SECTIONS)

/* ─────────────────────────────── Church ─────────────────────────────── */

/**
 * Multi-tenant from the start. Every people-bearing table carries `churchId`
 * so a query that forgets to scope is a type error rather than a data leak.
 */
export const churches = pgTable('churches', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /**
   * The membership values seen the last time Planning Center was read. A cache,
   * not a record.
   *
   * It exists so the Family/Guests mapping can offer tick boxes of values that
   * actually exist over there rather than a box to type one into. §6 forbids Fold
   * inventing a value in Planning Center, and a typed value that matches nothing
   * is the same mistake wearing a different hat: it looks like a completed setting
   * and silently sorts nobody. Refreshed by every preview; stale is harmless
   * because the import reads live data regardless.
   */
  pcMembershipValues: text('pc_membership_values').array(),
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
    /**
     * The Supabase Auth user this person signs in as, when they can sign in at
     * all. Most people in a church directory never will, so it is nullable —
     * and a sign-in whose id matches no person is refused rather than given a
     * default identity, which is why this is looked up rather than trusted.
     */
    authUserId: uuid('auth_user_id'),
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
    /** One auth account maps to one person, globally rather than per church. */
    uniqueIndex('people_auth_user_idx')
      .on(table.authUserId)
      .where(sql`${table.authUserId} is not null`),
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
 * Credentials for a connected third-party system.
 *
 * Here rather than in the environment so an administrator can connect Planning
 * Center from the Setup screen. Reading them out of the environment alone meant
 * connecting required a terminal and a redeploy, which put the one person who
 * should be doing it — the church administrator — behind the one person who
 * should not have to be involved.
 *
 * `secret_encrypted` is exactly that: AES-256-GCM, see
 * `src/planning-center/secrets.ts`. A Planning Center token opens a church's
 * whole directory in a system this database's tier model does not reach into, so
 * a leaked backup should not include a working one. `app_id` is not encrypted —
 * it is an identifier, not a secret, and showing it is how an administrator
 * recognises which token is stored.
 *
 * One row per church per provider, replaced rather than versioned: an old
 * credential is not history worth keeping, it is a key that should stop existing.
 */
export const integrationCredentials = pgTable(
  'integration_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    /** `planning_center` today. Text so adding one is not a migration. */
    provider: text('provider').notNull(),
    appId: text('app_id').notNull(),
    secretEncrypted: text('secret_encrypted').notNull(),
    /** The last four characters, so the stored token is recognisable. */
    secretHint: text('secret_hint').notNull(),
    /**
     * How this connection was made: `token` for a pasted Personal Access Token,
     * `oauth` for "Sign in with Planning Center".
     *
     * Stored rather than inferred from which columns are filled. The screen says
     * different things for the two — a pasted token shows an Application ID to
     * recognise, an OAuth connection shows who authorised it and when it renews —
     * and guessing from column emptiness would be one bug away from showing a
     * church the wrong story about its own connection.
     */
    kind: text('kind').notNull().default('token'),
    /**
     * OAuth only. The refresh token, encrypted like the secret beside it.
     *
     * Planning Center issues a new refresh token every time one is used and
     * invalidates the old one, so this column is rewritten on every refresh. Both
     * halves have to be stored together or the connection dies in two hours with
     * no way back except reconnecting by hand.
     */
    refreshEncrypted: text('refresh_encrypted'),
    /** When the access token stops working. Null for a Personal Access Token,
     * which does not expire. */
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }),
    connectedById: uuid('connected_by_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    connectedAt: timestamp('connected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('integration_credentials_provider_idx').on(
      table.churchId,
      table.provider
    ),
    check('credential_app_id_not_blank', sql`btrim(${table.appId}) <> ''`),
    check(
      'credential_secret_not_blank',
      sql`btrim(${table.secretEncrypted}) <> ''`
    ),
    check('credential_kind', sql`${table.kind} IN ('token', 'oauth')`),
    /**
     * An OAuth row carries both a refresh token and an expiry, or it is not an
     * OAuth row. Half of one is a connection that will stop working in two hours
     * and cannot be renewed — and it would look connected the whole time.
     */
    check(
      'oauth_credential_is_complete',
      sql`${table.kind} <> 'oauth' or (${table.refreshEncrypted} is not null and ${table.accessExpiresAt} is not null)`
    ),
  ]
)

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
    /**
     * The Planning Center values that land in this list. Plural.
     *
     * A real directory carried "Member", "Partners" and "Children of Members" as
     * three ways of saying the same thing, plus several kinds of guest. A single
     * column made a church choose one and let the rest silently become guests.
     */
    externalFieldIds: text('external_field_ids').array(),
    foldOnlyReason: text('fold_only_reason'),
  },
  (table) => [
    uniqueIndex('fold_list_mappings_list_idx').on(table.churchId, table.list),
    check(
      'list_mapped_has_a_target',
      /*
       * `coalesce(..., 0)`, and the coalesce is the whole point.
       *
       * `cardinality(NULL)` is NULL and a CHECK passes on NULL, so the obvious
       * `cardinality(x) >= 1` accepts a null column — exactly the trap that made
       * `array_length(x, 1) >= 1` decorative on `ai_recommendations` earlier, met
       * again in a different function. A constraint on an array column has to say
       * what it means about null.
       */
      sql`${table.state} <> 'mapped' or coalesce(cardinality(${table.externalFieldIds}), 0) >= 1`
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

/* ─────────────────────────── Discovery ─────────────────────────── */

/**
 * The discovery interview: a question, and its answer once there is one.
 *
 * One table rather than two, because an asked-but-unanswered question is the
 * normal state of half this table and the interview is resumable (§2) — a church
 * answers a few questions on a Tuesday and comes back on Thursday. Splitting
 * questions from answers would mean joining them on every read to work out where
 * the interview had got to.
 *
 * `why` is stored, not just displayed. A church rereading its own discovery
 * session a year later is entitled to see what a question was for; without it
 * the record is a list of answers to questions nobody remembers the point of.
 *
 * Answers are never deleted. The blueprint's stages cite these rows by id, and a
 * deleted answer would leave a stage claiming to rest on something nobody can
 * read — the "looks grounded" failure §7 is most concerned about.
 */
export const discoveryQuestions = pgTable(
  'discovery_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    section: discoverySection('section').notNull(),
    question: text('question').notNull(),
    /** Why the AI asked. Shown with the question, and kept with the answer. */
    why: text('why').notNull(),
    answer: text('answer'),
    answeredById: uuid('answered_by_id').references(
      (): AnyPgColumn => people.id,
      { onDelete: 'restrict' }
    ),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    askedAt: timestamp('asked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('discovery_church_idx').on(table.churchId, table.section),
    /**
     * All three or none. A row with an answer but no author is one nobody can be
     * asked about later, and a blank answer with a timestamp reads as answered
     * while telling a reader nothing.
     */
    check(
      'discovery_answer_is_complete',
      sql`(${table.answer} IS NULL AND ${table.answeredById} IS NULL AND ${table.answeredAt} IS NULL)
          OR (btrim(${table.answer}) <> '' AND ${table.answeredById} IS NOT NULL AND ${table.answeredAt} IS NOT NULL)`
    ),
  ]
)

/* ──────────────────────── AI recommendations ──────────────────────── */

/**
 * A recommendation the AI made, with §7's five parts as five not-null columns.
 *
 * `human_judgment` being `notNull` is the point: §7 says the fifth part is not
 * optional, and a nullable column would make it optional in the one place that
 * outlives the code. `cited_answer_ids` is likewise non-empty by check, since a
 * recommendation resting on general best practice rather than the church's own
 * answers is not usable here.
 */
export const aiRecommendations = pgTable(
  'ai_recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    noticed: text('noticed').notNull(),
    whyItMatters: text('why_it_matters').notNull(),
    consequence: text('consequence').notNull(),
    options: text('options').array().notNull(),
    /** §7: the fifth part, and not optional. */
    humanJudgment: text('human_judgment').notNull(),
    citedAnswerIds: text('cited_answer_ids').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('ai_recommendations_church_idx').on(table.churchId),
    /**
     * `cardinality`, not `array_length`.
     *
     * `array_length('{}', 1)` returns NULL rather than 0, and a CHECK constraint
     * passes on NULL — so the obvious `array_length(x, 1) >= 1` accepts exactly
     * the empty array it was written to reject. Both of these were decorative
     * until a script tried to insert past them. `cardinality` returns 0 for an
     * empty array, so the comparison is a comparison.
     */
    check(
      'recommendation_offers_an_option',
      sql`cardinality(${table.options}) >= 1`
    ),
    check(
      'recommendation_cites_the_church',
      sql`cardinality(${table.citedAnswerIds}) >= 1`
    ),
    check(
      'human_judgment_is_not_blank',
      sql`btrim(${table.humanJudgment}) <> ''`
    ),
  ]
)

/**
 * A verdict on a recommendation.
 *
 * Every verdict carries a reason, including an acceptance — a decision recorded
 * without one tells a future reader that something happened but not why. Rows
 * are never deleted: §7 says rejections stay visible so a later leader can see a
 * finding was considered rather than missed.
 */
export const recommendationVerdicts = pgTable(
  'recommendation_verdicts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => aiRecommendations.id, { onDelete: 'restrict' }),
    verdict: verdictKind('verdict').notNull(),
    reason: text('reason').notNull(),
    decidedById: uuid('decided_by_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    decidedAt: timestamp('decided_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('recommendation_verdict_idx').on(table.recommendationId),
    check('verdict_has_a_reason', sql`btrim(${table.reason}) <> ''`),
  ]
)

/**
 * §7's audit trail: prompts, recommendations, verdicts, manual edits, and
 * publication decisions.
 *
 * `actor_id` is a person even for a model-generated event — the person on whose
 * behalf it ran. A row attributed to "the AI" answers nobody's question later.
 */
export const aiAuditLog = pgTable(
  'ai_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    event: aiAuditEvent('event').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    detail: text('detail').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('ai_audit_church_idx').on(table.churchId, table.occurredAt)]
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

/* ─────────────────────────────── Pathway ─────────────────────────────── */

/**
 * Declared from the domain so the database cannot hold a state or an action
 * `attemptTransition` has never heard of. Note `pathway_action` has no
 * `archive` member, for the reason ./domain/pathway.ts gives: archiving is a
 * consequence of publishing, not something anyone does.
 */
export const pathwayState = pgEnum('pathway_state', PATHWAY_STATES)
export const pathwayAction = pgEnum('pathway_action', PATHWAY_ACTIONS)
export const migrationChoice = pgEnum('migration_choice', MIGRATION_CHOICES)

/**
 * One row per version, not one row per church.
 *
 * §4: "Only one version is `active` per church. Previous versions are
 * `archived`." A church therefore has a stack of these — the archived ones it
 * used to run, at most one active, and at most one being worked on. That is
 * enforced below by a partial unique index rather than by hoping.
 *
 * There is no `is_dirty` and no `has_changes`. §8.6 is explicit that draft state
 * is derived by diffing the working version against the published one, and a
 * stored flag is exactly what let the prototype get stuck reporting changes that
 * were not there. `diffPathways` answers that question from the rows.
 */
export const pathways = pgTable(
  'pathways',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    /** 1, 2, 3… as published. A working version claims the next number. */
    versionNumber: integer('version_number').notNull(),
    state: pathwayState('state').notNull(),
    internalName: text('internal_name').notNull().default(''),
    publicName: text('public_name').notNull().default(''),
    philosophy: text('philosophy').notNull().default(''),
    discipleDefinition: text('disciple_definition').notNull().default(''),
    /**
     * Nullable with no default, because §4 requires the publisher to choose and
     * "existing participants are never migrated automatically". A default here
     * would be the app deciding what happens to people mid-pathway, which is the
     * one thing the handoff says it must not do. `null` blocks publishing — see
     * the `no_migration_choice` blocker.
     */
    migrationChoice: migrationChoice('migration_choice'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedById: uuid('published_by_id').references(
      (): AnyPgColumn => people.id,
      { onDelete: 'restrict' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('pathways_version_idx').on(table.churchId, table.versionNumber),
    /**
     * At most one active version per church, in the database rather than in
     * application code. Two live pathways would mean two answers to "what
     * happens to a guest next", and nobody would know which one was running.
     */
    uniqueIndex('pathways_one_active_idx')
      .on(table.churchId)
      .where(sql`${table.state} = 'active'`),
    /** A published version must say when and by whom, or neither. */
    check(
      'pathways_published_attribution',
      sql`(${table.publishedAt} IS NULL) = (${table.publishedById} IS NULL)`
    ),
  ]
)

/**
 * A stage of one version.
 *
 * Every field in `EditableStage` appears here, because §8.7 requires the diff to
 * cover all of them and a field that is not stored cannot be diffed. The two
 * `_json` columns hold string arrays; they are text rather than a Postgres array
 * so ordering is preserved exactly as the church entered it.
 */
export const pathwayStages = pgTable(
  'pathway_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pathwayId: uuid('pathway_id')
      .notNull()
      .references(() => pathways.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    /** What the church calls this stage in front of guests. Often gentler. */
    publicName: text('public_name').notNull().default(''),
    subtitle: text('subtitle').notNull().default(''),
    purpose: text('purpose').notNull().default(''),
    outcome: text('outcome').notNull().default(''),
    entryCondition: text('entry_condition').notNull().default(''),
    requiredActions: text('required_actions').array().notNull().default([]),
    optionalActions: text('optional_actions').array().notNull().default([]),
    /** Free text, not `role_name`: churches name these jobs their own way. */
    ownerRole: text('owner_role').notNull().default(''),
    completionCondition: text('completion_condition').notNull().default(''),
    /** §8: without this, follow-up either never ends or ends arbitrarily. */
    stoppingRule: text('stopping_rule').notNull().default(''),
    reactivationRule: text('reactivation_rule').notNull().default(''),
    escalationRule: text('escalation_rule').notNull().default(''),
    milestones: text('milestones').array().notNull().default([]),
    /**
     * §8.8: a stage left empty *on purpose* must be distinguishable from one
     * where somebody forgot. Naming the field here is how a church says "we
     * decided not to have a stopping rule" and stops the health check nagging.
     */
    intentionallyAbsent: text('intentionally_absent')
      .array()
      .notNull()
      .default([]),
  },
  (table) => [
    uniqueIndex('pathway_stages_order_idx').on(table.pathwayId, table.position),
  ]
)

/**
 * Every state change, with the person who made it — §4.
 *
 * An append-only log, and the reason `attemptTransition` returns the record it
 * would write rather than mutating anything: the history is the evidence that a
 * pathway was reviewed, and it has to be as trustworthy as the version record.
 * Not a role string. A role cannot be held accountable.
 */
export const pathwayTransitions = pgTable(
  'pathway_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pathwayId: uuid('pathway_id')
      .notNull()
      .references(() => pathways.id, { onDelete: 'cascade' }),
    action: pathwayAction('action').notNull(),
    fromState: pathwayState('from_state').notNull(),
    toState: pathwayState('to_state').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references((): AnyPgColumn => people.id, { onDelete: 'restrict' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The change summary on a publish, the note on a request for changes. */
    detail: text('detail'),
  },
  (table) => [
    index('pathway_transitions_pathway_idx').on(
      table.pathwayId,
      table.occurredAt
    ),
  ]
)

/**
 * One reviewer's position on one version.
 *
 * Approval and objection are separate columns, and that separation is the point.
 * §4 singles out the case where a reviewer objected, somebody *else* marked the
 * objection addressed, and the reviewer never approved anything. Collapsing
 * these into one status column is what makes a version record claim an approval
 * that never happened — and an elder will be reading that record in ten years.
 */
export const pathwayReviews = pgTable(
  'pathway_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pathwayId: uuid('pathway_id')
      .notNull()
      .references(() => pathways.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references((): AnyPgColumn => people.id, { onDelete: 'restrict' }),
    /** Set only when this reviewer actually approved. */
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    objectionRaisedAt: timestamp('objection_raised_at', { withTimezone: true }),
    objectionNote: text('objection_note'),
    objectionAddressedAt: timestamp('objection_addressed_at', {
      withTimezone: true,
    }),
    /** Often not the reviewer, which is exactly why it is recorded. */
    objectionAddressedById: uuid('objection_addressed_by_id').references(
      (): AnyPgColumn => people.id,
      { onDelete: 'restrict' }
    ),
  },
  (table) => [
    uniqueIndex('pathway_reviews_reviewer_idx').on(
      table.pathwayId,
      table.reviewerId
    ),
    /** An objection needs a time and a note together; half of one is noise. */
    check(
      'pathway_reviews_objection_shape',
      sql`(${table.objectionRaisedAt} IS NULL) = (${table.objectionNote} IS NULL)`
    ),
    /** Addressed by somebody, at some time — or not addressed. */
    check(
      'pathway_reviews_addressed_shape',
      sql`(${table.objectionAddressedAt} IS NULL) = (${table.objectionAddressedById} IS NULL)`
    ),
    /** Nothing can be addressed that was never raised. */
    check(
      'pathway_reviews_addressed_needs_objection',
      sql`${table.objectionAddressedAt} IS NULL OR ${table.objectionRaisedAt} IS NOT NULL`
    ),
  ]
)

/**
 * A health-check finding against a version.
 *
 * `blocks_publishing` is a property of the finding; whether the gate is clear is
 * computed from these rows by `unresolvedBlockingFindings`. There is deliberately
 * no `health_check_passed` column anywhere — the prototype had one, and it could
 * disagree with the findings it claimed to summarise.
 */
export const pathwayHealthFindings = pgTable(
  'pathway_health_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pathwayId: uuid('pathway_id')
      .notNull()
      .references(() => pathways.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    severity: text('severity').notNull(),
    /** Cites the pathway, never general best practice (§7). */
    evidence: text('evidence').notNull(),
    why: text('why').notNull(),
    options: text('options').array().notNull().default([]),
    blocksPublishing: boolean('blocks_publishing').notNull(),
    dismissedById: uuid('dismissed_by_id').references(
      (): AnyPgColumn => people.id,
      { onDelete: 'restrict' }
    ),
    dismissalReason: text('dismissal_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('pathway_findings_pathway_idx').on(table.pathwayId),
    /**
     * §4: a blocking finding may be published past, "or they are explicitly
     * acknowledged with a reason". Both parts or neither — a dismissal with no
     * reason is not an acknowledgement, it is a click.
     */
    check(
      'pathway_findings_dismissal_shape',
      sql`(${table.dismissedById} IS NULL) = (${table.dismissalReason} IS NULL)`
    ),
    check(
      'pathway_findings_severity',
      sql`${table.severity} IN ('low', 'medium', 'high')`
    ),
  ]
)

/* ─────────────────────────────── Milestones ─────────────────────────────── */

/**
 * A date in someone's life the church should not miss (§2).
 *
 * One row per milestone, not per year. A birthday is a single date and the
 * upcoming list is projected from it, so it is still right in 2031 without
 * anybody backfilling rows — `nextOccurrence` does the arithmetic and
 * `recursAnnually` decides whether it should.
 *
 * `occurredOn` is a bare date rather than a timestamp on purpose. A birthday is
 * not a moment in a time zone, and storing it as one is how somebody's birthday
 * shows up a day early for half the church.
 */
export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: milestoneKind('kind').notNull(),
    occurredOn: date('occurred_on').notNull(),
    /**
     * Carries the detail the wording needs — for a loss, the name of whoever
     * died, so the reminder reads "Three years since Hector passed" rather than
     * "Loss of a loved one".
     */
    note: text('note').notNull().default(''),
    recordedById: uuid('recorded_by_id')
      .notNull()
      .references((): AnyPgColumn => people.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('milestones_church_idx').on(table.churchId),
    index('milestones_person_idx').on(table.personId),
    /** The same milestone recorded twice would show up twice in the reminder. */
    uniqueIndex('milestones_unique_idx').on(
      table.personId,
      table.kind,
      table.occurredOn
    ),
  ]
)

/* ─────────────────────────────── Prayer ─────────────────────────────── */

/**
 * A prayer request (§2).
 *
 * Carries a tier like a care note does, because "pray for my marriage" is not
 * information for every group leader. Nothing in this table is ever deleted:
 * `answered_at` and `outcome` make answered a state, and a church that clears its
 * answered prayers destroys the only record it has that anything came of them.
 */
export const prayerRequests = pgTable(
  'prayer_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    /** Who it is about. */
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    /** Who brought it — often the person, sometimes their leader. */
    askedById: uuid('asked_by_id')
      .notNull()
      .references((): AnyPgColumn => people.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    /** No default, for the same reason care notes have none. */
    visibilityTier: confidentialityTier('visibility_tier').notNull(),
    askedAt: timestamp('asked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    answeredById: uuid('answered_by_id').references(
      (): AnyPgColumn => people.id,
      { onDelete: 'restrict' }
    ),
    outcome: text('outcome'),
  },
  (table) => [
    index('prayer_requests_church_idx').on(table.churchId, table.askedAt),
    index('prayer_requests_person_idx').on(table.personId),
    /**
     * Answered means all three together. "Answered" with nothing written down is
     * a checkbox, and in a year the sentence is the whole value of the row — so
     * the database will not store the checkbox on its own.
     */
    check(
      'prayer_answered_is_complete',
      sql`(${table.answeredAt} IS NULL) = (${table.outcome} IS NULL)
          AND (${table.answeredAt} IS NULL) = (${table.answeredById} IS NULL)`
    ),
    check(
      'prayer_outcome_not_blank',
      sql`${table.outcome} IS NULL OR btrim(${table.outcome}) <> ''`
    ),
  ]
)

/**
 * How many times one person has prayed for one request.
 *
 * A count on a row rather than a row per prayer: the interesting facts are how
 * many people have prayed and whether you are one of them, and a hundred rows per
 * person answers neither better. The cap lives in `@/domain/prayer` and is
 * mirrored here so a write path that skips it still cannot store 4,000.
 */
export const prayedFor = pgTable(
  'prayed_for',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => prayerRequests.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    times: integer('times').notNull().default(1),
    lastPrayedAt: timestamp('last_prayed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('prayed_for_unique_idx').on(table.requestId, table.personId),
    check('prayed_for_within_cap', sql`${table.times} BETWEEN 1 AND 100`),
  ]
)

/* ──────────────────────── Guests in the pathway ──────────────────────── */

/**
 * Where a guest is in the published pathway.
 *
 * Points at a stage of a specific version, not at a stage name. §4 lets a church
 * publish a new version while people are mid-pathway and requires an explicit
 * decision about what happens to them — that decision is only meaningful if a
 * placement records which version it belongs to.
 *
 * `exitedAt` rather than a delete: someone who stopped coming and then returned is
 * the case §4's reactivation rule is about, and it needs the history.
 */
export const pathwayPlacements = pgTable(
  'pathway_placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    churchId: uuid('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'restrict' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => pathwayStages.id, { onDelete: 'restrict' }),
    /** The leader carrying this guest. Null is a guest nobody has picked up. */
    connectorId: uuid('connector_id').references((): AnyPgColumn => people.id, {
      onDelete: 'set null',
    }),
    enteredAt: timestamp('entered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    exitedAt: timestamp('exited_at', { withTimezone: true }),
    /** Why they left the stage — moved on, stopped coming, became a member. */
    exitReason: text('exit_reason'),
  },
  (table) => [
    index('pathway_placements_church_idx').on(table.churchId),
    /** One live placement per person: two would be two answers to "what next". */
    uniqueIndex('pathway_placements_live_idx')
      .on(table.personId)
      .where(sql`${table.exitedAt} is null`),
    check(
      'pathway_placements_exit_is_complete',
      sql`(${table.exitedAt} IS NULL) = (${table.exitReason} IS NULL)`
    ),
  ]
)
