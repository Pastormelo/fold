'use server'

import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from './supabase-server'

/**
 * The sign-in flows, as Server Actions.
 *
 * All four methods §6 of the brief asks for: email and password, Google OAuth,
 * magic link, and password reset. Each returns a message rather than throwing, so
 * a failed sign-in renders as a sentence instead of an error page.
 *
 * **Signing out is not here.** It lives in `src/app/auth/sign-out/route.ts`,
 * because ending a session has to replace the document rather than re-render it —
 * a Server Action leaves the previous reader's RSC payload in the page. See
 * `src/auth/identity-change.ts` for the measurement.
 */

export type AuthResult = { ok: boolean; message: string }

function siteUrl(): string {
  // Vercel supplies the deployment host; locally this falls back to the dev
  // server. Set FOLD_SITE_URL for a custom domain so magic links and OAuth
  // return to the right place.
  const explicit = process.env.FOLD_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}

function requiredField(
  value: FormDataEntryValue | null,
  label: string
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}

/** Email and password. */
export async function signInWithPassword(
  formData: FormData
): Promise<AuthResult> {
  let email: string
  let password: string
  try {
    email = requiredField(formData.get('email'), 'Email')
    password = requiredField(formData.get('password'), 'Password')
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Deliberately not distinguishing "no such account" from "wrong password".
    // Telling them apart confirms to anyone asking which addresses belong to
    // people at this church, which for a church directory is worth not leaking.
    return { ok: false, message: 'That email and password do not match.' }
  }

  redirect('/')
}

/**
 * A magic link.
 *
 * `shouldCreateUser: false` on purpose. Fold's people come from the church
 * directory and from Planning Center; a stranger entering an address should not
 * bring an account into existence. An administrator links a person first.
 *
 * The reply is the same whether or not the address is known, for the same reason
 * the password error is vague.
 */
export async function sendMagicLink(formData: FormData): Promise<AuthResult> {
  let email: string
  try {
    email = requiredField(formData.get('email'), 'Email')
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }

  const supabase = await createSupabaseServerClient()
  await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  })

  return {
    ok: true,
    message: `If ${email} belongs to someone here, a sign-in link is on its way. It expires shortly.`,
  }
}

/** Start a password reset. Same non-committal reply, for the same reason. */
export async function sendPasswordReset(
  formData: FormData
): Promise<AuthResult> {
  let email: string
  try {
    email = requiredField(formData.get('email'), 'Email')
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }

  const supabase = await createSupabaseServerClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/auth/new-password`,
  })

  return {
    ok: true,
    message: `If ${email} belongs to someone here, a reset link is on its way.`,
  }
}

/**
 * Finish a password reset.
 *
 * Requires an active session, which the reset link established by way of the
 * callback route — so this cannot be used to change a password without having
 * proved control of the mailbox.
 */
export async function setNewPassword(formData: FormData): Promise<AuthResult> {
  let password: string
  let confirmation: string
  try {
    password = requiredField(formData.get('password'), 'A new password')
    confirmation = requiredField(
      formData.get('confirmPassword'),
      'The confirmation'
    )
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }

  if (password !== confirmation) {
    return { ok: false, message: 'Those two passwords do not match.' }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error: sessionError } = await supabase.auth.getUser()
  if (sessionError || !data.user) {
    return {
      ok: false,
      message:
        'This reset link is no longer valid. Ask for a new one and use it straight away.',
    }
  }

  // Supabase enforces the project's password policy; its message is more useful
  // than anything restated here, so it is passed through.
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { ok: false, message: error.message }

  redirect('/')
}

/**
 * Google OAuth.
 *
 * Returns the URL rather than redirecting from the action, so the browser
 * performs the top-level navigation to Google itself.
 */
export async function startGoogleSignIn(): Promise<
  AuthResult & { url?: string }
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl()}/auth/callback`,
    },
  })

  if (error || !data.url) {
    return { ok: false, message: 'Could not reach Google. Try again shortly.' }
  }
  return { ok: true, message: '', url: data.url }
}
