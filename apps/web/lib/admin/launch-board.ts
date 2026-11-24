/**
 * Launch board — the 15 launch-tree items with HONEST statuses (PR12).
 *
 * PURE STATIC DECLARATION, deliberately hand-maintained: a status here is a
 * CLAIM, so every non-RED claim must cite a real proof artifact (an audit
 * file in runtime/audits/ or a guard test in lib/guards/) — the guard
 * `owner-control-room.test.ts` fails CI if a cited proof file does not
 * exist, which makes fake launch readiness structurally impossible.
 *
 * Statuses:
 *  - "green_scoped": launch scope closed; larger future scope documented.
 *  - "yellow": partial, pending PR, or owner decision pending.
 *  - "red": missing/fake/disconnected (nothing may ship RED silently).
 * "green" (unscoped) is intentionally NEVER used: the board closed at PR16
 * (runtime/audits/full-launch-readiness-final-audit-2026-07-05.md) with all
 * 15 items green_scoped — scoped remains the strongest honest claim, since
 * every item documents deferred larger scope.
 */

export type LaunchStatus = "green_scoped" | "yellow" | "red";

export interface LaunchBoardItem {
  readonly key: string;
  readonly status: LaunchStatus;
  /** Repo-relative proof artifact (audit or guard). REQUIRED for
   *  green_scoped; recommended for yellow. */
  readonly proof: string | null;
  /** Pending owner decision, when one exists. */
  readonly ownerDecision?: string;
  /** What is still open (yellow items). */
  readonly pending?: string;
}

export const LAUNCH_BOARD: readonly LaunchBoardItem[] = [
  {
    key: "public_market_entry",
    status: "green_scoped",
    proof: "runtime/audits/public-market-entry-sales-launch-audit-2026-07-05.md",
  },
  {
    key: "user_identity",
    status: "green_scoped",
    proof: "apps/web/lib/guards/player-card-identity-consistency.test.ts",
  },
  {
    key: "worker_profile_player_card",
    status: "green_scoped",
    proof: "runtime/audits/player-card-worker-profile-launch-audit-2026-07-05.md",
  },
  {
    key: "skill_intelligence",
    status: "green_scoped",
    proof: "runtime/audits/offline-multilingual-skill-recognition-audit-2026-07-04.md",
  },
  {
    key: "work_journal",
    status: "green_scoped",
    proof: "apps/web/lib/guards/journal-realworld-recognition.test.ts",
  },
  {
    key: "company_demand",
    status: "green_scoped",
    proof: "runtime/audits/company-demand-system-launch-audit-2026-07-05.md",
  },
  {
    key: "market_map",
    status: "green_scoped",
    proof: "runtime/audits/market-map-location-radius-reality-audit-2026-07-05.md",
    ownerDecision: "radius: offline geocode source or consented device coordinates",
  },
  {
    key: "matching_scouting",
    status: "green_scoped",
    proof: "runtime/audits/matching-scouting-reality-audit-2026-07-04.md",
  },
  {
    key: "trust_connect",
    status: "green_scoped",
    proof: "runtime/audits/trust-connect-minimum-launch-audit-2026-07-05.md",
  },
  {
    key: "control_room",
    status: "green_scoped",
    proof: "runtime/audits/owner-control-room-launch-minimum-audit-2026-07-05.md",
  },
  {
    key: "first_use_ux",
    status: "green_scoped",
    proof: "apps/web/lib/guards/first-use-ux.test.ts",
  },
  {
    key: "localization",
    status: "green_scoped",
    proof: "runtime/audits/localization-launch-scope-audit-2026-07-05.md",
    ownerDecision: "FI full UI locale promotion (deferred — taxonomy/recognition only)",
  },
  {
    key: "sales_market_entry",
    status: "green_scoped",
    proof: "runtime/audits/public-market-entry-sales-launch-audit-2026-07-05.md",
  },
  {
    key: "technical_foundation",
    status: "green_scoped",
    // Production apply of 20260705150000 verified 2026-07-05 (Supabase MCP,
    // read-only checks + rolled-back write probes) — see §2 of the proof.
    proof: "runtime/audits/full-launch-readiness-final-audit-2026-07-05.md",
  },
  {
    key: "launch_readiness",
    status: "green_scoped",
    proof: "runtime/audits/full-launch-readiness-final-audit-2026-07-05.md",
  },
];
