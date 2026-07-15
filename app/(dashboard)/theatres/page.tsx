import { redirect } from 'next/navigation'

// Theatres was renamed to Victor (Victor Oscar — venue operations)
export default function TheatresRedirect() {
  redirect('/victor')
}
