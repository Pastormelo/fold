import { AppShell } from '@/components/app-shell'
import { getRestorationCases, getTierOverview } from '@/data/records'
import {
  CONFIDENTIALITY_RULES,
  CONFIDENTIALITY_RULES_NOTE,
} from '@/domain/tiers'

export const metadata = { title: 'Confidential · Fold' }

const TIER_ACCENT = {
  all_leaders: 'var(--tier-all-leaders)',
  staff_and_elders: 'var(--tier-staff-and-elders)',
  elders_only: 'var(--tier-elders-only)',
} as const

/**
 * Confidential — restoration cases, the tiers, and the practices behind them.
 * The three tabs of the prototype's Confidential view, as sections.
 */
export default async function ConfidentialPage() {
  const [cases, tiers] = await Promise.all([
    getRestorationCases(),
    getTierOverview(),
  ])

  return (
    <AppShell
      eyebrow={`${cases.length} ${cases.length === 1 ? 'case' : 'cases'}`}
      title="Confidential"
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Restoration</h2>
          {cases.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}>
              No restoration cases. That is worth being glad about rather than
              treating as an empty list.
            </p>
          ) : (
            cases.map((entry) => (
              <article
                key={entry.id}
                style={{
                  background:
                    entry.access === 'visible'
                      ? 'var(--surface-card)'
                      : 'var(--surface-sunken)',
                  border:
                    entry.access === 'visible'
                      ? '1px solid var(--border-subtle)'
                      : '1px dashed var(--border-strong)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '18px 20px',
                }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <h3 style={{ fontSize: '1.0625rem' }}>
                    {entry.access === 'visible' ? entry.personName : entry.kind}
                  </h3>
                  {entry.sealed && (
                    <span
                      className="overline"
                      style={{
                        fontSize: '0.5625rem',
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
                    {entry.stepLabel}
                  </span>
                </div>

                {entry.access === 'visible' ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <p
                      className="text-[0.9375rem]"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {entry.foldName} · carried by {entry.leadElderName} and{' '}
                      {entry.secondElderName}
                    </p>
                    {entry.plan.length > 0 && (
                      <div>
                        <span
                          className="overline"
                          style={{ fontSize: '0.5625rem' }}
                        >
                          The plan
                        </span>
                        <ul className="mt-1 list-disc pl-5 text-[0.9375rem]">
                          {entry.plan.map((line) => (
                            <li
                              key={line}
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <span
                          className="overline"
                          style={{ fontSize: '0.5625rem' }}
                        >
                          Knows
                        </span>
                        <p className="mt-1 text-[0.9375rem]">
                          {entry.knows.join(' · ')}
                        </p>
                      </div>
                      <div>
                        <span
                          className="overline"
                          style={{ fontSize: '0.5625rem' }}
                        >
                          Deliberately does not know
                        </span>
                        <p className="mt-1 text-[0.9375rem]">
                          {entry.doesNotKnow.join(' · ')}
                        </p>
                      </div>
                    </div>
                    {entry.decisionQuestion && (
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
                        <strong>The question:</strong> {entry.decisionQuestion}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    {entry.outcome && (
                      <p
                        className="text-[0.9375rem]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {entry.outcome}
                      </p>
                    )}
                    <p
                      className="text-[0.9375rem] italic"
                      style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                    >
                      {entry.disclosure}
                    </p>
                  </div>
                )}
              </article>
            ))
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Three tiers</h2>
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
                  padding: '16px 18px',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="overline"
                    style={{
                      fontSize: '0.5625rem',
                      color: TIER_ACCENT[tier.tier],
                    }}
                  >
                    {tier.name}
                  </span>
                  {tier.viewerIsAtThisTier && (
                    <span
                      className="overline"
                      style={{
                        fontSize: '0.5rem',
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
                <p className="mt-2 text-[0.9375rem] font-semibold">
                  {tier.who}
                </p>
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

        <section className="flex flex-col gap-4">
          <h2 style={{ fontSize: '1.125rem' }}>
            The practice behind the tiers
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CONFIDENTIALITY_RULES.map(({ rule, why }) => (
              <div
                key={rule}
                style={{
                  borderLeft: '3px solid var(--brand)',
                  paddingLeft: 14,
                }}
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
      </div>
    </AppShell>
  )
}
