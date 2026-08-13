/**
 * ESCO taxonomy layer config (S2 / esco-taxonomy-foundation).
 *
 * Flag-flip slice (design doc §9 step 3): ON since 2026-06-10 — the three S2
 * migrations are APPLIED to prod via MCP apply_migration (ledger
 * 20260610172207/172226/172251) and the typeahead is wired into the
 * skill-clarify capture with the EU attribution. The v1.2.1 catalogue IS
 * IMPORTED: 1,045,186 labels across 28 locales in `esco_labels`
 * (prod-verified 2026-08-13) — the typeahead serves real suggestions. The
 * honest empty degradation remains only for environments where the import
 * has not been run.
 */
export const ESCO_AUTOCOMPLETE_ENABLED = true;

/** Mandatory EU-licence attribution — shown wherever ESCO data surfaces. */
export const ESCO_ATTRIBUTION =
  "This service uses the ESCO classification of the European Commission.";
