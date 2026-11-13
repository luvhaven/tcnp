'use client'

/**
 * An inline script that must run while the browser parses the HTML, before
 * hydration (theme bootstrap, install-offer capture).
 *
 * A plain <script> in the root layout does that on a full page load, but React
 * also re-renders the layout in the browser, where a script inserted through
 * the DOM never executes. React warns about that in development
 * ("Encountered a script tag while rendering React component"), which the dev
 * overlay reports as an error on every page.
 *
 * This is the helper from Next's "Preventing flash before hydration" guide:
 * the server emits an executable script, the browser-side render emits an
 * inert `text/plain` one, and suppressHydrationWarning accepts the difference.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
