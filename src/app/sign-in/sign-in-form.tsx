'use client'

import { useState, useTransition } from 'react'

import {
  type AuthResult,
  sendMagicLink,
  sendPasswordReset,
  signInWithPassword,
  startGoogleSignIn,
} from '@/auth/actions'

type Mode = 'password' | 'magic_link' | 'reset'

const MODE_LABELS: Record<Mode, string> = {
  password: 'Password',
  magic_link: 'Email me a link',
  reset: 'Reset my password',
}

const control = {
  font: 'inherit',
  width: '100%',
  padding: '0.6rem 0.7rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-card)',
} as const

const primaryButton = {
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
  width: '100%',
} as const

export function SignInForm({ initialError }: { initialError: string | null }) {
  const [mode, setMode] = useState<Mode>('password')
  const [result, setResult] = useState<AuthResult | null>(
    initialError ? { ok: false, message: initialError } : null
  )
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    startTransition(async () => {
      const action =
        mode === 'password'
          ? signInWithPassword
          : mode === 'magic_link'
            ? sendMagicLink
            : sendPasswordReset
      // A successful password sign-in redirects, so nothing comes back.
      setResult(await action(formData))
    })
  }

  function google() {
    startTransition(async () => {
      const started = await startGoogleSignIn()
      if (started.url) {
        // A top-level navigation, so Google's page replaces this document.
        window.location.assign(started.url)
        return
      }
      setResult({ ok: false, message: started.message })
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="How to sign in"
        className="flex flex-wrap gap-2"
      >
        {(Object.keys(MODE_LABELS) as Mode[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => {
              setMode(option)
              setResult(null)
            }}
            style={{
              font: 'inherit',
              fontSize: '0.8125rem',
              fontWeight: 600,
              padding: '0.35rem 0.7rem',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              border:
                mode === option
                  ? '1px solid var(--brand)'
                  : '1px solid var(--border-default)',
              background: mode === option ? 'var(--brand-soft)' : 'transparent',
              color: 'var(--text-primary)',
            }}
          >
            {MODE_LABELS[option]}
          </button>
        ))}
      </div>

      <form action={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="overline" style={{ fontSize: '0.625rem' }}>
            Email
          </span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            style={control}
          />
        </label>

        {mode === 'password' && (
          <label className="flex flex-col gap-1">
            <span className="overline" style={{ fontSize: '0.625rem' }}>
              Password
            </span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              style={control}
            />
          </label>
        )}

        <button type="submit" disabled={pending} style={primaryButton}>
          {pending
            ? 'Working…'
            : mode === 'password'
              ? 'Sign in'
              : mode === 'magic_link'
                ? 'Send me a link'
                : 'Send a reset link'}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <span
          style={{ flex: 1, height: 1, background: 'var(--border-default)' }}
        />
        <span
          className="overline"
          style={{ fontSize: '0.5625rem', letterSpacing: '0.14em' }}
        >
          or
        </span>
        <span
          style={{ flex: 1, height: 1, background: 'var(--border-default)' }}
        />
      </div>

      <button
        type="button"
        onClick={google}
        disabled={pending}
        style={{
          ...primaryButton,
          background: 'var(--surface-card)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-strong)',
        }}
      >
        Continue with Google
      </button>

      {result && (
        <p
          role="status"
          className="text-[0.9375rem]"
          style={{
            background: result.ok
              ? 'var(--brand-soft)'
              : 'var(--surface-sunken)',
            borderLeft: `3px solid ${
              result.ok ? 'var(--brand)' : 'var(--ofc-danger)'
            }`,
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            textWrap: 'pretty',
          }}
        >
          {result.message}
        </p>
      )}
    </div>
  )
}
