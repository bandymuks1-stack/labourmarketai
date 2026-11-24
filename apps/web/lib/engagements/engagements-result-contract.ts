/**
 * §7.1 — the `engagements` result contract. PURE (no `server-only`, no IO).
 *
 * Same idiom as `project-result-contract.ts` and `employer-workspace-contract.ts`,
 * and it exists for the same mechanical reason: a `"use server"` module may only
 * export async functions, so a value like the row cap cannot live beside the
 * loader. Splitting the shapes out is what lets the server adapter, the client
 * renderer and the guard tests all name the same contract.
 *
 * NOTHING HERE LOADS OR DECIDES ANYTHING. Visibility stays with
 * `company_worker_engagements_select` (RLS), and the authority to END an
 * engagement stays with `end_company_worker_engagement_v2`. These are shapes.
 */

/** A hard ceiling so the read can never become unbounded. */
export const ENGAGEMENTS_RESULT_LIMIT = 50;

/**
 * Which of the viewer's own rows are meaningful where they are standing.
 *
 *   "organization" — rows where the viewer is the owning company. Standing in
 *                    a workspace, "my engagements" means the company's roster.
 *   "personal"     — rows where the viewer IS the engaged worker. Standing in
 *                    Personal space, it means the work I personally do.
 *
 * NOT a permission and not a role: both slices come out of the SAME RLS-scoped
 * query, so neither can widen what the database already refuses.
 */
export type EngagementsContext = "organization" | "personal";

export type EngagementStatus = "active" | "ended";

export interface EngagementRow {
  readonly engagementId: string;
  /** Canonical stored status. An unreadable value is dropped, never guessed. */
  readonly status: EngagementStatus;
  /** The other party's name, as far as this viewer may truthfully read it. */
  readonly counterpartyName: string | null;
  readonly startedAt: string;
  /** Only ever the STORED value — never derived, never estimated. */
  readonly endedAt: string | null;
  /**
   * Which side the VIEWER is on for this row. Derived server-side from the
   * row's own relationships, never from the client, and used only to word the
   * panel — the write re-derives authority regardless.
   */
  readonly viewerSide: "company" | "worker";
}

export type EngagementsResult =
  | { kind: "engagements"; rows: readonly EngagementRow[] }
  | { kind: "empty" }
  /** The owner-gated table is not present in this environment. */
  | { kind: "needs-migration" }
  /** Read failed. NEVER rendered as "you have none". */
  | { kind: "blocked" };
