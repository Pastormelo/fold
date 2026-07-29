import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import {
  getJourneys,
  getRestorationCases,
  getTierOverview,
  getUnfoldedMembers,
} from '@/data/records'

export const metadata = { title: 'Fold' }

const TIER_ACCENT = {
  all_leaders: 'var(--tier-all-leaders)',
  staff_and_elders: 'var(--tier-staff-and-elders)',
  elders_only: 'var(--tier-elders-only)',
} as const

const card = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
  padding: '18px 20px',
} as const

/**
 * "Care across the church" — the overview, from `Fold Web.dc.html`.
 *
 * Everything on it is a count or a list computed from real rows. The prototype's
 * framing was that the first screen should answer "is anyone slipping", so the
 * things that can go wrong lead, and the reassuring numbers follow.
 */
export default async function OverviewPage() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const [unfolded, journeys, cases, tiers] = await Promise.all([
    getUnfoldedMembers(),
    getJourneys(),
    getRestorationCases(),
    getTierOverview(),
  ])

  const overdue = journeys.filter(
    (journey) => journey.access === 'visible' && journey.isOverdue
  )
  const openCases = cases.filter((entry) => !entry.sealed)

  return (
    <AppShell eyebrow={today} title="Care across the church">
      <div className="flex flex-col gap-7">
        {/* What needs attention, first. */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div style={card}>
            <p className="overline" style={{ fontSize: '0.5625rem' }}>
              Members with no fold
            </p>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color:
                  unfolded.length > 0
                    ? 'var(--text-brand)'
                    : 'var(--text-primary)',
              }}
            >
              {unfolded.length}
            </p>
            <p
              className="text-[0.8125rem]"
              style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
            >
              {unfolded.length === 0
                ? 'Everyone is under a named elder.'
                : 'An open pastoral matter, not a data gap.'}
            </p>
          </div>

          <div style={card}>
            <p className="overline" style={{ fontSize: '0.5625rem' }}>
              Journeys overdue
            </p>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color:
                  overdue.length > 0
                    ? 'var(--ofc-danger)'
                    : 'var(--text-primary)',
              }}
            >
              {overdue.length}
            </p>
            <p
              className="text-[0.8125rem]"
              style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
            >
              {overdue.length === 0
                ? 'Nothing is waiting on anyone.'
                : 'A journey ends by being finished, not forgotten.'}
            </p>
          </div>

          <div style={card}>
            <p className="overline" style={{ fontSize: '0.5625rem' }}>
              Open restoration cases
            </p>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
              }}
            >
              {openCases.length}
            </p>
            <p
              className="text-[0.8125rem]"
              style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
            >
              Carried by two elders, never one.
            </p>
          </div>
        </section>

        {overdue.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 style={{ fontSize: '1.125rem' }}>Waiting on someone</h2>
            {overdue.map(
              (journey) =>
                journey.access === 'visible' && (
                  <div
                    key={journey.instanceId}
                    style={{
                      ...card,
                      borderLeft: '3px solid var(--ofc-danger)',
                      padding: '14px 16px',
                    }}
                  >
                    <p style={{ fontWeight: 600 }}>{journey.personName}</p>
                    <p
                      className="mt-1 text-[0.9375rem]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {journey.summary}
                    </p>
                  </div>
                )
            )}
            <Link
              href="/journeys"
              style={{ color: 'var(--text-brand)', fontSize: '0.9375rem' }}
            >
              All journeys →
            </Link>
          </section>
        )}

        {unfolded.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 style={{ fontSize: '1.125rem' }}>Nobody is shepherding them</h2>
            <div style={{ ...card, padding: '14px 16px' }}>
              {unfolded.map((member) => (
                <p key={member.id} className="text-[0.9375rem]">
                  {member.fullName}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* Who can read what, so it is never a mystery. */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Who can read what</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.tier}
                style={{
                  ...card,
                  padding: '14px 16px',
                  borderLeft: `3px solid ${TIER_ACCENT[tier.tier]}`,
                }}
              >
                <p
                  className="overline"
                  style={{
                    fontSize: '0.5625rem',
                    color: TIER_ACCENT[tier.tier],
                  }}
                >
                  {tier.name}
                  {tier.viewerIsAtThisTier ? ' · you' : ''}
                </p>
                <p className="mt-1 text-[0.9375rem] font-semibold">
                  {tier.who}
                </p>
                <p
                  className="text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {tier.leaderCountLabel}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
