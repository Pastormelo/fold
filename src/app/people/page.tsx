import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { getUnfoldedMembers, listPeople } from '@/data/records'

export const metadata = { title: 'Family · Fold' }

/**
 * Family — the people of the church, from `Fold Web.dc.html`.
 *
 * Members with no fold are surfaced first rather than sorted in with everyone
 * else. §2: a member with no fold is an open pastoral matter, not a data gap, and
 * a list that hides them among ninety others is how they stay that way.
 */
export default async function FamilyPage() {
  const [people, unfolded] = await Promise.all([
    listPeople(),
    getUnfoldedMembers(),
  ])
  const unfoldedIds = new Set(unfolded.map((m) => m.id))

  return (
    <AppShell
      eyebrow={`${people.length} ${people.length === 1 ? 'person' : 'people'}`}
      title="Family"
    >
      <div className="flex flex-col gap-6">
        {unfolded.length > 0 && (
          <section
            style={{
              background: 'var(--brand-soft)',
              border: '1px solid var(--brand-soft-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 18px',
            }}
          >
            <p className="eyebrow" style={{ fontSize: '0.5625rem' }}>
              Under no named elder
            </p>
            <p className="mt-2 text-[0.9375rem]" style={{ textWrap: 'pretty' }}>
              {unfolded.length === 1
                ? '1 member is not in a fold.'
                : `${unfolded.length} members are not in a fold.`}{' '}
              An open pastoral matter, not a data gap.
            </p>
          </section>
        )}

        {people.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
            Nobody here yet. People arrive from Planning Center, or get added
            deliberately — Fold does not invent a directory.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {people.map((person) => (
              <Link
                key={person.id}
                href={`/people/${person.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '13px 16px',
                  textDecoration: 'none',
                  color: 'inherit',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderLeft: unfoldedIds.has(person.id)
                    ? '3px solid var(--brand)'
                    : '3px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <span
                  aria-hidden
                  className="grid place-items-center"
                  style={{
                    width: 38,
                    height: 38,
                    flexShrink: 0,
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--brand-soft)',
                    border: '1px solid var(--brand-soft-border)',
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: 'var(--text-brand)',
                  }}
                >
                  {person.initials}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>
                    {person.fullName}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.8125rem',
                      color: unfoldedIds.has(person.id)
                        ? 'var(--text-brand)'
                        : 'var(--text-muted)',
                    }}
                  >
                    {person.foldLabel}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
