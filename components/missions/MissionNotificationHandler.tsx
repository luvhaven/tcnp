"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { ShieldAlert, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export default function MissionNotificationHandler() {
    const supabase = createClient()
    const queryClient = useQueryClient()
    const [session, setSession] = useState<any>(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session))
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })
        return () => subscription.unsubscribe()
    }, [])

    // Poll for pending assignments (easier than setting up full DB realtime for now, or we can use Realtime)
    const { data: pendingAssignments = [] } = useQuery({
        queryKey: ['pending-assignments', session?.user?.id],
        queryFn: async () => {
            if (!session?.user?.id) return []

            const { data, error } = await supabase
                .from('journey_duty_officers')
                .select(`
          id,
          journey_id,
          is_lead,
          journeys (
            papa_id,
            etd,
            eta,
            papas (
              full_name,
              title
            )
          )
        `)
                .eq('user_id', session.user.id)
                .eq('status', 'pending')

            if (error) throw error
            return data || []
        },
        enabled: !!session?.user?.id,
        refetchInterval: 30000 // Poll every 30 seconds as fallback
    })

    // Set up Realtime listener for instant notification
    useEffect(() => {
        if (!session?.user?.id) return

        const channel = supabase
            .channel('journey_duty_officers_changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'journey_duty_officers',
                    filter: `user_id=eq.${session.user.id}`
                },
                (payload) => {
                    if (payload.new.status === 'pending') {
                        // Play alarm sound
                        playAlarm()
                        queryClient.invalidateQueries({ queryKey: ['pending-assignments', session.user.id] })
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [session?.user?.id])

    // Play a loud ringing alarm for assignments
    const playAlarm = () => {
        try {
            const audio = new Audio('/alarm.mp3') // Ensure this file exists in public directory
            audio.play().catch((e) => console.log('Audio autoplay blocked', e))

            // Also request browser notification permission if available
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification("TCNP Mission Assignment", {
                    body: "You have a new Delta Oscar mission assignment requiring your acceptance.",
                    icon: "/favicon.ico"
                })
            } else if ('Notification' in window && Notification.permission !== 'denied') {
                Notification.requestPermission()
            }
        } catch (e) {
            // Ignore errors for devices that don't support audio
        }
    }

    // Play alarm instantly if pending assignments exist on load and we haven't played it yet
    useEffect(() => {
        if (pendingAssignments.length > 0) {
            playAlarm()
        }
    }, [pendingAssignments.length])

    const acceptMutation = useMutation({
        mutationFn: async (assignmentId: string) => {
            const { error } = await supabase
                .from('journey_duty_officers')
                .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
                .eq('id', assignmentId)
            if (error) throw error
            return assignmentId
        },
        onSuccess: () => {
            toast.success("Mission Accepted!")
            queryClient.invalidateQueries({ queryKey: ['pending-assignments', session?.user?.id] })
            // Here you would also log to audit_logs in a robust way
        },
        onError: (e: any) => {
            toast.error(e.message || "Failed to accept mission")
        }
    })

    const rejectMutation = useMutation({
        mutationFn: async (assignmentId: string) => {
            const { error } = await supabase
                .from('journey_duty_officers')
                .update({ status: 'rejected' })
                .eq('id', assignmentId)
            if (error) throw error
            return assignmentId
        },
        onSuccess: () => {
            toast.success("Mission Rejected.")
            queryClient.invalidateQueries({ queryKey: ['pending-assignments', session?.user?.id] })
        }
    })

    if (pendingAssignments.length === 0) return null

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-4 max-w-sm w-full">
            <AnimatePresence>
                {pendingAssignments.map((assignment: any) => {
                    const papaName = assignment.journeys?.papas?.full_name || 'Unknown Principal'
                    const role = assignment.is_lead ? 'Lead Delta Oscar' : 'Delta Oscar Team'

                    return (
                        <motion.div
                            initial={{ opacity: 0, y: 50, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
                            key={assignment.id}
                            className="bg-zinc-950 border border-orange-500/50 shadow-2xl shadow-orange-500/20 rounded-xl overflow-hidden p-0 animate-in slide-in-from-bottom flex flex-col relative"
                        >
                            <div className="absolute top-0 left-0 w-1 h-full bg-orange-500 animate-pulse" />
                            <div className="p-4 pl-5">
                                <div className="flex items-center gap-3 mb-2">
                                    <ShieldAlert className="h-6 w-6 text-orange-500 animate-pulse" />
                                    <h3 className="font-bold text-lg text-white">MISSION ASSIGNMENT</h3>
                                </div>

                                <div className="mt-4 space-y-1">
                                    <p className="text-sm text-zinc-400">Principal</p>
                                    <p className="font-semibold text-white/90">{papaName}</p>
                                </div>

                                <div className="mt-3 space-y-1">
                                    <p className="text-sm text-zinc-400">Assigned Role</p>
                                    <p className="font-semibold text-orange-400">{role}</p>
                                </div>
                            </div>

                            <div className="bg-white/5 p-3 flex items-center justify-end gap-2 border-t border-white/10 mt-2">
                                <Button
                                    key="reject"
                                    variant="ghost"
                                    className="text-white/60 hover:text-red-400 hover:bg-red-500/10 text-xs px-3 h-8"
                                    onClick={() => rejectMutation.mutate(assignment.id)}
                                    disabled={rejectMutation.isPending || acceptMutation.isPending}
                                >
                                    <XCircle className="w-4 h-4 mr-1" /> REJECT
                                </Button>

                                <Button
                                    key="accept"
                                    variant="default"
                                    className="bg-orange-600 hover:bg-orange-500 text-white shadow-lg text-xs font-bold tracking-wider px-6 h-8"
                                    onClick={() => acceptMutation.mutate(assignment.id)}
                                    disabled={rejectMutation.isPending || acceptMutation.isPending}
                                >
                                    <CheckCircle2 className="w-4 h-4 mr-2" /> ACCEPT
                                </Button>
                            </div>
                        </motion.div>
                    )
                })}
            </AnimatePresence>
        </div>
    )
}
