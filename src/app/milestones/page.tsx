import { ActionForm } from '@/components/action-form'
import { AppShell } from '@/components/app-shell'
import { getMilestonesPage } from '@/data/milestones'
import { MILESTONE_KINDS, MILESTONE_LABELS } from '@/domain/milestones'

import { recordMilestone, removeMilestone } from './actions'

export const metadata = { title: 'Milestones · Fold' }

const ON = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const FIELD = {
  font: 'inherit',
  fontSize: '0.9375rem',
  padding: '9px 11px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
} as const

/**
 * Milestones — the dates a church should not miss.
 *
 * Stored once and projected forward, so a birthday entered today still surfaces
 * in 2031 without anyone backfilling. The wording comes from the domain, which
 * distinguishes "Turns 71" from "Three years since Hector passed" — a generic
 * "anniversary" would put those in the same sentence, and they are not remotely
 * the same phone call.
 */
export default async function MilestonesPage() {
  const page = await getMilestonesPage()

  return (
    <AppShell
      eyebrow={
        page.totalInWindow === 0
          ? 'Next thirty days'
          : `${page.totalInWindow} in the next thirty days`
      }
      title="Milestones"
    >
      <div className="flex flex-col gap-8">
        {page.emptyNote && (
          <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
            {page.emptyNote}
          </p>
        )}

        {page.groups
          .filter((group) => group.count > 0)
          .map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 style={{ fontSize: '1.125rem' }}>{group.label}</h2>
                <span
                  className="text-[0.875rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {group.countLabel}
                </span>
              </div>

              {group.items.map((item) => (
                <article
                  key={item.id}
                  style={{
                    background: 'var(--surface-card)',
                    borderTop: '1px solid var(--border-subtle)',
                    borderRight: '1px solid var(--border-subtle)',
                    borderBottom: '1px solid var(--border-subtle)',
                    /* A loss is marked differently from a birthday. Getting the
                       tone wrong here is not a small mistake. */
                    borderLeft: `3px solid ${
                      item.sombre ? 'var(--ofc-n-500)' : 'var(--brand)'
                    }`,
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                  }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <a
                      href={`/people/${item.personId}`}
                      className="font-semibold"
                      style={{ color: 'inherit' }}
                    >
                      {item.personName}
                    </a>
                    <span
                      className="eyebrow"
                      style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}
                    >
                      {item.label}
                    </span>
                    <span
                      className="text-[0.8125rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {ON.format(item.on)}
                    </span>
                  </div>
                  <p className="mt-1" style={{ textWrap: 'pretty' }}>
                    {item.description}
                  </p>
                  {page.recordCheck.allowed && (
                    <div className="mt-3">
                      <ActionForm
                        action={removeMilestone}
                        fields={{ milestoneId: item.id }}
                        label="Remove"
                      />
                    </div>
                  )}
                </article>
              ))}
            </section>
          ))}

        {/* ── Record one ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Record a milestone</h2>
          {!page.recordCheck.allowed ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {page.recordCheck.note}
            </p>
          ) : (
            <>
              <p
                className="text-[0.9375rem]"
                style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
              >
                Enter the original date. Birthdays, anniversaries, baptisms and
                the anniversary of a loss come round on their own from that one
                date — you will not be asked again next year.
              </p>
              <ActionForm
                action={recordMilestone}
                label="Record it"
                variant="primary"
              >
                <div className="flex max-w-[620px] flex-col gap-2">
                  <select name="personId" defaultValue="" style={FIELD}>
                    <option value="" disabled>
                      Whose milestone
                    </option>
                    {page.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.fullName}
                      </option>
                    ))}
                  </select>

                  <select name="kind" defaultValue="" style={FIELD}>
                    <option value="" disabled>
                      What kind
                    </option>
                    {MILESTONE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {MILESTONE_LABELS[kind]}
                      </option>
                    ))}
                  </select>

                  <input type="date" name="occurredOn" style={FIELD} />

                  <input
                    name="note"
                    placeholder="Detail — for a loss, who they lost, so the reminder can name them"
                    style={FIELD}
                  />
                </div>
              </ActionForm>
            </>
          )}
        </section>
      </div>
    </AppShell>
  )
}
