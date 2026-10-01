'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { Card } from '@/components/ui/card'
import ChatSystem from '@/components/chat/ChatSystem'
import TeamChatRoom from '@/components/chat/TeamChatRoom'
import { AdminChatControls } from '@/components/chat/AdminChatControls'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MessagesSquare, Radio, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { isAdmin, effectiveOscarRole } from '@/lib/utils'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Button } from '@/components/ui/button'

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
  const supabase = useMemo(() => createClient(), [])
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
          .select('id, role, oscar, is_active, activation_status')
          .eq('id', user.id)
          .single<{ id: string; role: string | null; oscar: string | null; is_active: boolean | null; activation_status: string | null }>()

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

        const allProgsList = (allPrograms || []) as ChatProgram[]
        let visiblePrograms = allProgsList

        const isUserAdmin = isAdmin(userRow.role) || isAdmin(effectiveOscarRole(userRow.role, userRow.oscar))

        if (!isUserAdmin) {
          const allowedIds = new Set<string>()

          // 1. Current title assignments
          const { data: currentAssignments } = await (supabase as any)
            .from('current_title_assignments')
            .select('program_id')
            .eq('user_id', user.id)

          ;(currentAssignments || []).forEach((r: any) => {
            if (r.program_id) allowedIds.add(r.program_id)
          })

          // 2. Direct title assignments
          const { data: directAssignments } = await (supabase as any)
            .from('title_assignments')
            .select('program_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .not('program_id', 'is', null)

          ;(directAssignments || []).forEach((r: any) => {
            if (r.program_id) allowedIds.add(r.program_id)
          })

          // 3. Direct journey DO assignments in programs
          const { data: journeyAssignments } = await (supabase as any)
            .from('journeys')
            .select('program_id')
            .eq('assigned_duty_officer_id', user.id)
            .not('program_id', 'is', null)

          ;(journeyAssignments || []).forEach((r: any) => {
            if (r.program_id) allowedIds.add(r.program_id)
          })

          // 4. If officer is added and active, also allow active/planning operational programs
          const isActiveOfficer = userRow.is_active !== false && userRow.activation_status !== 'deactivated'
          if (isActiveOfficer) {
            allProgsList.forEach((p) => {
              if (p.status === 'active' || p.status === 'planning') {
                allowedIds.add(p.id)
              }
            })
          }

          visiblePrograms = allProgsList.filter((p) => allowedIds.has(p.id))
        }

        setPrograms(visiblePrograms)

        const requestedProgramId = searchParams.get('programId') || searchParams.get('program')
        const requestedProgram = requestedProgramId ? visiblePrograms.find((p) => p.id === requestedProgramId) : null

        if (requestedProgram) {
          setProgram(requestedProgram)
        } else if (visiblePrograms.length > 0) {
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
  }, [supabase])

  useEffect(() => {
    const loadPapasForProgram = async () => {
      if (!program?.id) {
        setPapas([])
        setPapaId(null)
        return
      }

      try {
        const { data, error } = await supabase
          .from('papas_basic')
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
  }, [program?.id, supabase])

  const title = program?.name ? `TCNP - ${program.name}` : 'TCNP'

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
              <label htmlFor="chat-program" className="text-overline uppercase text-muted-foreground">Program</label>
              <select
                id="chat-program"
                value={program?.id || ''}
                onChange={handleProgramChange}
                className="h-9 max-w-[12rem] rounded-md border bg-background px-2.5 text-sm shadow-xs focus-visible:outline-none"
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
                <label htmlFor="chat-room" className="text-overline uppercase text-muted-foreground">Room</label>
                <select
                  id="chat-room"
                  value={papaId || ''}
                  onChange={handlePapaChange}
                  className="h-9 max-w-[12rem] rounded-md border bg-background px-2.5 text-sm shadow-xs focus-visible:outline-none"
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

            {role && isAdmin(role) && (
              <AdminChatControls programId={program?.id} programName={program?.name} />
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="program" className="space-y-3">
        <TabsList>
          <TabsTrigger value="program"><Radio className="mr-2 h-4 w-4" />Program Chat</TabsTrigger>
          <TabsTrigger value="team"><MessagesSquare className="mr-2 h-4 w-4" />My Team</TabsTrigger>
        </TabsList>

        <TabsContent value="program">
          <Card className="shadow-lg border-0 bg-transparent sm:bg-card">
            {loading ? (
              <div className="h-[320px] w-full rounded-lg skeleton" />
            ) : programs.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                {role && !isAdmin(role)
                  ? 'You have no program assignments yet. Once you are added to a program, you will be able to chat with that program team here.'
                  : 'No programs found. Create a program first, then use this page to chat with the program team.'}
              </div>
            ) : (
              <ErrorBoundary fallback={
                <div className="p-6 text-center space-y-3">
                  <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
                  <p className="text-sm font-medium">Chat encountered a temporary display issue.</p>
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Reload Chat</Button>
                </div>
              }>
                <ChatSystem
                  programId={program?.id}
                  papaId={papaId || undefined}
                  initialMessage={initialMessage}
                />
              </ErrorBoundary>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <ErrorBoundary fallback={
            <div className="p-6 text-center space-y-3">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
              <p className="text-sm font-medium">Team chat encountered a temporary display issue.</p>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Reload Team Chat</Button>
            </div>
          }>
            <TeamChatRoom />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
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
