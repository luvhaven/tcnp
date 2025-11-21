"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Settings, Save } from "lucide-react"
import { toast } from "sonner"

export default function SettingsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [formData, setFormData] = useState({
    organization_name: '',
    organization_email: '',
    organization_phone: '',
    address: '',
    email_notifications: true,
    sms_notifications: false,
    push_notifications: true,
    notification_sound: true,
    theme: 'light',
    language: 'en',
    timezone: 'Africa/Lagos',
    date_format: 'DD/MM/YYYY',
    time_format: '24h',
    default_journey_duration: 60,
    auto_assign_vehicles: false,
    require_journey_approval: true,
    session_timeout: 30,
    require_2fa: false,
    password_expiry_days: 90,
    default_map_center_lat: 9.0765,
    default_map_center_lng: 7.3986,
    default_map_zoom: 12,
    map_provider: 'openstreetmap',
    location_update_interval: 30,
    enable_offline_mode: true
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        toast.error('Please login to access settings')
        return
      }

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
      
      setCurrentUser(userData)

      // Get user settings
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setSettings(data)
        setFormData({
          organization_name: data.organization_name || '',
          organization_email: data.organization_email || '',
          organization_phone: data.organization_phone || '',
          address: data.address || '',
          email_notifications: data.email_notifications ?? true,
          sms_notifications: data.sms_notifications ?? false,
          push_notifications: data.push_notifications ?? true,
          notification_sound: data.notification_sound ?? true,
          theme: data.theme || 'light',
          language: data.language || 'en',
          timezone: data.timezone || 'Africa/Lagos',
          date_format: data.date_format || 'DD/MM/YYYY',
          time_format: data.time_format || '24h',
          default_journey_duration: data.default_journey_duration ?? 60,
          auto_assign_vehicles: data.auto_assign_vehicles ?? false,
          require_journey_approval: data.require_journey_approval ?? true,
          session_timeout: data.session_timeout ?? 30,
          require_2fa: data.require_2fa ?? false,
          password_expiry_days: data.password_expiry_days ?? 90,
          default_map_center_lat: data.default_map_center_lat ?? 9.0765,
          default_map_center_lng: data.default_map_center_lng ?? 7.3986,
          default_map_zoom: data.default_map_zoom ?? 12,
          map_provider: data.map_provider || 'openstreetmap',
          location_update_interval: data.location_update_interval ?? 30,
          enable_offline_mode: data.enable_offline_mode ?? true
        })
      } else {
        // Create default settings if none exist
        const { data: newSettings, error: insertError } = await supabase
          .from('settings')
          .insert([{ user_id: user.id }])
          .select()
          .single()
        
        if (newSettings) {
          setSettings(newSettings)
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('User not authenticated')
      }

      if (settings) {
        const { error } = await supabase
          .from('settings')
          .update(formData)
          .eq('id', settings.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('settings')
          .insert([{ ...formData, user_id: user.id }])

        if (error) throw error
      }

      toast.success('Settings saved successfully!')
      loadSettings()
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error(error.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
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
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure system preferences</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Organization Information</CardTitle>
            <CardDescription>Basic organization details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization_name">Organization Name</Label>
              <Input
                id="organization_name"
                placeholder="The Covenant Nation Protocol"
                value={formData.organization_name}
                onChange={(e) => setFormData({ ...formData, organization_name: e.target.value })}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="organization_email">Contact Email</Label>
                <Input
                  id="organization_email"
                  type="email"
                  placeholder="contact@tcnp.org"
                  value={formData.organization_email}
                  onChange={(e) => setFormData({ ...formData, organization_email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization_phone">Contact Phone</Label>
                <Input
                  id="organization_phone"
                  type="tel"
                  placeholder="+234 xxx xxx xxxx"
                  value={formData.organization_phone}
                  onChange={(e) => setFormData({ ...formData, organization_phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                placeholder="Organization address..."
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>Configure notification channels and behaviour</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">Receive notifications via email</p>
              </div>
              <input
                type="checkbox"
                checked={formData.email_notifications}
                onChange={(e) => setFormData({ ...formData, email_notifications: e.target.checked })}
                className="h-4 w-4"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">SMS Notifications</p>
                <p className="text-sm text-muted-foreground">Receive notifications via SMS (if configured)</p>
              </div>
              <input
                type="checkbox"
                checked={formData.sms_notifications}
                onChange={(e) => setFormData({ ...formData, sms_notifications: e.target.checked })}
                className="h-4 w-4"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Push Notifications</p>
                <p className="text-sm text-muted-foreground">Enable in-app and browser/device alerts</p>
              </div>
              <input
                type="checkbox"
                checked={formData.push_notifications}
                onChange={(e) => setFormData({ ...formData, push_notifications: e.target.checked })}
                className="h-4 w-4"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Notification Sound</p>
                <p className="text-sm text-muted-foreground">Play a sound when important events occur</p>
              </div>
              <input
                type="checkbox"
                checked={formData.notification_sound}
                onChange={(e) => setFormData({ ...formData, notification_sound: e.target.checked })}
                className="h-4 w-4"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Display & Localization</CardTitle>
            <CardDescription>Control theme, language, and regional formatting</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <select
                  id="theme"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={formData.theme}
                  onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto (system)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <select
                  id="language"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                >
                  <option value="en">English</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  placeholder="Africa/Lagos"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date_format">Date Format</Label>
                <Input
                  id="date_format"
                  placeholder="DD/MM/YYYY"
                  value={formData.date_format}
                  onChange={(e) => setFormData({ ...formData, date_format: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="time_format">Time Format</Label>
                <select
                  id="time_format"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={formData.time_format}
                  onChange={(e) => setFormData({ ...formData, time_format: e.target.value })}
                >
                  <option value="24h">24-hour</option>
                  <option value="12h">12-hour</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Journey & Approvals</CardTitle>
            <CardDescription>Control journey defaults and approval rules</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="default_journey_duration">Default Journey Duration (mins)</Label>
                <Input
                  id="default_journey_duration"
                  type="number"
                  min={5}
                  max={1440}
                  value={formData.default_journey_duration}
                  onChange={(e) => setFormData({ ...formData, default_journey_duration: Number(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-2">
                <Label>Auto-assign Vehicles</Label>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm text-muted-foreground">Automatically suggest vehicles for new journeys</span>
                  <input
                    type="checkbox"
                    checked={formData.auto_assign_vehicles}
                    onChange={(e) => setFormData({ ...formData, auto_assign_vehicles: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Require Journey Approval</Label>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm text-muted-foreground">Journeys must be approved before they start</span>
                  <input
                    type="checkbox"
                    checked={formData.require_journey_approval}
                    onChange={(e) => setFormData({ ...formData, require_journey_approval: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Session and authentication policies</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="session_timeout">Session Timeout (mins)</Label>
                <Input
                  id="session_timeout"
                  type="number"
                  min={5}
                  max={480}
                  value={formData.session_timeout}
                  onChange={(e) => setFormData({ ...formData, session_timeout: Number(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-2">
                <Label>Require 2FA</Label>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm text-muted-foreground">Enforce two-factor authentication for users</span>
                  <input
                    type="checkbox"
                    checked={formData.require_2fa}
                    onChange={(e) => setFormData({ ...formData, require_2fa: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password_expiry_days">Password Expiry (days)</Label>
                <Input
                  id="password_expiry_days"
                  type="number"
                  min={0}
                  max={365}
                  value={formData.password_expiry_days}
                  onChange={(e) => setFormData({ ...formData, password_expiry_days: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maps & Tracking</CardTitle>
            <CardDescription>Map provider, default view, and tracking behaviour</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="map_provider">Map Provider</Label>
                <select
                  id="map_provider"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={formData.map_provider}
                  onChange={(e) => setFormData({ ...formData, map_provider: e.target.value })}
                >
                  <option value="openstreetmap">OpenStreetMap</option>
                  <option value="mapbox">Mapbox</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_map_center_lat">Default Center Latitude</Label>
                <Input
                  id="default_map_center_lat"
                  type="number"
                  step="0.000001"
                  value={formData.default_map_center_lat}
                  onChange={(e) => setFormData({ ...formData, default_map_center_lat: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_map_center_lng">Default Center Longitude</Label>
                <Input
                  id="default_map_center_lng"
                  type="number"
                  step="0.000001"
                  value={formData.default_map_center_lng}
                  onChange={(e) => setFormData({ ...formData, default_map_center_lng: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="default_map_zoom">Default Zoom</Label>
                <Input
                  id="default_map_zoom"
                  type="number"
                  min={1}
                  max={20}
                  value={formData.default_map_zoom}
                  onChange={(e) => setFormData({ ...formData, default_map_zoom: Number(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location_update_interval">Location Update Interval (secs)</Label>
                <Input
                  id="location_update_interval"
                  type="number"
                  min={5}
                  max={600}
                  value={formData.location_update_interval}
                  onChange={(e) => setFormData({ ...formData, location_update_interval: Number(e.target.value) || 0 })}
                />
              </div>

              <div className="space-y-2">
                <Label>Enable Offline Mode</Label>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm text-muted-foreground">Allow limited offline use for field officers</span>
                  <input
                    type="checkbox"
                    checked={formData.enable_offline_mode}
                    onChange={(e) => setFormData({ ...formData, enable_offline_mode: e.target.checked })}
                    className="h-4 w-4"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </div>
  )
}
