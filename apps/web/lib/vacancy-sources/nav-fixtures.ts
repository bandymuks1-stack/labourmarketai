/**
 * NAV feed FIXTURES — real-SHAPED synthetic payloads pinned to the official
 * OpenAPI schema (verified 2026-07-17). Used by the vitest suites and by
 * `scripts/nav-vacancy-dry-run.ts --fixtures` so the whole pipeline can be
 * exercised with ZERO network and ZERO tokens.
 *
 * SYNTHETIC BY DESIGN: every value is invented (example employers, .invalid
 * application hosts are NOT used because the contract pins the real feed
 * origin — instead the URLs point at the real NAV feed host with fixture
 * uuids that resolve to nothing). Fixtures never reach any production
 * store: the dry-run script persists nothing, and the import script refuses
 * to run while the source is off (fail-closed).
 */
import type { NavFeedEntryDetail, NavFeedPage } from "./nav-feed-contract";

export const NAV_FIXTURE_ACTIVE_UUID = "11111111-2222-4333-8444-555555555501";
export const NAV_FIXTURE_INACTIVE_UUID = "11111111-2222-4333-8444-555555555502";
export const NAV_FIXTURE_MASKED_UUID = "11111111-2222-4333-8444-555555555503";

/** One real-shaped feed page: an ACTIVE ad, an INACTIVE ad, and a masked
 *  actively-stopped ad (title/businessName nulled by the source). */
export const NAV_FIXTURE_FEED_PAGE: NavFeedPage = {
  version: "https://jsonfeed.org/version/1.1",
  title: "Stillinger fra arbeidsplassen.no (fixture)",
  home_page_url: "https://arbeidsplassen.nav.no",
  feed_url: "https://pam-stilling-feed.nav.no/api/v1/feed",
  description: "fixture feed page",
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee01",
  next_url: null,
  next_id: null,
  items: [
    {
      id: NAV_FIXTURE_ACTIVE_UUID,
      url: `https://pam-stilling-feed.nav.no/api/v1/feedentry/${NAV_FIXTURE_ACTIVE_UUID}`,
      title: "Tømrer / Carpenter (fixture)",
      content_text: "fixture summary",
      date_modified: "2026-07-15T08:30:00Z",
      _feed_entry: {
        uuid: NAV_FIXTURE_ACTIVE_UUID,
        status: "ACTIVE",
        title: "Tømrer / Carpenter (fixture)",
        businessName: "Fixture Bygg AS",
        municipal: "OSLO",
        sistEndret: "2026-07-15T08:30:00Z",
      },
    },
    {
      id: NAV_FIXTURE_INACTIVE_UUID,
      url: `https://pam-stilling-feed.nav.no/api/v1/feedentry/${NAV_FIXTURE_INACTIVE_UUID}`,
      title: "Elektriker (fixture, avsluttet)",
      content_text: "fixture summary",
      date_modified: "2026-07-16T10:00:00Z",
      _feed_entry: {
        uuid: NAV_FIXTURE_INACTIVE_UUID,
        status: "INACTIVE",
        title: "Elektriker (fixture, avsluttet)",
        businessName: "Fixture Elektro AS",
        municipal: "BERGEN",
        sistEndret: "2026-07-16T10:00:00Z",
      },
    },
    {
      // Actively-stopped ad: NAV masks title/businessName — nulls must parse.
      id: NAV_FIXTURE_MASKED_UUID,
      url: `https://pam-stilling-feed.nav.no/api/v1/feedentry/${NAV_FIXTURE_MASKED_UUID}`,
      title: null,
      content_text: null,
      date_modified: "2026-07-16T11:00:00Z",
      _feed_entry: {
        uuid: NAV_FIXTURE_MASKED_UUID,
        status: "INACTIVE",
        title: null,
        businessName: null,
        municipal: null,
        sistEndret: "2026-07-16T11:00:00Z",
      },
    },
  ],
};

/** ACTIVE entry detail — full FeedAd, INCLUDING a contactList that the
 *  normalizer must drop (privacy-minimization proof material). */
export const NAV_FIXTURE_ACTIVE_DETAIL: NavFeedEntryDetail = {
  uuid: NAV_FIXTURE_ACTIVE_UUID,
  sistEndret: "2026-07-15T08:30:00Z",
  status: "ACTIVE",
  ad_content: {
    uuid: NAV_FIXTURE_ACTIVE_UUID,
    title: "Tømrer / Carpenter (fixture)",
    jobtitle: "Tømrer",
    link: `https://arbeidsplassen.nav.no/stillinger/stilling/${NAV_FIXTURE_ACTIVE_UUID}`,
    sourceurl: null,
    sector: "Privat",
    published: "2026-07-10T06:00:00Z",
    expires: "2026-08-10T22:00:00Z",
    updated: "2026-07-15T08:30:00Z",
    employer: {
      name: "Fixture Bygg AS",
      orgnr: "999999999",
      description: "<p>Fixture employer description</p>",
      homepage: "https://fixture-bygg.example",
    },
    workLocations: [
      {
        country: "NORGE",
        address: "Fixturegata 1",
        city: "OSLO",
        postalCode: "0155",
        county: "OSLO",
        municipal: "OSLO",
      },
    ],
    contactList: [
      {
        name: "Fixture Kontakt",
        email: "fixture.kontakt@fixture-bygg.example",
        phone: "+47 99 99 99 99",
        role: "Daglig leder",
        title: "Daglig leder",
      },
    ],
    occupationCategories: [
      { level1: "Bygg og anlegg", level2: "Tømrer og snekker" },
    ],
    categoryList: [{ categoryType: "STYRK08", code: "7115" }],
    description:
      "<h2>Om stillingen</h2><p>Vi søker en erfaren <strong>tømrer</strong> til prosjekter i Oslo.</p><script>alert('never rendered')</script><style>p{color:red}</style><p>Arbeidsspr&aring;k: norsk &amp; engelsk.</p>",
    applicationUrl: "https://fixture-bygg.example/jobb/soknad",
    applicationDue: "2026-08-01",
    engagementtype: "Fast",
    extent: "Heltid",
    starttime: "Etter avtale",
    positioncount: 2,
  },
};

/** INACTIVE entry detail — ad body still present (normal expiry). */
export const NAV_FIXTURE_INACTIVE_DETAIL: NavFeedEntryDetail = {
  uuid: NAV_FIXTURE_INACTIVE_UUID,
  sistEndret: "2026-07-16T10:00:00Z",
  status: "INACTIVE",
  ad_content: {
    uuid: NAV_FIXTURE_INACTIVE_UUID,
    title: "Elektriker (fixture, avsluttet)",
    jobtitle: "Elektriker",
    link: `https://arbeidsplassen.nav.no/stillinger/stilling/${NAV_FIXTURE_INACTIVE_UUID}`,
    sourceurl: null,
    sector: "Privat",
    published: "2026-06-01T06:00:00Z",
    expires: "2026-07-15T22:00:00Z",
    updated: "2026-07-16T10:00:00Z",
    employer: { name: "Fixture Elektro AS", orgnr: "888888888", description: null, homepage: null },
    workLocations: [
      { country: "NORGE", address: null, city: "BERGEN", postalCode: "5003", county: "VESTLAND", municipal: "BERGEN" },
    ],
    contactList: [],
    occupationCategories: [{ level1: "Bygg og anlegg", level2: "Elektriker" }],
    categoryList: [],
    description: "<p>Avsluttet fixture-stilling.</p>",
    applicationUrl: null,
    applicationDue: "2026-07-10",
    engagementtype: "Fast",
    extent: "Heltid",
    starttime: null,
    positioncount: 1,
  },
};

/** Masked actively-stopped ad: status INACTIVE, ad_content null, every
 *  maskable summary field null. MUST normalize into a deactivation. */
export const NAV_FIXTURE_MASKED_DETAIL: NavFeedEntryDetail = {
  uuid: NAV_FIXTURE_MASKED_UUID,
  sistEndret: "2026-07-16T11:00:00Z",
  status: "INACTIVE",
  ad_content: null,
};

export const NAV_FIXTURE_DETAILS: readonly NavFeedEntryDetail[] = [
  NAV_FIXTURE_ACTIVE_DETAIL,
  NAV_FIXTURE_INACTIVE_DETAIL,
  NAV_FIXTURE_MASKED_DETAIL,
];
