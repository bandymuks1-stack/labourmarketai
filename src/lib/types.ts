/**
 * labourmarket.ai — canonical domain types.
 *
 * One source of truth. Every user has exactly ONE {@link Profile}.
 * The {@link PlayerCard} is a derived view-model projected from a Profile or
 * CompanyProfile — it is NOT a separate data flow and must never be persisted
 * or edited independently of its source entity.
 */

/** Who the user is. Asked once, at /role. */
export type UserRole = "worker" | "company" | "recruiter";

export interface RoleOption {
  id: UserRole;
  title: string;
  subtitle: string;
  blurb: string;
  accent: AccentKey;
}

export type AccentKey = "cyan" | "violet" | "amber";

export type Availability = "open" | "engaged" | "not-looking";

/**
 * The single canonical profile model.
 *
 * There is one Profile per user regardless of role. The role only changes
 * which surfaces emphasise which fields — never the model, never the route.
 */
export interface Profile {
  id: string;
  role: UserRole;
  displayName: string;
  /** Primary line under the name, e.g. "Senior Structural Welder". */
  headline: string;
  location: string;
  availability: Availability;
  experienceYears: number;
  skills: string[];
  languages: string[];
  bio: string;
  /** 0–100 signal score derived from profile completeness + activity. Deterministic, not a model output. */
  signalScore: number;
  /** Identity-verified flag. Automated and self-serve — there is no gatekeeping step. */
  verified: boolean;
}

export type PlayerTier = "bronze" | "silver" | "gold" | "elite";

export interface PlayerStat {
  label: string;
  value: string;
}

/**
 * The reusable visual identity of an entity.
 *
 * A PlayerCard is always derived (see {@link "@/lib/player-card"}). The exact
 * same shape backs people and companies so the one card system can be reused in
 * discover, matching, worker search, company needs, teams and future map views.
 */
export interface PlayerCard {
  entityId: string;
  kind: "person" | "company";
  name: string;
  /** Headline for a person, industry for a company. */
  role: string;
  location: string;
  initials: string;
  tier: PlayerTier;
  /** 0–100 deterministic signal score. */
  signalScore: number;
  /** Short status label, e.g. "Open to work" / "Actively hiring". */
  status: string;
  accent: AccentKey;
  tags: string[];
  stats: PlayerStat[];
}

export interface CompanyProfile {
  id: string;
  name: string;
  industry: string;
  location: string;
  /** Headcount band, e.g. "11–50". */
  size: string;
  about: string;
  hiring: boolean;
  signalScore: number;
  verified: boolean;
}

export type Engagement = "full-time" | "contract" | "shift" | "project";

export interface HiringNeed {
  id: string;
  companyId: string;
  roleTitle: string;
  location: string;
  engagement: Engagement;
  seats: number;
  mustHaveSkills: string[];
  startWindow: string;
  status: "draft" | "open" | "filled";
}

export interface MatchResult {
  id: string;
  needId: string;
  profileId: string;
  /** 0–100 deterministic overlap score (see {@link "@/lib/matching"}). */
  score: number;
  matchedSkills: string[];
  gapSkills: string[];
  /** Human-readable, fully deterministic explanation of the score. */
  reason: string;
}

/**
 * The single entry point for starting a conversation.
 *
 * There is one communication area. Threads are *started* from this shape;
 * there are no parallel inbox / messages / DM models.
 */
export interface CommunicationThreadStart {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  /** What the conversation is about, e.g. "Hiring need — Senior Welder". */
  context: string;
  openingMessage: string;
  createdAt: string;
}
