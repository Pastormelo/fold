import { describe, expect, it } from 'vitest'

import {
  BADGED_SECTIONS,
  CARE_SECTIONS,
  RAIL_LABELS,
  RAIL_SECTIONS,
  isRailSection,
  pathForSection,
  sectionForPath,
} from './navigation'

describe('the rail', () => {
  it('has the twelve sections from the prototype, in order', () => {
    expect([...RAIL_SECTIONS]).toEqual([
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
    ])
  })

  it('keeps the prototype’s labels, which are not the ids', () => {
    // The church's wording wins over anything more systematic.
    expect(RAIL_LABELS.overview).toBe('Fold')
    expect(RAIL_LABELS.people).toBe('Family')
    expect(RAIL_LABELS.care).toBe('Confidential')
    expect(RAIL_LABELS.admin).toBe('Setup')
  })

  it('labels every section', () => {
    for (const section of RAIL_SECTIONS) {
      expect(RAIL_LABELS[section], section).toBeTruthy()
    }
  })

  it('recognises only real sections', () => {
    expect(isRailSection('people')).toBe(true)
    expect(isRailSection('family')).toBe(false)
    expect(isRailSection(null)).toBe(false)
  })
})

describe('paths', () => {
  it('maps the overview to the root', () => {
    expect(pathForSection('overview')).toBe('/')
    expect(sectionForPath('/')).toBe('overview')
  })

  it('round-trips every section', () => {
    for (const section of RAIL_SECTIONS) {
      expect(sectionForPath(pathForSection(section)), section).toBe(section)
    }
  })

  it('falls back to the overview for anything unrecognised', () => {
    expect(sectionForPath('/nonsense')).toBe('overview')
    expect(sectionForPath('')).toBe('overview')
  })

  it('ignores deeper segments', () => {
    // /people/<id> is still the Family section.
    expect(sectionForPath('/people/abc-123')).toBe('people')
  })
})

describe('badges and care sections', () => {
  it('badges only sections that count something', () => {
    for (const section of BADGED_SECTIONS) {
      expect(RAIL_SECTIONS).toContain(section)
    }
    // The overview does not badge itself, and Setup counts nothing.
    expect(BADGED_SECTIONS).not.toContain('overview')
    expect(BADGED_SECTIONS).not.toContain('admin')
  })

  it('lists the sections that need care clearance', () => {
    // §8.4: a control that would be refused should not be offered, and the rail
    // is the first place that shows.
    expect(CARE_SECTIONS).toContain('care')
    expect(CARE_SECTIONS).toContain('people')
    expect(CARE_SECTIONS).not.toContain('admin')
    expect(CARE_SECTIONS).not.toContain('reports')
    for (const section of CARE_SECTIONS) {
      expect(RAIL_SECTIONS).toContain(section)
    }
  })
})
