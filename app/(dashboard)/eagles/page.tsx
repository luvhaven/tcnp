import { redirect } from 'next/navigation'

// Eagle Square was renamed to Alpha (Alpha Oscar — airport operations)
export default function EaglesRedirect() {
  redirect('/alpha')
}
