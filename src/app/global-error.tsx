'use client' // Error boundaries must be Client Components

/**
 * The last-resort error page.
 *
 * `global-error` rather than `error` because the failure this most often catches
 * comes from the root layout: `ViewerSwitch` resolves the viewer, and with no
 * session configured `getViewer` throws by design. A layout-level error bubbles
 * past any `error.tsx` to here, so this is the only boundary that can catch it.
 *
 * The guidance below is written out rather than read from `error.message`. Next
 * replaces error messages with an opaque digest in production builds, so relying
 * on the message would have produced a blank explanation in exactly the
 * deployment where someone needs one.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#f4fbfe',
          color: '#20242a',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          lineHeight: 1.5,
        }}
      >
        <main style={{ maxWidth: '46rem' }}>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#5e6c7a',
              margin: '0 0 0.75rem',
            }}
          >
            Fold
          </p>
          <h1
            style={{
              fontSize: 'clamp(1.75rem, 1.3rem + 1.6vw, 2.4rem)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              margin: '0 0 1rem',
            }}
          >
            This instance has no session configured
          </h1>

          <p style={{ margin: '0 0 1rem', textWrap: 'pretty' }}>
            Fold will not serve people records without a real session. Real
            authentication is not built yet, so a deployment refuses rather than
            inventing a default reader — a default reader is a silent
            authorization bypass, and this application exists to protect
            confidential pastoral notes.
          </p>

          <p style={{ margin: '0 0 1.5rem', textWrap: 'pretty' }}>
            If you deployed this and want to look around: set{' '}
            <code
              style={{
                background: '#eef1f5',
                borderRadius: 4,
                padding: '0.1rem 0.35rem',
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: '0.9em',
              }}
            >
              FOLD_DEMO_MODE=1
            </code>{' '}
            in the environment and redeploy. That runs the app over clearly
            labelled sample data with a viewer switch standing in for sign-in.
            Note that it leaves the deployment readable by anyone who has the
            URL, so protect it or keep it private.
          </p>

          <p style={{ margin: '0 0 1.5rem', textWrap: 'pretty' }}>
            Any other cause, and this is a bug worth reporting. See the README
            section &ldquo;The auth gap&rdquo;.
          </p>

          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              font: 'inherit',
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: '0.65rem 1rem',
              borderRadius: 8,
              border: 'none',
              background: '#ff953e',
              color: '#20242a',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>

          {error.digest && (
            <p
              style={{
                marginTop: '2rem',
                fontSize: '0.8125rem',
                color: '#7e8995',
                fontFamily: 'ui-monospace, Menlo, monospace',
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
