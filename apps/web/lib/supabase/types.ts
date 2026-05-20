/**
 * Database types — HAND-AUTHORED MIRROR of supabase/migrations/0001.
 *
 * The brief's single-source-of-truth principle says DB types are GENERATED,
 * not hand-written. They will be — but M0 ships the migration *files* for the
 * founder to apply (no Supabase access token is available to this agent, so
 * the cloud schema does not exist yet and cannot be introspected). This file
 * keeps the three clients fully typed and the build green until then.
 *
 * After `pnpm db:push`, regenerate and OVERWRITE this file:
 *   pnpm db:types        # supabase gen types typescript … > this file
 *
 * Decision recorded for an ADR in slice 7 (docs/DECISIONS/).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Generated types split Row/Insert/Update; this temporary mirror keeps
 *  Insert/Update permissive (Partial) — the real generated file is precise. */
type Tbl<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

type Profiles = {
  id: string;
  /** Which role's workspace the user currently sees. Multi-role catalogue
   *  lives in `profile_roles` (slice 6 / migration 0003). */
  active_role: string | null;
  locale: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  onboarded: boolean;
  /** Timestamp of first onboarding completion; null = needs onboarding. */
  onboarded_at: string | null;
  consent_marketing: boolean;
  consent_data_processing: boolean;
  created_at: string;
  updated_at: string;
};

type ProfileRoles = {
  id: string;
  profile_id: string;
  role: string;
  added_at: string;
  is_active: boolean;
  role_data: Json;
};

type Workers = {
  id: string;
  profile_id: string | null;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  experience_years: number | null;
  current_location_country: string | null;
  preferred_countries: string[] | null;
  availability_status: string | null;
  available_from: string | null;
  salary_min_eur: number | null;
  salary_max_eur: number | null;
  trust_score: number;
  profile_completeness: number;
  created_at: string;
  updated_at: string;
};

type Skills = {
  id: string;
  slug: string | null;
  category: string | null;
  name_lt: string | null;
  name_en: string | null;
  created_at: string;
  updated_at: string;
};

type Countries = {
  code: string;
  name_lt: string;
  name_en: string;
  is_target_market: boolean;
  created_at: string;
  updated_at: string;
};

type WorkerSkills = {
  id: string;
  worker_id: string | null;
  skill_id: string | null;
  self_rated_level: number | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type Companies = {
  id: string;
  profile_id: string | null;
  legal_name: string | null;
  display_name: string | null;
  country: string | null;
  vat_number: string | null;
  trust_score: number;
  description: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
};

type Agencies = {
  id: string;
  profile_id: string | null;
  legal_name: string | null;
  country: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type AgencyWorkers = {
  agency_id: string;
  worker_id: string;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type Projects = {
  id: string;
  company_id: string | null;
  title: string | null;
  country: string | null;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  housing_provided: boolean | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type JobDemands = {
  id: string;
  project_id: string | null;
  role_title: string | null;
  headcount_needed: number | null;
  required_skills: string[] | null;
  preferred_countries: string[] | null;
  salary_offered_eur: number | null;
  start_date: string | null;
  status: string | null;
  visibility: string | null;
  created_at: string;
  updated_at: string;
};

type Matches = {
  id: string;
  worker_id: string | null;
  job_demand_id: string | null;
  score: number | null;
  reasons: Json | null;
  computed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MatchActions = {
  id: string;
  match_id: string | null;
  actor_id: string | null;
  action: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
};

type Threads = {
  id: string;
  match_id: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type Messages = {
  id: string;
  thread_id: string | null;
  sender_id: string | null;
  body: string | null;
  sent_at: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

type Consents = {
  id: string;
  profile_id: string | null;
  consent_type: string | null;
  granted: boolean | null;
  granted_at: string | null;
  revoked_at: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

type Leads = {
  id: string;
  source: string | null;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  country: string | null;
  intent: string | null;
  status: string | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

type Plans = {
  id: string;
  slug: string | null;
  name_lt: string | null;
  name_en: string | null;
  price_eur_monthly: number | null;
  features: Json | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type Subscriptions = {
  id: string;
  profile_id: string | null;
  plan_id: string | null;
  status: string | null;
  started_at: string | null;
  current_period_end: string | null;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
};

type AuditLogs = {
  id: string;
  actor_id: string | null;
  action: string | null;
  entity: string | null;
  entity_id: string | null;
  payload: Json | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Tbl<Profiles>;
      profile_roles: Tbl<ProfileRoles>;
      workers: Tbl<Workers>;
      skills: Tbl<Skills>;
      countries: Tbl<Countries>;
      worker_skills: Tbl<WorkerSkills>;
      companies: Tbl<Companies>;
      agencies: Tbl<Agencies>;
      agency_workers: Tbl<AgencyWorkers>;
      projects: Tbl<Projects>;
      job_demands: Tbl<JobDemands>;
      matches: Tbl<Matches>;
      match_actions: Tbl<MatchActions>;
      threads: Tbl<Threads>;
      messages: Tbl<Messages>;
      consents: Tbl<Consents>;
      leads: Tbl<Leads>;
      plans: Tbl<Plans>;
      subscriptions: Tbl<Subscriptions>;
      audit_logs: Tbl<AuditLogs>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
