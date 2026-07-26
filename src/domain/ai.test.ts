import { describe, expect, it } from 'vitest'

import {
  AI_MAY,
  AI_MUST_NOT,
  ANALYSIS_CONCERNS,
  type AiRecommendation,
  DISCOVERY_SECTIONS,
  PROVENANCE,
  VERDICTS,
  aiMayPerform,
  analysisMayModify,
  danglingCitations,
  inferenceWarning,
  isPolicyGrade,
  parseAuditEntry,
  parseChurchProfileEntry,
  parseCommunicationPlan,
  parseDiscoveryAnswer,
  parseImportFinding,
  parsePathwayProposal,
  parseRecommendation,
  parseVerdict,
  recommendationsWithVerdicts,
  validateRecommendationAgainstSession,
} from './ai'

function recommendation(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: 'rec-1',
    noticed:
      'Three stages name no owner, and the connection team is already at capacity.',
    whyItMatters:
      'You said follow-up is the thing that most often slips, and an unowned stage is where it slips.',
    consequence:
      'Guests in those stages will wait on nobody in particular, and nothing will surface that they did.',
    options: ['Assign the connection team', 'Assign an elder per stage'],
    humanJudgment:
      'Whether the connection team has room for this is your judgment, not ours.',
    citedAnswerIds: ['ans-capacity', 'ans-followup'],
    ...overrides,
  }
}

describe('what the AI may and may not do', () => {
  it('allows the things §7 lists', () => {
    for (const capability of AI_MAY) {
      expect(aiMayPerform(capability).allowed, capability).toBe(true)
    }
  })

  it('refuses each thing §7 forbids, with its own reason', () => {
    const reasons = new Set<string>()
    for (const action of Object.keys(AI_MUST_NOT)) {
      const check = aiMayPerform(action)
      expect(check.allowed, action).toBe(false)
      if (check.allowed) throw new Error('unreachable')
      expect(check.refusal, action).toBeTruthy()
      reasons.add(check.refusal)
    }
    // Distinct reasons, not one generic denial repeated.
    expect(reasons.size).toBe(Object.keys(AI_MUST_NOT).length)
  })

  it('refuses publishing and touching the active pathway', () => {
    expect(aiMayPerform('publish_pathway').allowed).toBe(false)
    expect(aiMayPerform('change_active_pathway').allowed).toBe(false)
  })

  it('refuses to classify a person as a pastoral risk', () => {
    const check = aiMayPerform('classify_pastoral_risk')
    if (check.allowed) throw new Error('unreachable')
    expect(check.refusal).toMatch(/A leader who knows them decides/)
  })

  it('refuses an action nobody has classified, rather than allowing it', () => {
    // The safe default for something writing to pastoral records.
    const check = aiMayPerform('delete_all_notes')
    expect(check.allowed).toBe(false)
    if (check.allowed) throw new Error('unreachable')
    expect(check.refusal).toMatch(/not something the AI has been cleared to do/)
  })

  it('states that analysis never modifies the active pathway', () => {
    expect(analysisMayModify().allowed).toBe(false)
  })
})

describe('malformed output never reaches configuration', () => {
  // §7: "Validate before persisting."
  it('accepts a well-formed recommendation', () => {
    const result = parseRecommendation(recommendation())
    expect(result.ok).toBe(true)
  })

  it('returns errors rather than throwing', () => {
    // A bad model response must not become an exception halfway through a write.
    expect(() => parseRecommendation(null)).not.toThrow()
    expect(parseRecommendation(null).ok).toBe(false)
    expect(parseRecommendation('a string').ok).toBe(false)
    expect(parseRecommendation({}).ok).toBe(false)
  })

  it('names each field that is wrong', () => {
    const result = parseRecommendation({ id: 'rec-1' })
    if (result.ok) throw new Error('unreachable')
    expect(result.errors.length).toBeGreaterThan(1)
    expect(result.errors.join(' ')).toMatch(/noticed/)
  })
})

describe('the fifth part is not optional', () => {
  // §7: "Every significant recommendation carries five parts, and the fifth is
  // not optional."
  it('rejects a recommendation with no human judgment', () => {
    const withoutFifth = recommendation()
    delete withoutFifth.humanJudgment
    const result = parseRecommendation(withoutFifth)
    expect(result.ok).toBe(false)
  })

  it('rejects an empty human judgment', () => {
    const result = parseRecommendation(recommendation({ humanJudgment: '' }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.errors.join(' ')).toMatch(/church’s judgment/)
  })

  it('rejects whitespace padding in place of it', () => {
    // Filling a required field with spaces is the same as omitting it.
    expect(
      parseRecommendation(recommendation({ humanJudgment: '   ' })).ok
    ).toBe(false)
  })

  it('requires all five parts and at least one option', () => {
    for (const field of [
      'noticed',
      'whyItMatters',
      'consequence',
      'humanJudgment',
    ]) {
      expect(
        parseRecommendation(recommendation({ [field]: '' })).ok,
        field
      ).toBe(false)
    }
    expect(parseRecommendation(recommendation({ options: [] })).ok).toBe(false)
  })
})

describe('reasoning cites the church’s own answers', () => {
  // §7's bad-versus-good example: "Add a membership interview" versus "Because
  // your polity requires elder approval…".
  it('rejects a recommendation citing nothing', () => {
    const result = parseRecommendation(recommendation({ citedAnswerIds: [] }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.errors.join(' ')).toMatch(/general best practice/)
  })

  it('finds a citation naming an answer the church never gave', () => {
    const parsed = parseRecommendation(recommendation())
    if (!parsed.ok) throw new Error('unreachable')
    expect(
      danglingCitations(parsed.value, ['ans-capacity', 'ans-followup'])
    ).toEqual([])
    expect(danglingCitations(parsed.value, ['ans-capacity'])).toEqual([
      'ans-followup',
    ])
  })

  it('refuses a recommendation whose grounding does not exist', () => {
    // The worse of the two failures: it looks grounded.
    const parsed = parseRecommendation(recommendation())
    if (!parsed.ok) throw new Error('unreachable')
    const checked = validateRecommendationAgainstSession(parsed.value, [
      'ans-capacity',
    ])
    expect(checked.ok).toBe(false)
    if (checked.ok) throw new Error('unreachable')
    expect(checked.errors[0]).toMatch(/never gave/)
  })

  it('passes when every citation resolves', () => {
    const parsed = parseRecommendation(recommendation())
    if (!parsed.ok) throw new Error('unreachable')
    expect(
      validateRecommendationAgainstSession(parsed.value, [
        'ans-capacity',
        'ans-followup',
        'ans-other',
      ]).ok
    ).toBe(true)
  })
})

describe('verdicts', () => {
  it('offers §7’s four', () => {
    expect([...VERDICTS]).toEqual(['accepted', 'modified', 'saved', 'rejected'])
  })

  it('requires a reason on every verdict, not only a rejection', () => {
    for (const verdict of VERDICTS) {
      const result = parseVerdict({
        recommendationId: 'rec-1',
        verdict,
        reason: '',
        decidedById: 'p-melo',
        decidedAt: '2026-07-26T00:00:00Z',
      })
      expect(result.ok, verdict).toBe(false)
    }
  })

  it('accepts a documented verdict', () => {
    const result = parseVerdict({
      recommendationId: 'rec-1',
      verdict: 'rejected',
      reason: 'The connection team already does this informally and it works.',
      decidedById: 'p-melo',
      decidedAt: '2026-07-26T00:00:00Z',
    })
    expect(result.ok).toBe(true)
  })

  it('requires the person who decided', () => {
    const result = parseVerdict({
      recommendationId: 'rec-1',
      verdict: 'accepted',
      reason: 'Agreed.',
      decidedById: '',
      decidedAt: '2026-07-26T00:00:00Z',
    })
    expect(result.ok).toBe(false)
  })
})

describe('rejections stay visible', () => {
  // §7: "Rejections stay visible so a future leader can see the finding was
  // considered rather than missed."
  const parsed = parseRecommendation(recommendation())
  if (!parsed.ok) throw new Error('fixture is invalid')
  const rec: AiRecommendation = parsed.value

  it('keeps a rejected recommendation in the list, with its reason', () => {
    const rows = recommendationsWithVerdicts(
      [rec],
      [
        {
          recommendationId: 'rec-1',
          verdict: 'rejected',
          reason: 'The elders decided against it in June.',
          decidedById: 'p-melo',
          decidedAt: new Date('2026-07-26T00:00:00Z'),
        },
      ]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.verdict?.verdict).toBe('rejected')
    expect(rows[0]?.verdict?.reason).toMatch(/decided against it in June/)
    expect(rows[0]?.open).toBe(false)
  })

  it('treats an undecided recommendation as open', () => {
    const rows = recommendationsWithVerdicts([rec], [])
    expect(rows[0]?.open).toBe(true)
    expect(rows[0]?.verdict).toBeNull()
  })

  it('treats “saved for later” as still open', () => {
    const rows = recommendationsWithVerdicts(
      [rec],
      [
        {
          recommendationId: 'rec-1',
          verdict: 'saved',
          reason: 'Revisit after the autumn review.',
          decidedById: 'p-melo',
          decidedAt: new Date('2026-07-26T00:00:00Z'),
        },
      ]
    )
    expect(rows[0]?.open).toBe(true)
  })
})

describe('an inference is never policy', () => {
  // §2 and the handoff's START-HERE warning.
  it('requires an inferred value to say where it came from', () => {
    const untraceable = parseChurchProfileEntry({
      field: 'weekly_capacity',
      value: '120',
      provenance: 'inferred',
    })
    expect(untraceable.ok).toBe(false)
    if (untraceable.ok) throw new Error('unreachable')
    expect(untraceable.errors.join(' ')).toMatch(/where it came from/)
  })

  it('accepts an inference that is traceable', () => {
    const traceable = parseChurchProfileEntry({
      field: 'weekly_capacity',
      value: '120',
      provenance: 'inferred',
      sourceNote: 'Estimated from average attendance over the last quarter.',
    })
    expect(traceable.ok).toBe(true)
  })

  it('lets a confirmed value stand on its own', () => {
    expect(
      parseChurchProfileEntry({
        field: 'baptism_gates_membership',
        value: 'yes',
        provenance: 'confirmed',
      }).ok
    ).toBe(true)
  })

  it('marks inferred values as not policy grade', () => {
    expect(
      isPolicyGrade({
        field: 'a',
        value: 'b',
        provenance: 'inferred',
        sourceNote: 'guessed',
      })
    ).toBe(false)
    expect(
      isPolicyGrade({ field: 'a', value: 'b', provenance: 'confirmed' })
    ).toBe(true)
  })

  it('warns when a conclusion rests on inferences, counting them', () => {
    expect(
      inferenceWarning([{ field: 'a', value: 'b', provenance: 'confirmed' }])
    ).toBeNull()

    expect(
      inferenceWarning([
        {
          field: 'capacity',
          value: '120',
          provenance: 'inferred',
          sourceNote: 'x',
        },
      ])
    ).toMatch(/1 inferred value \(capacity\)/)

    expect(
      inferenceWarning([
        {
          field: 'capacity',
          value: '120',
          provenance: 'inferred',
          sourceNote: 'x',
        },
        { field: 'rooms', value: '4', provenance: 'inferred', sourceNote: 'y' },
      ])
    ).toMatch(/2 inferred values \(capacity, rooms\)/)
  })

  it('covers §2’s three provenances', () => {
    expect([...PROVENANCE]).toEqual(['confirmed', 'imported', 'inferred'])
  })
})

describe('import analysis quotes the line it came from', () => {
  // §7. An unquotable observation is unrepresentable.
  it('rejects a finding with no quoted line', () => {
    const result = parseImportFinding({
      concern: 'absent_stopping_rule',
      noticed: 'Stage 4 never ends.',
      whyItMatters: 'Follow-up runs forever.',
      humanJudgment: 'How long to keep trying is yours.',
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.errors.join(' ')).toMatch(/own document/)
  })

  it('accepts one that quotes the document', () => {
    const result = parseImportFinding({
      concern: 'absent_stopping_rule',
      quotedLine: 'Keep reaching out until they respond.',
      noticed: 'This stage has no stopping rule.',
      whyItMatters:
        'You said leaders burn out on follow-up, and this is the stage with no end.',
      humanJudgment: 'How many attempts is enough is your judgment.',
    })
    expect(result.ok).toBe(true)
  })

  it('still requires the human-judgment part', () => {
    const result = parseImportFinding({
      concern: 'privacy_risk',
      quotedLine: 'Share prayer requests in the weekly email.',
      noticed: 'This publishes pastoral detail.',
      whyItMatters:
        'It is the failure your confidentiality tiers exist to stop.',
      humanJudgment: '',
    })
    expect(result.ok).toBe(false)
  })

  it('covers §7’s twelve concerns', () => {
    expect(ANALYSIS_CONCERNS).toHaveLength(12)
    expect([...ANALYSIS_CONCERNS]).toContain('theological_inconsistency')
    expect([...ANALYSIS_CONCERNS]).toContain('excessive_pastoral_dependency')
    expect([...ANALYSIS_CONCERNS]).toContain('privacy_risk')
  })
})

describe('proposals rest on what the church said', () => {
  it('rejects a proposed stage citing nothing', () => {
    const result = parsePathwayProposal({
      internalName: 'Assimilation 2027',
      publicName: 'Find your place',
      philosophy: 'Nobody disappears.',
      stages: [
        {
          name: 'Membership interview',
          purpose: 'Clarify disagreement early.',
          outcome: 'A recommendation for the elders.',
          ownerRole: 'Pastoral staff',
          citedAnswerIds: [],
        },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('accepts a grounded proposal', () => {
    const result = parsePathwayProposal({
      internalName: 'Assimilation 2027',
      publicName: 'Find your place',
      philosophy: 'Nobody disappears.',
      stages: [
        {
          name: 'Membership interview',
          purpose: 'Clarify disagreement early.',
          outcome: 'A recommendation for the elders.',
          ownerRole: 'Pastoral staff',
          citedAnswerIds: ['ans-polity'],
        },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a pathway proposal with no stages', () => {
    expect(
      parsePathwayProposal({
        internalName: 'a',
        publicName: 'b',
        philosophy: 'c',
        stages: [],
      }).ok
    ).toBe(false)
  })
})

describe('a drafted communication is never sent by the AI', () => {
  it('requires the human-send flag to be true', () => {
    expect(
      parseCommunicationPlan({
        audience: 'Guests from Sunday',
        channel: 'Email',
        message: 'Sample drafted message.',
        requiresHumanSend: true,
      }).ok
    ).toBe(true)

    expect(
      parseCommunicationPlan({
        audience: 'Guests from Sunday',
        channel: 'Email',
        message: 'Sample drafted message.',
        requiresHumanSend: false,
      }).ok
    ).toBe(false)
  })
})

describe('the audit trail', () => {
  it('accepts each event §7 names', () => {
    for (const event of [
      'prompt_sent',
      'recommendation_made',
      'verdict_recorded',
      'manual_edit',
      'publication_decision',
    ]) {
      const result = parseAuditEntry({
        event,
        actorId: 'p-melo',
        occurredAt: '2026-07-26T00:00:00Z',
        detail: 'Sample detail.',
      })
      expect(result.ok, event).toBe(true)
    }
  })

  it('attributes every entry to a person, even a model-generated one', () => {
    // A row attributed to "the AI" answers nobody's question later.
    const result = parseAuditEntry({
      event: 'recommendation_made',
      actorId: '',
      occurredAt: '2026-07-26T00:00:00Z',
      detail: 'Sample detail.',
    })
    expect(result.ok).toBe(false)
  })
})

describe('discovery', () => {
  it('has §2’s seven sections', () => {
    expect(DISCOVERY_SECTIONS).toHaveLength(7)
  })

  it('requires an answer to actually contain something', () => {
    expect(
      parseDiscoveryAnswer({
        id: 'ans-1',
        section: 'membership_and_theology',
        question: 'Does baptism gate membership?',
        answer: '',
        answeredAt: '2026-07-26T00:00:00Z',
      }).ok
    ).toBe(false)
  })

  it('rejects a section it does not recognise', () => {
    expect(
      parseDiscoveryAnswer({
        id: 'ans-1',
        section: 'fundraising',
        question: 'q',
        answer: 'a',
        answeredAt: '2026-07-26T00:00:00Z',
      }).ok
    ).toBe(false)
  })
})
