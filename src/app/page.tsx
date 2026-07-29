import { CareTimeline } from '@/components/care-timeline'
import {
  getGrantedExceptions,
  getJourneyTemplates,
  getJourneys,
  getPersonRecord,
  getRestorationCases,
  getSyncCategories,
  getTierOverview,
  getUnfoldedMembers,
  getViewerSummary,
  listPeople,
} from '@/data/records'
import {
  CONFIDENTIALITY_RULES,
  CONFIDENTIALITY_RULES_NOTE,
} from '@/domain/tiers'

const TIER_ACCENT = {
  all_leaders: 'var(--tier-all-leaders)',
  staff_and_elders: 'var(--tier-staff-and-elders)',
  elders_only: 'var(--tier-elders-only)',
} as const

/**
 * One screen proving the confidentiality model end to end.
 *
 * Everything on it is read through the Data Access Layer, so switching the
 * viewer in the bar above changes what the server sends — not what the browser
 * chooses to render. Content above the viewer's tier never reaches the client.
 */
export default async function Home() {
  const [
    viewer,
    person,
    tiers,
    journeys,
    cases,
    unfolded,
    exceptions,
    syncCategories,
    journeyTemplates,
  ] = await Promise.all([
    getViewerSummary(),
    // Whoever is first in the directory. There is no fixed person any more —
    // sample data's Lena Whitcomb does not exist in a real church.
    listPeople().then((people) =>
      people[0] ? getPersonRecord(people[0].id) : null
    ),
    getTierOverview(),
    getJourneys(),
    getRestorationCases(),
    getUnfoldedMembers(),
    getGrantedExceptions(),
    getSyncCategories(),
    getJourneyTemplates(),
  ])

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-12 px-6 py-12">
      <header className="flex flex-col gap-3">
        <span className="overline">Fold · Confidentiality</span>
        <h1 style={{ fontSize: 'clamp(2rem, 1.4rem + 2.2vw, 2.9rem)' }}>
          Where the tiers get enforced
        </h1>
        <p
          className="max-w-[62ch] text-[1.0625rem]"
          style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
        >
          Signed in as {viewer.displayName} — {viewer.clearanceLabel}. Nothing
          here is hidden with CSS: the server decides what you may read and
          sends only that.
        </p>
      </header>

      {/* ── The tier table, with counts computed from the leader records ── */}
      <section className="flex flex-col gap-4">
        <h2 style={{ fontSize: '1.375rem' }}>Three tiers</h2>
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
                boxShadow: 'var(--shadow-sm)',
                padding: '18px 20px',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="overline"
                  style={{
                    color: TIER_ACCENT[tier.tier],
                    fontSize: '0.625rem',
                  }}
                >
                  {tier.name}
                </span>
                {tier.viewerIsAtThisTier && (
                  <span
                    className="overline"
                    style={{
                      fontSize: '0.5625rem',
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
              <p
                className="mt-2 text-[0.9375rem] font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {tier.who}
              </p>
              {/* Computed, not a literal — the prototype hardcoded these. */}
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

      {/* ── A person record ── */}
      {person && (
        <section
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            padding: '24px 26px',
          }}
        >
          <div className="flex flex-wrap items-center gap-4">
            <div
              aria-hidden
              className="grid place-items-center"
              style={{
                width: 52,
                height: 52,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--brand-soft)',
                border: '1px solid var(--brand-soft-border)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                color: 'var(--text-brand)',
              }}
            >
              {person.initials}
            </div>
            <div>
              <h2 style={{ fontSize: '1.5rem' }}>{person.fullName}</h2>
              <p
                className="text-[0.9375rem]"
                style={{
                  color: person.foldIsUnassigned
                    ? 'var(--text-brand)'
                    : 'var(--text-muted)',
                }}
              >
                {person.since} · {person.foldLabel}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="overline" style={{ fontSize: '0.625rem' }}>
                Household
              </dt>
              <dd className="mt-1 text-[0.9375rem]">
                {person.household.length > 0
                  ? person.household.join(' · ')
                  : 'No household on file'}
              </dd>
            </div>
            <div>
              <dt className="overline" style={{ fontSize: '0.625rem' }}>
                Serving
              </dt>
              <dd className="mt-1 text-[0.9375rem]">{person.serving}</dd>
            </div>
            <div>
              <dt className="overline" style={{ fontSize: '0.625rem' }}>
                Groups
              </dt>
              <dd className="mt-1 text-[0.9375rem]">{person.groups}</dd>
            </div>
          </dl>

          <div className="mt-7">
            <CareTimeline care={person.care} />
          </div>

          {/* §8.3 and §8.4: the gate and its note come from one check, and a
              refused action is not offered as a disabled-looking control. */}
          <div className="mt-6">
            {person.logNoteCheck.allowed && person.writableTiers.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    fontSize: '0.875rem',
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'var(--brand)',
                    color: 'var(--on-brand)',
                    cursor: 'pointer',
                  }}
                >
                  Log care
                </button>
                <span
                  className="text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  You can file at:{' '}
                  {person.writableTiers.map((tier) => tier.label).join(', ')}
                </span>
              </div>
            ) : (
              <p
                className="text-[0.9375rem]"
                style={{ color: 'var(--text-muted)' }}
              >
                {person.logNoteCheck.note}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── The journeys this church has configured ── */}
      {journeyTemplates.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 style={{ fontSize: '1.375rem' }}>Journey templates</h2>
          <p
            className="max-w-[62ch] text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            What this church responds to, and how. Defaults can be edited but
            never deleted — the situation does not stop happening because the
            journey was removed.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {journeyTemplates.map((template) => (
              <article
                key={template.name}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  opacity: template.readable ? 1 : 0.6,
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{template.name}</span>
                  {template.isSystemDefault && (
                    <span
                      className="overline"
                      style={{ fontSize: '0.5625rem', letterSpacing: '0.1em' }}
                    >
                      Default
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 text-[0.875rem]"
                  style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
                >
                  {template.trigger}
                </p>
                <p
                  className="mt-2 text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {template.stepCount}{' '}
                  {template.stepCount === 1 ? 'step' : 'steps'} ·{' '}
                  {template.tierLabel}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── Running care journeys ── */}
      <section className="flex flex-col gap-4">
        <h2 style={{ fontSize: '1.375rem' }}>Journeys</h2>
        <p
          className="max-w-[62ch] text-[0.9375rem]"
          style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
        >
          A journey&rsquo;s last step is its stopping rule, so follow-up always
          ends — visibly, rather than by being forgotten. Due dates are computed
          from the current step&rsquo;s window, never stored.
        </p>
        {journeys.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
            No journeys running. That is a fact about the record, not about the
            church — one starts when a life event is logged.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {journeys.map((journey) => (
            <article
              key={journey.instanceId}
              style={{
                background:
                  journey.access === 'visible'
                    ? 'var(--surface-card)'
                    : 'var(--surface-sunken)',
                borderTop: '1px solid var(--border-subtle)',
                borderRight: '1px solid var(--border-subtle)',
                borderBottom: '1px solid var(--border-subtle)',
                borderLeft: `3px solid ${
                  journey.access === 'visible' && journey.isOverdue
                    ? 'var(--ofc-danger)'
                    : 'var(--border-strong)'
                }`,
                borderRadius: 'var(--radius-md)',
                padding: '16px 18px',
              }}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{journey.personName}</span>
                {journey.access === 'visible' && (
                  <span
                    className="text-[0.9375rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {journey.templateName} · {journey.stepLabel}
                  </span>
                )}
                <span
                  className="overline"
                  style={{ fontSize: '0.5625rem', letterSpacing: '0.1em' }}
                >
                  {journey.tierLabel}
                </span>
                {journey.access === 'visible' && journey.isOverdue && (
                  <span
                    className="overline"
                    style={{
                      fontSize: '0.5625rem',
                      color: 'var(--ofc-paper)',
                      background: 'var(--ofc-danger)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '3px 8px',
                    }}
                  >
                    Overdue
                  </span>
                )}
              </div>

              {journey.access === 'visible' ? (
                <>
                  <p
                    className="mt-2 text-[0.9375rem]"
                    style={{
                      color: journey.isOverdue
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                      textWrap: 'pretty',
                    }}
                  >
                    {journey.summary}
                  </p>
                  {journey.guidanceNote && (
                    <p
                      className="mt-2 text-[0.875rem] italic"
                      style={{
                        color: 'var(--text-muted)',
                        textWrap: 'pretty',
                      }}
                    >
                      {journey.guidanceNote}
                    </p>
                  )}
                </>
              ) : (
                <p
                  className="mt-2 text-[0.9375rem] italic"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  {journey.disclosure}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ── Restoration cases ── */}
      <section className="flex flex-col gap-4">
        <h2 style={{ fontSize: '1.375rem' }}>Restoration</h2>
        <p
          className="max-w-[62ch] text-[0.9375rem]"
          style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
        >
          Being an elder does not open every case. Switch to Tomás Iglesias, an
          elder with full clearance, to see what a case he does not carry looks
          like.
        </p>
        {cases.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No restoration cases.</p>
        )}
        <div className="flex flex-col gap-3">
          {cases.map((restorationCase) => (
            <article
              key={restorationCase.id}
              style={{
                background:
                  restorationCase.access === 'visible'
                    ? 'var(--surface-card)'
                    : 'var(--surface-sunken)',
                border:
                  restorationCase.access === 'visible'
                    ? '1px solid var(--border-subtle)'
                    : '1px dashed var(--border-strong)',
                borderRadius: 'var(--radius-lg)',
                padding: '18px 20px',
              }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 style={{ fontSize: '1.0625rem' }}>
                  {restorationCase.access === 'visible'
                    ? restorationCase.personName
                    : restorationCase.kind}
                </h3>
                {restorationCase.sealed && (
                  <span
                    className="overline"
                    style={{
                      fontSize: '0.5625rem',
                      background: 'var(--surface-sunken)',
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
                  {restorationCase.stepLabel}
                </span>
              </div>

              {restorationCase.access === 'visible' ? (
                <div className="mt-3 flex flex-col gap-3">
                  <p
                    className="text-[0.9375rem]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {restorationCase.foldName} · carried by{' '}
                    {restorationCase.leadElderName} and{' '}
                    {restorationCase.secondElderName}
                  </p>
                  <div>
                    <span className="overline" style={{ fontSize: '0.625rem' }}>
                      The plan
                    </span>
                    <ul className="mt-1 list-disc pl-5 text-[0.9375rem]">
                      {restorationCase.plan.map((line) => (
                        <li
                          key={line}
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <span
                        className="overline"
                        style={{ fontSize: '0.625rem' }}
                      >
                        Knows
                      </span>
                      <p className="mt-1 text-[0.9375rem]">
                        {restorationCase.knows.join(' · ')}
                      </p>
                    </div>
                    <div>
                      <span
                        className="overline"
                        style={{ fontSize: '0.625rem' }}
                      >
                        Deliberately does not know
                      </span>
                      <p className="mt-1 text-[0.9375rem]">
                        {restorationCase.doesNotKnow.join(' · ')}
                      </p>
                    </div>
                  </div>
                  {restorationCase.decisionQuestion && (
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
                      <strong>The question:</strong>{' '}
                      {restorationCase.decisionQuestion}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {restorationCase.outcome && (
                    <p
                      className="text-[0.9375rem]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {restorationCase.outcome}
                    </p>
                  )}
                  <p
                    className="text-[0.9375rem] italic"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {restorationCase.disclosure}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ── Granted exceptions: the review list for the elder board ── */}
      {exceptions.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 style={{ fontSize: '1.375rem' }}>Access beyond role</h2>
          <p
            className="max-w-[62ch] text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            {exceptions.length === 1
              ? '1 person has access their role does not carry.'
              : `${exceptions.length} grants give someone access their role does not carry.`}{' '}
            An administrator can grant anything; the safeguard is that every
            exception is listed here with who granted it and why.
          </p>
          <div className="flex flex-col gap-3">
            {exceptions.map((exception) => (
              <div
                key={`${exception.personName}-${exception.what}`}
                style={{
                  background: 'var(--surface-card)',
                  borderTop: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderLeft: `3px solid ${
                    exception.selfGranted
                      ? 'var(--ofc-warning)'
                      : 'var(--border-strong)'
                  }`,
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{exception.personName}</span>
                  <span
                    className="overline"
                    style={{ fontSize: '0.5625rem', letterSpacing: '0.1em' }}
                  >
                    {exception.what}
                  </span>
                  {exception.selfGranted && (
                    <span
                      className="overline"
                      style={{
                        fontSize: '0.5625rem',
                        color: 'var(--ofc-ink)',
                        background: 'var(--ofc-warning)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '3px 8px',
                      }}
                    >
                      Self-granted
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Granted by {exception.grantedByName} on {exception.grantedAt}
                </p>
                <p
                  className="mt-2 text-[0.9375rem]"
                  style={{
                    color: 'var(--text-secondary)',
                    textWrap: 'pretty',
                  }}
                >
                  {exception.reason}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Members with no fold ── */}
      {unfolded.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.375rem' }}>Members with no fold</h2>
          <p
            className="max-w-[62ch] text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            {unfolded.length === 1
              ? '1 member is not under a named elder.'
              : `${unfolded.length} members are not under a named elder.`}{' '}
            An open pastoral matter, not a data gap.
          </p>
          <ul className="list-none p-0">
            {unfolded.map((member) => (
              <li key={member.id} className="text-[0.9375rem]">
                {member.fullName}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Planning Center sync scope ── */}
      <section className="flex flex-col gap-4">
        <h2 style={{ fontSize: '1.375rem' }}>Planning Center</h2>
        <p
          className="max-w-[62ch] text-[0.9375rem]"
          style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
        >
          Planning Center is the system of record for people. Fold is the system
          of work for pathways and care. Not everything syncs because it can —
          each category is a decision with a direction.
        </p>
        <div className="flex flex-col gap-2">
          {syncCategories.map((category) => (
            <div
              key={category.label}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
              style={{
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 10,
              }}
            >
              <span className="font-semibold" style={{ minWidth: '15rem' }}>
                {category.label}
              </span>
              <span
                className="overline"
                style={{
                  fontSize: '0.5625rem',
                  letterSpacing: '0.1em',
                  color: category.switchable
                    ? 'var(--text-muted)'
                    : 'var(--ofc-danger)',
                }}
              >
                {category.directionLabel}
              </span>
              {category.switchable ? (
                <span
                  className="text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {category.enabled ? 'On' : 'Off by default'}
                  {category.conflictNote ? ` · ${category.conflictNote}` : ''}
                </span>
              ) : (
                <span
                  className="text-[0.8125rem]"
                  style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
                >
                  {category.fixedReason}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── The practices ── */}
      <section className="flex flex-col gap-4">
        <h2 style={{ fontSize: '1.375rem' }}>The practice behind the tiers</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {CONFIDENTIALITY_RULES.map(({ rule, why }) => (
            <div
              key={rule}
              style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 14 }}
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

      <footer
        className="border-t pt-6 text-[0.875rem]"
        style={{
          borderColor: 'var(--border-default)',
          color: 'var(--text-muted)',
        }}
      >
        Sample data for One Family Church, not product configuration. The rules
        this screen enforces are in HANDOFF.md §3.
      </footer>
    </main>
  )
}
