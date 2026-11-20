"use client"

import { useMemo, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Award, CheckCircle2, Crown, Loader2, Plus, Trophy } from "lucide-react"
import { notifyError, UserFacingError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/ConfirmProvider"
import { OfficerPicker } from "@/components/compliance/OfficerPicker"
import { complianceKeys, useActiveOfficers } from "@/components/compliance/compliance-queries"
import { AWARD_CATEGORY_STATUSES, NOMINEE_STATUSES, complianceWriteMessage, isNotProvisioned } from "@/components/compliance/inspection-logic"

const supabase = createClient()

type Category = {
  id: string
  project_id: string
  name: string
  description: string | null
  status: (typeof AWARD_CATEGORY_STATUSES)[number]
  created_at: string
}
type Nominee = {
  id: string
  category_id: string
  nominee_user_id: string | null
  nominee_name: string | null
  reason: string | null
  status: (typeof NOMINEE_STATUSES)[number]
  is_winner: boolean
  nominee?: { full_name: string | null } | null
}
type AwardsProject = { id: string; title: string; status: string }

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", open: "Nominations open", judging: "Judging", announced: "Announced", closed: "Closed",
  nominated: "Nominated", shortlisted: "Shortlisted", winner: "Winner", withdrawn: "Withdrawn",
}

/**
 * Formal award cycles on the existing compliance_award_categories / nominees
 * tables. Compliance members see every category; other officers see only the
 * winners of announced or closed categories (existing RLS). The Compliance
 * head manages them (existing RLS: can_manage_unit('compliance')).
 */
/** Moving a category here makes its winners visible to every officer or ends it: confirm first. */
const CONFIRM_CATEGORY_STATUS: Partial<Record<string, { title: string; message: (name: string) => string; confirmText: string }>> = {
  announced: {
    title: "Announce the winners?",
    message: (name) => `Every officer will see the winners of "${name}".`,
    confirmText: "Announce",
  },
  closed: {
    title: "Close this category?",
    message: (name) => `"${name}" will be closed. Its winners stay visible to every officer.`,
    confirmText: "Close category",
  },
}

export default function ComplianceAwards({ canManage, isUnitMember }: { canManage: boolean; isUnitMember: boolean }) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [categoryDialog, setCategoryDialog] = useState(false)
  const [nomineeFor, setNomineeFor] = useState<Category | null>(null)

  const awardsQuery = useQuery({
    queryKey: [...complianceKeys.awards, "board", canManage],
    queryFn: async () => {
      const [categoriesResult, projectsResult] = await Promise.all([
        (supabase as any).from("compliance_award_categories").select("*").order("created_at", { ascending: false }),
        (supabase as any)
          .from("unit_projects")
          .select("id, title, status, units!inner(slug)")
          .eq("project_type", "awards")
          .eq("units.slug", "compliance")
          .neq("status", "cancelled"),
      ])
      if (categoriesResult.error) throw categoriesResult.error
      const categories = (categoriesResult.data ?? []) as Category[]
      const ids = categories.map((category) => category.id)
      let nominees: Nominee[] = []
      if (ids.length > 0) {
        const { data, error } = await (supabase as any)
          .from("compliance_award_nominees")
          .select("*, nominee:users!compliance_award_nominees_nominee_user_id_fkey(full_name)")
          .in("category_id", ids)
          .order("created_at", { ascending: true })
        if (error) throw error
        nominees = (data ?? []) as Nominee[]
      }
      // Winners already on the recognition wall (managers read every recognition).
      let onWall: string[] = []
      const winnerIds = nominees.filter((nominee) => nominee.is_winner).map((nominee) => nominee.id)
      if (canManage && winnerIds.length > 0) {
        const { data, error } = await (supabase as any)
          .from("compliance_recognitions")
          .select("nominee_id")
          .in("nominee_id", winnerIds)
        // A failure here only means the button may show for a winner already on the wall.
        if (!error) onWall = ((data ?? []) as { nominee_id: string | null }[]).flatMap((row) => (row.nominee_id ? [row.nominee_id] : []))
      }
      // Projects are only readable by unit members; a failure there only hides "New category".
      const projects = projectsResult.error ? [] : ((projectsResult.data ?? []) as AwardsProject[])
      return { categories, nominees, projects, onWall }
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: complianceKeys.awards })

  const categoryStatusMutation = useMutation({
    mutationFn: async ({ category, status }: { category: Category; status: string }) => {
      const { error } = await (supabase as any).from("compliance_award_categories").update({ status, updated_at: new Date().toISOString() }).eq("id", category.id)
      if (error) throw new UserFacingError(complianceWriteMessage(error, "Could not change the category"))
    },
    onSuccess: (_data, { category, status }) => {
      toast.success(`${category.name}: ${STATUS_LABEL[status] ?? status}`)
      return invalidate()
    },
    onError: (error: Error) => notifyError(error, "Could not change the category"),
  })

  const nomineeStatusMutation = useMutation({
    mutationFn: async ({ nominee, status }: { nominee: Nominee; status: string }) => {
      const { error } = await (supabase as any)
        .from("compliance_award_nominees")
        .update({ status, is_winner: status === "winner", updated_at: new Date().toISOString() })
        .eq("id", nominee.id)
      if (error) throw new UserFacingError(complianceWriteMessage(error, "Could not update the nominee"))
    },
    onSuccess: (_data, { nominee, status }) => {
      toast.success(`${nominee.nominee?.full_name || nominee.nominee_name || "Nominee"}: ${STATUS_LABEL[status] ?? status}`)
      return invalidate()
    },
    onError: (error: Error) => notifyError(error, "Could not update the nominee"),
  })

  const toWallMutation = useMutation({
    mutationFn: async ({ nominee, category }: { nominee: Nominee; category: Category }) => {
      if (!nominee.nominee_user_id) throw new UserFacingError("Only an officer with an account can go on the wall")
      const { error } = await (supabase as any).from("compliance_recognitions").insert({
        officer_id: nominee.nominee_user_id,
        award_type: "excellence",
        title: category.name,
        citation: nominee.reason,
        nominee_id: nominee.id,
        visibility: "public",
      })
      if (error) throw new UserFacingError(complianceWriteMessage(error, "Could not add the winner to the wall"))
    },
    onSuccess: () => {
      toast.success("Added to the recognition wall")
      void queryClient.invalidateQueries({ queryKey: complianceKeys.recognitions })
    },
    // Either way, refresh so an "On the wall" badge replaces the button
    // (also when it was already added, for example from another phone).
    onSettled: () => {
      void invalidate()
    },
    onError: (error: Error) => notifyError(error, "Could not add the winner to the wall"),
  })

  const data = awardsQuery.data
  const categories = data?.categories ?? []
  const onWall = useMemo(() => new Set(data?.onWall ?? []), [data?.onWall])
  const pendingCategoryId = categoryStatusMutation.isPending ? categoryStatusMutation.variables?.category.id : undefined
  const pendingNomineeId = nomineeStatusMutation.isPending ? nomineeStatusMutation.variables?.nominee.id : undefined

  const changeCategoryStatus = async (category: Category, status: string) => {
    if (status === category.status) return
    const ask = CONFIRM_CATEGORY_STATUS[status]
    if (ask) {
      const ok = await confirm({ title: ask.title, message: ask.message(category.name), confirmText: ask.confirmText })
      if (!ok) return
    }
    categoryStatusMutation.mutate({ category, status })
  }
  const nomineesByCategory = useMemo(() => {
    const map = new Map<string, Nominee[]>()
    for (const nominee of data?.nominees ?? []) {
      const list = map.get(nominee.category_id) ?? []
      list.push(nominee)
      map.set(nominee.category_id, list)
    }
    return map
  }, [data?.nominees])

  if (awardsQuery.isError && isNotProvisioned(awardsQuery.error)) return null
  // Officers outside Compliance only see announced winners; with none, the section stays out of the way.
  if (!canManage && !isUnitMember && !awardsQuery.isLoading && !awardsQuery.isError && categories.length === 0) return null

  return (
    <section aria-labelledby="formal-awards-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="formal-awards-title" className="flex items-center gap-2 text-lg font-semibold"><Award className="h-5 w-5 text-primary" aria-hidden="true" />Formal awards</h2>
          <p className="text-sm text-muted-foreground">Award categories, nominees and winners from the unit&apos;s Awards initiatives.</p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setCategoryDialog(true)} disabled={!data || data.projects.length === 0}>
            <Plus aria-hidden="true" /> New category
          </Button>
        )}
      </div>
      {canManage && data && data.projects.length === 0 && (
        <p className="text-xs text-muted-foreground">Create an Awards initiative under Unit initiatives first; categories belong to one.</p>
      )}

      {awardsQuery.isLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading awards"><Skeleton className="h-28 w-full" /></div>
      ) : awardsQuery.isError ? (
        <ErrorState title="Could not load awards" onRetry={() => void awardsQuery.refetch()} retrying={awardsQuery.isRefetching} />
      ) : categories.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No award categories yet.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {categories.map((category) => {
            const nominees = nomineesByCategory.get(category.id) ?? []
            return (
              <li key={category.id} className="rounded-xl border border-border/70 p-4">
                <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:items-start min-[400px]:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{category.name}</p>
                    {category.description && <p className="text-sm text-muted-foreground">{category.description}</p>}
                  </div>
                  {canManage ? (
                    <Select
                      value={pendingCategoryId === category.id ? categoryStatusMutation.variables?.status ?? category.status : category.status}
                      onValueChange={(status) => void changeCategoryStatus(category, status)}
                      disabled={pendingCategoryId === category.id}
                    >
                      <SelectTrigger className="min-h-11 min-[400px]:w-44" aria-label={`Status of ${category.name}`} aria-busy={pendingCategoryId === category.id}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AWARD_CATEGORY_STATUSES.map((status) => <SelectItem key={status} value={status}>{STATUS_LABEL[status]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="w-fit">{STATUS_LABEL[category.status] ?? category.status}</Badge>
                  )}
                </div>
                <ul className="mt-3 space-y-2">
                  {nominees.length === 0 && <li className="text-sm text-muted-foreground">No nominees yet.</li>}
                  {nominees.map((nominee) => {
                    const name = nominee.nominee?.full_name || nominee.nominee_name || "Nominee"
                    return (
                      <li key={nominee.id} className={cn("rounded-lg border p-2.5", nominee.is_winner ? "border-amber-500/40 bg-amber-500/5" : "border-border/60")}>
                        <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 font-medium">
                              {nominee.is_winner && <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label="Winner" />}
                              <span className="truncate">{name}</span>
                            </p>
                            {nominee.reason && <p className="text-xs text-muted-foreground">{nominee.reason}</p>}
                          </div>
                          {canManage ? (
                            <div className="flex gap-1">
                              <Select
                                value={pendingNomineeId === nominee.id ? nomineeStatusMutation.variables?.status ?? nominee.status : nominee.status}
                                onValueChange={(status) => { if (status !== nominee.status) nomineeStatusMutation.mutate({ nominee, status }) }}
                                disabled={pendingNomineeId === nominee.id}
                              >
                                <SelectTrigger className="min-h-11 min-[400px]:w-36" aria-label={`Status of ${name}`} aria-busy={pendingNomineeId === nominee.id}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {NOMINEE_STATUSES.map((status) => <SelectItem key={status} value={status}>{STATUS_LABEL[status]}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {nominee.is_winner && nominee.nominee_user_id && onWall.has(nominee.id) && (
                                <Badge variant="outline" className="min-h-11 shrink-0 gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300">
                                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />On the wall
                                </Badge>
                              )}
                              {nominee.is_winner && nominee.nominee_user_id && !onWall.has(nominee.id) && (
                                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Add ${name} to the recognition wall`} title="Add to the recognition wall" disabled={toWallMutation.isPending} onClick={() => toWallMutation.mutate({ nominee, category })}>
                                  <Trophy aria-hidden="true" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="w-fit">{STATUS_LABEL[nominee.status] ?? nominee.status}</Badge>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {canManage && (
                  <Button variant="ghost" size="sm" className="mt-2 gap-1" onClick={() => setNomineeFor(category)}>
                    <Plus aria-hidden="true" /> Nominee
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canManage && (
        <>
          <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New award category</DialogTitle>
                <DialogDescription>For example: Best dressed officer of the year.</DialogDescription>
              </DialogHeader>
              {categoryDialog && <CategoryForm projects={data?.projects ?? []} onDone={() => { setCategoryDialog(false); void invalidate() }} />}
            </DialogContent>
          </Dialog>
          <Dialog open={Boolean(nomineeFor)} onOpenChange={(open) => { if (!open) setNomineeFor(null) }}>
            <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add nominee</DialogTitle>
                <DialogDescription>{nomineeFor?.name}</DialogDescription>
              </DialogHeader>
              {nomineeFor && <NomineeForm category={nomineeFor} onDone={() => { setNomineeFor(null); void invalidate() }} />}
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  )
}

function CategoryForm({ projects, onDone }: { projects: readonly AwardsProject[]; onDone: () => void }) {
  const [form, setForm] = useState({ project_id: projects[0]?.id ?? "", name: "", description: "", status: "open" })
  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.project_id) throw new UserFacingError("Choose the Awards initiative")
      if (form.name.trim().length < 2) throw new UserFacingError("Name the category")
      const { error } = await (supabase as any).from("compliance_award_categories").insert({
        project_id: form.project_id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
      })
      if (error) {
        if (error.code === "23505") throw new UserFacingError("That initiative already has a category with this name")
        throw new UserFacingError(complianceWriteMessage(error, "Could not create the category"))
      }
    },
    onSuccess: () => { toast.success("Category created"); onDone() },
    onError: (error: Error) => notifyError(error, "Could not create the category"),
  })
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="award-category-project">Awards initiative</Label>
        <Select value={form.project_id} onValueChange={(value) => setForm((current) => ({ ...current, project_id: value }))}>
          <SelectTrigger id="award-category-project" aria-label="Awards initiative"><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="award-category-name">Name</Label>
        <Input id="award-category-name" maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="award-category-description">Description</Label>
        <Textarea id="award-category-description" rows={2} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="award-category-status">Status</Label>
        <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
          <SelectTrigger id="award-category-status" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>{AWARD_CATEGORY_STATUSES.map((status) => <SelectItem key={status} value={status}>{STATUS_LABEL[status]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onDone}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}Create</Button>
      </div>
    </form>
  )
}

function NomineeForm({ category, onDone }: { category: Category; onDone: () => void }) {
  const officersQuery = useActiveOfficers(true)
  const [form, setForm] = useState({ officer_id: "", other_name: "", reason: "" })
  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.officer_id && form.other_name.trim().length < 2) throw new UserFacingError("Choose an officer or type a name")
      const { error } = await (supabase as any).from("compliance_award_nominees").insert({
        category_id: category.id,
        nominee_user_id: form.officer_id || null,
        nominee_name: form.officer_id ? null : form.other_name.trim(),
        reason: form.reason.trim() || null,
      })
      if (error) throw new UserFacingError(complianceWriteMessage(error, "Could not add the nominee"))
    },
    onSuccess: () => { toast.success("Nominee added"); onDone() },
    onError: (error: Error) => notifyError(error, "Could not add the nominee"),
  })
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate() }
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Officer</legend>
        {officersQuery.isLoading ? (
          <div className="skeleton h-40 rounded-lg" role="status" aria-label="Loading officers" />
        ) : officersQuery.isError ? (
          <p role="alert" className="text-sm text-muted-foreground">Could not load officers; type a name instead.</p>
        ) : (
          <OfficerPicker id="award-nominee" officers={officersQuery.data ?? []} value={form.officer_id} onChange={(officerId) => setForm((current) => ({ ...current, officer_id: current.officer_id === officerId ? "" : officerId }))} />
        )}
      </fieldset>
      {!form.officer_id && (
        <div className="space-y-2">
          <Label htmlFor="award-nominee-name">Or a name (no account)</Label>
          <Input id="award-nominee-name" maxLength={120} value={form.other_name} onChange={(event) => setForm((current) => ({ ...current, other_name: event.target.value }))} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="award-nominee-reason">Reason</Label>
        <Textarea id="award-nominee-reason" rows={3} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onDone}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}Add</Button>
      </div>
    </form>
  )
}
