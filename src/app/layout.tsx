import type { Metadata } from 'next'
import { Montserrat, Mulish } from 'next/font/google'

import './globals.css'
import { ViewerSwitch } from '@/components/viewer-switch'

/**
 * Montserrat and Mulish are the design system's documented substitutions for
 * the church's real brand faces, which were never supplied. If the originals
 * turn up, this is the one place to swap them.
 */
const montserrat = Montserrat({
  variable: '--font-display-loaded',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

const mulish = Mulish({
  variable: '--font-body-loaded',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

/**
 * No route in Fold may be prerendered or cached.
 *
 * Every screen renders content that has been redacted for one specific viewer,
 * so a shared prerender or a cache entry keyed on anything less than the
 * viewer's identity is a confidentiality bug — the wrong reader would be served
 * a page built for someone with different clearance. Declaring it here, on the
 * root layout, makes it the default for the whole app rather than a decision
 * each new page has to remember.
 *
 * This is also why `next build` fails loudly if a page tries to prerender: the
 * viewer guard in `src/data/viewer.ts` throws rather than inventing a session.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Fold — Church Care Platform',
  description:
    'A person should not be able to quietly disappear. Fold tracks guests through a pathway, members through folds under a named elder, and both through care journeys.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${mulish.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ViewerSwitch />
        {children}
      </body>
    </html>
  )
}
