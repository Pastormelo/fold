import { getViewerSummary } from '@/data/records'
import { availableDevViewers, isDeployedDemo } from '@/data/viewer'

/**
 * The development viewer switch, ported from the prototype's role-based tier
 * switch on the Family screen.
 *
 * It says plainly that it is a development affordance standing in for real
 * authentication. The prototype's version looked like a product feature, which
 * is fine in a design artifact and misleading in a running app.
 *
 * The form posts natively to a Route Handler — a plain `action` string and
 * `method="post"`, not a Server Function and not `next/form`, both of which
 * navigate on the client. Changing identity has to replace the whole document
 * or the previous viewer's payload stays in it; `@/auth/identity-change` has
 * the detail. Whatever real authentication looks like, its sign-in and
 * sign-out controls submit the same way.
 */
export async function ViewerSwitch() {
  const viewers = availableDevViewers()
  // Empty once a real session is in use, so this whole bar disappears the moment
  // Supabase is configured. It is scaffolding, not a feature.
  if (viewers.length === 0) return null

  const current = await getViewerSummary()
  const deployed = isDeployedDemo()

  return (
    <div
      style={{
        background: 'var(--surface-inverse)',
        borderBottom: '1px solid var(--border-inverse)',
      }}
    >
      {/* On a deployed demo the URL may reach people with no idea the records
          are invented and the app has no sign-in. Say both, above the fold. */}
      {deployed && (
        <div
          style={{
            background: 'var(--ofc-warning)',
            color: 'var(--ofc-ink)',
            padding: '8px 24px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            textAlign: 'center',
            textWrap: 'pretty',
          }}
        >
          Demo over fictional sample data. No authentication — anyone with this
          link can read and switch between every person below.
        </div>
      )}

      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-5 gap-y-3 px-6 py-3">
        <span
          className="eyebrow"
          style={{ color: 'var(--ofc-n-400)', fontSize: '0.6875rem' }}
        >
          Viewing as · {deployed ? 'demo' : 'dev only'}
        </span>

        <form
          action="/dev/viewer"
          method="post"
          className="flex flex-wrap items-center gap-2"
        >
          {viewers.map((viewer) => {
            const isCurrent = viewer.personId === current.personId
            return (
              <button
                key={viewer.personId}
                type="submit"
                name="personId"
                value={viewer.personId}
                aria-current={isCurrent ? 'true' : undefined}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  padding: '5px 11px',
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  border: isCurrent
                    ? '1px solid var(--brand)'
                    : '1px solid var(--border-inverse)',
                  background: isCurrent ? 'var(--brand)' : 'transparent',
                  color: isCurrent ? 'var(--on-brand)' : 'var(--ofc-n-300)',
                }}
              >
                {viewer.displayName}
              </button>
            )
          })}

          {/*
            An empty `personId` clears the session cookie. It is the sign-out
            path, exercised here so the thing real authentication will do most
            often is the thing that gets used every day. Cleared, the viewer
            guard falls back to the least privileged reader rather than to
            nobody, so the bar still names someone afterwards.
          */}
          <button
            type="submit"
            name="personId"
            value=""
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: '5px 11px',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              border: '1px dashed var(--border-inverse)',
              background: 'transparent',
              color: 'var(--ofc-n-400)',
            }}
          >
            Sign out
          </button>
        </form>

        <span
          className="ml-auto text-[0.8125rem]"
          style={{ color: 'var(--ofc-n-400)' }}
        >
          {current.roleLabels.join(' · ')}
          {' — '}
          <strong style={{ color: 'var(--ofc-n-200)' }}>
            {current.clearanceLabel}
          </strong>
        </span>
      </div>
    </div>
  )
}
