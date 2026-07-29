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
      achievement_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          slug?: string
        }
        Relationships: []
      }
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
      agency_candidate_offers: {
        Row: {
          agency_company_id: string
          client_company_id: string
          connection_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          request_id: string
          request_share_id: string
          status: string
          updated_at: string
          withdrawn_at: string | null
          withdrawn_by: string | null
          worker_id: string
        }
        Insert: {
          agency_company_id: string
          client_company_id: string
          connection_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          request_id: string
          request_share_id: string
          status?: string
          updated_at?: string
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          worker_id: string
        }
        Update: {
          agency_company_id?: string
          client_company_id?: string
          connection_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          request_id?: string
          request_share_id?: string
          status?: string
          updated_at?: string
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_candidate_offers_agency_company_id_fkey"
            columns: ["agency_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_candidate_offers_client_company_id_fkey"
            columns: ["client_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_candidate_offers_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "agency_client_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_candidate_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_candidate_offers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_candidate_offers_request_share_id_fkey"
            columns: ["request_share_id"]
            isOneToOne: false
            referencedRelation: "agency_client_request_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_candidate_offers_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_candidate_offers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_connections: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          agency_company_id: string
          client_company_id: string | null
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invited_email: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_company_id: string
          client_company_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_email: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_company_id?: string
          client_company_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_email?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_connections_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_connections_agency_company_id_fkey"
            columns: ["agency_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_connections_client_company_id_fkey"
            columns: ["client_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_connections_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_connections_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_client_request_shares: {
        Row: {
          connection_id: string
          created_at: string
          id: string
          request_id: string
          revoked_at: string | null
          revoked_by: string | null
          shared_by: string
          status: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          id?: string
          request_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          shared_by: string
          status?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          id?: string
          request_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          shared_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_client_request_shares_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "agency_client_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_request_shares_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_request_shares_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_client_request_shares_shared_by_fkey"
            columns: ["shared_by"]
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
      asset_assignments: {
        Row: {
          acknowledged_at: string | null
          asset_id: string
          condition_at_issue: string
          condition_at_return: string | null
          created_at: string
          id: string
          issued_at: string
          issued_by: string
          note: string | null
          project_id: string | null
          returned_at: string | null
          status: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          asset_id: string
          condition_at_issue?: string
          condition_at_return?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          issued_by: string
          note?: string | null
          project_id?: string | null
          returned_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          asset_id?: string
          condition_at_issue?: string
          condition_at_return?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string
          note?: string | null
          project_id?: string | null
          returned_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_assignments_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: string
          availability: string
          condition: string
          created_at: string
          created_by: string
          id: string
          name: string
          note: string | null
          organization_id: string
          serial_or_reg: string | null
          updated_at: string
        }
        Insert: {
          asset_type: string
          availability?: string
          condition?: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          note?: string | null
          organization_id: string
          serial_or_reg?: string | null
          updated_at?: string
        }
        Update: {
          asset_type?: string
          availability?: string
          condition?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          note?: string | null
          organization_id?: string
          serial_or_reg?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      billing_customers: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          provider: string
          provider_customer_id: string
          test_mode: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          provider?: string
          provider_customer_id: string
          test_mode?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          provider?: string
          provider_customer_id?: string
          test_mode?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          last_payment_status: string | null
          owner_id: string
          plan_key: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          test_mode: boolean
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_status?: string | null
          owner_id: string
          plan_key: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          test_mode?: boolean
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_status?: string | null
          owner_id?: string
          plan_key?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          test_mode?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_request_events: {
        Row: {
          actor_id: string
          booking_request_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          reason_kind: string | null
          reason_note: string | null
          to_status: string
        }
        Insert: {
          actor_id: string
          booking_request_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          reason_kind?: string | null
          reason_note?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string
          booking_request_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          reason_kind?: string | null
          reason_note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_request_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_request_events_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          created_at: string
          expected_end_date: string | null
          id: string
          location_country: string | null
          note: string | null
          owner_id: string
          readiness_snapshot: Json
          request_id: string
          response_deadline_date: string | null
          role_text: string | null
          start_date: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          expected_end_date?: string | null
          id?: string
          location_country?: string | null
          note?: string | null
          owner_id: string
          readiness_snapshot?: Json
          request_id: string
          response_deadline_date?: string | null
          role_text?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          expected_end_date?: string | null
          id?: string
          location_country?: string | null
          note?: string | null
          owner_id?: string
          readiness_snapshot?: Json
          request_id?: string
          response_deadline_date?: string | null
          role_text?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests_seen: {
        Row: {
          seen_at: string
          user_id: string
        }
        Insert: {
          seen_at?: string
          user_id: string
        }
        Update: {
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_seen_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_drafts: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          language: string | null
          linked_profile_id: string | null
          name_or_title: string
          notes: string | null
          owner_id: string
          profession_service: string | null
          project_id: string | null
          skills_text: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          language?: string | null
          linked_profile_id?: string | null
          name_or_title: string
          notes?: string | null
          owner_id: string
          profession_service?: string | null
          project_id?: string | null
          skills_text?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          language?: string | null
          linked_profile_id?: string | null
          name_or_title?: string
          notes?: string | null
          owner_id?: string
          profession_service?: string | null
          project_id?: string | null
          skills_text?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_drafts_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_drafts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_drafts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_skills: {
        Row: {
          created_at: string
          id: string
          mapped_esco_uri: string | null
          mention_count: number
          original_language: string
          original_text: string
          profile_id: string
          review_note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mapped_esco_uri?: string | null
          mention_count?: number
          original_language: string
          original_text: string
          profile_id: string
          review_note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mapped_esco_uri?: string | null
          mention_count?: number
          original_language?: string
          original_text?: string
          profile_id?: string
          review_note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          company_type: string
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          description: string | null
          display_name: string | null
          id: string
          legal_name: string | null
          profile_id: string | null
          registration_code: string | null
          requested_at: string | null
          requester_role: string | null
          trust_score: number
          updated_at: string
          vat_number: string | null
          verification_note: string | null
          verification_status: string
          website: string | null
        }
        Insert: {
          address?: string | null
          company_type?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          legal_name?: string | null
          profile_id?: string | null
          registration_code?: string | null
          requested_at?: string | null
          requester_role?: string | null
          trust_score?: number
          updated_at?: string
          vat_number?: string | null
          verification_note?: string | null
          verification_status?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          company_type?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          legal_name?: string | null
          profile_id?: string | null
          registration_code?: string | null
          requested_at?: string | null
          requester_role?: string | null
          trust_score?: number
          updated_at?: string
          vat_number?: string | null
          verification_note?: string | null
          verification_status?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_demand_locations: {
        Row: {
          accommodation_needed: boolean
          active: boolean
          address_text: string | null
          city: string | null
          country_code: string
          created_at: string
          end_date: string | null
          geo_precision: string
          geocode_status: string
          granularity: string
          id: string
          latitude: number | null
          locality: string | null
          location_label: string
          longitude: number | null
          mobility_required: boolean
          need_type: string | null
          owner_id: string
          people_count_max: number | null
          people_count_min: number | null
          region: string | null
          request_id: string
          source: string
          start_date: string | null
          updated_at: string
          urgency: string | null
          visibility_level: string
        }
        Insert: {
          accommodation_needed?: boolean
          active?: boolean
          address_text?: string | null
          city?: string | null
          country_code: string
          created_at?: string
          end_date?: string | null
          geo_precision?: string
          geocode_status?: string
          granularity?: string
          id?: string
          latitude?: number | null
          locality?: string | null
          location_label: string
          longitude?: number | null
          mobility_required?: boolean
          need_type?: string | null
          owner_id: string
          people_count_max?: number | null
          people_count_min?: number | null
          region?: string | null
          request_id: string
          source?: string
          start_date?: string | null
          updated_at?: string
          urgency?: string | null
          visibility_level?: string
        }
        Update: {
          accommodation_needed?: boolean
          active?: boolean
          address_text?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          end_date?: string | null
          geo_precision?: string
          geocode_status?: string
          granularity?: string
          id?: string
          latitude?: number | null
          locality?: string | null
          location_label?: string
          longitude?: number | null
          mobility_required?: boolean
          need_type?: string | null
          owner_id?: string
          people_count_max?: number | null
          people_count_min?: number | null
          region?: string | null
          request_id?: string
          source?: string
          start_date?: string | null
          updated_at?: string
          urgency?: string | null
          visibility_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_demand_locations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_demand_locations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      company_need_public_intakes: {
        Row: {
          accommodation: string | null
          city_or_region: string | null
          company_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string
          created_at: string
          description: string
          engagement_type: string | null
          expected_duration: string | null
          headcount: number | null
          id: string
          languages: string | null
          locale: string | null
          sector: string | null
          source_path: string | null
          start_window: string | null
          status: string
          transport_needed: boolean | null
          urgency: string | null
        }
        Insert: {
          accommodation?: string | null
          city_or_region?: string | null
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country: string
          created_at?: string
          description: string
          engagement_type?: string | null
          expected_duration?: string | null
          headcount?: number | null
          id?: string
          languages?: string | null
          locale?: string | null
          sector?: string | null
          source_path?: string | null
          start_window?: string | null
          status?: string
          transport_needed?: boolean | null
          urgency?: string | null
        }
        Update: {
          accommodation?: string | null
          city_or_region?: string | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          description?: string
          engagement_type?: string | null
          expected_duration?: string | null
          headcount?: number | null
          id?: string
          languages?: string | null
          locale?: string | null
          sector?: string | null
          source_path?: string | null
          start_window?: string | null
          status?: string
          transport_needed?: boolean | null
          urgency?: string | null
        }
        Relationships: []
      }
      company_worker_engagements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          source_booking_id: string
          started_at: string
          status: string
          subject_key: string
          worker_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          source_booking_id: string
          started_at?: string
          status?: string
          subject_key?: string
          worker_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          source_booking_id?: string
          started_at?: string
          status?: string
          subject_key?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_worker_engagements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_worker_engagements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_worker_engagements_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_worker_engagements_source_booking_id_fkey"
            columns: ["source_booking_id"]
            isOneToOne: true
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_worker_engagements_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
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
      consented_login_location_signals: {
        Row: {
          city: string | null
          consent_status: string
          country_code: string
          country_name: string | null
          created_at: string
          granularity: string
          id: string
          last_seen_at: string | null
          precision_level: string
          profile_id: string
          region: string | null
          source: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          consent_status?: string
          country_code: string
          country_name?: string | null
          created_at?: string
          granularity?: string
          id?: string
          last_seen_at?: string | null
          precision_level?: string
          profile_id: string
          region?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          consent_status?: string
          country_code?: string
          country_name?: string | null
          created_at?: string
          granularity?: string
          id?: string
          last_seen_at?: string | null
          precision_level?: string
          profile_id?: string
          region?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consented_login_location_signals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
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
      contact_disclosure_request_events: {
        Row: {
          actor_profile_id: string
          contact_disclosure_request_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          to_status: string
        }
        Insert: {
          actor_profile_id: string
          contact_disclosure_request_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          to_status: string
        }
        Update: {
          actor_profile_id?: string
          contact_disclosure_request_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_disclosure_request_ev_contact_disclosure_request_i_fkey"
            columns: ["contact_disclosure_request_id"]
            isOneToOne: false
            referencedRelation: "contact_disclosure_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_disclosure_request_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_disclosure_requests: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          note: string | null
          organization_id: string
          owner_id: string
          request_id: string
          requested_fields: Json
          responded_at: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          note?: string | null
          organization_id: string
          owner_id: string
          request_id: string
          requested_fields: Json
          responded_at?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          owner_id?: string
          request_id?: string
          requested_fields?: Json
          responded_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_disclosure_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_disclosure_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_disclosure_requests_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_disclosure_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          created_at: string
          currency: string
          customer_request_id: string | null
          end_date: string | null
          id: string
          note: string | null
          number: string | null
          owner_id: string
          parties: string | null
          project_id: string | null
          proposal_id: string | null
          signed_document_ref: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
          value_cents: number
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_request_id?: string | null
          end_date?: string | null
          id?: string
          note?: string | null
          number?: string | null
          owner_id: string
          parties?: string | null
          project_id?: string | null
          proposal_id?: string | null
          signed_document_ref?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          value_cents?: number
        }
        Update: {
          created_at?: string
          currency?: string
          customer_request_id?: string | null
          end_date?: string | null
          id?: string
          note?: string | null
          number?: string | null
          owner_id?: string
          parties?: string | null
          project_id?: string | null
          proposal_id?: string | null
          signed_document_ref?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_request_id_fkey"
            columns: ["customer_request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_message_attachments: {
        Row: {
          conversation_id: string
          created_at: string
          file_name: string
          file_size_bytes: number
          id: string
          message_id: string
          mime_type: string
          storage_path: string
          uploader_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          file_name: string
          file_size_bytes: number
          id?: string
          message_id: string
          mime_type: string
          storage_path: string
          uploader_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          file_name?: string
          file_size_bytes?: number
          id?: string
          message_id?: string
          mime_type?: string
          storage_path?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_message_attachments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "conversation_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_message_attachments_uploader_id_fkey"
            columns: ["uploader_id"]
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
          is_clarification_request: boolean
          is_instruction: boolean
          original_language: string | null
          project_id: string | null
          target_language: string | null
          translated_text: string | null
          translation_status: string
        }
        Insert: {
          author_id: string
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          is_clarification_request?: boolean
          is_instruction?: boolean
          original_language?: string | null
          project_id?: string | null
          target_language?: string | null
          translated_text?: string | null
          translation_status?: string
        }
        Update: {
          author_id?: string
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_clarification_request?: boolean
          is_instruction?: boolean
          original_language?: string | null
          project_id?: string | null
          target_language?: string | null
          translated_text?: string | null
          translation_status?: string
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
          {
            foreignKeyName: "conversation_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          conversation_id: string
          last_read_at?: string | null
          profile_id: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          conversation_id?: string
          last_read_at?: string | null
          profile_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
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
          {
            foreignKeyName: "conversation_participants_revoked_by_fkey"
            columns: ["revoked_by"]
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
          source_id: string | null
          source_type: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          source_id?: string | null
          source_type?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          source_id?: string | null
          source_type?: string | null
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
      country_document_requirements: {
        Row: {
          condition_note: string | null
          country: string
          created_at: string
          document_type_slug: string
          id: string
          is_active: boolean
          requirement_level: string
          source_status: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          condition_note?: string | null
          country: string
          created_at?: string
          document_type_slug: string
          id?: string
          is_active?: boolean
          requirement_level?: string
          source_status?: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          condition_note?: string | null
          country?: string
          created_at?: string
          document_type_slug?: string
          id?: string
          is_active?: boolean
          requirement_level?: string
          source_status?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "country_document_requirements_document_type_slug_fkey"
            columns: ["document_type_slug"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["slug"]
          },
        ]
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
      defect_corrections: {
        Row: {
          completed_at: string | null
          created_at: string
          defect_id: string
          id: string
          materials: string | null
          outcome: string
          reviewer_id: string
          work_performed: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          defect_id: string
          id?: string
          materials?: string | null
          outcome?: string
          reviewer_id: string
          work_performed: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          defect_id?: string
          id?: string
          materials?: string | null
          outcome?: string
          reviewer_id?: string
          work_performed?: string
        }
        Relationships: [
          {
            foreignKeyName: "defect_corrections_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "defects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_corrections_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      defects: {
        Row: {
          assignee_profile_id: string | null
          category: string
          created_at: string
          description: string
          due_date: string | null
          id: string
          location: string | null
          project_id: string
          reporter_id: string
          severity: string
          stage_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assignee_profile_id?: string | null
          category: string
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          location?: string | null
          project_id: string
          reporter_id: string
          severity?: string
          stage_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assignee_profile_id?: string | null
          category?: string
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          location?: string | null
          project_id?: string
          reporter_id?: string
          severity?: string
          stage_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "defects_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_interest_signals: {
        Row: {
          created_at: string
          id: string
          match_snapshot: Json
          note: string | null
          request_id: string
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_snapshot?: Json
          note?: string | null
          request_id: string
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_snapshot?: Json
          note?: string | null
          request_id?: string
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_interest_signals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_interest_signals_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_shortlist: {
        Row: {
          created_at: string
          id: string
          note: string | null
          owner_id: string
          request_id: string
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          owner_id: string
          request_id: string
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          request_id?: string
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_shortlist_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_shortlist_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_shortlist_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      education_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          slug?: string
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
      esco_labels: {
        Row: {
          concept_id: string
          concept_type: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          label_type: string
          locale: string
        }
        Insert: {
          concept_id: string
          concept_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          label_type?: string
          locale: string
        }
        Update: {
          concept_id?: string
          concept_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          label_type?: string
          locale?: string
        }
        Relationships: []
      }
      esco_occupation_skills: {
        Row: {
          created_at: string
          is_active: boolean
          occupation_id: string
          relation_type: string
          skill_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          occupation_id: string
          relation_type?: string
          skill_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          occupation_id?: string
          relation_type?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "esco_occupation_skills_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "esco_occupations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esco_occupation_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "esco_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      esco_occupations: {
        Row: {
          created_at: string
          esco_uri: string
          id: string
          is_active: boolean
          isco_group: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          esco_uri: string
          id?: string
          is_active?: boolean
          isco_group?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          esco_uri?: string
          id?: string
          is_active?: boolean
          isco_group?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      esco_skills: {
        Row: {
          created_at: string
          esco_uri: string
          id: string
          is_active: boolean
          reuse_level: string | null
          skill_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          esco_uri: string
          id?: string
          is_active?: boolean
          reuse_level?: string | null
          skill_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          esco_uri?: string
          id?: string
          is_active?: boolean
          reuse_level?: string | null
          skill_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      finance_records: {
        Row: {
          amount_cents: number
          company_id: string | null
          counterparty_name: string
          created_at: string
          created_by: string
          currency: string
          due_date: string | null
          id: string
          note: string | null
          paid_at: string | null
          project_id: string | null
          record_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          company_id?: string | null
          counterparty_name: string
          created_at?: string
          created_by: string
          currency?: string
          due_date?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          project_id?: string | null
          record_type: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          company_id?: string | null
          counterparty_name?: string
          created_at?: string
          created_by?: string
          currency?: string
          due_date?: string | null
          id?: string
          note?: string | null
          paid_at?: string | null
          project_id?: string | null
          record_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_tasks: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string
          resolved_at: string | null
          status: string
          subject_company_id: string | null
          subject_profile_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note: string
          resolved_at?: string | null
          status?: string
          subject_company_id?: string | null
          subject_profile_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          resolved_at?: string | null
          status?: string
          subject_company_id?: string | null
          subject_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_tasks_subject_company_id_fkey"
            columns: ["subject_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_tasks_subject_profile_id_fkey"
            columns: ["subject_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          created_at: string
          declined_at: string | null
          delivery_status: string
          expires_at: string
          id: string
          invitation_type: string
          invited_email: string
          invited_name: string | null
          inviter_profile_id: string
          last_sent_at: string | null
          locale: string | null
          organization_id: string | null
          personal_message: string | null
          project_id: string | null
          proposed_role: string | null
          resend_count: number
          revoked_at: string | null
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          declined_at?: string | null
          delivery_status?: string
          expires_at?: string
          id?: string
          invitation_type: string
          invited_email: string
          invited_name?: string | null
          inviter_profile_id: string
          last_sent_at?: string | null
          locale?: string | null
          organization_id?: string | null
          personal_message?: string | null
          project_id?: string | null
          proposed_role?: string | null
          resend_count?: number
          revoked_at?: string | null
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          declined_at?: string | null
          delivery_status?: string
          expires_at?: string
          id?: string
          invitation_type?: string
          invited_email?: string
          invited_name?: string | null
          inviter_profile_id?: string
          last_sent_at?: string | null
          locale?: string | null
          organization_id?: string | null
          personal_message?: string | null
          project_id?: string | null
          proposed_role?: string | null
          resend_count?: number
          revoked_at?: string | null
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_inviter_profile_id_fkey"
            columns: ["inviter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
            foreignKeyName: "journal_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      journal_entry_photos: {
        Row: {
          created_at: string
          entry_id: string
          file_name: string
          file_size_bytes: number
          id: string
          mime_type: string
          profile_id: string
          storage_path: string
          updated_at: string
          upload_status: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          file_name: string
          file_size_bytes: number
          id?: string
          mime_type: string
          profile_id: string
          storage_path: string
          updated_at?: string
          upload_status?: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          file_name?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          profile_id?: string
          storage_path?: string
          updated_at?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_photos_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_skills: {
        Row: {
          created_at: string
          id: string
          journal_entry_id: string
          provenance: string | null
          skill_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          journal_entry_id: string
          provenance?: string | null
          skill_id: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          journal_entry_id?: string
          provenance?: string | null
          skill_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_skills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_skills_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_work_items: {
        Row: {
          certainty: string
          created_at: string
          evidence_phrase: string | null
          hours_numeric: number | null
          id: string
          journal_entry_id: string
          organization_id: string | null
          source: string
          status: string
          title: string
          unit: string | null
          updated_at: string
          work_type_key: string | null
          worker_id: string
        }
        Insert: {
          certainty?: string
          created_at?: string
          evidence_phrase?: string | null
          hours_numeric?: number | null
          id?: string
          journal_entry_id: string
          organization_id?: string | null
          source?: string
          status?: string
          title: string
          unit?: string | null
          updated_at?: string
          work_type_key?: string | null
          worker_id: string
        }
        Update: {
          certainty?: string
          created_at?: string
          evidence_phrase?: string | null
          hours_numeric?: number | null
          id?: string
          journal_entry_id?: string
          organization_id?: string | null
          source?: string
          status?: string
          title?: string
          unit?: string | null
          updated_at?: string
          work_type_key?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_work_items_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_work_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_work_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
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
      learning_policy_settings: {
        Row: {
          created_at: string
          disabled_at: string | null
          disabled_by: string | null
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          id: string
          organization_id: string
          policy_kind: string
          rule: Json
          scope: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          id?: string
          organization_id: string
          policy_kind: string
          rule?: Json
          scope?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          disabled_by?: string | null
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          id?: string
          organization_id?: string
          policy_kind?: string
          rule?: Json
          scope?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_policy_settings_disabled_by_fkey"
            columns: ["disabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_policy_settings_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_policy_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_review_queue: {
        Row: {
          created_at: string
          id: string
          journal_entry_id: string | null
          organization_id: string
          policy_id: string | null
          produced_confirmation_id: string | null
          proposed_action: Json | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signal_id: string | null
          status: string
          subject_skill_id: string | null
          subject_worker_id: string
          suggestion_kind: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          organization_id: string
          policy_id?: string | null
          produced_confirmation_id?: string | null
          proposed_action?: Json | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signal_id?: string | null
          status?: string
          subject_skill_id?: string | null
          subject_worker_id: string
          suggestion_kind: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          organization_id?: string
          policy_id?: string | null
          produced_confirmation_id?: string | null
          proposed_action?: Json | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signal_id?: string | null
          status?: string
          subject_skill_id?: string | null
          subject_worker_id?: string
          suggestion_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_review_queue_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_queue_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "learning_policy_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_queue_produced_confirmation_id_fkey"
            columns: ["produced_confirmation_id"]
            isOneToOne: false
            referencedRelation: "journal_entry_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_queue_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_queue_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "learning_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_queue_subject_skill_id_fkey"
            columns: ["subject_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_review_queue_subject_worker_id_fkey"
            columns: ["subject_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_signals: {
        Row: {
          actor_id: string | null
          confidence_bin: string
          confidence_score: number
          created_at: string
          id: string
          organization_id: string | null
          proposed_outcome: Json | null
          signal_kind: string
          source: string
          source_object_id: string | null
          source_object_type: string | null
          subject_skill_id: string | null
          subject_worker_id: string
        }
        Insert: {
          actor_id?: string | null
          confidence_bin?: string
          confidence_score?: number
          created_at?: string
          id?: string
          organization_id?: string | null
          proposed_outcome?: Json | null
          signal_kind: string
          source: string
          source_object_id?: string | null
          source_object_type?: string | null
          subject_skill_id?: string | null
          subject_worker_id: string
        }
        Update: {
          actor_id?: string | null
          confidence_bin?: string
          confidence_score?: number
          created_at?: string
          id?: string
          organization_id?: string | null
          proposed_outcome?: Json | null
          signal_kind?: string
          source?: string
          source_object_id?: string | null
          source_object_type?: string | null
          subject_skill_id?: string | null
          subject_worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_signals_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_signals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_signals_subject_skill_id_fkey"
            columns: ["subject_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_signals_subject_worker_id_fkey"
            columns: ["subject_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      lmc_accounts: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          profile_id: string | null
          subject_type: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          profile_id?: string | null
          subject_type: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          profile_id?: string | null
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmc_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmc_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lmc_lot_consumptions: {
        Row: {
          account_id: string
          amount_cents: number
          consumption_kind: string
          created_at: string
          id: string
          lot_id: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          consumption_kind: string
          created_at?: string
          id?: string
          lot_id: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          consumption_kind?: string
          created_at?: string
          id?: string
          lot_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmc_lot_consumptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "lmc_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "lmc_lot_consumptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "lmc_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmc_lot_consumptions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lmc_lot_balances"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "lmc_lot_consumptions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lmc_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmc_lot_consumptions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "lmc_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      lmc_lots: {
        Row: {
          account_id: string
          amount_cents: number
          created_at: string
          expires_at: string | null
          id: string
          source_kind: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          created_at?: string
          expires_at?: string | null
          id?: string
          source_kind: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          source_kind?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmc_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "lmc_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "lmc_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "lmc_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmc_lots_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "lmc_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      lmc_settings: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lmc_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lmc_transactions: {
        Row: {
          account_id: string
          actor_profile_id: string | null
          amount_cents: number
          campaign: string | null
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          kind: string
          metadata: Json
          original_transaction_id: string | null
          reason: string
          recipient_email_at_grant: string | null
        }
        Insert: {
          account_id: string
          actor_profile_id?: string | null
          amount_cents: number
          campaign?: string | null
          created_at?: string
          currency?: string
          id?: string
          idempotency_key: string
          kind: string
          metadata?: Json
          original_transaction_id?: string | null
          reason: string
          recipient_email_at_grant?: string | null
        }
        Update: {
          account_id?: string
          actor_profile_id?: string | null
          amount_cents?: number
          campaign?: string | null
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          kind?: string
          metadata?: Json
          original_transaction_id?: string | null
          reason?: string
          recipient_email_at_grant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lmc_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "lmc_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "lmc_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "lmc_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmc_transactions_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmc_transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "lmc_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intelligence_insight_queries: {
        Row: {
          computation_version: string
          id: string
          insight_key: string
          observation_ids: string[]
          params_summary: Json
          profile_id: string | null
          queried_at: string
          viewer_role: string
        }
        Insert: {
          computation_version: string
          id?: string
          insight_key: string
          observation_ids?: string[]
          params_summary?: Json
          profile_id?: string | null
          queried_at?: string
          viewer_role: string
        }
        Update: {
          computation_version?: string
          id?: string
          insight_key?: string
          observation_ids?: string[]
          params_summary?: Json
          profile_id?: string | null
          queried_at?: string
          viewer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_intelligence_insight_queries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intelligence_observations: {
        Row: {
          captured_at: string
          confidence: number | null
          content_hash: string
          created_at: string
          derivation_ids: string[]
          freshness_status: string
          geo_city: string | null
          geo_country: string | null
          geo_region: string | null
          id: string
          metric_key: string
          privacy_class: string
          provenance: Json
          sample_size: number | null
          source_key: string
          source_kind: string
          source_url: string | null
          stat_method: string
          subject_id: string
          subject_kind: string
          transform_version: string
          unit: string
          valid_from: string
          valid_to: string | null
          value_numeric: number
          window_end: string
          window_start: string
        }
        Insert: {
          captured_at: string
          confidence?: number | null
          content_hash: string
          created_at?: string
          derivation_ids?: string[]
          freshness_status?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          metric_key: string
          privacy_class: string
          provenance?: Json
          sample_size?: number | null
          source_key: string
          source_kind: string
          source_url?: string | null
          stat_method: string
          subject_id: string
          subject_kind: string
          transform_version: string
          unit: string
          valid_from: string
          valid_to?: string | null
          value_numeric: number
          window_end: string
          window_start: string
        }
        Update: {
          captured_at?: string
          confidence?: number | null
          content_hash?: string
          created_at?: string
          derivation_ids?: string[]
          freshness_status?: string
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          metric_key?: string
          privacy_class?: string
          provenance?: Json
          sample_size?: number | null
          source_key?: string
          source_kind?: string
          source_url?: string | null
          stat_method?: string
          subject_id?: string
          subject_kind?: string
          transform_version?: string
          unit?: string
          valid_from?: string
          valid_to?: string | null
          value_numeric?: number
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_intelligence_observations_source_key_fkey"
            columns: ["source_key"]
            isOneToOne: false
            referencedRelation: "market_intelligence_sources"
            referencedColumns: ["source_key"]
          },
        ]
      }
      market_intelligence_sources: {
        Row: {
          activation: string
          attribution_text: string | null
          created_at: string
          display_name: string
          id: string
          import_policy: Json | null
          legal_status: string
          owner_approval_note: string | null
          owner_approved_at: string | null
          rate_limit_note: string | null
          robots_status: string | null
          source_key: string
          source_kind: string
          terms_url: string | null
        }
        Insert: {
          activation?: string
          attribution_text?: string | null
          created_at?: string
          display_name: string
          id?: string
          import_policy?: Json | null
          legal_status?: string
          owner_approval_note?: string | null
          owner_approved_at?: string | null
          rate_limit_note?: string | null
          robots_status?: string | null
          source_key: string
          source_kind: string
          terms_url?: string | null
        }
        Update: {
          activation?: string
          attribution_text?: string | null
          created_at?: string
          display_name?: string
          id?: string
          import_policy?: Json | null
          legal_status?: string
          owner_approval_note?: string | null
          owner_approved_at?: string | null
          rate_limit_note?: string | null
          robots_status?: string | null
          source_key?: string
          source_kind?: string
          terms_url?: string | null
        }
        Relationships: []
      }
      market_rate_averages: {
        Row: {
          avg_rate_eur: number
          basis: string
          country: string
          created_at: string
          entered_at: string
          entered_by: string
          id: string
          is_active: boolean
          profession_id: string
          source_note: string | null
          source_status: string
          updated_at: string
        }
        Insert: {
          avg_rate_eur: number
          basis?: string
          country: string
          created_at?: string
          entered_at?: string
          entered_by: string
          id?: string
          is_active?: boolean
          profession_id: string
          source_note?: string | null
          source_status?: string
          updated_at?: string
        }
        Update: {
          avg_rate_eur?: number
          basis?: string
          country?: string
          created_at?: string
          entered_at?: string
          entered_by?: string
          id?: string
          is_active?: boolean
          profession_id?: string
          source_note?: string | null
          source_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_rate_averages_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_rate_averages_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          listing_kind: string
          location_country: string | null
          location_label: string | null
          organization_id: string | null
          owner_id: string
          price_text: string | null
          project_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          listing_kind: string
          location_country?: string | null
          location_label?: string | null
          organization_id?: string | null
          owner_id: string
          price_text?: string | null
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          listing_kind?: string
          location_country?: string | null
          location_label?: string | null
          organization_id?: string | null
          owner_id?: string
          price_text?: string | null
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          public_contact_email: string | null
          public_contact_phone: string | null
          public_profile_enabled: boolean
          public_slug: string | null
          public_tagline: string | null
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
          public_contact_email?: string | null
          public_contact_phone?: string | null
          public_profile_enabled?: boolean
          public_slug?: string | null
          public_tagline?: string | null
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
          public_contact_email?: string | null
          public_contact_phone?: string | null
          public_profile_enabled?: boolean
          public_slug?: string | null
          public_tagline?: string | null
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
      payment_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          provider: string
          test_mode: boolean
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_id: string
          event_type: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider?: string
          test_mode?: boolean
        }
        Update: {
          created_at?: string
          error?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider?: string
          test_mode?: boolean
        }
        Relationships: []
      }
      personal_data_disclosures: {
        Row: {
          consent_event_id: string
          context_id: string
          context_type: string
          data_categories: string[]
          delivery_method: string
          disclosed_at: string
          disclosed_by: string
          document_ids: string[] | null
          id: string
          metadata: Json | null
          recipient_organization_id: string
          revoked_access_at: string | null
          worker_user_id: string
        }
        Insert: {
          consent_event_id: string
          context_id: string
          context_type: string
          data_categories: string[]
          delivery_method: string
          disclosed_at?: string
          disclosed_by: string
          document_ids?: string[] | null
          id?: string
          metadata?: Json | null
          recipient_organization_id: string
          revoked_access_at?: string | null
          worker_user_id: string
        }
        Update: {
          consent_event_id?: string
          context_id?: string
          context_type?: string
          data_categories?: string[]
          delivery_method?: string
          disclosed_at?: string
          disclosed_by?: string
          document_ids?: string[] | null
          id?: string
          metadata?: Json | null
          recipient_organization_id?: string
          revoked_access_at?: string | null
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_data_disclosures_consent_event_id_fkey"
            columns: ["consent_event_id"]
            isOneToOne: false
            referencedRelation: "privacy_consent_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_data_disclosures_disclosed_by_fkey"
            columns: ["disclosed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_data_disclosures_recipient_organization_id_fkey"
            columns: ["recipient_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_data_disclosures_worker_user_id_fkey"
            columns: ["worker_user_id"]
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
      pilot_outcomes: {
        Row: {
          created_at: string
          id: string
          note: string | null
          noted_by: string
          outcome: string
          participant_profile_id: string | null
          pilot_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          noted_by: string
          outcome: string
          participant_profile_id?: string | null
          pilot_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          noted_by?: string
          outcome?: string
          participant_profile_id?: string | null
          pilot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_outcomes_noted_by_fkey"
            columns: ["noted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_outcomes_participant_profile_id_fkey"
            columns: ["participant_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_outcomes_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_participants: {
        Row: {
          id: string
          joined_at: string
          joined_via: string
          left_at: string | null
          pilot_id: string
          profile_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          joined_via?: string
          left_at?: string | null
          pilot_id: string
          profile_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          joined_via?: string
          left_at?: string | null
          pilot_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_participants_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "pilots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pilots: {
        Row: {
          created_at: string
          created_by: string
          ends_on: string | null
          id: string
          name: string
          organisation_kind: string
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ends_on?: string | null
          id?: string
          name: string
          organisation_kind?: string
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_on?: string | null
          id?: string
          name?: string
          organisation_kind?: string
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilots_created_by_fkey"
            columns: ["created_by"]
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
      preferred_locations: {
        Row: {
          active: boolean
          city: string | null
          confirmed_by_user: boolean
          country_code: string
          country_name: string | null
          created_at: string
          granularity: string
          id: string
          intents: string[]
          priority: string
          profile_id: string
          region: string | null
          short_note: string | null
          updated_at: string
          visibility_level: string
        }
        Insert: {
          active?: boolean
          city?: string | null
          confirmed_by_user?: boolean
          country_code: string
          country_name?: string | null
          created_at?: string
          granularity?: string
          id?: string
          intents?: string[]
          priority?: string
          profile_id: string
          region?: string | null
          short_note?: string | null
          updated_at?: string
          visibility_level?: string
        }
        Update: {
          active?: boolean
          city?: string | null
          confirmed_by_user?: boolean
          country_code?: string
          country_name?: string | null
          created_at?: string
          granularity?: string
          id?: string
          intents?: string[]
          priority?: string
          profile_id?: string
          region?: string | null
          short_note?: string | null
          updated_at?: string
          visibility_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "preferred_locations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_consent_events: {
        Row: {
          action: string
          consent_text_hash: string
          consent_text_version: string
          context_id: string | null
          context_type: string | null
          created_at: string
          id: string
          locale: string
          metadata: Json | null
          purpose: string
          recipient_organization_id: string | null
          request_id: string | null
          selected_fields: Json | null
          seq: number
          source: string
          user_id: string
        }
        Insert: {
          action: string
          consent_text_hash: string
          consent_text_version: string
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          locale: string
          metadata?: Json | null
          purpose: string
          recipient_organization_id?: string | null
          request_id?: string | null
          selected_fields?: Json | null
          seq?: never
          source: string
          user_id: string
        }
        Update: {
          action?: string
          consent_text_hash?: string
          consent_text_version?: string
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          locale?: string
          metadata?: Json | null
          purpose?: string
          recipient_organization_id?: string | null
          request_id?: string | null
          selected_fields?: Json | null
          seq?: never
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_consent_events_purpose_fkey"
            columns: ["purpose"]
            isOneToOne: false
            referencedRelation: "privacy_consent_purposes"
            referencedColumns: ["purpose"]
          },
          {
            foreignKeyName: "privacy_consent_events_recipient_organization_id_fkey"
            columns: ["recipient_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privacy_consent_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_consent_purposes: {
        Row: {
          current_text_hash: string
          current_version: string
          purpose: string
          updated_at: string
        }
        Insert: {
          current_text_hash: string
          current_version: string
          purpose: string
          updated_at?: string
        }
        Update: {
          current_text_hash?: string
          current_version?: string
          purpose?: string
          updated_at?: string
        }
        Relationships: []
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
          esco_uri: string | null
          id: string
          is_active: boolean
          sector: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          esco_uri?: string | null
          id?: string
          is_active?: boolean
          sector: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          esco_uri?: string | null
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
          avatar_url: string | null
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
          avatar_url?: string | null
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
          avatar_url?: string | null
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
      project_budgets: {
        Row: {
          category: string
          created_at: string
          created_by: string
          currency: string
          id: string
          note: string | null
          planned_amount_cents: number
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          note?: string | null
          planned_amount_cents: number
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          note?: string | null
          planned_amount_cents?: number
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_clients_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_handover_entries: {
        Row: {
          body: string | null
          created_at: string
          created_by: string
          entry_type: string
          id: string
          project_id: string
          status_value: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by: string
          entry_type: string
          id?: string
          project_id: string
          status_value?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string
          entry_type?: string
          id?: string
          project_id?: string
          status_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_handover_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_handover_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          project_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          project_id: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          project_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stages: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          blocked_reason: string | null
          completion_criteria: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          planned_end: string | null
          planned_start: string | null
          project_id: string
          responsible_engagement_id: string | null
          stage_order: number
          status: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          blocked_reason?: string | null
          completion_criteria?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          planned_end?: string | null
          planned_start?: string | null
          project_id: string
          responsible_engagement_id?: string | null
          stage_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          blocked_reason?: string | null
          completion_criteria?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          planned_end?: string | null
          planned_start?: string | null
          project_id?: string
          responsible_engagement_id?: string | null
          stage_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stages_responsible_engagement_id_fkey"
            columns: ["responsible_engagement_id"]
            isOneToOne: false
            referencedRelation: "engagement_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      project_worker_assignments: {
        Row: {
          assigned_at: string
          ended_at: string | null
          id: string
          project_id: string
          status: string
          worker_id: string
        }
        Insert: {
          assigned_at?: string
          ended_at?: string | null
          id?: string
          project_id: string
          status?: string
          worker_id: string
        }
        Update: {
          assigned_at?: string
          ended_at?: string | null
          id?: string
          project_id?: string
          status?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_worker_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_worker_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_worker_operational_statuses: {
        Row: {
          created_at: string
          id: string
          note: string | null
          project_id: string
          status: string
          updated_at: string
          updated_by: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          project_id: string
          status: string
          updated_at?: string
          updated_by: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          project_id?: string
          status?: string
          updated_at?: string
          updated_by?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_worker_operational_statuses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_worker_operational_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_worker_operational_statuses_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_worker_readiness_items: {
        Row: {
          created_at: string
          id: string
          item_key: string
          label: string
          note: string | null
          project_id: string
          status: string
          updated_at: string
          updated_by: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_key: string
          label: string
          note?: string | null
          project_id: string
          status?: string
          updated_at?: string
          updated_by: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_key?: string
          label?: string
          note?: string | null
          project_id?: string
          status?: string
          updated_at?: string
          updated_by?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_worker_readiness_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_worker_readiness_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_worker_readiness_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          city: string | null
          company_id: string | null
          country: string | null
          created_at: string
          end_date: string | null
          granularity: string
          housing_provided: boolean | null
          id: string
          location_confirmed: boolean
          organization_id: string | null
          start_date: string | null
          status: string | null
          title: string | null
          updated_at: string
          visibility_level: string
        }
        Insert: {
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          end_date?: string | null
          granularity?: string
          housing_provided?: boolean | null
          id?: string
          location_confirmed?: boolean
          organization_id?: string | null
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          visibility_level?: string
        }
        Update: {
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          end_date?: string | null
          granularity?: string
          housing_provided?: boolean | null
          id?: string
          location_confirmed?: boolean
          organization_id?: string | null
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          visibility_level?: string
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
      proposals: {
        Row: {
          accepted_at: string | null
          amount_cents: number
          created_at: string
          currency: string
          customer_request_id: string | null
          exclusions: string | null
          id: string
          number: string | null
          owner_id: string
          project_id: string | null
          rejection_reason: string | null
          scope: string | null
          sent_at: string | null
          status: string
          title: string
          updated_at: string
          validity_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_request_id?: string | null
          exclusions?: string | null
          id?: string
          number?: string | null
          owner_id: string
          project_id?: string | null
          rejection_reason?: string | null
          scope?: string | null
          sent_at?: string | null
          status?: string
          title: string
          updated_at?: string
          validity_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_request_id?: string | null
          exclusions?: string | null
          id?: string
          number?: string | null
          owner_id?: string
          project_id?: string | null
          rejection_reason?: string | null
          scope?: string | null
          sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          validity_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_customer_request_id_fkey"
            columns: ["customer_request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      service_offering_requests: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          message: string | null
          offering_id: string
          provider_id: string
          responded_at: string | null
          response_note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          message?: string | null
          offering_id: string
          provider_id: string
          responded_at?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          message?: string | null
          offering_id?: string
          provider_id?: string
          responded_at?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_offering_requests_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_offering_requests_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "service_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_offering_requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_offering_requests_seen: {
        Row: {
          seen_at: string
          user_id: string
        }
        Insert: {
          seen_at?: string
          user_id: string
        }
        Update: {
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_offering_requests_seen_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_offerings: {
        Row: {
          category_slug: string | null
          created_at: string
          description: string | null
          id: string
          location_country: string | null
          provider_id: string
          rate_text: string | null
          remote: boolean
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category_slug?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location_country?: string | null
          provider_id: string
          rate_text?: string | null
          remote?: boolean
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_slug?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location_country?: string | null
          provider_id?: string
          rate_text?: string | null
          remote?: boolean
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_offerings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_candidate_clarifications: {
        Row: {
          created_at: string
          id: string
          label: string
          normalized_label: string
          often_with: string | null
          profile_id: string
          related_to: string | null
          tools_materials: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          normalized_label: string
          often_with?: string | null
          profile_id: string
          related_to?: string | null
          tools_materials?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          normalized_label?: string
          often_with?: string | null
          profile_id?: string
          related_to?: string | null
          tools_materials?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_candidate_clarifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          esco_uri: string | null
          id: string
          is_active: boolean
          slug: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          esco_uri?: string | null
          id?: string
          is_active?: boolean
          slug?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          esco_uri?: string | null
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
      team_details: {
        Row: {
          accommodation_needed: boolean
          availability_status: string
          available_from: string | null
          deployable_size_max: number | null
          deployable_size_min: number | null
          destination_countries: string[] | null
          max_trip_days: number | null
          note: string | null
          org_id: string
          transport_own: boolean
          updated_at: string
        }
        Insert: {
          accommodation_needed?: boolean
          availability_status?: string
          available_from?: string | null
          deployable_size_max?: number | null
          deployable_size_min?: number | null
          destination_countries?: string[] | null
          max_trip_days?: number | null
          note?: string | null
          org_id: string
          transport_own?: boolean
          updated_at?: string
        }
        Update: {
          accommodation_needed?: boolean
          availability_status?: string
          available_from?: string | null
          deployable_size_max?: number | null
          deployable_size_min?: number | null
          destination_countries?: string[] | null
          max_trip_days?: number | null
          note?: string | null
          org_id?: string
          transport_own?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_details_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_enquiries: {
        Row: {
          company_organization_id: string | null
          created_at: string
          expected_end_date: string | null
          expires_at: string
          id: string
          message: string
          owner_id: string
          start_date: string | null
          status: string
          team_org_id: string
          updated_at: string
        }
        Insert: {
          company_organization_id?: string | null
          created_at?: string
          expected_end_date?: string | null
          expires_at?: string
          id?: string
          message: string
          owner_id: string
          start_date?: string | null
          status?: string
          team_org_id: string
          updated_at?: string
        }
        Update: {
          company_organization_id?: string | null
          created_at?: string
          expected_end_date?: string | null
          expires_at?: string
          id?: string
          message?: string
          owner_id?: string
          start_date?: string | null
          status?: string
          team_org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_enquiries_company_organization_id_fkey"
            columns: ["company_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_enquiries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_enquiries_team_org_id_fkey"
            columns: ["team_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_enquiry_events: {
        Row: {
          actor_profile_id: string
          created_at: string
          enquiry_id: string
          event_type: string
          from_status: string | null
          id: string
          to_status: string
        }
        Insert: {
          actor_profile_id: string
          created_at?: string
          enquiry_id: string
          event_type: string
          from_status?: string | null
          id?: string
          to_status: string
        }
        Update: {
          actor_profile_id?: string
          created_at?: string
          enquiry_id?: string
          event_type?: string
          from_status?: string | null
          id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_enquiry_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_enquiry_events_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "team_enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_cost_events: {
        Row: {
          cost: Json
          event_id: string
          event_type: string
          feature_code: string | null
          measures: Json
          metadata: Json
          occurred_at: string
          organization_id: string | null
          payer: string | null
          plan_key: string | null
          profile_id: string | null
          provider: string
          recorded_at: string
          resource: string | null
          revenue_link: Json | null
          schema_version: number
          service: string
          session_id: string | null
          status: string
          workspace_id: string | null
        }
        Insert: {
          cost?: Json
          event_id: string
          event_type: string
          feature_code?: string | null
          measures?: Json
          metadata?: Json
          occurred_at: string
          organization_id?: string | null
          payer?: string | null
          plan_key?: string | null
          profile_id?: string | null
          provider: string
          recorded_at?: string
          resource?: string | null
          revenue_link?: Json | null
          schema_version?: number
          service: string
          session_id?: string | null
          status: string
          workspace_id?: string | null
        }
        Update: {
          cost?: Json
          event_id?: string
          event_type?: string
          feature_code?: string | null
          measures?: Json
          metadata?: Json
          occurred_at?: string
          organization_id?: string | null
          payer?: string | null
          plan_key?: string | null
          profile_id?: string | null
          provider?: string
          recorded_at?: string
          resource?: string | null
          revenue_link?: Json | null
          schema_version?: number
          service?: string
          session_id?: string | null
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_cost_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_cost_events_profile_id_fkey"
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
      work_tasks: {
        Row: {
          assignee_profile_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          priority: string
          project_id: string | null
          resolved_at: string | null
          source_id: string | null
          source_type: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_profile_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          resolved_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_profile_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          project_id?: string | null
          resolved_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_tasks_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_absences: {
        Row: {
          absence_type: string
          created_at: string
          end_date: string
          half_day: boolean
          id: string
          note: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          absence_type: string
          created_at?: string
          end_date: string
          half_day?: boolean
          id?: string
          note?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          absence_type?: string
          created_at?: string
          end_date?: string
          half_day?: boolean
          id?: string
          note?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_absences_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_absences_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_absences_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_achievements: {
        Row: {
          achieved_at: string | null
          achievement_type_slug: string
          confirmed_by_manager: boolean
          created_at: string
          description: string | null
          id: string
          profile_id: string
          source_journal_entry_id: string | null
          title: string
        }
        Insert: {
          achieved_at?: string | null
          achievement_type_slug?: string
          confirmed_by_manager?: boolean
          created_at?: string
          description?: string | null
          id?: string
          profile_id: string
          source_journal_entry_id?: string | null
          title: string
        }
        Update: {
          achieved_at?: string | null
          achievement_type_slug?: string
          confirmed_by_manager?: boolean
          created_at?: string
          description?: string | null
          id?: string
          profile_id?: string
          source_journal_entry_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_achievements_achievement_type_slug_fkey"
            columns: ["achievement_type_slug"]
            isOneToOne: false
            referencedRelation: "achievement_types"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "worker_achievements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_achievements_source_journal_entry_id_fkey"
            columns: ["source_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_document_events: {
        Row: {
          actor_id: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          event_type: string
          id: string
          worker_document_id: string
        }
        Insert: {
          actor_id: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          event_type: string
          id?: string
          worker_document_id: string
        }
        Update: {
          actor_id?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          event_type?: string
          id?: string
          worker_document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_document_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_document_events_worker_document_id_fkey"
            columns: ["worker_document_id"]
            isOneToOne: false
            referencedRelation: "worker_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_documents: {
        Row: {
          country: string | null
          created_at: string
          document_type_slug: string
          file_path: string | null
          id: string
          note: string | null
          reviewer_note: string | null
          status: string
          updated_at: string
          updated_by: string
          valid_from: string | null
          valid_until: string | null
          verification: string
          verified_at: string | null
          verified_by: string | null
          worker_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          document_type_slug: string
          file_path?: string | null
          id?: string
          note?: string | null
          reviewer_note?: string | null
          status?: string
          updated_at?: string
          updated_by: string
          valid_from?: string | null
          valid_until?: string | null
          verification?: string
          verified_at?: string | null
          verified_by?: string | null
          worker_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          document_type_slug?: string
          file_path?: string | null
          id?: string
          note?: string | null
          reviewer_note?: string | null
          status?: string
          updated_at?: string
          updated_by?: string
          valid_from?: string | null
          valid_until?: string | null
          verification?: string
          verified_at?: string | null
          verified_by?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_documents_document_type_slug_fkey"
            columns: ["document_type_slug"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "worker_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_documents_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_education: {
        Row: {
          created_at: string
          education_type_slug: string
          end_year: number | null
          id: string
          institution_name: string
          is_current: boolean
          note: string | null
          profile_id: string
          program_or_field: string | null
          start_year: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          education_type_slug: string
          end_year?: number | null
          id?: string
          institution_name: string
          is_current?: boolean
          note?: string | null
          profile_id: string
          program_or_field?: string | null
          start_year?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          education_type_slug?: string
          end_year?: number | null
          id?: string
          institution_name?: string
          is_current?: boolean
          note?: string | null
          profile_id?: string
          program_or_field?: string | null
          start_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_education_education_type_slug_fkey"
            columns: ["education_type_slug"]
            isOneToOne: false
            referencedRelation: "education_types"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "worker_education_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_languages: {
        Row: {
          created_at: string
          id: string
          lang: string
          level: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lang: string
          level: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lang?: string
          level?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_languages_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
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
      worker_saved_opportunities: {
        Row: {
          created_at: string
          id: string
          note: string | null
          request_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          request_id: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          request_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_saved_opportunities_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_saved_opportunities_worker_id_fkey"
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
          availability_note: string | null
          availability_status: string | null
          available_from: string | null
          bio: string | null
          created_at: string
          current_location_country: string | null
          display_name: string | null
          docs_aggregate_consent: boolean
          driving_licence_categories: string[] | null
          experience_years: number | null
          has_transport: boolean | null
          headline: string | null
          id: string
          max_trip_days: number | null
          needs_accommodation: boolean | null
          night_shifts_ok: boolean | null
          overtime_ok: boolean | null
          own_tools: boolean | null
          own_vehicle: boolean | null
          pay_basis_preference: string | null
          preferred_contract_type: string | null
          preferred_countries: string[] | null
          profile_completeness: number
          profile_id: string | null
          salary_max_eur: number | null
          salary_min_eur: number | null
          solo_available: boolean | null
          team_available: boolean | null
          trust_score: number
          updated_at: string
          weekend_shifts_ok: boolean | null
          willing_to_relocate: boolean | null
          work_card_confirmed_at: string | null
        }
        Insert: {
          availability_note?: string | null
          availability_status?: string | null
          available_from?: string | null
          bio?: string | null
          created_at?: string
          current_location_country?: string | null
          display_name?: string | null
          docs_aggregate_consent?: boolean
          driving_licence_categories?: string[] | null
          experience_years?: number | null
          has_transport?: boolean | null
          headline?: string | null
          id?: string
          max_trip_days?: number | null
          needs_accommodation?: boolean | null
          night_shifts_ok?: boolean | null
          overtime_ok?: boolean | null
          own_tools?: boolean | null
          own_vehicle?: boolean | null
          pay_basis_preference?: string | null
          preferred_contract_type?: string | null
          preferred_countries?: string[] | null
          profile_completeness?: number
          profile_id?: string | null
          salary_max_eur?: number | null
          salary_min_eur?: number | null
          solo_available?: boolean | null
          team_available?: boolean | null
          trust_score?: number
          updated_at?: string
          weekend_shifts_ok?: boolean | null
          willing_to_relocate?: boolean | null
          work_card_confirmed_at?: string | null
        }
        Update: {
          availability_note?: string | null
          availability_status?: string | null
          available_from?: string | null
          bio?: string | null
          created_at?: string
          current_location_country?: string | null
          display_name?: string | null
          docs_aggregate_consent?: boolean
          driving_licence_categories?: string[] | null
          experience_years?: number | null
          has_transport?: boolean | null
          headline?: string | null
          id?: string
          max_trip_days?: number | null
          needs_accommodation?: boolean | null
          night_shifts_ok?: boolean | null
          overtime_ok?: boolean | null
          own_tools?: boolean | null
          own_vehicle?: boolean | null
          pay_basis_preference?: string | null
          preferred_contract_type?: string | null
          preferred_countries?: string[] | null
          profile_completeness?: number
          profile_id?: string | null
          salary_max_eur?: number | null
          salary_min_eur?: number | null
          solo_available?: boolean | null
          team_available?: boolean | null
          trust_score?: number
          updated_at?: string
          weekend_shifts_ok?: boolean | null
          willing_to_relocate?: boolean | null
          work_card_confirmed_at?: string | null
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
      lmc_account_balances: {
        Row: {
          account_id: string | null
          available_cents: number | null
          company_id: string | null
          expired_remainder_cents: number | null
          profile_id: string | null
          promotional_available_cents: number | null
          purchased_available_cents: number | null
          subject_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lmc_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmc_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lmc_lot_balances: {
        Row: {
          account_id: string | null
          amount_cents: number | null
          consumed_cents: number | null
          created_at: string | null
          expires_at: string | null
          is_expired: boolean | null
          lot_id: string | null
          remaining_cents: number | null
          source_kind: string | null
          spendable_cents: number | null
          transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lmc_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "lmc_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "lmc_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "lmc_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmc_lots_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "lmc_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_agency_client_connection_v1: {
        Args: { p_client_company_id: string; p_connection_id: string }
        Returns: string
      }
      accept_agency_worker_invitation: {
        Args: { p_agency_id: string }
        Returns: string
      }
      accept_company_worker_invitation: {
        Args: { p_company_id: string }
        Returns: string
      }
      accept_invitation_by_id_v1: {
        Args: { p_invitation_id: string }
        Returns: Json
      }
      accept_invitation_v1: { Args: { p_token: string }; Returns: Json }
      acknowledge_asset_assignment_v1: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      acknowledge_demand_interest: {
        Args: { p_request_id: string; p_status: string; p_worker_id: string }
        Returns: boolean
      }
      add_defect_correction_v1: {
        Args: {
          p_completed_at?: string
          p_defect_id: string
          p_materials?: string
          p_outcome?: string
          p_work_performed: string
        }
        Returns: string
      }
      add_org_member: {
        Args: { p_org_id: string; p_worker_id: string }
        Returns: string
      }
      add_pilot_participant_v1: {
        Args: {
          p_joined_via?: string
          p_pilot_id: string
          p_profile_id: string
        }
        Returns: Json
      }
      add_project_handover_entry_v1: {
        Args: {
          p_body: string
          p_entry_type: string
          p_project_id: string
          p_status_value: string
        }
        Returns: string
      }
      add_project_stage_v1: {
        Args: {
          p_completion_criteria?: string
          p_name: string
          p_planned_end?: string
          p_planned_start?: string
          p_project_id: string
          p_stage_order?: number
        }
        Returns: string
      }
      add_role: {
        Args: { p_role: string; p_role_data: Json }
        Returns: undefined
      }
      admin_list_worker_privacy_states: {
        Args: never
        Returns: {
          discoverability: string
          profile_id: string
        }[]
      }
      admin_privacy_readiness_counts: { Args: never; Returns: Json }
      admin_set_company_verification: {
        Args: { p_company_id: string; p_note?: string; p_status: string }
        Returns: string
      }
      admin_set_market_rate_average: {
        Args: {
          p_avg_rate_eur: number
          p_country: string
          p_profession_id: string
          p_source_note: string
          p_source_status?: string
        }
        Returns: string
      }
      admin_set_worker_document_verification: {
        Args: { p_decision: string; p_document_id: string; p_note: string }
        Returns: string
      }
      agency_pool_docs_readiness: {
        Args: never
        Returns: {
          docs_attention: number
          docs_expiring: number
          docs_total: number
          docs_valid: number
          worker_id: string
        }[]
      }
      agency_worker_engagement_links: {
        Args: { p_agency_id: string }
        Returns: string[]
      }
      apply_learning_auto_confirmation: {
        Args: { p_review_item_id: string }
        Returns: string
      }
      asset_open_assignment_for_caller: {
        Args: { p_asset_id: string }
        Returns: boolean
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
      assign_worker_to_project: {
        Args: { p_project_id: string; p_worker_profile_id: string }
        Returns: string
      }
      batch_review_exceptions: {
        Args: { p_entry_ids: string[] }
        Returns: {
          entry_id: string
          exception_slug: string
        }[]
      }
      caller_has_booking_engagement_for_project: {
        Args: { p_project_id: string; p_worker_id: string }
        Returns: boolean
      }
      caller_manages_asset: { Args: { p_asset_id: string }; Returns: boolean }
      caller_manages_defect: { Args: { p_defect_id: string }; Returns: boolean }
      caller_manages_worker: { Args: { p_worker_id: string }; Returns: boolean }
      can_access_match: { Args: { m: string }; Returns: boolean }
      can_manage_project: { Args: { p_project_id: string }; Returns: boolean }
      can_view_worker: { Args: { w: string }; Returns: boolean }
      cancel_worker_absence_v1: {
        Args: { p_absence_id: string }
        Returns: undefined
      }
      close_stale_learning_review_items: {
        Args: { p_organization_id?: string }
        Returns: number
      }
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
      confirm_worker_card: { Args: never; Returns: string }
      contact_demand_owner_v1: {
        Args: { p_request_id: string }
        Returns: {
          company_verified: boolean
          demand_open: boolean
          demand_title: string
          has_own_signal: boolean
          owner_profile_id: string
        }[]
      }
      contact_disclosure_log_change: {
        Args: {
          p_action: string
          p_actor: string
          p_event_type: string
          p_from_status: string
          p_request_id: string
          p_to_status: string
        }
        Returns: undefined
      }
      conversation_counterpart_identities: {
        Args: { p_conversation_ids: string[] }
        Returns: {
          conversation_id: string
          display_name: string
        }[]
      }
      conversation_source_context: {
        Args: { p_conversation_ids: string[] }
        Returns: {
          conversation_id: string
          source_route_hint: string
          source_title: string
          source_type: string
        }[]
      }
      create_agency_client_connection_v1: {
        Args: { p_agency_company_id: string; p_invited_email: string }
        Returns: string
      }
      create_asset_v1: {
        Args: {
          p_asset_type: string
          p_condition?: string
          p_name: string
          p_note?: string
          p_organization_id: string
          p_serial_or_reg?: string
        }
        Returns: string
      }
      create_contract_v1: {
        Args: {
          p_customer_request_id?: string
          p_end_date?: string
          p_number?: string
          p_parties?: string
          p_project_id?: string
          p_proposal_id?: string
          p_signed_document_ref?: string
          p_start_date?: string
          p_title: string
          p_value_cents?: number
        }
        Returns: string
      }
      create_finance_record_v1: {
        Args: {
          p_amount_cents: string
          p_company_id: string
          p_counterparty: string
          p_due_date: string
          p_note: string
          p_project_id: string
          p_record_type: string
          p_status: string
          p_title: string
        }
        Returns: string
      }
      create_follow_up_task_v1: {
        Args: {
          p_note: string
          p_subject_company_id: string
          p_subject_profile_id: string
        }
        Returns: string
      }
      create_invitation_v1: {
        Args: {
          p_invitation_type: string
          p_invited_email: string
          p_invited_name?: string
          p_locale?: string
          p_organization_id?: string
          p_personal_message?: string
          p_project_id?: string
          p_proposed_role?: string
          p_token_hash: string
        }
        Returns: Json
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
      create_marketplace_listing_v1: {
        Args: {
          p_category: string
          p_description?: string
          p_listing_kind: string
          p_location_country?: string
          p_location_label?: string
          p_organization_id?: string
          p_price_text?: string
          p_project_id?: string
          p_title: string
        }
        Returns: string
      }
      create_pilot_v1: {
        Args: {
          p_ends_on?: string
          p_name: string
          p_organisation_kind?: string
          p_starts_on?: string
        }
        Returns: Json
      }
      create_proposal_v1: {
        Args: {
          p_amount_cents?: number
          p_customer_request_id?: string
          p_exclusions?: string
          p_number?: string
          p_project_id?: string
          p_scope?: string
          p_title: string
          p_validity_until?: string
        }
        Returns: string
      }
      create_team_v1: { Args: { p_team_name: string }; Returns: string }
      create_work_task_v1: {
        Args: {
          p_assign_to_self: boolean
          p_description: string
          p_due_date: string
          p_priority: string
          p_project_id: string
          p_title: string
        }
        Returns: string
      }
      current_profile_discoverability_consent: { Args: never; Returns: Json }
      decline_agency_client_connection_v1: {
        Args: { p_connection_id: string }
        Returns: string
      }
      decline_invitation_v1: { Args: { p_token: string }; Returns: string }
      delete_contract_v1: {
        Args: { p_contract_id: string }
        Returns: undefined
      }
      delete_defect_v1: { Args: { p_defect_id: string }; Returns: undefined }
      delete_marketplace_listing_v1: {
        Args: { p_id: string }
        Returns: undefined
      }
      delete_project_budget_v1: {
        Args: { p_budget_id: string }
        Returns: undefined
      }
      delete_project_stage_v1: {
        Args: { p_stage_id: string }
        Returns: undefined
      }
      delete_proposal_v1: {
        Args: { p_proposal_id: string }
        Returns: undefined
      }
      demand_structured_v2_public: { Args: { p: Json }; Returns: Json }
      end_company_worker_engagement_v1: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      end_worker_project_assignment: {
        Args: { p_project_id: string; p_worker_profile_id: string }
        Returns: undefined
      }
      expire_contact_disclosure_requests_v1: { Args: never; Returns: Json }
      expire_stale_booking_requests_v1: {
        Args: { p_stale_days?: number }
        Returns: number
      }
      expire_stale_team_enquiries_v1: { Args: never; Returns: number }
      get_invitation_preview_v1: { Args: { p_token: string }; Returns: Json }
      get_public_business_listings_v1: {
        Args: { p_org_id: string }
        Returns: {
          category: string
          description: string
          id: string
          listing_kind: string
          location_country: string
          location_label: string
          price_text: string
          title: string
        }[]
      }
      get_public_business_profile_v1: {
        Args: { p_slug: string }
        Returns: {
          contact_email: string
          contact_phone: string
          country: string
          description: string
          display_name: string
          id: string
          tagline: string
          website: string
        }[]
      }
      get_public_business_services_v1: {
        Args: { p_org_id: string }
        Returns: {
          category_slug: string
          description: string
          id: string
          location_country: string
          rate_text: string
          remote: boolean
          title: string
        }[]
      }
      get_team_capability_summary_v1: {
        Args: { p_org_id: string }
        Returns: {
          members_confirmed: number
          members_declared: number
          skill_slug: string
        }[]
      }
      grant_employer_data_disclosure: {
        Args: {
          p_context_id: string
          p_context_type: string
          p_hash: string
          p_locale: string
          p_recipient_organization_id: string
          p_selected_fields: Json
          p_source: string
          p_version: string
        }
        Returns: Json
      }
      grant_org_manager: {
        Args: {
          p_operations_role?: string
          p_org_id: string
          p_profile_id: string
        }
        Returns: string
      }
      grant_profile_discoverability_consent: {
        Args: {
          p_hash: string
          p_locale: string
          p_source: string
          p_version: string
        }
        Returns: Json
      }
      has_employer_data_disclosure: {
        Args: {
          p_context_id: string
          p_context_type: string
          p_recipient_organization_id: string
          p_worker_profile: string
        }
        Returns: boolean
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
      is_conversation_participant_path: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      is_employer: { Args: never; Returns: boolean }
      issue_asset_v1: {
        Args: {
          p_asset_id: string
          p_condition_at_issue?: string
          p_note?: string
          p_project_id?: string
          p_worker_id?: string
        }
        Returns: string
      }
      journal_entry_restore: {
        Args: { p_entry_id: string }
        Returns: undefined
      }
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
      journal_entry_supersede_v2: {
        Args: {
          p_engagement_context_id: string
          p_entry_type_slug: string
          p_hash_self: string
          p_metrics: Json
          p_old_entry_id: string
          p_original_language: string
          p_original_text: string
          p_profession_id: string
          p_rejected_slugs?: string[]
          p_selected_slugs?: string[]
          p_visibility_scope: string
        }
        Returns: string
      }
      list_agency_offer_progress_v1: {
        Args: never
        Returns: {
          created_at: string
          offer_id: string
          offer_status: string
          request_id: string
          review_stage: string
          worker_id: string
        }[]
      }
      list_agency_offered_candidates_for_request_v1: {
        Args: { p_request_id: string }
        Returns: {
          agency_name: string
          created_at: string
          note: string
          offer_id: string
          worker_id: string
        }[]
      }
      list_booking_engagement_workers_v1: {
        Args: never
        Returns: {
          display_name: string
          engagement_id: string
          source_booking_id: string
          started_at: string
          worker_id: string
          worker_profile_id: string
        }[]
      }
      list_invitations_for_me_v1: { Args: never; Returns: Json }
      list_my_contact_disclosure_requests_v1: { Args: never; Returns: Json }
      list_my_team_enquiries_v1: { Args: never; Returns: Json }
      list_open_demand_for_agencies: {
        Args: never
        Returns: {
          can_offer_marked: boolean
          country: string
          created_at: string
          duration: string
          id: string
          role_text: string
          start_period: string
          team_size: number
        }[]
      }
      list_open_demand_for_workers: {
        Args: never
        Returns: {
          accommodation: string
          company_name: string
          country: string
          created_at: string
          id: string
          location_label: string
          required_tools: string[]
          role_text: string
          route_status: string
          start_period: string
          structured: Json
          team_size: number
          transport: string
        }[]
      }
      list_shared_requests_for_agency_v1: {
        Args: never
        Returns: {
          connection_id: string
          country: string
          request_id: string
          role_text: string
          share_id: string
          shared_at: string
          status: string
          title: string
        }[]
      }
      list_team_enquiries_for_my_teams_v1: { Args: never; Returns: Json }
      lmc_admin_grant_existing_v1: {
        Args: {
          p_actor: string
          p_amount_cents: number
          p_campaign: string
          p_conflict_on_foreign: boolean
          p_expires_at: string
          p_idempotency_key: string
          p_reason: string
          p_recipient_email: string
        }
        Returns: Json
      }
      lmc_admin_grant_v1: {
        Args: {
          p_amount_cents: number
          p_campaign: string
          p_expires_at: string
          p_idempotency_key: string
          p_reason: string
          p_recipient_email: string
        }
        Returns: Json
      }
      lmc_assert_external_idempotency_key_v1: {
        Args: { p_key: string }
        Returns: undefined
      }
      lmc_ensure_account_v1: {
        Args: { p_company_id?: string; p_profile_id?: string }
        Returns: string
      }
      lmc_existing_by_idempotency_v1: {
        Args: {
          p_account: string
          p_actor_profile_id?: string
          p_amount_cents?: number
          p_campaign?: string
          p_expires_at?: string
          p_key: string
          p_kind: string
          p_original_transaction_id?: string
          p_reason_exact?: string
          p_reference?: string
        }
        Returns: Json
      }
      lmc_expire_lots_v1: { Args: { p_limit?: number }; Returns: Json }
      lmc_flag_enabled: { Args: { p_key: string }; Returns: boolean }
      lmc_flag_policy_v1: { Args: { p_key: string }; Returns: string }
      lmc_grant_promotional_v1: {
        Args: {
          p_campaign: string
          p_idempotency_key: string
          p_kind: string
          p_profile_id: string
        }
        Returns: Json
      }
      lmc_record_purchase_v1: {
        Args: {
          p_amount_cents: number
          p_company_id?: string
          p_idempotency_key: string
          p_profile_id?: string
          p_reference: string
        }
        Returns: Json
      }
      lmc_require_flag_v1: { Args: { p_key: string }; Returns: undefined }
      lmc_reverse_v1: {
        Args: {
          p_actor_profile_id?: string
          p_idempotency_key: string
          p_kind: string
          p_original_transaction_id: string
          p_reason: string
        }
        Returns: Json
      }
      lmc_set_flag_v1: {
        Args: { p_actor_profile_id: string; p_enabled: boolean; p_key: string }
        Returns: undefined
      }
      lmc_spend_v1: {
        Args: {
          p_actor_profile_id?: string
          p_amount_cents: number
          p_company_id?: string
          p_idempotency_key: string
          p_profile_id?: string
          p_reason: string
        }
        Returns: Json
      }
      manages_organization: { Args: { org: string }; Returns: boolean }
      mark_agency_can_offer: {
        Args: { p_note?: string; p_request_id: string }
        Returns: string
      }
      mark_booking_requests_seen: { Args: never; Returns: undefined }
      mark_invitation_delivery_v1: {
        Args: { p_invitation_id: string; p_outcome: string }
        Returns: string
      }
      mark_service_requests_seen: { Args: never; Returns: undefined }
      my_privacy_consent_history: {
        Args: never
        Returns: {
          action: string
          consent_text_hash: string
          consent_text_version: string
          context_id: string | null
          context_type: string | null
          created_at: string
          id: string
          locale: string
          metadata: Json | null
          purpose: string
          recipient_organization_id: string | null
          request_id: string | null
          selected_fields: Json | null
          seq: number
          source: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "privacy_consent_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      owns_agency: { Args: { a: string }; Returns: boolean }
      owns_company: { Args: { c: string }; Returns: boolean }
      owns_customer: { Args: { c: string }; Returns: boolean }
      owns_worker: { Args: { w: string }; Returns: boolean }
      profile_role: { Args: never; Returns: string }
      project_position_salary_avg: {
        Args: { p_profession_id: string; p_project_id: string }
        Returns: {
          avg_mid_eur: number
          sample_n: number
        }[]
      }
      propose_booking_request: {
        Args: {
          p_expected_end_date: string
          p_location_country: string
          p_note: string
          p_request_id: string
          p_role_text: string
          p_start_date: string
          p_worker_id: string
        }
        Returns: string
      }
      propose_booking_request_v3: {
        Args: {
          p_expected_end_date: string
          p_location_country: string
          p_note: string
          p_request_id: string
          p_role_text: string
          p_start_date: string
          p_worker_id: string
        }
        Returns: string
      }
      propose_contact_disclosure_request_v1: {
        Args: {
          p_note?: string
          p_organization_id: string
          p_request_id: string
          p_requested_fields: Json
          p_worker_id: string
        }
        Returns: Json
      }
      propose_team_enquiry_v1: {
        Args: {
          p_company_organization_id?: string
          p_expected_end_date: string
          p_message: string
          p_start_date: string
          p_team_org_id: string
        }
        Returns: Json
      }
      provision_agency_worker_engagement_context: {
        Args: { p_agency_id: string; p_worker_id: string }
        Returns: string
      }
      provision_company_worker_engagement_context: {
        Args: { p_company_id: string; p_worker_id: string }
        Returns: string
      }
      record_personal_data_disclosure: {
        Args: {
          p_context_id: string
          p_context_type: string
          p_data_categories: string[]
          p_delivery_method: string
          p_document_ids: string[]
          p_recipient_organization_id: string
          p_worker_profile: string
        }
        Returns: Json
      }
      record_pilot_outcome_v1: {
        Args: {
          p_note?: string
          p_outcome: string
          p_participant_profile_id?: string
          p_pilot_id: string
        }
        Returns: Json
      }
      register_conversation_message_attachment: {
        Args: {
          p_attachment_id: string
          p_file_name: string
          p_file_size: number
          p_message_id: string
          p_mime_type: string
          p_storage_path: string
        }
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
      register_journal_entry_photo: {
        Args: {
          p_entry_id: string
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_photo_id: string
          p_storage_path: string
        }
        Returns: string
      }
      remove_pilot_participant_v1: {
        Args: { p_pilot_id: string; p_profile_id: string }
        Returns: string
      }
      remove_self_declared_work_history_v1: {
        Args: { p_id: string }
        Returns: string
      }
      remove_worker_language_v1: { Args: { p_lang: string }; Returns: boolean }
      report_defect_v1: {
        Args: {
          p_category: string
          p_description: string
          p_due_date?: string
          p_location?: string
          p_project_id: string
          p_severity?: string
          p_stage_id?: string
        }
        Returns: string
      }
      request_service_offering: {
        Args: { p_message?: string; p_offering_id: string }
        Returns: string
      }
      request_worker_absence_v1: {
        Args: {
          p_absence_type: string
          p_end_date: string
          p_half_day?: boolean
          p_note?: string
          p_start_date: string
          p_worker_id: string
        }
        Returns: string
      }
      request_worker_document_verification: {
        Args: { p_document_id: string }
        Returns: string
      }
      requester_identities_for_provider: {
        Args: { p_request_ids: string[] }
        Returns: {
          display_name: string
          request_id: string
        }[]
      }
      reschedule_booking_proposal_v1: {
        Args: {
          p_booking_id: string
          p_end_date: string
          p_note: string
          p_start_date: string
        }
        Returns: string
      }
      resend_invitation_v1: {
        Args: { p_invitation_id: string; p_new_token_hash: string }
        Returns: string
      }
      respond_booking_request: {
        Args: { p_booking_id: string; p_decision: string }
        Returns: string
      }
      respond_booking_request_v2: {
        Args: {
          p_booking_id: string
          p_decision: string
          p_reason_kind: string
          p_reason_note: string
        }
        Returns: string
      }
      respond_booking_request_v3: {
        Args: {
          p_booking_id: string
          p_decision: string
          p_reason_kind: string
          p_reason_note: string
        }
        Returns: Json
      }
      respond_contact_disclosure_request_v1: {
        Args: { p_decision: string; p_id: string }
        Returns: Json
      }
      respond_service_offering_request: {
        Args: { p_decision: string; p_id: string; p_note?: string }
        Returns: string
      }
      respond_team_enquiry_v1: {
        Args: { p_decision: string; p_enquiry_id: string }
        Returns: string
      }
      return_asset_v1: {
        Args: {
          p_assignment_id: string
          p_condition_at_return: string
          p_note?: string
        }
        Returns: undefined
      }
      review_journal_entries_batch: {
        Args: {
          p_acknowledged_exception_ids?: string[]
          p_decision: string
          p_entry_ids: string[]
          p_note?: string
        }
        Returns: {
          entry_id: string
          outcome: string
        }[]
      }
      review_journal_entry: {
        Args: { p_decision: string; p_entry_id: string; p_note?: string }
        Returns: string
      }
      review_worker_absence_v1: {
        Args: { p_absence_id: string; p_decision: string }
        Returns: undefined
      }
      reviewable_journal_entry_ids: { Args: never; Returns: string[] }
      revoke_agency_client_connection_v1: {
        Args: { p_connection_id: string }
        Returns: string
      }
      revoke_conversation_participant: {
        Args: { p_conversation_id: string; p_profile_id: string }
        Returns: string
      }
      revoke_invitation_v1: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      save_company_setup: {
        Args: {
          p_address?: string
          p_contact_email?: string
          p_contact_phone?: string
          p_country?: string
          p_legal_name: string
          p_registration_code?: string
          p_requester_role?: string
          p_submit?: boolean
          p_website?: string
        }
        Returns: string
      }
      save_company_setup_v2: {
        Args: {
          p_address?: string
          p_company_type?: string
          p_contact_email?: string
          p_contact_phone?: string
          p_country?: string
          p_legal_name: string
          p_registration_code?: string
          p_requester_role?: string
          p_submit?: boolean
          p_website?: string
        }
        Returns: string
      }
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
      save_self_declared_work_history_v1: {
        Args: {
          p_ended_at?: string
          p_relationship_slug: string
          p_started_at?: string
          p_title: string
        }
        Returns: string
      }
      save_team_details_v1: {
        Args: {
          p_accommodation_needed: boolean
          p_availability_status: string
          p_available_from: string
          p_deployable_size_max?: number
          p_deployable_size_min?: number
          p_destination_countries?: string[]
          p_max_trip_days: number
          p_note: string
          p_org_id: string
          p_transport_own: boolean
        }
        Returns: string
      }
      save_worker_availability_prefs: {
        Args: {
          p_availability_note: string
          p_has_transport: boolean
          p_max_trip_days: number
          p_needs_accommodation: boolean
          p_preferred_contract_type: string
          p_solo_available: boolean
          p_team_available: boolean
          p_willing_to_relocate: boolean
        }
        Returns: string
      }
      save_worker_availability_prefs_v2: {
        Args: {
          p_availability_note: string
          p_driving_licence_categories: string[]
          p_has_transport: boolean
          p_max_trip_days: number
          p_needs_accommodation: boolean
          p_night_shifts_ok: boolean
          p_overtime_ok: boolean
          p_own_tools: boolean
          p_own_vehicle: boolean
          p_pay_basis_preference: string
          p_preferred_contract_type: string
          p_solo_available: boolean
          p_team_available: boolean
          p_weekend_shifts_ok: boolean
          p_willing_to_relocate: boolean
        }
        Returns: string
      }
      save_worker_card: {
        Args: {
          p_availability_status?: string
          p_available_from?: string
          p_location_country?: string
          p_preferred_countries?: string[]
          p_salary_max?: number
          p_salary_min?: number
        }
        Returns: string
      }
      save_worker_language_v1: {
        Args: { p_lang: string; p_level: string }
        Returns: string
      }
      save_worker_opportunity_v1: {
        Args: { p_note: string; p_request_id: string }
        Returns: string
      }
      send_work_instruction: {
        Args: {
          p_body: string
          p_original_language?: string
          p_worker_profile_id: string
        }
        Returns: string
      }
      send_work_instruction_to_project: {
        Args: {
          p_body: string
          p_original_language?: string
          p_project_id?: string
          p_worker_profile_id: string
        }
        Returns: string
      }
      set_agency_worker_journal_review: {
        Args: { p_agency_id: string; p_enabled: boolean; p_worker_id: string }
        Returns: string
      }
      set_booking_response_deadline_v1: {
        Args: { p_booking_id: string; p_deadline: string }
        Returns: string
      }
      set_business_public_profile_v1: {
        Args: {
          p_contact_email?: string
          p_contact_phone?: string
          p_enabled: boolean
          p_org_id: string
          p_slug?: string
          p_tagline?: string
        }
        Returns: undefined
      }
      set_company_worker_journal_review: {
        Args: { p_company_id: string; p_enabled: boolean; p_worker_id: string }
        Returns: string
      }
      set_contract_status_v1: {
        Args: { p_contract_id: string; p_status: string }
        Returns: undefined
      }
      set_defect_status_v1: {
        Args: {
          p_assignee_profile_id?: string
          p_defect_id: string
          p_status: string
        }
        Returns: undefined
      }
      set_docs_aggregate_consent: {
        Args: { p_enabled: boolean }
        Returns: string
      }
      set_engagement_journal_review: {
        Args: { p_enabled: boolean; p_engagement_id: string }
        Returns: string
      }
      set_finance_record_status_v1: {
        Args: { p_record_id: string; p_status: string }
        Returns: string
      }
      set_follow_up_task_status_v1: {
        Args: { p_status: string; p_task_id: string }
        Returns: string
      }
      set_learning_review_item_status: {
        Args: { p_note?: string; p_review_item_id: string; p_status: string }
        Returns: string
      }
      set_marketplace_listing_status_v1: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      set_pilot_status_v1: {
        Args: { p_pilot_id: string; p_status: string }
        Returns: string
      }
      set_project_budget_status_v1: {
        Args: { p_budget_id: string; p_status: string }
        Returns: undefined
      }
      set_project_budget_v1: {
        Args: {
          p_category: string
          p_note?: string
          p_planned_amount_cents: number
          p_project_id: string
        }
        Returns: string
      }
      set_proposal_status_v1: {
        Args: {
          p_proposal_id: string
          p_rejection_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      set_work_task_status_v1: {
        Args: { p_status: string; p_task_id: string }
        Returns: string
      }
      set_worker_operational_status: {
        Args: {
          p_note: string
          p_project_id: string
          p_status: string
          p_worker_profile_id: string
        }
        Returns: string
      }
      share_request_with_agency_v1: {
        Args: { p_connection_id: string; p_request_id: string }
        Returns: string
      }
      submit_agency_candidate_offer_v1: {
        Args: {
          p_note?: string
          p_request_share_id: string
          p_worker_id: string
        }
        Returns: string
      }
      submit_company_need_public_v1: {
        Args: {
          p_accommodation?: string
          p_city_region?: string
          p_company_name: string
          p_contact_email?: string
          p_contact_name?: string
          p_contact_phone?: string
          p_country?: string
          p_description?: string
          p_engagement_type?: string
          p_expected_duration?: string
          p_headcount?: number
          p_languages?: string
          p_locale: string
          p_sector?: string
          p_source_path?: string
          p_start_window?: string
          p_transport_needed?: boolean
          p_urgency?: string
        }
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
      submit_help_request_v1: {
        Args: {
          p_demand_request_id?: string
          p_help_type: string
          p_note?: string
        }
        Returns: string
      }
      submit_privacy_request_v1: {
        Args: { p_note?: string; p_request_type: string }
        Returns: string
      }
      transfer_asset_assignment_v1: {
        Args: {
          p_assignment_id: string
          p_new_project_id?: string
          p_new_worker_id?: string
          p_note?: string
        }
        Returns: string
      }
      unsave_worker_opportunity_v1: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      unshare_request_v1: { Args: { p_share_id: string }; Returns: string }
      update_finance_record_v1: {
        Args: {
          p_amount_cents: string
          p_counterparty: string
          p_due_date: string
          p_note: string
          p_record_id: string
          p_title: string
        }
        Returns: string
      }
      update_marketplace_listing_v1: {
        Args: {
          p_category: string
          p_description?: string
          p_id: string
          p_listing_kind: string
          p_location_country?: string
          p_location_label?: string
          p_price_text?: string
          p_title: string
        }
        Returns: undefined
      }
      update_project_stage_v1: {
        Args: {
          p_actual_end?: string
          p_actual_start?: string
          p_blocked_reason?: string
          p_completion_criteria?: string
          p_name?: string
          p_planned_end?: string
          p_planned_start?: string
          p_stage_id: string
          p_stage_order?: number
          p_status?: string
        }
        Returns: undefined
      }
      update_work_task_v1: {
        Args: {
          p_description: string
          p_due_date: string
          p_priority: string
          p_task_id: string
          p_title: string
        }
        Returns: string
      }
      upsert_worker_document: {
        Args: {
          p_country: string
          p_document_type_slug: string
          p_note: string
          p_status: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: string
      }
      upsert_worker_readiness_item: {
        Args: {
          p_item_key: string
          p_label: string
          p_note: string
          p_project_id: string
          p_status: string
          p_worker_profile_id: string
        }
        Returns: string
      }
      withdraw_agency_candidate_offer_v1: {
        Args: { p_offer_id: string }
        Returns: boolean
      }
      withdraw_booking_request: {
        Args: { p_booking_id: string }
        Returns: string
      }
      withdraw_booking_request_v2: {
        Args: {
          p_booking_id: string
          p_reason_kind: string
          p_reason_note: string
        }
        Returns: string
      }
      withdraw_contact_disclosure_request_v1: {
        Args: { p_id: string }
        Returns: Json
      }
      withdraw_employer_data_disclosure: {
        Args: {
          p_context_id: string
          p_context_type: string
          p_recipient_organization_id: string
          p_source: string
        }
        Returns: Json
      }
      withdraw_profile_discoverability_consent: {
        Args: { p_source: string }
        Returns: Json
      }
      withdraw_service_offering_request: {
        Args: { p_id: string }
        Returns: string
      }
      withdraw_team_enquiry_v1: {
        Args: { p_enquiry_id: string }
        Returns: string
      }
      worker_profile_discoverable: {
        Args: { p_profile: string }
        Returns: boolean
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
