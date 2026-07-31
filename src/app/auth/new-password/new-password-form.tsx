'use client'

import { useState, useTransition } from 'react'

import { type AuthResult, setNewPassword } from '@/auth/actions'

const control = {
  font: 'inherit',
  width: '100%',
  padding: '0.6rem 0.7rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
} as const

export function NewPasswordForm() {
  const [result, setResult] = useState<AuthResult | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      action={(formData) =>
        startTransition(async () => setResult(await setNewPassword(formData)))
      }
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className="eyebrow" style={{ fontSize: '0.625rem' }}>
          New password
        </span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          style={control}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="eyebrow" style={{ fontSize: '0.625rem' }}>
          Again, to be sure
        </span>
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          style={control}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          letterSpacing: '0.04em',
          fontSize: '0.875rem',
          padding: '0.7rem 1rem',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: 'var(--brand)',
          color: 'var(--on-brand)',
          cursor: 'pointer',
        }}
      >
        {pending ? 'Saving…' : 'Save it'}
      </button>

      {result && !result.ok && (
        <p
          role="status"
          className="text-[0.9375rem]"
          style={{
            background: 'var(--surface-sunken)',
            borderLeft: '3px solid var(--ofc-danger)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            textWrap: 'pretty',
          }}
        >
          {result.message}
        </p>
      )}
    </form>
  )
}
