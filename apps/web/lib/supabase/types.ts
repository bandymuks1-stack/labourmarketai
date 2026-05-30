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
      agency_worker_invitations: {
        Row: {
          accepted_at: string | null
          agency_id: string
          created_at: string
          expires_at: string | null
          id: string
          invited_email: string
          inviter_profile_id: string
          note: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          invited_email: string
          inviter_profile_id: string
          note?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          invited_email?: string
          inviter_profile_id?: string
          note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_worker_invitations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_worker_invitations_inviter_profile_id_fkey"
            columns: ["inviter_profile_id"]
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
          journal_review_enabled: boolean
          journal_review_scope: string | null
          operations_role: string | null
          operations_title: string | null
          status: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          journal_review_enabled?: boolean
          journal_review_scope?: string | null
          operations_role?: string | null
          operations_title?: string | null
          status?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          journal_review_enabled?: boolean
          journal_review_scope?: string | null
          operations_role?: string | null
          operations_title?: string | null
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
      company_worker_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          invited_email: string
          inviter_profile_id: string
          note: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          invited_email: string
          inviter_profile_id: string
          note?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          invited_email?: string
          inviter_profile_id?: string
          note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_worker_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_worker_invitations_inviter_profile_id_fkey"
            columns: ["inviter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_workers: {
        Row: {
          company_id: string
          created_at: string
          journal_review_enabled: boolean
          journal_review_scope: string | null
          operations_role: string | null
          operations_title: string | null
          status: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          journal_review_enabled?: boolean
          journal_review_scope?: string | null
          operations_role?: string | null
          operations_title?: string | null
          status?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          journal_review_enabled?: boolean
          journal_review_scope?: string | null
          operations_role?: string | null
          operations_title?: string | null
          status?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_workers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
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
      conversation_messages: {
        Row: {
          author_id: string
          body: string
          conversation_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          conversation_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          added_at: string
          added_by: string | null
          conversation_id: string
          last_read_at: string | null
          profile_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          conversation_id: string
          last_read_at?: string | null
          profile_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          conversation_id?: string
          last_read_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
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
      customer_request_attachments: {
        Row: {
          analysis_status: string
          created_at: string
          extracted_text: string | null
          file_name: string
          file_size_bytes: number
          id: string
          mime_type: string
          profile_id: string
          request_id: string
          storage_path: string
          structured_summary: Json | null
          updated_at: string
          upload_status: string
        }
        Insert: {
          analysis_status?: string
          created_at?: string
          extracted_text?: string | null
          file_name: string
          file_size_bytes: number
          id?: string
          mime_type: string
          profile_id: string
          request_id: string
          storage_path: string
          structured_summary?: Json | null
          updated_at?: string
          upload_status?: string
        }
        Update: {
          analysis_status?: string
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          profile_id?: string
          request_id?: string
          storage_path?: string
          structured_summary?: Json | null
          updated_at?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_request_attachments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_requests: {
        Row: {
          country: string | null
          created_at: string
          customer_id: string | null
          duration: string | null
          id: string
          kind: string | null
          language_requirement: string | null
          location: string | null
          manual_review_note: string | null
          need_summary: string | null
          notes: string | null
          original_language: string | null
          payload: Json
          profile_id: string
          role_or_work_type: string | null
          start_period: string | null
          status: string
          team_size: number | null
          title: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          customer_id?: string | null
          duration?: string | null
          id?: string
          kind?: string | null
          language_requirement?: string | null
          location?: string | null
          manual_review_note?: string | null
          need_summary?: string | null
          notes?: string | null
          original_language?: string | null
          payload?: Json
          profile_id: string
          role_or_work_type?: string | null
          start_period?: string | null
          status?: string
          team_size?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          customer_id?: string | null
          duration?: string | null
          id?: string
          kind?: string | null
          language_requirement?: string | null
          location?: string | null
          manual_review_note?: string | null
          need_summary?: string | null
          notes?: string | null
          original_language?: string | null
          payload?: Json
          profile_id?: string
          role_or_work_type?: string | null
          start_period?: string | null
          status?: string
          team_size?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          contact_name: string | null
          contact_preference: string
          country: string | null
          created_at: string
          customer_type: string
          id: string
          manual_review_note: string | null
          market: string | null
          need_summary: string | null
          profile_id: string
          review_status: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          contact_preference?: string
          country?: string | null
          created_at?: string
          customer_type?: string
          id?: string
          manual_review_note?: string | null
          market?: string | null
          need_summary?: string | null
          profile_id: string
          review_status?: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          contact_preference?: string
          country?: string | null
          created_at?: string
          customer_type?: string
          id?: string
          manual_review_note?: string | null
          market?: string | null
          need_summary?: string | null
          profile_id?: string
          review_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          journal_review_enabled: boolean
          operations_role: string | null
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
          journal_review_enabled?: boolean
          operations_role?: string | null
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
          journal_review_enabled?: boolean
          operations_role?: string | null
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
          correction_of: string | null
          created_at: string
          deleted_at: string | null
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
          correction_of?: string | null
          created_at?: string
          deleted_at?: string | null
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
          correction_of?: string | null
          created_at?: string
          deleted_at?: string | null
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
            foreignKeyName: "journal_entries_correction_of_fkey"
            columns: ["correction_of"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
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
      language_feedback: {
        Row: {
          comment: string
          created_at: string
          id: string
          locale: string
          route: string
          selected_text: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          locale: string
          route: string
          selected_text?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          locale?: string
          route?: string
          selected_text?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "language_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      pilot_drafts: {
        Row: {
          created_at: string
          draft_type: string
          id: string
          payload: Json
          profile_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          draft_type: string
          id?: string
          payload?: Json
          profile_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          draft_type?: string
          id?: string
          payload?: Json
          profile_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_drafts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_events: {
        Row: {
          app_version: string | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          event_name: string
          id: string
          locale: string
          metadata: Json
          profile_id: string | null
          result: string
          route: string
          session_id: string
          task_name: string | null
          task_step: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          event_name: string
          id?: string
          locale: string
          metadata?: Json
          profile_id?: string | null
          result: string
          route: string
          session_id: string
          task_name?: string | null
          task_step?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          event_name?: string
          id?: string
          locale?: string
          metadata?: Json
          profile_id?: string | null
          result?: string
          route?: string
          session_id?: string
          task_name?: string | null
          task_step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilot_events_profile_id_fkey"
            columns: ["profile_id"]
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
      profile_skill_claims: {
        Row: {
          created_at: string
          id: string
          label: string
          normalized_label: string
          profile_id: string
          source: string
          status: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          normalized_label: string
          profile_id: string
          source?: string
          status?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          normalized_label?: string
          profile_id?: string
          source?: string
          status?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_skill_claims_profile_id_fkey"
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
          profile_text: string | null
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
          profile_text?: string | null
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
          profile_text?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      accept_agency_worker_invitation: {
        Args: { p_agency_id: string }
        Returns: string
      }
      accept_company_worker_invitation: {
        Args: { p_company_id: string }
        Returns: string
      }
      add_org_member: {
        Args: { p_org_id: string; p_worker_id: string }
        Returns: string
      }
      add_role: {
        Args: { p_role: string; p_role_data: Json }
        Returns: undefined
      }
      agency_worker_engagement_links: {
        Args: { p_agency_id: string }
        Returns: string[]
      }
      assign_agency_worker_role: {
        Args: {
          p_agency_id: string
          p_journal_review_enabled?: boolean
          p_operations_role?: string
          p_operations_title?: string
          p_worker_id: string
        }
        Returns: string
      }
      assign_company_worker_role: {
        Args: {
          p_company_id: string
          p_journal_review_enabled?: boolean
          p_operations_role?: string
          p_operations_title?: string
          p_worker_id: string
        }
        Returns: string
      }
      can_access_match: { Args: { m: string }; Returns: boolean }
      company_worker_engagement_links: {
        Args: { p_company_id: string }
        Returns: string[]
      }
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
      confirm_entry_and_verify_skills: {
        Args: { p_entry_id: string; p_note?: string; p_skill_ids: string[] }
        Returns: string
      }
      create_journal_entry_full: {
        Args: {
          p_engagement_context_id: string
          p_entry_type_slug: string
          p_hash_prev: string
          p_hash_self: string
          p_metrics: Json
          p_original_language: string
          p_original_text: string
          p_profession_id: string
          p_visibility_scope: string
          p_worker_id: string
        }
        Returns: string
      }
      grant_org_manager: {
        Args: {
          p_operations_role?: string
          p_org_id: string
          p_profile_id: string
        }
        Returns: string
      }
      invite_agency_worker: {
        Args: { p_agency_id: string; p_email: string; p_note?: string }
        Returns: string
      }
      invite_company_worker: {
        Args: { p_company_id: string; p_email: string; p_note?: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_employer: { Args: never; Returns: boolean }
      journal_entry_soft_delete: {
        Args: { p_entry_id: string }
        Returns: undefined
      }
      journal_entry_supersede: {
        Args: {
          p_engagement_context_id: string
          p_entry_type_slug: string
          p_hash_self: string
          p_metrics: Json
          p_old_entry_id: string
          p_original_language: string
          p_original_text: string
          p_profession_id: string
          p_visibility_scope: string
        }
        Returns: string
      }
      manages_organization: { Args: { org: string }; Returns: boolean }
      owns_agency: { Args: { a: string }; Returns: boolean }
      owns_company: { Args: { c: string }; Returns: boolean }
      owns_customer: { Args: { c: string }; Returns: boolean }
      owns_worker: { Args: { w: string }; Returns: boolean }
      profile_role: { Args: never; Returns: string }
      provision_agency_worker_engagement_context: {
        Args: { p_agency_id: string; p_worker_id: string }
        Returns: string
      }
      provision_company_worker_engagement_context: {
        Args: { p_company_id: string; p_worker_id: string }
        Returns: string
      }
      register_customer_request_attachment: {
        Args: {
          p_attachment_id: string
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_request_id: string
          p_storage_path: string
        }
        Returns: string
      }
      review_journal_entry: {
        Args: { p_decision: string; p_entry_id: string; p_note?: string }
        Returns: string
      }
      reviewable_journal_entry_ids: { Args: never; Returns: string[] }
      save_customer_request: {
        Args: {
          p_country?: string
          p_duration?: string
          p_language_requirement?: string
          p_location?: string
          p_need_summary?: string
          p_notes?: string
          p_request_id: string
          p_role_or_work_type?: string
          p_start_period?: string
          p_status?: string
          p_team_size?: number
          p_title: string
        }
        Returns: string
      }
      save_customer_setup: {
        Args: {
          p_contact_name: string
          p_contact_preference?: string
          p_country?: string
          p_customer_type?: string
          p_manual_review_note?: string
          p_market?: string
          p_need_summary?: string
        }
        Returns: string
      }
      save_demand_draft: {
        Args: {
          p_kind: string
          p_original_language?: string
          p_payload?: Json
          p_title: string
        }
        Returns: string
      }
      set_agency_worker_journal_review: {
        Args: { p_agency_id: string; p_enabled: boolean; p_worker_id: string }
        Returns: string
      }
      set_company_worker_journal_review: {
        Args: { p_company_id: string; p_enabled: boolean; p_worker_id: string }
        Returns: string
      }
      set_engagement_journal_review: {
        Args: { p_enabled: boolean; p_engagement_id: string }
        Returns: string
      }
      submit_demand_request: {
        Args: {
          p_kind: string
          p_need_summary?: string
          p_original_language?: string
          p_payload?: Json
          p_title: string
        }
        Returns: string
      }
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
