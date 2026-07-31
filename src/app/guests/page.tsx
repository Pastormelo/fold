import { ActionForm } from '@/components/action-form'
import { AppShell } from '@/components/app-shell'
import { getGuestsPage } from '@/data/guests'

import { exitPathway, placeGuest } from './actions'

export const metadata = { title: 'Guests · Fold' }

const FIELD = {
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '8px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
} as const

/**
 * Guests — anyone not yet a member, and whether anybody is carrying them.
 *
 * Its own list rather than a filter on Family, because §6 keeps the two apart: a
 * guest is not in Family until membership. The question this page exists to answer
 * is not "who visited" but "who is following up, and what happens next" — so a
 * guest nobody is carrying is called out at the top rather than being one row among
 * many.
 */
export default async function GuestsPage() {
  const page = await getGuestsPage()

  return (
    <AppShell
      eyebrow={
        page.rows.length === 0
          ? 'Nobody yet'
          : `${page.rows.length} ${page.rows.length === 1 ? 'guest' : 'guests'}`
      }
      title="Guests"
    >
      <div className="flex flex-col gap-8">
        <p
          style={{
            background: page.pathway
              ? 'var(--surface-card)'
              : 'var(--surface-sunken)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            textWrap: 'pretty',
          }}
        >
          {page.pathwayNote}
        </p>

        {/* The one number that matters most on this page. */}
        {page.unownedCount > 0 && (
          <p
            style={{
              borderLeft: '3px solid var(--ofc-danger)',
              paddingLeft: 14,
              textWrap: 'pretty',
            }}
          >
            <strong>
              {page.unownedCount}{' '}
              {page.unownedCount === 1 ? 'guest has' : 'guests have'} nobody
              carrying them.
            </strong>{' '}
            A visitor with no named connector is the person this whole
            application exists to notice.
          </p>
        )}

        <section className="flex flex-col gap-3">
          {page.emptyNote ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {page.emptyNote}
            </p>
          ) : (
            page.rows.map((guest) => (
              <article
                key={guest.personId}
                style={{
                  background: 'var(--surface-card)',
                  borderTop: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderLeft: `3px solid ${
                    guest.unowned ? 'var(--ofc-danger)' : 'var(--brand)'
                  }`,
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a
                    href={`/people/${guest.personId}`}
                    className="font-semibold"
                    style={{ color: 'inherit' }}
                  >
                    {guest.fullName}
                  </a>
                  <span
                    className="text-[0.875rem]"
                    style={{
                      color: guest.isOverdue
                        ? 'var(--ofc-danger)'
                        : 'var(--text-muted)',
                    }}
                  >
                    {guest.contactLabel}
                  </span>
                  {guest.stageName ? (
                    <span
                      className="eyebrow"
                      style={{
                        fontSize: '0.5rem',
                        background: 'var(--brand-soft)',
                        border: '1px solid var(--brand-soft-border)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '3px 9px',
                      }}
                    >
                      {guest.stageName}
                    </span>
                  ) : (
                    <span
                      className="text-[0.875rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Not placed in the pathway
                    </span>
                  )}
                </div>

                <p
                  className="mt-1 text-[0.9375rem]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {guest.connectorName
                    ? `Carried by ${guest.connectorName}`
                    : 'Nobody is carrying them'}
                  {guest.enteredLabel && ` · since ${guest.enteredLabel}`}
                  {guest.stageOwnerRole &&
                    ` · stage owned by ${guest.stageOwnerRole}`}
                </p>

                {/* What the stage itself says happens next, rather than a
                    generic "follow up" this page invented. */}
                {guest.completionCondition && (
                  <p
                    className="mt-2 text-[0.875rem]"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    <strong>Moves on when:</strong> {guest.completionCondition}
                  </p>
                )}
                {guest.stoppingRule && (
                  <p
                    className="mt-1 text-[0.875rem]"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    <strong>Follow-up stops when:</strong> {guest.stoppingRule}
                  </p>
                )}

                {page.placeCheck.allowed && page.stages.length > 0 && (
                  <details className="mt-3">
                    <summary
                      className="cursor-pointer text-[0.875rem]"
                      style={{ color: 'var(--text-brand)' }}
                    >
                      {guest.stageName
                        ? 'Move or reassign'
                        : 'Place in a stage'}
                    </summary>
                    <div className="mt-3 flex flex-col gap-4">
                      <ActionForm
                        action={placeGuest}
                        fields={{ personId: guest.personId }}
                        label="Place them"
                      >
                        <div className="flex flex-wrap gap-2">
                          <select name="stageId" defaultValue="" style={FIELD}>
                            <option value="" disabled>
                              Which stage
                            </option>
                            {page.stages.map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {stage.position + 1}. {stage.name}
                              </option>
                            ))}
                          </select>
                          <select
                            name="connectorId"
                            defaultValue=""
                            style={FIELD}
                          >
                            <option value="">Nobody yet</option>
                            {page.connectors.map((connector) => (
                              <option key={connector.id} value={connector.id}>
                                {connector.fullName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </ActionForm>

                      {guest.stageName && (
                        <ActionForm
                          action={exitPathway}
                          fields={{ personId: guest.personId }}
                          label="Out of the pathway"
                        >
                          <input
                            name="reason"
                            placeholder="Why — became a member, stopped coming, moved away"
                            style={{ ...FIELD, maxWidth: 460 }}
                          />
                        </ActionForm>
                      )}
                    </div>
                  </details>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </AppShell>
  )
}
