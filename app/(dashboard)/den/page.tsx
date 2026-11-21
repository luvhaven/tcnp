import { createClient } from '@/lib/supabase/server'
import DenClient from './DenClient'

export default async function DenPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ tab, programme }, supabase] = await Promise.all([searchParams, createClient()])

  const { data: initialDens, error: densError } = await supabase
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
      initialDensError={Boolean(densError)}
      initialTab={Array.isArray(tab) ? tab[0] ?? null : tab ?? null}
      initialProgramme={Array.isArray(programme) ? programme[0] ?? null : programme ?? null}
    />
  )
}
