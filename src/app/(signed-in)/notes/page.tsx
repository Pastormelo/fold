import { ActionForm } from '@/components/action-form'
import { PageShell } from '@/components/page-shell'
import { getNotesPage } from '@/data/notes'

import { logCareNote } from './actions'

export const metadata = { title: 'Notes · Fold' }

const TIER_ACCENT = {
  all_leaders: 'var(--tier-all-leaders)',
  staff_and_elders: 'var(--tier-staff-and-elders)',
  elders_only: 'var(--tier-elders-only)',
} as const

const WHEN = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/**
 * Notes — the church's care log, at the reader's own tier.
 *
 * Two people open this page and see different things, and the difference is
 * stated rather than hidden. A withheld note still appears: you can see that care
 * happened and who it was about, and not what was said. That is §3's shape, and
 * the alternative — dropping the row entirely — would let a leader conclude
 * nobody had called.
 */
export default async function NotesPage() {
  const page = await getNotesPage()

  return (
    <PageShell
      eyebrow={
        page.hiddenCount > 0
          ? `${page.visibleCount} of ${page.visibleCount + page.hiddenCount} readable`
          : `${page.visibleCount} ${page.visibleCount === 1 ? 'note' : 'notes'}`
      }
      title="Notes"
    >
      <div className="flex flex-col gap-8">
        {/* ── What this reader reaches ── */}
        <section className="grid gap-3 md:grid-cols-3">
          {page.byTier.map((tier) => (
            <div
              key={tier.tier}
              style={{
                background: 'var(--surface-card)',
                borderLeft: `3px solid ${TIER_ACCENT[tier.tier]}`,
                borderTop: '1px solid var(--border-subtle)',
                borderRight: '1px solid var(--border-subtle)',
                borderBottom: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
              }}
            >
              <span
                className="eyebrow"
                style={{
                  fontSize: '0.5625rem',
                  color: TIER_ACCENT[tier.tier],
                }}
              >
                {tier.label}
              </span>
              <p className="mt-2 font-semibold">{tier.countLabel}</p>
              <p
                className="mt-1 text-[0.875rem]"
                style={{ color: 'var(--text-muted)' }}
              >
                {tier.readable ? 'You read at this tier' : 'Above your tier'}
              </p>
            </div>
          ))}
        </section>

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

        {/* ── Log one ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Log care</h2>
          {!page.logNoteCheck.allowed ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {page.logNoteCheck.note}
            </p>
          ) : page.writableTiers.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              You have no confidentiality clearance, so there is no tier you
              could file a note at.
            </p>
          ) : (
            <>
              <p
                className="text-[0.9375rem]"
                style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
              >
                The tier is fixed when you save. Nothing moves a note
                afterwards, which is why it is asked rather than assumed — pick
                the one the conversation actually belongs at.
              </p>
              <ActionForm action={logCareNote} label="Log it" variant="primary">
                <div className="flex max-w-[620px] flex-col gap-2">
                  <select
                    name="personId"
                    defaultValue=""
                    style={{
                      font: 'inherit',
                      fontSize: '0.9375rem',
                      padding: '9px 11px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--surface-card)',
                    }}
                  >
                    <option value="" disabled>
                      Who is this about
                    </option>
                    {page.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.fullName}
                      </option>
                    ))}
                  </select>

                  <select
                    name="tier"
                    defaultValue=""
                    style={{
                      font: 'inherit',
                      fontSize: '0.9375rem',
                      padding: '9px 11px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--surface-card)',
                    }}
                  >
                    <option value="" disabled>
                      Written at which tier
                    </option>
                    {/* Only the tiers this writer reaches. One they could file
                        at but not read back is not offered, because the note
                        would be unreadable to the person who wrote it. */}
                    {page.writableTiers.map((tier) => (
                      <option key={tier.tier} value={tier.tier}>
                        {tier.label}
                      </option>
                    ))}
                  </select>

                  <textarea
                    name="body"
                    rows={4}
                    placeholder="What happened. Write it as though the person will read it, because §3 says they may ask."
                    style={{
                      font: 'inherit',
                      fontSize: '0.9375rem',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--surface-card)',
                    }}
                  />
                </div>
              </ActionForm>
            </>
          )}
        </section>

        {/* ── The log ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>The log</h2>

          {page.emptyNote ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {page.emptyNote}
            </p>
          ) : (
            page.rows.map(({ view, personId, personName }) => (
              <article
                key={view.id}
                style={{
                  background:
                    view.access === 'visible'
                      ? 'var(--surface-card)'
                      : 'var(--surface-sunken)',
                  borderTop: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderLeft: `3px solid ${TIER_ACCENT[view.visibilityTier]}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a
                    href={`/people/${personId}`}
                    className="font-semibold"
                    style={{ color: 'inherit' }}
                  >
                    {personName}
                  </a>
                  <span
                    className="eyebrow"
                    style={{
                      fontSize: '0.5rem',
                      color: TIER_ACCENT[view.visibilityTier],
                    }}
                  >
                    {view.visibilityTier.replace(/_/g, ' ')}
                  </span>
                  <span
                    className="text-[0.8125rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {WHEN.format(view.occurredAt)}
                    {view.access === 'visible' && ` · ${view.authorName}`}
                  </span>
                </div>

                {/* Two variants, and the withheld one has no body field at all —
                    not an empty string, not a hidden element. There is nothing
                    in the payload to inspect. */}
                {view.access === 'visible' ? (
                  <p className="mt-2" style={{ textWrap: 'pretty' }}>
                    {view.body}
                  </p>
                ) : (
                  <p
                    className="mt-2 italic"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {view.disclosure}
                  </p>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </PageShell>
  )
}
