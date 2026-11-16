"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ShieldCheck, Users } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { DEN_TEAM_QUERY_KEY, useDenTeam, type DenTeamMember } from "@/hooks/useDenTeam"
import { DEN_ACCESS_LABEL, type DenAccessLevel } from "@/lib/den"
import { notifyError } from "@/lib/notify"
import { createClient } from "@/lib/supabase/client"

type Props = {
  /** Head of November (Den) or a platform admin: may appoint Sub-Team Leads. */
  canManage: boolean
  onOpenProfile: (member: DenTeamMember) => void
}

const LEVEL_BADGE: Record<DenAccessLevel, "default" | "secondary" | "outline"> = {
  head: "default",
  sub_lead: "secondary",
  member: "outline",
}

export function initialsOf(name: string | null | undefined) {
  if (!name) return "??"
  return name.split(" ").filter(Boolean).map(part => part[0]).join("").toUpperCase().slice(0, 2)
}

/**
 * The Den team at a glance: who leads, who coordinates, who serves. The head
 * appoints Sub-Team Leads here; the level is stored on the unit membership,
 * never on the officer's role.
 */
export default function DenTeam({ canManage, onOpenProfile }: Props) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useDenTeam()

  const setLevel = useMutation({
    mutationFn: async ({ member, level }: { member: DenTeamMember; level: "member" | "sub_lead" }) => {
      if (!member.membershipId) throw new Error("This officer has no Den membership record yet.")
      const { data: updated, error } = await (supabase as any)
        .from("unit_memberships")
        .update({ access_level: level })
        .eq("id", member.membershipId)
        .select("id")
      if (error) throw error
      // RLS filters rather than errors: no row back means nothing was changed.
      if (!updated?.length) throw new Error("You are not allowed to change this officer's level.")
      return { member, level }
    },
    onSuccess: ({ member, level }) => {
      queryClient.invalidateQueries({ queryKey: DEN_TEAM_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ["unit-access"] })
      toast.success(
        level === "sub_lead"
          ? `${member.full_name ?? "Officer"} is now a Sub-Team Lead`
          : `${member.full_name ?? "Officer"} is now a Team Member`,
      )
    },
    onError: (error) => notifyError(error, "Could not change this officer's level"),
  })

  const members = data?.members ?? []
  const leads = members.filter(member => member.level !== "member").length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5" aria-hidden="true" />
          Den team
          {members.length > 0 && <Badge variant="outline">{members.length}</Badge>}
        </CardTitle>
        <CardDescription>
          {members.length > 0
            ? `${leads} leading, ${members.length - leads} serving. Select a name to open the full profile.`
            : "Everyone registered under November (Den)."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)}
          </div>
        ) : isError ? (
          <ErrorState title="Could not load the Den team" onRetry={() => refetch()} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No Den officers yet"
            description="Officers appear here once they are registered under November (Den)."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {members.map(member => {
              const canChange = canManage && data?.unitRegistered && member.membershipId && member.level !== "head"
              const pending = setLevel.isPending && setLevel.variables?.member.id === member.id
              return (
                <li key={member.id} className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(member)}
                    className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open profile of ${member.full_name ?? "officer"}`}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      {member.photo_url && <AvatarImage src={member.photo_url} alt="" />}
                      <AvatarFallback className="text-xs">{initialsOf(member.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium group-hover:underline">
                        {member.full_name ?? "Unnamed officer"}
                      </span>
                      <Badge variant={LEVEL_BADGE[member.level]} className="mt-0.5">
                        {member.level === "head" && <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />}
                        {DEN_ACCESS_LABEL[member.level]}
                      </Badge>
                    </span>
                  </button>
                  {canChange && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs"
                      pending={pending}
                      disabled={setLevel.isPending}
                      onClick={() => setLevel.mutate({ member, level: member.level === "sub_lead" ? "member" : "sub_lead" })}
                    >
                      {member.level === "sub_lead" ? "Make member" : "Make sub-lead"}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
