import { personMonogram } from "@/lib/visual/avatar-monogram";

/**
 * Player Identity foundation — the canonical contract for rendering ONE person
 * (or company) as a "player" across every surface of the product.
 *
 * This module is purely ADDITIVE: it codifies the shared identity vocabulary
 * (initials source, fallback-tile surface, hairline border, avatar size scale,
 * variant taxonomy) that surfaces adopt incrementally. It changes no route, no
 * auth, no data, no business logic and no copy meaning — only the visual /
 * component vocabulary. The full anatomy + adoption plan lives in
 * docs/design/player-identity-adaptation-plan.md.
 *
 * It deliberately reuses tokens that are ALREADY the guard-blessed canonical on
 * the worker player card header and the market-map marker fallback, so adopting
 * the foundation can only converge surfaces, never introduce a new look.
 */

/**
 * The canonical initials source for a person identity. Deterministic, null-safe,
 * neutral-dot fallback (never a synthesised face) — the SAME initials on the
 * player card header, the map marker and any compact card. Re-exported here so a
 * surface depends on the identity contract, not a deep util path. `avatarMonogram`
 * stays as the generic two-char primitive; `playerInitials` is the person-scoped
 * canonical that surfaces should reach for.
 */
export const playerInitials = personMonogram;

/**
 * Every surface that renders a player identity is one of these variants. Adding a
 * new identity surface means picking a variant and its documented field set —
 * never inventing a bespoke, unrelated card.
 */
export const PLAYER_IDENTITY_VARIANTS = [
  "hero", // public landing / market hero player card
  "profile", // owner profile identity card (editable avatar)
  "cv-header", // Living CV / Mano CV identity header
  "work-strip", // work-record / journal-entry identity strip
  "dashboard-compact", // authenticated dashboard compact card
  "map-marker", // market-map simplified marker + hover card
  "request-provider", // marketplace request / provider compact card
] as const;
export type PlayerIdentityVariant = (typeof PLAYER_IDENTITY_VARIANTS)[number];

/**
 * Canonical avatar pixel scale per usage. Guidance for the avatar box size; the
 * shared Avatar / AvatarDisplay components own the actual rendering. A fixed
 * scale replaces today's ad-hoc 40/48/52/56/64/96 fragmentation.
 */
export const PLAYER_AVATAR_PX = {
  marker: 52,
  compact: 40,
  strip: 44,
  header: 64,
  hero: 96,
} as const;
export type PlayerAvatarSize = keyof typeof PLAYER_AVATAR_PX;

/**
 * Canonical monogram-tile surface — the tokens already used by the worker player
 * card header and the map marker fallback (`bg-ink-700` + `text-text-primary`),
 * so the initials tile reads identically across the dark/light theme swap and
 * across surfaces. Pinned by player-card-identity-consistency.test.ts for the
 * card + map; the profile avatar adopts the same surface here.
 */
export const PLAYER_IDENTITY_FALLBACK_SURFACE = "bg-ink-700 text-text-primary";

/** Canonical avatar hairline (1px, ink-500), shared by the photo and the tile. */
export const PLAYER_IDENTITY_AVATAR_BORDER = "border border-ink-500";
