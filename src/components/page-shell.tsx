/**
 * The title block and content spacing of a screen — everything a page owns.
 *
 * This used to be `AppShell`, and used to render the whole frame: the rail, the
 * top bar, and the scrolling body, per page. That is why the app felt slow. A
 * page is re-rendered on every navigation, so the rail's viewer lookup and badge
 * counts ran again before anything could appear on screen, and the navigation
 * itself was inside the region being replaced — leaving nowhere to put a
 * `loading.tsx` boundary that would not also blank the rail.
 *
 * The frame is now `AppFrame`, rendered once by `(signed-in)/layout.tsx`. A layout
 * survives navigation, so the rail stays put, its queries run once, and Next can
 * prefetch each route down to the loading boundary. What remains here is the part
 * that genuinely differs per page.
 */
export function PageShell({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string
  /** The small tracked-uppercase line above the title. */
  eyebrow?: string
  /** Optional right-aligned control beside the title, e.g. "Reassign people". */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1
            style={{
              fontSize: 'clamp(1.75rem, 1.3rem + 1.6vw, 2rem)',
              margin: eyebrow ? '8px 0 0' : 0,
            }}
          >
            {title}
          </h1>
        </div>
        {action}
      </div>
      <div style={{ marginTop: 26 }}>{children}</div>
    </>
  )
}
