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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_configs: {
        Row: {
          after_hours_response: string | null
          allowed_actions: string[]
          approval_required_actions: string[]
          business_description: string | null
          business_hours: Json
          business_id: string
          created_at: string
          enabled: boolean
          escalation_enabled: boolean
          escalation_rules: string | null
          greeting: string
          id: string
          max_call_seconds: number
          model_name: string
          model_provider: string
          name: string
          personality: string
          primary_language: string
          recording_enabled: boolean
          restricted_actions: string[]
          supported_languages: string[]
          system_instructions: string | null
          updated_at: string
          voice_name: string
          voice_speed: number
        }
        Insert: {
          after_hours_response?: string | null
          allowed_actions?: string[]
          approval_required_actions?: string[]
          business_description?: string | null
          business_hours?: Json
          business_id: string
          created_at?: string
          enabled?: boolean
          escalation_enabled?: boolean
          escalation_rules?: string | null
          greeting?: string
          id?: string
          max_call_seconds?: number
          model_name?: string
          model_provider?: string
          name?: string
          personality?: string
          primary_language?: string
          recording_enabled?: boolean
          restricted_actions?: string[]
          supported_languages?: string[]
          system_instructions?: string | null
          updated_at?: string
          voice_name?: string
          voice_speed?: number
        }
        Update: {
          after_hours_response?: string | null
          allowed_actions?: string[]
          approval_required_actions?: string[]
          business_description?: string | null
          business_hours?: Json
          business_id?: string
          created_at?: string
          enabled?: boolean
          escalation_enabled?: boolean
          escalation_rules?: string | null
          greeting?: string
          id?: string
          max_call_seconds?: number
          model_name?: string
          model_provider?: string
          name?: string
          personality?: string
          primary_language?: string
          recording_enabled?: boolean
          restricted_actions?: string[]
          supported_languages?: string[]
          system_instructions?: string | null
          updated_at?: string
          voice_name?: string
          voice_speed?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_configs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_knowledge: {
        Row: {
          active: boolean
          business_id: string
          content: string
          created_at: string
          embedding: Json | null
          id: string
          source_reference: string | null
          source_type: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          content: string
          created_at?: string
          embedding?: Json | null
          id?: string
          source_reference?: string | null
          source_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          content?: string
          created_at?: string
          embedding?: Json | null
          id?: string
          source_reference?: string | null
          source_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tools: {
        Row: {
          agent_config_id: string
          business_id: string
          config: Json
          created_at: string
          description: string
          enabled: boolean
          id: string
          name: string
          sort_order: number
          tool_type: string
          updated_at: string
        }
        Insert: {
          agent_config_id: string
          business_id: string
          config?: Json
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          name: string
          sort_order?: number
          tool_type?: string
          updated_at?: string
        }
        Update: {
          agent_config_id?: string
          business_id?: string
          config?: Json
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          name?: string
          sort_order?: number
          tool_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string | null
          id: string
          notes: string | null
          requested_date: string
          requested_time: string
          source_call_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          requested_date: string
          requested_time: string
          source_call_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          requested_date?: string
          requested_time?: string
          source_call_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_source_call_id_fkey"
            columns: ["source_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approved_price: number | null
          business_id: string
          created_at: string
          decided_by: string
          decision: Database["public"]["Enums"]["approval_decision"]
          escalation_id: string | null
          id: string
          message: string | null
        }
        Insert: {
          approved_price?: number | null
          business_id: string
          created_at?: string
          decided_by: string
          decision: Database["public"]["Enums"]["approval_decision"]
          escalation_id?: string | null
          id?: string
          message?: string | null
        }
        Update: {
          approved_price?: number | null
          business_id?: string
          created_at?: string
          decided_by?: string
          decision?: Database["public"]["Enums"]["approval_decision"]
          escalation_id?: string | null
          id?: string
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approvals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_escalation_id_fkey"
            columns: ["escalation_id"]
            isOneToOne: false
            referencedRelation: "escalations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_policies: {
        Row: {
          active: boolean
          business_id: string
          content: string
          created_at: string
          id: string
          policy_type: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          content: string
          created_at?: string
          id?: string
          policy_type: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          content?: string
          created_at?: string
          id?: string
          policy_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_policies_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_users: {
        Row: {
          auth_user_id: string
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["business_role"]
        }
        Insert: {
          auth_user_id: string
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["business_role"]
        }
        Update: {
          auth_user_id?: string
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["business_role"]
        }
        Relationships: [
          {
            foreignKeyName: "business_users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          created_at: string
          default_language: string
          email: string | null
          id: string
          legal_name: string | null
          name: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          default_language?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          name: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          default_language?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_events: {
        Row: {
          business_id: string
          call_id: string
          created_at: string
          event_data: Json
          event_type: string
          id: string
        }
        Insert: {
          business_id: string
          call_id: string
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
        }
        Update: {
          business_id?: string
          call_id?: string
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transcripts: {
        Row: {
          business_id: string
          call_id: string
          id: string
          metadata: Json
          speaker: string
          text: string
          timestamp: string
        }
        Insert: {
          business_id: string
          call_id: string
          id?: string
          metadata?: Json
          speaker: string
          text: string
          timestamp?: string
        }
        Update: {
          business_id?: string
          call_id?: string
          id?: string
          metadata?: Json
          speaker?: string
          text?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_transcripts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_transcripts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_config_id: string | null
          answered_at: string | null
          business_id: string
          caller_number: string | null
          created_at: string
          customer_id: string | null
          destination_number: string | null
          direction: Database["public"]["Enums"]["call_direction"]
          duration_seconds: number | null
          ended_at: string | null
          escalation_reason: string | null
          escalation_required: boolean
          id: string
          intent: string | null
          language: string | null
          latency_ms: number | null
          outcome: string | null
          provider: string
          provider_call_id: string | null
          recording_url: string | null
          started_at: string
          status: Database["public"]["Enums"]["call_status"]
          summary: string | null
          tools_used: string[]
        }
        Insert: {
          agent_config_id?: string | null
          answered_at?: string | null
          business_id: string
          caller_number?: string | null
          created_at?: string
          customer_id?: string | null
          destination_number?: string | null
          direction?: Database["public"]["Enums"]["call_direction"]
          duration_seconds?: number | null
          ended_at?: string | null
          escalation_reason?: string | null
          escalation_required?: boolean
          id?: string
          intent?: string | null
          language?: string | null
          latency_ms?: number | null
          outcome?: string | null
          provider?: string
          provider_call_id?: string | null
          recording_url?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["call_status"]
          summary?: string | null
          tools_used?: string[]
        }
        Update: {
          agent_config_id?: string | null
          answered_at?: string | null
          business_id?: string
          caller_number?: string | null
          created_at?: string
          customer_id?: string | null
          destination_number?: string | null
          direction?: Database["public"]["Enums"]["call_direction"]
          duration_seconds?: number | null
          ended_at?: string | null
          escalation_reason?: string | null
          escalation_required?: boolean
          id?: string
          intent?: string | null
          language?: string | null
          latency_ms?: number | null
          outcome?: string | null
          provider?: string
          provider_call_id?: string | null
          recording_url?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["call_status"]
          summary?: string | null
          tools_used?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "calls_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          id: string
          name: string | null
          notes: string | null
          phone: string
          preferred_language: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          phone: string
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string
          preferred_language?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          assigned_to: string | null
          business_id: string
          call_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          listed_price: number | null
          product_id: string | null
          reason: string
          requested_price: number | null
          resolved_at: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["escalation_status"]
          summary: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_id: string
          call_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          listed_price?: number | null
          product_id?: string | null
          reason: string
          requested_price?: number | null
          resolved_at?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["escalation_status"]
          summary?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_id?: string
          call_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          listed_price?: number | null
          product_id?: string | null
          reason?: string
          requested_price?: number | null
          resolved_at?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["escalation_status"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_numbers: {
        Row: {
          active: boolean
          agent_config_id: string | null
          business_id: string
          created_at: string
          id: string
          inbound_enabled: boolean
          label: string | null
          phone_number: string
          provider: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          agent_config_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          inbound_enabled?: boolean
          label?: string | null
          phone_number: string
          provider?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          agent_config_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          inbound_enabled?: boolean
          label?: string | null
          phone_number?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_agent_config_id_fkey"
            columns: ["agent_config_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_numbers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          active: boolean
          approval_required: boolean
          business_id: string
          created_at: string
          id: string
          maximum_discount_percent: number
          minimum_price: number | null
          product_id: string | null
          service_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          approval_required?: boolean
          business_id: string
          created_at?: string
          id?: string
          maximum_discount_percent?: number
          minimum_price?: number | null
          product_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          approval_required?: boolean
          business_id?: string
          created_at?: string
          id?: string
          maximum_discount_percent?: number
          minimum_price?: number | null
          product_id?: string | null
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          business_id: string
          category: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          metadata: Json
          name: string
          price: number | null
          stock_status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          price?: number | null
          stock_status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          price?: number | null
          stock_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          business_id: string
          description: string
          id: string
          product_id: string | null
          quantity: number
          quote_id: string
          service_id: string | null
          total: number
          unit_price: number
        }
        Insert: {
          business_id: string
          description: string
          id?: string
          product_id?: string | null
          quantity?: number
          quote_id: string
          service_id?: string | null
          total?: number
          unit_price?: number
        }
        Update: {
          business_id?: string
          description?: string
          id?: string
          product_id?: string | null
          quantity?: number
          quote_id?: string
          service_id?: string | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approval_required: boolean
          approved_by: string | null
          business_id: string
          created_at: string
          customer_id: string | null
          discount: number
          id: string
          quote_number: string
          source_call_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          approval_required?: boolean
          approved_by?: string | null
          business_id: string
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          quote_number: string
          source_call_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          approval_required?: boolean
          approved_by?: string | null
          business_id?: string
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          quote_number?: string
          source_call_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_source_call_id_fkey"
            columns: ["source_call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          base_price: number | null
          business_id: string
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price?: number | null
          business_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price?: number | null
          business_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      appointment_check: {
        Args: { _business_id: string; _date: string; _time: string }
        Returns: Json
      }
      current_business_id: { Args: never; Returns: string }
      discount_request: {
        Args: {
          _business_id: string
          _call_id?: string
          _customer_id?: string
          _product_id: string
          _requested_price: number
          _summary?: string
        }
        Returns: Json
      }
      has_business_role: {
        Args: {
          _business_id: string
          _roles: Database["public"]["Enums"]["business_role"][]
        }
        Returns: boolean
      }
      is_business_member: { Args: { _business_id: string }; Returns: boolean }
      pricing_lookup: {
        Args: { _business_id: string; _query: string }
        Returns: Json
      }
    }
    Enums: {
      appointment_status:
        | "requested"
        | "confirmed"
        | "rescheduled"
        | "cancelled"
        | "completed"
      approval_decision: "approved" | "edited" | "rejected"
      business_role: "owner" | "manager" | "agent"
      call_direction: "inbound" | "outbound"
      call_status: "ringing" | "in_progress" | "completed" | "missed" | "failed"
      escalation_status: "open" | "in_progress" | "resolved" | "rejected"
      quote_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "sent"
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
      appointment_status: [
        "requested",
        "confirmed",
        "rescheduled",
        "cancelled",
        "completed",
      ],
      approval_decision: ["approved", "edited", "rejected"],
      business_role: ["owner", "manager", "agent"],
      call_direction: ["inbound", "outbound"],
      call_status: ["ringing", "in_progress", "completed", "missed", "failed"],
      escalation_status: ["open", "in_progress", "resolved", "rejected"],
      quote_status: [
        "draft",
        "pending_approval",
        "approved",
        "rejected",
        "sent",
      ],
    },
  },
} as const
