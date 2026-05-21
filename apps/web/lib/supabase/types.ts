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
      agencies: {
        Row: {
          country: string | null
          created_at: string
          description: string | null
          id: string
          legal_name: string | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          legal_name?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          legal_name?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agencies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_workers: {
        Row: {
          agency_id: string
          created_at: string
          status: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          status?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          status?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_workers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string | null
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          occurred_at: string
          payload: Json | null
          updated_at: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          updated_at?: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          country: string | null
          created_at: string
          description: string | null
          display_name: string | null
          id: string
          legal_name: string | null
          profile_id: string | null
          trust_score: number
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          legal_name?: string | null
          profile_id?: string | null
          trust_score?: number
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          legal_name?: string | null
          profile_id?: string | null
          trust_score?: number
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          consent_type: string | null
          created_at: string
          granted: boolean | null
          granted_at: string | null
          id: string
          profile_id: string | null
          revoked_at: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          consent_type?: string | null
          created_at?: string
          granted?: boolean | null
          granted_at?: string | null
          id?: string
          profile_id?: string | null
          revoked_at?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          consent_type?: string | null
          created_at?: string
          granted?: boolean | null
          granted_at?: string | null
          id?: string
          profile_id?: string | null
          revoked_at?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string
          is_target_market: boolean
          name_en: string
          name_lt: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_target_market?: boolean
          name_en: string
          name_lt: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_target_market?: boolean
          name_en?: string
          name_lt?: string
          updated_at?: string
        }
        Relationships: []
      }
      engagement_contexts: {
        Row: {
          country_code: string | null
          created_at: string
          description: string | null
          ended_at: string | null
          hash_prev: string | null
          hash_self: string
          id: string
          is_primary: boolean
          organization_id: string | null
          profile_id: string
          project_id: string | null
          relationship_slug: string
          started_at: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          hash_prev?: string | null
          hash_self: string
          id?: string
          is_primary?: boolean
          organization_id?: string | null
          profile_id: string
          project_id?: string | null
          relationship_slug: string
          started_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          description?: string | null
          ended_at?: string | null
          hash_prev?: string | null
          hash_self?: string
          id?: string
          is_primary?: boolean
          organization_id?: string | null
          profile_id?: string
          project_id?: string | null
          relationship_slug?: string
          started_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_contexts_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "engagement_contexts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_contexts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_contexts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_contexts_relationship_slug_fkey"
            columns: ["relationship_slug"]
            isOneToOne: false
            referencedRelation: "relationship_types"
            referencedColumns: ["slug"]
          },
        ]
      }
      job_demands: {
        Row: {
          created_at: string
          headcount_needed: number | null
          id: string
          preferred_countries: string[] | null
          project_id: string | null
          required_skills: string[] | null
          role_title: string | null
          salary_offered_eur: number | null
          start_date: string | null
          status: string | null
          updated_at: string
          visibility: string | null
        }
        Insert: {
          created_at?: string
          headcount_needed?: number | null
          id?: string
          preferred_countries?: string[] | null
          project_id?: string | null
          required_skills?: string[] | null
          role_title?: string | null
          salary_offered_eur?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
          visibility?: string | null
        }
        Update: {
          created_at?: string
          headcount_needed?: number | null
          id?: string
          preferred_countries?: string[] | null
          project_id?: string | null
          required_skills?: string[] | null
          role_title?: string | null
          salary_offered_eur?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_demands_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          engagement_context_id: string
          entry_type_slug: string
          hash_prev: string | null
          hash_self: string
          id: string
          original_language: string
          original_text: string
          profession_id: string | null
          superseded_by: string | null
          updated_at: string
          visibility_scope: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          engagement_context_id: string
          entry_type_slug: string
          hash_prev?: string | null
          hash_self: string
          id?: string
          original_language: string
          original_text: string
          profession_id?: string | null
          superseded_by?: string | null
          updated_at?: string
          visibility_scope?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          engagement_context_id?: string
          entry_type_slug?: string
          hash_prev?: string | null
          hash_self?: string
          id?: string
          original_language?: string
          original_text?: string
          profession_id?: string | null
          superseded_by?: string | null
          updated_at?: string
          visibility_scope?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_engagement_context_id_fkey"
            columns: ["engagement_context_id"]
            isOneToOne: false
            referencedRelation: "engagement_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_confirmations: {
        Row: {
          confirmation_scope: Json
          confirmer_engagement_context_id: string
          confirmer_id: string
          confirmer_role: string
          created_at: string
          entry_id: string
          id: string
        }
        Insert: {
          confirmation_scope: Json
          confirmer_engagement_context_id: string
          confirmer_id: string
          confirmer_role: string
          created_at?: string
          entry_id: string
          id?: string
        }
        Update: {
          confirmation_scope?: Json
          confirmer_engagement_context_id?: string
          confirmer_id?: string
          confirmer_role?: string
          created_at?: string
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_confirmations_confirmer_engagement_context_i_fkey"
            columns: ["confirmer_engagement_context_id"]
            isOneToOne: false
            referencedRelation: "engagement_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_confirmations_confirmer_id_fkey"
            columns: ["confirmer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_confirmations_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_extractions: {
        Row: {
          ai_model: string
          ai_provider: string
          candidate_metrics: Json
          candidate_skills: Json
          created_at: string
          entry_id: string
          id: string
          raw_response: Json
          worker_confirmed_at: string | null
          worker_confirmed_subset: Json | null
        }
        Insert: {
          ai_model: string
          ai_provider: string
          candidate_metrics: Json
          candidate_skills: Json
          created_at?: string
          entry_id: string
          id?: string
          raw_response: Json
          worker_confirmed_at?: string | null
          worker_confirmed_subset?: Json | null
        }
        Update: {
          ai_model?: string
          ai_provider?: string
          candidate_metrics?: Json
          candidate_skills?: Json
          created_at?: string
          entry_id?: string
          id?: string
          raw_response?: Json
          worker_confirmed_at?: string | null
          worker_confirmed_subset?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_extractions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_metrics: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          metric_slug: string
          source: string
          unit_slug: string | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          metric_slug: string
          source: string
          unit_slug?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          metric_slug?: string
          source?: string
          unit_slug?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_metrics_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_metrics_unit_slug_fkey"
            columns: ["unit_slug"]
            isOneToOne: false
            referencedRelation: "productivity_units"
            referencedColumns: ["slug"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          company_name: string | null
          country: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          intent: string | null
          notes: string | null
          source: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          intent?: string | null
          notes?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          intent?: string | null
          notes?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_actions: {
        Row: {
          action: string | null
          actor_id: string | null
          created_at: string
          id: string
          match_id: string | null
          occurred_at: string
          updated_at: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          occurred_at?: string
          updated_at?: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          created_at?: string
          id?: string
          match_id?: string | null
          occurred_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          computed_at: string | null
          created_at: string
          id: string
          job_demand_id: string | null
          reasons: Json | null
          score: number | null
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          computed_at?: string | null
          created_at?: string
          id?: string
          job_demand_id?: string | null
          reasons?: Json | null
          score?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          computed_at?: string | null
          created_at?: string
          id?: string
          job_demand_id?: string | null
          reasons?: Json | null
          score?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_job_demand_id_fkey"
            columns: ["job_demand_id"]
            isOneToOne: false
            referencedRelation: "job_demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          sender_id: string | null
          sent_at: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string | null
          sent_at?: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string | null
          sent_at?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country: string | null
          created_at: string
          description: string | null
          display_name: string | null
          id: string
          legacy_agency_id: string | null
          legacy_company_id: string | null
          legal_name: string | null
          organization_type: string
          owner_profile_id: string | null
          trust_score: number
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          legacy_agency_id?: string | null
          legacy_company_id?: string | null
          legal_name?: string | null
          organization_type: string
          owner_profile_id?: string | null
          trust_score?: number
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          legacy_agency_id?: string | null
          legacy_company_id?: string | null
          legal_name?: string | null
          organization_type?: string
          owner_profile_id?: string | null
          trust_score?: number
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_country_fkey"
            columns: ["country"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "organizations_legacy_agency_id_fkey"
            columns: ["legacy_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_legacy_company_id_fkey"
            columns: ["legacy_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          features: Json | null
          id: string
          name_en: string | null
          name_lt: string | null
          price_eur_monthly: number | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          features?: Json | null
          id?: string
          name_en?: string | null
          name_lt?: string | null
          price_eur_monthly?: number | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          features?: Json | null
          id?: string
          name_en?: string | null
          name_lt?: string | null
          price_eur_monthly?: number | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_skill_aggregates: {
        Row: {
          last_refreshed_at: string | null
          mean_pace: number | null
          p25_pace: number | null
          p50_pace: number | null
          p75_pace: number | null
          productivity_unit_slug: string | null
          sample_size: number
          skill_id: string
        }
        Insert: {
          last_refreshed_at?: string | null
          mean_pace?: number | null
          p25_pace?: number | null
          p50_pace?: number | null
          p75_pace?: number | null
          productivity_unit_slug?: string | null
          sample_size?: number
          skill_id: string
        }
        Update: {
          last_refreshed_at?: string | null
          mean_pace?: number | null
          p25_pace?: number | null
          p50_pace?: number | null
          p75_pace?: number | null
          productivity_unit_slug?: string | null
          sample_size?: number
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_skill_aggregates_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: true
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      productivity_units: {
        Row: {
          base_unit_slug: string | null
          category: string
          conversion_factor: number | null
          created_at: string
          created_by_profile_id: string | null
          organization_id: string | null
          parent_unit_slug: string | null
          scope: string
          slug: string
        }
        Insert: {
          base_unit_slug?: string | null
          category: string
          conversion_factor?: number | null
          created_at?: string
          created_by_profile_id?: string | null
          organization_id?: string | null
          parent_unit_slug?: string | null
          scope: string
          slug: string
        }
        Update: {
          base_unit_slug?: string | null
          category?: string
          conversion_factor?: number | null
          created_at?: string
          created_by_profile_id?: string | null
          organization_id?: string | null
          parent_unit_slug?: string | null
          scope?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "productivity_units_base_unit_slug_fkey"
            columns: ["base_unit_slug"]
            isOneToOne: false
            referencedRelation: "productivity_units"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "productivity_units_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productivity_units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productivity_units_parent_unit_slug_fkey"
            columns: ["parent_unit_slug"]
            isOneToOne: false
            referencedRelation: "productivity_units"
            referencedColumns: ["slug"]
          },
        ]
      }
      profession_skills: {
        Row: {
          created_at: string
          display_order: number
          is_core: boolean
          profession_id: string
          skill_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          is_core?: boolean
          profession_id: string
          skill_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          is_core?: boolean
          profession_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profession_skills_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profession_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      profession_templates: {
        Row: {
          created_at: string
          id: string
          is_platform_default: boolean
          organization_id: string | null
          profession_id: string
          template: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_platform_default?: boolean
          organization_id?: string | null
          profession_id: string
          template: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_platform_default?: boolean
          organization_id?: string | null
          profession_id?: string
          template?: Json
        }
        Relationships: [
          {
            foreignKeyName: "profession_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profession_templates_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      professions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          sector: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          sector: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          sector?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_roles: {
        Row: {
          added_at: string
          id: string
          is_active: boolean
          profile_id: string
          role: string
          role_data: Json
        }
        Insert: {
          added_at?: string
          id?: string
          is_active?: boolean
          profile_id: string
          role: string
          role_data?: Json
        }
        Update: {
          added_at?: string
          id?: string
          is_active?: boolean
          profile_id?: string
          role?: string
          role_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "profile_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_role: string | null
          consent_data_processing: boolean
          consent_marketing: boolean
          country: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          locale: string
          onboarded: boolean
          onboarded_at: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active_role?: string | null
          consent_data_processing?: boolean
          consent_marketing?: boolean
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          locale?: string
          onboarded?: boolean
          onboarded_at?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active_role?: string | null
          consent_data_processing?: boolean
          consent_marketing?: boolean
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          onboarded?: boolean
          onboarded_at?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          city: string | null
          company_id: string | null
          country: string | null
          created_at: string
          end_date: string | null
          housing_provided: boolean | null
          id: string
          start_date: string | null
          status: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          end_date?: string | null
          housing_provided?: boolean | null
          id?: string
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          end_date?: string | null
          housing_provided?: boolean | null
          id?: string
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_types: {
        Row: {
          category: string
          created_at: string
          is_active: boolean
          slug: string
        }
        Insert: {
          category: string
          created_at?: string
          is_active?: boolean
          slug: string
        }
        Update: {
          category?: string
          created_at?: string
          is_active?: boolean
          slug?: string
        }
        Relationships: []
      }
      skill_icons: {
        Row: {
          created_at: string
          icon_slug: string
          organization_id: string | null
          skill_id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          icon_slug: string
          organization_id?: string | null
          skill_id: string
          source?: string | null
        }
        Update: {
          created_at?: string
          icon_slug?: string
          organization_id?: string | null
          skill_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skill_icons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_icons_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: true
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_seed_benchmarks: {
        Row: {
          productivity_unit_slug: string | null
          skill_id: string
          source_note: string | null
          typical_pace: number | null
        }
        Insert: {
          productivity_unit_slug?: string | null
          skill_id: string
          source_note?: string | null
          typical_pace?: number | null
        }
        Update: {
          productivity_unit_slug?: string | null
          skill_id?: string
          source_note?: string | null
          typical_pace?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "skill_seed_benchmarks_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: true
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          slug: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          slug?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          external_ref: string | null
          id: string
          plan_id: string | null
          profile_id: string | null
          started_at: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          external_ref?: string | null
          id?: string
          plan_id?: string | null
          profile_id?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          external_ref?: string | null
          id?: string
          plan_id?: string | null
          profile_id?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string
          id: string
          match_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          locale: string | null
          source: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          locale?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          locale?: string | null
          source?: string
        }
        Relationships: []
      }
      worker_professions: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          profession_id: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          profession_id: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          profession_id?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_professions_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_professions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_skills: {
        Row: {
          confidence_bin: string
          confidence_score: number
          created_at: string
          current_pace_unit_slug: string | null
          current_pace_value: number | null
          id: string
          last_recompute_at: string | null
          self_rated_level: number | null
          skill_id: string | null
          source: string
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
          worker_id: string | null
        }
        Insert: {
          confidence_bin?: string
          confidence_score?: number
          created_at?: string
          current_pace_unit_slug?: string | null
          current_pace_value?: number | null
          id?: string
          last_recompute_at?: string | null
          self_rated_level?: number | null
          skill_id?: string | null
          source?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          worker_id?: string | null
        }
        Update: {
          confidence_bin?: string
          confidence_score?: number
          created_at?: string
          current_pace_unit_slug?: string | null
          current_pace_value?: number | null
          id?: string
          last_recompute_at?: string | null
          self_rated_level?: number | null
          skill_id?: string | null
          source?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_skills_current_pace_unit_slug_fkey"
            columns: ["current_pace_unit_slug"]
            isOneToOne: false
            referencedRelation: "productivity_units"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "worker_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_skills_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_skills_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          availability_status: string | null
          available_from: string | null
          bio: string | null
          created_at: string
          current_location_country: string | null
          display_name: string | null
          experience_years: number | null
          headline: string | null
          id: string
          preferred_countries: string[] | null
          profile_completeness: number
          profile_id: string | null
          salary_max_eur: number | null
          salary_min_eur: number | null
          trust_score: number
          updated_at: string
        }
        Insert: {
          availability_status?: string | null
          available_from?: string | null
          bio?: string | null
          created_at?: string
          current_location_country?: string | null
          display_name?: string | null
          experience_years?: number | null
          headline?: string | null
          id?: string
          preferred_countries?: string[] | null
          profile_completeness?: number
          profile_id?: string | null
          salary_max_eur?: number | null
          salary_min_eur?: number | null
          trust_score?: number
          updated_at?: string
        }
        Update: {
          availability_status?: string | null
          available_from?: string | null
          bio?: string | null
          created_at?: string
          current_location_country?: string | null
          display_name?: string | null
          experience_years?: number | null
          headline?: string | null
          id?: string
          preferred_countries?: string[] | null
          profile_completeness?: number
          profile_id?: string | null
          salary_max_eur?: number | null
          salary_min_eur?: number | null
          trust_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_role: {
        Args: { p_role: string; p_role_data: Json }
        Returns: undefined
      }
      can_access_match: { Args: { m: string }; Returns: boolean }
      can_access_thread: { Args: { t: string }; Returns: boolean }
      complete_onboarding: {
        Args: {
          p_country: string
          p_display_name: string
          p_profession_id?: string
          p_role: string
          p_role_data: Json
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_employer: { Args: never; Returns: boolean }
      manages_organization: { Args: { org: string }; Returns: boolean }
      owns_agency: { Args: { a: string }; Returns: boolean }
      owns_company: { Args: { c: string }; Returns: boolean }
      owns_worker: { Args: { w: string }; Returns: boolean }
      profile_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
