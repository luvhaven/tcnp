"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  Loader2,
  Megaphone,
  PlayCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundCheck,
  Users,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { cn, isPlatformAdministrator } from "@/lib/utils"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const supabase = createClient()

type UnitRow = { id: string; slug: string; name: string }
type UnitMembership = { unit_id: string; user_id: string; access_level: string; status: string }
type Officer = { id: string; full_name: string | null; email: string | null; oscar: string | null; team: string | null }
type TrainingCourse = {
  id: string
  title: string
  description: string | null
  target_unit_id: string | null
  visibility: string
  status: string
  estimated_minutes: number | null
  created_by: string | null
  created_at: string
}
type TrainingLesson = {
  id: string
  course_id: string
  title: string
  description: string | null
  youtube_video_id: string | null
  sort_order: number
  duration_minutes: number | null
  is_required: boolean
}
type LessonProgress = {
  lesson_id: string
  user_id: string
  percent_complete: number
  watched_seconds?: number
  video_duration_seconds?: number | null
  completed_at: string | null
  last_watched_at: string | null
}
type CourseAssignment = {
  id: string
  course_id: string
  user_id: string
  due_at: string | null
  status: string
  assigned_by: string | null
}
type TrainingSchedule = {
  id: string
  topic: string
  session_date: string
  start_time: string | null
  location: string | null
  visibility: "all_members" | "training_unit" | "target_unit" | "invite_only"
  target_unit_id: string | null
  broadcast_sent_at: string | null
}
type Attendance = {
  training_schedule_id: string
  user_id: string
  status: string
  checked_in_at: string | null
  checked_in_by: string | null
  notes: string | null
}
type Evaluation = {
  id: string
  subject_user_id: string
  member_stage: string
  training_schedule_id: string | null
  evaluator_id: string | null
  status: string
  due_at: string | null
  submitted_at: string | null
  score: number | null
  feedback: string | null
  strengths: string | null
  growth_areas: string | null
  responses: Record<string, unknown> | null
}

const MANAGEMENT_LEVELS = new Set(["head", "manager", "admin"])
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

function extractYouTubeId(value: string) {
  const raw = value.trim()
  if (YOUTUBE_ID.test(raw)) return raw
  try {
    const url = new URL(raw)
    if (url.hostname === "youtu.be") return YOUTUBE_ID.test(url.pathname.slice(1)) ? url.pathname.slice(1) : null
    if (url.hostname.endsWith("youtube.com")) {
      const fromQuery = url.searchParams.get("v")
      if (fromQuery && YOUTUBE_ID.test(fromQuery)) return fromQuery
      const parts = url.pathname.split("/").filter(Boolean)
      const candidate = parts.find((part, index) => ["embed", "shorts", "live"].includes(parts[index - 1]))
      return candidate && YOUTUBE_ID.test(candidate) ? candidate : null
    }
  } catch {
    return null
  }
  return null
}

function personName(id: string | null | undefined, officers: Officer[]) {
  if (!id) return "Unassigned"
  return officers.find((officer) => officer.id === id)?.full_name || "Protocol officer"
}

function statusTone(status: string) {
  if (["completed", "present", "published", "active"].includes(status)) return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
  if (["overdue", "absent", "cancelled"].includes(status)) return "bg-red-500/12 text-red-700 dark:text-red-300"
  if (["submitted", "in_progress", "excused"].includes(status)) return "bg-amber-500/12 text-amber-700 dark:text-amber-300"
  return "bg-muted text-muted-foreground"
}

type YouTubeApiWindow = Window & typeof globalThis & {
  YT?: any
  onYouTubeIframeAPIReady?: () => void
}

let youtubeApiPromise: Promise<any> | null = null

function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("Video playback is available in the browser"))
  const youtubeWindow = window as YouTubeApiWindow
  if (youtubeWindow.YT?.Player) return Promise.resolve(youtubeWindow.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = youtubeWindow.onYouTubeIframeAPIReady
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      if (youtubeWindow.YT?.Player) resolve(youtubeWindow.YT)
      else reject(new Error("YouTube player API did not initialize"))
    }

    let script = document.getElementById("youtube-iframe-api") as HTMLScriptElement | null
    if (!script) {
      script = document.createElement("script")
      script.id = "youtube-iframe-api"
      script.src = "https://www.youtube.com/iframe_api"
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener("error", () => reject(new Error("YouTube player could not be loaded")), { once: true })
  })
  return youtubeApiPromise
}

function TrackedYouTubeLesson({
  lessonId,
  videoId,
  title,
  initialPercent,
  onWatch,
}: {
  lessonId: string
  videoId: string
  title: string
  initialPercent: number
  onWatch: (lessonId: string, seconds: number) => Promise<number | null>
}) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const onWatchRef = useRef(onWatch)
  const pendingSecondsRef = useRef(0)
  const lastTickRef = useRef<number | null>(null)
  const sendingRef = useRef(false)
  const mountedRef = useRef(true)
  const [percent, setPercent] = useState(initialPercent)
  const [playerError, setPlayerError] = useState<string | null>(null)

  useEffect(() => setPercent(initialPercent), [initialPercent])
  useEffect(() => { onWatchRef.current = onWatch }, [onWatch])

  useEffect(() => {
    mountedRef.current = true
    let timer: ReturnType<typeof setInterval> | null = null
    let disposed = false

    const flush = async (force = false) => {
      if (sendingRef.current) return
      const seconds = Math.min(30, Math.floor(pendingSecondsRef.current))
      if (seconds < (force ? 1 : 15)) return
      pendingSecondsRef.current -= seconds
      sendingRef.current = true
      try {
        const nextPercent = await onWatchRef.current(lessonId, seconds)
        if (mountedRef.current && nextPercent != null) setPercent(nextPercent)
      } catch {
        pendingSecondsRef.current += seconds
      } finally {
        sendingRef.current = false
      }
    }

    void loadYouTubeApi()
      .then((YT) => {
        if (disposed || !mountRef.current) return
        playerRef.current = new YT.Player(mountRef.current, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          playerVars: { rel: 0, modestbranding: 1, origin: window.location.origin },
          events: {
            onStateChange: (event: { data: number }) => {
              if (event.data === 1) {
                lastTickRef.current = performance.now()
              } else {
                lastTickRef.current = null
                void flush(true)
              }
            },
            onError: () => setPlayerError("This training video is unavailable."),
          },
        })

        timer = setInterval(() => {
          const player = playerRef.current
          if (!player || player.getPlayerState?.() !== 1 || document.visibilityState !== "visible") {
            lastTickRef.current = null
            return
          }
          const now = performance.now()
          if (lastTickRef.current != null) {
            pendingSecondsRef.current += Math.min(5, Math.max(0, (now - lastTickRef.current) / 1000))
          }
          lastTickRef.current = now
          void flush(false)
        }, 3000)
      })
      .catch((error: Error) => setPlayerError(error.message))

    return () => {
      disposed = true
      mountedRef.current = false
      if (timer) clearInterval(timer)
      void flush(true)
      try { playerRef.current?.destroy?.() } catch { /* Player already removed. */ }
      playerRef.current = null
    }
  }, [lessonId, videoId])

  return (
    <div className="space-y-2">
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        {playerError ? <div className="grid h-full place-items-center px-6 text-center text-xs text-white/75">{playerError}</div> : <div ref={mountRef} className="h-full w-full" title={`${title} training video`} />}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${percent}%` }} /></div>
        <span className="w-9 text-right font-mono tabular-nums">{percent}%</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Completion is recorded after at least 90% of the lesson has been watched in this window.</p>
    </div>
  )
}

export default function TrainingOperations() {
  const { data: currentUser } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("")
  const [memberSearch, setMemberSearch] = useState("")
  const [courseOpen, setCourseOpen] = useState(false)
  const [lessonOpen, setLessonOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [evaluationOpen, setEvaluationOpen] = useState(false)
  const [editingEvaluation, setEditingEvaluation] = useState<Evaluation | null>(null)
  const [courseForm, setCourseForm] = useState({ title: "", description: "", visibility: "all_members", target_unit_id: "", status: "published", estimated_minutes: "" })
  const [lessonForm, setLessonForm] = useState({ title: "", description: "", youtube: "", duration_minutes: "", is_required: "true" })
  const [memberForm, setMemberForm] = useState({ user_id: "", access_level: "member" })
  const [assignmentForm, setAssignmentForm] = useState({ user_id: "", due_at: "" })
  const [evaluationForm, setEvaluationForm] = useState({ subject_user_id: "", member_stage: "new", training_schedule_id: "", due_at: "", score: "", reflection: "", feedback: "", strengths: "", growth_areas: "" })

  const { data: trainingUnit } = useQuery({
    queryKey: ["unit", "training"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("units").select("id, slug, name").eq("slug", "training").maybeSingle()
      if (error) throw error
      return data as UnitRow | null
    },
  })

  const { data: units = [] } = useQuery({
    queryKey: ["units-lite", "training-courses"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("units").select("id, slug, name").eq("is_active", true).order("name")
      if (error) throw error
      return (data || []) as UnitRow[]
    },
  })

  const { data: myMembership } = useQuery({
    queryKey: ["unit-membership", "training", currentUser?.id, trainingUnit?.id],
    enabled: Boolean(currentUser?.id && trainingUnit?.id),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("unit_memberships")
        .select("unit_id, user_id, access_level, status")
        .eq("unit_id", trainingUnit!.id)
        .eq("user_id", currentUser!.id)
        .eq("status", "active")
        .maybeSingle()
      if (error) throw error
      return data as UnitMembership | null
    },
  })

  const canManage = Boolean(isPlatformAdministrator(currentUser?.role) || (myMembership && MANAGEMENT_LEVELS.has(myMembership.access_level)))

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["training-courses"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("training_courses").select("*").order("created_at", { ascending: false })
      if (error) throw error
      return (data || []) as TrainingCourse[]
    },
  })

  const { data: lessons = [] } = useQuery({
    queryKey: ["training-lessons"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("training_lessons").select("*").order("sort_order")
      if (error) throw error
      return (data || []) as TrainingLesson[]
    },
  })

  const { data: progress = [] } = useQuery({
    queryKey: ["training-progress", currentUser?.id, canManage],
    enabled: Boolean(currentUser?.id),
    queryFn: async () => {
      let query = (supabase as any).from("training_lesson_progress").select("*")
      if (!canManage) query = query.eq("user_id", currentUser!.id)
      const { data, error } = await query
      if (error) throw error
      return (data || []) as LessonProgress[]
    },
  })

  const { data: assignments = [] } = useQuery({
    queryKey: ["training-course-assignments", currentUser?.id, canManage],
    enabled: Boolean(currentUser?.id),
    queryFn: async () => {
      let query = (supabase as any).from("training_course_assignments").select("*").order("due_at", { ascending: true, nullsFirst: false })
      if (!canManage) query = query.eq("user_id", currentUser!.id)
      const { data, error } = await query
      if (error) throw error
      return (data || []) as CourseAssignment[]
    },
  })

  const { data: schedules = [] } = useQuery({
    queryKey: ["training-schedules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("training_schedules")
        .select("id, topic, session_date, start_time, location, visibility, target_unit_id, broadcast_sent_at")
        .order("session_date", { ascending: false })
      if (error) throw error
      return (data || []) as TrainingSchedule[]
    },
  })

  const { data: attendance = [] } = useQuery({
    queryKey: ["training-attendance", currentUser?.id, canManage],
    enabled: Boolean(currentUser?.id),
    queryFn: async () => {
      let query = (supabase as any).from("training_attendance").select("*")
      if (!canManage) query = query.eq("user_id", currentUser!.id)
      const { data, error } = await query
      if (error) throw error
      return (data || []) as Attendance[]
    },
  })

  const { data: evaluations = [] } = useQuery({
    queryKey: ["training-evaluations", currentUser?.id, canManage],
    enabled: Boolean(currentUser?.id),
    queryFn: async () => {
      const result = canManage
        ? await (supabase as any).from("training_evaluations").select("*").order("due_at", { ascending: true })
        : await (supabase as any).rpc("get_my_training_evaluations")
      const { data, error } = result
      if (error) throw error
      return (data || []) as Evaluation[]
    },
  })

  const { data: officers = [] } = useQuery({
    queryKey: ["training-officers"],
    enabled: Boolean(canManage),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("users")
        .select("id, full_name, email, oscar, team")
        .eq("is_active", true)
        .order("full_name")
      if (error) throw error
      return (data || []) as Officer[]
    },
  })

  const { data: memberships = [] } = useQuery({
    queryKey: ["unit-members", "training", trainingUnit?.id],
    enabled: Boolean(trainingUnit?.id && canManage),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("unit_memberships")
        .select("unit_id, user_id, access_level, status")
        .eq("unit_id", trainingUnit!.id)
        .eq("status", "active")
      if (error) throw error
      return (data || []) as UnitMembership[]
    },
  })

  const selectedCourse = courses.find((course) => course.id === activeCourseId) || courses[0] || null
  const selectedLessons = lessons.filter((lesson) => lesson.course_id === selectedCourse?.id)
  const ownProgress = progress.filter((row) => row.user_id === currentUser?.id)
  const completedLessonIds = new Set(ownProgress.filter((row) => row.completed_at || row.percent_complete >= 100).map((row) => row.lesson_id))
  const selectedCompleted = selectedLessons.filter((lesson) => completedLessonIds.has(lesson.id)).length
  const selectedPercent = selectedLessons.length ? Math.round((selectedCompleted / selectedLessons.length) * 100) : 0
  const selectedSchedule = selectedScheduleId || schedules[0]?.id || ""
  const memberIds = new Set(memberships.map((membership) => membership.user_id))
  const availableOfficers = officers.filter((officer) => !memberIds.has(officer.id))
  const filteredMembers = memberships.filter((membership) => {
    const person = officers.find((officer) => officer.id === membership.user_id)
    const query = memberSearch.trim().toLowerCase()
    return !query || `${person?.full_name || ""} ${person?.email || ""}`.toLowerCase().includes(query)
  })

  const courseStats = useMemo(() => {
    const published = courses.filter((course) => course.status === "published").length
    const totalLessons = lessons.length
    const completed = progress.filter((item) => item.completed_at || item.percent_complete >= 100).length
    return { published, totalLessons, completed }
  }, [courses, lessons, progress])

  const createCourse = useMutation({
    mutationFn: async () => {
      if (!courseForm.title.trim()) throw new Error("Course title is required")
      if (courseForm.visibility === "target_unit" && !courseForm.target_unit_id) throw new Error("Choose the unit this course is for")
      const { error } = await (supabase as any).from("training_courses").insert({
        title: courseForm.title.trim(),
        description: courseForm.description.trim() || null,
        target_unit_id: courseForm.visibility === "training_unit" ? trainingUnit?.id || null : courseForm.visibility === "target_unit" ? courseForm.target_unit_id : null,
        visibility: courseForm.visibility,
        status: courseForm.status,
        estimated_minutes: courseForm.estimated_minutes ? Number(courseForm.estimated_minutes) : 0,
        created_by: currentUser?.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Course created")
      setCourseOpen(false)
      setCourseForm({ title: "", description: "", visibility: "all_members", target_unit_id: "", status: "published", estimated_minutes: "" })
      queryClient.invalidateQueries({ queryKey: ["training-courses"] })
    },
    onError: (error: any) => toast.error(error.message || "Course could not be created"),
  })

  const createLesson = useMutation({
    mutationFn: async () => {
      if (!selectedCourse) throw new Error("Select a course first")
      if (!lessonForm.title.trim()) throw new Error("Lesson title is required")
      const videoId = extractYouTubeId(lessonForm.youtube)
      if (!videoId) throw new Error("Enter a valid YouTube video URL or video ID")
      const { error } = await (supabase as any).from("training_lessons").insert({
        course_id: selectedCourse.id,
        title: lessonForm.title.trim(),
        description: lessonForm.description.trim() || null,
        youtube_video_id: videoId,
        sort_order: selectedLessons.length + 1,
        duration_minutes: lessonForm.duration_minutes ? Number(lessonForm.duration_minutes) : 0,
        is_required: lessonForm.is_required === "true",
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Lesson added")
      setLessonOpen(false)
      setLessonForm({ title: "", description: "", youtube: "", duration_minutes: "", is_required: "true" })
      queryClient.invalidateQueries({ queryKey: ["training-lessons"] })
    },
    onError: (error: any) => toast.error(error.message || "Lesson could not be added"),
  })

  const assignCourse = useMutation({
    mutationFn: async () => {
      if (!selectedCourse || !assignmentForm.user_id || !currentUser?.id) throw new Error("Choose a learner")
      const { error } = await (supabase as any).from("training_course_assignments").upsert({
        course_id: selectedCourse.id,
        user_id: assignmentForm.user_id,
        due_at: assignmentForm.due_at ? new Date(assignmentForm.due_at).toISOString() : null,
        status: "assigned",
        assigned_by: currentUser.id,
      }, { onConflict: "course_id,user_id" })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Course assigned")
      setAssignmentOpen(false)
      setAssignmentForm({ user_id: "", due_at: "" })
      queryClient.invalidateQueries({ queryKey: ["training-course-assignments"] })
    },
    onError: (error: any) => toast.error(error.message || "Course could not be assigned"),
  })

  const recordWatch = useMutation({
    mutationFn: async ({ lessonId, seconds }: { lessonId: string; seconds: number }) => {
      if (!currentUser?.id) throw new Error("Sign in to record progress")
      const { data, error } = await (supabase as any).rpc("record_training_watch", {
        target_lesson_id: lessonId,
        watched_increment_seconds: seconds,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return typeof row?.percent_complete === "number" ? row.percent_complete : null
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-progress"] })
      queryClient.invalidateQueries({ queryKey: ["training-course-assignments"] })
    },
  })

  const recordLessonWatch = (lessonId: string, seconds: number) => recordWatch.mutateAsync({ lessonId, seconds })

  const setAttendance = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      if (!selectedSchedule || !currentUser?.id) throw new Error("Choose a training session")
      const { error } = await (supabase as any).from("training_attendance").upsert(
        {
          training_schedule_id: selectedSchedule,
          user_id: userId,
          status,
          checked_in_at: status === "present" ? new Date().toISOString() : null,
          checked_in_by: currentUser.id,
        },
        { onConflict: "training_schedule_id,user_id" }
      )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["training-attendance"] }),
    onError: (error: any) => toast.error(error.message || "Attendance could not be updated"),
  })

  const broadcastTraining = useMutation({
    mutationFn: async () => {
      const schedule = schedules.find((item) => item.id === selectedSchedule)
      if (!schedule || !trainingUnit?.id || !currentUser?.id) throw new Error("Choose a training session")
      const { error } = await (supabase as any).rpc("broadcast_training_schedule", {
        target_schedule_id: schedule.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Training announcement broadcast")
      queryClient.invalidateQueries({ queryKey: ["training-schedules"] })
    },
    onError: (error: any) => toast.error(error.message || "Training announcement could not be sent"),
  })

  const saveMember = useMutation({
    mutationFn: async () => {
      if (!trainingUnit?.id || !memberForm.user_id) throw new Error("Choose an officer")
      const { error } = await (supabase as any).from("unit_memberships").upsert(
        { unit_id: trainingUnit.id, user_id: memberForm.user_id, access_level: memberForm.access_level, status: "active" },
        { onConflict: "unit_id,user_id" }
      )
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Training access granted")
      setMemberOpen(false)
      setMemberForm({ user_id: "", access_level: "member" })
      queryClient.invalidateQueries({ queryKey: ["unit-members"] })
    },
    onError: (error: any) => toast.error(error.message || "Member could not be added"),
  })

  const updateMemberLevel = useMutation({
    mutationFn: async ({ userId, accessLevel }: { userId: string; accessLevel: string }) => {
      const { error } = await (supabase as any)
        .from("unit_memberships")
        .update({ access_level: accessLevel })
        .eq("unit_id", trainingUnit!.id)
        .eq("user_id", userId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["unit-members"] }),
    onError: (error: any) => toast.error(error.message || "Access level could not be updated"),
  })

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase as any)
        .from("unit_memberships")
        .delete()
        .eq("unit_id", trainingUnit!.id)
        .eq("user_id", userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Training access removed")
      queryClient.invalidateQueries({ queryKey: ["unit-members"] })
    },
    onError: (error: any) => toast.error(error.message || "Member could not be removed"),
  })

  const createEvaluation = useMutation({
    mutationFn: async () => {
      if (!evaluationForm.subject_user_id) throw new Error("Choose a member")
      const { error } = await (supabase as any).from("training_evaluations").insert({
        subject_user_id: evaluationForm.subject_user_id,
        member_stage: evaluationForm.member_stage,
        training_schedule_id: evaluationForm.training_schedule_id || null,
        evaluator_id: currentUser?.id,
        status: "assigned",
        due_at: evaluationForm.due_at ? new Date(evaluationForm.due_at).toISOString() : null,
        responses: {},
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Evaluation opened")
      setEvaluationOpen(false)
      setEvaluationForm({ subject_user_id: "", member_stage: "new", training_schedule_id: "", due_at: "", score: "", reflection: "", feedback: "", strengths: "", growth_areas: "" })
      queryClient.invalidateQueries({ queryKey: ["training-evaluations"] })
    },
    onError: (error: any) => toast.error(error.message || "Evaluation could not be created"),
  })

  const saveEvaluation = useMutation({
    mutationFn: async () => {
      if (!editingEvaluation) return
      if (!canManage && editingEvaluation.evaluator_id !== currentUser?.id) throw new Error("Only the assigned evaluator can update this review")
      const submittedReflection = typeof editingEvaluation.responses?.reflection === "string" ? editingEvaluation.responses.reflection.trim() : ""
      if (submittedReflection.length < 10) throw new Error("The member must submit their reflection before the evaluation can be completed")
      const { error } = await (supabase as any).from("training_evaluations").update({
        status: "completed",
        submitted_at: new Date().toISOString(),
        score: evaluationForm.score ? Number(evaluationForm.score) : null,
        feedback: evaluationForm.feedback.trim() || null,
        strengths: evaluationForm.strengths.trim() || null,
        growth_areas: evaluationForm.growth_areas.trim() || null,
      }).eq("id", editingEvaluation.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Evaluation saved")
      setEditingEvaluation(null)
      queryClient.invalidateQueries({ queryKey: ["training-evaluations"] })
    },
    onError: (error: any) => toast.error(error.message || "Evaluation could not be saved"),
  })

  const saveReflection = useMutation({
    mutationFn: async () => {
      if (!editingEvaluation || editingEvaluation.subject_user_id !== currentUser?.id) throw new Error("This reflection is not assigned to you")
      const { error } = await (supabase as any).rpc("submit_training_evaluation_reflection", {
        target_evaluation_id: editingEvaluation.id,
        reflection_text: evaluationForm.reflection,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Reflection submitted to your evaluator")
      setEditingEvaluation(null)
      queryClient.invalidateQueries({ queryKey: ["training-evaluations"] })
    },
    onError: (error: any) => toast.error(error.message || "Reflection could not be submitted"),
  })

  const openEvaluation = (evaluation: Evaluation) => {
    setEditingEvaluation(evaluation)
    setEvaluationForm({
      subject_user_id: evaluation.subject_user_id,
      member_stage: evaluation.member_stage,
      training_schedule_id: evaluation.training_schedule_id || "",
      due_at: evaluation.due_at ? evaluation.due_at.slice(0, 16) : "",
      score: evaluation.score?.toString() || "",
      reflection: typeof evaluation.responses?.reflection === "string" ? evaluation.responses.reflection : "",
      feedback: evaluation.feedback || "",
      strengths: evaluation.strengths || "",
      growth_areas: evaluation.growth_areas || "",
    })
  }

  const canEditEvaluation = Boolean(editingEvaluation && (canManage || editingEvaluation.evaluator_id === currentUser?.id))
  const canSubmitReflection = Boolean(
    editingEvaluation
    && editingEvaluation.subject_user_id === currentUser?.id
    && ["assigned", "in_review"].includes(editingEvaluation.status)
  )

  return (
    <section className="space-y-5" aria-labelledby="training-operations-heading">
      <div className="overflow-hidden rounded-[1.6rem] border border-primary/15 bg-card/80 shadow-[0_24px_70px_-48px_hsl(var(--primary))]">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.35fr_.65fr]">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-primary">LEARNING OPERATIONS</p>
            <h2 id="training-operations-heading" className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Build capable teams, then prove readiness.</h2>
            <p className="mt-2 max-w-[62ch] text-sm leading-6 text-muted-foreground">Unit-specific courses, attendance and structured evaluations in one accountable learning record.</p>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-border/70">
            {[
              [courseStats.published, "live courses"],
              [courseStats.totalLessons, "lessons"],
              [courseStats.completed, "completed"],
            ].map(([value, label]) => (
              <div key={label} className="bg-background/90 px-3 py-4 text-center">
                <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="courses" className="space-y-5">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="courses" className="gap-2"><BookOpen className="h-4 w-4" />Courses</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2"><CalendarCheck className="h-4 w-4" />Attendance</TabsTrigger>
          <TabsTrigger value="evaluations" className="gap-2"><ClipboardCheck className="h-4 w-4" />Evaluations</TabsTrigger>
          {canManage && <TabsTrigger value="progress" className="gap-2"><UserRoundCheck className="h-4 w-4" />Learner progress</TabsTrigger>}
          {canManage && <TabsTrigger value="members" className="gap-2"><Users className="h-4 w-4" />Members</TabsTrigger>}
        </TabsList>

        <TabsContent value="courses" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Course library</h3>
              <p className="text-sm text-muted-foreground">YouTube-hosted lessons with individual completion records.</p>
            </div>
            {canManage && <Button onClick={() => setCourseOpen(true)} className="gap-2"><Plus className="h-4 w-4" />New course</Button>}
          </div>

          {coursesLoading ? (
            <div className="grid gap-3 lg:grid-cols-[.72fr_1.28fr]"><div className="skeleton h-72 rounded-2xl" /><div className="skeleton h-72 rounded-2xl" /></div>
          ) : courses.length === 0 ? (
            <div className="empty-state rounded-2xl border py-12"><GraduationCap className="h-10 w-10" /><p className="font-medium">No courses published</p><p className="text-sm text-muted-foreground">Training leaders can build the first course from here.</p></div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(15rem,.72fr)_minmax(0,1.28fr)]">
              <div className="space-y-2">
                {courses.map((course) => {
                  const courseLessons = lessons.filter((lesson) => lesson.course_id === course.id)
                  const complete = courseLessons.filter((lesson) => completedLessonIds.has(lesson.id)).length
                  const percent = courseLessons.length ? Math.round((complete / courseLessons.length) * 100) : 0
                  const active = selectedCourse?.id === course.id
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setActiveCourseId(course.id)}
                      className={cn("w-full rounded-xl border px-4 py-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-primary/40 bg-primary/8 shadow-sm" : "bg-card/60 hover:border-primary/25 hover:bg-muted/40")}
                    >
                      <div className="flex items-start justify-between gap-3"><p className="font-medium leading-5">{course.title}</p><ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", active && "translate-x-0.5 text-primary")} /></div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{courseLessons.length} lessons</span><span className="font-mono tabular-nums">{percent}%</span></div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} /></div>
                    </button>
                  )
                })}
              </div>

              {selectedCourse && (
                <article className="overflow-hidden rounded-2xl border bg-card/70">
                  <header className="border-b px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><div className="flex flex-wrap items-center gap-2"><h4 className="text-lg font-semibold tracking-tight">{selectedCourse.title}</h4><Badge className={cn("border-0 text-[10px]", statusTone(selectedCourse.status))}>{selectedCourse.status}</Badge>{selectedCourse.target_unit_id && <Badge variant="outline" className="text-[10px]">{units.find((unit) => unit.id === selectedCourse.target_unit_id)?.name || "Unit specific"}</Badge>}</div><p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{selectedCourse.description || "A focused learning path for protocol readiness."}</p></div>
                      {canManage && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAssignmentOpen(true)}><UserPlus className="h-3.5 w-3.5" />Assign</Button><Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLessonOpen(true)}><Plus className="h-3.5 w-3.5" />Add lesson</Button></div>}
                    </div>
                    <div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${selectedPercent}%` }} /></div><span className="font-mono text-xs tabular-nums text-muted-foreground">{selectedPercent}%</span></div>
                  </header>
                  <div className="divide-y">
                    {selectedLessons.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No lessons have been added yet.</div> : selectedLessons.map((lesson, index) => {
                      const complete = completedLessonIds.has(lesson.id)
                      const progressRow = ownProgress.find((item) => item.lesson_id === lesson.id)
                      const safeVideo = lesson.youtube_video_id && YOUTUBE_ID.test(lesson.youtube_video_id) ? lesson.youtube_video_id : null
                      return (
                        <div key={lesson.id} className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_15rem]">
                          <div className="flex gap-3">
                            <div className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold", complete ? "bg-emerald-500/12 text-emerald-600" : "bg-muted text-muted-foreground")}>{complete ? <Check className="h-4 w-4" /> : index + 1}</div>
                            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{lesson.title}</p>{lesson.is_required && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">required</span>}</div>{lesson.description && <p className="mt-1 text-sm leading-5 text-muted-foreground">{lesson.description}</p>}<div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">{lesson.duration_minutes ? <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{lesson.duration_minutes} min</span> : null}{safeVideo ? <span className="inline-flex items-center gap-1"><PlayCircle className="h-3.5 w-3.5" />Tracked video lesson</span> : null}</div><Badge variant={complete ? "success" : "outline"} className="mt-3 gap-1.5">{complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}{complete ? "Completed" : `${progressRow?.percent_complete || 0}% watched`}</Badge></div>
                          </div>
                          {safeVideo ? <TrackedYouTubeLesson lessonId={lesson.id} videoId={safeVideo} title={lesson.title} initialPercent={progressRow?.percent_complete || 0} onWatch={recordLessonWatch} /> : <div className="grid min-h-28 place-items-center rounded-xl bg-muted/50 text-center text-xs text-muted-foreground"><span>No valid video attached</span></div>}
                        </div>
                      )
                    })}
                  </div>
                </article>
              )}
            </div>
          )}
        </TabsContent>

        {canManage && <TabsContent value="progress" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-semibold tracking-tight">Learner progress</h3><p className="text-sm text-muted-foreground">See who has started, what is complete and when each assignment is due.</p></div><Select value={selectedCourse?.id || ""} onValueChange={setActiveCourseId}><SelectTrigger className="w-full sm:w-[20rem]"><SelectValue placeholder="Choose a course" /></SelectTrigger><SelectContent>{courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}</SelectContent></Select></div>
          {!selectedCourse ? <div className="empty-state rounded-2xl border"><BookOpen className="h-9 w-9" /><p className="font-medium">Create a course first</p></div> : assignments.filter((assignment) => assignment.course_id === selectedCourse.id).length === 0 ? <div className="empty-state rounded-2xl border"><UserPlus className="h-9 w-9" /><p className="font-medium">No learners assigned</p><p className="text-sm text-muted-foreground">Assign this course to begin tracking individual completion.</p><Button variant="outline" onClick={() => setAssignmentOpen(true)}>Assign learner</Button></div> : <div className="overflow-hidden rounded-2xl border bg-card/70"><div className="grid grid-cols-[minmax(0,1fr)_auto] border-b bg-muted/35 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[minmax(0,1fr)_8rem_8rem]"><span>Learner</span><span>Progress</span><span className="hidden sm:block">Due</span></div><div className="divide-y">{assignments.filter((assignment) => assignment.course_id === selectedCourse.id).map((assignment) => { const officer = officers.find((item) => item.id === assignment.user_id); const lessonIds = selectedLessons.map((lesson) => lesson.id); const complete = progress.filter((item) => item.user_id === assignment.user_id && lessonIds.includes(item.lesson_id) && (item.completed_at || item.percent_complete >= 100)).length; const percent = lessonIds.length ? Math.round((complete / lessonIds.length) * 100) : 0; const overdue = Boolean(assignment.due_at && new Date(assignment.due_at) < new Date() && percent < 100); return <div key={assignment.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]"><div className="min-w-0"><p className="truncate text-sm font-medium">{officer?.full_name || officer?.email || "Protocol officer"}</p><p className="text-xs text-muted-foreground">{complete} of {lessonIds.length} lessons</p></div><div className="flex items-center gap-2"><div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div><span className="w-8 text-right font-mono text-xs tabular-nums">{percent}%</span></div><div className="hidden sm:block"><Badge className={cn("border-0 text-[10px]", statusTone(percent === 100 ? "completed" : overdue ? "overdue" : assignment.status))}>{percent === 100 ? "completed" : overdue ? "overdue" : assignment.status.replaceAll("_", " ")}</Badge>{assignment.due_at && <p className="mt-1 text-[10px] text-muted-foreground">{new Date(assignment.due_at).toLocaleDateString()}</p>}</div></div> })}</div></div>}
        </TabsContent>}

        <TabsContent value="attendance" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-semibold tracking-tight">Session attendance</h3><p className="text-sm text-muted-foreground">A clear record for every in-person and virtual training event.</p></div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Select value={selectedSchedule} onValueChange={setSelectedScheduleId}><SelectTrigger className="w-full sm:w-[20rem]"><SelectValue placeholder="Choose a session" /></SelectTrigger><SelectContent>{schedules.map((schedule) => <SelectItem key={schedule.id} value={schedule.id}>{schedule.session_date} · {schedule.topic}</SelectItem>)}</SelectContent></Select>{canManage && selectedSchedule && <Button variant="outline" className="gap-2" onClick={() => broadcastTraining.mutate()} disabled={broadcastTraining.isPending}>{broadcastTraining.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}{schedules.find((schedule) => schedule.id === selectedSchedule)?.broadcast_sent_at ? "Broadcast again" : "Broadcast"}</Button>}</div></div>
          {!selectedSchedule ? <div className="empty-state rounded-2xl border"><CalendarCheck className="h-9 w-9" /><p className="font-medium">Schedule a session first</p></div> : canManage ? (
            <div className="overflow-hidden rounded-2xl border bg-card/70"><div className="grid grid-cols-[1fr_auto] border-b bg-muted/35 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Officer</span><span>Status</span></div><div className="divide-y">{officers.map((officer) => { const row = attendance.find((item) => item.training_schedule_id === selectedSchedule && item.user_id === officer.id); return <div key={officer.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-medium">{officer.full_name || officer.email}</p><p className="text-xs text-muted-foreground">{officer.oscar || officer.team || "Protocol member"}</p></div><Select value={row?.status || "unmarked"} onValueChange={(status) => status !== "unmarked" && setAttendance.mutate({ userId: officer.id, status })}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unmarked" disabled>Unmarked</SelectItem><SelectItem value="present">Present</SelectItem><SelectItem value="late">Late</SelectItem><SelectItem value="absent">Absent</SelectItem><SelectItem value="excused">Excused</SelectItem></SelectContent></Select></div> })}</div></div>
          ) : (
            <div className="rounded-2xl border bg-card/70 p-5">{(() => { const row = attendance.find((item) => item.training_schedule_id === selectedSchedule && item.user_id === currentUser?.id); return <div className="flex items-center justify-between gap-4"><div><p className="font-medium">Your attendance</p><p className="text-sm text-muted-foreground">The Training team records the official status.</p></div><Badge className={cn("border-0 capitalize", statusTone(row?.status || "unmarked"))}>{row?.status || "Unmarked"}</Badge></div> })()}</div>
          )}
        </TabsContent>

        <TabsContent value="evaluations" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-semibold tracking-tight">Member evaluations</h3><p className="text-sm text-muted-foreground">Structured review for new and existing protocol members.</p></div>{canManage && <Button onClick={() => setEvaluationOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Start evaluation</Button>}</div>
          {evaluations.length === 0 ? <div className="empty-state rounded-2xl border"><ClipboardCheck className="h-9 w-9" /><p className="font-medium">No evaluations due</p><p className="text-sm text-muted-foreground">New evaluation requests and feedback will appear here.</p></div> : <div className="grid gap-3 md:grid-cols-2">{evaluations.map((evaluation) => <button key={evaluation.id} type="button" onClick={() => openEvaluation(evaluation)} className="rounded-2xl border bg-card/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{personName(evaluation.subject_user_id, officers)}</p><p className="mt-0.5 text-xs capitalize text-muted-foreground">{evaluation.member_stage} member review</p></div><Badge className={cn("border-0 capitalize", statusTone(evaluation.status))}>{evaluation.status.replace(/_/g, " ")}</Badge></div><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{evaluation.due_at ? `Due ${new Date(evaluation.due_at).toLocaleDateString()}` : "No due date"}</span>{evaluation.score != null && <span className="font-mono font-semibold tabular-nums text-foreground">{evaluation.score}/100</span>}</div></button>)}</div>}
        </TabsContent>

        {canManage && <TabsContent value="members" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-semibold tracking-tight">Training team access</h3><p className="text-sm text-muted-foreground">Heads manage this workspace without receiving platform-admin powers.</p></div><Button onClick={() => setMemberOpen(true)} className="gap-2"><UserRoundCheck className="h-4 w-4" />Add member</Button></div>
          <div className="rounded-2xl border bg-card/70 p-4"><div className="relative mb-3 max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} className="pl-9" placeholder="Find a Training team member" /></div><div className="divide-y">{filteredMembers.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No Training team members found.</p> : filteredMembers.map((membership) => { const officer = officers.find((item) => item.id === membership.user_id); return <div key={membership.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{officer?.full_name || officer?.email || "Protocol officer"}</p><p className="text-xs text-muted-foreground">{officer?.oscar || "Training Unit"}</p></div><div className="flex items-center gap-2"><Select value={membership.access_level} onValueChange={(accessLevel) => updateMemberLevel.mutate({ userId: membership.user_id, accessLevel })}><SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="head">Head</SelectItem></SelectContent></Select><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Remove ${officer?.full_name || "member"}`} onClick={async () => { const ok = await confirm({ title: "Remove Training access?", message: `${officer?.full_name || "This officer"} will no longer have Training Unit access.` }); if (ok) removeMember.mutate(membership.user_id) }}><Trash2 className="h-4 w-4" /></Button></div></div> })}</div></div>
        </TabsContent>}
      </Tabs>

      <Dialog open={courseOpen} onOpenChange={setCourseOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Create a course</DialogTitle><DialogDescription>Publish a targeted self-paced learning path.</DialogDescription></DialogHeader><form onSubmit={(event: FormEvent) => { event.preventDefault(); createCourse.mutate() }} className="space-y-4"><div className="space-y-2"><Label>Course title</Label><Input required value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} /></div><div className="space-y-2"><Label>Description</Label><Textarea rows={3} value={courseForm.description} onChange={(event) => setCourseForm({ ...courseForm, description: event.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Visibility</Label><Select value={courseForm.visibility} onValueChange={(visibility) => setCourseForm({ ...courseForm, visibility, target_unit_id: visibility === "target_unit" ? courseForm.target_unit_id : "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all_members">All members</SelectItem><SelectItem value="training_unit">Training Unit only</SelectItem><SelectItem value="target_unit">Specific unit</SelectItem><SelectItem value="invite_only">Assigned learners only</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Estimated minutes</Label><Input type="number" min="1" value={courseForm.estimated_minutes} onChange={(event) => setCourseForm({ ...courseForm, estimated_minutes: event.target.value })} /></div></div>{courseForm.visibility === "target_unit" && <div className="space-y-2"><Label>Target unit</Label><Select value={courseForm.target_unit_id} onValueChange={(target_unit_id) => setCourseForm({ ...courseForm, target_unit_id })}><SelectTrigger><SelectValue placeholder="Choose a unit" /></SelectTrigger><SelectContent>{units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}</SelectContent></Select></div>}<Button className="w-full" disabled={createCourse.isPending}>{createCourse.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create course</Button></form></DialogContent></Dialog>

      <Dialog open={assignmentOpen} onOpenChange={setAssignmentOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Assign course</DialogTitle><DialogDescription>{selectedCourse ? `Give a learner access to ${selectedCourse.title} and set an optional due date.` : "Choose a course first."}</DialogDescription></DialogHeader><form onSubmit={(event: FormEvent) => { event.preventDefault(); assignCourse.mutate() }} className="space-y-4"><div className="space-y-2"><Label>Learner</Label><Select value={assignmentForm.user_id} onValueChange={(user_id) => setAssignmentForm({ ...assignmentForm, user_id })}><SelectTrigger><SelectValue placeholder="Choose an officer" /></SelectTrigger><SelectContent>{officers.map((officer) => <SelectItem key={officer.id} value={officer.id}>{officer.full_name || officer.email}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Due date (optional)</Label><Input type="datetime-local" value={assignmentForm.due_at} onChange={(event) => setAssignmentForm({ ...assignmentForm, due_at: event.target.value })} /></div><Button className="w-full" disabled={!assignmentForm.user_id || assignCourse.isPending}>{assignCourse.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Assign course</Button></form></DialogContent></Dialog>

      <Dialog open={lessonOpen} onOpenChange={setLessonOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Add a lesson</DialogTitle><DialogDescription>Videos remain on YouTube and load through privacy-enhanced embeds.</DialogDescription></DialogHeader><form onSubmit={(event: FormEvent) => { event.preventDefault(); createLesson.mutate() }} className="space-y-4"><div className="space-y-2"><Label>Lesson title</Label><Input required value={lessonForm.title} onChange={(event) => setLessonForm({ ...lessonForm, title: event.target.value })} /></div><div className="space-y-2"><Label>Description</Label><Textarea rows={2} value={lessonForm.description} onChange={(event) => setLessonForm({ ...lessonForm, description: event.target.value })} /></div><div className="space-y-2"><Label>YouTube URL or video ID</Label><Input required value={lessonForm.youtube} onChange={(event) => setLessonForm({ ...lessonForm, youtube: event.target.value })} placeholder="https://youtu.be/…" /><p className="text-xs text-muted-foreground">Only validated YouTube links are embedded.</p></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Duration (minutes)</Label><Input type="number" min="0" value={lessonForm.duration_minutes} onChange={(event) => setLessonForm({ ...lessonForm, duration_minutes: event.target.value })} /></div><div className="space-y-2"><Label>Requirement</Label><Select value={lessonForm.is_required} onValueChange={(is_required) => setLessonForm({ ...lessonForm, is_required })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Required</SelectItem><SelectItem value="false">Optional</SelectItem></SelectContent></Select></div></div><Button className="w-full" disabled={createLesson.isPending}>Add lesson</Button></form></DialogContent></Dialog>

      <Dialog open={memberOpen} onOpenChange={setMemberOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Add Training team member</DialogTitle><DialogDescription>Access stays scoped to the Training workspace.</DialogDescription></DialogHeader><form onSubmit={(event: FormEvent) => { event.preventDefault(); saveMember.mutate() }} className="space-y-4"><div className="space-y-2"><Label>Officer</Label><Select value={memberForm.user_id} onValueChange={(user_id) => setMemberForm({ ...memberForm, user_id })}><SelectTrigger><SelectValue placeholder="Choose an officer" /></SelectTrigger><SelectContent>{availableOfficers.map((officer) => <SelectItem key={officer.id} value={officer.id}>{officer.full_name || officer.email}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Access level</Label><Select value={memberForm.access_level} onValueChange={(access_level) => setMemberForm({ ...memberForm, access_level })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="head">Unit head</SelectItem></SelectContent></Select></div><Button className="w-full" disabled={!memberForm.user_id || saveMember.isPending}>Grant access</Button></form></DialogContent></Dialog>

      <Dialog open={evaluationOpen} onOpenChange={setEvaluationOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Start member evaluation</DialogTitle><DialogDescription>Create a visible review flow with a clear due date.</DialogDescription></DialogHeader><form onSubmit={(event: FormEvent) => { event.preventDefault(); createEvaluation.mutate() }} className="space-y-4"><div className="space-y-2"><Label>Member</Label><Select value={evaluationForm.subject_user_id} onValueChange={(subject_user_id) => setEvaluationForm({ ...evaluationForm, subject_user_id })}><SelectTrigger><SelectValue placeholder="Choose a member" /></SelectTrigger><SelectContent>{officers.map((officer) => <SelectItem key={officer.id} value={officer.id}>{officer.full_name || officer.email}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Member stage</Label><Select value={evaluationForm.member_stage} onValueChange={(member_stage) => setEvaluationForm({ ...evaluationForm, member_stage })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">New member</SelectItem><SelectItem value="existing">Existing member</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Due date</Label><Input type="datetime-local" value={evaluationForm.due_at} onChange={(event) => setEvaluationForm({ ...evaluationForm, due_at: event.target.value })} /></div></div><div className="space-y-2"><Label>Training session</Label><Select value={evaluationForm.training_schedule_id || "none"} onValueChange={(value) => setEvaluationForm({ ...evaluationForm, training_schedule_id: value === "none" ? "" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">General evaluation</SelectItem>{schedules.map((schedule) => <SelectItem key={schedule.id} value={schedule.id}>{schedule.topic}</SelectItem>)}</SelectContent></Select></div><Button className="w-full" disabled={createEvaluation.isPending}>Open evaluation</Button></form></DialogContent></Dialog>

      <Dialog open={Boolean(editingEvaluation)} onOpenChange={(open) => !open && setEditingEvaluation(null)}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Member evaluation</DialogTitle><DialogDescription>{editingEvaluation ? (editingEvaluation.subject_user_id === currentUser?.id ? `Your ${editingEvaluation.member_stage} member review` : `${personName(editingEvaluation.subject_user_id, officers)} · ${editingEvaluation.member_stage} member review`) : "Review"}</DialogDescription></DialogHeader><form onSubmit={(event: FormEvent) => { event.preventDefault(); if (canEditEvaluation) saveEvaluation.mutate() }} className="space-y-4"><div className="space-y-2"><div className="flex items-center justify-between gap-3"><Label>Member reflection</Label>{Boolean(editingEvaluation?.responses?.reflection_submitted_at) ? <Badge variant="success" className="text-[10px]">Submitted</Badge> : null}</div><Textarea rows={4} disabled={!canSubmitReflection} value={evaluationForm.reflection} onChange={(event) => setEvaluationForm({ ...evaluationForm, reflection: event.target.value })} placeholder="What was learned, applied and found challenging?" />{canSubmitReflection && <Button type="button" variant="outline" className="w-full" disabled={saveReflection.isPending || evaluationForm.reflection.trim().length < 10} onClick={() => saveReflection.mutate()}>{saveReflection.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}Submit my reflection</Button>}</div>{canEditEvaluation && <><div className="border-t pt-4"><p className="text-sm font-semibold">Evaluator review</p><p className="text-xs text-muted-foreground">Reviewer notes remain private until this evaluation is completed.</p></div><div className="space-y-2"><Label>Score (0–100)</Label><Input type="number" min="0" max="100" value={evaluationForm.score} onChange={(event) => setEvaluationForm({ ...evaluationForm, score: event.target.value })} /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Strengths</Label><Textarea rows={3} value={evaluationForm.strengths} onChange={(event) => setEvaluationForm({ ...evaluationForm, strengths: event.target.value })} /></div><div className="space-y-2"><Label>Growth areas</Label><Textarea rows={3} value={evaluationForm.growth_areas} onChange={(event) => setEvaluationForm({ ...evaluationForm, growth_areas: event.target.value })} /></div></div><div className="space-y-2"><Label>Reviewer feedback</Label><Textarea rows={4} value={evaluationForm.feedback} onChange={(event) => setEvaluationForm({ ...evaluationForm, feedback: event.target.value })} /></div><Button className="w-full" disabled={saveEvaluation.isPending}>{saveEvaluation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Complete evaluation</Button></>}{!canEditEvaluation && !canSubmitReflection ? <Button type="button" variant="outline" className="w-full" onClick={() => setEditingEvaluation(null)}>Close review</Button> : null}</form></DialogContent></Dialog>
    </section>
  )
}
