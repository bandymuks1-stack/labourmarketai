/**
 * Canonical global country metadata model (PR-G — global location model).
 *
 * The platform serves ALL ISO-3166-1 alpha-2 countries; nothing in the product
 * may assume Europe or Lithuania. This module is the single source of truth
 * for per-country metadata used across the app layer:
 *   - ISO code registry (`ALL_ISO_COUNTRIES` — every officially assigned code);
 *   - currency (ISO 4217) — null ONLY where genuinely none exists (Antarctica);
 *   - primary IANA timezone(s) — at least one per country;
 *   - approximate geographic centroid (consumed by lib/location/city-coordinates);
 *   - subdivision label kind (state / province / region / county) where the
 *     product may reasonably ask, with full curated lists for the US (50
 *     states + DC) and Georgia (its standard 12 regions).
 *
 * Doctrine §10 (Lego architecture): this is a slug/code registry, not a
 * hardcoded product enum — country NAMES are never stored here. Display names
 * come from `Intl.DisplayNames` at render time (see `countryDisplayName`), so
 * every locale gets correct names with zero hand-translated catalogues.
 *
 * BINDING platform decision: no country requires a postal/ZIP code anywhere in
 * the product (`requiresPostalCode` is constant-false and guard-tested) — the
 * platform's location granularity stops at country / subdivision / city.
 *
 * Pure data + pure functions. No IO. Safe in client and server bundles.
 */

export type SubdivisionKind = "state" | "province" | "region" | "county";

export interface CountrySubdivision {
  /** ISO 3166-2 style short code (e.g. "CA" for California, "AJ" for Adjara). */
  readonly code: string;
  /** English reference name (display localisation is out of scope for v1 —
   *  subdivision names are proper nouns and shown as-is). */
  readonly name: string;
}

export interface CountryMeta {
  /** ISO-3166-1 alpha-2 code. */
  readonly code: string;
  /** ISO 4217 currency code; null only where no official currency exists. */
  readonly currency: string | null;
  /** Primary IANA timezone(s) — always at least one entry. */
  readonly timezones: readonly string[];
  /** Approximate geographic centroid (country-level, always approximate). */
  readonly centroid: { readonly lat: number; readonly lng: number };
  /** Present when the product may ask for a first-level subdivision. */
  readonly subdivisionKind?: SubdivisionKind;
  /** Curated subdivision list (US, GE); most countries intentionally omit it. */
  readonly subdivisions?: readonly CountrySubdivision[];
}

/** 50 US states + District of Columbia (51 entries). */
export const US_STATES: readonly CountrySubdivision[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "DC", name: "District of Columbia" },
];

/** Georgia's standard first-level divisions (ISO 3166-2:GE — 9 regions, 2
 *  autonomous republics, 1 city; 12 entries). Shida Kartli includes the
 *  Tskhinvali region (Samachablo) as administered. */
export const GE_REGIONS: readonly CountrySubdivision[] = [
  { code: "TB", name: "Tbilisi" },
  { code: "AB", name: "Abkhazia" },
  { code: "AJ", name: "Adjara" },
  { code: "GU", name: "Guria" },
  { code: "IM", name: "Imereti" },
  { code: "KA", name: "Kakheti" },
  { code: "KK", name: "Kvemo Kartli" },
  { code: "MM", name: "Mtskheta-Mtianeti" },
  { code: "RL", name: "Racha-Lechkhumi and Kvemo Svaneti" },
  { code: "SJ", name: "Samtskhe-Javakheti" },
  { code: "SK", name: "Shida Kartli" },
  { code: "SZ", name: "Samegrelo-Zemo Svaneti" },
];

/** Compact row builder — keeps the 249-row table one line per country. */
function row(
  currency: string | null,
  tz: string,
  lat: number,
  lng: number,
  subdivisionKind?: SubdivisionKind,
  subdivisions?: readonly CountrySubdivision[],
): Omit<CountryMeta, "code"> {
  return {
    currency,
    timezones: [tz],
    centroid: { lat, lng },
    ...(subdivisionKind ? { subdivisionKind } : {}),
    ...(subdivisions ? { subdivisions } : {}),
  };
}

/**
 * Every officially assigned ISO-3166-1 alpha-2 country/territory (249 codes).
 * Centroids are approximate country centers (country precision only — never
 * shown as an exact point; see lib/location/city-coordinates.ts).
 */
const COUNTRY_TABLE: Readonly<Record<string, Omit<CountryMeta, "code">>> = {
  AD: row("EUR", "Europe/Andorra", 42.55, 1.58),
  AE: row("AED", "Asia/Dubai", 23.42, 53.85),
  AF: row("AFN", "Asia/Kabul", 33.94, 66.0),
  AG: row("XCD", "America/Antigua", 17.08, -61.8),
  AI: row("XCD", "America/Anguilla", 18.22, -63.06),
  AL: row("ALL", "Europe/Tirane", 41.15, 20.17),
  AM: row("AMD", "Asia/Yerevan", 40.07, 45.04),
  AO: row("AOA", "Africa/Luanda", -11.2, 17.87),
  AQ: row(null, "Antarctica/McMurdo", -75.25, -0.07),
  AR: row("ARS", "America/Argentina/Buenos_Aires", -38.42, -63.62),
  AS: row("USD", "Pacific/Pago_Pago", -14.27, -170.13),
  AT: row("EUR", "Europe/Vienna", 47.52, 14.55, "state"),
  AU: row("AUD", "Australia/Sydney", -25.27, 133.78, "state"),
  AW: row("AWG", "America/Aruba", 12.52, -69.97),
  AX: row("EUR", "Europe/Mariehamn", 60.17, 19.92),
  AZ: row("AZN", "Asia/Baku", 40.14, 47.58),
  BA: row("BAM", "Europe/Sarajevo", 43.92, 17.68),
  BB: row("BBD", "America/Barbados", 13.19, -59.54),
  BD: row("BDT", "Asia/Dhaka", 23.68, 90.36),
  BE: row("EUR", "Europe/Brussels", 50.5, 4.47),
  BF: row("XOF", "Africa/Ouagadougou", 12.24, -1.56),
  BG: row("BGN", "Europe/Sofia", 42.73, 25.49),
  BH: row("BHD", "Asia/Bahrain", 26.07, 50.55),
  BI: row("BIF", "Africa/Bujumbura", -3.37, 29.92),
  BJ: row("XOF", "Africa/Porto-Novo", 9.31, 2.32),
  BL: row("EUR", "America/St_Barthelemy", 17.9, -62.83),
  BM: row("BMD", "Atlantic/Bermuda", 32.32, -64.76),
  BN: row("BND", "Asia/Brunei", 4.54, 114.73),
  BO: row("BOB", "America/La_Paz", -16.29, -63.59),
  BQ: row("USD", "America/Kralendijk", 12.18, -68.26),
  BR: row("BRL", "America/Sao_Paulo", -14.24, -51.93, "state"),
  BS: row("BSD", "America/Nassau", 25.03, -77.4),
  BT: row("BTN", "Asia/Thimphu", 27.51, 90.43),
  BV: row("NOK", "Etc/GMT", -54.42, 3.41),
  BW: row("BWP", "Africa/Gaborone", -22.33, 24.68),
  BY: row("BYN", "Europe/Minsk", 53.71, 27.95),
  BZ: row("BZD", "America/Belize", 17.19, -88.5),
  CA: row("CAD", "America/Toronto", 56.13, -106.35, "province"),
  CC: row("AUD", "Indian/Cocos", -12.16, 96.87),
  CD: row("CDF", "Africa/Kinshasa", -4.04, 21.76),
  CF: row("XAF", "Africa/Bangui", 6.61, 20.94),
  CG: row("XAF", "Africa/Brazzaville", -0.23, 15.83),
  CH: row("CHF", "Europe/Zurich", 46.82, 8.23),
  CI: row("XOF", "Africa/Abidjan", 7.54, -5.55),
  CK: row("NZD", "Pacific/Rarotonga", -21.24, -159.78),
  CL: row("CLP", "America/Santiago", -35.68, -71.54),
  CM: row("XAF", "Africa/Douala", 7.37, 12.35),
  CN: row("CNY", "Asia/Shanghai", 35.86, 104.2),
  CO: row("COP", "America/Bogota", 4.57, -74.3),
  CR: row("CRC", "America/Costa_Rica", 9.75, -83.75),
  CU: row("CUP", "America/Havana", 21.52, -77.78),
  CV: row("CVE", "Atlantic/Cape_Verde", 16.0, -24.01),
  CW: row("ANG", "America/Curacao", 12.17, -69.0),
  CX: row("AUD", "Indian/Christmas", -10.45, 105.69),
  CY: row("EUR", "Asia/Nicosia", 35.13, 33.43),
  CZ: row("CZK", "Europe/Prague", 49.82, 15.47),
  DE: row("EUR", "Europe/Berlin", 51.16, 10.45, "state"),
  DJ: row("DJF", "Africa/Djibouti", 11.83, 42.59),
  DK: row("DKK", "Europe/Copenhagen", 56.26, 9.5),
  DM: row("XCD", "America/Dominica", 15.41, -61.37),
  DO: row("DOP", "America/Santo_Domingo", 18.74, -70.16),
  DZ: row("DZD", "Africa/Algiers", 28.03, 1.66),
  EC: row("USD", "America/Guayaquil", -1.83, -78.18),
  EE: row("EUR", "Europe/Tallinn", 58.6, 25.01),
  EG: row("EGP", "Africa/Cairo", 26.82, 30.8),
  EH: row("MAD", "Africa/El_Aaiun", 24.22, -12.89),
  ER: row("ERN", "Africa/Asmara", 15.18, 39.78),
  ES: row("EUR", "Europe/Madrid", 40.46, -3.75, "province"),
  ET: row("ETB", "Africa/Addis_Ababa", 9.15, 40.49),
  FI: row("EUR", "Europe/Helsinki", 61.92, 25.75),
  FJ: row("FJD", "Pacific/Fiji", -17.71, 178.07),
  FK: row("FKP", "Atlantic/Stanley", -51.8, -59.52),
  FM: row("USD", "Pacific/Pohnpei", 7.43, 150.55),
  FO: row("DKK", "Atlantic/Faroe", 61.89, -6.91),
  FR: row("EUR", "Europe/Paris", 46.23, 2.21, "region"),
  GA: row("XAF", "Africa/Libreville", -0.8, 11.6),
  GB: row("GBP", "Europe/London", 55.38, -3.44, "county"),
  GD: row("XCD", "America/Grenada", 12.12, -61.68),
  GE: row("GEL", "Asia/Tbilisi", 42.32, 43.36, "region", GE_REGIONS),
  GF: row("EUR", "America/Cayenne", 3.93, -53.13),
  GG: row("GBP", "Europe/Guernsey", 49.46, -2.58),
  GH: row("GHS", "Africa/Accra", 7.95, -1.02),
  GI: row("GIP", "Europe/Gibraltar", 36.14, -5.35),
  GL: row("DKK", "America/Nuuk", 71.71, -42.6),
  GM: row("GMD", "Africa/Banjul", 13.44, -15.31),
  GN: row("GNF", "Africa/Conakry", 9.95, -9.7),
  GP: row("EUR", "America/Guadeloupe", 16.27, -61.55),
  GQ: row("XAF", "Africa/Malabo", 1.65, 10.27),
  GR: row("EUR", "Europe/Athens", 39.07, 21.82),
  GS: row("GBP", "Atlantic/South_Georgia", -54.43, -36.59),
  GT: row("GTQ", "America/Guatemala", 15.78, -90.23),
  GU: row("USD", "Pacific/Guam", 13.44, 144.79),
  GW: row("XOF", "Africa/Bissau", 11.8, -15.18),
  GY: row("GYD", "America/Guyana", 4.86, -58.93),
  HK: row("HKD", "Asia/Hong_Kong", 22.32, 114.17),
  HM: row("AUD", "Indian/Kerguelen", -53.08, 73.5),
  HN: row("HNL", "America/Tegucigalpa", 15.2, -86.24),
  HR: row("EUR", "Europe/Zagreb", 45.1, 15.2),
  HT: row("HTG", "America/Port-au-Prince", 18.97, -72.29),
  HU: row("HUF", "Europe/Budapest", 47.16, 19.5),
  ID: row("IDR", "Asia/Jakarta", -0.79, 113.92),
  IE: row("EUR", "Europe/Dublin", 53.41, -8.24, "county"),
  IL: row("ILS", "Asia/Jerusalem", 31.05, 34.85),
  IM: row("GBP", "Europe/Isle_of_Man", 54.24, -4.55),
  IN: row("INR", "Asia/Kolkata", 20.59, 78.96, "state"),
  IO: row("USD", "Indian/Chagos", -6.34, 71.88),
  IQ: row("IQD", "Asia/Baghdad", 33.22, 43.68),
  IR: row("IRR", "Asia/Tehran", 32.43, 53.69),
  IS: row("ISK", "Atlantic/Reykjavik", 64.96, -19.02),
  IT: row("EUR", "Europe/Rome", 41.87, 12.57, "region"),
  JE: row("GBP", "Europe/Jersey", 49.21, -2.13),
  JM: row("JMD", "America/Jamaica", 18.11, -77.3),
  JO: row("JOD", "Asia/Amman", 30.59, 36.24),
  JP: row("JPY", "Asia/Tokyo", 36.2, 138.25),
  KE: row("KES", "Africa/Nairobi", -0.02, 37.91),
  KG: row("KGS", "Asia/Bishkek", 41.2, 74.77),
  KH: row("KHR", "Asia/Phnom_Penh", 12.57, 104.99),
  KI: row("AUD", "Pacific/Tarawa", 1.87, -157.36),
  KM: row("KMF", "Indian/Comoro", -11.65, 43.33),
  KN: row("XCD", "America/St_Kitts", 17.36, -62.78),
  KP: row("KPW", "Asia/Pyongyang", 40.34, 127.51),
  KR: row("KRW", "Asia/Seoul", 35.91, 127.77),
  KW: row("KWD", "Asia/Kuwait", 29.31, 47.48),
  KY: row("KYD", "America/Cayman", 19.51, -80.57),
  KZ: row("KZT", "Asia/Almaty", 48.02, 66.92),
  LA: row("LAK", "Asia/Vientiane", 19.86, 102.5),
  LB: row("LBP", "Asia/Beirut", 33.85, 35.86),
  LC: row("XCD", "America/St_Lucia", 13.91, -60.98),
  LI: row("CHF", "Europe/Vaduz", 47.17, 9.56),
  LK: row("LKR", "Asia/Colombo", 7.87, 80.77),
  LR: row("LRD", "Africa/Monrovia", 6.43, -9.43),
  LS: row("LSL", "Africa/Maseru", -29.61, 28.23),
  LT: row("EUR", "Europe/Vilnius", 55.17, 23.88, "county"),
  LU: row("EUR", "Europe/Luxembourg", 49.82, 6.13),
  LV: row("EUR", "Europe/Riga", 56.88, 24.6),
  LY: row("LYD", "Africa/Tripoli", 26.34, 17.23),
  MA: row("MAD", "Africa/Casablanca", 31.79, -7.09),
  MC: row("EUR", "Europe/Monaco", 43.75, 7.41),
  MD: row("MDL", "Europe/Chisinau", 47.41, 28.37),
  ME: row("EUR", "Europe/Podgorica", 42.71, 19.37),
  MF: row("EUR", "America/Marigot", 18.07, -63.05),
  MG: row("MGA", "Indian/Antananarivo", -18.77, 46.87),
  MH: row("USD", "Pacific/Majuro", 7.13, 171.18),
  MK: row("MKD", "Europe/Skopje", 41.61, 21.75),
  ML: row("XOF", "Africa/Bamako", 17.57, -4.0),
  MM: row("MMK", "Asia/Yangon", 21.91, 95.96),
  MN: row("MNT", "Asia/Ulaanbaatar", 46.86, 103.85),
  MO: row("MOP", "Asia/Macau", 22.2, 113.54),
  MP: row("USD", "Pacific/Saipan", 15.1, 145.75),
  MQ: row("EUR", "America/Martinique", 14.64, -61.02),
  MR: row("MRU", "Africa/Nouakchott", 21.01, -10.94),
  MS: row("XCD", "America/Montserrat", 16.74, -62.19),
  MT: row("EUR", "Europe/Malta", 35.94, 14.38),
  MU: row("MUR", "Indian/Mauritius", -20.35, 57.55),
  MV: row("MVR", "Indian/Maldives", 3.2, 73.22),
  MW: row("MWK", "Africa/Blantyre", -13.25, 34.3),
  MX: row("MXN", "America/Mexico_City", 23.63, -102.55, "state"),
  MY: row("MYR", "Asia/Kuala_Lumpur", 4.21, 101.98),
  MZ: row("MZN", "Africa/Maputo", -18.67, 35.53),
  NA: row("NAD", "Africa/Windhoek", -22.96, 18.49),
  NC: row("XPF", "Pacific/Noumea", -20.9, 165.62),
  NE: row("XOF", "Africa/Niamey", 17.61, 8.08),
  NF: row("AUD", "Pacific/Norfolk", -29.04, 167.95),
  NG: row("NGN", "Africa/Lagos", 9.08, 8.68),
  NI: row("NIO", "America/Managua", 12.87, -85.21),
  NL: row("EUR", "Europe/Amsterdam", 52.13, 5.29, "province"),
  NO: row("NOK", "Europe/Oslo", 60.47, 8.47),
  NP: row("NPR", "Asia/Kathmandu", 28.39, 84.12),
  NR: row("AUD", "Pacific/Nauru", -0.52, 166.93),
  NU: row("NZD", "Pacific/Niue", -19.05, -169.87),
  NZ: row("NZD", "Pacific/Auckland", -40.9, 174.89),
  OM: row("OMR", "Asia/Muscat", 21.51, 55.92),
  PA: row("PAB", "America/Panama", 8.54, -80.78),
  PE: row("PEN", "America/Lima", -9.19, -75.02),
  PF: row("XPF", "Pacific/Tahiti", -17.68, -149.41),
  PG: row("PGK", "Pacific/Port_Moresby", -6.31, 143.96),
  PH: row("PHP", "Asia/Manila", 12.88, 121.77),
  PK: row("PKR", "Asia/Karachi", 30.38, 69.35),
  PL: row("PLN", "Europe/Warsaw", 51.92, 19.15, "province"),
  PM: row("EUR", "America/Miquelon", 46.94, -56.27),
  PN: row("NZD", "Pacific/Pitcairn", -24.7, -127.44),
  PR: row("USD", "America/Puerto_Rico", 18.22, -66.59),
  PS: row("ILS", "Asia/Gaza", 31.95, 35.23),
  PT: row("EUR", "Europe/Lisbon", 39.4, -8.22),
  PW: row("USD", "Pacific/Palau", 7.51, 134.58),
  PY: row("PYG", "America/Asuncion", -23.44, -58.44),
  QA: row("QAR", "Asia/Qatar", 25.35, 51.18),
  RE: row("EUR", "Indian/Reunion", -21.12, 55.54),
  RO: row("RON", "Europe/Bucharest", 45.94, 24.97),
  RS: row("RSD", "Europe/Belgrade", 44.02, 21.01),
  RU: row("RUB", "Europe/Moscow", 61.52, 105.32),
  RW: row("RWF", "Africa/Kigali", -1.94, 29.87),
  SA: row("SAR", "Asia/Riyadh", 23.89, 45.08),
  SB: row("SBD", "Pacific/Guadalcanal", -9.65, 160.16),
  SC: row("SCR", "Indian/Mahe", -4.68, 55.49),
  SD: row("SDG", "Africa/Khartoum", 12.86, 30.22),
  SE: row("SEK", "Europe/Stockholm", 60.13, 18.64),
  SG: row("SGD", "Asia/Singapore", 1.35, 103.82),
  SH: row("SHP", "Atlantic/St_Helena", -15.97, -5.72),
  SI: row("EUR", "Europe/Ljubljana", 46.15, 14.99),
  SJ: row("NOK", "Arctic/Longyearbyen", 77.55, 23.67),
  SK: row("EUR", "Europe/Bratislava", 48.67, 19.7),
  SL: row("SLE", "Africa/Freetown", 8.46, -11.78),
  SM: row("EUR", "Europe/San_Marino", 43.94, 12.46),
  SN: row("XOF", "Africa/Dakar", 14.5, -14.45),
  SO: row("SOS", "Africa/Mogadishu", 5.15, 46.2),
  SR: row("SRD", "America/Paramaribo", 3.92, -56.03),
  SS: row("SSP", "Africa/Juba", 6.88, 31.31),
  ST: row("STN", "Africa/Sao_Tome", 0.19, 6.61),
  SV: row("USD", "America/El_Salvador", 13.79, -88.9),
  SX: row("ANG", "America/Lower_Princes", 18.04, -63.07),
  SY: row("SYP", "Asia/Damascus", 34.8, 38.99),
  SZ: row("SZL", "Africa/Mbabane", -26.52, 31.47),
  TC: row("USD", "America/Grand_Turk", 21.69, -71.8),
  TD: row("XAF", "Africa/Ndjamena", 15.45, 18.73),
  TF: row("EUR", "Indian/Kerguelen", -49.28, 69.35),
  TG: row("XOF", "Africa/Lome", 8.62, 0.82),
  TH: row("THB", "Asia/Bangkok", 15.87, 100.99),
  TJ: row("TJS", "Asia/Dushanbe", 38.86, 71.28),
  TK: row("NZD", "Pacific/Fakaofo", -8.97, -171.86),
  TL: row("USD", "Asia/Dili", -8.87, 125.73),
  TM: row("TMT", "Asia/Ashgabat", 38.97, 59.56),
  TN: row("TND", "Africa/Tunis", 33.89, 9.54),
  TO: row("TOP", "Pacific/Tongatapu", -21.18, -175.2),
  TR: row("TRY", "Europe/Istanbul", 38.96, 35.24),
  TT: row("TTD", "America/Port_of_Spain", 10.69, -61.22),
  TV: row("AUD", "Pacific/Funafuti", -7.11, 177.65),
  TW: row("TWD", "Asia/Taipei", 23.7, 120.96),
  TZ: row("TZS", "Africa/Dar_es_Salaam", -6.37, 34.89),
  UA: row("UAH", "Europe/Kyiv", 48.38, 31.17),
  UG: row("UGX", "Africa/Kampala", 1.37, 32.29),
  UM: row("USD", "Pacific/Wake", 19.28, 166.65),
  US: row("USD", "America/New_York", 39.83, -98.58, "state", US_STATES),
  UY: row("UYU", "America/Montevideo", -32.52, -55.77),
  UZ: row("UZS", "Asia/Tashkent", 41.38, 64.59),
  VA: row("EUR", "Europe/Vatican", 41.9, 12.45),
  VC: row("XCD", "America/St_Vincent", 12.98, -61.29),
  VE: row("VES", "America/Caracas", 6.42, -66.59),
  VG: row("USD", "America/Tortola", 18.42, -64.64),
  VI: row("USD", "America/St_Thomas", 18.34, -64.9),
  VN: row("VND", "Asia/Ho_Chi_Minh", 14.06, 108.28),
  VU: row("VUV", "Pacific/Efate", -15.38, 166.96),
  WF: row("XPF", "Pacific/Wallis", -13.77, -177.16),
  WS: row("WST", "Pacific/Apia", -13.76, -172.1),
  YE: row("YER", "Asia/Aden", 15.55, 48.52),
  YT: row("EUR", "Indian/Mayotte", -12.83, 45.17),
  ZA: row("ZAR", "Africa/Johannesburg", -30.56, 22.94, "province"),
  ZM: row("ZMW", "Africa/Lusaka", -13.13, 27.85),
  ZW: row("ZWG", "Africa/Harare", -19.02, 29.15),
};

/** Every officially assigned ISO-3166-1 alpha-2 code (derived — single table). */
export const ALL_ISO_COUNTRIES: readonly string[] = Object.freeze(
  Object.keys(COUNTRY_TABLE).sort(),
);

export function isIsoCountry(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    COUNTRY_TABLE,
    code.toUpperCase(),
  );
}

/** Full metadata for a country, or null for a non-ISO code (honest null —
 *  never a guessed/default country). */
export function getCountryMeta(code: string): CountryMeta | null {
  const key = code.toUpperCase();
  const entry = COUNTRY_TABLE[key];
  return entry ? { code: key, ...entry } : null;
}

/** Subdivisions for a country when a curated list exists (US, GE); [] when the
 *  country has none curated — never an invented list. */
export function getSubdivisions(code: string): readonly CountrySubdivision[] {
  return getCountryMeta(code)?.subdivisions ?? [];
}

/**
 * BINDING: postal/ZIP codes are never required anywhere in the product, for
 * any country. Location granularity stops at country / subdivision / city.
 * Constant-false by design; guard-tested so it cannot silently regress.
 */
export function requiresPostalCode(_code: string): false {
  return false;
}

/**
 * Localized country display name via the runtime's built-in CLDR data — no
 * hand-translated catalogues, correct in every locale. Falls back through
 * `en`, and finally to the raw code, when the runtime lacks the locale
 * (e.g. `ka` on a slim ICU build) or the code is unknown.
 */
export function countryDisplayName(code: string, locale: string): string {
  const key = code.toUpperCase();
  // Non-ISO input → the raw code, honestly. (CLDR would otherwise render the
  // placeholder "Unknown Region", which reads like data we don't have.)
  if (!isIsoCountry(key)) return key;
  try {
    const dn = new Intl.DisplayNames([locale, "en"], {
      type: "region",
      fallback: "code",
    });
    return dn.of(key) ?? key;
  } catch {
    // Unsupported locale tag or region code → honest raw code, never a guess.
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(key) ?? key;
    } catch {
      return key;
    }
  }
}

/**
 * Format an amount in a COUNTRY's currency for a locale (GEL for GE, USD for
 * US, EUR for LT, …). Returns null when the country is unknown or has no
 * currency (honest absence — the caller renders a plain number or nothing).
 */
export function formatCurrencyForCountry(
  amount: number,
  countryCode: string,
  locale: string,
): string | null {
  const meta = getCountryMeta(countryCode);
  if (!meta?.currency) return null;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: meta.currency,
    }).format(amount);
  } catch {
    return null;
  }
}
