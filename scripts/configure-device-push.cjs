// Run once AFTER applying the device push migration. Never print or persist secrets.
require('@next/env').loadEnvConfig(process.cwd())
const { createClient } = require('@supabase/supabase-js')
const { generateVAPIDKeys } = require('web-push')
const { randomBytes } = require('node:crypto')
async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: existing, error } = await db.rpc('get_device_push_config')
  if (error) throw new Error('Apply the device push migration before configuring delivery.')
  if (existing?.publicKey) { console.log('Device push is already configured. Existing keys preserved.'); return }
  const keys = generateVAPIDKeys()
  const { error: setupError } = await db.rpc('configure_device_push', { p_public_key: keys.publicKey, p_private_key: keys.privateKey, p_subject: 'https://tcnp.vercel.app', p_dispatch_secret: randomBytes(32).toString('base64url'), p_dispatch_url: 'https://tcnp.vercel.app/api/notifications/dispatch' })
  if (setupError) throw new Error('Could not configure delivery. Check the migration and Vault/Cron availability.')
  console.log('Device push configured. Signing keys and dispatcher token are stored in Supabase Vault.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
