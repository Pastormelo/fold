import { ActionForm } from '@/components/action-form'
import { PageShell } from '@/components/page-shell'
import { PlanningCenterImport } from '@/components/planning-center-import'
import { getFoldLists, getLeaders, getRoleMatrix } from '@/data/admin'
import {
  getGrantedExceptions,
  getSyncCategories,
  getTierOverview,
} from '@/data/records'
import { getIntegrationView } from '@/data/planning-center'
import {
  FOLD_LISTS,
  FOLD_LIST_LABELS,
  NEVER_SYNC_CONTENT,
  neverSyncReason,
} from '@/domain/planning-center'
import { ROLES, ROLE_LABELS } from '@/domain/roles'
import { TIER_ORDER, tierName } from '@/domain/tiers'

import {
  grantClearance,
  grantRole,
  revokeGrant,
  revokeRole,
  setSyncCategory,
} from './actions'
import {
  connectPlanningCenter,
  disconnectPlanningCenter,
  mapList,
  resolveDuplicate,
} from './pc-actions'

export const metadata = { title: 'Setup · Fold' }

/** Planning Center's own blue, so the button reads as theirs rather than ours. */
const PC_BUTTON = {
  display: 'inline-block',
  font: 'inherit',
  fontSize: '0.9375rem',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '11px 18px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid #2f6fed',
  background: '#2f6fed',
  color: '#fff',
} as const

const CREDENTIAL_INPUT = {
  font: 'inherit',
  fontSize: '0.875rem',
  width: '100%',
  maxWidth: 460,
  padding: '8px 11px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
  color: 'var(--text-primary)',
} as const

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
/**
 * `searchParams` is read for one reason: the Planning Center callback is a Route
 * Handler on another path, so the only way it can report back is a redirect
 * carrying the outcome. Rendering it here is what turns "the browser came back
 * from Planning Center" into a sentence somebody can act on.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const pcError = typeof params.pc_error === 'string' ? params.pc_error : null
  const pcConnected = params.pc_connected === '1'

  const [roles, leaders, exceptions, tiers, sync, lists, pcView] =
    await Promise.all([
      getRoleMatrix(),
      getLeaders(),
      getGrantedExceptions(),
      getTierOverview(),
      getSyncCategories(),
      getFoldLists(),
      getIntegrationView(),
    ])

  return (
    <PageShell
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
            className="max-w-[680px] text-[0.9375rem]"
            style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
          >
            Computed by asking the same permission check every gate in Fold
            calls, about a person holding only that role — so it cannot claim a
            role carries something it does not.
          </p>

          {/*
              One table, in church language.
              This was twelve cards listing raw permission keys — `pathway.edit`,
              `admin.manage_roles` — which is the output of a permission check
              rather than a description of a job. The exact set is still one click
              away underneath, because it being *computed* is the property worth
              keeping; it just is not what somebody comes to this page to read.
          */}
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                minWidth: 620,
                borderCollapse: 'collapse',
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <thead>
                <tr>
                  {[
                    'Role',
                    'Sees',
                    'Confidential notes',
                    'Can change',
                    'Held by',
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="eyebrow"
                      style={{
                        fontSize: '0.5625rem',
                        textAlign: 'left',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.role}>
                    <td
                      className="font-semibold"
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      {role.label}
                    </td>
                    <td
                      className="text-[0.875rem]"
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {role.sees}
                    </td>
                    {/* The tier, in the same words §3 uses everywhere else. Not
                        the mock's four levels — this app enforces three, and
                        writing four here would describe a model that does not
                        exist. */}
                    <td
                      className="text-[0.875rem]"
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        color: role.reachesCare
                          ? 'var(--text-primary)'
                          : 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {role.reachesCare ? role.clearanceLabel : 'None'}
                    </td>
                    <td
                      className="text-[0.875rem]"
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {role.canChange}
                    </td>
                    <td
                      className="text-[0.875rem]"
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        color:
                          role.holderCount === 0
                            ? 'var(--text-muted)'
                            : 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {role.holderCount === 0 ? '—' : role.holderCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details>
            <summary
              className="text-[0.875rem]"
              style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              Show the exact permissions behind this
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {roles.map((role) => (
                <div
                  key={role.role}
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                  }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold">{role.label}</span>
                    <span
                      className="text-[0.875rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {role.permissionCountLabel}
                    </span>
                  </div>
                  {role.unrestrictedNote ? (
                    <p
                      className="mt-1 text-[0.875rem] italic"
                      style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                    >
                      {role.unrestrictedNote}
                    </p>
                  ) : (
                    <p
                      className="mt-1 font-mono text-[0.75rem]"
                      style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                    >
                      {role.permissions.join('  ·  ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
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
              background: pcView.configured
                ? 'var(--surface-card)'
                : 'var(--surface-sunken)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              textWrap: 'pretty',
            }}
          >
            {pcView.connectionNote}
          </p>

          {/* ── The credential itself ──
              First, because nothing below it works without one. This is the
              screen an administrator connects Planning Center from; requiring a
              terminal and a redeploy to paste a token put the one person who
              should be doing it behind the one person who should not have to be
              involved. */}
          <div
            className="flex flex-col gap-3"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 18px',
            }}
          >
            <h3 style={{ fontSize: '1rem' }}>Connection</h3>

            {/* What came back from Planning Center, if the browser just did. */}
            {pcConnected && (
              <p
                className="max-w-[680px] text-[0.9375rem]"
                style={{
                  borderLeft: '3px solid var(--ofc-success)',
                  paddingLeft: 12,
                  textWrap: 'pretty',
                }}
              >
                Connected. Press &ldquo;See what would change&rdquo; below to
                find out what importing your directory would do — nothing is
                written until you say so.
              </p>
            )}
            {pcError && (
              <p
                className="max-w-[680px] text-[0.9375rem]"
                style={{
                  borderLeft: '3px solid var(--ofc-danger)',
                  paddingLeft: 12,
                  textWrap: 'pretty',
                }}
              >
                {pcError}
              </p>
            )}

            {pcView.credential.state === 'environment' && (
              <p
                className="max-w-[680px] text-[0.9375rem]"
                style={{ textWrap: 'pretty' }}
              >
                Connected through the environment. The credentials are set as
                environment variables on this deployment, which take precedence
                over anything entered here — change them where they are set
                rather than on this screen.
              </p>
            )}

            {pcView.credential.state === 'stored' && (
              <>
                <p
                  className="max-w-[680px] text-[0.9375rem]"
                  style={{ textWrap: 'pretty' }}
                >
                  Connected. Application ID{' '}
                  <strong>{pcView.credential.appId}</strong>, secret ending{' '}
                  <strong>{pcView.credential.secretHint}</strong> — connected by{' '}
                  {pcView.credential.connectedByName}.
                </p>
                <p
                  className="max-w-[680px] text-[0.8125rem]"
                  style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                >
                  The secret is encrypted in the database and is never sent back
                  to a browser, which is why only its last four characters are
                  shown. Saving a new one replaces it.
                </p>
              </>
            )}

            {pcView.credential.state === 'unreadable' &&
              pcView.credential.kind === 'oauth' && (
                <>
                  <p
                    className="max-w-[680px] text-[0.9375rem]"
                    style={{
                      borderLeft: '3px solid var(--ofc-warning)',
                      paddingLeft: 12,
                      textWrap: 'pretty',
                    }}
                  >
                    Planning Center is connected, but the stored access token
                    can no longer be read — the key that encrypts it changed.
                    Nothing is lost and no data was affected. Sign in again and
                    it is fixed.
                  </p>
                  {/* The sign-in button, not the paste form. There is no
                      Application ID to re-enter for a connection made by
                      pressing a button, and offering that form sent somebody
                      looking for a credential they have never held. */}
                  <div>
                    <a
                      href="/auth/planning-center/start"
                      style={{
                        ...PC_BUTTON,
                        opacity: pcView.gate.allowed ? 1 : 0.55,
                      }}
                      aria-disabled={!pcView.gate.allowed}
                    >
                      Sign in with Planning Center again
                    </a>
                  </div>
                  {!pcView.gate.allowed && (
                    <p
                      className="text-[0.8125rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {pcView.gate.note}
                    </p>
                  )}
                </>
              )}

            {pcView.credential.state === 'unreadable' &&
              pcView.credential.kind === 'token' && (
                <p
                  className="max-w-[680px] text-[0.9375rem]"
                  style={{
                    borderLeft: '3px solid var(--ofc-warning)',
                    paddingLeft: 12,
                    textWrap: 'pretty',
                  }}
                >
                  A token is stored for Application ID{' '}
                  <strong>{pcView.credential.appId}</strong>, but it can no
                  longer be decrypted, because the key that encrypts it changed.
                  Enter the token again below and it will work.
                </p>
              )}

            {/* ── Connected by signing in ── */}
            {pcView.credential.state === 'oauth' && (
              <>
                <p
                  className="max-w-[680px] text-[0.9375rem]"
                  style={{ textWrap: 'pretty' }}
                >
                  Connected to Planning Center, authorised by{' '}
                  <strong>{pcView.credential.connectedByName}</strong>. There is
                  no credential for you to hold or rotate — Fold renews its own
                  access.
                </p>
                {pcView.credential.needsReauthorising && (
                  <p
                    className="max-w-[680px] text-[0.9375rem]"
                    style={{
                      borderLeft: '3px solid var(--ofc-warning)',
                      paddingLeft: 12,
                      textWrap: 'pretty',
                    }}
                  >
                    Access has lapsed and could not be renewed, which usually
                    means Fold&rsquo;s access was revoked in Planning Center.
                    Sign in again below.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <a href="/auth/planning-center/start" style={PC_BUTTON}>
                    {pcView.credential.needsReauthorising
                      ? 'Sign in to Planning Center again'
                      : 'Reconnect'}
                  </a>
                  <ActionForm
                    action={disconnectPlanningCenter}
                    label="Disconnect"
                    disabled={!pcView.gate.allowed}
                    disabledReason={
                      pcView.gate.allowed ? null : pcView.gate.note
                    }
                  />
                </div>
              </>
            )}

            {/* ── Nothing connected yet ── */}
            {pcView.credential.state === 'none' && (
              <>
                {pcView.credential.oauthAvailable ? (
                  <>
                    <p
                      className="max-w-[680px] text-[0.9375rem]"
                      style={{
                        color: 'var(--text-secondary)',
                        textWrap: 'pretty',
                      }}
                    >
                      Press the button, sign in to Planning Center, and approve
                      the request. Fold asks for read access to People and
                      nothing else — you will see exactly that on their screen.
                      There is no key to copy and nothing to paste.
                    </p>
                    <div>
                      <a
                        href="/auth/planning-center/start"
                        style={{
                          ...PC_BUTTON,
                          opacity: pcView.gate.allowed ? 1 : 0.55,
                        }}
                        aria-disabled={!pcView.gate.allowed}
                      >
                        Sign in with Planning Center
                      </a>
                    </div>
                    {!pcView.gate.allowed && (
                      <p
                        className="text-[0.8125rem]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {pcView.gate.note}
                      </p>
                    )}
                  </>
                ) : (
                  <p
                    className="max-w-[680px] text-[0.9375rem]"
                    style={{
                      color: 'var(--text-secondary)',
                      textWrap: 'pretty',
                    }}
                  >
                    Signing in is not available on this deployment — no Planning
                    Center application is registered for it, which is a one-time
                    setup by whoever runs Fold rather than anything you can do
                    here. In the meantime you can connect with a{' '}
                    <strong>Personal Access Token</strong>: make one at
                    api.planningcenteronline.com/oauth/applications, under
                    Personal Access Tokens, and paste both halves below.
                  </p>
                )}
              </>
            )}

            {/*
                The token form, kept but demoted.
                When signing in is available this is a disclosure rather than a
                second competing control — two ways to connect side by side asks a
                church to make a decision it has no basis for. It stays reachable
                because it is the only route on a deployment with no registered
                application, and because it is genuinely easier for a developer
                testing the API.
            */}
            {pcView.credential.state !== 'environment' &&
              pcView.credential.state !== 'oauth' &&
              !(
                pcView.credential.state === 'unreadable' &&
                pcView.credential.kind === 'oauth'
              ) && (
                <details
                  open={
                    pcView.credential.state !== 'none' ||
                    !pcView.credential.oauthAvailable
                  }
                >
                  <summary
                    className="text-[0.875rem]"
                    style={{
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Connect with a Personal Access Token instead
                  </summary>
                  <div className="mt-3">
                    <ActionForm
                      action={connectPlanningCenter}
                      label={
                        pcView.credential.state === 'stored'
                          ? 'Replace the token'
                          : 'Connect Planning Center'
                      }
                      variant={
                        pcView.credential.state === 'stored'
                          ? 'secondary'
                          : 'primary'
                      }
                      disabled={!pcView.gate.allowed}
                      disabledReason={
                        pcView.gate.allowed ? null : pcView.gate.note
                      }
                    >
                      <input
                        name="appId"
                        defaultValue={
                          pcView.credential.state === 'stored' ||
                          pcView.credential.state === 'unreadable'
                            ? pcView.credential.appId
                            : ''
                        }
                        placeholder="Application ID"
                        autoComplete="off"
                        style={CREDENTIAL_INPUT}
                      />
                      {/* type=password so it is not shoulder-read or auto-saved as a
                    plain field. It is a token, not a password, but every
                    browser affordance for one is the right one here. */}
                      <input
                        name="secret"
                        type="password"
                        placeholder="Secret"
                        autoComplete="off"
                        style={CREDENTIAL_INPUT}
                      />
                    </ActionForm>
                  </div>
                </details>
              )}

            {(pcView.credential.state === 'none' ||
              pcView.credential.state === 'stored' ||
              pcView.credential.state === 'unreadable') && (
              <p
                className="max-w-[680px] text-[0.8125rem]"
                style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
              >
                A pasted token is checked against Planning Center before it is
                saved, so &ldquo;connected&rdquo; here means it actually
                authenticated and could read People — not merely that something
                was typed.
              </p>
            )}

            {pcView.credential.state === 'stored' && (
              <ActionForm
                action={disconnectPlanningCenter}
                label="Disconnect"
                disabled={!pcView.gate.allowed}
                disabledReason={pcView.gate.allowed ? null : pcView.gate.note}
              />
            )}
          </div>

          {/* ── Importing the directory ──
              Placed above the category list because it is the thing a church
              actually comes here to do; the categories describe the scope that
              would apply, which is context for this rather than a task. */}
          <div
            className="flex flex-col gap-3"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 18px',
            }}
          >
            <h3 style={{ fontSize: '1rem' }}>Import your directory</h3>
            <p
              className="max-w-[680px] text-[0.9375rem]"
              style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
            >
              Reads the people in Planning Center and shows exactly what would
              change — who would be added, who is already here, and who Fold
              cannot tell apart from somebody. Nothing is written until you
              press the second button. Fold only ever reads: it never creates a
              person, a field, or a list in Planning Center.
            </p>
            <p
              className="max-w-[680px] text-[0.875rem]"
              style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
            >
              {pcView.linkedCount === 0
                ? `${pcView.peopleCount} ${pcView.peopleCount === 1 ? 'person is' : 'people are'} in Fold, none linked to Planning Center yet.`
                : `${pcView.linkedCount} of ${pcView.peopleCount} people in Fold are linked to a Planning Center record, so a re-run will recognise them rather than adding a second copy.`}
            </p>

            <PlanningCenterImport
              disabled={!pcView.configured || !pcView.gate.allowed}
              disabledReason={
                !pcView.gate.allowed
                  ? pcView.gate.note
                  : (pcView.configurationNote ?? null)
              }
            />
          </div>

          {/* ── Where Family and Guests land ── */}
          <div
            className="flex flex-col gap-3"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 18px',
            }}
          >
            <h3 style={{ fontSize: '1rem' }}>Family and Guests</h3>
            <p
              className="max-w-[680px] text-[0.9375rem]"
              style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
            >
              An imported person arrives as a guest unless their Planning Center
              membership value matches the one you map to Family. Membership is
              the church&rsquo;s decision, so Fold will not conclude it from a
              directory export. Run the preview once and it will tell you which
              membership values Planning Center is actually using.
            </p>
            {FOLD_LISTS.map((list) => {
              const mapping = pcView.listMappings[list]
              return (
                <div key={list} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-semibold">
                      {FOLD_LIST_LABELS[list]}
                    </span>
                    <span
                      className="text-[0.8125rem]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {mapping.state === 'mapped'
                        ? `takes ${mapping.externalFieldIds.map((v) => `“${v}”`).join(', ')}`
                        : mapping.state === 'fold_only'
                          ? `kept in Fold — ${mapping.reason}`
                          : 'not mapped yet'}
                    </span>
                  </div>
                  <ActionForm
                    action={mapList}
                    fields={{ list }}
                    label={`Save ${FOLD_LIST_LABELS[list]}`}
                    disabled={!pcView.gate.allowed}
                    disabledReason={
                      pcView.gate.allowed ? null : pcView.gate.note
                    }
                  >
                    {/*
                        Tick boxes over the values Planning Center actually uses,
                        not a field to type one into. §6 forbids Fold inventing a
                        value over there, and a typed value that exists nowhere is
                        the same mistake in disguise: it looks like a finished
                        setting and silently sorts nobody. Several may be ticked —
                        a directory can say "in the family" more than one way.
                    */}
                    {pcView.membershipValues.length === 0 ? (
                      <p
                        className="text-[0.8125rem]"
                        style={{
                          color: 'var(--text-muted)',
                          textWrap: 'pretty',
                        }}
                      >
                        Press &ldquo;See what would change&rdquo; above once,
                        and the values your Planning Center uses appear here to
                        tick.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {pcView.membershipValues.map((value) => (
                          <label
                            key={value}
                            className="flex items-center gap-2 text-[0.875rem]"
                            style={{ cursor: 'pointer' }}
                          >
                            <input
                              type="checkbox"
                              name="value"
                              value={value}
                              defaultChecked={
                                mapping.state === 'mapped' &&
                                mapping.externalFieldIds.includes(value)
                              }
                            />
                            {value}
                          </label>
                        ))}
                      </div>
                    )}
                  </ActionForm>
                </div>
              )
            })}
          </div>

          {/* ── Near matches waiting on a person ── */}
          {pcView.openDuplicates.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 style={{ fontSize: '1rem' }}>
                {pcView.openDuplicates.length} possible{' '}
                {pcView.openDuplicates.length === 1
                  ? 'duplicate'
                  : 'duplicates'}
              </h3>
              <p
                className="max-w-[680px] text-[0.9375rem]"
                style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
              >
                Fold will not merge these and does not have a merge. Say what
                you decided and the records are left as they are with your
                reason attached.
              </p>
              {pcView.openDuplicates.map((duplicate) => (
                <div
                  key={duplicate.id}
                  style={{
                    background: 'var(--surface-card)',
                    borderLeft: '3px solid var(--ofc-warning)',
                    borderTop: '1px solid var(--border-subtle)',
                    borderRight: '1px solid var(--border-subtle)',
                    borderBottom: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 16px',
                  }}
                >
                  <p style={{ textWrap: 'pretty' }}>
                    <strong>{duplicate.personName}</strong> and{' '}
                    <strong>{duplicate.otherPersonName}</strong>
                  </p>
                  <p
                    className="mt-1 text-[0.8125rem]"
                    style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
                  >
                    {duplicate.matchedOn}
                  </p>
                  <div className="mt-3">
                    <ActionForm
                      action={resolveDuplicate}
                      fields={{ duplicateId: duplicate.id }}
                      label="Record what you decided"
                      disabled={!pcView.gate.allowed}
                      disabledReason={
                        pcView.gate.allowed ? null : pcView.gate.note
                      }
                    >
                      <input
                        name="resolution"
                        placeholder="e.g. Same person — kept the older record. Or: different people, cousins."
                        style={{
                          font: 'inherit',
                          fontSize: '0.875rem',
                          width: '100%',
                          maxWidth: 560,
                          padding: '8px 11px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-default)',
                          background: 'var(--surface-card)',
                        }}
                      />
                    </ActionForm>
                  </div>
                </div>
              ))}
            </div>
          )}

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
    </PageShell>
  )
}
