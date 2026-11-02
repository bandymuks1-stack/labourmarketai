/**
 * PRODUCT-LEVEL SCOPES FOR THIRD-PARTY ASSISTANTS (register 10.4) — DRAFT.
 *
 * ## Why here and not at the authorization server
 *
 * Supabase Auth's OAuth 2.1 server issues only OIDC scopes (`openid email
 * profile phone`) and says "Custom scopes are not currently supported"
 * (supabase.com/docs/guides/auth/oauth-server/oauth-flows, read 2026-11-01).
 * So a product scope cannot ride in the token. It is enforced at the
 * resource server instead — this door — keyed on the one fact the token does
 * carry: that it was issued to an OAuth client (`client_id`, verified and
 * audience-bound by `lib/api/api-identity.ts`, C-3).
 *
 * ## The rule
 *
 *   - A FIRST-PARTY session (web, the phone) sees the whole toolset, exactly
 *     as before. It is the person's own app.
 *   - An OAUTH-CLIENT token (ChatGPT, Claude, any DCR client) sees ONLY the
 *     curated assistant toolset below: the person's own journal, Living CV,
 *     work discovery, schedule and messages. Organisation operations,
 *     agency flows, evidence import, marketplace publishing and roster
 *     management stay in the product until the owner opens them (X-2).
 *
 * This NARROWS what an assistant can do; it never widens anything. RLS still
 * decides what each tool may touch. The scopes are defined over PUBLISHED
 * TOOL NAMES — the contract an assistant actually sees — and a guard
 * (`assistant-scopes.test.ts`) fails if a name stops existing.
 *
 * ## Owner decision X-2 (open)
 *
 * Which scopes an assistant gets by default, whether the person picks them
 * on the consent screen (needs a per-grant record = migration, RED), and
 * whether any organisation scope is offered at all. Until X-2: every OAuth
 * client gets ALL scopes below and nothing else.
 */

export const ASSISTANT_SCOPES = {
  /** Who I am and which workspace I act in. */
  account: ["profile_get", "context_list", "context_switch", "notification_list"],
  /** My recorded work and what it shows about me. */
  "journal:read": [
    "journal_list",
    "journal_work_intelligence_get",
    "living_cv_skills_get",
    "cv_state_get",
    "cv_verified_get",
  ],
  /** Record or correct my own work — always draft → confirm. */
  "journal:write": ["journal_create_draft", "journal_confirm", "journal_correct_draft", "journal_correct_confirm"],
  /** Find work and say I am interested — drafts need my confirmation. */
  "work:discover": [
    "jobs_search",
    "jobs_get",
    "jobs_new_list",
    "work_find",
    "opportunities_saved_list",
    "interest_express_draft",
    "interest_express_confirm",
    "work_card_save_draft",
    "work_card_save_confirm",
  ],
  /** My calendar, engagements, absences and open tasks. */
  schedule: [
    "calendar_agenda_get",
    "worker_engagements_list",
    "worker_projects_list",
    "absence_mine_list",
    "absence_request_draft",
    "absence_request_confirm",
    "leave_balances_get",
    "tasks_open_list",
  ],
  /** My conversations — sending is draft → confirm. */
  messages: ["conversation_list", "conversation_get", "message_send_draft", "message_send_confirm", "invitations_list"],
} as const satisfies Record<string, readonly string[]>;

export type AssistantScope = keyof typeof ASSISTANT_SCOPES;

/** Until owner decision X-2: every OAuth client holds every assistant scope. */
export const DEFAULT_ASSISTANT_SCOPES: readonly AssistantScope[] = Object.keys(ASSISTANT_SCOPES) as AssistantScope[];

/** The tool names a caller holding `scopes` may list and call. */
export function assistantToolNames(scopes: readonly AssistantScope[] = DEFAULT_ASSISTANT_SCOPES): ReadonlySet<string> {
  return new Set(scopes.flatMap((s) => ASSISTANT_SCOPES[s]));
}
