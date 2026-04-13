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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_sessions: {
        Row: {
          agent_id: string
          agent_leg_answered_at: string | null
          campaign_id: string | null
          channel_id: string | null
          created_at: string | null
          created_by: string | null
          ended_at: string | null
          last_state_at: string
          metadata: Json | null
          org_id: string
          paused_reason: string | null
          registration_verified: boolean
          registration_verified_at: string | null
          session_id: string
          started_at: string
          state: Database["public"]["Enums"]["agent_state"]
          updated_at: string | null
          updated_by: string | null
          waiting_bridge_id: string | null
        }
        Insert: {
          agent_id: string
          agent_leg_answered_at?: string | null
          campaign_id?: string | null
          channel_id?: string | null
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          last_state_at?: string
          metadata?: Json | null
          org_id: string
          paused_reason?: string | null
          registration_verified?: boolean
          registration_verified_at?: string | null
          session_id: string
          started_at?: string
          state?: Database["public"]["Enums"]["agent_state"]
          updated_at?: string | null
          updated_by?: string | null
          waiting_bridge_id?: string | null
        }
        Update: {
          agent_id?: string
          agent_leg_answered_at?: string | null
          campaign_id?: string | null
          channel_id?: string | null
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          last_state_at?: string
          metadata?: Json | null
          org_id?: string
          paused_reason?: string | null
          registration_verified?: boolean
          registration_verified_at?: string | null
          session_id?: string
          started_at?: string
          state?: Database["public"]["Enums"]["agent_state"]
          updated_at?: string | null
          updated_by?: string | null
          waiting_bridge_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "agent_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      agent_state_history: {
        Row: {
          agent_id: string
          from_state: Database["public"]["Enums"]["agent_state"] | null
          history_id: string
          occurred_at: string
          org_id: string
          reason: string | null
          session_id: string
          to_state: Database["public"]["Enums"]["agent_state"]
        }
        Insert: {
          agent_id: string
          from_state?: Database["public"]["Enums"]["agent_state"] | null
          history_id: string
          occurred_at?: string
          org_id: string
          reason?: string | null
          session_id: string
          to_state: Database["public"]["Enums"]["agent_state"]
        }
        Update: {
          agent_id?: string
          from_state?: Database["public"]["Enums"]["agent_state"] | null
          history_id?: string
          occurred_at?: string
          org_id?: string
          reason?: string | null
          session_id?: string
          to_state?: Database["public"]["Enums"]["agent_state"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_state_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "agent_state_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      ai_events: {
        Row: {
          ai_event_id: string
          call_id: string | null
          campaign_id: string | null
          created_at: string | null
          created_by: string | null
          event_type: string
          occurred_at: string | null
          org_id: string
          payload: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          ai_event_id: string
          call_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          created_by?: string | null
          event_type: string
          occurred_at?: string | null
          org_id: string
          payload?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          ai_event_id?: string
          call_id?: string | null
          campaign_id?: string | null
          created_at?: string | null
          created_by?: string | null
          event_type?: string
          occurred_at?: string | null
          org_id?: string
          payload?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["call_id"]
          },
          {
            foreignKeyName: "ai_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ai_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          ai_settings_id: string
          campaign_id: string | null
          created_at: string | null
          created_by: string | null
          is_active: boolean | null
          llm_provider: string | null
          metadata: Json | null
          model_id: string | null
          org_id: string
          stt_provider: string | null
          tts_provider: string | null
          updated_at: string | null
          updated_by: string | null
          voice_id: string | null
        }
        Insert: {
          ai_settings_id: string
          campaign_id?: string | null
          created_at?: string | null
          created_by?: string | null
          is_active?: boolean | null
          llm_provider?: string | null
          metadata?: Json | null
          model_id?: string | null
          org_id: string
          stt_provider?: string | null
          tts_provider?: string | null
          updated_at?: string | null
          updated_by?: string | null
          voice_id?: string | null
        }
        Update: {
          ai_settings_id?: string
          campaign_id?: string | null
          created_at?: string | null
          created_by?: string | null
          is_active?: boolean | null
          llm_provider?: string | null
          metadata?: Json | null
          model_id?: string | null
          org_id?: string
          stt_provider?: string | null
          tts_provider?: string | null
          updated_at?: string | null
          updated_by?: string | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ai_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_id: string
          assigned_agent_id: string | null
          calendar_event_id: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          duration_minutes: number | null
          end_time: string
          lead_id: string | null
          notes: string | null
          org_id: string
          start_time: string
          status: string
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string
          assigned_agent_id?: string | null
          calendar_event_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          end_time: string
          lead_id?: string | null
          notes?: string | null
          org_id: string
          start_time: string
          status?: string
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string
          assigned_agent_id?: string | null
          calendar_event_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number | null
          end_time?: string
          lead_id?: string | null
          notes?: string | null
          org_id?: string
          start_time?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_lead_wrapup_context"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "appointments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          org_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          org_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          org_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      billing_info: {
        Row: {
          additional_recipients: string[] | null
          address_line1: string | null
          address_line2: string | null
          billing_email: string | null
          billing_phone: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          id: string
          org_id: string
          state: string | null
          tax_exempt: boolean
          tax_id: string | null
          updated_at: string | null
          zip: string | null
        }
        Insert: {
          additional_recipients?: string[] | null
          address_line1?: string | null
          address_line2?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          org_id: string
          state?: string | null
          tax_exempt?: boolean
          tax_id?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Update: {
          additional_recipients?: string[] | null
          address_line1?: string | null
          address_line2?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          org_id?: string
          state?: string | null
          tax_exempt?: boolean
          tax_id?: string | null
          updated_at?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_info_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      call_events: {
        Row: {
          call_id: string
          event_id: string
          event_type: string
          occurred_at: string
          org_id: string
          payload: Json | null
        }
        Insert: {
          call_id: string
          event_id: string
          event_type: string
          occurred_at?: string
          org_id: string
          payload?: Json | null
        }
        Update: {
          call_id?: string
          event_id?: string
          event_type?: string
          occurred_at?: string
          org_id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["call_id"]
          },
          {
            foreignKeyName: "call_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      calls: {
        Row: {
          amd_result: Database["public"]["Enums"]["amd_result"] | null
          assigned_agent: string | null
          call_id: string
          campaign_id: string | null
          cl_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          lead_id: string | null
          metadata: Json | null
          org_id: string
          phone_number_id: string | null
          recording_url: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amd_result?: Database["public"]["Enums"]["amd_result"] | null
          assigned_agent?: string | null
          call_id: string
          campaign_id?: string | null
          cl_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          direction: string
          duration_seconds?: number | null
          ended_at?: string | null
          lead_id?: string | null
          metadata?: Json | null
          org_id: string
          phone_number_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amd_result?: Database["public"]["Enums"]["amd_result"] | null
          assigned_agent?: string | null
          call_id?: string
          campaign_id?: string | null
          cl_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          lead_id?: string | null
          metadata?: Json | null
          org_id?: string
          phone_number_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_assigned_agent_fkey"
            columns: ["assigned_agent"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "calls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "calls_cl_id_fkey"
            columns: ["cl_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["cl_id"]
          },
          {
            foreignKeyName: "calls_cl_id_fkey"
            columns: ["cl_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_lead_wrapup_context"
            referencedColumns: ["cl_id"]
          },
          {
            foreignKeyName: "calls_cl_id_fkey"
            columns: ["cl_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_queue"
            referencedColumns: ["cl_id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_lead_wrapup_context"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "calls_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["phone_number_id"]
          },
        ]
      }
      campaign_ai_settings: {
        Row: {
          campaign_id: string
          llm_provider: string | null
          stt_provider: string | null
          tenant_id: string
          tts_provider: string | null
          updated_at: string | null
        }
        Insert: {
          campaign_id: string
          llm_provider?: string | null
          stt_provider?: string | null
          tenant_id: string
          tts_provider?: string | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string
          llm_provider?: string | null
          stt_provider?: string | null
          tenant_id?: string
          tts_provider?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_ai_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_ai_settings"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          active_call_attempt_id: string | null
          assigned_agent: string | null
          attempts: number | null
          callback_at: string | null
          campaign_id: string
          cl_id: string
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          dial_state: string
          is_callable: boolean
          last_call_attempt_id: string | null
          last_call_id: string | null
          last_called_at: string | null
          last_disposition: string | null
          lead_id: string
          max_attempts: number | null
          metadata: Json | null
          next_retry_at: string | null
          org_id: string
          phone: string
          priority: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          active_call_attempt_id?: string | null
          assigned_agent?: string | null
          attempts?: number | null
          callback_at?: string | null
          campaign_id: string
          cl_id: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dial_state?: string
          is_callable?: boolean
          last_call_attempt_id?: string | null
          last_call_id?: string | null
          last_called_at?: string | null
          last_disposition?: string | null
          lead_id: string
          max_attempts?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          org_id: string
          phone: string
          priority?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          active_call_attempt_id?: string | null
          assigned_agent?: string | null
          attempts?: number | null
          callback_at?: string | null
          campaign_id?: string
          cl_id?: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          dial_state?: string
          is_callable?: boolean
          last_call_attempt_id?: string | null
          last_call_id?: string | null
          last_called_at?: string | null
          last_disposition?: string | null
          lead_id?: string
          max_attempts?: number | null
          metadata?: Json | null
          next_retry_at?: string | null
          org_id?: string
          phone?: string
          priority?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_assigned_agent_fkey"
            columns: ["assigned_agent"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "campaign_leads_last_call_id_fkey"
            columns: ["last_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["call_id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_lead_wrapup_context"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "campaign_leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      campaigns: {
        Row: {
          campaign_id: string
          channel: string | null
          created_at: string | null
          created_by: string | null
          ends_at: string | null
          metadata: Json | null
          name: string
          org_id: string
          starts_at: string | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          campaign_id: string
          channel?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          metadata?: Json | null
          name: string
          org_id: string
          starts_at?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          campaign_id?: string
          channel?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          metadata?: Json | null
          name?: string
          org_id?: string
          starts_at?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      contacts: {
        Row: {
          contact_id: string
          created_at: string | null
          created_by: string | null
          email: string | null
          first_name: string | null
          last_name: string | null
          metadata: Json | null
          org_id: string
          phone: string | null
          source: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          metadata?: Json | null
          org_id: string
          phone?: string | null
          source?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          metadata?: Json | null
          org_id?: string
          phone?: string | null
          source?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      dialer_call_attempts: {
        Row: {
          agent_channel_id: string | null
          agent_disposition: string | null
          agent_endpoint: string | null
          agent_user_id: string | null
          answered_at: string | null
          bridge_id: string | null
          bridged_at: string | null
          call_id: string | null
          callback_at: string | null
          campaign_id: string | null
          cl_id: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          lead_channel_id: string | null
          lead_id: string
          notes_count: number
          org_id: string
          provider: string
          provider_bridge_id: string | null
          provider_call_id: string | null
          provider_channel_id: string | null
          session_id: string | null
          started_at: string
          system_outcome: string | null
          talk_seconds: number | null
          to_number: string
          updated_at: string
          wrap_up_status: string
        }
        Insert: {
          agent_channel_id?: string | null
          agent_disposition?: string | null
          agent_endpoint?: string | null
          agent_user_id?: string | null
          answered_at?: string | null
          bridge_id?: string | null
          bridged_at?: string | null
          call_id?: string | null
          callback_at?: string | null
          campaign_id?: string | null
          cl_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          lead_channel_id?: string | null
          lead_id: string
          notes_count?: number
          org_id: string
          provider?: string
          provider_bridge_id?: string | null
          provider_call_id?: string | null
          provider_channel_id?: string | null
          session_id?: string | null
          started_at?: string
          system_outcome?: string | null
          talk_seconds?: number | null
          to_number: string
          updated_at?: string
          wrap_up_status?: string
        }
        Update: {
          agent_channel_id?: string | null
          agent_disposition?: string | null
          agent_endpoint?: string | null
          agent_user_id?: string | null
          answered_at?: string | null
          bridge_id?: string | null
          bridged_at?: string | null
          call_id?: string | null
          callback_at?: string | null
          campaign_id?: string | null
          cl_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          lead_channel_id?: string | null
          lead_id?: string
          notes_count?: number
          org_id?: string
          provider?: string
          provider_bridge_id?: string | null
          provider_call_id?: string | null
          provider_channel_id?: string | null
          session_id?: string | null
          started_at?: string
          system_outcome?: string | null
          talk_seconds?: number | null
          to_number?: string
          updated_at?: string
          wrap_up_status?: string
        }
        Relationships: []
      }
      dispositions: {
        Row: {
          agent_id: string | null
          call_id: string
          callback_at: string | null
          cl_id: string | null
          created_at: string | null
          created_by: string | null
          disposition_id: string
          duration_wrap: number | null
          metadata: Json | null
          notes: string | null
          org_id: string
          outcome: Database["public"]["Enums"]["disposition_outcome"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          agent_id?: string | null
          call_id: string
          callback_at?: string | null
          cl_id?: string | null
          created_at?: string | null
          created_by?: string | null
          disposition_id: string
          duration_wrap?: number | null
          metadata?: Json | null
          notes?: string | null
          org_id: string
          outcome: Database["public"]["Enums"]["disposition_outcome"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          agent_id?: string | null
          call_id?: string
          callback_at?: string | null
          cl_id?: string | null
          created_at?: string | null
          created_by?: string | null
          disposition_id?: string
          duration_wrap?: number | null
          metadata?: Json | null
          notes?: string | null
          org_id?: string
          outcome?: Database["public"]["Enums"]["disposition_outcome"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispositions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "dispositions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["call_id"]
          },
          {
            foreignKeyName: "dispositions_cl_id_fkey"
            columns: ["cl_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["cl_id"]
          },
          {
            foreignKeyName: "dispositions_cl_id_fkey"
            columns: ["cl_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_lead_wrapup_context"
            referencedColumns: ["cl_id"]
          },
          {
            foreignKeyName: "dispositions_cl_id_fkey"
            columns: ["cl_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_queue"
            referencedColumns: ["cl_id"]
          },
          {
            foreignKeyName: "dispositions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      dnc_numbers: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          org_id: string
          phone_number: string
          reason: string | null
          source: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          org_id: string
          phone_number: string
          reason?: string | null
          source?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          org_id?: string
          phone_number?: string
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "dnc_numbers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token_encrypted: string | null
          config: Json
          created_at: string | null
          created_by: string | null
          error_message: string | null
          integration_id: string
          last_synced_at: string | null
          org_id: string
          provider: string
          refresh_token_encrypted: string | null
          status: string
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          integration_id?: string
          last_synced_at?: string | null
          org_id: string
          provider: string
          refresh_token_encrypted?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          integration_id?: string
          last_synced_at?: string | null
          org_id?: string
          provider?: string
          refresh_token_encrypted?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      lead_disposition_events: {
        Row: {
          agent_user_id: string
          call_attempt_id: string | null
          callback_at: string | null
          campaign_id: string | null
          created_at: string
          disposition: string
          id: string
          lead_id: string
          metadata: Json
          note_id: string | null
          org_id: string
        }
        Insert: {
          agent_user_id: string
          call_attempt_id?: string | null
          callback_at?: string | null
          campaign_id?: string | null
          created_at?: string
          disposition: string
          id?: string
          lead_id: string
          metadata?: Json
          note_id?: string | null
          org_id: string
        }
        Update: {
          agent_user_id?: string
          call_attempt_id?: string | null
          callback_at?: string | null
          campaign_id?: string | null
          created_at?: string
          disposition?: string
          id?: string
          lead_id?: string
          metadata?: Json
          note_id?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_disposition_events_call_attempt_id_fkey"
            columns: ["call_attempt_id"]
            isOneToOne: false
            referencedRelation: "dialer_call_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_disposition_events_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "lead_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_list_members: {
        Row: {
          contact_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          import_status: string
          lead_id: string | null
          list_id: string
          org_id: string
          raw_row: Json | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          import_status?: string
          lead_id?: string | null
          list_id: string
          org_id: string
          raw_row?: Json | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          import_status?: string
          lead_id?: string | null
          list_id?: string
          org_id?: string
          raw_row?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_list_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "lead_list_members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_list_members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_lead_wrapup_context"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "lead_list_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      lead_lists: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duplicate_rows: number
          error_message: string | null
          failed_rows: number
          file_name: string | null
          file_url: string | null
          imported_rows: number
          list_id: string
          name: string
          org_id: string
          source_type: string
          status: string
          total_rows: number
          updated_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duplicate_rows?: number
          error_message?: string | null
          failed_rows?: number
          file_name?: string | null
          file_url?: string | null
          imported_rows?: number
          list_id?: string
          name: string
          org_id: string
          source_type?: string
          status?: string
          total_rows?: number
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duplicate_rows?: number
          error_message?: string | null
          failed_rows?: number
          file_name?: string | null
          file_url?: string | null
          imported_rows?: number
          list_id?: string
          name?: string
          org_id?: string
          source_type?: string
          status?: string
          total_rows?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "lead_lists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_user_id: string
          body: string
          call_attempt_id: string | null
          campaign_id: string | null
          created_at: string
          id: string
          is_pinned: boolean
          lead_id: string
          note_type: string
          org_id: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          call_attempt_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          lead_id: string
          note_type?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          call_attempt_id?: string | null
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          lead_id?: string
          note_type?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_call_attempt_id_fkey"
            columns: ["call_attempt_id"]
            isOneToOne: false
            referencedRelation: "dialer_call_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          lead_id: string
          org_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id: string
          org_id: string
          tag_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id?: string
          org_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_lead_wrapup_context"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "lead_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["tag_id"]
          },
        ]
      }
      leads: {
        Row: {
          attempt_count: number
          callback_at: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          do_not_call: boolean
          estimated_value: number | null
          last_agent_disposition: string | null
          last_call_attempt_id: string | null
          last_called_at: string | null
          last_system_outcome: string | null
          latest_note: string | null
          lead_id: string
          metadata: Json | null
          org_id: string
          score: number | null
          source: string | null
          stage: string | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          attempt_count?: number
          callback_at?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          do_not_call?: boolean
          estimated_value?: number | null
          last_agent_disposition?: string | null
          last_call_attempt_id?: string | null
          last_called_at?: string | null
          last_system_outcome?: string | null
          latest_note?: string | null
          lead_id: string
          metadata?: Json | null
          org_id: string
          score?: number | null
          source?: string | null
          stage?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          attempt_count?: number
          callback_at?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          do_not_call?: boolean
          estimated_value?: number | null
          last_agent_disposition?: string | null
          last_call_attempt_id?: string | null
          last_called_at?: string | null
          last_system_outcome?: string | null
          latest_note?: string | null
          lead_id?: string
          metadata?: Json | null
          org_id?: string
          score?: number | null
          source?: string | null
          stage?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "leads_last_call_attempt_id_fkey"
            columns: ["last_call_attempt_id"]
            isOneToOne: false
            referencedRelation: "dialer_call_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          email_enabled: boolean
          events: Json
          id: string
          org_id: string
          push_enabled: boolean
          sms_enabled: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_enabled?: boolean
          events?: Json
          id?: string
          org_id: string
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_enabled?: boolean
          events?: Json
          id?: string
          org_id?: string
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          notification_id: string
          org_id: string
          read: boolean
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          notification_id?: string
          org_id: string
          read?: boolean
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          notification_id?: string
          org_id?: string
          read?: boolean
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      opportunities: {
        Row: {
          assigned_agent: string | null
          campaign_id: string | null
          close_date: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          lead_id: string | null
          notes: string | null
          opportunity_id: string
          org_id: string
          pipeline_id: string | null
          stage_id: string | null
          status: string
          title: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          assigned_agent?: string | null
          campaign_id?: string | null
          close_date?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          lead_id?: string | null
          notes?: string | null
          opportunity_id?: string
          org_id: string
          pipeline_id?: string | null
          stage_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          assigned_agent?: string | null
          campaign_id?: string | null
          close_date?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          lead_id?: string | null
          notes?: string | null
          opportunity_id?: string
          org_id?: string
          pipeline_id?: string | null
          stage_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_lead_wrapup_context"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "opportunities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["pipeline_id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["stage_id"]
          },
        ]
      }
      org_profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          authorized_rep_email: string | null
          authorized_rep_first: string | null
          authorized_rep_last: string | null
          authorized_rep_title: string | null
          branded_domain: string | null
          business_industry: string | null
          business_niche: string | null
          business_type: string | null
          city: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          friendly_name: string | null
          legal_name: string | null
          location_id: string | null
          logo_url: string | null
          org_id: string
          outbound_language: string | null
          phone: string | null
          platform_language: string | null
          state: string | null
          timezone: string | null
          updated_at: string | null
          voicemail_url: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          authorized_rep_email?: string | null
          authorized_rep_first?: string | null
          authorized_rep_last?: string | null
          authorized_rep_title?: string | null
          branded_domain?: string | null
          business_industry?: string | null
          business_niche?: string | null
          business_type?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          friendly_name?: string | null
          legal_name?: string | null
          location_id?: string | null
          logo_url?: string | null
          org_id: string
          outbound_language?: string | null
          phone?: string | null
          platform_language?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string | null
          voicemail_url?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          authorized_rep_email?: string | null
          authorized_rep_first?: string | null
          authorized_rep_last?: string | null
          authorized_rep_title?: string | null
          branded_domain?: string | null
          business_industry?: string | null
          business_niche?: string | null
          business_type?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          friendly_name?: string | null
          legal_name?: string | null
          location_id?: string | null
          logo_url?: string | null
          org_id?: string
          outbound_language?: string | null
          phone?: string | null
          platform_language?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string | null
          voicemail_url?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string | null
          created_by: string | null
          metadata: Json | null
          name: string
          org_id: string
          status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          metadata?: Json | null
          name: string
          org_id: string
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          metadata?: Json | null
          name?: string
          org_id?: string
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          created_at: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          org_id: string
          provider: string
          provider_payment_method_id: string
          updated_at: string | null
        }
        Insert: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          org_id: string
          provider?: string
          provider_payment_method_id: string
          updated_at?: string | null
        }
        Update: {
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          org_id?: string
          provider?: string
          provider_payment_method_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      phone_numbers: {
        Row: {
          campaign_id: string | null
          capability: Json | null
          created_at: string | null
          created_by: string | null
          e164: string
          org_id: string
          phone_number_id: string
          provider: string | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          campaign_id?: string | null
          capability?: Json | null
          created_at?: string | null
          created_by?: string | null
          e164: string
          org_id: string
          phone_number_id: string
          provider?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          campaign_id?: string | null
          capability?: Json | null
          created_at?: string | null
          created_by?: string | null
          e164?: string
          org_id?: string
          phone_number_id?: string
          provider?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_numbers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string | null
          name: string
          org_id: string
          pipeline_id: string
          probability: number | null
          sort_order: number
          stage_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          name: string
          org_id: string
          pipeline_id: string
          probability?: number | null
          sort_order?: number
          stage_id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          name?: string
          org_id?: string
          pipeline_id?: string
          probability?: number | null
          sort_order?: number
          stage_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["pipeline_id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string | null
          created_by: string | null
          is_default: boolean
          name: string
          org_id: string
          pipeline_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          is_default?: boolean
          name: string
          org_id: string
          pipeline_id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          is_default?: boolean
          name?: string
          org_id?: string
          pipeline_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      recordings: {
        Row: {
          call_id: string
          created_at: string | null
          created_by: string | null
          duration_secs: number | null
          format: string | null
          metadata: Json | null
          org_id: string
          recording_id: string
          size_bytes: number | null
          storage_url: string
          transcribed: boolean | null
          transcript_url: string | null
        }
        Insert: {
          call_id: string
          created_at?: string | null
          created_by?: string | null
          duration_secs?: number | null
          format?: string | null
          metadata?: Json | null
          org_id: string
          recording_id: string
          size_bytes?: number | null
          storage_url: string
          transcribed?: boolean | null
          transcript_url?: string | null
        }
        Update: {
          call_id?: string
          created_at?: string | null
          created_by?: string | null
          duration_secs?: number | null
          format?: string | null
          metadata?: Json | null
          org_id?: string
          recording_id?: string
          size_bytes?: number | null
          storage_url?: string
          transcribed?: boolean | null
          transcript_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recordings_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["call_id"]
          },
          {
            foreignKeyName: "recordings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          monthly_cost: number | null
          org_id: string
          plan_name: string
          plan_tier: string
          provider: string
          provider_subscription_id: string | null
          seats_included: number
          seats_used: number
          status: string
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          monthly_cost?: number | null
          org_id: string
          plan_name?: string
          plan_tier?: string
          provider?: string
          provider_subscription_id?: string | null
          seats_included?: number
          seats_used?: number
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          monthly_cost?: number | null
          org_id?: string
          plan_name?: string
          plan_tier?: string
          provider?: string
          provider_subscription_id?: string | null
          seats_included?: number
          seats_used?: number
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      tags: {
        Row: {
          category: string | null
          color: string | null
          created_at: string | null
          created_by: string | null
          name: string
          org_id: string
          tag_id: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          name: string
          org_id: string
          tag_id?: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          name?: string
          org_id?: string
          tag_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      tenant_ai_settings: {
        Row: {
          llm_provider: string | null
          stt_provider: string | null
          tenant_id: string
          tts_provider: string | null
          updated_at: string | null
        }
        Insert: {
          llm_provider?: string | null
          stt_provider?: string | null
          tenant_id: string
          tts_provider?: string | null
          updated_at?: string | null
        }
        Update: {
          llm_provider?: string | null
          stt_provider?: string | null
          tenant_id?: string
          tts_provider?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trunks: {
        Row: {
          cps_limit: number | null
          created_at: string | null
          created_by: string | null
          is_active: boolean | null
          max_channels: number | null
          metadata: Json | null
          name: string
          org_id: string
          provider: string
          sip_host: string | null
          sip_port: number | null
          trunk_id: string
          updated_at: string | null
          updated_by: string | null
          username: string | null
        }
        Insert: {
          cps_limit?: number | null
          created_at?: string | null
          created_by?: string | null
          is_active?: boolean | null
          max_channels?: number | null
          metadata?: Json | null
          name: string
          org_id: string
          provider: string
          sip_host?: string | null
          sip_port?: number | null
          trunk_id: string
          updated_at?: string | null
          updated_by?: string | null
          username?: string | null
        }
        Update: {
          cps_limit?: number | null
          created_at?: string | null
          created_by?: string | null
          is_active?: boolean | null
          max_channels?: number | null
          metadata?: Json | null
          name?: string
          org_id?: string
          provider?: string
          sip_host?: string | null
          sip_port?: number | null
          trunk_id?: string
          updated_at?: string | null
          updated_by?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trunks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          full_name: string | null
          metadata: Json | null
          org_id: string
          role: string | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          full_name?: string | null
          metadata?: Json | null
          org_id: string
          role?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          full_name?: string | null
          metadata?: Json | null
          org_id?: string
          role?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      workflow_actions: {
        Row: {
          action_id: string
          action_type: string
          config: Json
          created_at: string | null
          org_id: string
          sort_order: number
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          action_id?: string
          action_type: string
          config?: Json
          created_at?: string | null
          org_id: string
          sort_order?: number
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          action_id?: string
          action_type?: string
          config?: Json
          created_at?: string | null
          org_id?: string
          sort_order?: number
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "workflow_actions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["workflow_id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          ended_at: string | null
          error_message: string | null
          execution_id: string
          org_id: string
          started_at: string
          status: string
          trigger_event: Json
          workflow_id: string
        }
        Insert: {
          ended_at?: string | null
          error_message?: string | null
          execution_id?: string
          org_id: string
          started_at?: string
          status?: string
          trigger_event?: Json
          workflow_id: string
        }
        Update: {
          ended_at?: string | null
          error_message?: string | null
          execution_id?: string
          org_id?: string
          started_at?: string
          status?: string
          trigger_event?: Json
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["workflow_id"]
          },
        ]
      }
      workflow_triggers: {
        Row: {
          conditions: Json
          created_at: string | null
          event_type: string
          org_id: string
          trigger_id: string
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          conditions?: Json
          created_at?: string | null
          event_type: string
          org_id: string
          trigger_id?: string
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          conditions?: Json
          created_at?: string | null
          event_type?: string
          org_id?: string
          trigger_id?: string
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_triggers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "workflow_triggers_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["workflow_id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          execution_count: number
          is_active: boolean
          last_executed_at: string | null
          name: string
          org_id: string
          trigger_type: string
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          execution_count?: number
          is_active?: boolean
          last_executed_at?: string | null
          name: string
          org_id: string
          trigger_type: string
          updated_at?: string | null
          workflow_id?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          execution_count?: number
          is_active?: boolean
          last_executed_at?: string | null
          name?: string
          org_id?: string
          trigger_type?: string
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
    }
    Views: {
      v_dialer_lead_wrapup_context: {
        Row: {
          attempt_count: number | null
          callback_at: string | null
          campaign_id: string | null
          cl_id: string | null
          dial_state: string | null
          do_not_call: boolean | null
          first_name: string | null
          is_callable: boolean | null
          last_agent_disposition: string | null
          last_call_attempt_id: string | null
          last_called_at: string | null
          last_name: string | null
          last_system_outcome: string | null
          latest_note: string | null
          lead_id: string | null
          next_retry_at: string | null
          org_id: string | null
          phone: string | null
          queue_last_call_attempt_id: string | null
          queue_last_disposition: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "leads_last_call_attempt_id_fkey"
            columns: ["last_call_attempt_id"]
            isOneToOne: false
            referencedRelation: "dialer_call_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
      v_dialer_queue: {
        Row: {
          assigned_agent: string | null
          attempts: number | null
          callback_at: string | null
          campaign_id: string | null
          campaign_name: string | null
          campaign_status: string | null
          cl_id: string | null
          contact_id: string | null
          dial_state: string | null
          last_call_id: string | null
          lead_id: string | null
          max_attempts: number | null
          org_id: string | null
          phone: string | null
          priority: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_assigned_agent_fkey"
            columns: ["assigned_agent"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "campaign_leads_last_call_id_fkey"
            columns: ["last_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["call_id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_dialer_lead_wrapup_context"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "campaign_leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["org_id"]
          },
        ]
      }
    }
    Functions: {
      apply_dialer_wrap_up: {
        Args: {
          p_agent_disposition: string
          p_author_user_id?: string
          p_call_attempt_id: string
          p_callback_at?: string
          p_notes?: string
        }
        Returns: {
          out_call_attempt_id: string
          out_campaign_id: string
          out_lead_id: string
          out_note_id: string
          out_saved_callback_at: string
          out_saved_disposition: string
        }[]
      }
    }
    Enums: {
      agent_state:
        | "OFFLINE"
        | "READY"
        | "RESERVED"
        | "INCALL"
        | "WRAP"
        | "PAUSED"
      amd_result: "HUMAN" | "MACHINE" | "NOTSURE" | "FAILED" | "TIMEOUT"
      disposition_outcome:
        | "ANSWERED_HUMAN"
        | "ANSWERED_MACHINE"
        | "NO_ANSWER"
        | "BUSY"
        | "FAILED"
        | "DNC"
        | "CALLBACK"
        | "SALE"
        | "NOT_INTERESTED"
        | "WRONG_NUMBER"
        | "OTHER"
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
  public: {
    Enums: {
      agent_state: ["OFFLINE", "READY", "RESERVED", "INCALL", "WRAP", "PAUSED"],
      amd_result: ["HUMAN", "MACHINE", "NOTSURE", "FAILED", "TIMEOUT"],
      disposition_outcome: [
        "ANSWERED_HUMAN",
        "ANSWERED_MACHINE",
        "NO_ANSWER",
        "BUSY",
        "FAILED",
        "DNC",
        "CALLBACK",
        "SALE",
        "NOT_INTERESTED",
        "WRONG_NUMBER",
        "OTHER",
      ],
    },
  },
} as const
