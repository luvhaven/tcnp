"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserCircle } from "lucide-react"

export default function OfficersPage() {
  const supabase = createClient()
  const [officers, setOfficers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const pageSize = 50

  useEffect(() => {
    loadOfficers()
  }, [])

  const loadOfficers = async () => {
    try {
      const from = page * pageSize
      const to = from + pageSize - 1
      
      const { data, error, count } = await supabase
        .from('users')
        .select('id, full_name, email, phone, role, is_active, oscar, activation_status, is_online, last_seen', { count: 'exact' })
        .order('full_name')
        .range(from, to)

      if (error) throw error
      setOfficers(data || [])
      setHasMore(data ? data.length === pageSize : false)
    } catch (error) {
      console.error('Error loading officers:', error)
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-56 rounded-md skeleton" />
          <div className="mt-2 h-4 w-80 rounded-md skeleton" />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 rounded-md skeleton" />
              </CardHeader>
              <CardContent>
                <div className="h-6 w-12 rounded-md skeleton" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="h-5 w-32 rounded-md skeleton" />
            <div className="mt-2 h-4 w-40 rounded-md skeleton" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 rounded-lg border p-4"
                >
                  <div className="h-10 w-10 rounded-full skeleton" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded-md skeleton" />
                    <div className="h-3 w-40 rounded-md skeleton" />
                    <div className="h-3 w-24 rounded-md skeleton" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Protocol Officers</h1>
        <p className="text-sm text-muted-foreground max-w-xl">Manage protocol staff and assignments</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Officers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{officers.length}</div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.is_online).length}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => !o.is_online).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <UserCircle className="h-5 w-5" />
            <span>All Officers</span>
          </CardTitle>
          <CardDescription>Protocol staff directory</CardDescription>
        </CardHeader>
        <CardContent>
          {officers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserCircle className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No officers yet</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {officers.map((officer) => (
                <div
                  key={officer.id}
                  className="flex items-center space-x-3 rounded-lg border p-4 transition-all hover:bg-accent hover:border-primary/30 hover:shadow-sm"
                >
                  <Avatar>
                    <AvatarImage src={officer.avatar_url} />
                    <AvatarFallback>
                      {getInitials(officer.full_name || officer.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{officer.full_name || 'No name'}</p>
                    <p className="text-xs text-muted-foreground truncate">{officer.email}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant="secondary" className="text-xs uppercase tracking-wide">
                        {officer.role || 'No role'}
                      </Badge>
                      <div className="flex items-center space-x-1">
                        <div className={`h-2 w-2 rounded-full ${officer.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="text-xs text-muted-foreground">
                          {officer.is_online ? 'online' : 'offline'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
