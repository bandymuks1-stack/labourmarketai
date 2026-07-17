/**
 * Company-need prefill adapter (European Work & Project Calculator v1).
 *
 * Parses OPTIONAL query parameters into bounded default values for the public
 * company-need form. Only fields the form's server action ALREADY accepts are
 * supported (number_of_workers, country, profession, expected_duration,
 * description) — the adapter adds no new backend capability, it only saves
 * retyping. Everything is validated and bounded here AND re-validated by the
 * server action on submit; an invalid or out-of-range parameter is silently
 * dropped (never an error page, never a fabricated value).
 *
 * Privacy: the calculator bridge only ever SENDS number_of_workers + country
 * (non-PII, non-price). The other fields are accepted for completeness but
 * every value is length-bounded and used purely as a form default the user
 * reviews before submitting. PURE — no fs, no net, client-safe.
 */
import { READINESS_COUNTRIES } from "@/lib/country-readiness/types";
import { isWorkTypeSlug } from "@/lib/taxonomy/work-categories";

export interface CompanyNeedPrefill {
  readonly numberOfWorkers?: number;
  readonly country?: string;
  readonly profession?: string;
  readonly expectedDuration?: string;
  readonly description?: string;
}

const MAX_WORKERS = 1000; // mirrors the form input's max
const MAX_DURATION_CHARS = 120; // mirrors the form input's maxLength
const MAX_DESCRIPTION_CHARS = 1000; // conservative slice of the 8000 textarea

function text(value: string | null, maxLen: number): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Parse + bound the supported prefill params from a URL query. */
export function parseCompanyNeedPrefill(
  params: URLSearchParams,
): CompanyNeedPrefill {
  const out: {
    numberOfWorkers?: number;
    country?: string;
    profession?: string;
    expectedDuration?: string;
    description?: string;
  } = {};

  const workersRaw = params.get("number_of_workers");
  if (workersRaw != null && /^\d{1,4}$/.test(workersRaw.trim())) {
    const n = Number(workersRaw.trim());
    if (Number.isInteger(n) && n >= 1 && n <= MAX_WORKERS) {
      out.numberOfWorkers = n;
    }
  }

  const countryRaw = params.get("country");
  if (countryRaw) {
    const code = countryRaw.trim().toUpperCase();
    if ((READINESS_COUNTRIES as readonly string[]).includes(code)) {
      out.country = code;
    }
  }

  const professionRaw = params.get("profession");
  if (professionRaw && isWorkTypeSlug(professionRaw.trim())) {
    out.profession = professionRaw.trim();
  }

  const duration = text(params.get("expected_duration"), MAX_DURATION_CHARS);
  if (duration) out.expectedDuration = duration;

  const description = text(params.get("description"), MAX_DESCRIPTION_CHARS);
  if (description) out.description = description;

  return out;
}
