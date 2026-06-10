/**
 * ESCO taxonomy layer config (S2 / esco-taxonomy-foundation).
 *
 * The deterministic autocomplete ships OFF: the esco_* tables exist only as
 * needs-human-gate DRAFT migrations until the owner applies them via MCP and
 * runs the import (docs/product/esco-taxonomy-design.md §9). Flipping this to
 * true is the dedicated flag-flip slice (one-line PR + input wiring + footer
 * attribution) — never flip it together with unapplied migrations.
 */
export const ESCO_AUTOCOMPLETE_ENABLED = false;

/** Mandatory EU-licence attribution — shown wherever ESCO data surfaces. */
export const ESCO_ATTRIBUTION =
  "This service uses the ESCO classification of the European Commission.";
