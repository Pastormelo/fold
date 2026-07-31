import { ActionForm } from '@/components/action-form'
import { AppShell } from '@/components/app-shell'
import {
  getFoldLists,
  getIntegrationState,
  getLeaders,
  getRoleMatrix,
} from '@/data/admin'
import {
  getGrantedExceptions,
  getSyncCategories,
  getTierOverview,
} from '@/data/records'
import { NEVER_SYNC_CONTENT, neverSyncReason } from '@/domain/planning-center'
import { ROLES, ROLE_LABELS } from '@/domain/roles'
import { TIER_ORDER, tierName } from '@/domain/tiers'

import {
  grantClearance,
  grantRole,
  revokeGrant,
  revokeRole,
  setSyncCategory,
} from './actions'

export const metadata = { title: 'Setup · Fold' }

const TIER_ACCENT = {
  all_leaders: 'var(--tier-all-leaders)',
  staff_and_elders: 'var(--tier-staff-and-elders)',
  elders_only: 'var(--tier-elders-only)',
} as const

/**
 * Setup — who holds what, who has been given more than their role carries, and
 * what crosses to Planning Center.
 *
 * The organising idea, and the reason "Access beyond role" sits above the role
 * matrix: an administrator can grant anything, so the safeguard is not a narrower
 * gate. It is that every exception is answerable in one place, with the person who
 * granted it named and their reason attached. Self-grants are marked, because an
 * administrator raising their own clearance is both legitimate and the obvious
 * way this gets abused.
 */
export default async function SetupPage() {
  const [roles, leaders, exceptions, tiers, sync, lists, integration] =
    await Promise.all([
      getRoleMatrix(),
      getLeaders(),
      getGrantedExceptions(),
      getTierOverview(),
      getSyncCategories(),
      getFoldLists(),
      getIntegrationState(),
    ])

  return (
    <AppShell
      eyebrow={`${leaders.length} ${leaders.length === 1 ? 'leader' : 'leaders'}`}
      title="Setup"
    >
      <div className="flex flex-col gap-9">
        {/* ── Access beyond role ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Access beyond role</h2>
          <p
            className="text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            Everyone whose access exceeds what their role carries. This list is
            the safeguard: an administrator can grant anything, so what matters
            is that every exception is in one place with a name and a reason on
            it.
          </p>

          {exceptions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              Nobody has access beyond their role. Everything below is
              role-derived.
            </p>
          ) : (
            exceptions.map((exception) => (
              <article
                key={exception.grantId}
                style={{
                  background: 'var(--surface-card)',
                  borderLeft: exception.selfGranted
                    ? '3px solid var(--ofc-warning)'
                    : '3px solid var(--border-strong)',
                  borderTop: '1px solid var(--border-subtle)',
                  borderRight: '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-semibold">{exception.personName}</span>
                  <span
                    className="text-[0.9375rem]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {exception.what}
                  </span>
                  {exception.selfGranted && (
                    <span
                      className="eyebrow"
                      style={{
                        fontSize: '0.5rem',
                        color: 'var(--ofc-orange-700)',
                        border: '1px solid var(--brand-soft-border)',
                        background: 'var(--brand-soft)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '3px 8px',
                      }}
                    >
                      Granted to themselves
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 text-[0.875rem]"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  {exception.grantedByName} on {exception.grantedAt} —{' '}
                  {exception.reason}
                </p>
                <div className="mt-3">
                  <ActionForm
                    action={revokeGrant}
                    fields={{
                      grantId: exception.grantId,
                      kind: exception.kind,
                    }}
                    label="End this grant"
                  />
                </div>
              </article>
            ))
          )}
        </section>

        {/* ── People and their roles ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Leaders</h2>
          {leaders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              Nobody holds a role yet.
            </p>
          ) : (
            leaders.map((leader) => (
              <article
                key={leader.personId}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-semibold">{leader.fullName}</span>
                  {leader.isViewer && (
                    <span
                      className="eyebrow"
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
                  <span
                    className="text-[0.875rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {leader.roleLabels.join(' · ')}
                  </span>
                </div>
                <p
                  className="mt-1 text-[0.875rem]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Reads at {leader.clearanceLabel}
                  {/* Where it came from, always. "Why can they read that?" is
                      the question, and the role alone is the wrong answer the
                      moment somebody holds a grant. */}
                  {leader.clearanceSource === 'grant'
                    ? ' — raised by a grant'
                    : leader.clearanceSource === 'role'
                      ? ' — from their roles'
                      : ''}
                </p>
                {leader.grantReason && (
                  <p
                    className="mt-1 text-[0.875rem] italic"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {leader.grantReason}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {leader.roles.map((role) => (
                    <ActionForm
                      key={role}
                      action={revokeRole}
                      fields={{ personId: leader.personId, role }}
                      label={`Remove ${ROLE_LABELS[role]}`}
                    />
                  ))}
                </div>

                <details className="mt-3">
                  <summary
                    className="cursor-pointer text-[0.875rem]"
                    style={{ color: 'var(--text-brand)' }}
                  >
                    Give this person more
                  </summary>
                  <div className="mt-3 flex flex-col gap-4">
                    <ActionForm
                      action={grantRole}
                      fields={{ personId: leader.personId }}
                      label="Add role"
                    >
                      <select
                        name="role"
                        defaultValue=""
                        style={{
                          font: 'inherit',
                          fontSize: '0.875rem',
                          maxWidth: 320,
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-default)',
                          background: 'var(--surface-card)',
                        }}
                      >
                        <option value="" disabled>
                          Which role
                        </option>
                        {ROLES.filter(
                          (role) => !leader.roles.includes(role)
                        ).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </ActionForm>

                    <ActionForm
                      action={grantClearance}
                      fields={{ personId: leader.personId }}
                      label="Raise clearance"
                    >
                      <div className="flex flex-col gap-2">
                        <select
                          name="tier"
                          defaultValue=""
                          style={{
                            font: 'inherit',
                            fontSize: '0.875rem',
                            maxWidth: 320,
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-default)',
                            background: 'var(--surface-card)',
                          }}
                        >
                          <option value="" disabled>
                            Which tier
                          </option>
                          {TIER_ORDER.map((tier) => (
                            <option key={tier} value={tier}>
                              {tierName(tier)}
                            </option>
                          ))}
                        </select>
                        <input
                          name="reason"
                          placeholder="Why — this is the row an elder will read back to you"
                          style={{
                            font: 'inherit',
                            fontSize: '0.875rem',
                            maxWidth: 520,
                            padding: '8px 11px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-default)',
                            background: 'var(--surface-card)',
                          }}
                        />
                      </div>
                    </ActionForm>
                    <p
                      className="text-[0.8125rem]"
                      style={{
                        color: 'var(--text-muted)',
                        textWrap: 'pretty',
                        maxWidth: 560,
                      }}
                    >
                      A clearance grant only ever raises. Lowering somebody is a
                      role change, so the two never disagree with the more
                      permissive one winning by accident. It does not open
                      restoration cases either — those are carried by two named
                      elders, and no grant substitutes for being named.
                    </p>
                  </div>
                </details>
              </article>
            ))
          )}
        </section>

        {/* ── The tiers, counted ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Who reads at each tier</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {tiers.map((tier) => (
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
                  {tier.name}
                </span>
                <p className="mt-2 font-semibold">{tier.leaderCountLabel}</p>
                <p
                  className="mt-1 text-[0.875rem]"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  {tier.who}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── The role matrix ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>What each role carries</h2>
          <p
            className="text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            Computed by asking the same permission check every gate in Fold
            calls, about a person holding only that role. It is not a table
            written out by hand, so it cannot claim a role carries something it
            does not.
          </p>
          <div className="flex flex-col gap-2">
            {roles.map((role) => (
              <details
                key={role.role}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                }}
              >
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold">{role.label}</span>
                  <span
                    className="text-[0.875rem]"
                    style={{
                      color: role.reachesCare
                        ? 'var(--text-secondary)'
                        : 'var(--text-muted)',
                    }}
                  >
                    {role.clearanceLabel}
                  </span>
                  <span
                    className="text-[0.875rem]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {role.permissionCountLabel} · {role.holderCountLabel}
                  </span>
                </summary>
                {role.unrestrictedNote && (
                  <p
                    className="mt-2 text-[0.875rem] italic"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {role.unrestrictedNote}
                  </p>
                )}
                <ul className="mt-2 columns-2 text-[0.875rem]">
                  {role.permissions.map((permission) => (
                    <li
                      key={permission}
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {permission}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>

        {/* ── Planning Center ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Planning Center</h2>
          <p
            className="text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            Planning Center stays the system of record for people. Fold is the
            system of work for care. This is where the church declares which
            system owns which fact, so the same thing is never entered twice or
            claimed by both.
          </p>

          {/* Before the scope list, never after it: without this the categories
              below read as a status report on tonight's sync. */}
          <p
            className="text-[0.9375rem]"
            style={{
              background: integration.connected
                ? 'var(--surface-card)'
                : 'var(--surface-sunken)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              textWrap: 'pretty',
            }}
          >
            {integration.note}
          </p>

          <div className="flex flex-col gap-2">
            {sync.map((category) => (
              <div
                key={category.category}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-2"
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                }}
              >
                <span className="font-semibold">{category.label}</span>
                <span
                  className="text-[0.875rem]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {category.directionLabel}
                  {category.conflictNote && ` · ${category.conflictNote}`}
                </span>

                {/* A fixed category gets its reason, not a disabled switch. §6
                    calls these "not syncable and not switchable", and the reason
                    is the useful half of that. */}
                {category.switchable ? (
                  <div className="basis-full">
                    <ActionForm
                      action={setSyncCategory}
                      fields={{
                        category: category.category,
                        enabled: category.enabled ? 'false' : 'true',
                      }}
                      label={
                        category.enabled ? 'Stop syncing' : 'Start syncing'
                      }
                    />
                  </div>
                ) : (
                  <span
                    className="basis-full text-[0.875rem]"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {category.fixedReason}
                  </span>
                )}
              </div>
            ))}
          </div>

          <h3 className="mt-2" style={{ fontSize: '1rem' }}>
            What never crosses
          </h3>
          <p
            className="text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            Not settings. These are properties of the integration, and there is
            no switch for them anywhere in Fold.
          </p>
          <ul className="flex flex-col gap-2">
            {NEVER_SYNC_CONTENT.map((kind) => (
              <li
                key={kind}
                style={{
                  borderLeft: '3px solid var(--brand)',
                  paddingLeft: 14,
                }}
              >
                <p className="text-[0.9375rem] font-semibold">
                  {kind.replace(/_/g, ' ')}
                </p>
                <p
                  className="text-[0.875rem]"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  {neverSyncReason(kind)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Lists ── */}
        <section className="flex flex-col gap-3">
          <h2 style={{ fontSize: '1.125rem' }}>Lists</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {lists.map((list) => (
              <div
                key={list.list}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{list.label}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                    }}
                  >
                    {list.count}
                  </span>
                </div>
                <p
                  className="mt-1 text-[0.875rem]"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  {list.definition}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
