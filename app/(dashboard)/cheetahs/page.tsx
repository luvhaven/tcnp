import { redirect } from 'next/navigation'

// Cheetahs was renamed to Tango (Tango Oscar — transport operations)
export default function CheetahsRedirect() {
  redirect('/tango')
}
