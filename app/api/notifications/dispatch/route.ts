import { timingSafeEqual } from 'node:crypto'
import webPush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { validPushEndpoint, safeNotificationUrl } from '@/lib/push-validation'

export const runtime = 'nodejs'
export const maxDuration = 60
export async function POST(request: Request) {
  const db = createAdminClient() as any
  const { data: config, error } = await db.rpc('get_device_push_config')
  const supplied = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${config?.dispatchSecret || ''}`)
  if (error || !config?.dispatchSecret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response('Unauthorized', { status: 401 })
  const { data: jobs, error: claimError } = await db.rpc('claim_notification_push', { batch_size: 25 })
  if (claimError) return new Response('Retry later', { status: 503 })
  let sent = 0
  async function deliver(job: any) {
    let delivered = false, code: string | null = null, retry: number | null = null
    const { data: sub, error: subError } = await db.from('device_push_subscriptions').select('*').eq('id', job.subscription_id).maybeSingle()
    const { data: notice, error: noticeError } = await db.from('notifications').select('id,user_id,title,type,metadata,journey_id').eq('id', job.notification_id).maybeSingle()
    const { data: user, error: userError } = sub ? await db.from('users').select('is_active,activation_status').eq('id', sub.user_id).maybeSingle() : { data: null, error: null }
    if (subError || noticeError || userError) { code = 'lookup_failed'; retry = 60 }
    else if (!sub || !notice || sub.user_id !== notice.user_id || !user?.is_active || user.activation_status !== 'active' || !validPushEndpoint(sub.endpoint)) code = 'recipient_unavailable'
    else {
      try {
        await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, JSON.stringify({
          title: 'TCNP', body: 'You have a new update. Open TCNP to view it.', tag: `tcnp-${notice.id}`, targetUserId: sub.user_id,
          notificationId: notice.id, critical: notice.type === 'broken_arrow',
          url: safeNotificationUrl(notice.metadata?.url ?? (notice.journey_id ? `/journeys?highlight=${notice.journey_id}` : notice.type === 'chat' ? '/chat' : '/dashboard')),
        }), { vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey }, TTL: 86400, timeout: 5000, urgency: notice.type === 'broken_arrow' ? 'high' : 'normal' })
        delivered = true; sent++
      } catch (error: any) {
        const status = Number(error?.statusCode || 0)
        code = status ? `push_${status}` : 'network_failure'
        if (status === 404 || status === 410) await db.from('device_push_subscriptions').delete().eq('id', sub.id)
        else if (!status || status === 429 || status >= 500) retry = Math.min(3600, 30 * 2 ** job.attempts)
      }
    }
    await db.rpc('settle_notification_push', { job_id: job.id, delivery_lease: job.lease_id, delivered, error_code: code, retry_seconds: retry })
  }
  // Five bounded batches fit the dispatch lease and serverless execution window.
  for (let offset = 0; offset < (jobs?.length || 0); offset += 5) await Promise.all(jobs.slice(offset, offset + 5).map(deliver))
  return Response.json({ processed: jobs?.length || 0, sent }, { headers: { 'Cache-Control': 'no-store' } })
}
