import { ActionForm } from '@/components/action-form'
import { PageShell } from '@/components/page-shell'
import {
  getRestorationCases,
  getRestorationOptions,
  getTierOverview,
} from '@/data/records'

import {
  advanceRestorationCase,
  logCaseNote,
  openRestorationCase,
  sealRestorationCase,
} from './actions'
import {
  CONFIDENTIALITY_RULES,
  CONFIDENTIALITY_RULES_NOTE,
} from '@/domain/tiers'

export const metadata = { title: 'Confidential · Fold' }

const FIELD = {
  font: 'inherit',
  fontSize: '0.9375rem',
  padding: '9px 11px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
} as const

const TIER_ACCENT = {
  all_leaders: 'var(--tier-all-leaders)',
  staff_and_elders: 'var(--tier-staff-and-elders)',
  elders_only: 'var(--tier-elders-only)',
} as const

/**
 * Confidential — restoration cases, the tiers, and the practices behind them.
 * The three tabs of the prototype's Confidential view, as sections.
 */
export default async function ConfidentialPage() {
  const [cases, tiers, options] = await Promise.all([
    getRestorationCases(),
    getTierOverview(),
    getRestorationOptions(),
  ])

  return (
    <PageShell
      eyebrow={`${cases.length} ${cases.length === 1 ? 'case' : 'cases'}`}
      title="Confidential"
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Restoration</h2>
          {cases.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              No restoration cases. That is worth being glad about rather than
              treating as an empty list.
            </p>
          ) : (
            cases.map((entry) => (
              <article
                key={entry.id}
                style={{
                  background:
                    entry.access === 'visible'
                      ? 'var(--surface-card)'
                      : 'var(--surface-sunken)',
                  border:
                    entry.access === 'visible'
                      ? '1px solid var(--border-subtle)'
                      : '1px dashed var(--border-strong)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '18px 20px',
                }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <h3 style={{ fontSize: '1.0625rem' }}>
                    {entry.access === 'visible' ? entry.personName : entry.kind}
                  </h3>
                  {entry.sealed && (
                    <span
                      className="eyebrow"
                      style={{
                        fontSize: '0.5625rem',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '3px 9px',
                      }}
                    >
                      Sealed
                    </span>
                  )}
                  <span
                    className="text-[0.8125rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {entry.stepLabel}
                  </span>
                </div>

                {entry.access === 'visible' ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <p
                      className="text-[0.9375rem]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {entry.foldName} · carried by {entry.leadElderName} and{' '}
                      {entry.secondElderName}
                    </p>
                    {entry.plan.length > 0 && (
                      <div>
                        <span
                          className="eyebrow"
                          style={{ fontSize: '0.5625rem' }}
                        >
                          The plan
                        </span>
                        <ul className="mt-1 list-disc pl-5 text-[0.9375rem]">
                          {entry.plan.map((line) => (
                            <li
                              key={line}
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <span
                          className="eyebrow"
                          style={{ fontSize: '0.5625rem' }}
                        >
                          Knows
                        </span>
                        <p className="mt-1 text-[0.9375rem]">
                          {entry.knows.join(' · ')}
                        </p>
                      </div>
                      <div>
                        <span
                          className="eyebrow"
                          style={{ fontSize: '0.5625rem' }}
                        >
                          Deliberately does not know
                        </span>
                        <p className="mt-1 text-[0.9375rem]">
                          {entry.doesNotKnow.join(' · ')}
                        </p>
                      </div>
                    </div>
                    {entry.decisionQuestion && (
                      <p
                        className="text-[0.9375rem]"
                        style={{
                          background: 'var(--brand-soft)',
                          border: '1px solid var(--brand-soft-border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 14px',
                          textWrap: 'pretty',
                        }}
                      >
                        <strong>The question:</strong> {entry.decisionQuestion}
                      </p>
                    )}

                    {/* Only on an open case, and only for an elder. A sealed
                        case is a record; there is nothing to do to it. */}
                    {options.isElder && !entry.sealed && (
                      <div className="mt-2 flex flex-col gap-4">
                        <ActionForm
                          action={logCaseNote}
                          fields={{ caseId: entry.id }}
                          label="Log a conversation"
                          variant="primary"
                        >
                          <textarea
                            name="body"
                            rows={3}
                            placeholder="What was said. Written at elders-only, and written as though they will read it — §3 says they may ask."
                            style={{ ...FIELD, maxWidth: 620 }}
                          />
                        </ActionForm>

                        <details>
                          <summary
                            className="cursor-pointer text-[0.875rem]"
                            style={{ color: 'var(--text-brand)' }}
                          >
                            Move it to the next step
                          </summary>
                          <div className="mt-3">
                            <ActionForm
                              action={advanceRestorationCase}
                              fields={{ caseId: entry.id }}
                              label="Record the step"
                            >
                              <div className="flex max-w-[620px] flex-col gap-2">
                                <input
                                  name="stepLabel"
                                  placeholder="What this step is called"
                                  style={FIELD}
                                />
                                <input
                                  name="status"
                                  placeholder="Where it stands now"
                                  style={FIELD}
                                />
                                <input
                                  name="decisionQuestion"
                                  placeholder="The question the elders need to answer, if there is one"
                                  style={FIELD}
                                />
                              </div>
                            </ActionForm>
                          </div>
                        </details>

                        <details>
                          <summary
                            className="cursor-pointer text-[0.875rem]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Close and seal it
                          </summary>
                          <div className="mt-3">
                            <ActionForm
                              action={sealRestorationCase}
                              fields={{ caseId: entry.id }}
                              label="Seal this case"
                            >
                              <input
                                name="outcome"
                                placeholder="How it ended — the one part that stays readable below the tier"
                                style={{ ...FIELD, maxWidth: 620 }}
                              />
                            </ActionForm>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    {entry.outcome && (
                      <p
                        className="text-[0.9375rem]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {entry.outcome}
                      </p>
                    )}
                    <p
                      className="text-[0.9375rem] italic"
                      style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                    >
                      {entry.disclosure}
                    </p>
                  </div>
                )}
              </article>
            ))
          )}
        </section>

        {/* ── Open one ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Open a case</h2>
          {!options.isElder ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {options.refusal}
            </p>
          ) : options.elderNote ? (
            <p
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                textWrap: 'pretty',
              }}
            >
              {options.elderNote}
            </p>
          ) : (
            <>
              <p
                className="text-[0.9375rem]"
                style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
              >
                Two elders, never one. It protects the person as much as the
                church — one elder alone has no witness to what was said, and
                neither does the person being restored. Nothing here is ever
                deleted; closing a case seals it.
              </p>
              <ActionForm
                action={openRestorationCase}
                label="Open the case"
                variant="primary"
              >
                <div className="flex max-w-[640px] flex-col gap-2">
                  <select name="personId" defaultValue="" style={FIELD}>
                    <option value="" disabled>
                      Who is this about
                    </option>
                    {options.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.fullName}
                      </option>
                    ))}
                  </select>

                  <div className="flex flex-wrap gap-2">
                    {/* Only people `pairElders` would accept. */}
                    <select
                      name="leadElderId"
                      defaultValue=""
                      style={{ ...FIELD, flex: 1, minWidth: 200 }}
                    >
                      <option value="" disabled>
                        Lead elder
                      </option>
                      {options.elders.map((elder) => (
                        <option key={elder.id} value={elder.id}>
                          {elder.fullName}
                        </option>
                      ))}
                    </select>
                    <select
                      name="secondElderId"
                      defaultValue=""
                      style={{ ...FIELD, flex: 1, minWidth: 200 }}
                    >
                      <option value="" disabled>
                        Second elder
                      </option>
                      {options.elders.map((elder) => (
                        <option key={elder.id} value={elder.id}>
                          {elder.fullName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <input
                      name="stepLabel"
                      placeholder="Where it is up to — your church names its own stages"
                      style={{ ...FIELD, flex: 1, minWidth: 200 }}
                    />
                    <input
                      name="status"
                      placeholder="Where it stands"
                      style={{ ...FIELD, flex: 1, minWidth: 200 }}
                    />
                  </div>

                  <textarea
                    name="plan"
                    rows={3}
                    placeholder="The plan, one line each"
                    style={FIELD}
                  />

                  <div className="flex flex-wrap gap-2">
                    <textarea
                      name="knows"
                      rows={3}
                      placeholder="Who knows, one line each"
                      style={{ ...FIELD, flex: 1, minWidth: 200 }}
                    />
                    {/* §8.8 applied to people: a decision not to tell somebody
                        is a decision, and it has to be as visible as the
                        people who were told. */}
                    <textarea
                      name="doesNotKnow"
                      rows={3}
                      placeholder="Who deliberately does not know, one line each"
                      style={{ ...FIELD, flex: 1, minWidth: 200 }}
                    />
                  </div>

                  <input
                    name="decisionQuestion"
                    placeholder="The question the elders need to answer, if there is one"
                    style={FIELD}
                  />
                </div>
              </ActionForm>
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Three tiers</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {tiers.map((tier) => (
              <article
                key={tier.tier}
                style={{
                  background: 'var(--surface-card)',
                  border: tier.viewerIsAtThisTier
                    ? `2px solid ${TIER_ACCENT[tier.tier]}`
                    : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px 18px',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="eyebrow"
                    style={{
                      fontSize: '0.5625rem',
                      color: TIER_ACCENT[tier.tier],
                    }}
                  >
                    {tier.name}
                  </span>
                  {tier.viewerIsAtThisTier && (
                    <span
                      className="eyebrow"
                      style={{
                        fontSize: '0.5rem',
                        color: 'var(--on-brand)',
                        background: 'var(--brand)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '3px 8px',
                      }}
                    >
                      You
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[0.9375rem] font-semibold">
                  {tier.who}
                </p>
                <p
                  className="mt-1 text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {tier.leaderCountLabel} at this tier
                </p>
                <p
                  className="mt-3 text-[0.875rem]"
                  style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
                >
                  {tier.sees}
                </p>
                <p
                  className="mt-2 text-[0.875rem]"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  <strong>Cannot see:</strong> {tier.cannot}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 style={{ fontSize: '1.125rem' }}>
            The practice behind the tiers
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CONFIDENTIALITY_RULES.map(({ rule, why }) => (
              <div
                key={rule}
                style={{
                  borderLeft: '3px solid var(--brand)',
                  paddingLeft: 14,
                }}
              >
                <p className="font-semibold">{rule}</p>
                <p
                  className="mt-1 text-[0.875rem]"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  {why}
                </p>
              </div>
            ))}
          </div>
          <p
            className="text-[0.9375rem] italic"
            style={{ color: 'var(--text-secondary)' }}
          >
            {CONFIDENTIALITY_RULES_NOTE}
          </p>
        </section>
      </div>
    </PageShell>
  )
}
