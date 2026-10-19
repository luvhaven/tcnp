import type { ReactNode } from "react"

/**
 * One bottom-anchored column for every floating notice (mission requests,
 * notification/PWA prompts, sync status, the live-location pill).
 *
 * Each of those used to be its own `fixed bottom-4 …` element, so whenever two
 * were visible they sat on top of each other, and none of them cleared the
 * iPhone home indicator or the mobile tab bar. Stacking them in normal flow
 * here fixes both: they can never overlap, and the column's offset
 * (`.floating-stack` in globals.css) already accounts for
 * env(safe-area-inset-bottom) and the bottom tab bar height.
 *
 * Phones: full width minus a 16px gutter. sm+: a max-w-sm column on the right.
 * The column itself ignores pointer events so it never blocks the page; each
 * child opts back in with `pointer-events-auto`.
 */
export function FloatingStack({ children }: { children: ReactNode }) {
  return (
    <div className="floating-stack pointer-events-none fixed inset-x-4 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm">
      {children}
    </div>
  )
}
