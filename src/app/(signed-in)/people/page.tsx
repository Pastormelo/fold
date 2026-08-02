import Link from 'next/link'

import { ActionForm } from '@/components/action-form'
import { PageShell } from '@/components/page-shell'
import { getDirectoryOptions } from '@/data/admin'
import { getUnfoldedMembers, listPeople } from '@/data/records'

import { addPerson, createFold, reassignFoldElder } from './actions'

export const metadata = { title: 'Family · Fold' }

const FIELD = {
  font: 'inherit',
  fontSize: '0.9375rem',
  padding: '9px 11px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
} as const

/**
 * Family — the people of the church, from `Fold Web.dc.html`.
 *
 * Members with no fold are surfaced first rather than sorted in with everyone
 * else. §2: a member with no fold is an open pastoral matter, not a data gap, and
 * a list that hides them among ninety others is how they stay that way.
 */
export default async function FamilyPage() {
  const [people, unfolded, options] = await Promise.all([
    listPeople(),
    getUnfoldedMembers(),
    getDirectoryOptions(),
  ])
  const unfoldedIds = new Set(unfolded.map((m) => m.id))

  return (
    <PageShell
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
            Nobody here yet. Add somebody below, or import from Planning Center
            once that is connected — Fold does not invent a directory.
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
        {/* ── Folds ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Folds</h2>
          <p
            className="text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            Every fold has exactly one elder who is answerable for the people in
            it. That is the whole point of the structure, so it is required
            rather than optional.
          </p>

          {options.folds.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              No folds yet. Until one exists, everybody you add is somebody
              nobody is shepherding.
            </p>
          ) : (
            options.folds.map((fold) => (
              <article
                key={fold.id}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-semibold">{fold.name}</span>
                  <span
                    className="text-[0.875rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {fold.elderName} · {fold.memberCountLabel}
                  </span>
                </div>

                {options.manageFolds.allowed &&
                  options.possibleElders.length > 0 && (
                    <details className="mt-3">
                      <summary
                        className="cursor-pointer text-[0.875rem]"
                        style={{ color: 'var(--text-brand)' }}
                      >
                        Hand it to somebody else
                      </summary>
                      <div className="mt-3">
                        <ActionForm
                          action={reassignFoldElder}
                          fields={{ foldId: fold.id }}
                          label="Reassign"
                        >
                          <select name="elderId" defaultValue="" style={FIELD}>
                            <option value="" disabled>
                              Which elder
                            </option>
                            {options.possibleElders
                              .filter((elder) => elder.id !== fold.elderId)
                              .map((elder) => (
                                <option key={elder.id} value={elder.id}>
                                  {elder.fullName} — {elder.roleLabel}
                                </option>
                              ))}
                          </select>
                        </ActionForm>
                      </div>
                    </details>
                  )}
              </article>
            ))
          )}

          {options.manageFolds.allowed ? (
            options.elderNote ? (
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
              <ActionForm action={createFold} label="Create fold">
                <div className="flex max-w-[560px] flex-col gap-2">
                  <input name="name" placeholder="Fold name" style={FIELD} />
                  {/* Only people `canOwnFold` would accept. Offering everybody
                      and refusing on submit is the §8.4 failure. */}
                  <select name="elderId" defaultValue="" style={FIELD}>
                    <option value="" disabled>
                      Which elder owns it
                    </option>
                    {options.possibleElders.map((elder) => (
                      <option key={elder.id} value={elder.id}>
                        {elder.fullName} — {elder.roleLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </ActionForm>
            )
          ) : (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {options.manageFolds.note}
            </p>
          )}
        </section>

        {/* ── Add somebody ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Add somebody</h2>
          {!options.managePeople.allowed ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              {options.managePeople.note}
            </p>
          ) : (
            <>
              <p
                className="text-[0.9375rem]"
                style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
              >
                Only the two names are required. A fold comes later, and a
                member without one shows on the Overview until somebody is named
                — which is the point rather than an oversight.
              </p>
              <ActionForm action={addPerson} label="Add" variant="primary">
                <div className="flex max-w-[620px] flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <input
                      name="firstName"
                      placeholder="First name"
                      style={{ ...FIELD, flex: 1, minWidth: 160 }}
                    />
                    <input
                      name="lastName"
                      placeholder="Last name"
                      style={{ ...FIELD, flex: 1, minWidth: 160 }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      name="email"
                      type="email"
                      placeholder="Email (optional)"
                      style={{ ...FIELD, flex: 1, minWidth: 160 }}
                    />
                    <input
                      name="phone"
                      placeholder="Phone (optional)"
                      style={{ ...FIELD, flex: 1, minWidth: 160 }}
                    />
                  </div>
                  {/* §6 keeps Family and Guests apart, so this is asked rather
                      than inferred from whether they have a fold. */}
                  <select name="isMember" defaultValue="member" style={FIELD}>
                    <option value="member">A member — goes into Family</option>
                    <option value="guest">
                      Not a member yet — goes into Guests
                    </option>
                  </select>
                </div>
              </ActionForm>
            </>
          )}
        </section>
      </div>
    </PageShell>
  )
}
