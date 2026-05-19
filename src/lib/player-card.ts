/**
 * The ONE place a PlayerCard is created.
 *
 * Nothing else in the app constructs a PlayerCard. People and companies both
 * project into the identical shape so a single visual component system can be
 * reused everywhere (discover, matching, worker search, company needs, teams,
 * future map views). This is intentionally not a separate data flow.
 */
import type {
  AccentKey,
  CompanyProfile,
  PlayerCard,
  PlayerTier,
  Profile,
} from "./types";

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tierFromScore(score: number): PlayerTier {
  if (score >= 90) return "elite";
  if (score >= 75) return "gold";
  if (score >= 55) return "silver";
  return "bronze";
}

const ROLE_ACCENT: Record<Profile["role"], AccentKey> = {
  worker: "cyan",
  company: "violet",
  recruiter: "amber",
};

function availabilityLabel(profile: Profile): string {
  switch (profile.availability) {
    case "open":
      return "Open to work";
    case "engaged":
      return "Currently engaged";
    case "not-looking":
      return "Not looking";
  }
}

/** Project a canonical Profile into the shared player-card view-model. */
export function profileToPlayerCard(profile: Profile): PlayerCard {
  return {
    entityId: profile.id,
    kind: "person",
    name: profile.displayName,
    role: profile.headline,
    location: profile.location,
    initials: initialsFrom(profile.displayName),
    tier: tierFromScore(profile.signalScore),
    signalScore: profile.signalScore,
    status: availabilityLabel(profile),
    accent: ROLE_ACCENT[profile.role],
    tags: profile.skills.slice(0, 4),
    stats: [
      { label: "Experience", value: `${profile.experienceYears} yrs` },
      { label: "Skills", value: String(profile.skills.length) },
      { label: "Languages", value: String(profile.languages.length) },
    ],
  };
}

/** Project a CompanyProfile into the same shared player-card view-model. */
export function companyToPlayerCard(company: CompanyProfile): PlayerCard {
  return {
    entityId: company.id,
    kind: "company",
    name: company.name,
    role: company.industry,
    location: company.location,
    initials: initialsFrom(company.name),
    tier: tierFromScore(company.signalScore),
    signalScore: company.signalScore,
    status: company.hiring ? "Actively hiring" : "Not hiring now",
    accent: "violet",
    tags: [company.industry, company.size],
    stats: [
      { label: "Headcount", value: company.size },
      { label: "Signal", value: String(company.signalScore) },
      { label: "Verified", value: company.verified ? "Yes" : "Pending" },
    ],
  };
}
