"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Settings, Save, RotateCcw, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useTheme } from "@/components/theme/ThemeProvider"
import { settingsSchema, defaultSettings, type SettingsFormValues } from "./schema"
import { cn } from "@/lib/utils"

export default function SettingsPage() {
  const supabase = createClient()
  const { setTheme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaultSettings,
  })

  const { register, handleSubmit, formState: { errors, isDirty }, reset, setValue, watch } = form

  // Watch theme to update UI immediately
  const currentTheme = watch("theme")

  useEffect(() => {
    if (currentTheme && currentTheme !== 'system') {
      setTheme(currentTheme)
    }
  }, [currentTheme, setTheme])

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Please login to access settings')
        return
      }

      // Get user role
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      setCurrentUser(userData)

      // Get all settings (KV store)
      const { data: settingsData, error } = await supabase
        .from('settings')
        .select('key, value')

      if (error) throw error

      if (settingsData && settingsData.length > 0) {
        // Transform KV array to object
        const settingsMap = settingsData.reduce((acc: any, item: any) => {
          // Parse JSON value if needed, or use as is
          // The schema says value is JSONB, so supabase client might return it as object/primitive
          acc[item.key] = item.value
          return acc
        }, {})

        // Merge with defaults to ensure all fields exist
        reset({ ...defaultSettings, ...settingsMap })
      } else {
        reset(defaultSettings)
      }

    } catch (error) {
      console.error('Error loading settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: SettingsFormValues) => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // Transform form data to KV array for upsert
      const updates = Object.entries(data).map(([key, value]) => ({
        key,
        value: value, // Supabase handles JSONB conversion
        updated_by: user.id,
        updated_at: new Date().toISOString()
      }))

      const { error } = await supabase
        .from('settings')
        .upsert(updates, { onConflict: 'key' })

      if (error) throw error

      toast.success('Settings saved successfully!')

      // Re-load to ensure sync
      loadSettings()

    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error(error.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const isAdmin = currentUser && ['super_admin', 'admin'].includes(currentUser.role)

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-32 rounded-md bg-muted" />
        <div className="h-4 w-64 rounded-md bg-muted" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-5 w-40 rounded-md bg-muted" />
                <div className="mt-2 h-4 w-56 rounded-md bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="h-10 rounded-md bg-muted" />
                  <div className="h-10 rounded-md bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Configure system preferences</p>
        </div>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Settings className="h-5 w-5" />
              Access Restricted
            </CardTitle>
            <CardDescription>
              Only administrators can access system settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              If you need to change system settings, please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage system-wide configurations and defaults</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => reset(defaultSettings)}
            disabled={saving}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset Defaults
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={saving || !isDirty}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Organization Information */}
        <Card>
          <CardHeader>
            <CardTitle>Organization Information</CardTitle>
            <CardDescription>Basic details displayed in reports and communications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization_name">Organization Name</Label>
              <Input
                id="organization_name"
                placeholder="The Covenant Nation Protocol"
                {...register("organization_name")}
              />
              {errors.organization_name && (
                <p className="text-sm text-destructive">{errors.organization_name.message}</p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organization_email">Contact Email</Label>
                <Input
                  id="organization_email"
                  type="email"
                  placeholder="contact@tcnp.org"
                  {...register("organization_email")}
                />
                {errors.organization_email && (
                  <p className="text-sm text-destructive">{errors.organization_email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization_phone">Contact Phone</Label>
                <Input
                  id="organization_phone"
                  type="tel"
                  placeholder="+234..."
                  {...register("organization_phone")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                placeholder="Organization address..."
                {...register("address")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Defaults</CardTitle>
            <CardDescription>Default notification channels for new users</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label className="text-base">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Send notifications via email</p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                {...register("email_notifications")}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label className="text-base">SMS Notifications</Label>
                <p className="text-sm text-muted-foreground">Send notifications via SMS (requires gateway)</p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                {...register("sms_notifications")}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label className="text-base">Push Notifications</Label>
                <p className="text-sm text-muted-foreground">Send in-app and browser alerts</p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                {...register("push_notifications")}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label className="text-base">Notification Sounds</Label>
                <p className="text-sm text-muted-foreground">Play sounds for critical alerts</p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                {...register("notification_sound")}
              />
            </div>
          </CardContent>
        </Card>

        {/* Display & Localization */}
        <Card>
          <CardHeader>
            <CardTitle>Display & Localization</CardTitle>
            <CardDescription>System-wide defaults for appearance and time</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="theme">Default Theme</Label>
                <select
                  id="theme"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...register("theme")}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <select
                  id="language"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...register("language")}
                >
                  <option value="en">English</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  placeholder="Africa/Lagos"
                  {...register("timezone")}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date_format">Date Format</Label>
                <Input
                  id="date_format"
                  placeholder="DD/MM/YYYY"
                  {...register("date_format")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="time_format">Time Format</Label>
                <select
                  id="time_format"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...register("time_format")}
                >
                  <option value="24h">24-hour</option>
                  <option value="12h">12-hour</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Journey & Approvals */}
        <Card>
          <CardHeader>
            <CardTitle>Journey & Approvals</CardTitle>
            <CardDescription>Operational rules for journey management</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="default_journey_duration">Default Duration (mins)</Label>
                <Input
                  id="default_journey_duration"
                  type="number"
                  {...register("default_journey_duration")}
                />
                {errors.default_journey_duration && (
                  <p className="text-sm text-destructive">{errors.default_journey_duration.message}</p>
                )}
              </div>

              <div className="col-span-2 grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Auto-assign Vehicles</Label>
                    <p className="text-xs text-muted-foreground">Suggest vehicles automatically</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    {...register("auto_assign_vehicles")}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Require Approval</Label>
                    <p className="text-xs text-muted-foreground">Journeys need approval</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    {...register("require_journey_approval")}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle>Security Policies</CardTitle>
            <CardDescription>Authentication and session management</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="session_timeout">Session Timeout (mins)</Label>
                <Input
                  id="session_timeout"
                  type="number"
                  {...register("session_timeout")}
                />
                {errors.session_timeout && (
                  <p className="text-sm text-destructive">{errors.session_timeout.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password_expiry_days">Password Expiry (days)</Label>
                <Input
                  id="password_expiry_days"
                  type="number"
                  {...register("password_expiry_days")}
                />
                {errors.password_expiry_days && (
                  <p className="text-sm text-destructive">{errors.password_expiry_days.message}</p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm h-[70px]">
                <div className="space-y-0.5">
                  <Label className="text-sm">Require 2FA</Label>
                  <p className="text-xs text-muted-foreground">Enforce two-factor auth</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  {...register("require_2fa")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Maps & Tracking */}
        <Card>
          <CardHeader>
            <CardTitle>Maps & Tracking</CardTitle>
            <CardDescription>Map provider settings and tracking intervals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="map_provider">Map Provider</Label>
                <select
                  id="map_provider"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...register("map_provider")}
                >
                  <option value="openstreetmap">OpenStreetMap</option>
                  <option value="mapbox">Mapbox</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_map_center_lat">Default Latitude</Label>
                <Input
                  id="default_map_center_lat"
                  type="number"
                  step="0.000001"
                  {...register("default_map_center_lat")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_map_center_lng">Default Longitude</Label>
                <Input
                  id="default_map_center_lng"
                  type="number"
                  step="0.000001"
                  {...register("default_map_center_lng")}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="default_map_zoom">Default Zoom Level</Label>
                <Input
                  id="default_map_zoom"
                  type="number"
                  {...register("default_map_zoom")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location_update_interval">Update Interval (sec)</Label>
                <Input
                  id="location_update_interval"
                  type="number"
                  {...register("location_update_interval")}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm h-[70px]">
                <div className="space-y-0.5">
                  <Label className="text-sm">Offline Mode</Label>
                  <p className="text-xs text-muted-foreground">Enable offline capabilities</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  {...register("enable_offline_mode")}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
