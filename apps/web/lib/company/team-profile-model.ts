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
