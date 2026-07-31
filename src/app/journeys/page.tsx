import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { AppShell } from '@/components/app-shell'
import { getJourneyWorkspace } from '@/data/journeys'

import { closeJourney, recordJourneyStep, startJourney } from './actions'

export const metadata = { title: 'Journeys · Fold' }

const FIELD = {
  font: 'inherit',
  fontSize: '0.9375rem',
  padding: '9px 11px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
} as const

/**
 * Journeys — the care that is running, and the step each one is waiting on.
 *
 * A journey's last step is its stopping rule, so follow-up ends visibly rather
 * than by being forgotten. That is why a finished journey stays on this page
 * instead of disappearing: "we did all four visits and stopped" and "somebody
 * forgot" look identical once the row is gone.
 *
 * Only the step that is actually waiting is offered. The domain refuses
 * out-of-order writes, and rendering four steps while three of them would be
 * refused is the §8.4 failure.
 */
export default async function JourneysPage() {
  const workspace = await getJourneyWorkspace()

  return (
    <AppShell
      eyebrow={
        workspace.overdueCount > 0
          ? `${workspace.overdueCount} overdue`
          : 'Nothing overdue'
      }
      title="Journeys"
    >
      <div className="flex flex-col gap-8">
        {/* ── Start one ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Start a journey</h2>
          {!workspace.logCheck.allowed ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {workspace.logCheck.note}
            </p>
          ) : workspace.people.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              Nobody is in the directory yet. Add somebody on Family first.
            </p>
          ) : (
            <>
              <p
                className="text-[0.9375rem]"
                style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
              >
                Whoever is named carries it, and every step is due a fixed time
                after the start. The last step is where follow-up ends, so a
                journey has a stopping point rather than running until somebody
                loses track.
              </p>
              <ActionForm action={startJourney} label="Start" variant="primary">
                <div className="flex max-w-[620px] flex-col gap-2">
                  <select name="personId" defaultValue="" style={FIELD}>
                    <option value="" disabled>
                      Who is this for
                    </option>
                    {workspace.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.fullName}
                      </option>
                    ))}
                  </select>
                  <select name="templateId" defaultValue="" style={FIELD}>
                    <option value="" disabled>
                      Which journey
                    </option>
                    {/* A template with no steps is not offered, because starting
                        it would ask nobody to do anything. */}
                    {workspace.templates
                      .filter((template) => template.startable)
                      .map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} — {template.trigger} (
                          {template.stepCountLabel})
                        </option>
                      ))}
                  </select>
                  <select name="ownerId" defaultValue="" style={FIELD}>
                    <option value="">You carry it</option>
                    {workspace.leaders.map((leader) => (
                      <option key={leader.id} value={leader.id}>
                        {leader.fullName} carries it
                      </option>
                    ))}
                  </select>
                </div>
              </ActionForm>
            </>
          )}
        </section>

        {/* ── Running ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Running now</h2>

          {workspace.emptyNote && (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {workspace.emptyNote}
            </p>
          )}

          {workspace.journeys.map((journey) => (
            <article
              key={journey.instanceId}
              style={{
                background: 'var(--surface-card)',
                borderTop: '1px solid var(--border-subtle)',
                borderRight: '1px solid var(--border-subtle)',
                borderBottom: '1px solid var(--border-subtle)',
                borderLeft: `3px solid ${
                  journey.isFinished
                    ? 'var(--border-strong)'
                    : journey.isOverdue
                      ? 'var(--ofc-danger)'
                      : 'var(--brand)'
                }`,
                borderRadius: 'var(--radius-md)',
                padding: '16px 18px',
                opacity: journey.isFinished ? 0.8 : 1,
              }}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link
                  href={`/people/${journey.personId}`}
                  className="font-semibold"
                  style={{ color: 'inherit' }}
                >
                  {journey.personName}
                </Link>
                <span
                  className="text-[0.9375rem]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {journey.templateName}
                </span>
                <span
                  className="text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {journey.stepLabel} · {journey.tierLabel} ·{' '}
                  {journey.ownerName}
                </span>
              </div>

              <p
                className="mt-2 text-[0.9375rem]"
                style={{
                  color: journey.isOverdue
                    ? 'var(--ofc-danger)'
                    : 'var(--text-secondary)',
                  textWrap: 'pretty',
                }}
              >
                {journey.summary}
              </p>

              {/* ── The step that is waiting ── */}
              {journey.waiting && workspace.logCheck.allowed && (
                <div
                  className="mt-4"
                  style={{
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                  }}
                >
                  <span className="eyebrow" style={{ fontSize: '0.5625rem' }}>
                    Waiting · due {journey.waiting.windowLabel.toLowerCase()} ·{' '}
                    {journey.waiting.ownerRole}
                  </span>
                  <p className="mt-2 font-semibold">{journey.waiting.title}</p>
                  {/* The guidance the church wrote when it designed the journey,
                      shown at the moment somebody is about to do the thing. */}
                  {journey.waiting.guidanceNote && (
                    <p
                      className="mt-1 text-[0.875rem] italic"
                      style={{
                        color: 'var(--text-muted)',
                        textWrap: 'pretty',
                      }}
                    >
                      {journey.waiting.guidanceNote}
                    </p>
                  )}

                  <div className="mt-3 flex flex-col gap-4">
                    <ActionForm
                      action={recordJourneyStep}
                      fields={{
                        instanceId: journey.instanceId,
                        stepId: journey.waiting.stepId,
                        kind: 'done',
                      }}
                      label="Log it"
                      variant="primary"
                    >
                      <textarea
                        name="detail"
                        rows={2}
                        placeholder="What happened — the record of the conversation is the point"
                        style={{ ...FIELD, maxWidth: 560 }}
                      />
                    </ActionForm>

                    <ActionForm
                      action={recordJourneyStep}
                      fields={{
                        instanceId: journey.instanceId,
                        stepId: journey.waiting.stepId,
                        kind: 'skipped',
                      }}
                      label="Skip this step"
                    >
                      <input
                        name="detail"
                        placeholder="Why — a skip with no reason cannot be told apart from a step nobody got to"
                        style={{ ...FIELD, maxWidth: 560 }}
                      />
                    </ActionForm>
                  </div>
                </div>
              )}

              {/* ── What has already been recorded ── */}
              {journey.history.length > 0 && (
                <details className="mt-3">
                  <summary
                    className="cursor-pointer text-[0.875rem]"
                    style={{ color: 'var(--text-brand)' }}
                  >
                    {journey.history.length === 1
                      ? '1 step recorded'
                      : `${journey.history.length} steps recorded`}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {journey.history.map((entry, index) => (
                      <li
                        key={`${entry.stepTitle}-${index}`}
                        className="text-[0.875rem]"
                      >
                        <span className="font-semibold">{entry.stepTitle}</span>{' '}
                        <span
                          style={{
                            color:
                              entry.kind === 'skipped'
                                ? 'var(--ofc-warning)'
                                : 'var(--tier-all-leaders)',
                          }}
                        >
                          {entry.kind === 'skipped' ? 'skipped' : 'done'}
                        </span>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>
                          · {entry.byName} · {entry.when}
                        </span>
                        <span
                          className="block"
                          style={{
                            color: 'var(--text-secondary)',
                            textWrap: 'pretty',
                          }}
                        >
                          {entry.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {journey.closedReason && (
                <p
                  className="mt-3 text-[0.875rem] italic"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  Closed early: {journey.closedReason}
                </p>
              )}

              {!journey.isFinished && workspace.logCheck.allowed && (
                <details className="mt-3">
                  <summary
                    className="cursor-pointer text-[0.875rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    End it early
                  </summary>
                  <div className="mt-3">
                    <ActionForm
                      action={closeJourney}
                      fields={{ instanceId: journey.instanceId }}
                      label="Close this journey"
                    >
                      <input
                        name="reason"
                        placeholder="Why — otherwise nobody can tell later whether care finished, was declined, or was dropped"
                        style={{ ...FIELD, maxWidth: 560 }}
                      />
                    </ActionForm>
                  </div>
                </details>
              )}
            </article>
          ))}

          {/* Counted, never listed. Knowing care is happening is not the same as
              reading what it involves. */}
          {workspace.withheldCount > 0 && (
            <p
              className="text-[0.9375rem]"
              style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
            >
              {workspace.withheldCount}{' '}
              {workspace.withheldCount === 1 ? 'journey is' : 'journeys are'}{' '}
              running at a tier above yours. Somebody is carrying them; you can
              see that they exist, not what they involve.
            </p>
          )}
        </section>

        {/* ── Templates ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Templates</h2>
          <p
            className="text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            The ones that ship with Fold can be edited but never removed — the
            situation a journey covers does not stop happening because the
            journey was deleted.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workspace.templates.map((template) => (
              <div
                key={template.id}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <p className="font-semibold">{template.name}</p>
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
                  {template.stepCountLabel} · {template.tierLabel}
                  {!template.startable && ' · no steps yet'}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
