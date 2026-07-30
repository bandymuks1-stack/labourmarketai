import {
  EUROPE_CENTER,
  EUROPE_ZOOM,
  intensityOf,
  type MarketAnchor,
  type MarketMapView,
} from "./market-map-model";

/**
 * THE LANDING DEMONSTRATION SCENARIO.
 *
 * The landing hero has to let a visitor EXPERIENCE the product in the first
 * seconds: a question is asked, the AI acts, the map reacts, a result appears.
 * That needs a deterministic script — a live public feed would show whatever
 * the market happens to look like, which on a quiet day demonstrates nothing.
 *
 * HONESTY RULES THIS FILE OBEYS:
 *  - every coordinate is a REAL city (Rotterdam, Eindhoven, Antwerp …), so the
 *    geography a visitor recognises is genuinely correct;
 *  - the view is tagged `origin: "demo"` and the hero renders a visible badge
 *    saying it is a demonstration. It never claims to be today's market;
 *  - this module is imported ONLY by the public landing. Authenticated surfaces
 *    read real rows, and there is no demo fallback behind them — an empty
 *    authenticated map stays honestly empty.
 *
 * So: real geography, real product behaviour, clearly-labelled illustrative
 * volumes.
 */

function anchor(
  id: string,
  label: string,
  lat: number,
  lng: number,
  weight: number,
  country: string,
  layer: MarketAnchor["layer"] = "demand",
): MarketAnchor {
  return { id, label, lat, lng, weight, country, layer };
}

/** One scripted question the hero can answer. */
export interface LandingScenario {
  readonly id: string;
  /** i18n key under `landing.hero.scenario`. */
  readonly promptKey: string;
  /** Region the map flies to. */
  readonly focusCode: string;
  readonly layer: MarketAnchor["layer"];
  readonly view: MarketMapView;
  /** i18n key for the result card headline. */
  readonly resultKey: string;
  /**
   * The AI's REASONING, surfaced step by step while it works.
   *
   * A spinner says "wait"; these say WHAT is being weighed. That difference is
   * the whole point of the hero: the visitor should watch the system think,
   * not watch a loading state. Keys under `landing.hero.reason`.
   */
  readonly reasoningKeys: readonly string[];
  /**
   * The DECISION, not a numeric summary. Every result answers the four
   * questions a person actually has: why this place, why now, why me, and what
   * to do next. Keys under `landing.hero.decision`.
   */
  readonly decisionKey: string;
}

const NL_ELECTRICIANS: MarketMapView = {
  origin: "demo",
  center: EUROPE_CENTER,
  zoom: EUROPE_ZOOM,
  regions: [
    {
      code: "NL",
      label: "Nederland",
      intensity: intensityOf(23),
      anchors: [
        anchor("nl-rot", "Rotterdam", 51.9244, 4.4777, 9, "NL"),
        anchor("nl-ein", "Eindhoven", 51.4416, 5.4697, 7, "NL"),
        anchor("nl-ams", "Amsterdam", 52.3676, 4.9041, 4, "NL"),
        anchor("nl-utr", "Utrecht", 52.0907, 5.1214, 3, "NL"),
      ],
    },
    {
      code: "BE",
      label: "België",
      intensity: intensityOf(8),
      anchors: [
        anchor("be-ant", "Antwerpen", 51.2194, 4.4025, 5, "BE"),
        anchor("be-gnt", "Gent", 51.0543, 3.7174, 3, "BE"),
      ],
    },
    {
      code: "DE",
      label: "Deutschland",
      intensity: intensityOf(11),
      anchors: [
        anchor("de-dui", "Duisburg", 51.4344, 6.7623, 6, "DE"),
        anchor("de-ham", "Hamburg", 53.5511, 9.9937, 5, "DE"),
      ],
    },
  ],
};

const NORDIC_WELDERS: MarketMapView = {
  origin: "demo",
  center: EUROPE_CENTER,
  zoom: EUROPE_ZOOM,
  regions: [
    {
      code: "NO",
      label: "Norge",
      intensity: intensityOf(17),
      anchors: [
        anchor("no-sta", "Stavanger", 58.969, 5.7331, 8, "NO"),
        anchor("no-ber", "Bergen", 60.3913, 5.3221, 5, "NO"),
      ],
    },
    {
      code: "DK",
      label: "Danmark",
      intensity: intensityOf(9),
      anchors: [anchor("dk-esb", "Esbjerg", 55.4765, 8.4594, 6, "DK")],
    },
    {
      code: "PL",
      label: "Polska",
      intensity: intensityOf(14),
      anchors: [
        anchor("pl-gda", "Gdańsk", 54.352, 18.6466, 7, "PL"),
        anchor("pl-szc", "Szczecin", 53.4285, 14.5528, 4, "PL"),
      ],
    },
  ],
};

const BALTIC_PEOPLE: MarketMapView = {
  origin: "demo",
  center: EUROPE_CENTER,
  zoom: EUROPE_ZOOM,
  regions: [
    {
      code: "LT",
      label: "Lietuva",
      intensity: intensityOf(19),
      anchors: [
        // `people` anchors are AREA aggregates — city centroids with a count,
        // never an individual's position. See market-map-model.ts.
        anchor("lt-vln", "Vilnius", 54.6872, 25.2797, 11, "LT", "people"),
        anchor("lt-kau", "Kaunas", 54.8985, 23.9036, 6, "LT", "people"),
      ],
    },
    {
      code: "LV",
      label: "Latvija",
      intensity: intensityOf(10),
      anchors: [anchor("lv-rig", "Rīga", 56.9496, 24.1052, 7, "LV", "people")],
    },
    {
      code: "EE",
      label: "Eesti",
      intensity: intensityOf(7),
      anchors: [anchor("ee-tll", "Tallinn", 59.437, 24.7536, 5, "EE", "people")],
    },
  ],
};

export const LANDING_SCENARIOS: readonly LandingScenario[] = [
  {
    id: "electricians-nl",
    promptKey: "q1",
    focusCode: "NL",
    layer: "demand",
    view: NL_ELECTRICIANS,
    resultKey: "r1",
    reasoningKeys: ["r1a", "r1b", "r1c"],
    decisionKey: "d1",
  },
  {
    id: "welders-nordic",
    promptKey: "q2",
    focusCode: "NO",
    layer: "demand",
    view: NORDIC_WELDERS,
    resultKey: "r2",
    reasoningKeys: ["r2a", "r2b", "r2c"],
    decisionKey: "d2",
  },
  {
    id: "people-baltic",
    promptKey: "q3",
    focusCode: "LT",
    layer: "people",
    view: BALTIC_PEOPLE,
    resultKey: "r3",
    reasoningKeys: ["r3a", "r3b", "r3c"],
    decisionKey: "d3",
  },
];
