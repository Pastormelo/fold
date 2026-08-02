'use client'

import { useState, useTransition } from 'react'

import type { ImportPlan } from '@/domain/pc-import'
import { previewImport, runImport } from '@/app/(signed-in)/admin/pc-actions'

/**
 * The import, in two deliberate steps.
 *
 * Step one reads Planning Center and shows what would happen, by name, and writes
 * nothing. Step two does it. They are separate buttons because this is the only
 * action in Fold that can add several hundred people to a directory at once, and
 * a church should be able to look at that list — including the people it could
 * not tell apart — before it exists.
 *
 * The plan is held in component state rather than persisted. It is a view of a
 * moment, not a record, and treating it as a record would invite acting on a
 * stale one: the import recomputes from live data and reports what it actually
 * did, which is why the two numbers can legitimately differ if somebody edited
 * Planning Center in between.
 */
export function PlanningCenterImport({
  disabled,
  disabledReason,
}: {
  disabled: boolean
  disabledReason: string | null
}) {
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const preview = () => {
    startTransition(async () => {
      const outcome = await previewImport()
      setNote({ ok: outcome.ok, text: outcome.message })
      setPlan(outcome.ok ? outcome.plan : null)
    })
  }

  const doImport = () => {
    startTransition(async () => {
      const outcome = await runImport()
      setNote({ ok: outcome.ok, text: outcome.message })
      // Cleared on success: the plan described a directory that no longer
      // exists, and leaving it on screen beside "42 people added" would invite
      // pressing import twice.
      if (outcome.ok) setPlan(null)
    })
  }

  const wouldChange =
    plan !== null && plan.creates.length + plan.links.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={preview}
          disabled={disabled || pending}
          title={disabled ? (disabledReason ?? undefined) : undefined}
          style={button(disabled || pending, 'secondary')}
        >
          {pending ? 'Working…' : 'See what would change'}
        </button>

        {wouldChange && (
          <button
            type="button"
            onClick={doImport}
            disabled={pending}
            style={button(pending, 'primary')}
          >
            {pending
              ? 'Working…'
              : `Import ${plan.creates.length + plan.links.length} ${
                  plan.creates.length + plan.links.length === 1
                    ? 'person'
                    : 'people'
                }`}
          </button>
        )}

        {disabled && disabledReason && (
          <span
            className="text-[0.8125rem]"
            style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
          >
            {disabledReason}
          </span>
        )}
      </div>

      {note && (
        <p
          className="text-[0.9375rem]"
          style={{
            color: note.ok ? 'var(--text-primary)' : 'var(--ofc-danger)',
            textWrap: 'pretty',
          }}
        >
          {note.text}
        </p>
      )}

      {plan && (
        <div className="flex flex-col gap-3">
          <Group
            title="Would be added"
            count={plan.creates.length}
            tone="brand"
            empty="Nobody new."
          >
            {plan.creates.map((entry) => (
              <Row
                key={entry.incoming.planningCenterId}
                name={`${entry.incoming.firstName} ${entry.incoming.lastName}`}
                detail={entry.incoming.email ?? entry.incoming.phone ?? 'No contact details'}
                aside={entry.list === 'family' ? 'Family' : 'Guest'}
              />
            ))}
          </Group>

          <Group
            title="Already in Fold, would be linked"
            count={plan.links.length}
            tone="plain"
            empty="Nobody."
          >
            {plan.links.map((entry) => (
              <Row
                key={entry.incoming.planningCenterId}
                name={entry.fullName}
                detail={`Matched on ${entry.matchedOn === 'email' ? 'email address' : 'phone number'}. Only the Planning Center id is written — nothing you typed is overwritten.`}
              />
            ))}
          </Group>

          {/* The important one. These are the people Fold refuses to guess
              about, and they are shown even though the count is usually small,
              because each is a decision somebody has to make. */}
          <Group
            title="Could not be told apart"
            count={plan.duplicates.length}
            tone="warning"
            empty="None — every profile matched at most one person."
          >
            {plan.duplicates.map((entry) => (
              <Row
                key={entry.incoming.planningCenterId}
                name={`${entry.incoming.firstName} ${entry.incoming.lastName}`}
                detail={`Matches ${entry.candidates.map((c) => c.fullName).join(' and ')}. ${entry.guidance}`}
              />
            ))}
          </Group>

          <Group
            title="Already linked"
            count={plan.alreadyLinked.length}
            tone="plain"
            empty="None."
          >
            {plan.alreadyLinked.map((entry) => (
              <Row
                key={entry.incoming.planningCenterId}
                name={`${entry.incoming.firstName} ${entry.incoming.lastName}`}
                detail="Already carries this Planning Center id. Nothing to do."
              />
            ))}
          </Group>

          <Group
            title="Would be skipped"
            count={plan.skipped.length}
            tone="plain"
            empty="Nobody."
          >
            {plan.skipped.map((entry) => (
              <Row
                key={entry.incoming.planningCenterId}
                name={
                  `${entry.incoming.firstName} ${entry.incoming.lastName}`.trim() ||
                  `Planning Center profile ${entry.incoming.planningCenterId}`
                }
                detail={entry.reason}
              />
            ))}
          </Group>
        </div>
      )}
    </div>
  )
}

/**
 * A group of the plan, collapsed by default.
 *
 * An empty group still renders, with its zero and a sentence. On a screen about
 * what is going to happen to a directory, "nobody could be told apart" is
 * information — hiding empty groups would make the absence of a warning
 * indistinguishable from the warning not having been checked for.
 */
function Group({
  title,
  count,
  tone,
  empty,
  children,
}: {
  title: string
  count: number
  tone: 'brand' | 'warning' | 'plain'
  empty: string
  children: React.ReactNode
}) {
  const accent =
    tone === 'warning'
      ? 'var(--ofc-warning)'
      : tone === 'brand'
        ? 'var(--brand)'
        : 'var(--border-strong)'

  return (
    <details
      style={{
        background: 'var(--surface-card)',
        borderLeft: `3px solid ${accent}`,
        borderTop: '1px solid var(--border-subtle)',
        borderRight: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
      }}
    >
      <summary style={{ cursor: count === 0 ? 'default' : 'pointer' }}>
        <strong>{count}</strong> · {title}
      </summary>
      {count === 0 ? (
        <p
          className="mt-2 text-[0.875rem]"
          style={{ color: 'var(--text-muted)' }}
        >
          {empty}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">{children}</div>
      )}
    </details>
  )
}

function Row({
  name,
  detail,
  aside,
}: {
  name: string
  detail: string
  aside?: string
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">{name}</span>
        {aside && (
          <span
            className="eyebrow"
            style={{
              fontSize: '0.5rem',
              padding: '2px 7px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-default)',
            }}
          >
            {aside}
          </span>
        )}
      </div>
      <p
        className="text-[0.8125rem]"
        style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
      >
        {detail}
      </p>
    </div>
  )
}

function button(
  isDisabled: boolean,
  variant: 'primary' | 'secondary'
): React.CSSProperties {
  return {
    font: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    padding: '8px 15px',
    borderRadius: 'var(--radius-sm)',
    border:
      variant === 'primary'
        ? '1px solid var(--brand)'
        : '1px solid var(--border-default)',
    background: variant === 'primary' ? 'var(--brand)' : 'var(--surface-card)',
    color: variant === 'primary' ? 'var(--on-brand)' : 'var(--text-primary)',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.55 : 1,
  }
}
