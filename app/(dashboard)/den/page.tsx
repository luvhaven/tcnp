import { createClient } from '@/lib/supabase/server'
import DenClient from './DenClient'

export default async function DenPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ tab }, supabase] = await Promise.all([searchParams, createClient()])

  const { data: initialDens } = await supabase
    .from('nests')
    .select(`
      *,
      programs(name)
    `)
    .eq('type', 'den')
    .order('name')
    .limit(100)

  return (
    <DenClient
      initialDens={initialDens || []}
      initialTab={Array.isArray(tab) ? tab[0] ?? null : tab ?? null}
    />
  )
}
