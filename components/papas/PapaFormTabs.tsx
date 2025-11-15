'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, X } from 'lucide-react'

type PapaFormData = {
  // Basic Info
  event_id: string
  title: string
  full_name: string
  passport_number: string
  email: string
  phone: string
  flight_number: string
  airline: string
  arrival_city: string
  arrival_country: string
  nationality: string
  short_bio: string
  
  // Presentation
  uses_stage_props: boolean
  needs_water_on_stage: boolean
  water_temperature: string
  has_slides: boolean
  needs_face_towels: boolean
  mic_preference: string
  presentation_style: string
  special_requirements: string
  
  // Preferences
  food_preferences: string
  dietary_restrictions: string
  accommodation_preferences: string
  additional_notes: string
  
  // Speaking
  speaking_schedule: Array<{
    day: string
    time: string
    topic: string
  }>
  
  // Entourage
  entourage_count: number
  personal_assistants: Array<{
    name: string
    role: string
    phone: string
  }>
}

type PapaFormTabsProps = {
  initialData?: Partial<PapaFormData>
  events: Array<{ id: string; name: string }>
  onSubmit: (data: PapaFormData) => Promise<void>
  onCancel: () => void
  isEditing?: boolean
}

export default function PapaFormTabs({
  initialData,
  events,
  onSubmit,
  onCancel,
  isEditing = false
}: PapaFormTabsProps) {
  const [activeTab, setActiveTab] = useState('basic')
  const [formData, setFormData] = useState<PapaFormData>({
    event_id: initialData?.event_id || '',
    title: initialData?.title || '',
    full_name: initialData?.full_name || '',
    passport_number: initialData?.passport_number || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    flight_number: initialData?.flight_number || '',
    airline: initialData?.airline || '',
    arrival_city: initialData?.arrival_city || '',
    arrival_country: initialData?.arrival_country || '',
    nationality: initialData?.nationality || '',
    short_bio: initialData?.short_bio || '',
    uses_stage_props: initialData?.uses_stage_props || false,
    needs_water_on_stage: initialData?.needs_water_on_stage || false,
    water_temperature: initialData?.water_temperature || 'Room Temperature',
    has_slides: initialData?.has_slides || false,
    needs_face_towels: initialData?.needs_face_towels || false,
    mic_preference: initialData?.mic_preference || '',
    presentation_style: initialData?.presentation_style || '',
    special_requirements: initialData?.special_requirements || '',
    food_preferences: initialData?.food_preferences || '',
    dietary_restrictions: initialData?.dietary_restrictions || '',
    accommodation_preferences: initialData?.accommodation_preferences || '',
    additional_notes: initialData?.additional_notes || '',
    speaking_schedule: initialData?.speaking_schedule || [],
    entourage_count: initialData?.entourage_count || 0,
    personal_assistants: initialData?.personal_assistants || []
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(formData)
  }

  const addSpeakingSchedule = () => {
    setFormData({
      ...formData,
      speaking_schedule: [
        ...formData.speaking_schedule,
        { day: '', time: '', topic: '' }
      ]
    })
  }

  const removeSpeakingSchedule = (index: number) => {
    setFormData({
      ...formData,
      speaking_schedule: formData.speaking_schedule.filter((_, i) => i !== index)
    })
  }

  const updateSpeakingSchedule = (index: number, field: string, value: string) => {
    const updated = [...formData.speaking_schedule]
    updated[index] = { ...updated[index], [field]: value }
    setFormData({ ...formData, speaking_schedule: updated })
  }

  const addPersonalAssistant = () => {
    setFormData({
      ...formData,
      personal_assistants: [
        ...formData.personal_assistants,
        { name: '', role: '', phone: '' }
      ]
    })
  }

  const removePersonalAssistant = (index: number) => {
    setFormData({
      ...formData,
      personal_assistants: formData.personal_assistants.filter((_, i) => i !== index)
    })
  }

  const updatePersonalAssistant = (index: number, field: string, value: string) => {
    const updated = [...formData.personal_assistants]
    updated[index] = { ...updated[index], [field]: value }
    setFormData({ ...formData, personal_assistants: updated })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="presentation">Presentation</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="speaking">Speaking</TabsTrigger>
          <TabsTrigger value="entourage">Entourage</TabsTrigger>
        </TabsList>

        {/* Basic Info Tab */}
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event_id">Event *</Label>
                  <Select
                    id="event_id"
                    required
                    value={formData.event_id}
                    onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
                  >
                    <option value="">Select event</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    required
                    placeholder="e.g., Bishop, Pastor, Dr."
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  required
                  placeholder="Full name of the guest"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="passport_number">Passport Number</Label>
                  <Input
                    id="passport_number"
                    placeholder="Passport number"
                    value={formData.passport_number}
                    onChange={(e) => setFormData({ ...formData, passport_number: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nationality">Nationality</Label>
                  <Input
                    id="nationality"
                    placeholder="e.g., Nigerian, American"
                    value={formData.nationality}
                    onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    required
                    type="tel"
                    placeholder="+234 xxx xxx xxxx"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="flight_number">Flight Number</Label>
                  <Input
                    id="flight_number"
                    placeholder="e.g., BA123"
                    value={formData.flight_number}
                    onChange={(e) => setFormData({ ...formData, flight_number: e.target.value.toUpperCase() })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="airline">Airline</Label>
                  <Input
                    id="airline"
                    placeholder="e.g., British Airways"
                    value={formData.airline}
                    onChange={(e) => setFormData({ ...formData, airline: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="arrival_city">Arrival City</Label>
                  <Input
                    id="arrival_city"
                    placeholder="e.g., Abuja"
                    value={formData.arrival_city}
                    onChange={(e) => setFormData({ ...formData, arrival_city: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="arrival_country">Arrival Country</Label>
                  <Input
                    id="arrival_country"
                    placeholder="e.g., Nigeria"
                    value={formData.arrival_country}
                    onChange={(e) => setFormData({ ...formData, arrival_country: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="short_bio">Short Bio</Label>
                <Textarea
                  id="short_bio"
                  placeholder="Brief biography of the guest..."
                  rows={4}
                  value={formData.short_bio}
                  onChange={(e) => setFormData({ ...formData, short_bio: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Presentation Tab */}
        <TabsContent value="presentation" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="uses_stage_props"
                    checked={formData.uses_stage_props}
                    onChange={(e) => setFormData({ ...formData, uses_stage_props: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="uses_stage_props">Uses Stage Props</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="has_slides"
                    checked={formData.has_slides}
                    onChange={(e) => setFormData({ ...formData, has_slides: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="has_slides">Has Slides</Label>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="needs_water_on_stage"
                    checked={formData.needs_water_on_stage}
                    onChange={(e) => setFormData({ ...formData, needs_water_on_stage: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="needs_water_on_stage">Needs Water On Stage</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="needs_face_towels"
                    checked={formData.needs_face_towels}
                    onChange={(e) => setFormData({ ...formData, needs_face_towels: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="needs_face_towels">Needs Face Towels</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="water_temperature">Water Temperature</Label>
                <Select
                  id="water_temperature"
                  value={formData.water_temperature}
                  onChange={(e) => setFormData({ ...formData, water_temperature: e.target.value })}
                >
                  <option value="Room Temperature">Room Temperature</option>
                  <option value="Cold">Cold</option>
                  <option value="Warm">Warm</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mic_preference">Mic Preference</Label>
                <Input
                  id="mic_preference"
                  placeholder="e.g., Handheld, Lapel, etc."
                  value={formData.mic_preference}
                  onChange={(e) => setFormData({ ...formData, mic_preference: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="presentation_style">Presentation Style</Label>
                <Textarea
                  id="presentation_style"
                  placeholder="Describe presentation style..."
                  rows={3}
                  value={formData.presentation_style}
                  onChange={(e) => setFormData({ ...formData, presentation_style: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="special_requirements">Special Requirements</Label>
                <Textarea
                  id="special_requirements"
                  placeholder="Any special requirements..."
                  rows={3}
                  value={formData.special_requirements}
                  onChange={(e) => setFormData({ ...formData, special_requirements: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="food_preferences">Food Preferences</Label>
                <Textarea
                  id="food_preferences"
                  placeholder="Preferred foods..."
                  rows={3}
                  value={formData.food_preferences}
                  onChange={(e) => setFormData({ ...formData, food_preferences: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dietary_restrictions">Dietary Restrictions</Label>
                <Textarea
                  id="dietary_restrictions"
                  placeholder="Allergies, restrictions..."
                  rows={3}
                  value={formData.dietary_restrictions}
                  onChange={(e) => setFormData({ ...formData, dietary_restrictions: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accommodation_preferences">Accommodation Preferences</Label>
                <Textarea
                  id="accommodation_preferences"
                  placeholder="Room preferences, special needs..."
                  rows={3}
                  value={formData.accommodation_preferences}
                  onChange={(e) => setFormData({ ...formData, accommodation_preferences: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="additional_notes">Additional Notes</Label>
                <Textarea
                  id="additional_notes"
                  placeholder="Any other notes..."
                  rows={4}
                  value={formData.additional_notes}
                  onChange={(e) => setFormData({ ...formData, additional_notes: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Speaking Tab */}
        <TabsContent value="speaking" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Label>Speaking Schedule (Day & Time)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSpeakingSchedule}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Schedule
                </Button>
              </div>

              {formData.speaking_schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No speaking schedule added yet. Click "Add Schedule" to add speaking days and times.
                </p>
              ) : (
                <div className="space-y-3">
                  {formData.speaking_schedule.map((schedule, index) => (
                    <div key={index} className="flex items-start space-x-2 p-3 border rounded-lg">
                      <div className="flex-1 grid gap-3 md:grid-cols-3">
                        <Input
                          placeholder="Day (e.g., Monday)"
                          value={schedule.day}
                          onChange={(e) => updateSpeakingSchedule(index, 'day', e.target.value)}
                        />
                        <Input
                          placeholder="Time (e.g., 10:00 AM)"
                          value={schedule.time}
                          onChange={(e) => updateSpeakingSchedule(index, 'time', e.target.value)}
                        />
                        <Input
                          placeholder="Topic"
                          value={schedule.topic}
                          onChange={(e) => updateSpeakingSchedule(index, 'topic', e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSpeakingSchedule(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Entourage Tab */}
        <TabsContent value="entourage" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="entourage_count">Entourage Count</Label>
                <Input
                  id="entourage_count"
                  type="number"
                  min="0"
                  value={formData.entourage_count}
                  onChange={(e) => setFormData({ ...formData, entourage_count: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Personal Assistants</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPersonalAssistant}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add PA
                </Button>
              </div>

              {formData.personal_assistants.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No personal assistants added yet. Click "Add PA" to add personal assistants.
                </p>
              ) : (
                <div className="space-y-3">
                  {formData.personal_assistants.map((pa, index) => (
                    <div key={index} className="flex items-start space-x-2 p-3 border rounded-lg">
                      <div className="flex-1 grid gap-3 md:grid-cols-3">
                        <Input
                          placeholder="Name"
                          value={pa.name}
                          onChange={(e) => updatePersonalAssistant(index, 'name', e.target.value)}
                        />
                        <Input
                          placeholder="Role"
                          value={pa.role}
                          onChange={(e) => updatePersonalAssistant(index, 'role', e.target.value)}
                        />
                        <Input
                          placeholder="Phone"
                          value={pa.phone}
                          onChange={(e) => updatePersonalAssistant(index, 'phone', e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePersonalAssistant(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Form Actions */}
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {isEditing ? 'Update' : 'Create'} Papa
        </Button>
      </div>
    </form>
  )
}
