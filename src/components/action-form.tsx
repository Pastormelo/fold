'use client'

import { useActionState } from 'react'

export type ActionOutcome =
  { ok: true; message: string } | { ok: false; message: string }

/**
 * A form that reports what the server actually did.
 *
 * The reason this exists rather than a plain `<form action={fn}>`: every action
 * in `@/app/pathway/actions` can legitimately refuse, and a refusal is
 * information — "nobody has approved this version yet" is the most useful thing
 * the screen can say. A form that silently succeeds or silently does nothing is
 * §8.5's failure in its most ordinary form.
 *
 * The outcome is rendered next to the control that produced it, so the message
 * and the button cannot drift apart.
 */
export function ActionForm({
  action,
  fields,
  label,
  disabled,
  disabledReason,
  variant = 'secondary',
  children,
}: {
  action: (formData: FormData) => Promise<ActionOutcome>
  /** Hidden values the action needs. Never the resulting state — only the intent. */
  fields?: Record<string, string>
  label: string
  disabled?: boolean
  /** Required whenever `disabled` — a disabled control with no reason is a dead end. */
  disabledReason?: string | null
  variant?: 'primary' | 'secondary'
  /** Extra inputs, e.g. a note textarea. */
  children?: React.ReactNode
}) {
  const [outcome, submit, pending] = useActionState(
    async (
      _previous: ActionOutcome | null,
      formData: FormData
    ): Promise<ActionOutcome> => {
      try {
        return await action(formData)
      } catch (error) {
        // Actions return refusals rather than throwing, so anything caught here
        // is unexpected. Reported beside the button instead of taking the whole
        // page to the error boundary: the rest of the screen is still valid, and
        // the person needs to know *this* did not happen.
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : 'That did not go through, and the reason was not something this form could read.',
        }
      }
    },
    null
  )

  return (
    <form action={submit} className="flex flex-col gap-2">
      {fields &&
        Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={disabled || pending}
          title={disabled ? (disabledReason ?? undefined) : undefined}
          style={{
            font: 'inherit',
            fontSize: '0.875rem',
            fontWeight: 600,
            padding: '8px 15px',
            borderRadius: 'var(--radius-sm)',
            border:
              variant === 'primary'
                ? '1px solid var(--brand)'
                : '1px solid var(--border-default)',
            background:
              variant === 'primary' ? 'var(--brand)' : 'var(--surface-card)',
            color:
              variant === 'primary' ? 'var(--on-brand)' : 'var(--text-primary)',
            cursor: disabled || pending ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {pending ? 'Working…' : label}
        </button>

        {/* The reason a control is unavailable, in the open rather than in a
            tooltip nobody hovers. */}
        {disabled && disabledReason && (
          <span
            className="text-[0.8125rem]"
            style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
          >
            {disabledReason}
          </span>
        )}

        {outcome && (
          <span
            className="text-[0.8125rem]"
            style={{
              color: outcome.ok ? 'var(--ofc-success)' : 'var(--ofc-danger)',
              textWrap: 'pretty',
            }}
          >
            {outcome.message}
          </span>
        )}
      </div>
    </form>
  )
}
