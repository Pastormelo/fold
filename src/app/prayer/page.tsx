import { ActionForm } from '@/components/action-form'
import { AppShell } from '@/components/app-shell'
import { getPrayerPage } from '@/data/prayer'

import {
  askForPrayer,
  markAnswered,
  prayForRequest,
  reopenRequest,
} from './actions'

export const metadata = { title: 'Prayer · Fold' }

const TIER_ACCENT = {
  all_leaders: 'var(--tier-all-leaders)',
  staff_and_elders: 'var(--tier-staff-and-elders)',
  elders_only: 'var(--tier-elders-only)',
} as const

const FIELD = {
  font: 'inherit',
  fontSize: '0.9375rem',
  padding: '9px 11px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
} as const

/**
 * Prayer — open requests, and the answered ones kept rather than cleared.
 *
 * Answered requests stay on this page. A church that clears them out destroys the
 * only record it has that anything came of them, which is why marking one answered
 * requires writing down what happened: in a year, that sentence is the whole value
 * of the row.
 *
 * Requests carry a tier and are redacted the way notes are. The person's name stays
 * visible; what they asked for does not.
 */
export default async function PrayerPage() {
  const page = await getPrayerPage()

  return (
    <AppShell
      eyebrow={
        page.rows.length === 0
          ? 'Nothing yet'
          : `${page.openCount} open · ${page.answeredCount} answered and kept`
      }
      title="Prayer"
    >
      <div className="flex flex-col gap-8">
        {page.hiddenNote && (
          <p
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              textWrap: 'pretty',
            }}
          >
            {page.hiddenNote}
          </p>
        )}

        {/* ── Bring one ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Bring a request</h2>
          {!page.askCheck.allowed ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {page.askCheck.note}
            </p>
          ) : page.writableTiers.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              You have no confidentiality clearance, so there is no tier you
              could file a request at.
            </p>
          ) : (
            <ActionForm
              action={askForPrayer}
              label="Record it"
              variant="primary"
            >
              <div className="flex max-w-[620px] flex-col gap-2">
                <select name="personId" defaultValue="" style={FIELD}>
                  <option value="" disabled>
                    Who is this for
                  </option>
                  {page.people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName}
                    </option>
                  ))}
                </select>
                <select name="tier" defaultValue="" style={FIELD}>
                  <option value="" disabled>
                    Who should be able to read it
                  </option>
                  {page.writableTiers.map((tier) => (
                    <option key={tier.tier} value={tier.tier}>
                      {tier.label}
                    </option>
                  ))}
                </select>
                <textarea
                  name="body"
                  rows={3}
                  placeholder="What to pray for"
                  style={FIELD}
                />
              </div>
            </ActionForm>
          )}
        </section>

        {/* ── The requests ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Requests</h2>

          {page.emptyNote ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {page.emptyNote}
            </p>
          ) : (
            page.rows.map((row) => (
              <article
                key={row.id}
                style={{
                  background:
                    row.access === 'visible'
                      ? 'var(--surface-card)'
                      : 'var(--surface-sunken)',
                  borderTop: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderLeft: `3px solid ${TIER_ACCENT[row.tier]}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  opacity: row.standing === 'answered' ? 0.85 : 1,
                }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a
                    href={`/people/${row.personId}`}
                    className="font-semibold"
                    style={{ color: 'inherit' }}
                  >
                    {row.personName}
                  </a>
                  <span
                    className="overline"
                    style={{ fontSize: '0.5rem', color: TIER_ACCENT[row.tier] }}
                  >
                    {row.tierLabel}
                  </span>
                  <span
                    className="overline"
                    style={{
                      fontSize: '0.5rem',
                      color:
                        row.standing === 'answered'
                          ? 'var(--ofc-success)'
                          : 'var(--ofc-orange-700)',
                    }}
                  >
                    {row.standing}
                  </span>
                </div>

                {row.access === 'withheld' ? (
                  <p
                    className="mt-2 italic"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {row.disclosure}
                  </p>
                ) : (
                  <>
                    <p className="mt-2" style={{ textWrap: 'pretty' }}>
                      {row.body}
                    </p>
                    <p
                      className="mt-1 text-[0.8125rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Brought by {row.askedByName} on {row.askedLabel} ·{' '}
                      {row.tallyLabel}
                    </p>

                    {row.outcome && (
                      <p
                        className="mt-3 text-[0.9375rem]"
                        style={{
                          background: 'var(--brand-soft)',
                          border: '1px solid var(--brand-soft-border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '10px 12px',
                          textWrap: 'pretty',
                        }}
                      >
                        <strong>What happened:</strong> {row.outcome}
                      </p>
                    )}

                    <div className="mt-3 flex flex-col gap-3">
                      {row.standing === 'open' && (
                        <>
                          <ActionForm
                            action={prayForRequest}
                            fields={{ requestId: row.id }}
                            label={row.mine > 0 ? 'I prayed again' : 'I prayed'}
                            disabled={row.atCap}
                            disabledReason={
                              row.atCap
                                ? 'One hundred is the cap. Go talk to them.'
                                : null
                            }
                          />
                          <ActionForm
                            action={markAnswered}
                            fields={{ requestId: row.id }}
                            label="Mark answered"
                          >
                            <input
                              name="outcome"
                              placeholder="What happened — this is the part worth keeping"
                              style={{ ...FIELD, maxWidth: 520 }}
                            />
                          </ActionForm>
                        </>
                      )}
                      {row.standing === 'answered' && (
                        <ActionForm
                          action={reopenRequest}
                          fields={{ requestId: row.id }}
                          label="Reopen"
                        />
                      )}
                    </div>
                  </>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </AppShell>
  )
}
