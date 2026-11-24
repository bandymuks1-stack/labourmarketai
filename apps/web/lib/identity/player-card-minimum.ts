import { playerInitials } from "@/lib/identity/player-identity";

/**
 * Player Card — MINIMUM field contract.
 *
 * This is the foundation that stops the Player Card from drifting into another
 * disconnected subsystem or into fake profile signals. It defines the SMALL set
 * of person-identity fields that may be shown from data the product ALREADY has,
 * the safe fallback for each, and the honest completion hints — nothing more.
 *
 * It is PURE and null-safe: it only transforms an already-fetched source object.
 * It performs NO DB / RLS / RPC read, owns no route, and changes no business
 * logic. It deliberately depends on the visual Player Identity foundation
 * (`@/lib/identity/player-identity`) for the canonical initials monogram, so the
 * field contract and the visual contract stay ONE identity, never two.
 *
 * Forbidden by construction (DESIGN_SOUL §1 / PV §10): a missing input becomes
 * null / 0 / [] and is reported in `missing` — it is NEVER fabricated. No fake
 * avatar, fake skill, fake role, fake score, fake badge, and no completion
 * PERCENTAGE (only the concrete list of what is still missing). The full,
 * binding contract lives in docs/contracts/player-card-minimum-contract-v1.md.
 */

/** The canonical, ordered minimum field set. A new identity surface picks from
 *  THIS list — it never invents a bespoke, unrelated identity field. */
export const PLAYER_CARD_MIN_FIELDS = [
  "avatar",
  "name",
  "headline",
  "location",
  "skills",
  "about",
] as const;
export type PlayerCardField = (typeof PLAYER_CARD_MIN_FIELDS)[number];

/**
 * Raw, already-fetched inputs. Every field is optional/nullable — the contract
 * never requires a value and never fabricates one. `email` is used ONLY to
 * derive a display fallback for the name; it is never shown verbatim as identity.
 * `headline` / `location` are pre-resolved by the caller from data already
 * visible to the viewer (e.g. a localised profession label, a country signal) —
 * this module does not decide visibility or localisation.
 */
export interface PlayerCardMinimumSource {
  readonly avatarUrl?: string | null;
  readonly fullName?: string | null;
  readonly email?: string | null;
  readonly headline?: string | null;
  readonly location?: string | null;
  readonly skillsDeclared?: number | null;
  readonly skillsVerified?: number | null;
  readonly about?: string | null;
}

export interface PlayerCardMinimum {
  readonly avatarUrl: string | null;
  /** Display name for rendering: full_name → email local-part → null. When null,
   *  a surface applies its OWN i18n neutral fallback (e.g. "Member") — this
   *  module never bakes copy in. */
  readonly displayName: string | null;
  /** Always-safe initials monogram ("•" when there is no name) — the SAME
   *  monogram the player card header and map marker use. Never a synthesised
   *  face. */
  readonly initials: string;
  readonly headline: string | null;
  readonly location: string | null;
  readonly skillsDeclared: number;
  readonly skillsVerified: number;
  readonly about: string | null;
  /** Essentials really present (a real saved source value), in canonical order. */
  readonly present: PlayerCardField[];
  /** Essentials still missing — the honest completion hints. A concrete list,
   *  NOT a percentage and NOT a score. */
  readonly missing: PlayerCardField[];
}

function clean(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function count(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function emailLocalPart(email: string | null): string | null {
  const e = clean(email);
  if (!e || !e.includes("@")) return null;
  const local = e.slice(0, e.indexOf("@")).trim();
  return local.length > 0 ? local : null;
}

/**
 * Resolve the minimum Player Card from already-fetched data. PURE + null-safe:
 * a missing input yields null / 0 and is reported in `missing`. `name` counts as
 * present ONLY when a real `fullName` is saved — the email-derived display name
 * is a render fallback, not a completed profile field.
 */
export function buildPlayerCardMinimum(
  source: PlayerCardMinimumSource,
): PlayerCardMinimum {
  const avatarUrl = clean(source.avatarUrl);
  const fullName = clean(source.fullName);
  const headline = clean(source.headline);
  const location = clean(source.location);
  const about = clean(source.about);
  const skillsDeclared = count(source.skillsDeclared);
  const skillsVerified = count(source.skillsVerified);
  const displayName = fullName ?? emailLocalPart(source.email ?? null);

  const presence: Record<PlayerCardField, boolean> = {
    avatar: avatarUrl !== null,
    name: fullName !== null,
    headline: headline !== null,
    location: location !== null,
    skills: skillsDeclared > 0,
    about: about !== null,
  };

  return {
    avatarUrl,
    displayName,
    initials: playerInitials(displayName),
    headline,
    location,
    skillsDeclared,
    skillsVerified,
    about,
    present: PLAYER_CARD_MIN_FIELDS.filter((f) => presence[f]),
    missing: PLAYER_CARD_MIN_FIELDS.filter((f) => !presence[f]),
  };
}
