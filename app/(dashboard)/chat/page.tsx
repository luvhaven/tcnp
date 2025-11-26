'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import ChatSystem from '@/components/chat/ChatSystem'
import { createClient } from '@/lib/supabase/client'

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

export default function ChatPage() {
  const supabase = createClient()
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

        if (!['super_admin', 'admin'].includes(userRow.role ?? '')) {
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {program && !activePapa && (
            <p className="text-sm text-muted-foreground mt-1">
              Program team chat for this TCNP event
            </p>
          )}
          {program && activePapa && (
            <p className="text-sm text-muted-foreground mt-1">
              PAPA chatroom for {activePapa.title ? `${activePapa.title} ` : ''}{activePapa.full_name}
            </p>
          )}
          {!program && !loading && (
            <p className="text-sm text-muted-foreground mt-1">
              {programs.length === 0
                ? 'You are not assigned to any active programs yet. Ask an admin to add you to a program to participate in chat.'
                : 'Select a program to start program-specific chat.'}
            </p>
          )}
        </div>

        {programs.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Program</span>
              <select
                value={program?.id || ''}
                onChange={handleProgramChange}
                className="min-w-[200px] rounded-md border bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.status ? `(${p.status})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {program && papas.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Chatroom</span>
                <select
                  value={papaId || ''}
                  onChange={handlePapaChange}
                  className="min-w-[220px] rounded-md border bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
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
          </div>
        )}
      </div>

      <Card className="transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
        {loading ? (
          <div className="h-[320px] w-full rounded-lg skeleton" />
        ) : programs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            {role && !['super_admin', 'admin'].includes(role)
              ? 'You have no program assignments yet. Once you are added to a program, you will be able to chat with that program team here.'
              : 'No programs found. Create a program first, then use this page to chat with the program team.'}
          </div>
        ) : (
          <ChatSystem programId={program?.id} papaId={papaId || undefined} />
        )}
      </Card>
    </div>
  )
}
