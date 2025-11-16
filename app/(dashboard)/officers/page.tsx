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
        .select('id, full_name, email, phone, role, is_active, oscar, activation_status', { count: 'exact' })
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
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Protocol Officers</h1>
        <p className="text-muted-foreground">Manage protocol staff and assignments</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Officers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{officers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {officers.filter(o => o.is_online).length}
            </div>
          </CardContent>
        </Card>
        <Card>
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
                  className="flex items-center space-x-3 rounded-lg border p-4"
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
                      <Badge variant="secondary" className="text-xs">
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
