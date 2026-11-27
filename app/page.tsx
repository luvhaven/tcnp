import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/landing/LandingPage'
import packageInfo from '@/package.json'
import './landing.css'

export const metadata: Metadata = {
  title: { absolute: 'TCNP Central: the Protocol team app for Android, iPhone, Windows and Mac' },
  description: 'Journeys, live tracking and alerts for The Covenant Nation Protocol team. Get TCNP Central on Android, iPhone, Windows and Mac.',
}

/** Only a real https link is ever offered as a download. */
const downloadLink = (value: string | undefined) => value && /^https:\/\//.test(value) ? value : null

/**
 * The public front door. Signed-in officers go straight to their dashboard;
 * everyone else sees the download page. (proxy.ts already sends installed
 * native-app sessions and signed-in visitors on before this renders.)
 */
export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <LandingPage
      androidUrl={downloadLink(process.env.NEXT_PUBLIC_ANDROID_APP_URL)}
      iosUrl={downloadLink(process.env.NEXT_PUBLIC_IOS_APP_URL)}
      version={packageInfo.version}
    />
  )
}
