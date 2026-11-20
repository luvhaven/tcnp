export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      alpha_arrival_timeline_items: {
        Row: {
          done_at: string | null
          done_by: string | null
          id: string
          label: string
          milestone_key: string
          note: string | null
          note_at: string | null
          note_by: string | null
          offset_minutes: number
          owner: string | null
          position: number
          sop_ref: string | null
          timeline_id: string
        }
        Insert: {
          done_at?: string | null
          done_by?: string | null
          id?: string
          label: string
          milestone_key: string
          note?: string | null
          note_at?: string | null
          note_by?: string | null
          offset_minutes: number
          owner?: string | null
          position?: number
          sop_ref?: string | null
          timeline_id: string
        }
        Update: {
          done_at?: string | null
          done_by?: string | null
          id?: string
          label?: string
          milestone_key?: string
          note?: string | null
          note_at?: string | null
          note_by?: string | null
          offset_minutes?: number
          owner?: string | null
          position?: number
          sop_ref?: string | null
          timeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_arrival_timeline_items_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alpha_arrival_timeline_items_note_by_fkey"
            columns: ["note_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alpha_arrival_timeline_items_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "alpha_arrival_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      alpha_arrival_timelines: {
        Row: {
          created_at: string
          created_by: string | null
          eagle_square_id: string | null
          eta_override: string | null
          id: string
          notes: string | null
          papa_id: string
          program_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          eagle_square_id?: string | null
          eta_override?: string | null
          id?: string
          notes?: string | null
          papa_id: string
          program_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          eagle_square_id?: string | null
          eta_override?: string | null
          id?: string
          notes?: string | null
          papa_id?: string
          program_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_arrival_timelines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alpha_arrival_timelines_eagle_square_id_fkey"
            columns: ["eagle_square_id"]
            isOneToOne: false
            referencedRelation: "eagle_squares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alpha_arrival_timelines_eagle_square_id_fkey"
            columns: ["eagle_square_id"]
            isOneToOne: false
            referencedRelation: "eagle_squares_with_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alpha_arrival_timelines_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alpha_arrival_timelines_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alpha_arrival_timelines_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      alpha_timeline_overdue_notices: {
        Row: {
          due_at: string
          milestone_key: string
          sent_at: string
          timeline_id: string
        }
        Insert: {
          due_at: string
          milestone_key: string
          sent_at?: string
          timeline_id: string
        }
        Update: {
          due_at?: string
          milestone_key?: string
          sent_at?: string
          timeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alpha_timeline_overdue_notices_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "alpha_arrival_timelines"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_deliveries: {
        Row: {
          announcement_id: string
          delivered_at: string
          id: string
          notification_id: string | null
          user_id: string
        }
        Insert: {
          announcement_id: string
          delivered_at?: string
          id?: string
          notification_id?: string | null
          user_id: string
        }
        Update: {
          announcement_id?: string
          delivered_at?: string
          id?: string
          notification_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_deliveries_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: Json
          audience_type: string
          body: string
          category: string
          created_at: string
          created_by: string | null
          dispatch_completed_at: string | null
          expires_at: string | null
          id: string
          publish_at: string
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          audience?: Json
          audience_type?: string
          body: string
          category?: string
          created_at?: string
          created_by?: string | null
          dispatch_completed_at?: string | null
          expires_at?: string | null
          id?: string
          publish_at?: string
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          audience?: Json
          audience_type?: string
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          dispatch_completed_at?: string | null
          expires_at?: string | null
          id?: string
          publish_at?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          description: string | null
          device_info: Json | null
          entity_id: string | null
          entity_type: string | null
          error_code: string | null
          error_message: string | null
          execution_time_ms: number | null
          headers: Json | null
          id: string
          ip_address: unknown
          metadata: Json | null
          method: string | null
          params: Json | null
          path: string | null
          request_id: string | null
          session_id: string | null
          status: string | null
          target_id: string | null
          target_type: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          description?: string | null
          device_info?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          headers?: Json | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          method?: string | null
          params?: Json | null
          path?: string | null
          request_id?: string | null
          session_id?: string | null
          status?: string | null
          target_id?: string | null
          target_type: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          description?: string | null
          device_info?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          headers?: Json | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          method?: string | null
          params?: Json | null
          path?: string | null
          request_id?: string | null
          session_id?: string | null
          status?: string | null
          target_id?: string | null
          target_type?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string | null
          deleted_at: string | null
          deleted_by_admin: boolean | null
          edited_at: string | null
          flagged: boolean
          flagged_by: string | null
          id: string
          is_archived: boolean | null
          is_private: boolean | null
          mentions: Json | null
          papa_id: string | null
          program_id: string | null
          read_by: Json | null
          reply_to_id: string | null
          sender_id: string
          team: string | null
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by_admin?: boolean | null
          edited_at?: string | null
          flagged?: boolean
          flagged_by?: string | null
          id?: string
          is_archived?: boolean | null
          is_private?: boolean | null
          mentions?: Json | null
          papa_id?: string | null
          program_id?: string | null
          read_by?: Json | null
          reply_to_id?: string | null
          sender_id: string
          team?: string | null
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by_admin?: boolean | null
          edited_at?: string | null
          flagged?: boolean
          flagged_by?: string | null
          id?: string
          is_archived?: boolean | null
          is_private?: boolean | null
          mentions?: Json | null
          papa_id?: string | null
          program_id?: string | null
          read_by?: Json | null
          reply_to_id?: string | null
          sender_id?: string
          team?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_memberships: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          papa_id: string | null
          program_id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          papa_id?: string | null
          program_id: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          papa_id?: string | null
          program_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_memberships_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_memberships_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_memberships_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_memberships_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_removals: {
        Row: {
          created_at: string
          id: string
          papa_id: string | null
          program_id: string
          removed_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          papa_id?: string | null
          program_id: string
          removed_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          papa_id?: string | null
          program_id?: string
          removed_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_removals_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_removals_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_removals_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_removals_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_removals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cheetah_flower_logs: {
        Row: {
          all_passed: boolean
          checks: Json
          cheetah_id: string
          id: string
          performed_at: string
          performed_by: string | null
          performed_by_name: string | null
        }
        Insert: {
          all_passed?: boolean
          checks?: Json
          cheetah_id: string
          id?: string
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Update: {
          all_passed?: boolean
          checks?: Json
          cheetah_id?: string
          id?: string
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cheetah_flower_logs_cheetah_id_fkey"
            columns: ["cheetah_id"]
            isOneToOne: false
            referencedRelation: "cheetahs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheetah_flower_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cheetahs: {
        Row: {
          call_sign: string | null
          capacity: number | null
          color: string | null
          created_at: string | null
          current_status: Database["public"]["Enums"]["vehicle_status"] | null
          default_driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          features: string | null
          fuel_status: string | null
          id: string
          last_latitude: number | null
          last_location_update: string | null
          last_longitude: number | null
          last_maintenance: string | null
          last_service_date: string | null
          last_service_mileage: number | null
          make: string | null
          mileage: number | null
          model: string | null
          name: string | null
          next_maintenance: string | null
          notes: string | null
          ownership_type: string
          partner_id: string | null
          plate_number: string | null
          program_id: string | null
          reg_no: string
          registration_number: string | null
          status: string | null
          telemetry_device_id: string | null
          updated_at: string | null
          vehicle_type: string | null
          year: number | null
        }
        Insert: {
          call_sign?: string | null
          capacity?: number | null
          color?: string | null
          created_at?: string | null
          current_status?: Database["public"]["Enums"]["vehicle_status"] | null
          default_driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          features?: string | null
          fuel_status?: string | null
          id?: string
          last_latitude?: number | null
          last_location_update?: string | null
          last_longitude?: number | null
          last_maintenance?: string | null
          last_service_date?: string | null
          last_service_mileage?: number | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          name?: string | null
          next_maintenance?: string | null
          notes?: string | null
          ownership_type?: string
          partner_id?: string | null
          plate_number?: string | null
          program_id?: string | null
          reg_no: string
          registration_number?: string | null
          status?: string | null
          telemetry_device_id?: string | null
          updated_at?: string | null
          vehicle_type?: string | null
          year?: number | null
        }
        Update: {
          call_sign?: string | null
          capacity?: number | null
          color?: string | null
          created_at?: string | null
          current_status?: Database["public"]["Enums"]["vehicle_status"] | null
          default_driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          features?: string | null
          fuel_status?: string | null
          id?: string
          last_latitude?: number | null
          last_location_update?: string | null
          last_longitude?: number | null
          last_maintenance?: string | null
          last_service_date?: string | null
          last_service_mileage?: number | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          name?: string | null
          next_maintenance?: string | null
          notes?: string | null
          ownership_type?: string
          partner_id?: string | null
          plate_number?: string | null
          program_id?: string | null
          reg_no?: string
          registration_number?: string | null
          status?: string | null
          telemetry_device_id?: string | null
          updated_at?: string | null
          vehicle_type?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cheetahs_default_driver_id_fkey"
            columns: ["default_driver_id"]
            isOneToOne: false
            referencedRelation: "tango_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheetahs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "fleet_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheetahs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_award_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_award_categories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unit_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_award_nominees: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          id: string
          is_winner: boolean
          nominee_name: string | null
          nominee_user_id: string | null
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_winner?: boolean
          nominee_name?: string | null
          nominee_user_id?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_winner?: boolean
          nominee_name?: string | null
          nominee_user_id?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_award_nominees_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "compliance_award_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_award_nominees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_award_nominees_nominee_user_id_fkey"
            columns: ["nominee_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_inspections: {
        Row: {
          acknowledged_at: string | null
          checklist: Json
          created_at: string
          follow_up_due: string | null
          id: string
          inspected_on: string
          inspector_id: string | null
          notes: string | null
          officer_comment: string | null
          officer_id: string
          outcome: string
          program_id: string | null
          score: number
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          checklist?: Json
          created_at?: string
          follow_up_due?: string | null
          id?: string
          inspected_on?: string
          inspector_id?: string | null
          notes?: string | null
          officer_comment?: string | null
          officer_id: string
          outcome?: string
          program_id?: string | null
          score?: number
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          checklist?: Json
          created_at?: string
          follow_up_due?: string | null
          id?: string
          inspected_on?: string
          inspector_id?: string | null
          notes?: string | null
          officer_comment?: string | null
          officer_id?: string
          outcome?: string
          program_id?: string | null
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_inspections_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_inspections_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_posts: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          event_date: string | null
          id: string
          image_paths: Json
          post_type: string
          program_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          event_date?: string | null
          id?: string
          image_paths?: Json
          post_type?: string
          program_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          event_date?: string | null
          id?: string
          image_paths?: Json
          post_type?: string
          program_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_posts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_recognitions: {
        Row: {
          award_type: string
          awarded_by: string | null
          awarded_on: string
          citation: string | null
          created_at: string
          id: string
          nominee_id: string | null
          officer_id: string
          program_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          award_type?: string
          awarded_by?: string | null
          awarded_on?: string
          citation?: string | null
          created_at?: string
          id?: string
          nominee_id?: string | null
          officer_id: string
          program_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          award_type?: string
          awarded_by?: string | null
          awarded_on?: string
          citation?: string | null
          created_at?: string
          id?: string
          nominee_id?: string | null
          officer_id?: string
          program_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_recognitions_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_recognitions_nominee_id_fkey"
            columns: ["nominee_id"]
            isOneToOne: false
            referencedRelation: "compliance_award_nominees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_recognitions_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_recognitions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      den_checklist_items: {
        Row: {
          checklist_id: string
          done_at: string | null
          done_by: string | null
          id: string
          label: string
          position: number
        }
        Insert: {
          checklist_id: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          label: string
          position?: number
        }
        Update: {
          checklist_id?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          label?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "den_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "den_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_checklist_items_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      den_checklist_logs: {
        Row: {
          all_passed: boolean
          checks: Json
          id: string
          notes: string | null
          performed_at: string
          performed_by: string | null
          performed_by_name: string | null
          program_id: string | null
          session: string
          theatre_id: string
        }
        Insert: {
          all_passed?: boolean
          checks?: Json
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
          program_id?: string | null
          session: string
          theatre_id: string
        }
        Update: {
          all_passed?: boolean
          checks?: Json
          id?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
          program_id?: string | null
          session?: string
          theatre_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_checklist_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_checklist_logs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_checklist_logs_theatre_id_fkey"
            columns: ["theatre_id"]
            isOneToOne: false
            referencedRelation: "theatres"
            referencedColumns: ["id"]
          },
        ]
      }
      den_checklist_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          items: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          items?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          items?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_checklist_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      den_checklists: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          program_id: string
          template_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          program_id: string
          template_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          program_id?: string
          template_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_checklists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_checklists_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "den_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      den_floor_grants: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          program_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          program_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          program_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_floor_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_floor_grants_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_floor_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      den_guest_notes: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          note: string
          papa_id: string
          program_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          papa_id: string
          program_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          papa_id?: string
          program_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "den_guest_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_guest_notes_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_guest_notes_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_guest_notes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      den_inventory_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          quantity: number
          reorder_level: number
          storage_location: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          quantity?: number
          reorder_level?: number
          storage_location?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          quantity?: number
          reorder_level?: number
          storage_location?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_inventory_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      den_inventory_movements: {
        Row: {
          balance_after: number
          change: number
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          movement_type: string
          note: string | null
          program_id: string | null
        }
        Insert: {
          balance_after: number
          change: number
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          movement_type: string
          note?: string | null
          program_id?: string | null
        }
        Update: {
          balance_after?: number
          change?: number
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          movement_type?: string
          note?: string | null
          program_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "den_inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "den_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_inventory_movements_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      den_inventory_reservations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          program_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          program_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          program_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_inventory_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_inventory_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "den_inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_inventory_reservations_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      den_operations: {
        Row: {
          budget: number | null
          created_at: string
          created_by: string | null
          expected_guests: number | null
          id: string
          program_id: string
          service_notes: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          budget?: number | null
          created_at?: string
          created_by?: string | null
          expected_guests?: number | null
          id?: string
          program_id: string
          service_notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          budget?: number | null
          created_at?: string
          created_by?: string | null
          expected_guests?: number | null
          id?: string
          program_id?: string
          service_notes?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "den_operations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_operations_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_operations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      den_report_media: {
        Row: {
          caption: string | null
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          report_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          report_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          report_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "den_report_media_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "den_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_report_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      den_reports: {
        Row: {
          created_at: string
          created_by: string | null
          guest_feedback: string | null
          id: string
          lessons_learned: string | null
          program_id: string
          recommendations: string | null
          report_type: string
          status: string
          submitted_at: string | null
          summary: string | null
          title: string
          updated_at: string
          what_did_not_go_well: string | null
          what_went_well: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          guest_feedback?: string | null
          id?: string
          lessons_learned?: string | null
          program_id: string
          recommendations?: string | null
          report_type?: string
          status?: string
          submitted_at?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          what_did_not_go_well?: string | null
          what_went_well?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          guest_feedback?: string | null
          id?: string
          lessons_learned?: string | null
          program_id?: string
          recommendations?: string | null
          report_type?: string
          status?: string
          submitted_at?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          what_did_not_go_well?: string | null
          what_went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "den_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_reports_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      den_repository_items: {
        Row: {
          body: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          external_url: string | null
          file_name: string | null
          id: string
          kind: string
          mime_type: string | null
          program_id: string | null
          search: unknown
          size_bytes: number | null
          source_report_id: string | null
          storage_path: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_url?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          program_id?: string | null
          search?: unknown
          size_bytes?: number | null
          source_report_id?: string | null
          storage_path?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          external_url?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          program_id?: string | null
          search?: unknown
          size_bytes?: number | null
          source_report_id?: string | null
          storage_path?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_repository_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_repository_items_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_repository_items_source_report_fkey"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "den_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      den_shift_members: {
        Row: {
          assigned_by: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checked_out_at: string | null
          created_at: string
          id: string
          shift_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          created_at?: string
          id?: string
          shift_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          created_at?: string
          id?: string
          shift_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_shift_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_shift_members_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_shift_members_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "den_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_shift_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      den_shifts: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          nest_id: string | null
          notes: string | null
          officers_needed: number
          program_id: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          nest_id?: string | null
          notes?: string | null
          officers_needed?: number
          program_id: string
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          nest_id?: string | null
          notes?: string | null
          officers_needed?: number
          program_id?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_shifts_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_shifts_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests_with_amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "den_shifts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      den_task_reminders: {
        Row: {
          due_at: string
          kind: string
          sent_at: string
          task_id: string
        }
        Insert: {
          due_at: string
          kind: string
          sent_at?: string
          task_id: string
        }
        Update: {
          due_at?: string
          kind?: string
          sent_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "den_task_reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "unit_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_config: {
        Row: {
          dispatch_secret_id: string
          dispatch_url: string
          private_secret_id: string
          public_key: string
          singleton: boolean
          subject: string
        }
        Insert: {
          dispatch_secret_id: string
          dispatch_url: string
          private_secret_id: string
          public_key: string
          singleton?: boolean
          subject: string
        }
        Update: {
          dispatch_secret_id?: string
          dispatch_url?: string
          private_secret_id?: string
          public_key?: string
          singleton?: boolean
          subject?: string
        }
        Relationships: []
      }
      device_push_subscriptions: {
        Row: {
          auth_key: string
          endpoint: string
          id: string
          p256dh: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_key: string
          endpoint: string
          id?: string
          p256dh: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_key?: string
          endpoint?: string
          id?: string
          p256dh?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      do_feedback_forms: {
        Row: {
          accommodation_notes: string | null
          finance_expenses: string | null
          id: string
          improvements: string | null
          incidents: string | null
          journey_id: string
          logistics_notes: string | null
          monetary_gifts: string | null
          overall_rating: number | null
          principal_wellbeing: string
          submitted_at: string
          submitted_by: string | null
          submitted_by_name: string | null
          team_feedback: string | null
          what_didnt_go_as_plan: string | null
          what_went_well: string | null
        }
        Insert: {
          accommodation_notes?: string | null
          finance_expenses?: string | null
          id?: string
          improvements?: string | null
          incidents?: string | null
          journey_id: string
          logistics_notes?: string | null
          monetary_gifts?: string | null
          overall_rating?: number | null
          principal_wellbeing: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_by_name?: string | null
          team_feedback?: string | null
          what_didnt_go_as_plan?: string | null
          what_went_well?: string | null
        }
        Update: {
          accommodation_notes?: string | null
          finance_expenses?: string | null
          id?: string
          improvements?: string | null
          incidents?: string | null
          journey_id?: string
          logistics_notes?: string | null
          monetary_gifts?: string | null
          overall_rating?: number | null
          principal_wellbeing?: string
          submitted_at?: string
          submitted_by?: string | null
          submitted_by_name?: string | null
          team_feedback?: string | null
          what_didnt_go_as_plan?: string | null
          what_went_well?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "do_feedback_forms_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "do_feedback_forms_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_feedback: {
        Row: {
          cheetah_id: string | null
          cleanliness_rating: number | null
          created_at: string
          driver_id: string | null
          id: string
          journey_id: string
          notes: string | null
          papa_id: string | null
          punctuality_rating: number | null
          rating: number
          reviewer_id: string
          safety_rating: number | null
          status: string
          updated_at: string
        }
        Insert: {
          cheetah_id?: string | null
          cleanliness_rating?: number | null
          created_at?: string
          driver_id?: string | null
          id?: string
          journey_id: string
          notes?: string | null
          papa_id?: string | null
          punctuality_rating?: number | null
          rating: number
          reviewer_id: string
          safety_rating?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          cheetah_id?: string | null
          cleanliness_rating?: number | null
          created_at?: string
          driver_id?: string | null
          id?: string
          journey_id?: string
          notes?: string | null
          papa_id?: string | null
          punctuality_rating?: number | null
          rating?: number
          reviewer_id?: string
          safety_rating?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_feedback_cheetah_id_fkey"
            columns: ["cheetah_id"]
            isOneToOne: false
            referencedRelation: "cheetahs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_feedback_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "tango_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_feedback_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_feedback_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_feedback_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_feedback_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      eagle_squares: {
        Row: {
          city: string
          code: string
          contact: string | null
          country: string
          created_at: string | null
          facilities: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          city: string
          code: string
          contact?: string | null
          country: string
          created_at?: string | null
          facilities?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string
          code?: string
          contact?: string | null
          country?: string
          created_at?: string | null
          facilities?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      eo_checklist_logs: {
        Row: {
          all_passed: boolean
          checks: Json
          id: string
          performed_at: string
          performed_by: string | null
          performed_by_name: string | null
          program_id: string | null
        }
        Insert: {
          all_passed?: boolean
          checks?: Json
          id?: string
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
          program_id?: string | null
        }
        Update: {
          all_passed?: boolean
          checks?: Json
          id?: string
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
          program_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eo_checklist_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eo_checklist_logs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          additional_info: string | null
          assigned_to: string | null
          created_at: string | null
          created_by: string | null
          id: string
          last_checked_at: string | null
          last_checked_by: string | null
          location: string | null
          name: string
          program_id: string | null
          quantity: number | null
          serial_number: string | null
          status: string | null
          subtype: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          additional_info?: string | null
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_checked_at?: string | null
          last_checked_by?: string | null
          location?: string | null
          name: string
          program_id?: string | null
          quantity?: number | null
          serial_number?: string | null
          status?: string | null
          subtype?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          additional_info?: string | null
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_checked_at?: string | null
          last_checked_by?: string | null
          location?: string | null
          name?: string
          program_id?: string | null
          quantity?: number | null
          serial_number?: string | null
          status?: string | null
          subtype?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_last_checked_by_fkey"
            columns: ["last_checked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_logs: {
        Row: {
          action: string
          created_at: string | null
          equipment_id: string
          id: string
          new_status: string | null
          notes: string | null
          performed_by: string | null
          previous_status: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          equipment_id: string
          id?: string
          new_status?: string | null
          notes?: string | null
          performed_by?: string | null
          previous_status?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          equipment_id?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          performed_by?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_documents: {
        Row: {
          category: string
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          notes: string | null
          period: string | null
          program_id: string | null
          storage_path: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          notes?: string | null
          period?: string | null
          program_id?: string | null
          storage_path: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          notes?: string | null
          period?: string | null
          program_id?: string | null
          storage_path?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_documents_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_partners: {
        Row: {
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          partner_type: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          partner_type?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          partner_type?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_itineraries: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          papa_id: string
          program_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          papa_id: string
          program_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          papa_id?: string
          program_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_itineraries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_itineraries_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_itineraries_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_itineraries_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_legs: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          adsb_callsign: string | null
          airline: string | null
          altitude: number | null
          arrival_airport: string | null
          created_at: string
          current_latitude: number | null
          current_longitude: number | null
          departure_airport: string | null
          flight_number: string
          heading: number | null
          icao24: string | null
          id: string
          itinerary_id: string
          last_seen_at: string | null
          leg_order: number
          scheduled_arrival: string | null
          scheduled_departure: string | null
          source: string
          status: string
          telemetry_confidence: string
          telemetry_source: string | null
          updated_at: string
          velocity: number | null
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          adsb_callsign?: string | null
          airline?: string | null
          altitude?: number | null
          arrival_airport?: string | null
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          departure_airport?: string | null
          flight_number: string
          heading?: number | null
          icao24?: string | null
          id?: string
          itinerary_id: string
          last_seen_at?: string | null
          leg_order?: number
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          source?: string
          status?: string
          telemetry_confidence?: string
          telemetry_source?: string | null
          updated_at?: string
          velocity?: number | null
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          adsb_callsign?: string | null
          airline?: string | null
          altitude?: number | null
          arrival_airport?: string | null
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          departure_airport?: string | null
          flight_number?: string
          heading?: number | null
          icao24?: string | null
          id?: string
          itinerary_id?: string
          last_seen_at?: string | null
          leg_order?: number
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          source?: string
          status?: string
          telemetry_confidence?: string
          telemetry_source?: string | null
          updated_at?: string
          velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_legs_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "flight_itineraries"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_tracking: {
        Row: {
          actual_departure: string | null
          airline: string | null
          altitude: number | null
          arrival_airport: string | null
          arrival_airport_id: string | null
          callsign: string | null
          created_at: string | null
          current_latitude: number | null
          current_longitude: number | null
          departure_airport: string | null
          departure_airport_id: string | null
          estimated_arrival: string | null
          flight_id: string
          flight_number: string
          heading: number | null
          icao24: string | null
          id: string
          last_updated: string | null
          origin_country: string | null
          papa_id: string | null
          scheduled_arrival: string | null
          scheduled_departure: string | null
          status: string | null
          tail_number: string | null
          updated_at: string | null
          velocity: number | null
        }
        Insert: {
          actual_departure?: string | null
          airline?: string | null
          altitude?: number | null
          arrival_airport?: string | null
          arrival_airport_id?: string | null
          callsign?: string | null
          created_at?: string | null
          current_latitude?: number | null
          current_longitude?: number | null
          departure_airport?: string | null
          departure_airport_id?: string | null
          estimated_arrival?: string | null
          flight_id: string
          flight_number: string
          heading?: number | null
          icao24?: string | null
          id?: string
          last_updated?: string | null
          origin_country?: string | null
          papa_id?: string | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          status?: string | null
          tail_number?: string | null
          updated_at?: string | null
          velocity?: number | null
        }
        Update: {
          actual_departure?: string | null
          airline?: string | null
          altitude?: number | null
          arrival_airport?: string | null
          arrival_airport_id?: string | null
          callsign?: string | null
          created_at?: string | null
          current_latitude?: number | null
          current_longitude?: number | null
          departure_airport?: string | null
          departure_airport_id?: string | null
          estimated_arrival?: string | null
          flight_id?: string
          flight_number?: string
          heading?: number | null
          icao24?: string | null
          id?: string
          last_updated?: string | null
          origin_country?: string | null
          papa_id?: string | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          status?: string | null
          tail_number?: string | null
          updated_at?: string | null
          velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_tracking_arrival_airport_id_fkey"
            columns: ["arrival_airport_id"]
            isOneToOne: false
            referencedRelation: "eagle_squares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_tracking_arrival_airport_id_fkey"
            columns: ["arrival_airport_id"]
            isOneToOne: false
            referencedRelation: "eagle_squares_with_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_tracking_departure_airport_id_fkey"
            columns: ["departure_airport_id"]
            isOneToOne: false
            referencedRelation: "eagle_squares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_tracking_departure_airport_id_fkey"
            columns: ["departure_airport_id"]
            isOneToOne: false
            referencedRelation: "eagle_squares_with_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_tracking_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_tracking_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_places: {
        Row: {
          address: string | null
          category: string
          city: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_paths: Json
          latitude: number | null
          longitude: number | null
          name: string
          tips: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_paths?: Json
          latitude?: number | null
          longitude?: number | null
          name: string
          tips?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_paths?: Json
          latitude?: number | null
          longitude?: number | null
          name?: string
          tips?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_places_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          journey_id: string | null
          latitude: number | null
          longitude: number | null
          program_id: string | null
          reported_at: string | null
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          status: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          journey_id?: string | null
          latitude?: number | null
          longitude?: number | null
          program_id?: string | null
          reported_at?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          status?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          journey_id?: string | null
          latitude?: number | null
          longitude?: number | null
          program_id?: string | null
          reported_at?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_assignments: {
        Row: {
          accepted_at: string | null
          assigned_at: string
          id: string
          is_lead: boolean
          journey_id: string
          notes: string | null
          officer_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string
          id?: string
          is_lead?: boolean
          journey_id: string
          notes?: string | null
          officer_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string
          id?: string
          is_lead?: boolean
          journey_id?: string
          notes?: string | null
          officer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_assignments_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_assignments_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_cheetahs: {
        Row: {
          assigned_by: string | null
          assignment_role: string
          cheetah_id: string
          created_at: string
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          id: string
          journey_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assignment_role?: string
          cheetah_id: string
          created_at?: string
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          journey_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assignment_role?: string
          cheetah_id?: string
          created_at?: string
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          journey_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_cheetahs_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_cheetahs_cheetah_id_fkey"
            columns: ["cheetah_id"]
            isOneToOne: false
            referencedRelation: "cheetahs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_cheetahs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "tango_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_cheetahs_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_duty_officers: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          id: string
          is_lead: boolean
          journey_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          is_lead?: boolean
          journey_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          is_lead?: boolean
          journey_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_duty_officers_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_duty_officers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_events: {
        Row: {
          created_at: string | null
          description: string | null
          event_type: Database["public"]["Enums"]["call_sign"]
          id: string
          journey_id: string
          latitude: number | null
          longitude: number | null
          metadata: Json | null
          notes: string | null
          triggered_at: string | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_type: Database["public"]["Enums"]["call_sign"]
          id?: string
          journey_id: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          notes?: string | null
          triggered_at?: string | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_type?: Database["public"]["Enums"]["call_sign"]
          id?: string
          journey_id?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          notes?: string | null
          triggered_at?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_events_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_events_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_locations: {
        Row: {
          accuracy: number | null
          created_at: string | null
          id: string
          journey_id: string
          latitude: number
          longitude: number
        }
        Insert: {
          accuracy?: number | null
          created_at?: string | null
          id?: string
          journey_id: string
          latitude: number
          longitude: number
        }
        Update: {
          accuracy?: number | null
          created_at?: string | null
          id?: string
          journey_id?: string
          latitude?: number
          longitude?: number
        }
        Relationships: [
          {
            foreignKeyName: "journey_locations_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_papas: {
        Row: {
          created_at: string | null
          is_primary: boolean | null
          journey_id: string
          papa_id: string
        }
        Insert: {
          created_at?: string | null
          is_primary?: boolean | null
          journey_id: string
          papa_id: string
        }
        Update: {
          created_at?: string | null
          is_primary?: boolean | null
          journey_id?: string
          papa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_papas_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_papas_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_papas_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_status_updates: {
        Row: {
          created_at: string | null
          id: string
          journey_id: string
          notes: string | null
          status: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          journey_id: string
          notes?: string | null
          status: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          journey_id?: string
          notes?: string | null
          status?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_status_updates_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      journeys: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          assigned_cheetah_id: string | null
          assigned_do_id: string | null
          assigned_duty_officer_id: string | null
          assigned_eagle_square_id: string | null
          assigned_nest_id: string | null
          assigned_theatre_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          current_call_sign: Database["public"]["Enums"]["call_sign"] | null
          current_status: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          destination: string | null
          do_completion_reason: string | null
          do_return_destination: string | null
          end_date: string | null
          eta: string | null
          etd: string | null
          id: string
          is_deleted: boolean
          journey_type: string
          last_latitude: number | null
          last_location_update: string | null
          last_longitude: number | null
          name: string | null
          notes: string | null
          origin: string | null
          papa_id: string | null
          program_id: string | null
          route_geojson: Json | null
          scheduled_arrival: string | null
          scheduled_departure: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["journey_status"] | null
          status_updated_at: string | null
          telemetry_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_cheetah_id?: string | null
          assigned_do_id?: string | null
          assigned_duty_officer_id?: string | null
          assigned_eagle_square_id?: string | null
          assigned_nest_id?: string | null
          assigned_theatre_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          current_call_sign?: Database["public"]["Enums"]["call_sign"] | null
          current_status?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          destination?: string | null
          do_completion_reason?: string | null
          do_return_destination?: string | null
          end_date?: string | null
          eta?: string | null
          etd?: string | null
          id?: string
          is_deleted?: boolean
          journey_type?: string
          last_latitude?: number | null
          last_location_update?: string | null
          last_longitude?: number | null
          name?: string | null
          notes?: string | null
          origin?: string | null
          papa_id?: string | null
          program_id?: string | null
          route_geojson?: Json | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["journey_status"] | null
          status_updated_at?: string | null
          telemetry_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_cheetah_id?: string | null
          assigned_do_id?: string | null
          assigned_duty_officer_id?: string | null
          assigned_eagle_square_id?: string | null
          assigned_nest_id?: string | null
          assigned_theatre_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          current_call_sign?: Database["public"]["Enums"]["call_sign"] | null
          current_status?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          destination?: string | null
          do_completion_reason?: string | null
          do_return_destination?: string | null
          end_date?: string | null
          eta?: string | null
          etd?: string | null
          id?: string
          is_deleted?: boolean
          journey_type?: string
          last_latitude?: number | null
          last_location_update?: string | null
          last_longitude?: number | null
          name?: string | null
          notes?: string | null
          origin?: string | null
          papa_id?: string | null
          program_id?: string | null
          route_geojson?: Json | null
          scheduled_arrival?: string | null
          scheduled_departure?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["journey_status"] | null
          status_updated_at?: string | null
          telemetry_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journeys_assigned_cheetah_id_fkey"
            columns: ["assigned_cheetah_id"]
            isOneToOne: false
            referencedRelation: "cheetahs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_assigned_do_id_fkey"
            columns: ["assigned_do_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_assigned_duty_officer_id_fkey"
            columns: ["assigned_duty_officer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_assigned_eagle_square_id_fkey"
            columns: ["assigned_eagle_square_id"]
            isOneToOne: false
            referencedRelation: "eagle_squares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_assigned_eagle_square_id_fkey"
            columns: ["assigned_eagle_square_id"]
            isOneToOne: false
            referencedRelation: "eagle_squares_with_flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_assigned_nest_id_fkey"
            columns: ["assigned_nest_id"]
            isOneToOne: false
            referencedRelation: "nests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_assigned_nest_id_fkey"
            columns: ["assigned_nest_id"]
            isOneToOne: false
            referencedRelation: "nests_with_amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_assigned_theatre_id_fkey"
            columns: ["assigned_theatre_id"]
            isOneToOne: false
            referencedRelation: "theatres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journeys_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          caption: string | null
          category: string
          created_at: string
          id: string
          instagram_url: string | null
          media_type: string
          papa_id: string | null
          program_id: string | null
          status: string
          storage_path: string
          taken_at: string | null
          title: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          category?: string
          created_at?: string
          id?: string
          instagram_url?: string | null
          media_type?: string
          papa_id?: string | null
          program_id?: string | null
          status?: string
          storage_path: string
          taken_at?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          caption?: string | null
          category?: string
          created_at?: string
          id?: string
          instagram_url?: string | null
          media_type?: string
          papa_id?: string | null
          program_id?: string | null
          status?: string
          storage_path?: string
          taken_at?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_request_recipients: {
        Row: {
          request_id: string
          user_id: string
        }
        Insert: {
          request_id: string
          user_id: string
        }
        Update: {
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_request_recipients_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mission_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_request_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_requests: {
        Row: {
          audience: string | null
          created_at: string
          created_by: string | null
          deadline: string
          id: string
          message: string | null
          program_id: string
          status: string
          title: string
        }
        Insert: {
          audience?: string | null
          created_at?: string
          created_by?: string | null
          deadline: string
          id?: string
          message?: string | null
          program_id: string
          status?: string
          title: string
        }
        Update: {
          audience?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string
          id?: string
          message?: string | null
          program_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_requests_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_responses: {
        Row: {
          id: string
          note: string | null
          request_id: string
          responded_at: string
          response: string
          user_id: string
        }
        Insert: {
          id?: string
          note?: string | null
          request_id: string
          responded_at?: string
          response: string
          user_id: string
        }
        Update: {
          id?: string
          note?: string | null
          request_id?: string
          responded_at?: string
          response?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mission_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nest_amenities: {
        Row: {
          amenity: string
          created_at: string
          id: string
          nest_id: string
          updated_at: string
        }
        Insert: {
          amenity: string
          created_at?: string
          id?: string
          nest_id: string
          updated_at?: string
        }
        Update: {
          amenity?: string
          created_at?: string
          id?: string
          nest_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nest_amenities_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_amenities_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests_with_amenities"
            referencedColumns: ["id"]
          },
        ]
      }
      nest_comfort_logs: {
        Row: {
          all_passed: boolean
          checks: Json
          id: string
          nest_id: string
          performed_at: string
          performed_by: string | null
          performed_by_name: string | null
        }
        Insert: {
          all_passed?: boolean
          checks?: Json
          id?: string
          nest_id: string
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Update: {
          all_passed?: boolean
          checks?: Json
          id?: string
          nest_id?: string
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nest_comfort_logs_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_comfort_logs_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests_with_amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_comfort_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nest_room_guests: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_primary: boolean
          relationship: string | null
          stay_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_primary?: boolean
          relationship?: string | null
          stay_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_primary?: boolean
          relationship?: string | null
          stay_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nest_room_guests_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "nest_room_stays"
            referencedColumns: ["id"]
          },
        ]
      }
      nest_room_inspections: {
        Row: {
          assigned_to: string | null
          checklist: Json
          created_at: string
          due_at: string | null
          id: string
          inspected_at: string | null
          inspected_by: string | null
          notes: string | null
          room_id: string
          status: string
          stay_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          checklist?: Json
          created_at?: string
          due_at?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          notes?: string | null
          room_id: string
          status?: string
          stay_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          checklist?: Json
          created_at?: string
          due_at?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          notes?: string | null
          room_id?: string
          status?: string
          stay_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nest_room_inspections_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_inspections_inspected_by_fkey"
            columns: ["inspected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_inspections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "nest_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_inspections_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "nest_room_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_inspections_stay_room_fkey"
            columns: ["stay_id", "room_id"]
            isOneToOne: false
            referencedRelation: "nest_room_stays"
            referencedColumns: ["id", "room_id"]
          },
        ]
      }
      nest_room_issues: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          id: string
          next_use_blocked: boolean
          reported_by: string | null
          resolution_notes: string | null
          resolved_at: string | null
          room_id: string
          severity: string
          status: string
          stay_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          next_use_blocked?: boolean
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          room_id: string
          severity?: string
          status?: string
          stay_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          next_use_blocked?: boolean
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          room_id?: string
          severity?: string
          status?: string
          stay_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nest_room_issues_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_issues_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_issues_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "nest_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_issues_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "nest_room_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_issues_stay_room_fkey"
            columns: ["stay_id", "room_id"]
            isOneToOne: false
            referencedRelation: "nest_room_stays"
            referencedColumns: ["id", "room_id"]
          },
        ]
      }
      nest_room_items: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          item_name: string
          notes: string | null
          photo_path: string | null
          quantity: number
          room_id: string
          status: string
          stay_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_name: string
          notes?: string | null
          photo_path?: string | null
          quantity?: number
          room_id: string
          status?: string
          stay_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          photo_path?: string | null
          quantity?: number
          room_id?: string
          status?: string
          stay_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nest_room_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "nest_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_items_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "nest_room_stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_items_stay_room_fkey"
            columns: ["stay_id", "room_id"]
            isOneToOne: false
            referencedRelation: "nest_room_stays"
            referencedColumns: ["id", "room_id"]
          },
        ]
      }
      nest_room_stays: {
        Row: {
          actual_check_in: string | null
          actual_check_out: string | null
          assigned_by: string | null
          created_at: string
          id: string
          papa_id: string | null
          planned_check_in: string | null
          planned_check_out: string | null
          program_id: string | null
          room_id: string
          special_requests: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          assigned_by?: string | null
          created_at?: string
          id?: string
          papa_id?: string | null
          planned_check_in?: string | null
          planned_check_out?: string | null
          program_id?: string | null
          room_id: string
          special_requests?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          assigned_by?: string | null
          created_at?: string
          id?: string
          papa_id?: string | null
          planned_check_in?: string | null
          planned_check_out?: string | null
          program_id?: string | null
          room_id?: string
          special_requests?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nest_room_stays_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_stays_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_stays_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_stays_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_room_stays_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "nest_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      nest_rooms: {
        Row: {
          created_at: string
          created_by: string | null
          floor: string | null
          id: string
          name: string | null
          nest_id: string
          notes: string | null
          room_number: string
          room_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          floor?: string | null
          id?: string
          name?: string | null
          nest_id: string
          notes?: string | null
          room_number: string
          room_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          floor?: string | null
          id?: string
          name?: string | null
          nest_id?: string
          notes?: string | null
          room_number?: string
          room_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nest_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_rooms_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nest_rooms_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests_with_amenities"
            referencedColumns: ["id"]
          },
        ]
      }
      nests: {
        Row: {
          address: string
          amenities: string | null
          check_in_time: string | null
          check_out_time: string | null
          city: string | null
          contact: string | null
          created_at: string | null
          email: string | null
          facilities: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          program_id: string | null
          rating: number | null
          room_assignments: Json | null
          type: Database["public"]["Enums"]["nest_type"] | null
          updated_at: string | null
        }
        Insert: {
          address: string
          amenities?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          city?: string | null
          contact?: string | null
          created_at?: string | null
          email?: string | null
          facilities?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          program_id?: string | null
          rating?: number | null
          room_assignments?: Json | null
          type?: Database["public"]["Enums"]["nest_type"] | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          amenities?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          city?: string | null
          contact?: string | null
          created_at?: string | null
          email?: string | null
          facilities?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          program_id?: string | null
          rating?: number | null
          room_assignments?: Json | null
          type?: Database["public"]["Enums"]["nest_type"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nests_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      noscar_assignments: {
        Row: {
          assigned_date: string | null
          assignment_type: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          nest_id: string | null
          notes: string | null
          program_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_date?: string | null
          assignment_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          nest_id?: string | null
          notes?: string | null
          program_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_date?: string | null
          assignment_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          nest_id?: string | null
          notes?: string | null
          program_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "noscar_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noscar_assignments_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noscar_assignments_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests_with_amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noscar_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "noscar_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_push_outbox: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          delivered_at: string | null
          failed_at: string | null
          id: string
          last_error: string | null
          lease_id: string | null
          locked_until: string | null
          notification_id: string
          subscription_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          delivered_at?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          lease_id?: string | null
          locked_until?: string | null
          notification_id: string
          subscription_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          delivered_at?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          lease_id?: string | null
          locked_until?: string | null
          notification_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_push_outbox_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "device_push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body: string
          channels: Database["public"]["Enums"]["notification_channel"][]
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          title: string
          updated_at: string | null
          variables: string[] | null
        }
        Insert: {
          body: string
          channels: Database["public"]["Enums"]["notification_channel"][]
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          title: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Update: {
          body?: string
          channels?: Database["public"]["Enums"]["notification_channel"][]
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          title?: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string | null
          delivered_at: string | null
          id: string
          is_read: boolean | null
          journey_id: string | null
          message: string
          metadata: Json | null
          read_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"] | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          is_read?: boolean | null
          journey_id?: string | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"] | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          is_read?: boolean | null
          journey_id?: string | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"] | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      official_titles: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_fixed: boolean | null
          is_team_lead: boolean | null
          max_positions: number | null
          name: string
          unit: string
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_fixed?: boolean | null
          is_team_lead?: boolean | null
          max_positions?: number | null
          name: string
          unit: string
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_fixed?: boolean | null
          is_team_lead?: boolean | null
          max_positions?: number | null
          name?: string
          unit?: string
        }
        Relationships: []
      }
      operational_post_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignment_role: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_role?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_role?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_post_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_post_assignments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "operational_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_post_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_posts: {
        Row: {
          capacity: number
          code: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          label: string
          notes: string | null
          program_venue_id: string
          starts_at: string | null
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          code: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          label: string
          notes?: string | null
          program_venue_id: string
          starts_at?: string | null
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          code?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          label?: string
          notes?: string | null
          program_venue_id?: string
          starts_at?: string | null
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_posts_program_venue_id_fkey"
            columns: ["program_venue_id"]
            isOneToOne: false
            referencedRelation: "program_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_posts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      oscar_documents: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          doc_type: Database["public"]["Enums"]["document_type"]
          id: string
          managed_by_training: boolean
          oscar: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          doc_type: Database["public"]["Enums"]["document_type"]
          id?: string
          managed_by_training?: boolean
          oscar: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          managed_by_training?: boolean
          oscar?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      papa_accommodations: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          created_by: string | null
          distance_km: number | null
          hotel_name: string
          id: string
          location: string | null
          nest_id: string | null
          notes: string | null
          papa_id: string
          program_id: string | null
          room_info: string | null
          travel_duration_mins: number | null
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          distance_km?: number | null
          hotel_name: string
          id?: string
          location?: string | null
          nest_id?: string | null
          notes?: string | null
          papa_id: string
          program_id?: string | null
          room_info?: string | null
          travel_duration_mins?: number | null
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          distance_km?: number | null
          hotel_name?: string
          id?: string
          location?: string | null
          nest_id?: string | null
          notes?: string | null
          papa_id?: string
          program_id?: string | null
          room_info?: string | null
          travel_duration_mins?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "papa_accommodations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_accommodations_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_accommodations_nest_id_fkey"
            columns: ["nest_id"]
            isOneToOne: false
            referencedRelation: "nests_with_amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_accommodations_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_accommodations_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_accommodations_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      papa_book_batches: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          id: string
          isbn: string | null
          notes: string | null
          papa_id: string
          program_id: string | null
          quantity_received: number
          title: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          isbn?: string | null
          notes?: string | null
          papa_id: string
          program_id?: string | null
          quantity_received: number
          title: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          isbn?: string | null
          notes?: string | null
          papa_id?: string
          program_id?: string | null
          quantity_received?: number
          title?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "papa_book_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_book_batches_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_book_batches_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_book_batches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      papa_book_movements: {
        Row: {
          amount: number | null
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          notes: string | null
          quantity: number
        }
        Insert: {
          amount?: number | null
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          quantity: number
        }
        Update: {
          amount?: number | null
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "papa_book_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "papa_book_balances"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "papa_book_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "papa_book_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_book_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      papa_book_settlements: {
        Row: {
          amount: number
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string | null
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "papa_book_settlements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "papa_book_balances"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "papa_book_settlements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "papa_book_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_book_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      papa_entourage_members: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          papa_id: string
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          papa_id: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          papa_id?: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "papa_entourage_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_entourage_members_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_entourage_members_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      papa_meal_orders: {
        Row: {
          created_at: string
          id: string
          meal_type: string
          menu_id: string | null
          note: string | null
          order_date: string
          papa_id: string
          program_id: string | null
          selected_items: Json
          status: string
          taken_at: string | null
          taken_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          meal_type?: string
          menu_id?: string | null
          note?: string | null
          order_date?: string
          papa_id: string
          program_id?: string | null
          selected_items?: Json
          status?: string
          taken_at?: string | null
          taken_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          meal_type?: string
          menu_id?: string | null
          note?: string | null
          order_date?: string
          papa_id?: string
          program_id?: string | null
          selected_items?: Json
          status?: string
          taken_at?: string | null
          taken_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "papa_meal_orders_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "program_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_meal_orders_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_meal_orders_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_meal_orders_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_meal_orders_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      papa_private_details: {
        Row: {
          papa_id: string
          passport_country: string | null
          passport_expiry: string | null
          passport_number: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          papa_id: string
          passport_country?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          papa_id?: string
          passport_country?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "papa_private_details_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: true
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_private_details_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: true
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_private_details_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      papas: {
        Row: {
          accommodation_preferences: string | null
          accommodations: string | null
          additional_notes: string | null
          airline: string | null
          arrival_city: string | null
          arrival_country: string | null
          arrival_date: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          departure_date: string | null
          dietary_restrictions: string | null
          email: string | null
          entourage_count: number | null
          entourage_size: number | null
          flight_arrival_time: string | null
          flight_departure_time: string | null
          flight_number: string | null
          flight_provider: string | null
          food_preferences: string | null
          full_name: string
          has_slides: boolean | null
          id: string
          is_deleted: boolean
          is_first_time: boolean | null
          mic_preference: string | null
          nationality: string | null
          needs: Json | null
          needs_clicker: boolean
          needs_face_towels: boolean | null
          needs_water_on_stage: boolean | null
          notes: string | null
          organization: string | null
          past_invites_count: number | null
          personal_assistants: Json | null
          phone: string | null
          position: string | null
          presentation_style: string | null
          profile_photo_url: string | null
          program_id: string | null
          short_bio: string | null
          speaking_schedule: Json | null
          special_requirements: string | null
          stage_props_details: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          uses_stage_props: boolean | null
          vip_level: string | null
          water_temperature: string | null
        }
        Insert: {
          accommodation_preferences?: string | null
          accommodations?: string | null
          additional_notes?: string | null
          airline?: string | null
          arrival_city?: string | null
          arrival_country?: string | null
          arrival_date?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          departure_date?: string | null
          dietary_restrictions?: string | null
          email?: string | null
          entourage_count?: number | null
          entourage_size?: number | null
          flight_arrival_time?: string | null
          flight_departure_time?: string | null
          flight_number?: string | null
          flight_provider?: string | null
          food_preferences?: string | null
          full_name: string
          has_slides?: boolean | null
          id?: string
          is_deleted?: boolean
          is_first_time?: boolean | null
          mic_preference?: string | null
          nationality?: string | null
          needs?: Json | null
          needs_clicker?: boolean
          needs_face_towels?: boolean | null
          needs_water_on_stage?: boolean | null
          notes?: string | null
          organization?: string | null
          past_invites_count?: number | null
          personal_assistants?: Json | null
          phone?: string | null
          position?: string | null
          presentation_style?: string | null
          profile_photo_url?: string | null
          program_id?: string | null
          short_bio?: string | null
          speaking_schedule?: Json | null
          special_requirements?: string | null
          stage_props_details?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          uses_stage_props?: boolean | null
          vip_level?: string | null
          water_temperature?: string | null
        }
        Update: {
          accommodation_preferences?: string | null
          accommodations?: string | null
          additional_notes?: string | null
          airline?: string | null
          arrival_city?: string | null
          arrival_country?: string | null
          arrival_date?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          departure_date?: string | null
          dietary_restrictions?: string | null
          email?: string | null
          entourage_count?: number | null
          entourage_size?: number | null
          flight_arrival_time?: string | null
          flight_departure_time?: string | null
          flight_number?: string | null
          flight_provider?: string | null
          food_preferences?: string | null
          full_name?: string
          has_slides?: boolean | null
          id?: string
          is_deleted?: boolean
          is_first_time?: boolean | null
          mic_preference?: string | null
          nationality?: string | null
          needs?: Json | null
          needs_clicker?: boolean
          needs_face_towels?: boolean | null
          needs_water_on_stage?: boolean | null
          notes?: string | null
          organization?: string | null
          past_invites_count?: number | null
          personal_assistants?: Json | null
          phone?: string | null
          position?: string | null
          presentation_style?: string | null
          profile_photo_url?: string | null
          program_id?: string | null
          short_bio?: string | null
          speaking_schedule?: Json | null
          special_requirements?: string | null
          stage_props_details?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          uses_stage_props?: boolean | null
          vip_level?: string | null
          water_temperature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "papas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papas_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papas_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          ip_address: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_at: string
          reset_token: string
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          reset_token: string
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          reset_token?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "password_reset_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "password_reset_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          kind: string
          program_id: string | null
          starts_at: string
          status: string
          timezone: string
          title: string
          training_schedule_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          kind?: string
          program_id?: string | null
          starts_at: string
          status?: string
          timezone?: string
          title: string
          training_schedule_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          kind?: string
          program_id?: string | null
          starts_at?: string
          status?: string
          timezone?: string
          title?: string
          training_schedule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_campaigns_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_campaigns_training_schedule_id_fkey"
            columns: ["training_schedule_id"]
            isOneToOne: false
            referencedRelation: "training_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_slot_members: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          slot_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          slot_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          slot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_slot_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_slot_members_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "prayer_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_slot_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_slots: {
        Row: {
          campaign_id: string
          created_at: string
          end_at: string
          id: string
          label: string
          notes: string | null
          start_at: string
          status: string
          subject_user_id: string | null
          team_name: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          end_at: string
          id?: string
          label: string
          notes?: string | null
          start_at: string
          status?: string
          subject_user_id?: string | null
          team_name?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          end_at?: string
          id?: string
          label?: string
          notes?: string | null
          start_at?: string
          status?: string
          subject_user_id?: string | null
          team_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_slots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "prayer_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_slots_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      presentation_assets: {
        Row: {
          created_at: string
          file_size: number | null
          id: string
          mime_type: string | null
          original_name: string
          papa_id: string
          program_id: string | null
          storage_path: string
          title: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name: string
          papa_id: string
          program_id?: string | null
          storage_path: string
          title: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_name?: string
          papa_id?: string
          program_id?: string | null
          storage_path?: string
          title?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "presentation_assets_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentation_assets_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentation_assets_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presentation_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      program_addition_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          had_availability: boolean
          id: string
          program_id: string
          reason: string | null
          requested_by: string | null
          status: string
          title_code: string
          unit_slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          had_availability?: boolean
          id?: string
          program_id: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          title_code: string
          unit_slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          had_availability?: boolean
          id?: string
          program_id?: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          title_code?: string
          unit_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_addition_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_addition_requests_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_addition_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_addition_requests_unit_slug_fkey"
            columns: ["unit_slug"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "program_addition_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      program_days: {
        Row: {
          created_at: string | null
          date: string
          id: string
          program_id: string | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          program_id?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          program_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_exports: {
        Row: {
          created_at: string | null
          export_data: Json
          exported_by: string
          file_url: string | null
          id: string
          program_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          export_data: Json
          exported_by: string
          file_url?: string | null
          id?: string
          program_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          export_data?: Json
          exported_by?: string
          file_url?: string | null
          id?: string
          program_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_exports_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_exports_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_menus: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_menu_of_day: boolean
          items: Json
          meal_type: string
          menu_date: string
          notes: string | null
          program_id: string | null
          title: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_menu_of_day?: boolean
          items?: Json
          meal_type?: string
          menu_date?: string
          notes?: string | null
          program_id?: string | null
          title: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_menu_of_day?: boolean
          items?: Json
          meal_type?: string
          menu_date?: string
          notes?: string | null
          program_id?: string | null
          title?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_menus_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_menus_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_menus_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      program_senior_ministers: {
        Row: {
          accreditation_status: string
          added_by: string | null
          arrival_status: string
          badge_number: string | null
          created_at: string
          id: string
          notes: string | null
          papa_id: string | null
          program_id: string
          seat_label: string | null
          senior_minister_id: string
          theatre_id: string | null
          updated_at: string
        }
        Insert: {
          accreditation_status?: string
          added_by?: string | null
          arrival_status?: string
          badge_number?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          papa_id?: string | null
          program_id: string
          seat_label?: string | null
          senior_minister_id: string
          theatre_id?: string | null
          updated_at?: string
        }
        Update: {
          accreditation_status?: string
          added_by?: string | null
          arrival_status?: string
          badge_number?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          papa_id?: string | null
          program_id?: string
          seat_label?: string | null
          senior_minister_id?: string
          theatre_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_senior_ministers_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_senior_ministers_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_senior_ministers_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_senior_ministers_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_senior_ministers_senior_minister_id_fkey"
            columns: ["senior_minister_id"]
            isOneToOne: false
            referencedRelation: "senior_ministers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_senior_ministers_theatre_id_fkey"
            columns: ["theatre_id"]
            isOneToOne: false
            referencedRelation: "theatres"
            referencedColumns: ["id"]
          },
        ]
      }
      program_sessions: {
        Row: {
          created_at: string | null
          day_id: string | null
          description: string | null
          end_time: string
          id: string
          session_type: Database["public"]["Enums"]["session_type"] | null
          start_time: string
          title: string
          venue: string | null
        }
        Insert: {
          created_at?: string | null
          day_id?: string | null
          description?: string | null
          end_time: string
          id?: string
          session_type?: Database["public"]["Enums"]["session_type"] | null
          start_time: string
          title: string
          venue?: string | null
        }
        Update: {
          created_at?: string | null
          day_id?: string | null
          description?: string | null
          end_time?: string
          id?: string
          session_type?: Database["public"]["Enums"]["session_type"] | null
          start_time?: string
          title?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_sessions_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      program_venues: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_primary: boolean
          label: string
          program_id: string
          starts_at: string | null
          status: string
          theatre_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_primary?: boolean
          label: string
          program_id: string
          starts_at?: string | null
          status?: string
          theatre_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_primary?: boolean
          label?: string
          program_id?: string
          starts_at?: string | null
          status?: string
          theatre_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_venues_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_venues_theatre_id_fkey"
            columns: ["theatre_id"]
            isOneToOne: false
            referencedRelation: "theatres"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          budget: number | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string
          status: string
          theatre_id: string | null
          updated_at: string | null
        }
        Insert: {
          budget?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date: string
          status?: string
          theatre_id?: string | null
          updated_at?: string | null
        }
        Update: {
          budget?: number | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string
          status?: string
          theatre_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_theatre_id_fkey"
            columns: ["theatre_id"]
            isOneToOne: false
            referencedRelation: "theatres"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_officer_locations: {
        Row: {
          accuracy: number | null
          altitude: number | null
          battery_level: number | null
          created_at: string | null
          heading: number | null
          id: string
          is_online: boolean | null
          latitude: number
          longitude: number
          speed: number | null
          timestamp: string | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          created_at?: string | null
          heading?: number | null
          id?: string
          is_online?: boolean | null
          latitude: number
          longitude: number
          speed?: number | null
          timestamp?: string | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          created_at?: string | null
          heading?: number | null
          id?: string
          is_online?: boolean | null
          latitude?: number
          longitude?: number
          speed?: number | null
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_officer_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          name: Database["public"]["Enums"]["user_role"]
          permissions: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          name: Database["public"]["Enums"]["user_role"]
          permissions?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          name?: Database["public"]["Enums"]["user_role"]
          permissions?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      seat_arrangements: {
        Row: {
          arrangement_date: string
          created_at: string
          created_by: string | null
          id: string
          layout: Json
          notes: string | null
          program_id: string
          publication_status: string
          published_at: string | null
          published_by: string | null
          session_name: string
          session_order: number
          theatre_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          arrangement_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          layout?: Json
          notes?: string | null
          program_id: string
          publication_status?: string
          published_at?: string | null
          published_by?: string | null
          session_name: string
          session_order?: number
          theatre_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          arrangement_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          layout?: Json
          notes?: string | null
          program_id?: string
          publication_status?: string
          published_at?: string | null
          published_by?: string | null
          session_name?: string
          session_order?: number
          theatre_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "seat_arrangements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_arrangements_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_arrangements_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_arrangements_theatre_id_fkey"
            columns: ["theatre_id"]
            isOneToOne: false
            referencedRelation: "theatres"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_assignments: {
        Row: {
          arrangement_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          occupant_name: string | null
          papa_id: string | null
          row_label: string
          seat_label: string
          senior_minister_id: string | null
          updated_at: string
        }
        Insert: {
          arrangement_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          occupant_name?: string | null
          papa_id?: string | null
          row_label: string
          seat_label: string
          senior_minister_id?: string | null
          updated_at?: string
        }
        Update: {
          arrangement_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          occupant_name?: string | null
          papa_id?: string | null
          row_label?: string
          seat_label?: string
          senior_minister_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_assignments_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "seat_arrangements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_assignments_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_assignments_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_assignments_senior_minister_id_fkey"
            columns: ["senior_minister_id"]
            isOneToOne: false
            referencedRelation: "senior_ministers"
            referencedColumns: ["id"]
          },
        ]
      }
      senior_ministers: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          organization: string | null
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          organization?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          organization?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "senior_ministers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_speakers: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          id: string
          is_keynote: boolean | null
          papa_id: string | null
          session_id: string | null
          time_slot: string | null
          topic: string | null
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_keynote?: boolean | null
          papa_id?: string | null
          session_id?: string | null
          time_slot?: string | null
          topic?: string | null
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_keynote?: boolean | null
          papa_id?: string | null
          session_id?: string | null
          time_slot?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_speakers_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_speakers_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_speakers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          address: string | null
          auto_assign_vehicles: boolean | null
          created_at: string | null
          date_format: string | null
          default_journey_duration: number | null
          default_map_center_lat: number | null
          default_map_center_lng: number | null
          default_map_zoom: number | null
          email_notifications: boolean | null
          enable_offline_mode: boolean | null
          id: string
          language: string | null
          location_update_interval: number | null
          map_provider: string | null
          notification_sound: boolean | null
          organization_email: string | null
          organization_logo: string | null
          organization_name: string | null
          organization_phone: string | null
          password_expiry_days: number | null
          push_notifications: boolean | null
          require_2fa: boolean | null
          require_journey_approval: boolean | null
          session_timeout: number | null
          sms_notifications: boolean | null
          theme: string | null
          time_format: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          auto_assign_vehicles?: boolean | null
          created_at?: string | null
          date_format?: string | null
          default_journey_duration?: number | null
          default_map_center_lat?: number | null
          default_map_center_lng?: number | null
          default_map_zoom?: number | null
          email_notifications?: boolean | null
          enable_offline_mode?: boolean | null
          id?: string
          language?: string | null
          location_update_interval?: number | null
          map_provider?: string | null
          notification_sound?: boolean | null
          organization_email?: string | null
          organization_logo?: string | null
          organization_name?: string | null
          organization_phone?: string | null
          password_expiry_days?: number | null
          push_notifications?: boolean | null
          require_2fa?: boolean | null
          require_journey_approval?: boolean | null
          session_timeout?: number | null
          sms_notifications?: boolean | null
          theme?: string | null
          time_format?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          auto_assign_vehicles?: boolean | null
          created_at?: string | null
          date_format?: string | null
          default_journey_duration?: number | null
          default_map_center_lat?: number | null
          default_map_center_lng?: number | null
          default_map_zoom?: number | null
          email_notifications?: boolean | null
          enable_offline_mode?: boolean | null
          id?: string
          language?: string | null
          location_update_interval?: number | null
          map_provider?: string | null
          notification_sound?: boolean | null
          organization_email?: string | null
          organization_logo?: string | null
          organization_name?: string | null
          organization_phone?: string | null
          password_expiry_days?: number | null
          push_notifications?: boolean | null
          require_2fa?: boolean | null
          require_journey_approval?: boolean | null
          session_timeout?: number | null
          sms_notifications?: boolean | null
          theme?: string | null
          time_format?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_settings_user_id"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_decisions: {
        Row: {
          decided_at: string
          decided_by: string | null
          decision: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          decided_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          decided_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signup_decisions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_decisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      tango_driver_assignments: {
        Row: {
          assigned_by: string | null
          cheetah_id: string | null
          created_at: string
          driver_id: string
          ends_at: string | null
          id: string
          notes: string | null
          program_id: string
          role: string
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          cheetah_id?: string | null
          created_at?: string
          driver_id: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          program_id: string
          role?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          cheetah_id?: string | null
          created_at?: string
          driver_id?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          program_id?: string
          role?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tango_driver_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tango_driver_assignments_cheetah_id_fkey"
            columns: ["cheetah_id"]
            isOneToOne: false
            referencedRelation: "cheetahs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tango_driver_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "tango_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tango_driver_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      tango_driver_licences: {
        Row: {
          created_at: string
          driver_id: string
          expires_on: string
          issued_on: string | null
          licence_class: string | null
          licence_number: string
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          expires_on: string
          issued_on?: string | null
          licence_class?: string | null
          licence_number: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          expires_on?: string
          issued_on?: string | null
          licence_class?: string | null
          licence_number?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tango_driver_licences_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "tango_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tango_driver_licences_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tango_driver_licences_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tango_drivers: {
        Row: {
          alt_phone: string | null
          created_at: string
          created_by: string | null
          engagement_type: string
          full_name: string
          id: string
          notes: string | null
          partner_id: string | null
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          alt_phone?: string | null
          created_at?: string
          created_by?: string | null
          engagement_type?: string
          full_name: string
          id?: string
          notes?: string | null
          partner_id?: string | null
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          alt_phone?: string | null
          created_at?: string
          created_by?: string | null
          engagement_type?: string
          full_name?: string
          id?: string
          notes?: string | null
          partner_id?: string | null
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tango_drivers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tango_drivers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "fleet_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      tango_licence_reminders: {
        Row: {
          driver_id: string
          expires_on: string
          kind: string
          sent_at: string
        }
        Insert: {
          driver_id: string
          expires_on: string
          kind: string
          sent_at?: string
        }
        Update: {
          driver_id?: string
          expires_on?: string
          kind?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tango_licence_reminders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "tango_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_data: {
        Row: {
          accuracy: number | null
          altitude: number | null
          cheetah_id: string | null
          created_at: string | null
          heading: number | null
          id: string
          journey_id: string | null
          latitude: number
          longitude: number
          speed: number | null
          timestamp: string | null
        }
        Insert: {
          accuracy?: number | null
          altitude?: number | null
          cheetah_id?: string | null
          created_at?: string | null
          heading?: number | null
          id?: string
          journey_id?: string | null
          latitude: number
          longitude: number
          speed?: number | null
          timestamp?: string | null
        }
        Update: {
          accuracy?: number | null
          altitude?: number | null
          cheetah_id?: string | null
          created_at?: string | null
          heading?: number | null
          id?: string
          journey_id?: string | null
          latitude?: number
          longitude?: number
          speed?: number | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_data_cheetah_id_fkey"
            columns: ["cheetah_id"]
            isOneToOne: false
            referencedRelation: "cheetahs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_data_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          client_company: string
          client_image: string | null
          client_name: string
          client_role: string
          content: string
          created_at: string | null
          id: string
          is_featured: boolean | null
          order_index: number | null
          rating: number | null
          result_metric: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          client_company: string
          client_image?: string | null
          client_name: string
          client_role: string
          content: string
          created_at?: string | null
          id?: string
          is_featured?: boolean | null
          order_index?: number | null
          rating?: number | null
          result_metric?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          client_company?: string
          client_image?: string | null
          client_name?: string
          client_role?: string
          content?: string
          created_at?: string | null
          id?: string
          is_featured?: boolean | null
          order_index?: number | null
          rating?: number | null
          result_metric?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      theatre_vips: {
        Row: {
          access_level: string | null
          contact_info: string | null
          created_at: string | null
          created_by: string | null
          face_descriptor: Json | null
          full_name: string
          id: string
          notes: string | null
          organization: string | null
          photo_url: string | null
          program_id: string | null
          theatre_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          access_level?: string | null
          contact_info?: string | null
          created_at?: string | null
          created_by?: string | null
          face_descriptor?: Json | null
          full_name: string
          id?: string
          notes?: string | null
          organization?: string | null
          photo_url?: string | null
          program_id?: string | null
          theatre_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          access_level?: string | null
          contact_info?: string | null
          created_at?: string | null
          created_by?: string | null
          face_descriptor?: Json | null
          full_name?: string
          id?: string
          notes?: string | null
          organization?: string | null
          photo_url?: string | null
          program_id?: string | null
          theatre_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "theatre_vips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theatre_vips_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theatre_vips_theatre_id_fkey"
            columns: ["theatre_id"]
            isOneToOne: false
            referencedRelation: "theatres"
            referencedColumns: ["id"]
          },
        ]
      }
      theatres: {
        Row: {
          address: string
          capacity: number | null
          city: string | null
          contact: string | null
          created_at: string | null
          facilities: string | null
          gate_instructions: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          updated_at: string | null
          venue_type: string | null
        }
        Insert: {
          address: string
          capacity?: number | null
          city?: string | null
          contact?: string | null
          created_at?: string | null
          facilities?: string | null
          gate_instructions?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          updated_at?: string | null
          venue_type?: string | null
        }
        Update: {
          address?: string
          capacity?: number | null
          city?: string | null
          contact?: string | null
          created_at?: string | null
          facilities?: string | null
          gate_instructions?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          updated_at?: string | null
          venue_type?: string | null
        }
        Relationships: []
      }
      title_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          program_id: string | null
          title_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          program_id?: string | null
          title_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          program_id?: string | null
          title_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "title_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_assignments_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "official_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      training_attendance: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          id: string
          notes: string | null
          status: string
          training_schedule_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          training_schedule_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          training_schedule_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_attendance_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_attendance_training_schedule_id_fkey"
            columns: ["training_schedule_id"]
            isOneToOne: false
            referencedRelation: "training_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      training_course_assignments: {
        Row: {
          assigned_by: string | null
          course_id: string
          created_at: string
          due_at: string | null
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          course_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          course_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_course_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_course_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_course_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      training_courses: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          estimated_minutes: number
          id: string
          status: string
          target_unit_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_minutes?: number
          id?: string
          status?: string
          target_unit_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_minutes?: number
          id?: string
          status?: string
          target_unit_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_courses_target_unit_id_fkey"
            columns: ["target_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      training_evaluations: {
        Row: {
          created_at: string
          due_at: string | null
          evaluator_id: string | null
          feedback: string | null
          growth_areas: string | null
          id: string
          member_stage: string
          responses: Json
          score: number | null
          status: string
          strengths: string | null
          subject_user_id: string
          submitted_at: string | null
          training_schedule_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          evaluator_id?: string | null
          feedback?: string | null
          growth_areas?: string | null
          id?: string
          member_stage?: string
          responses?: Json
          score?: number | null
          status?: string
          strengths?: string | null
          subject_user_id: string
          submitted_at?: string | null
          training_schedule_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          evaluator_id?: string | null
          feedback?: string | null
          growth_areas?: string | null
          id?: string
          member_stage?: string
          responses?: Json
          score?: number | null
          status?: string
          strengths?: string | null
          subject_user_id?: string
          submitted_at?: string | null
          training_schedule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_evaluations_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_evaluations_training_schedule_id_fkey"
            columns: ["training_schedule_id"]
            isOneToOne: false
            referencedRelation: "training_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_lesson_progress: {
        Row: {
          completed_at: string | null
          completion_method: string | null
          created_at: string
          id: string
          last_watched_at: string
          lesson_id: string
          percent_complete: number
          updated_at: string
          user_id: string
          video_duration_seconds: number | null
          watched_seconds: number
        }
        Insert: {
          completed_at?: string | null
          completion_method?: string | null
          created_at?: string
          id?: string
          last_watched_at?: string
          lesson_id: string
          percent_complete?: number
          updated_at?: string
          user_id: string
          video_duration_seconds?: number | null
          watched_seconds?: number
        }
        Update: {
          completed_at?: string | null
          completion_method?: string | null
          created_at?: string
          id?: string
          last_watched_at?: string
          lesson_id?: string
          percent_complete?: number
          updated_at?: string
          user_id?: string
          video_duration_seconds?: number | null
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      training_lessons: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_required: boolean
          sort_order: number
          title: string
          updated_at: string
          youtube_video_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_required?: boolean
          sort_order?: number
          title: string
          updated_at?: string
          youtube_video_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_required?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
          youtube_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      training_schedules: {
        Row: {
          broadcast_sent_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          id: string
          location: string | null
          resources: Json
          session_date: string
          session_type: string
          speakers: Json
          start_time: string | null
          target_unit_id: string | null
          topic: string
          updated_at: string
          visibility: string
        }
        Insert: {
          broadcast_sent_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          resources?: Json
          session_date: string
          session_type?: string
          speakers?: Json
          start_time?: string | null
          target_unit_id?: string | null
          topic: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          broadcast_sent_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          resources?: Json
          session_date?: string
          session_type?: string
          speakers?: Json
          start_time?: string | null
          target_unit_id?: string | null
          topic?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_schedules_target_unit_id_fkey"
            columns: ["target_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_deployment_members: {
        Row: {
          assigned_by: string | null
          created_at: string
          deployment_id: string
          id: string
          role: string
          shift_end: string | null
          shift_start: string | null
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          deployment_id: string
          id?: string
          role?: string
          shift_end?: string | null
          shift_start?: string | null
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          deployment_id?: string
          id?: string
          role?: string
          shift_end?: string | null
          shift_start?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_deployment_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_deployment_members_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "unit_deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_deployment_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_deployments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lead_user_id: string | null
          notes: string | null
          program_venue_id: string
          readiness: number
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_user_id?: string | null
          notes?: string | null
          program_venue_id: string
          readiness?: number
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_user_id?: string | null
          notes?: string | null
          program_venue_id?: string
          readiness?: number
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_deployments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_deployments_lead_user_id_fkey"
            columns: ["lead_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_deployments_program_venue_id_fkey"
            columns: ["program_venue_id"]
            isOneToOne: false
            referencedRelation: "program_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_deployments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_memberships: {
        Row: {
          access_level: string
          assigned_by: string | null
          id: string
          joined_at: string
          managed_by_legacy: boolean
          status: string
          unit_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: string
          assigned_by?: string | null
          id?: string
          joined_at?: string
          managed_by_legacy?: boolean
          status?: string
          unit_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: string
          assigned_by?: string | null
          id?: string
          joined_at?: string
          managed_by_legacy?: boolean
          status?: string
          unit_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_memberships_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_memberships_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_programme_grants: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          program_id: string
          revoked_at: string | null
          revoked_by: string | null
          unit_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          program_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          unit_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          program_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_programme_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_programme_grants_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_programme_grants_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_programme_grants_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_programme_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          metadata: Json
          priority: string
          program_id: string | null
          project_type: string
          starts_at: string | null
          status: string
          title: string
          unit_id: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          priority?: string
          program_id?: string | null
          project_type: string
          starts_at?: string | null
          status?: string
          title: string
          unit_id: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json
          priority?: string
          program_id?: string | null
          project_type?: string
          starts_at?: string | null
          status?: string
          title?: string
          unit_id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unit_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_projects_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_projects_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_projects_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "theatres"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          project_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unit_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          accent: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          accent?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          accent?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_locations: {
        Row: {
          accuracy: number | null
          altitude: number | null
          battery_level: number | null
          created_at: string | null
          device_id: string | null
          heading: number | null
          id: string
          is_active: boolean | null
          latitude: number
          longitude: number
          speed: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          created_at?: string | null
          device_id?: string | null
          heading?: number | null
          id?: string
          is_active?: boolean | null
          latitude: number
          longitude: number
          speed?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          created_at?: string | null
          device_id?: string | null
          heading?: number | null
          id?: string
          is_active?: boolean | null
          latitude?: number
          longitude?: number
          speed?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          activation_status: string | null
          address: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
          current_title_id: string | null
          date_of_birth: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          gender: string | null
          has_admin_access: boolean
          id: string
          is_active: boolean | null
          is_directory_hidden: boolean
          is_online: boolean | null
          is_team_head: boolean
          job_title: string | null
          last_seen: string | null
          local_government_area: string | null
          location_sharing_enabled: boolean
          nearest_bus_stop_landmark: string | null
          notification_preferences: Json | null
          oscar: string | null
          password_last_changed: string | null
          password_last_notified: string | null
          phone: string | null
          photo_url: string | null
          profile_completed_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          state: string | null
          team: string | null
          timezone: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          activation_status?: string | null
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          current_title_id?: string | null
          date_of_birth?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          gender?: string | null
          has_admin_access?: boolean
          id: string
          is_active?: boolean | null
          is_directory_hidden?: boolean
          is_online?: boolean | null
          is_team_head?: boolean
          job_title?: string | null
          last_seen?: string | null
          local_government_area?: string | null
          location_sharing_enabled?: boolean
          nearest_bus_stop_landmark?: string | null
          notification_preferences?: Json | null
          oscar?: string | null
          password_last_changed?: string | null
          password_last_notified?: string | null
          phone?: string | null
          photo_url?: string | null
          profile_completed_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          team?: string | null
          timezone?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          activation_status?: string | null
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          current_title_id?: string | null
          date_of_birth?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          gender?: string | null
          has_admin_access?: boolean
          id?: string
          is_active?: boolean | null
          is_directory_hidden?: boolean
          is_online?: boolean | null
          is_team_head?: boolean
          job_title?: string | null
          last_seen?: string | null
          local_government_area?: string | null
          location_sharing_enabled?: boolean
          nearest_bus_stop_landmark?: string | null
          notification_preferences?: Json | null
          oscar?: string | null
          password_last_changed?: string | null
          password_last_notified?: string | null
          phone?: string | null
          photo_url?: string | null
          profile_completed_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          team?: string | null
          timezone?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_current_title_id_fkey"
            columns: ["current_title_id"]
            isOneToOne: false
            referencedRelation: "official_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_locations: {
        Row: {
          accuracy: number | null
          altitude: number | null
          cheetah_id: string
          created_at: string | null
          heading: number | null
          id: string
          latitude: number
          longitude: number
          speed: number | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          accuracy?: number | null
          altitude?: number | null
          cheetah_id: string
          created_at?: string | null
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          speed?: number | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          accuracy?: number | null
          altitude?: number | null
          cheetah_id?: string
          created_at?: string | null
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          speed?: number | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_locations_cheetah_id_fkey"
            columns: ["cheetah_id"]
            isOneToOne: false
            referencedRelation: "cheetahs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_engagements: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          program_id: string | null
          service: string
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          program_id?: string | null
          service: string
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          program_id?: string | null
          service?: string
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_engagements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_engagements_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_engagements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_price_items: {
        Row: {
          created_at: string
          currency: string
          id: string
          item: string
          note: string | null
          price: number
          unit: string | null
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          item: string
          note?: string | null
          price: number
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          item?: string
          note?: string | null
          price?: number
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_price_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_price_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_ratings: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string
          id: string
          program_id: string | null
          rating: number
          vendor_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by: string
          id?: string
          program_id?: string | null
          rating: number
          vendor_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string
          id?: string
          program_id?: string | null
          rating?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_ratings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ratings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ratings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          contact_name: string | null
          created_at: string
          created_by: string | null
          cuisine_note: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          service_categories: string[]
          sla_notes: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          cuisine_note?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          service_categories?: string[]
          sla_notes?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          cuisine_note?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          service_categories?: string[]
          sla_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_parties: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          notes: string | null
          papa_id: string | null
          program_venue_id: string
          scheduled_end: string | null
          scheduled_start: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          notes?: string | null
          papa_id?: string | null
          program_venue_id: string
          scheduled_end?: string | null
          scheduled_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          notes?: string | null
          papa_id?: string | null
          program_venue_id?: string
          scheduled_end?: string | null
          scheduled_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcome_parties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welcome_parties_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welcome_parties_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welcome_parties_program_venue_id_fkey"
            columns: ["program_venue_id"]
            isOneToOne: false
            referencedRelation: "program_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_party_members: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          party_id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          party_id: string
          role?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          party_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcome_party_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welcome_party_members_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "welcome_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welcome_party_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_cases: {
        Row: {
          assigned_to: string | null
          beneficiary_name: string | null
          case_type: string
          created_at: string
          created_by: string | null
          description: string | null
          event_at: string | null
          id: string
          privacy: string
          status: string
          target_user_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          beneficiary_name?: string | null
          case_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_at?: string | null
          id?: string
          privacy?: string
          status?: string
          target_user_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          beneficiary_name?: string | null
          case_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_at?: string | null
          id?: string
          privacy?: string
          status?: string
          target_user_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_cases_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_celebrations: {
        Row: {
          announcement_id: string | null
          celebrant_name: string | null
          celebration_type: string
          created_at: string
          created_by: string | null
          event_date: string
          id: string
          message: string | null
          published_at: string | null
          status: string
          target_user_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          announcement_id?: string | null
          celebrant_name?: string | null
          celebration_type: string
          created_at?: string
          created_by?: string | null
          event_date: string
          id?: string
          message?: string | null
          published_at?: string | null
          status?: string
          target_user_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          announcement_id?: string | null
          celebrant_name?: string | null
          celebration_type?: string
          created_at?: string
          created_by?: string | null
          event_date?: string
          id?: string
          message?: string | null
          published_at?: string | null
          status?: string
          target_user_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_celebrations_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_celebrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_celebrations_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_reminder_deliveries: {
        Row: {
          created_at: string
          delivery_date: string
          id: string
          kind: string
          notification_id: string | null
          recipient_id: string
          target_user_id: string | null
        }
        Insert: {
          created_at?: string
          delivery_date: string
          id?: string
          kind: string
          notification_id?: string | null
          recipient_id: string
          target_user_id?: string | null
        }
        Update: {
          created_at?: string
          delivery_date?: string
          id?: string
          kind?: string
          notification_id?: string | null
          recipient_id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "welfare_reminder_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_reminder_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_reminder_deliveries_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      audit_logs_readable: {
        Row: {
          action: string | null
          changes: Json | null
          created_at: string | null
          description: string | null
          id: string | null
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_email: string | null
          user_full_name: string | null
          user_id: string | null
          user_oscar: string | null
          user_role: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
      current_title_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_by_name: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          is_fixed: boolean | null
          is_team_lead: boolean | null
          program_id: string | null
          program_name: string | null
          title_code: string | null
          title_id: string | null
          title_name: string | null
          unit: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "title_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_assignments_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "official_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "title_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      eagle_squares_with_flights: {
        Row: {
          arriving_flights: Json | null
          city: string | null
          code: string | null
          contact: string | null
          country: string | null
          created_at: string | null
          departing_flights: Json | null
          id: string | null
          latitude: number | null
          longitude: number | null
          name: string | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          arriving_flights?: never
          city?: string | null
          code?: string | null
          contact?: string | null
          country?: string | null
          created_at?: string | null
          departing_flights?: never
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          arriving_flights?: never
          city?: string | null
          code?: string | null
          contact?: string | null
          country?: string | null
          created_at?: string | null
          departing_flights?: never
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      nests_with_amenities: {
        Row: {
          address: string | null
          amenities: string[] | null
          check_in_time: string | null
          check_out_time: string | null
          city: string | null
          contact: string | null
          created_at: string | null
          id: string | null
          latitude: number | null
          longitude: number | null
          name: string | null
          room_assignments: Json | null
          updated_at: string | null
        }
        Relationships: []
      }
      papa_book_balances: {
        Row: {
          amount_paid: number | null
          batch_id: string | null
          currency: string | null
          isbn: string | null
          papa_id: string | null
          payout_due: number | null
          program_id: string | null
          quantity_received: number | null
          quantity_remaining: number | null
          quantity_returned: number | null
          quantity_sold: number | null
          title: string | null
          unit_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "papa_book_batches_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_book_batches_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "papa_book_batches_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      papas_basic: {
        Row: {
          full_name: string | null
          id: string | null
          profile_photo_url: string | null
          program_id: string | null
          title: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
          profile_photo_url?: string | null
          program_id?: string | null
          title?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
          profile_photo_url?: string | null
          program_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "papas_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_audit_logs: {
        Row: {
          action: string | null
          created_at: string | null
          device_info: Json | null
          entity_id: string | null
          entity_type: string | null
          error_code: string | null
          error_message: string | null
          execution_time_ms: number | null
          headers: Json | null
          id: string | null
          ip_address: unknown
          metadata: Json | null
          method: string | null
          params: Json | null
          path: string | null
          request_id: string | null
          session_id: string | null
          status: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          device_info?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          headers?: Json | null
          id?: string | null
          ip_address?: unknown
          metadata?: Json | null
          method?: string | null
          params?: Json | null
          path?: string | null
          request_id?: string | null
          session_id?: string | null
          status?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          device_info?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          headers?: Json | null
          id?: string | null
          ip_address?: unknown
          metadata?: Json | null
          method?: string | null
          params?: Json | null
          path?: string | null
          request_id?: string | null
          session_id?: string | null
          status?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      alpha_arrival_board: {
        Args: { target_program: string }
        Returns: {
          arrival_city: string
          eta: string
          eta_source: string
          flight_number: string
          full_name: string
          items_done: number
          items_overdue: number
          items_total: number
          next_due_at: string
          papa_id: string
          timeline_id: string
          title: string
        }[]
      }
      alpha_arrival_eta: {
        Args: { override: string; target_papa: string; target_program: string }
        Returns: {
          eta: string
          eta_source: string
        }[]
      }
      alpha_send_timeline_overdue: { Args: never; Returns: number }
      alpha_start_arrival_timeline: {
        Args: { target_papa: string; target_program: string }
        Returns: string
      }
      alpha_tick_timeline_item: {
        Args: { is_done?: boolean; item_note?: string; target_item: string }
        Returns: {
          done_at: string | null
          done_by: string | null
          id: string
          label: string
          milestone_key: string
          note: string | null
          note_at: string | null
          note_by: string | null
          offset_minutes: number
          owner: string | null
          position: number
          sop_ref: string | null
          timeline_id: string
        }
        SetofOptions: {
          from: "*"
          to: "alpha_arrival_timeline_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_journey: { Args: { p_journey_id: string }; Returns: undefined }
      assign_do_to_journey: {
        Args: { do_uuid: string; journey_uuid: string }
        Returns: undefined
      }
      assign_title: {
        Args: {
          p_assigned_by?: string
          p_program_id?: string
          p_title_code: string
          p_user_id: string
        }
        Returns: string
      }
      broadcast_training_schedule: {
        Args: { target_schedule_id: string }
        Returns: string
      }
      can_access_chat_message: {
        Args: { target_message_id: string }
        Returns: boolean
      }
      can_access_chat_room: {
        Args: {
          target_papa_id?: string
          target_program_id?: string
          target_team?: string
        }
        Returns: boolean
      }
      can_access_chat_topic: { Args: { topic: string }; Returns: boolean }
      can_access_training_course: {
        Args: { target_course_id: string }
        Returns: boolean
      }
      can_approve_program_additions: { Args: never; Returns: boolean }
      can_confirm_do_duty: {
        Args: { target_journey_id: string }
        Returns: boolean
      }
      can_coordinate_unit: { Args: { unit_slug: string }; Returns: boolean }
      can_decide_signup: { Args: { target_user: string }; Returns: boolean }
      can_edit_den_report: { Args: { target_report: string }; Returns: boolean }
      can_edit_vendors: { Args: never; Returns: boolean }
      can_grant_unit_programme: {
        Args: { target_unit: string }
        Returns: boolean
      }
      can_manage_unit: { Args: { unit_slug: string }; Returns: boolean }
      can_read_alpha_timelines: { Args: never; Returns: boolean }
      can_respond_to_mission_request: {
        Args: { target_request_id: string }
        Returns: boolean
      }
      can_tick_alpha_timeline: {
        Args: { target_program: string }
        Returns: boolean
      }
      can_view_all_tracking: { Args: never; Returns: boolean }
      can_view_call_signs: { Args: never; Returns: boolean }
      can_view_den_guest: { Args: { target_papa: string }; Returns: boolean }
      can_view_den_program: {
        Args: { target_program: string }
        Returns: boolean
      }
      can_view_papa_passport: {
        Args: { target_papa: string }
        Returns: boolean
      }
      can_work_unit_programme: {
        Args: { target_program: string; unit_slug: string }
        Returns: boolean
      }
      claim_notification_push: {
        Args: { batch_size?: number }
        Returns: {
          attempts: number
          available_at: string
          created_at: string
          delivered_at: string | null
          failed_at: string | null
          id: string
          last_error: string | null
          lease_id: string | null
          locked_until: string | null
          notification_id: string
          subscription_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_push_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_locations: { Args: never; Returns: undefined }
      complete_do_journey: {
        Args: { completion_reason?: string; target_journey_id: string }
        Returns: Json
      }
      complete_journey: { Args: { p_journey_id: string }; Returns: undefined }
      compliance_acknowledge_inspection: {
        Args: { note?: string; target_inspection: string }
        Returns: string
      }
      compliance_inspection_item_keys: { Args: never; Returns: string[] }
      compliance_inspection_item_label: {
        Args: { item_key: string }
        Returns: string
      }
      configure_device_push: {
        Args: {
          p_dispatch_secret: string
          p_dispatch_url: string
          p_private_key: string
          p_public_key: string
          p_subject: string
        }
        Returns: boolean
      }
      create_audit_log: {
        Args: {
          p_action: string
          p_changes?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
      current_user_claim_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"][]
      }
      current_user_platform_rank: { Args: never; Returns: number }
      decide_signup: {
        Args: {
          decision_reason?: string
          signup_decision: string
          target_user: string
        }
        Returns: Json
      }
      delete_old_notifications: { Args: never; Returns: undefined }
      den_analytics: { Args: never; Returns: Json }
      den_attendance: {
        Args: never
        Returns: {
          attended: number
          shifts_past: number
          user_id: string
        }[]
      }
      den_can_take_programme_work: {
        Args: { target_program: string; target_user: string }
        Returns: boolean
      }
      den_copy_programme_setup: {
        Args: {
          copy_checklists?: boolean
          copy_shifts?: boolean
          copy_tasks?: boolean
          source_program: string
          target_program: string
        }
        Returns: Json
      }
      den_ensure_programme_project: {
        Args: { target_program: string }
        Returns: string
      }
      den_floor_candidates: {
        Args: { target_program: string }
        Returns: {
          accepted_availability: boolean
          granted: boolean
          on_officers_list: boolean
          pending_approval: boolean
          user_id: string
        }[]
      }
      den_guest_earlier_records: {
        Args: { target_papa: string }
        Returns: {
          dishes: string[]
          note: string
          note_author: string
          note_category: string
          note_created_at: string
          papa_id: string
          program_name: string
          start_date: string
        }[]
      }
      den_guest_history: {
        Args: { target_papa: string }
        Returns: {
          dishes: string[]
          meal_orders: number
          notes: number
          program_id: string
          program_name: string
          start_date: string
        }[]
      }
      den_guest_name_key: { Args: { full_name: string }; Returns: string }
      den_guest_profiles: {
        Args: { target_program: string }
        Returns: {
          arrival_date: string
          departure_date: string
          dietary_restrictions: string
          entourage: number
          food_preferences: string
          full_name: string
          id: string
          is_first_time: boolean
          note_count: number
          organization: string
          past_invites_count: number
          position: string
          profile_photo_url: string
          special_requirements: string
          title: string
          water_temperature: string
        }[]
      }
      den_outstanding_reports: {
        Args: never
        Returns: {
          end_date: string
          has_draft: boolean
          program_id: string
          program_name: string
        }[]
      }
      den_programme_summary: { Args: { target_program: string }; Returns: Json }
      den_programme_team: {
        Args: { target_program: string }
        Returns: {
          access_level: string
          full_name: string
          on_programme: boolean
          photo_url: string
          user_id: string
        }[]
      }
      den_programmes_with_setup: {
        Args: never
        Returns: {
          checklists: number
          program_id: string
          program_name: string
          shifts: number
          start_date: string
          tasks: number
        }[]
      }
      den_record_stock: {
        Args: {
          amount: number
          movement: string
          movement_note?: string
          target_item: string
          target_program?: string
        }
        Returns: number
      }
      den_send_task_reminders: { Args: never; Returns: number }
      den_set_my_task_status: {
        Args: { new_status: string; target_task: string }
        Returns: undefined
      }
      den_shift_attendance: {
        Args: { action: string; target_member: string }
        Returns: Json
      }
      den_start_checklist: {
        Args: {
          checklist_title?: string
          target_program: string
          target_template?: string
        }
        Returns: string
      }
      den_tick_checklist_item: {
        Args: { is_done: boolean; target_item: string }
        Returns: undefined
      }
      disablelongtransactions: { Args: never; Returns: string }
      dispatch_announcement: {
        Args: { target_announcement_id: string }
        Returns: number
      }
      dispatch_due_announcements: { Args: never; Returns: number }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      edit_chat_message: {
        Args: { message_id: string; new_content: string }
        Returns: Json
      }
      edit_room_chat_message: {
        Args: { message_id: string; new_content: string }
        Returns: Json
      }
      enablelongtransactions: { Args: never; Returns: string }
      enqueue_daily_birthday_reminders: { Args: never; Returns: number }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      export_program_data: { Args: { program_uuid: string }; Returns: Json }
      export_program_data_unchecked: {
        Args: { program_uuid: string }
        Returns: Json
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_active_user_locations: {
        Args: never
        Returns: {
          accuracy: number
          battery_level: number
          full_name: string
          heading: number
          latitude: number
          longitude: number
          oscar: string
          role: Database["public"]["Enums"]["user_role"]
          speed: number
          updated_at: string
          user_id: string
        }[]
      }
      get_chat_participants: {
        Args: never
        Returns: {
          full_name: string
          id: string
          is_online: boolean
          last_seen: string
          oscar: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      get_current_oscar: { Args: never; Returns: string }
      get_device_push_config: { Args: never; Returns: Json }
      get_journey_location_trail: {
        Args: { journey_uuid: string }
        Returns: {
          accuracy: number
          created_at: string
          latitude: number
          longitude: number
        }[]
      }
      get_my_training_evaluations: {
        Args: never
        Returns: {
          created_at: string
          due_at: string
          evaluator_id: string
          feedback: string
          growth_areas: string
          id: string
          member_stage: string
          responses: Json
          score: number
          status: string
          strengths: string
          subject_user_id: string
          submitted_at: string
          training_schedule_id: string
          updated_at: string
        }[]
      }
      get_today_birthdays: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
          oscar: string
          phone: string
          photo_url: string
          team: string
        }[]
      }
      get_unread_count: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: number
      }
      get_unread_message_count: { Args: { user_uuid: string }; Returns: number }
      get_user_latest_location: {
        Args: { user_uuid: string }
        Returns: {
          accuracy: number
          latitude: number
          longitude: number
          updated_at: string
        }[]
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_welfare_directory: {
        Args: never
        Returns: {
          birth_day: number
          birth_month: number
          email: string
          emergency_contact_name: string
          emergency_contact_phone: string
          full_name: string
          id: string
          is_active: boolean
          oscar: string
          phone: string
          photo_url: string
          role: Database["public"]["Enums"]["user_role"]
          team: string
        }[]
      }
      get_welfare_directory_safe: {
        Args: never
        Returns: {
          birth_day: number
          birth_month: number
          email: string
          full_name: string
          id: string
          is_active: boolean
          oscar: string
          phone: string
          photo_url: string
          role: string
          team: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      has_any_claim_role:
        | {
            Args: { p_roles: string[] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_any_claim_role(p_roles => _text), public.has_any_claim_role(p_roles => _user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_roles: Database["public"]["Enums"]["user_role"][] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_any_claim_role(p_roles => _text), public.has_any_claim_role(p_roles => _user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      has_any_role:
        | {
            Args: { p_roles: string[] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_any_role(p_roles => _text), public.has_any_role(p_roles => _user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_roles: Database["public"]["Enums"]["user_role"][] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_any_role(p_roles => _text), public.has_any_role(p_roles => _user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      has_any_role_from_db: {
        Args: { p_roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      has_claim_role:
        | {
            Args: { p_role: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_claim_role(p_role => text), public.has_claim_role(p_role => user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_role: Database["public"]["Enums"]["user_role"] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_claim_role(p_role => text), public.has_claim_role(p_role => user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      has_den_floor_access: {
        Args: { target_program: string }
        Returns: boolean
      }
      has_program_admin_access: { Args: never; Returns: boolean }
      has_role:
        | {
            Args: { p_role: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_role(p_role => text), public.has_role(p_role => user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_role: Database["public"]["Enums"]["user_role"] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_role(p_role => text), public.has_role(p_role => user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      has_role_from_db: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      has_title: { Args: { p_title_code: string }; Returns: boolean }
      has_unit_programme_grant: {
        Args: { target_program: string; unit_slug: string }
        Returns: boolean
      }
      is_active_member: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      is_alpha_oscar: { Args: never; Returns: boolean }
      is_assigned_do_for_journey: {
        Args: { target_journey_id: string }
        Returns: boolean
      }
      is_assigned_do_for_papa: {
        Args: { target_papa_id: string }
        Returns: boolean
      }
      is_assigned_do_for_papa_program: {
        Args: { target_papa_id: string; target_program_id: string }
        Returns: boolean
      }
      is_assigned_do_for_presentation_path: {
        Args: { target_papa_text: string; target_program_text: string }
        Returns: boolean
      }
      is_available_program_duty_officer: {
        Args: { target_program: string; target_user: string }
        Returns: boolean
      }
      is_delta_oscar: { Args: never; Returns: boolean }
      is_den_project: { Args: { target_project: string }; Returns: boolean }
      is_november_oscar: { Args: never; Returns: boolean }
      is_papa_duty_officer: {
        Args: { target_papa: string; target_user: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_program_active_officer: {
        Args: { target_program: string; target_user: string }
        Returns: boolean
      }
      is_tango_oscar: { Args: never; Returns: boolean }
      is_trusted_backend: { Args: never; Returns: boolean }
      is_unit_member: { Args: { unit_slug: string }; Returns: boolean }
      is_valid_user_role: { Args: { p_role: string }; Returns: boolean }
      is_victor_oscar: { Args: never; Returns: boolean }
      kick_notification_push: { Args: never; Returns: number }
      legacy_matches_november_den: {
        Args: { target_oscar: string; target_role: string }
        Returns: boolean
      }
      legacy_matches_unit: {
        Args: {
          target_oscar: string
          target_role: string
          target_unit_slug: string
        }
        Returns: boolean
      }
      legacy_unit_access_level: {
        Args: {
          target_oscar: string
          target_role: string
          target_unit_slug: string
        }
        Returns: string
      }
      location_sharing_is_enabled: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_chat_messages_read: {
        Args: { message_ids: string[] }
        Returns: undefined
      }
      mark_message_read: {
        Args: { message_uuid: string; user_uuid: string }
        Returns: undefined
      }
      mark_messages_as_read: {
        Args: { p_program_id: string; p_user_id: string }
        Returns: undefined
      }
      oscar_unit_matches: { Args: { unit_pattern: string }; Returns: boolean }
      papa_has_nest: { Args: { target_papa_id: string }; Returns: boolean }
      papa_has_theatre: { Args: { target_papa_id: string }; Returns: boolean }
      papa_used_eagle_square: {
        Args: { target_papa_id: string }
        Returns: boolean
      }
      papa_uses_cheetah: { Args: { target_papa_id: string }; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      reassign_title: {
        Args: {
          p_assigned_by?: string
          p_from_user_id: string
          p_program_id?: string
          p_title_code: string
          p_to_user_id: string
        }
        Returns: string
      }
      rebuild_legacy_unit_memberships: {
        Args: { target_user: string }
        Returns: undefined
      }
      reconcile_journey_primary_cheetah: {
        Args: { target_journey_id: string }
        Returns: undefined
      }
      reconcile_nest_room_status: {
        Args: { target_room_id: string }
        Returns: undefined
      }
      record_training_watch: {
        Args: { target_lesson_id: string; watched_increment_seconds: number }
        Returns: {
          completed_at: string
          percent_complete: number
          watched_seconds: number
        }[]
      }
      replace_journey_duty_officers: {
        Args: { assignments: Json; target_journey_id: string }
        Returns: undefined
      }
      revoke_user_sessions: { Args: { target_user: string }; Returns: number }
      send_mission_availability_request: {
        Args: {
          notification_message: string
          request_audience: string
          request_deadline: string
          request_message: string
          request_title: string
          sender_id: string
          target_program_id: string
        }
        Returns: {
          recipients: number
          request_id: string
        }[]
      }
      set_location_sharing: {
        Args: { sharing_enabled: boolean }
        Returns: boolean
      }
      set_user_presence: {
        Args: { is_user_online: boolean }
        Returns: undefined
      }
      settle_notification_push: {
        Args: {
          delivered: boolean
          delivery_lease: string
          error_code?: string
          job_id: string
          retry_seconds?: number
        }
        Returns: undefined
      }
      soft_delete_journey: {
        Args: { p_journey_id: string }
        Returns: undefined
      }
      soft_delete_papa: { Args: { p_papa_id: string }; Returns: undefined }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      start_do_return: {
        Args: { return_destination: string; target_journey_id: string }
        Returns: Json
      }
      submit_training_evaluation_reflection: {
        Args: { reflection_text: string; target_evaluation_id: string }
        Returns: undefined
      }
      tango_driver_blocker: {
        Args: { needed_until: string; target_driver: string }
        Returns: string
      }
      tango_driver_roster: {
        Args: never
        Returns: {
          alt_phone: string
          engagement_type: string
          full_name: string
          id: string
          licence_class: string
          licence_expires_on: string
          licence_state: string
          licence_verified: boolean
          notes: string
          partner_id: string
          phone: string
          status: string
          updated_at: string
        }[]
      }
      tango_licence_state: {
        Args: { expires_on: string; on_date?: string }
        Returns: string
      }
      tango_send_licence_reminders: { Args: never; Returns: number }
      task_unit_slug: { Args: { project: string }; Returns: string }
      unit_can_take_programme_work: {
        Args: { target_program: string; target_user: string; unit_slug: string }
        Returns: boolean
      }
      unit_ensure_programme_project: {
        Args: { target_program: string; unit_slug: string }
        Returns: string
      }
      unit_member_can_take_task: {
        Args: { target_user: string; unit_slug: string }
        Returns: boolean
      }
      unit_programme_team: {
        Args: { target_program: string; unit_slug: string }
        Returns: {
          access_level: string
          can_work: boolean
          full_name: string
          grant_id: string
          granted: boolean
          on_programme: boolean
          photo_url: string
          user_id: string
        }[]
      }
      unit_send_task_reminders: { Args: never; Returns: number }
      unit_set_my_task_status: {
        Args: { new_status: string; task: string }
        Returns: undefined
      }
      unit_set_programme_grant: {
        Args: {
          granted: boolean
          target_program: string
          target_user: string
          unit_slug: string
        }
        Returns: string
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_journey_status: {
        Args: { p_journey_id: string; p_notes?: string; p_status: string }
        Returns: string
      }
      update_user_online_status: {
        Args: { p_is_online: boolean }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_user_location: {
        Args: {
          p_accuracy?: number
          p_altitude?: number
          p_battery_level?: number
          p_device_id?: string
          p_heading?: number
          p_latitude: number
          p_longitude: number
          p_speed?: number
          p_user_id: string
        }
        Returns: string
      }
      vendor_summaries: {
        Args: never
        Returns: {
          average_rating: number
          engagement_count: number
          last_used: string
          menu_count: number
          rating_count: number
          vendor_id: string
        }[]
      }
    }
    Enums: {
      call_sign:
        | "First Course"
        | "Chapman"
        | "Dessert"
        | "Cocktail"
        | "Blue Cocktail"
        | "Red Cocktail"
        | "Re-order"
        | "Broken Arrow"
        | "checkpoint_update"
      document_type: "sop" | "code_of_conduct"
      incident_severity: "low" | "medium" | "high" | "critical"
      journey_status:
        | "planned"
        | "scheduled"
        | "arriving"
        | "at_nest"
        | "departing_nest"
        | "enroute_to_theatre"
        | "at_theatre"
        | "departing_theatre"
        | "completed"
        | "cancelled"
        | "distress"
        | "active"
        | "planning"
        | "cocktail"
        | "blue_cocktail"
        | "red_cocktail"
        | "re_order"
        | "first_course"
        | "chapman"
        | "dessert"
        | "broken_arrow"
      nest_type: "den" | "nest"
      notification_channel: "email" | "sms" | "push" | "whatsapp"
      notification_status: "pending" | "sent" | "failed" | "delivered"
      session_type: "morning" | "afternoon" | "evening" | "special"
      user_role:
        | "super_admin"
        | "admin"
        | "captain"
        | "head_of_command"
        | "delta_oscar"
        | "tango_oscar"
        | "head_tango_oscar"
        | "alpha_oscar"
        | "november_oscar"
        | "victor_oscar"
        | "viewer"
        | "media"
        | "external"
        | "prof"
        | "duchess"
        | "vice_captain"
        | "command"
        | "head_of_operations"
        | "head_alpha_oscar"
        | "head_victor_oscar"
        | "head_echo_oscar"
        | "noscar_den"
        | "head_noscar_den"
        | "noscar_nest"
        | "head_noscar_nest"
        | "echo_oscar"
        | "dev_admin"
        | "sierra_oscar"
        | "head_sierra_oscar"
        | "compliance_oscar"
        | "head_compliance_oscar"
        | "welfare_oscar"
        | "head_welfare_oscar"
        | "hospitality_oscar"
        | "head_hospitality_oscar"
        | "serial_oscar"
        | "head_serial_oscar"
      vehicle_status:
        | "idle"
        | "on_mission"
        | "maintenance"
        | "disabled"
        | "active"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      call_sign: [
        "First Course",
        "Chapman",
        "Dessert",
        "Cocktail",
        "Blue Cocktail",
        "Red Cocktail",
        "Re-order",
        "Broken Arrow",
        "checkpoint_update",
      ],
      document_type: ["sop", "code_of_conduct"],
      incident_severity: ["low", "medium", "high", "critical"],
      journey_status: [
        "planned",
        "scheduled",
        "arriving",
        "at_nest",
        "departing_nest",
        "enroute_to_theatre",
        "at_theatre",
        "departing_theatre",
        "completed",
        "cancelled",
        "distress",
        "active",
        "planning",
        "cocktail",
        "blue_cocktail",
        "red_cocktail",
        "re_order",
        "first_course",
        "chapman",
        "dessert",
        "broken_arrow",
      ],
      nest_type: ["den", "nest"],
      notification_channel: ["email", "sms", "push", "whatsapp"],
      notification_status: ["pending", "sent", "failed", "delivered"],
      session_type: ["morning", "afternoon", "evening", "special"],
      user_role: [
        "super_admin",
        "admin",
        "captain",
        "head_of_command",
        "delta_oscar",
        "tango_oscar",
        "head_tango_oscar",
        "alpha_oscar",
        "november_oscar",
        "victor_oscar",
        "viewer",
        "media",
        "external",
        "prof",
        "duchess",
        "vice_captain",
        "command",
        "head_of_operations",
        "head_alpha_oscar",
        "head_victor_oscar",
        "head_echo_oscar",
        "noscar_den",
        "head_noscar_den",
        "noscar_nest",
        "head_noscar_nest",
        "echo_oscar",
        "dev_admin",
        "sierra_oscar",
        "head_sierra_oscar",
        "compliance_oscar",
        "head_compliance_oscar",
        "welfare_oscar",
        "head_welfare_oscar",
        "hospitality_oscar",
        "head_hospitality_oscar",
        "serial_oscar",
        "head_serial_oscar",
      ],
      vehicle_status: [
        "idle",
        "on_mission",
        "maintenance",
        "disabled",
        "active",
      ],
    },
  },
} as const
