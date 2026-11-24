/**
 * The exact-signature scope of
 * `supabase/migrations/20260722160000_secdef_anon_reach_revoke_v1.sql`.
 *
 * This exists so the CI guard can assert SET EQUALITY on full signatures rather
 * than counting function names. A count is not a contract: swapping one function
 * for another, or mistyping an argument list, keeps the number identical while
 * changing exactly what the migration does.
 *
 * Signatures are in `pg_get_function_identity_arguments` form — `name type`, not
 * bare types. Reproduce from production with:
 *
 *   select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
 *     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 *    where n.nspname = 'public' and p.prosecdef
 *      and has_function_privilege('anon', p.oid, 'EXECUTE');
 *
 * NOTE: do NOT feed these strings to a `regprocedure` cast. That input accepts
 * ARGUMENT TYPES ONLY, so `owns_company(c uuid)` raises 42601. Resolve by joining
 * `pg_proc` on the computed identity string instead.
 */

/** Post-apply posture each function must end in. */
export type RevokeGroup =
  /** Real logged-in product surface. Must keep `authenticated` EXECUTE. */
  | "AUTHENTICATED_ONLY"
  /** `returns trigger`. No client role needs EXECUTE at all. */
  | "TRIGGER_ONLY"
  /** No call site anywhere. Revoked, deliberately not dropped. */
  | "DEAD";

export type RevokeScopeEntry = {
  readonly signature: string;
  readonly group: RevokeGroup;
  /**
   * True when production's `proacl` is NULL for this function, i.e. it reaches
   * `authenticated` ONLY by inheriting PUBLIC. Those are the only entries that
   * require an explicit `GRANT ... TO authenticated` in the migration; granting
   * the rest would obscure which functions actually depend on it.
   */
  readonly needsAuthenticatedGrant: boolean;
};

export const SECDEF_REVOKE_SCOPE: ReadonlyArray<RevokeScopeEntry> = [
  // --- 22 mutating RPCs, all holding a direct `authenticated=X` grant already
  { signature: "acknowledge_asset_assignment_v1(p_assignment_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "add_defect_correction_v1(p_defect_id uuid, p_work_performed text, p_materials text, p_outcome text, p_completed_at date)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "add_project_stage_v1(p_project_id uuid, p_name text, p_stage_order integer, p_planned_start date, p_planned_end date, p_completion_criteria text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "cancel_worker_absence_v1(p_absence_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "create_asset_v1(p_organization_id uuid, p_asset_type text, p_name text, p_serial_or_reg text, p_condition text, p_note text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "delete_defect_v1(p_defect_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "delete_project_budget_v1(p_budget_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "delete_project_stage_v1(p_stage_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "report_defect_v1(p_project_id uuid, p_category text, p_description text, p_severity text, p_stage_id uuid, p_location text, p_due_date date)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "request_worker_absence_v1(p_worker_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_half_day boolean, p_note text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "review_worker_absence_v1(p_absence_id uuid, p_decision text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "set_business_public_profile_v1(p_org_id uuid, p_enabled boolean, p_slug text, p_tagline text, p_contact_email text, p_contact_phone text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "set_defect_status_v1(p_defect_id uuid, p_status text, p_assignee_profile_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "set_project_budget_status_v1(p_budget_id uuid, p_status text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "set_project_budget_v1(p_project_id uuid, p_category text, p_planned_amount_cents bigint, p_note text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "update_project_stage_v1(p_stage_id uuid, p_name text, p_status text, p_stage_order integer, p_planned_start date, p_planned_end date, p_actual_start date, p_actual_end date, p_blocked_reason text, p_completion_criteria text)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },

  // --- 3 predicate helpers that already hold a direct `authenticated=X` grant
  { signature: "asset_open_assignment_for_caller(p_asset_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "caller_manages_asset(p_asset_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },
  { signature: "caller_manages_defect(p_defect_id uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: false },

  // --- 8 predicate helpers with `proacl IS NULL` — these REQUIRE the grant
  { signature: "can_access_match(m uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: true },
  { signature: "is_admin()", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: true },
  { signature: "is_employer()", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: true },
  { signature: "manages_organization(org uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: true },
  { signature: "owns_agency(a uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: true },
  { signature: "owns_company(c uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: true },
  { signature: "owns_worker(w uuid)", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: true },
  { signature: "profile_role()", group: "AUTHENTICATED_ONLY", needsAuthenticatedGrant: true },

  // --- 1 dead function: revoked, deliberately not dropped, no grant
  { signature: "owns_customer(c uuid)", group: "DEAD", needsAuthenticatedGrant: false },

  // --- 9 trigger functions: revoked, no grant to any client role
  { signature: "enforce_company_verification_guard()", group: "TRIGGER_ONLY", needsAuthenticatedGrant: false },
  { signature: "ensure_org_owner_engagement()", group: "TRIGGER_ONLY", needsAuthenticatedGrant: false },
  { signature: "ensure_worker_personal_engagement()", group: "TRIGGER_ONLY", needsAuthenticatedGrant: false },
  { signature: "ensure_worker_profile()", group: "TRIGGER_ONLY", needsAuthenticatedGrant: false },
  { signature: "handle_new_user()", group: "TRIGGER_ONLY", needsAuthenticatedGrant: false },
  { signature: "journal_entry_confirmations_guard()", group: "TRIGGER_ONLY", needsAuthenticatedGrant: false },
  { signature: "learning_review_queue_guard_stale()", group: "TRIGGER_ONLY", needsAuthenticatedGrant: false },
  { signature: "mirror_agency_to_org()", group: "TRIGGER_ONLY", needsAuthenticatedGrant: false },
  { signature: "mirror_company_to_org()", group: "TRIGGER_ONLY", needsAuthenticatedGrant: false },
] as const;

/** Normalize whitespace so SQL formatting differences never mask a mismatch. */
export function normalizeSignature(sig: string): string {
  return sig.replace(/\s+/g, " ").trim().toLowerCase();
}

export const SECDEF_REVOKE_SIGNATURES: ReadonlySet<string> = new Set(
  SECDEF_REVOKE_SCOPE.map((e) => normalizeSignature(e.signature)),
);

export const SECDEF_GRANT_SIGNATURES: ReadonlySet<string> = new Set(
  SECDEF_REVOKE_SCOPE.filter((e) => e.needsAuthenticatedGrant).map((e) =>
    normalizeSignature(e.signature),
  ),
);
