/**
 * Seeds a church so Fold has something real to show.
 *
 * Run with:  npm run db:seed
 *
 * Idempotent: run it twice and nothing duplicates. That matters because the
 * first run against a new database rarely goes cleanly, and a seed you cannot
 * re-run is a seed you end up editing by hand.
 *
 * What it does *not* do is invent people. It creates the church, the lead
 * pastor's own record, and the default journey templates §2 says ship with the
 * product. Everyone else comes from Planning Center or gets added deliberately —
 * a directory pre-populated with plausible strangers is worse than an empty one.
 */

import { eq, and } from 'drizzle-orm'

import { db, schema } from './client'
import { DEFAULT_ROLE } from '@/domain/roles'
import { CARE_WINDOWS } from '@/domain/journeys'

const CHURCH_NAME = 'One Family Church'

/** The lead pastor's record, so there is somebody to sign in as. */
const LEAD_PASTOR = {
  firstName: 'Melo',
  lastName: 'Sauval',
  email: 'melo@onefamily.church',
  roles: ['lead_pastor', 'pastor_elder'] as const,
}

/**
 * §2: system defaults ship with the product and can be edited but never
 * deleted. Two to begin with, at different tiers, so the confidentiality model
 * is exercised from the first day rather than looking theoretical.
 */
const DEFAULT_JOURNEYS = [
  {
    name: 'Grief',
    trigger: 'A death in the household',
    visibilityTier: 'all_leaders' as const,
    steps: [
      {
        title: 'Call the same day',
        window: 'same_day' as const,
        ownerRole: 'pastoral_staff' as const,
        guidanceNote:
          'Do not problem-solve. Ask what happened, and listen longer than is comfortable.',
      },
      {
        title: 'Visit in person',
        window: 'within_48_hours' as const,
        ownerRole: 'pastor_elder' as const,
        guidanceNote: 'Bring nothing that needs answering.',
      },
      {
        title: 'Check in after the arrangements',
        window: 'week_2' as const,
        ownerRole: 'care_volunteer' as const,
        guidanceNote:
          'The week everyone else stops calling is the week this matters.',
      },
      {
        title: 'Mark the first month',
        window: 'month_1' as const,
        ownerRole: 'care_volunteer' as const,
        guidanceNote: 'Say the name of the person who died.',
      },
    ],
  },
  {
    name: 'Hospital',
    trigger: 'A hospital admission',
    visibilityTier: 'all_leaders' as const,
    steps: [
      {
        title: 'Visit or call while they are in',
        window: 'same_day' as const,
        ownerRole: 'pastoral_staff' as const,
        guidanceNote: 'Short, and not at a mealtime.',
      },
      {
        title: 'Check in once they are home',
        window: 'week_1' as const,
        ownerRole: 'care_volunteer' as const,
        guidanceNote: 'Going home is when the help stops and the tiredness starts.',
      },
    ],
  },
  {
    name: 'Benevolence',
    trigger: 'A request for financial help',
    visibilityTier: 'staff_and_elders' as const,
    steps: [
      {
        title: 'Meet and understand the need',
        window: 'within_48_hours' as const,
        ownerRole: 'pastoral_staff' as const,
        guidanceNote:
          'Ask what happened before asking what is needed. The amount is the last question.',
      },
      {
        title: 'Bring it to the elders',
        window: 'week_1' as const,
        ownerRole: 'pastor_elder' as const,
        guidanceNote: 'The decision is the board’s, not one person’s.',
      },
      {
        title: 'Follow up on how things stand',
        window: 'month_1' as const,
        ownerRole: 'pastoral_staff' as const,
        guidanceNote: 'Money rarely fixes the thing underneath it.',
      },
    ],
  },
] satisfies ReadonlyArray<{
  name: string
  trigger: string
  visibilityTier: 'all_leaders' | 'staff_and_elders' | 'elders_only'
  steps: ReadonlyArray<{
    title: string
    window: (typeof CARE_WINDOWS)[number]
    ownerRole: string
    guidanceNote: string
  }>
}>

async function seed() {
  console.log('Seeding Fold…\n')

  /* ── The church ── */
  let [church] = await db
    .select()
    .from(schema.churches)
    .where(eq(schema.churches.name, CHURCH_NAME))
    .limit(1)

  if (church) {
    console.log(`  church           already there: ${church.name}`)
  } else {
    ;[church] = await db
      .insert(schema.churches)
      .values({ name: CHURCH_NAME })
      .returning()
    console.log(`  church           created: ${church!.name}`)
  }
  const churchId = church!.id

  /* ── The lead pastor ── */
  let [person] = await db
    .select()
    .from(schema.people)
    .where(
      and(
        eq(schema.people.churchId, churchId),
        eq(schema.people.email, LEAD_PASTOR.email)
      )
    )
    .limit(1)

  if (person) {
    console.log(`  person           already there: ${person.firstName} ${person.lastName}`)
  } else {
    ;[person] = await db
      .insert(schema.people)
      .values({
        churchId,
        firstName: LEAD_PASTOR.firstName,
        lastName: LEAD_PASTOR.lastName,
        email: LEAD_PASTOR.email,
        isMember: true,
      })
      .returning()
    console.log(`  person           created: ${person!.firstName} ${person!.lastName}`)
  }
  const personId = person!.id

  /* ── Roles ── */
  for (const role of LEAD_PASTOR.roles) {
    const existing = await db
      .select()
      .from(schema.leaderRoles)
      .where(
        and(
          eq(schema.leaderRoles.personId, personId),
          eq(schema.leaderRoles.role, role)
        )
      )
      .limit(1)
    if (existing.length > 0) {
      console.log(`  role             already there: ${role}`)
      continue
    }
    await db
      .insert(schema.leaderRoles)
      .values({ churchId, personId, role, grantedById: personId })
    console.log(`  role             granted: ${role}`)
  }

  /* ── Journey templates ── */
  for (const journey of DEFAULT_JOURNEYS) {
    const [existing] = await db
      .select()
      .from(schema.journeyTemplates)
      .where(
        and(
          eq(schema.journeyTemplates.churchId, churchId),
          eq(schema.journeyTemplates.name, journey.name)
        )
      )
      .limit(1)

    if (existing) {
      console.log(`  journey          already there: ${journey.name}`)
      continue
    }

    const [template] = await db
      .insert(schema.journeyTemplates)
      .values({
        churchId,
        name: journey.name,
        trigger: journey.trigger,
        visibilityTier: journey.visibilityTier,
        isSystemDefault: true,
      })
      .returning()

    await db.insert(schema.journeySteps).values(
      journey.steps.map((step, index) => ({
        templateId: template!.id,
        position: index,
        title: step.title,
        window: step.window,
        ownerRole: step.ownerRole as never,
        guidanceNote: step.guidanceNote,
      }))
    )
    console.log(
      `  journey          created: ${journey.name} (${journey.steps.length} steps, ${journey.visibilityTier})`
    )
  }

  console.log(`\n  Default role for new people: ${DEFAULT_ROLE}`)
  console.log('\nDone.')
  console.log(
    `\nNext: link your sign-in to this person, so Fold knows who you are:\n` +
      `  npm run db:link-account -- <your-supabase-auth-user-id> ${LEAD_PASTOR.email}`
  )
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nSeed failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
