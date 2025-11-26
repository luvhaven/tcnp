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
  auth: {
    Tables: {
      audit_log_entries: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string | null
          ip_address: string
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          id: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Relationships: []
      }
      flow_state: {
        Row: {
          auth_code: string
          auth_code_issued_at: string | null
          authentication_method: string
          code_challenge: string
          code_challenge_method: Database["auth"]["Enums"]["code_challenge_method"]
          created_at: string | null
          id: string
          provider_access_token: string | null
          provider_refresh_token: string | null
          provider_type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_code: string
          auth_code_issued_at?: string | null
          authentication_method: string
          code_challenge: string
          code_challenge_method: Database["auth"]["Enums"]["code_challenge_method"]
          created_at?: string | null
          id: string
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_code?: string
          auth_code_issued_at?: string | null
          authentication_method?: string
          code_challenge?: string
          code_challenge_method?: Database["auth"]["Enums"]["code_challenge_method"]
          created_at?: string | null
          id?: string
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          identity_data: Json
          last_sign_in_at: string | null
          provider: string
          provider_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data: Json
          last_sign_in_at?: string | null
          provider: string
          provider_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data?: Json
          last_sign_in_at?: string | null
          provider?: string
          provider_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          created_at: string | null
          id: string
          raw_base_config: string | null
          updated_at: string | null
          uuid: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Relationships: []
      }
      mfa_amr_claims: {
        Row: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Update: {
          authentication_method?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_amr_claims_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_challenges: {
        Row: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code: string | null
          verified_at: string | null
          web_authn_session_data: Json | null
        }
        Insert: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Update: {
          created_at?: string
          factor_id?: string
          id?: string
          ip_address?: unknown
          otp_code?: string | null
          verified_at?: string | null
          web_authn_session_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_challenges_auth_factor_id_fkey"
            columns: ["factor_id"]
            isOneToOne: false
            referencedRelation: "mfa_factors"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_factors: {
        Row: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name: string | null
          id: string
          last_challenged_at: string | null
          last_webauthn_challenge_data: Json | null
          phone: string | null
          secret: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid: string | null
          web_authn_credential: Json | null
        }
        Insert: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id: string
          last_challenged_at?: string | null
          last_webauthn_challenge_data?: Json | null
          phone?: string | null
          secret?: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Update: {
          created_at?: string
          factor_type?: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id?: string
          last_challenged_at?: string | null
          last_webauthn_challenge_data?: Json | null
          phone?: string | null
          secret?: string | null
          status?: Database["auth"]["Enums"]["factor_status"]
          updated_at?: string
          user_id?: string
          web_authn_aaguid?: string | null
          web_authn_credential?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_authorizations: {
        Row: {
          approved_at: string | null
          authorization_code: string | null
          authorization_id: string
          client_id: string
          code_challenge: string | null
          code_challenge_method:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at: string
          expires_at: string
          id: string
          redirect_uri: string
          resource: string | null
          response_type: Database["auth"]["Enums"]["oauth_response_type"]
          scope: string
          state: string | null
          status: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          authorization_code?: string | null
          authorization_id: string
          client_id: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string
          expires_at?: string
          id: string
          redirect_uri: string
          resource?: string | null
          response_type?: Database["auth"]["Enums"]["oauth_response_type"]
          scope: string
          state?: string | null
          status?: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          authorization_code?: string | null
          authorization_id?: string
          client_id?: string
          code_challenge?: string | null
          code_challenge_method?:
            | Database["auth"]["Enums"]["code_challenge_method"]
            | null
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri?: string
          resource?: string | null
          response_type?: Database["auth"]["Enums"]["oauth_response_type"]
          scope?: string
          state?: string | null
          status?: Database["auth"]["Enums"]["oauth_authorization_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_authorizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_clients: {
        Row: {
          client_name: string | null
          client_secret_hash: string | null
          client_type: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri: string | null
          created_at: string
          deleted_at: string | null
          grant_types: string
          id: string
          logo_uri: string | null
          redirect_uris: string
          registration_type: Database["auth"]["Enums"]["oauth_registration_type"]
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          client_secret_hash?: string | null
          client_type?: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri?: string | null
          created_at?: string
          deleted_at?: string | null
          grant_types: string
          id: string
          logo_uri?: string | null
          redirect_uris: string
          registration_type: Database["auth"]["Enums"]["oauth_registration_type"]
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          client_secret_hash?: string | null
          client_type?: Database["auth"]["Enums"]["oauth_client_type"]
          client_uri?: string | null
          created_at?: string
          deleted_at?: string | null
          grant_types?: string
          id?: string
          logo_uri?: string | null
          redirect_uris?: string
          registration_type?: Database["auth"]["Enums"]["oauth_registration_type"]
          updated_at?: string
        }
        Relationships: []
      }
      oauth_consents: {
        Row: {
          client_id: string
          granted_at: string
          id: string
          revoked_at: string | null
          scopes: string
          user_id: string
        }
        Insert: {
          client_id: string
          granted_at?: string
          id: string
          revoked_at?: string | null
          scopes: string
          user_id: string
        }
        Update: {
          client_id?: string
          granted_at?: string
          id?: string
          revoked_at?: string | null
          scopes?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      one_time_tokens: {
        Row: {
          created_at: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relates_to?: string
          token_hash?: string
          token_type?: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_time_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      refresh_tokens: {
        Row: {
          created_at: string | null
          id: number
          instance_id: string | null
          parent: string | null
          revoked: boolean | null
          session_id: string | null
          token: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refresh_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_providers: {
        Row: {
          attribute_mapping: Json | null
          created_at: string | null
          entity_id: string
          id: string
          metadata_url: string | null
          metadata_xml: string
          name_id_format: string | null
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id: string
          id: string
          metadata_url?: string | null
          metadata_xml: string
          name_id_format?: string | null
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id?: string
          id?: string
          metadata_url?: string | null
          metadata_xml?: string
          name_id_format?: string | null
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_providers_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_relay_states: {
        Row: {
          created_at: string | null
          flow_state_id: string | null
          for_email: string | null
          id: string
          redirect_to: string | null
          request_id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id: string
          redirect_to?: string | null
          request_id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id?: string
          redirect_to?: string | null
          request_id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_relay_states_flow_state_id_fkey"
            columns: ["flow_state_id"]
            isOneToOne: false
            referencedRelation: "flow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saml_relay_states_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          version: string
        }
        Insert: {
          version: string
        }
        Update: {
          version?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          aal: Database["auth"]["Enums"]["aal_level"] | null
          created_at: string | null
          factor_id: string | null
          id: string
          ip: unknown
          not_after: string | null
          oauth_client_id: string | null
          refresh_token_counter: number | null
          refresh_token_hmac_key: string | null
          refreshed_at: string | null
          tag: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id: string
          ip?: unknown
          not_after?: string | null
          oauth_client_id?: string | null
          refresh_token_counter?: number | null
          refresh_token_hmac_key?: string | null
          refreshed_at?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id?: string
          ip?: unknown
          not_after?: string | null
          oauth_client_id?: string | null
          refresh_token_counter?: number | null
          refresh_token_hmac_key?: string | null
          refreshed_at?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_oauth_client_id_fkey"
            columns: ["oauth_client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sso_domains_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_providers: {
        Row: {
          created_at: string | null
          disabled: boolean | null
          id: string
          resource_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          disabled?: boolean | null
          id: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          disabled?: boolean | null
          id?: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean
          is_sso_user: boolean
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      email: { Args: never; Returns: string }
      jwt: { Args: never; Returns: Json }
      role: { Args: never; Returns: string }
      uid: { Args: never; Returns: string }
    }
    Enums: {
      aal_level: "aal1" | "aal2" | "aal3"
      code_challenge_method: "s256" | "plain"
      factor_status: "unverified" | "verified"
      factor_type: "totp" | "webauthn" | "phone"
      oauth_authorization_status: "pending" | "approved" | "denied" | "expired"
      oauth_client_type: "public" | "confidential"
      oauth_registration_type: "dynamic" | "manual"
      oauth_response_type: "code"
      one_time_token_type:
        | "confirmation_token"
        | "reauthentication_token"
        | "recovery_token"
        | "email_change_token_new"
        | "email_change_token_current"
        | "phone_change_token"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
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
          id: string
          is_private: boolean | null
          mentions: Json | null
          program_id: string | null
          papa_id: string | null
          read_by: Json | null
          reply_to_id: string | null
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_private?: boolean | null
          mentions?: Json | null
          program_id?: string | null
          papa_id?: string | null
          read_by?: Json | null
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_private?: boolean | null
          mentions?: Json | null
          program_id?: string | null
          papa_id?: string | null
          read_by?: Json | null
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
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
      cheetahs: {
        Row: {
          call_sign: string | null
          capacity: number | null
          color: string | null
          created_at: string | null
          current_status: Database["public"]["Enums"]["vehicle_status"] | null
          driver_name: string
          driver_phone: string
          features: string | null
          fuel_status: string | null
          id: string
          last_latitude: number | null
          last_location_update: string | null
          last_longitude: number | null
          last_maintenance: string | null
          make: string | null
          model: string | null
          name: string | null
          next_maintenance: string | null
          notes: string | null
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
          driver_name: string
          driver_phone: string
          features?: string | null
          fuel_status?: string | null
          id?: string
          last_latitude?: number | null
          last_location_update?: string | null
          last_longitude?: number | null
          last_maintenance?: string | null
          make?: string | null
          model?: string | null
          name?: string | null
          next_maintenance?: string | null
          notes?: string | null
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
          driver_name?: string
          driver_phone?: string
          features?: string | null
          fuel_status?: string | null
          id?: string
          last_latitude?: number | null
          last_location_update?: string | null
          last_longitude?: number | null
          last_maintenance?: string | null
          make?: string | null
          model?: string | null
          name?: string | null
          next_maintenance?: string | null
          notes?: string | null
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
            foreignKeyName: "cheetahs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
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
      journeys: {
        Row: {
          assigned_cheetah_id: string | null
          assigned_do_id: string | null
          assigned_duty_officer_id: string | null
          assigned_eagle_square_id: string | null
          assigned_nest_id: string | null
          assigned_theatre_id: string | null
          created_at: string | null
          created_by: string | null
          current_call_sign: Database["public"]["Enums"]["call_sign"] | null
          description: string | null
          destination: string | null
          end_date: string | null
          eta: string | null
          etd: string | null
          id: string
          last_latitude: number | null
          last_location_update: string | null
          last_longitude: number | null
          name: string | null
          notes: string | null
          origin: string | null
          papa_id: string | null
          program_id: string | null
          route_geojson: Json | null
          start_date: string | null
          status: Database["public"]["Enums"]["journey_status"] | null
          telemetry_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          assigned_cheetah_id?: string | null
          assigned_do_id?: string | null
          assigned_duty_officer_id?: string | null
          assigned_eagle_square_id?: string | null
          assigned_nest_id?: string | null
          assigned_theatre_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_call_sign?: Database["public"]["Enums"]["call_sign"] | null
          description?: string | null
          destination?: string | null
          end_date?: string | null
          eta?: string | null
          etd?: string | null
          id?: string
          last_latitude?: number | null
          last_location_update?: string | null
          last_longitude?: number | null
          name?: string | null
          notes?: string | null
          origin?: string | null
          papa_id?: string | null
          program_id?: string | null
          route_geojson?: Json | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["journey_status"] | null
          telemetry_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          assigned_cheetah_id?: string | null
          assigned_do_id?: string | null
          assigned_duty_officer_id?: string | null
          assigned_eagle_square_id?: string | null
          assigned_nest_id?: string | null
          assigned_theatre_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_call_sign?: Database["public"]["Enums"]["call_sign"] | null
          description?: string | null
          destination?: string | null
          end_date?: string | null
          eta?: string | null
          etd?: string | null
          id?: string
          last_latitude?: number | null
          last_location_update?: string | null
          last_longitude?: number | null
          name?: string | null
          notes?: string | null
          origin?: string | null
          papa_id?: string | null
          program_id?: string | null
          route_geojson?: Json | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["journey_status"] | null
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
            foreignKeyName: "journeys_papa_id_fkey"
            columns: ["papa_id"]
            isOneToOne: false
            referencedRelation: "papas"
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
          rating: number | null
          room_assignments: Json | null
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
          rating?: number | null
          room_assignments?: Json | null
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
          rating?: number | null
          room_assignments?: Json | null
          updated_at?: string | null
        }
        Relationships: []
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
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string | null
          delivered_at?: string | null
          id?: string
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
          is_first_time: boolean | null
          mic_preference: string | null
          nationality: string | null
          needs: Json | null
          needs_face_towels: boolean | null
          needs_water_on_stage: boolean | null
          notes: string | null
          organization: string | null
          passport_number: string | null
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
          is_first_time?: boolean | null
          mic_preference?: string | null
          nationality?: string | null
          needs?: Json | null
          needs_face_towels?: boolean | null
          needs_water_on_stage?: boolean | null
          notes?: string | null
          organization?: string | null
          passport_number?: string | null
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
          is_first_time?: boolean | null
          mic_preference?: string | null
          nationality?: string | null
          needs?: Json | null
          needs_face_towels?: boolean | null
          needs_water_on_stage?: boolean | null
          notes?: string | null
          organization?: string | null
          passport_number?: string | null
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
            foreignKeyName: "papas_program_id_fkey"
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
      user_locations: {
        Row: {
          accuracy: number | null
          altitude: number | null
          battery_level: number | null
          created_at: string | null
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
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          current_title_id: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          is_online: boolean | null
          last_seen: string | null
          notification_preferences: Json | null
          oscar: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          timezone: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          activation_status?: string | null
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          current_title_id?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean | null
          is_online?: boolean | null
          last_seen?: string | null
          notification_preferences?: Json | null
          oscar?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          activation_status?: string | null
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          current_title_id?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          is_online?: boolean | null
          last_seen?: string | null
          notification_preferences?: Json | null
          oscar?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
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
      can_view_all_tracking: { Args: never; Returns: boolean }
      can_view_call_signs: { Args: never; Returns: boolean }
      cleanup_old_locations: { Args: never; Returns: undefined }
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
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
      dropgeometrytable:
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      export_program_data: { Args: { program_uuid: string }; Returns: Json }
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
      gettransactionid: { Args: never; Returns: unknown }
      has_any_claim_role:
        | {
            Args: { p_roles: Database["public"]["Enums"]["user_role"][] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_any_claim_role(p_roles => _text), public.has_any_claim_role(p_roles => _user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_roles: string[] }
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
            Args: { p_role: Database["public"]["Enums"]["user_role"] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_claim_role(p_role => text), public.has_claim_role(p_role => user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_role: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_claim_role(p_role => text), public.has_claim_role(p_role => user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      has_program_admin_access: { Args: never; Returns: boolean }
      has_role:
        | {
            Args: { p_role: Database["public"]["Enums"]["user_role"] }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_role(p_role => text), public.has_role(p_role => user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_role: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.has_role(p_role => text), public.has_role(p_role => user_role). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      has_role_from_db: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
      has_title: { Args: { p_title_code: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      is_alpha_oscar: { Args: never; Returns: boolean }
      is_delta_oscar: { Args: never; Returns: boolean }
      is_tango_oscar: { Args: never; Returns: boolean }
      is_valid_user_role: { Args: { p_role: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_message_read: {
        Args: { message_uuid: string; user_uuid: string }
        Returns: undefined
      }
      populate_geometry_columns:
        | { Args: { use_typmod?: boolean }; Returns: string }
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
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
      set_user_presence: {
        Args: { is_user_online: boolean }
        Returns: undefined
      }
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
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
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
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_askml:
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
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
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
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
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
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
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
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
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
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
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
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
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
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
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
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
        | { Args: { geom: unknown }; Returns: number }
        | { Args: { geog: unknown }; Returns: number }
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
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
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
      unlockrows: { Args: { "": string }; Returns: number }
      update_journey_call_sign: {
        Args: { journey_uuid: string; new_status: string }
        Returns: Json
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
          p_heading?: number
          p_latitude: number
          p_longitude: number
          p_speed?: number
          p_user_id: string
        }
        Returns: string
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
      notification_channel: "email" | "sms" | "push" | "whatsapp"
      notification_status: "pending" | "sent" | "failed" | "delivered"
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
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          level: number | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          level?: number | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      prefixes: {
        Row: {
          bucket_id: string
          created_at: string | null
          level: number
          name: string
          updated_at: string | null
        }
        Insert: {
          bucket_id: string
          created_at?: string | null
          level?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          bucket_id?: string
          created_at?: string | null
          level?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prefixes_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_prefixes: {
        Args: { _bucket_id: string; _name: string }
        Returns: undefined
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      delete_leaf_prefixes: {
        Args: { bucket_ids: string[]; names: string[] }
        Returns: undefined
      }
      delete_prefix: {
        Args: { _bucket_id: string; _name: string }
        Returns: boolean
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_level: { Args: { name: string }; Returns: number }
      get_prefix: { Args: { name: string }; Returns: string }
      get_prefixes: { Args: { name: string }; Returns: string[] }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          start_after?: string
        }
        Returns: {
          id: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      lock_top_prefixes: {
        Args: { bucket_ids: string[]; names: string[] }
        Returns: undefined
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_legacy_v1: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v1_optimised: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  auth: {
    Enums: {
      aal_level: ["aal1", "aal2", "aal3"],
      code_challenge_method: ["s256", "plain"],
      factor_status: ["unverified", "verified"],
      factor_type: ["totp", "webauthn", "phone"],
      oauth_authorization_status: ["pending", "approved", "denied", "expired"],
      oauth_client_type: ["public", "confidential"],
      oauth_registration_type: ["dynamic", "manual"],
      oauth_response_type: ["code"],
      one_time_token_type: [
        "confirmation_token",
        "reauthentication_token",
        "recovery_token",
        "email_change_token_new",
        "email_change_token_current",
        "phone_change_token",
      ],
    },
  },
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
      ],
      notification_channel: ["email", "sms", "push", "whatsapp"],
      notification_status: ["pending", "sent", "failed", "delivered"],
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
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
