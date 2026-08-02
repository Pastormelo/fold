import { AppFrame } from '@/components/app-frame'

/**
 * Everything a signed-in leader sees sits in this layout.
 *
 * The route group `(signed-in)` does not appear in any URL — it exists so the
 * frame can be a layout rather than something each page renders. `/sign-in` and
 * `/auth/*` stay outside it, because they have no rail and no viewer to resolve.
 *
 * A layout is not re-rendered when you navigate between the pages inside it. That
 * is the whole point: the rail stays on screen, `getViewerSummary` and
 * `getRailBadges` run once instead of on every click, and `loading.tsx` beside
 * this file replaces only the content area.
 */
export default function SignedInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppFrame>{children}</AppFrame>
}
