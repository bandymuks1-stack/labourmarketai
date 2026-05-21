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
      worker_skills: {
        Row: {
          created_at: string
          id: string
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
          created_at?: string
          id?: string
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
          created_at?: string
          id?: string
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
        Args: {
          p_role: string
          p_role_data: Json
        }
        Returns: void
      }
      can_access_match: { Args: { m: string }; Returns: boolean }
      can_access_thread: { Args: { t: string }; Returns: boolean }
      complete_onboarding: {
        Args: {
          p_role: string
          p_display_name: string | null
          p_country: string | null
          p_role_data: Json
          p_profession_id?: string | null
        }
        Returns: void
      }
      is_admin: { Args: never; Returns: boolean }
      is_employer: { Args: never; Returns: boolean }
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
