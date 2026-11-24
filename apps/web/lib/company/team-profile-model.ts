import type {
  PublicBusinessListing,
  PublicBusinessProfileView,
} from "@/lib/company/public-profile-model";
import { publicWebsiteHref } from "@/lib/company/public-website";
import { countryDisplayName, resolveCountryCode } from "@/lib/location/country-model";

/**
 * The team-presentation form of the public company profile — the pure view
 * model behind `/{locale}/business/{slug}?view=team` (owner order 2026-11-07;
 * the final visual direction is NOT approved, so this view is opt-in and
 * noindex and the default page does not change).
 *
 * It composes ONLY what the public read returns for an opted-in organization:
 * identity, description, contact, active listings. Anything a sports team's
 * page would show beyond that lives in `later`, typed and empty, because no
 * public source exists yet: an empty slot renders nothing, never a placeholder
 * number. No score of any kind belongs here (doctrine §19).
 *
 * `service_offerings` stays out on purpose: it has no organization column, so
 * `get_public_business_services_v1` returns the owner's PERSONAL offerings.
 */

const TEAM_VIEW_VALUE = "team";

/** Only the exact `?view=team` opens this view; every other value is the default page. */
export function isCompanyTeamView(raw: string | string[] | undefined): boolean {
  return raw === TEAM_VIEW_VALUE;
}

export interface CompanyTeamListing {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly kind: PublicBusinessListing["listingKind"];
  readonly category: string;
  readonly place: string | null;
  readonly priceText: string | null;
}

export type CompanyTeamContactKind = "email" | "phone" | "website";

export interface CompanyTeamContactAction {
  readonly kind: CompanyTeamContactKind;
  /** What the person sees: the address, the number, the site's host. */
  readonly value: string;
  readonly href: string;
}

/** A piece of finished work. Needs a public, company-approved work record. */
export interface CompanyTeamFinishedWork {
  readonly id: string;
  readonly title: string;
  readonly period: string | null;
  readonly confirmedBy: "client" | "company";
}

/** Headcount by role, never a named person without that person's consent. */
export interface CompanyTeamRosterRole {
  readonly role: string;
  readonly headcount: number;
}

/** A figure with its source. A figure without a source does not exist. */
export interface CompanyTeamProofFigure {
  readonly label: string;
  readonly value: string;
  readonly source: string;
}

/** A role the company hires for. `wanted` listings are objects, not people. */
export interface CompanyTeamOpenRole {
  readonly id: string;
  readonly title: string;
  readonly place: string | null;
}

/** What a team page would show later. Each slot is empty until a source exists. */
export interface CompanyTeamLaterSlots {
  readonly coverImageUrl: string | null;
  readonly finishedWork: readonly CompanyTeamFinishedWork[];
  readonly rosterByRole: readonly CompanyTeamRosterRole[];
  readonly proofFigures: readonly CompanyTeamProofFigure[];
  readonly openRoles: readonly CompanyTeamOpenRole[];
}

export interface CompanyTeamProfileView {
  readonly hero: {
    readonly name: string;
    readonly tagline: string | null;
    readonly country: string | null;
  };
  readonly about: string | null;
  /** `sale` and `rental` listings: what the company puts on offer. */
  readonly offers: readonly CompanyTeamListing[];
  /** `wanted` listings: what the company is looking for. Not a hiring list. */
  readonly seeking: readonly CompanyTeamListing[];
  /** In the order the page offers them, the first being the main action. Empty
   *  means the company published no contact this page can honestly open. */
  readonly contact: readonly CompanyTeamContactAction[];
  readonly later: CompanyTeamLaterSlots;
  /** The member form: the organization's Living CV from its own records. Absent on the public page. */
  readonly living?: OrganizationLivingRecord;
}

function text(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return value ? value : null;
}

// One address, nothing a mailto: could read as extra headers or recipients.
const EMAIL_RE = /^[^\s@?&#%<>"',;:\\/]+@[^\s@?&#%<>"',;:\\/]+\.[^\s@?&#%<>"',;:\\/.]+$/;
const PHONE_RE = /^\+?[\d\s().-]+$/;

function emailAction(raw: string | null): CompanyTeamContactAction | null {
  const value = text(raw);
  if (!value || !EMAIL_RE.test(value)) return null;
  return { kind: "email", value, href: `mailto:${value}` };
}

function phoneAction(raw: string | null): CompanyTeamContactAction | null {
  const value = text(raw);
  if (!value || !PHONE_RE.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 15) return null;
  return { kind: "phone", value, href: `tel:${value.startsWith("+") ? "+" : ""}${digits}` };
}

function websiteAction(raw: string | null): CompanyTeamContactAction | null {
  const href = publicWebsiteHref(raw);
  if (!href) return null;
  return { kind: "website", value: new URL(href).hostname.replace(/^www\./, ""), href };
}

/** The country in the reader's language when it resolves, otherwise as the company wrote it. */
function countryLabel(raw: string | null, locale: string): string | null {
  const value = text(raw);
  if (!value) return null;
  const code = resolveCountryCode(value);
  return code ? countryDisplayName(code, locale) : value;
}

function listingPlace(listing: PublicBusinessListing, locale: string): string | null {
  const label = text(listing.locationLabel);
  const country = countryLabel(listing.locationCountry, locale);
  if (label && country) return `${label} (${country})`;
  return label ?? country;
}

function toListing(listing: PublicBusinessListing, locale: string): CompanyTeamListing {
  return {
    id: listing.id,
    title: listing.title,
    description: text(listing.description),
    kind: listing.listingKind,
    category: listing.category,
    place: listingPlace(listing, locale),
    priceText: text(listing.priceText),
  };
}

export function buildCompanyTeamProfile(
  view: PublicBusinessProfileView,
  locale: string,
): CompanyTeamProfileView {
  const { profile, listings } = view;
  const toView = (listing: PublicBusinessListing) => toListing(listing, locale);
  const contact = [
    emailAction(profile.contactEmail),
    phoneAction(profile.contactPhone),
    websiteAction(profile.website),
  ].filter((action): action is CompanyTeamContactAction => action !== null);

  return {
    hero: {
      name: profile.displayName,
      tagline: text(profile.tagline),
      country: countryLabel(profile.country, locale),
    },
    about: text(profile.description),
    offers: listings
      .filter((l) => l.listingKind === "sale" || l.listingKind === "rental")
      .map(toView),
    seeking: listings.filter((l) => l.listingKind === "wanted").map(toView),
    contact,
    later: {
      coverImageUrl: null,
      finishedWork: [],
      rosterByRole: [],
      proofFigures: [],
      openRoles: [],
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * THE ORGANIZATION'S LIVING CV — the member form of this same view (owner P0
 * 2026-11-24). It reads only the organization's own canonical records, through
 * readers that already exist, and keeps every source apart:
 *
 *   history    the organization's own records (`loadCompanyWorkHistory`):
 *              day hours and period hours are two figures, never one sum;
 *   journal    work its people recorded under its engagements: a separate
 *              ledger, never added to the records; hours the organization
 *              approved are the only CONFIRMED hours;
 *   projects   its own projects, running and completed;
 *   skills     its teams' existing worker skills; capabilities it declared;
 *   gallery    work photos stated against a place, never a person's photo;
 *   clients    the organizations its own records name as the client, so a
 *              client's records never read as this organization's work.
 *
 * Nothing is estimated. A figure with no source is absent, never zero.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface OrganizationLivingInput {
  readonly capabilities: readonly string[];
  /** Null: the team skills could not be read (unknown, never "none"). */
  readonly teamSkills: readonly { readonly slug: string; readonly confirmed: boolean }[] | null;
  /** Roster people on this organization's own books. Null: unread. */
  readonly rosterSize: number | null;
  readonly history: {
    readonly dayHours: number;
    readonly periodHours: number;
    readonly peopleCount: number;
    readonly placesCount: number;
    readonly firstDate: string | null;
    readonly lastDate: string | null;
  } | null;
  readonly journal: {
    readonly hours: number;
    readonly confirmedHours: number;
    readonly people: number;
    readonly firstMonth: string | null;
    readonly lastMonth: string | null;
  } | null;
  readonly projects: {
    readonly running: number;
    readonly completed: number;
    readonly items: readonly {
      readonly id: string;
      readonly title: string | null;
      readonly city: string | null;
      readonly completed: boolean;
    }[];
  } | null;
  readonly gallery: readonly {
    readonly id: string;
    readonly url: string;
    readonly caption: string | null;
    readonly personLinked: boolean;
  }[];
  readonly clients: readonly (string | null)[];
}

export type OrganizationFigureKey = "years" | "hours" | "people" | "projects" | "places";

export interface OrganizationLivingRecord {
  /** Headline figures, only those with a real source, in this order. */
  readonly figures: readonly { readonly key: OrganizationFigureKey; readonly value: number }[];
  /** First and last year of recorded work; null when no dated work exists. */
  readonly span: { readonly from: number; readonly to: number } | null;
  /** Declared capability slugs, in the catalogue's order. */
  readonly capabilities: readonly string[];
  /** Team skills, confirmed first; null = unread. */
  readonly skills: readonly { readonly slug: string; readonly confirmed: boolean }[] | null;
  readonly rosterSize: number | null;
  readonly experience: {
    /** Journal hours the organization approved: the only confirmed hours. */
    readonly confirmedHours: number;
    /** Journal hours still waiting for approval. */
    readonly pendingHours: number;
    /** The organization's own day records (recorded, not confirmed by anyone else). */
    readonly recordedHours: number;
    /** Period aggregates from its own records, never added to day hours. */
    readonly recordedPeriodHours: number;
  } | null;
  readonly projects: {
    readonly running: readonly { readonly id: string; readonly title: string; readonly city: string | null }[];
    readonly completed: readonly { readonly id: string; readonly title: string; readonly city: string | null }[];
  } | null;
  readonly gallery: readonly { readonly id: string; readonly url: string; readonly caption: string | null }[];
  /** Named clients of its own records (one plain line at most). */
  readonly clients: readonly string[];
}

const CAPABILITY_ORDER = [
  "employer",
  "workforce_provider",
  "project_operator",
  "recruitment_partner",
  "training_provider",
  "client",
] as const;
export const ORGANIZATION_GALLERY_LIMIT = 12;
export const ORGANIZATION_SKILLS_LIMIT = 12;
export const ORGANIZATION_CLIENTS_LIMIT = 3;

const round1 = (n: number) => Math.round(n * 10) / 10;
const yearOf = (iso: string | null): number | null => {
  const y = iso ? Number(iso.slice(0, 4)) : NaN;
  return Number.isInteger(y) && y > 1900 ? y : null;
};

export function buildOrganizationLivingRecord(input: OrganizationLivingInput): OrganizationLivingRecord {
  const { history, journal, projects } = input;

  const years = [
    yearOf(history?.firstDate ?? null),
    yearOf(history?.lastDate ?? null),
    yearOf(journal?.firstMonth ?? null),
    yearOf(journal?.lastMonth ?? null),
  ].filter((y): y is number => y !== null);
  const span = years.length ? { from: Math.min(...years), to: Math.max(...years) } : null;

  const figures: { key: OrganizationFigureKey; value: number }[] = [];
  if (span) figures.push({ key: "years", value: span.to - span.from + 1 });
  // Hours: the organization's own day records. The journal is a separate
  // ledger and the period aggregates a separate kind: neither is added here.
  if (history && history.dayHours > 0) figures.push({ key: "hours", value: Math.round(history.dayHours) });
  const people = history && history.peopleCount > 0 ? history.peopleCount : (journal?.people ?? 0);
  if (people > 0) figures.push({ key: "people", value: people });
  const projectTotal = projects ? projects.running + projects.completed : 0;
  if (projectTotal > 0) figures.push({ key: "projects", value: projectTotal });
  if (history && history.placesCount > 0) figures.push({ key: "places", value: history.placesCount });

  const confirmedHours = journal ? round1(journal.confirmedHours) : 0;
  const pendingHours = journal ? round1(Math.max(0, journal.hours - journal.confirmedHours)) : 0;
  const recordedHours = history ? round1(history.dayHours) : 0;
  const recordedPeriodHours = history ? round1(history.periodHours) : 0;
  const experience =
    confirmedHours + pendingHours + recordedHours + recordedPeriodHours > 0
      ? { confirmedHours, pendingHours, recordedHours, recordedPeriodHours }
      : null;

  const declared = new Set(input.capabilities);
  const capabilities = CAPABILITY_ORDER.filter((slug) => declared.has(slug));

  const skills = input.teamSkills
    ? [...new Map(
        [...input.teamSkills]
          // A skill confirmed in any team stays confirmed.
          .sort((a, b) => Number(a.confirmed) - Number(b.confirmed))
          .map((s) => [s.slug, s] as const),
      ).values()]
        .sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || a.slug.localeCompare(b.slug))
        .slice(0, ORGANIZATION_SKILLS_LIMIT)
    : null;

  const named = (items: NonNullable<OrganizationLivingInput["projects"]>["items"], completed: boolean) =>
    items
      .filter((p) => p.completed === completed)
      .map((p) => ({ id: p.id, title: text(p.title), city: text(p.city) }))
      .filter((p): p is { id: string; title: string; city: string | null } => p.title !== null);

  return {
    figures,
    span,
    capabilities,
    skills,
    rosterSize: input.rosterSize && input.rosterSize > 0 ? input.rosterSize : null,
    experience,
    projects:
      projects && projectTotal > 0
        ? { running: named(projects.items, false), completed: named(projects.items, true) }
        : null,
    // A photo stated against a person is that person's, not the organization's showcase.
    gallery: input.gallery
      .filter((m) => !m.personLinked && m.url)
      .slice(0, ORGANIZATION_GALLERY_LIMIT)
      .map(({ id, url, caption }) => ({ id, url, caption: text(caption) })),
    clients: [
      ...new Set(input.clients.map((c) => text(c)).filter((c): c is string => c !== null)),
    ].slice(0, ORGANIZATION_CLIENTS_LIMIT),
  };
}

/** The member view: the same page, its identity from the organization's own
 *  record, its body the Living CV. No listing and no contact: members do not
 *  need the public page's ways in. */
export function buildOrganizationLivingCv(
  identity: {
    readonly name: string;
    readonly tagline: string | null;
    readonly description: string | null;
    readonly country: string | null;
  },
  input: OrganizationLivingInput,
  locale: string,
): CompanyTeamProfileView {
  return {
    hero: {
      name: identity.name,
      tagline: text(identity.tagline),
      country: countryLabel(identity.country, locale),
    },
    about: text(identity.description),
    offers: [],
    seeking: [],
    contact: [],
    later: { coverImageUrl: null, finishedWork: [], rosterByRole: [], proofFigures: [], openRoles: [] },
    living: buildOrganizationLivingRecord(input),
  };
}
