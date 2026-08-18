/**
 * PRODUCTION ↔ REPOSITORY MIGRATION PARITY — the pure matching rule.
 *
 * Doctrine §16: every migration applied to production must have a file in this
 * repository, so the schema is reproducible from the repo alone and the
 * repository really is the audit trail (REQ-GOV-016 / REQ-GOV-014).
 *
 * WHY THIS IS NOT A STRING EQUALITY CHECK. Production's ledger
 * (`supabase_migrations.schema_migrations`) does not mirror repo filenames:
 *
 *  1. **Apply-time-as-version drift.** Supabase stamps the APPLY time as
 *     `version`, not the migration's own timestamp. `version` is therefore
 *     useless for matching; only `name` carries identity.
 *  2. **Name shape varies.** Some rows carry the full repo stem
 *     (`20260804160000_booking_engagement_end_v2`), some carry only the slug
 *     (`timesheets_v1` for `20260817170000_timesheets_v1.sql`).
 *  3. **Split / union / follow-up applies.** A lead session sometimes applies
 *     ONE repo file as SEVERAL ledger rows (the three `journal_entry_photos`
 *     parts), or TWO repo files as ONE row (the notification v3 union), or
 *     lands a follow-up completion under its own name. Those rows are not
 *     missing files — but only a REVIEWED statement can say so, which is what
 *     `REVIEWED_APPLY_SHAPES` is. Anything not listed there must match a file
 *     by rule 1 or 2, or it is an orphan and the gate fails.
 *
 * A row that is a genuine orphan is a real defect: the schema cannot be
 * rebuilt from the repo. Adding an entry here to silence one is exactly the
 * failure this guard exists to prevent — restore the file instead.
 */

/** One row of production's `supabase_migrations.schema_migrations`. */
export type ProductionMigration = {
  /** Apply time, NOT the migration's own timestamp. Never match on this. */
  readonly version: string;
  readonly name: string;
};

/** How a production ledger row is accounted for. */
export type ApplyShape =
  /** One repo file applied as several ledger rows. */
  | { readonly kind: "split"; readonly repoStem: string; readonly why: string }
  /** Several repo files applied as one ledger row. */
  | { readonly kind: "union"; readonly repoStems: readonly string[]; readonly why: string }
  /** A completion of an earlier apply whose content lives in an existing file. */
  | { readonly kind: "follow_up"; readonly repoStem: string; readonly why: string }
  /**
   * The ledger slug matches SEVERAL repo files, so name-matching correctly
   * refuses to guess. This names the file that was actually applied and the
   * sibling(s) that were not.
   */
  | {
      readonly kind: "duplicate_slug";
      readonly repoStem: string;
      readonly supersededStems: readonly string[];
      readonly why: string;
    };

/**
 * REVIEWED apply shapes — each one checked against the repo file's contents on
 * 2026-08-18 and recorded in `docs/migrations/production-parity-register.md`.
 * Adding an entry is a claim that the named repo file(s) already contain the
 * applied content. Do not add one without checking.
 */
export const REVIEWED_APPLY_SHAPES: Readonly<Record<string, ApplyShape>> = {
  journal_entry_photos_table: {
    kind: "split",
    repoStem: "20260612091000_journal_entry_photos",
    why: "part 1/3 of one repo file (metadata table + RLS + grants)",
  },
  journal_entry_photos_rpc: {
    kind: "split",
    repoStem: "20260612091000_journal_entry_photos",
    why: "part 2/3 of the same repo file (register RPC)",
  },
  journal_entry_photos_storage: {
    kind: "split",
    repoStem: "20260612091000_journal_entry_photos",
    why: "part 3/3 of the same repo file (private bucket + owner-scoped policies)",
  },
  conversation_message_language_check: {
    kind: "follow_up",
    repoStem: "20260610190000_conversation_message_language",
    why:
      "production's column pre-existed, so that file's ADD COLUMN IF NOT EXISTS " +
      "no-opped and its INLINE check never materialised; this row added exactly " +
      "that CHECK. A clean rebuild creates the column WITH the inline check, so " +
      "the repo file reproduces the constraint on its own",
  },
  company_memberships_v1_trigger_fn_revoke: {
    kind: "follow_up",
    repoStem: "20260806090000_company_memberships_v1",
    why: "the trigger-function REVOKEs are present in that file (lines 168-169)",
  },
  notification_types_union_workflow_document_v3: {
    kind: "union",
    repoStems: [
      "20260817130100_notification_events_v3_workflow_types",
      "20260817140100_notification_document_types_v3",
    ],
    why:
      "both repo files applied as one row; replaying them in order (then v4) " +
      "reproduces production's 17 event types and 8 entity types exactly",
  },
  invitation_org_authority_v1_resend_completion: {
    kind: "follow_up",
    repoStem: "20260817121000_invitation_org_authority_v1",
    why: "that file already carries the resend org-authority branch (§4)",
  },
  company_memberships_v1: {
    kind: "duplicate_slug",
    repoStem: "20260806090000_company_memberships_v1",
    supersededStems: ["20260714210000_company_memberships_v1"],
    why:
      "two repo files share this slug. The APPLIED one is 20260806090000 " +
      "(M-P0-4, owner-approved 2026-08-05). 20260714210000 is a DRAFT that was " +
      "never applied and is marked SUPERSEDED-BY-20260817160000 in its own " +
      "header; it stays in the tree only because company-architecture-v1.test.ts " +
      "pins its content, so it correctly appears as 'not applied'",
  },
  public_vacancy_preview_v1_revoke_public: {
    kind: "follow_up",
    repoStem: "20260818140000_public_vacancy_preview_v1",
    why:
      "that file already carries the REVOKE-FROM-PUBLIC block for all three " +
      "projection functions; the first apply predated it",
  },
};

export type ParityResult = {
  /** Applied in production with no repo file and no reviewed apply shape. */
  readonly orphans: readonly ProductionMigration[];
  /** Repo files with no production ledger row (normal on a feature branch). */
  readonly unapplied: readonly string[];
  /** Ledger rows accounted for by a reviewed split/union/follow-up shape. */
  readonly reviewed: readonly ProductionMigration[];
  /** Ledger rows matched to a repo file by name. */
  readonly matchedDirectly: readonly ProductionMigration[];
};

/**
 * Match ONE ledger name to a repo stem by name alone (rules 1 and 2). Returns
 * null when no file matches — the caller then consults the reviewed shapes.
 */
export function matchRepoStem(
  name: string,
  repoStems: readonly string[],
): string | null {
  if (repoStems.includes(name)) return name;
  // Rule 2: the ledger carries only the slug; the repo stem prefixes it with
  // the migration's own timestamp. Require a UNIQUE match — two files sharing
  // a slug is itself a repo problem and must not be resolved by guessing.
  const bySlug = repoStems.filter((s) => s.slice(s.indexOf("_") + 1) === name);
  return bySlug.length === 1 ? bySlug[0]! : null;
}

/** Compare the production ledger against the repo's migration filenames. */
export function checkMigrationParity(
  production: readonly ProductionMigration[],
  repoStems: readonly string[],
): ParityResult {
  const orphans: ProductionMigration[] = [];
  const reviewed: ProductionMigration[] = [];
  const matchedDirectly: ProductionMigration[] = [];
  const accountedStems = new Set<string>();

  for (const row of production) {
    const direct = matchRepoStem(row.name, repoStems);
    if (direct) {
      matchedDirectly.push(row);
      accountedStems.add(direct);
      continue;
    }
    const shape = REVIEWED_APPLY_SHAPES[row.name];
    if (shape) {
      const stems = shape.kind === "union" ? shape.repoStems : [shape.repoStem];
      // A reviewed shape that names a file the repo does not have is NOT a
      // pass — it is a stale entry, and stale entries are how a gate rots.
      if (stems.every((s) => repoStems.includes(s))) {
        reviewed.push(row);
        for (const s of stems) accountedStems.add(s);
        continue;
      }
    }
    orphans.push(row);
  }

  const unapplied = repoStems
    .filter((s) => !accountedStems.has(s))
    .sort((a, b) => a.localeCompare(b));

  return { orphans, unapplied, reviewed, matchedDirectly };
}
