/**
 * The rail — the twelve sections of the staff web app.
 *
 * Transcribed from `Fold Web.dc.html`'s nav array, ids and labels intact. Note
 * that the label is not the id: the first section is `overview` but reads
 * "Fold", and `people` reads "Family". The prototype's wording is the church's
 * wording, so it wins over anything more systematic.
 *
 * Badges are counts of things needing attention. Every one is computed from live
 * data by the Data Access Layer — the prototype derived them the same way, and
 * §8.1 is the rule that a number appearing in the interface must be counted
 * rather than stored beside what it describes.
 */

export const RAIL_SECTIONS = [
  'overview',
  'people',
  'journeys',
  'pathway',
  'care',
  'guests',
  'notes',
  'prayer',
  'milestones',
  'tasks',
  'reports',
  'admin',
] as const

export type RailSection = (typeof RAIL_SECTIONS)[number]

export const RAIL_LABELS: Record<RailSection, string> = {
  overview: 'Fold',
  people: 'Family',
  journeys: 'Journeys',
  pathway: 'Pathway',
  care: 'Confidential',
  guests: 'Guests',
  notes: 'Notes',
  prayer: 'Prayer',
  milestones: 'Milestones',
  tasks: 'Tasks',
  reports: 'Reports',
  admin: 'Setup',
}

/**
 * Which sections carry a badge at all.
 *
 * Kept explicit rather than inferred from whether a count happens to be zero:
 * "no overdue people" and "this section does not count anything" are different
 * facts, and a badge that appears only sometimes should do so because the number
 * changed, not because the section changed its mind.
 */
export const BADGED_SECTIONS: readonly RailSection[] = [
  'people',
  'journeys',
  'guests',
  'prayer',
  'tasks',
]

export function isRailSection(value: unknown): value is RailSection {
  return (
    typeof value === 'string' &&
    (RAIL_SECTIONS as readonly string[]).includes(value)
  )
}

/** The section a path maps to. `/` is the overview. */
export function sectionForPath(pathname: string): RailSection {
  const segment = pathname.split('/').filter(Boolean)[0]
  return segment !== undefined && isRailSection(segment) ? segment : 'overview'
}

export function pathForSection(section: RailSection): string {
  return section === 'overview' ? '/' : `/${section}`
}

/**
 * Sections a viewer with no pastoral care clearance should not be offered.
 *
 * The rail is the first place access shows up, and §8.4 says a control that
 * would be refused should not be presented. An administrator with no care
 * clearance sees Setup and Reports, not Confidential.
 */
export const CARE_SECTIONS: readonly RailSection[] = [
  'people',
  'journeys',
  'care',
  'guests',
  'notes',
  'prayer',
  'milestones',
]

/* ─────────────────────────── The phone's tab bar ─────────────────────────── */

/**
 * The four sections a phone shows in its bottom bar, plus everything else behind
 * "More".
 *
 * Chosen rather than invented: these are the sections a leader opens while
 * standing in a foyer. The overview answers "who needs me", Tasks is what is owed,
 * Family is who somebody is, and Journeys is where a visit gets recorded. The other
 * eight are things you do sitting down.
 *
 * Four and not five because the fifth slot is "More", and a bottom bar with six
 * targets on a 375px screen has targets too small to hit accurately.
 */
export const PHONE_SECTIONS = [
  'overview',
  'tasks',
  'people',
  'journeys',
] as const

export type PhoneSection = (typeof PHONE_SECTIONS)[number]

/** Everything not in the bottom bar, in rail order. */
export function sectionsBehindMore(
  available: readonly RailSection[]
): RailSection[] {
  return available.filter(
    (section) => !(PHONE_SECTIONS as readonly string[]).includes(section)
  )
}
