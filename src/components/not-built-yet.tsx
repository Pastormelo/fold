import { AppShell } from './app-shell'

/**
 * A section the rail offers but that has no screen yet.
 *
 * Says so plainly, and says what it will hold. The alternative — a blank page,
 * or leaving the link out — either looks broken or hides the plan. §8.8's
 * instinct applied to the interface: a deliberate gap should be legible as
 * deliberate.
 */
export async function NotBuiltYet({
  title,
  eyebrow,
  willHold,
  backedBy,
}: {
  title: string
  eyebrow?: string
  /** What this section is for, in the church's terms. */
  willHold: string
  /** What already exists behind it, so the gap is scoped honestly. */
  backedBy?: string
}) {
  return (
    <AppShell title={title} eyebrow={eyebrow}>
      <div
        style={{
          background: 'var(--surface-sunken)',
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 22px',
          maxWidth: '60ch',
        }}
      >
        <p className="overline" style={{ fontSize: '0.5625rem' }}>
          Not built yet
        </p>
        <p className="mt-2 text-[0.9375rem]" style={{ textWrap: 'pretty' }}>
          {willHold}
        </p>
        {backedBy && (
          <p
            className="mt-3 text-[0.875rem]"
            style={{ color: 'var(--text-muted)', textWrap: 'pretty' }}
          >
            {backedBy}
          </p>
        )}
      </div>
    </AppShell>
  )
}
