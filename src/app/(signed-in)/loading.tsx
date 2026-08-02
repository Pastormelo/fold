/**
 * What fills the content area while a page's data is still coming.
 *
 * Two jobs, and the second is the less obvious one.
 *
 * It gives a click something to show immediately. Every screen in Fold reads from
 * Postgres for a specific viewer and nothing is cached — §3 makes a shared cache a
 * confidentiality bug — so a page takes as long as its queries take. Without a
 * boundary here, that time was spent with the previous screen still on display and
 * no sign that anything had happened, which reads as a broken click rather than a
 * slow one.
 *
 * It also switches prefetching on. For a dynamic route, Next prefetches only as
 * far as the nearest `loading` boundary; with none in the tree there was nothing
 * to prefetch, so hovering a rail item did no work ahead of time. This file is
 * that boundary for every signed-in screen.
 *
 * Shaped like a page rather than a spinner — a title line and a few cards — so the
 * layout does not jump when the real content arrives. `aria-busy` and the label
 * are for anyone who cannot see it happen.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="fold-skeleton" style={{ width: 92, height: 10 }} />
      <div
        className="fold-skeleton"
        style={{ width: 280, height: 30, marginTop: 12 }}
      />

      <div className="mt-[26px] flex flex-col gap-3">
        {/* Three, because most screens open with a short stack of cards. Fewer
            would leave the area looking empty; more would push real content
            further down when it lands. */}
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px 20px',
            }}
          >
            <div className="fold-skeleton" style={{ width: '35%', height: 12 }} />
            <div
              className="fold-skeleton"
              style={{ width: '72%', height: 12, marginTop: 10 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
