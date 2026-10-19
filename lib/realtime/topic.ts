/**
 * A realtime channel topic that is unique to one subscription.
 *
 * The browser Supabase client is a singleton, and realtime-js hands back an existing
 * channel when a topic is reused — including one that is still leaving after
 * `removeChannel()`. A component that re-subscribes on a fixed topic (dependency change,
 * StrictMode double mount, the sidebar mounted twice) then gets a channel whose new
 * `postgres_changes` bindings never fire. A per-subscription suffix avoids that.
 */
export function uniqueTopic(name: string): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${name}:${suffix}`
}
