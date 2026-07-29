import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { CareTimeline } from '@/components/care-timeline'
import { getPersonRecord } from '@/data/records'

/**
 * A person's record — the drawer from `Fold Web.dc.html`, as its own page.
 *
 * The care timeline is where the confidentiality model becomes visible: notes
 * above this reader's tier appear as rows saying care happened, without saying
 * what was said. That behaviour is already built and tested in
 * `@/domain/access`; this only renders it.
 */
export default async function PersonPage(
  props: PageProps<'/people/[personId]'>
) {
  const { personId } = await props.params
  const person = await getPersonRecord(personId)
  if (!person) notFound()

  return (
    <AppShell eyebrow={person.since} title={person.fullName}>
      <div className="flex flex-col gap-6">
        <Link
          href="/people"
          style={{ color: 'var(--text-brand)', fontSize: '0.875rem' }}
        >
          ← Family
        </Link>

        <section
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            padding: '20px 22px',
          }}
        >
          <div className="flex flex-wrap items-center gap-4">
            <span
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
            </span>
            <div>
              <p
                className="text-[0.9375rem]"
                style={{
                  color: person.foldIsUnassigned
                    ? 'var(--text-brand)'
                    : 'var(--text-muted)',
                  textWrap: 'pretty',
                }}
              >
                {person.foldLabel}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="overline" style={{ fontSize: '0.5625rem' }}>
                Household
              </dt>
              <dd className="mt-1 text-[0.9375rem]">
                {person.household.length > 0
                  ? person.household.join(' · ')
                  : 'No household on file'}
              </dd>
            </div>
            <div>
              <dt className="overline" style={{ fontSize: '0.5625rem' }}>
                Serving
              </dt>
              <dd className="mt-1 text-[0.9375rem]">{person.serving}</dd>
            </div>
            <div>
              <dt className="overline" style={{ fontSize: '0.5625rem' }}>
                Groups
              </dt>
              <dd className="mt-1 text-[0.9375rem]">{person.groups}</dd>
            </div>
          </dl>

          <div className="mt-7">
            <CareTimeline care={person.care} />
          </div>

          {/* §8.3 and §8.4: the gate and its sentence come from one check, and a
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
      </div>
    </AppShell>
  )
}
