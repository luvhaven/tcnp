import { createClient } from '@/lib/supabase/client'
import { redirect } from 'next/navigation'
import ContactDirectoryClient from './ContactDirectoryClient'

export default async function ContactDirectoryPage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    return <ContactDirectoryClient />
}
