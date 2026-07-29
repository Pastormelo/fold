import {
  isGoogleSignInEnabled,
  isSupabaseConfigured,
} from '@/auth/supabase-config'
import { SignInForm } from './sign-in-form'

export const metadata = { title: 'Sign in · Fold' }

export default async function SignInPage(props: PageProps<'/sign-in'>) {
  const params = await props.searchParams
  const rawError = params.error
  const initialError = typeof rawError === 'string' ? rawError : null
  const configured = isSupabaseConfigured()

  return (
    <main className="mx-auto flex w-full max-w-[26rem] flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <span className="overline">Fold</span>
        <h1 style={{ fontSize: 'clamp(1.75rem, 1.4rem + 1.4vw, 2.25rem)' }}>
          Sign in
        </h1>
        <p
          className="text-[0.9375rem]"
          style={{ color: 'var(--text-secondary)', textWrap: 'pretty' }}
        >
          Fold holds pastoral records, so it does not show anything until it
          knows who you are.
        </p>
      </header>

      {configured ? (
        <SignInForm
          initialError={initialError}
          googleEnabled={isGoogleSignInEnabled()}
        />
      ) : (
        /* No Supabase project yet. Saying so beats rendering a form that cannot
           work, and it names the variables rather than making someone guess. */
        <div
          className="flex flex-col gap-3 text-[0.9375rem]"
          style={{
            background: 'var(--surface-sunken)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 18px',
            textWrap: 'pretty',
          }}
        >
          <p style={{ fontWeight: 600 }}>
            Authentication is not configured on this deployment.
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> from your Supabase
            project&rsquo;s API settings, then redeploy. Until then, set{' '}
            <code>FOLD_DEMO_MODE=1</code> to look around over sample data.
          </p>
        </div>
      )}
    </main>
  )
}
