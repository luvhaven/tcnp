import { redirect } from 'next/navigation'

// The live map is the only tracking view; a bookmarked /tracking lands there.
export default function TrackingPage() {
  redirect('/tracking/live')
}
