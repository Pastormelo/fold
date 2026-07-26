import { NewPasswordForm } from './new-password-form'

export const metadata = { title: 'Choose a new password · Fold' }

/**
 * Where a reset link lands, by way of the callback route.
 *
 * Reaching this page means the callback already exchanged the code for a session,
 * so `setNewPassword` has a session to act on. Someone arriving here without one
 * gets told the link expired rather than being allowed to set a password.
 */
export default function NewPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-[26rem] flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <span className="overline">Fold</span>
        <h1 style={{ fontSize: 'clamp(1.75rem, 1.4rem + 1.4vw, 2.25rem)' }}>
          Choose a new password
        </h1>
      </header>
      <NewPasswordForm />
    </main>
  )
}
