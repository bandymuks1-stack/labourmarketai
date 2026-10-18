/**
 * CANONICAL JOB → CAMPAIGN FACTS (acquisition loop P0, 2026-09-20).
 *
 * Exports, for ONE public vacancy, exactly the fields a distribution
 * campaign is authorized to use — and nothing else. This file IS the
 * JOB → SOCIAL boundary: the creative system (Agentai OS, ChatGPT, a person)
 * receives this JSON and may render copy, images or video from it, and may
 * never invent a fact that is not in it.
 *
 *   pnpm -C apps/web exec tsx scripts/job-campaign-facts.ts --id=<uuid> [--out=<file>]
 *
 * WHAT IS EXPORTED (campaign-authorized)
 *   - identity: the platform id (the exact job URL path), publication and
 *     expiry dates, the source language;
 *   - the anonymous projection every visitor will see: occupation label,
 *     profession slug, positions, working time, employment form,
 *     compensation ONLY when the publisher stated it;
 *   - market: country + region (the campaign names the market — a post that
 *     says "Sweden" must be about a job in Sweden);
 *   - stated requirements: required languages, recognised skill slugs (marked
 *     as machine-derived), start date when stated;
 *   - the parties, by rule: who publishes, who employs, and what is disclosed
 *     after registration.
 *
 * WHAT IS NOT EXPORTED (member-only or provenance)
 *   employer name / org id / homepage, city, coordinates, the application
 *   URL, the full description, the named source service. The landing page's
 *   anonymous projection withholds them (owner directive 2026-08-24); the
 *   campaign may not say more than the landing will show.
 *
 * READ-ONLY. Service-role read of one row; writes nothing anywhere.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { fromPublicVacancyRow } from "../lib/vacancy-store/vacancy-read";

const CANONICAL_HOST = "https://labourmarket.ai";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CampaignJobFactsV1 {
  readonly kind: "labourmarket-campaign-job-facts/v1";
  readonly exportedAtIso: string;
  readonly jobId: string;
  /** Site path without locale — the campaign URL builder adds the locale
   *  and the attribution. */
  readonly jobPath: string;
  /** Convenience for a human reading the file. */
  readonly exampleUrl: string;
  readonly live: boolean;
  readonly publishedAtIso: string;
  readonly expiresAtIso: string | null;
  readonly sourceLanguage: string;
  readonly occupationLabel: string | null;
  readonly professionSlug: string | null;
  readonly positions: number | null;
  readonly workingTime: string;
  readonly employmentForm: string;
  readonly compensation: {
    readonly currency: string;
    readonly min: number | null;
    readonly max: number | null;
  } | null;
  readonly market: { readonly country: string; readonly region: string | null };
  readonly requirements: {
    readonly languages: readonly string[];
    /** Machine-derived at import time; a campaign may say "the advert
     *  mentions …", never "you must hold …". */
    readonly recognisedSkillSlugs: readonly string[];
    readonly startDate: string | null;
  };
  readonly parties: {
    readonly publisher: "EXTERNAL_PUBLIC_EMPLOYMENT_SOURCE";
    readonly employer: "NAMED_AFTER_REGISTRATION";
    readonly labourmarketRole: "DESTINATION_NOT_EMPLOYER";
    readonly applicationRoute: "PUBLISHER_AFTER_REGISTRATION";
    readonly employerIdentifiable: boolean;
  };
  /** What a post may never state because this export does not carry it. */
  readonly notStated: readonly string[];
  /**
   * INTERNAL EVIDENCE — for the publication gate ONLY, never for copy.
   * The gate's REAL_CURRENT_VACANCY frame requires proof that a real employer
   * published this ad at a real source; the presentation-boundary check then
   * PROVES the rendered text contains none of it. The composer never receives
   * this block. Anything from here in a post is a refused publication.
   */
  readonly internalEvidence: {
    readonly marker: "INTERNAL_ONLY_NEVER_PUBLISH";
    readonly employer: string;
    readonly sourceUrl: string;
    readonly sourceDomains: readonly string[];
    readonly sourceNames: readonly string[];
    readonly retrievedAtIso: string;
  };
}

/** Public source URL of a stored ad, by provider — the same address the
 *  member page's attribution names. Extended only with evidence. */
function sourceUrlFor(providerKey: string, externalId: string): {
  readonly url: string;
  readonly domains: readonly string[];
  readonly names: readonly string[];
} {
  if (providerKey === "arbetsformedlingen") {
    return {
      url: `https://arbetsformedlingen.se/platsbanken/annonser/${externalId}`,
      domains: ["arbetsformedlingen.se", "jobtechdev.se"],
      names: ["Arbetsförmedlingen", "Platsbanken", "JobTech"],
    };
  }
  return { url: "", domains: [], names: [] };
}

function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<number> {
  const id = (flag("id") ?? "").trim();
  if (!UUID_RE.test(id)) {
    console.error("REFUSED: --id=<public vacancy uuid> is required");
    return 2;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (read-only use)");
    return 2;
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin.from("public_vacancies").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(`REFUSED: read failed (${error.code ?? "unknown"})`);
    return 1;
  }
  if (!data) {
    console.error("REFUSED: no such public vacancy");
    return 1;
  }
  const v = fromPublicVacancyRow(data as Record<string, unknown>);
  const now = new Date();
  const live =
    v.lifecycle === "published" &&
    (data as { is_active?: boolean }).is_active === true &&
    (v.expiresAt === null || Date.parse(v.expiresAt) > now.getTime());

  const notStated: string[] = [];
  if (v.compensation.min === null && v.compensation.max === null) notStated.push("salary / pay");
  if (v.startDate === null) notStated.push("start date");
  if (v.requiredLanguages.length === 0) notStated.push("language requirement");
  notStated.push(
    "employer name (after registration)",
    "city / address (after registration)",
    "how to apply (after registration)",
    "accommodation",
    "transport",
    "rotation / schedule",
    "certificates required",
    "visa / work authorization",
    "urgency",
  );

  const facts: CampaignJobFactsV1 = {
    kind: "labourmarket-campaign-job-facts/v1",
    exportedAtIso: now.toISOString(),
    jobId: id,
    jobPath: `/jobs/${id}`,
    exampleUrl: `${CANONICAL_HOST}/en/jobs/${id}`,
    live,
    publishedAtIso: v.publishedAt,
    expiresAtIso: v.expiresAt,
    sourceLanguage: v.sourceLanguage,
    occupationLabel: v.occupationRaw,
    professionSlug: v.professionSlug,
    positions: v.positions,
    workingTime: v.workingTime,
    employmentForm: v.employmentForm,
    compensation:
      v.compensation.min !== null || v.compensation.max !== null
        ? { currency: v.compensation.currency ?? "", min: v.compensation.min, max: v.compensation.max }
        : null,
    market: { country: v.location.country, region: v.location.region },
    requirements: {
      languages: v.requiredLanguages,
      recognisedSkillSlugs: v.skillSlugs,
      startDate: v.startDate,
    },
    parties: {
      publisher: "EXTERNAL_PUBLIC_EMPLOYMENT_SOURCE",
      employer: "NAMED_AFTER_REGISTRATION",
      labourmarketRole: "DESTINATION_NOT_EMPLOYER",
      applicationRoute: "PUBLISHER_AFTER_REGISTRATION",
      employerIdentifiable:
        Boolean(v.employer.name?.trim()) &&
        Boolean(v.employer.externalOrgId?.trim() || v.employer.homepage?.trim()),
    },
    notStated,
    internalEvidence: (() => {
      const src = sourceUrlFor(v.providerKey, v.externalId);
      return {
        marker: "INTERNAL_ONLY_NEVER_PUBLISH" as const,
        employer: v.employer.name ?? "",
        sourceUrl: src.url,
        sourceDomains: src.domains,
        sourceNames: src.names,
        retrievedAtIso: v.capturedAt,
      };
    })(),
  };

  const json = JSON.stringify(facts, null, 2);
  const out = flag("out");
  if (out) {
    writeFileSync(resolve(process.cwd(), out), json + "\n", "utf8");
    console.error(`wrote ${out}`);
  } else {
    console.log(json);
  }
  return live ? 0 : 3;
}

// `process.exitCode`, not `process.exit()`: the Supabase client still holds an
// open handle at this point and a hard exit trips a libuv assertion on
// Windows after the file was already written.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error(`REFUSED: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  },
);
