import { z } from "zod"

export const settingsSchema = z.object({
    // Organization
    organization_name: z.string().min(2, "Organization name must be at least 2 characters"),
    organization_email: z.string().email("Invalid email address").optional().or(z.literal("")),
    organization_phone: z.string().optional(),
    address: z.string().optional(),

    // Notifications
    email_notifications: z.boolean(),
    sms_notifications: z.boolean(),
    push_notifications: z.boolean(),
    notification_sound: z.boolean(),

    // Display & Localization
    theme: z.enum(["light", "dark", "system"]),
    language: z.string(),
    timezone: z.string(),
    date_format: z.string(),
    time_format: z.enum(["12h", "24h"]),

    // Journey & Approvals
    default_journey_duration: z.coerce.number().min(5, "Duration must be at least 5 minutes").max(1440, "Duration cannot exceed 24 hours"),
    auto_assign_vehicles: z.boolean(),
    require_journey_approval: z.boolean(),

    // Security
    session_timeout: z.coerce.number().min(5, "Timeout must be at least 5 minutes").max(480, "Timeout cannot exceed 8 hours"),
    require_2fa: z.boolean(),
    password_expiry_days: z.coerce.number().min(0).max(365),

    // Maps
    map_provider: z.enum(["openstreetmap", "mapbox"]),
    default_map_center_lat: z.coerce.number().min(-90).max(90),
    default_map_center_lng: z.coerce.number().min(-180).max(180),
    default_map_zoom: z.coerce.number().min(1).max(20),
    location_update_interval: z.coerce.number().min(5).max(600),
    enable_offline_mode: z.boolean(),
})

export type SettingsFormValues = z.infer<typeof settingsSchema>

export const defaultSettings: SettingsFormValues = {
    organization_name: "",
    organization_email: "",
    organization_phone: "",
    address: "",
    email_notifications: true,
    sms_notifications: false,
    push_notifications: true,
    notification_sound: true,
    theme: "light",
    language: "en",
    timezone: "Africa/Lagos",
    date_format: "DD/MM/YYYY",
    time_format: "24h",
    default_journey_duration: 60,
    auto_assign_vehicles: false,
    require_journey_approval: true,
    session_timeout: 30,
    require_2fa: false,
    password_expiry_days: 90,
    map_provider: "openstreetmap",
    default_map_center_lat: 9.0765,
    default_map_center_lng: 7.3986,
    default_map_zoom: 12,
    location_update_interval: 30,
    enable_offline_mode: true,
}
