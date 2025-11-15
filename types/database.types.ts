// Database types matching Supabase schema
export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'captain'
  | 'head_of_command'
  | 'head_of_operations'
  | 'prof'
  | 'duchess'
  | 'vice_captain'
  | 'command'
  | 'delta_oscar'
  | 'tango_oscar'
  | 'head_tango_oscar'
  | 'alpha_oscar'
  | 'november_oscar'
  | 'victor_oscar'
  | 'viewer'
  | 'media'
  | 'external';

export type JourneyStatus =
  | 'planned'
  | 'scheduled'
  | 'arriving'
  | 'at_nest'
  | 'departing_nest'
  | 'enroute_to_theatre'
  | 'at_theatre'
  | 'departing_theatre'
  | 'completed'
  | 'cancelled'
  | 'distress';

export type CallSign =
  | 'First Course'
  | 'Chapman'
  | 'Dessert'
  | 'Cocktail'
  | 'Blue Cocktail'
  | 'Red Cocktail'
  | 'Re-order'
  | 'Broken Arrow';

export type VehicleStatus = 'idle' | 'on_mission' | 'maintenance' | 'disabled';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type NotificationChannel = 'email' | 'sms' | 'push' | 'whatsapp';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'delivered';

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  is_online: boolean;
  last_seen: string | null;
  avatar_url: string | null;
  timezone: string;
  notification_preferences: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  activation_status: 'pending' | 'active' | 'deactivated';
  oscar: string | null;
  unit: string | null;
  current_title_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Papa {
  id: string;
  title: string | null;
  full_name: string;
  short_bio: string | null;
  nationality: string | null;
  passport_number: string | null;
  phone: string | null;
  email: string | null;
  organization: string | null;
  position: string | null;
  vip_level: 'vip' | 'vvip' | 'regular';
  program_id: string | null;
  arrival_country: string | null;
  arrival_city: string | null;
  flight_number: string | null;
  airline: string | null;
  flight_provider: string | null;
  flight_departure_time: string | null;
  flight_arrival_time: string | null;
  needs: {
    water?: boolean;
    face_towels?: boolean;
    meal_pref?: string;
    stage_props?: string[];
    special_requests?: string;
  };
  presentation_style: string | null;
  uses_stage_props?: boolean;
  needs_water_on_stage?: boolean;
  water_temperature?: string | null;
  has_slides?: boolean;
  needs_face_towels?: boolean;
  mic_preference?: string | null;
  notes: string | null;
  special_requirements: string | null;
  food_preferences: string | null;
  dietary_restrictions: string | null;
  accommodation_preferences: string | null;
  additional_notes: string | null;
  profile_photo_url: string | null;
  is_first_time: boolean;
  past_invites_count: number;
  tags: string[];
  speaking_schedule: any[];
  entourage_count: number;
  personal_assistants: any[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Journey {
  id: string;
  papa_id: string;
  status: JourneyStatus;
  current_call_sign: CallSign | null;
  eta: string | null;
  etd: string | null;
  origin: string | null;
  destination: string | null;
  assigned_cheetah_id: string | null;
  assigned_duty_officer_id: string | null;
  assigned_nest_id: string | null;
  assigned_theatre_id: string | null;
  assigned_eagle_square_id: string | null;
  route_geojson: any | null;
  last_latitude: number | null;
  last_longitude: number | null;
  last_location_update: string | null;
  telemetry_enabled: boolean;
  notes: string | null;
  created_by: string | null;
  program_id: string | null;
  created_at: string;
  updated_at: string;
  papa?: Papa;
  cheetah?: Cheetah;
  duty_officer?: User;
  nest?: Nest;
  theatre?: Theatre;
  eagle_square?: EagleSquare;
}

export interface JourneyEvent {
  id: string;
  journey_id: string;
  event_type: CallSign;
  triggered_by: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  metadata: any;
  created_at: string;
  user?: User;
}

export interface Cheetah {
  id: string;
  reg_no: string;
  call_sign: string | null;
  registration_number: string | null;
  driver_name: string;
  driver_phone: string;
  capacity: number;
  vehicle_type: string;
  current_status: VehicleStatus;
  telemetry_device_id: string | null;
  last_latitude: number | null;
  last_longitude: number | null;
  last_location_update: string | null;
  fuel_status: number;
  notes: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  status?: string | null;
  program_id?: string | null;
  features?: string | null;
  last_maintenance?: string | null;
  next_maintenance?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Nest {
  id: string;
  name: string;
  address: string;
  city: string;
  contact: string | null;
  room_assignments: any[];
  check_in_time: string;
  check_out_time: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Theatre {
  id: string;
  name: string;
  address: string;
  city: string;
  gate_instructions: string | null;
  contact: string | null;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface EagleSquare {
  id: string;
  name: string;
  code: string;
  city: string;
  country: string;
  contact: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Incident {
  id: string;
  journey_id: string | null;
  type: string;
  severity: IncidentSeverity;
  description: string;
  latitude: number | null;
  longitude: number | null;
  reported_by: string | null;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  program_id: string | null;
  created_at: string;
  updated_at: string;
  journey?: Journey;
  reporter?: User;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  metadata: any;
  read_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  changes: any | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user?: User;
}

export interface Setting {
  id: string;
  key: string;
  value: any;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface TelemetryData {
  id: string;
  journey_id: string | null;
  cheetah_id: string | null;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  accuracy: number | null;
  timestamp: string;
  created_at: string;
}

export interface Role {
  id: string;
  name: UserRole;
  display_name: string;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  theatre_id: string | null;
  start_date: string;
  end_date: string | null;
  status: 'planning' | 'active' | 'completed' | 'archived';
  budget: number | null;
  created_at: string;
  updated_at: string;
}

export interface OfficialTitle {
  id: string;
  code: string;
  name: string;
  unit: string;
  is_fixed: boolean;
  is_team_lead: boolean;
  max_positions: number;
  description: string | null;
  created_at: string;
}

export interface TitleAssignment {
  id: string;
  user_id: string;
  title_id: string;
  program_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface VehicleLocation {
  id: string;
  cheetah_id: string;
  user_id: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  timestamp: string;
  created_at: string;
}

export interface ProtocolOfficerLocation {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  battery_level: number | null;
  is_online: boolean;
  timestamp: string;
  created_at: string;
}

export interface FlightTracking {
  id: string;
  papa_id: string | null;
  flight_number: string;
  icao24: string | null;
  callsign: string | null;
  origin_country: string | null;
  departure_airport: string | null;
  arrival_airport: string | null;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  actual_departure: string | null;
  estimated_arrival: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  altitude: number | null;
  velocity: number | null;
  heading: number | null;
  status: string | null;
  last_updated: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  mentions: any;
  is_private: boolean;
  program_id: string | null;
  reply_to_id: string | null;
  attachments: any;
  read_by: any;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
}

export interface ProgramExport {
  id: string;
  program_id: string;
  exported_by: string;
  export_data: any;
  file_url: string | null;
  status: string;
  created_at: string;
}

// Form input types
export interface CreatePapaInput {
  title?: string;
  full_name: string;
  short_bio?: string;
  nationality?: string;
  passport_number?: string;
  phone?: string;
  email?: string;
  arrival_country?: string;
  arrival_city?: string;
  flight_number?: string;
  flight_provider?: string;
  flight_departure_time?: string;
  flight_arrival_time?: string;
  needs?: Papa['needs'];
  presentation_style?: string;
  notes?: string;
  is_first_time?: boolean;
  tags?: string[];
}

export interface CreateJourneyInput {
  papa_id: string;
  status?: JourneyStatus;
  eta?: string;
  etd?: string;
  origin?: string;
  destination?: string;
  assigned_cheetah_id?: string;
  assigned_duty_officer_id?: string;
  assigned_nest_id?: string;
  assigned_theatre_id?: string;
  assigned_eagle_square_id?: string;
  telemetry_enabled?: boolean;
  notes?: string;
}

export interface UpdateJourneyInput {
  status?: JourneyStatus;
  current_call_sign?: CallSign;
  eta?: string;
  etd?: string;
  assigned_cheetah_id?: string;
  assigned_duty_officer_id?: string;
  last_latitude?: number;
  last_longitude?: number;
  notes?: string;
}

export interface TriggerCallSignInput {
  journey_id: string;
  call_sign: CallSign;
  notes?: string;
  latitude?: number;
  longitude?: number;
}
