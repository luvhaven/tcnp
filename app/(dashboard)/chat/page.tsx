'use client'

import { useEffect, useState, Suspense } from 'react'
import { Card } from '@/components/ui/card'
import ChatSystem from '@/components/chat/ChatSystem'
import { AdminChatControls } from '@/components/chat/AdminChatControls'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'

type ChatProgram = {
  id: string
  name: string
  status: string | null
}

type ChatPapa = {
  id: string
  full_name: string
  title: string | null
}

function ChatContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const initialMessage = searchParams.get('message') || undefined

  const [programs, setPrograms] = useState<ChatProgram[]>([])
  const [program, setProgram] = useState<ChatProgram | null>(null)
  const [papas, setPapas] = useState<ChatPapa[]>([])
  const [papaId, setPapaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const loadContext = async () => {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser()

        if (!user) {
          setLoading(false)
          return
        }

        const { data: userRow, error: userError } = await supabase
          .from('users')
          .select('id, role')
          .eq('id', user.id)
          .single<{ id: string; role: string | null }>()

        if (userError || !userRow) {
          console.error('❌ Error loading current user for chat:', userError)
          setLoading(false)
          return
        }

        setRole(userRow.role ?? null)

        const { data: allPrograms, error: progError } = await supabase
          .from('programs')
          .select('id, name, status, created_at')
          .order('created_at', { ascending: false })

        if (progError) {
          console.error('❌ Error loading programs for chat:', progError)
          setLoading(false)
          return
        }

        let visiblePrograms = (allPrograms || []) as ChatProgram[]

        if (!['super_admin', 'dev_admin', 'admin'].includes(userRow.role ?? '')) {
          // Restrict officers to programs they are assigned to via current_title_assignments
          const { data: assignments, error: assignError } = await (supabase as any)
            .from('current_title_assignments')
            .select('program_id')
            .eq('user_id', user.id)

          if (assignError) {
            console.error('❌ Error loading program assignments for chat:', assignError)
            visiblePrograms = []
          } else {
            const allowedIds = new Set(
              (assignments || [])
                .map((row: { program_id: string | null }) => row.program_id)
                .filter((id: string | null): id is string => Boolean(id))
            )
            visiblePrograms = visiblePrograms.filter((p) => allowedIds.has(p.id))
          }
        }

        setPrograms(visiblePrograms)

        if (visiblePrograms.length > 0) {
          const active = visiblePrograms.find((p) => p.status === 'active')
          const planning = visiblePrograms.find((p) => p.status === 'planning')
          const selected = (active || planning || visiblePrograms[0] || null) as ChatProgram | null
          setProgram(selected)
        } else {
          setProgram(null)
        }
      } catch (error) {
        console.error('❌ Unexpected error loading chat context:', error)
      } finally {
        setLoading(false)
      }
    }

    void loadContext()
  }, [])

  useEffect(() => {
    const loadPapasForProgram = async () => {
      if (!program?.id) {
        setPapas([])
        setPapaId(null)
        return
      }

      try {
        const { data, error } = await supabase
          .from('papas')
          .select('id, full_name, title, program_id')
          .eq('program_id', program.id)
          .order('full_name')

        if (error) {
          console.error('❌ Error loading papas for chat:', error)
          setPapas([])
          setPapaId(null)
          return
        }

        setPapas((data || []) as ChatPapa[])
        // Default to program-level room when program changes
        setPapaId(null)
      } catch (error) {
        console.error('❌ Unexpected error loading papas for chat:', error)
        setPapas([])
        setPapaId(null)
      }
    }

    void loadPapasForProgram()
  }, [program?.id])

  const title = program?.name ? `TCNP - ${program.name}` : 'TCNP'

  const activePapa = papaId ? papas.find((p) => p.id === papaId) || null : null

  const handleProgramChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = programs.find((p) => p.id === event.target.value) || null
    setProgram(next)
  }

  const handlePapaChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    setPapaId(value || null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="h-8 w-48 rounded-md skeleton" />
            <div className="mt-2 h-4 w-64 rounded-md skeleton" />
          </div>
          <div className="flex gap-4">
            <div className="h-8 w-48 rounded-md skeleton" />
            <div className="h-8 w-48 rounded-md skeleton" />
          </div>
        </div>
        <Card>
          <div className="h-[600px] w-full rounded-lg skeleton" />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl sm:text-2xl font-bold break-words leading-tight">{title}</h1>
          {!program && !loading && (
            <p className="text-[11px] text-muted-foreground hidden sm:inline-block">
              {programs.length === 0
                ? 'No program assignments.'
                : 'Select a program.'}
            </p>
          )}
        </div>

        {programs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Program</span>
              <select
                value={program?.id || ''}
                onChange={handleProgramChange}
                className="max-w-[150px] rounded border bg-background px-1.5 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.status ? `(${p.status})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {program && papas.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Room</span>
                <select
                  value={papaId || ''}
                  onChange={handlePapaChange}
                  className="max-w-[150px] rounded border bg-background px-1.5 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-primary/60"
                >
                  <option value="">Program team room</option>
                  {papas.map((papa) => (
                    <option key={papa.id} value={papa.id}>
                      {papa.title ? `${papa.title} ` : ''}{papa.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {role && ['super_admin', 'dev_admin', 'admin'].includes(role) && (
              <AdminChatControls programId={program?.id} programName={program?.name} />
            )}
          </div>
        )}
      </div>

      <Card className="shadow-lg border-0 bg-transparent sm:bg-card">
        {loading ? (
          <div className="h-[320px] w-full rounded-lg skeleton" />
        ) : programs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            {role && !['super_admin', 'dev_admin', 'admin'].includes(role)
              ? 'You have no program assignments yet. Once you are added to a program, you will be able to chat with that program team here.'
              : 'No programs found. Create a program first, then use this page to chat with the program team.'}
          </div>
        ) : (
          <ChatSystem
            programId={program?.id}
            papaId={papaId || undefined}
            initialMessage={initialMessage}
          />
        )}
      </Card>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="h-[600px] w-full rounded-lg skeleton" />}>
      <ChatContent />
    </Suspense>
  )
}
