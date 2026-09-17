import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  decideCommercialHandoff,
  buildPropositionConsent,
  EMPLOYER_PROPOSITION_CONSENT_VERSION,
} from "@/lib/commercial/handoff-rule";
import {
  buildWorkerVacancyInterestEnvelope,
  HANDOFF_ENVELOPE_KEYS,
  HANDOFF_FORBIDDEN_FIELDS,
} from "@/lib/commercial/handoff-contract";
import {
  dispatchQueuedHandoffs,
  envelopeFromQueuedRow,
  handoffDoorSettings,
} from "@/lib/commercial/handoff-dispatch";
import { buildMyInterestView, nextActionFor, vacancyLiveKey } from "@/lib/opportunities/my-interest-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * WORKER → REAL VACANCY → INTEREST → NONSTOP COMMERCIAL HANDOFF (2026-09-17).
 *
 * The chain the owner asked to close, pinned at its honesty points:
 *   - the commercial signal is an explicit RULE, never a score, and a weak
 *     or non-action interest never becomes a handoff;
 *   - the handoff envelope carries canonical REFERENCES and declared context
 *     — never a journal entry, a CV, a note, a contact column;
 *   - consent to be PROPOSED to an employer is a separate, versioned answer,
 *     never inferred from interest, referral or registration;
 *   - the dispatcher is INERT without the owner's door settings, and marks a
 *     row delivered only on the door's own answer;
 *   - NO employer is ever contacted from LabourMarket.ai; the only
 *     recipient of anything is the Nonstop partner door;
 *   - the migration is RED (owner-gated) and ships its rollback.
 */

const WEB = join(__dirname, "..", "..");
const ROOT = join(WEB, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

const NOW = Date.parse("2026-09-17T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const eligibleInput = {
  workerMatchable: true,
  source: "public_vacancy" as const,
  interestStatus: "interested" as const,
  vacancyLive: true,
  employer: { name: "Nordisk Lager AB", externalOrgId: "5560001234", homepage: null },
  publishedAt: new Date(NOW - 45 * DAY).toISOString(),
  nowMs: NOW,
};

describe("the commercial signal rule — explicit criteria, never a score", () => {
  it("every criterion must hold; a weak or non-action interest is not a handoff", () => {
    expect(decideCommercialHandoff(eligibleInput)).toMatchObject({
      eligible: true,
      outreachState: "eligible_for_human_review",
      employerKeyHint: "org",
    });
    expect(decideCommercialHandoff({ ...eligibleInput, workerMatchable: false })).toEqual({
      eligible: false,
      reason: "worker_not_matchable",
    });
    expect(decideCommercialHandoff({ ...eligibleInput, source: "platform_demand" })).toEqual({
      eligible: false,
      reason: "not_public_vacancy",
    });
    expect(decideCommercialHandoff({ ...eligibleInput, interestStatus: "withdrawn" })).toEqual({
      eligible: false,
      reason: "interest_not_active",
    });
    expect(decideCommercialHandoff({ ...eligibleInput, vacancyLive: false })).toEqual({
      eligible: false,
      reason: "vacancy_not_live",
    });
    expect(
      decideCommercialHandoff({
        ...eligibleInput,
        employer: { name: "Somebody", externalOrgId: null, homepage: null },
      }),
    ).toEqual({ eligible: false, reason: "employer_not_identifiable" });
    expect(
      decideCommercialHandoff({
        ...eligibleInput,
        employer: { name: null, externalOrgId: "5560001234", homepage: null },
      }),
    ).toEqual({ eligible: false, reason: "employer_not_identifiable" });
    expect(decideCommercialHandoff({ ...eligibleInput, publishedAt: null })).toEqual({
      eligible: false,
      reason: "publication_date_unusable",
    });
    expect(
      decideCommercialHandoff({ ...eligibleInput, publishedAt: new Date(NOW + DAY).toISOString() }),
    ).toEqual({ eligible: false, reason: "publication_date_unusable" });
  });

  it("the outreach recency floor is RECORDED on the handoff, not a veto of it", () => {
    const fresh = decideCommercialHandoff({
      ...eligibleInput,
      publishedAt: new Date(NOW - 3 * DAY).toISOString(),
    });
    expect(fresh).toMatchObject({ eligible: true, outreachState: "ineligible_too_new" });
  });

  it("a homepage-only employer keys on the host", () => {
    const d = decideCommercialHandoff({
      ...eligibleInput,
      employer: { name: "Bygg & Co", externalOrgId: null, homepage: "bygg.example" },
    });
    expect(d).toMatchObject({ eligible: true, employerKeyHint: "host" });
  });

  it("the rule is pure — no clock, no env, no IO", () => {
    const src = read("lib", "commercial", "handoff-rule.ts");
    expect(src).not.toMatch(/Date\.now\(|process\.env|fetch\(|from\("@\/lib\/supabase/);
  });
});

describe("consent to be proposed is separate and versioned", () => {
  it("is never inferred: false in, false out; and the version travels", () => {
    expect(buildPropositionConsent(false)).toEqual({
      given: false,
      version: EMPLOYER_PROPOSITION_CONSENT_VERSION,
    });
    expect(buildPropositionConsent(true)).toEqual({
      given: true,
      version: "employer-proposition-v1",
    });
    // The button starts UNCHECKED and the label asks the question in words.
    const btn = read("components", "app", "vacancy-interest-button.tsx");
    expect(btn).toContain("useState(false)");
    expect(btn).toContain('data-testid="vacancy-interest-consent"');
    // And the interest core hands the answer over untouched — never true by default.
    const core = read("lib", "opportunities", "vacancy-interest.ts");
    expect(core).toContain("buildPropositionConsent(propositionConsent)");
    expect(core).not.toMatch(/propositionConsent:\s*true/);
    // The DB stores only the exact shape; anything else is `given:false`.
    const mig = readFileSync(
      join(ROOT, "supabase", "migrations", "20260917160000_vacancy_interest_commercial_handoff_v1.sql"),
      "utf8",
    );
    expect(mig).toContain("(p_proposition_consent ->> 'version') = 'employer-proposition-v1'");
    expect(mig).toContain("v_consent := jsonb_build_object('given', false)");
  });
});

describe("the envelope carries references and declared context — never evidence", () => {
  const envelope = buildWorkerVacancyInterestEnvelope({
    handoffId: "h-1",
    createdAt: "2026-09-17T12:00:00Z",
    outreachStateAtCreation: "eligible_for_human_review",
    employerKey: "arbetsformedlingen:org:5560001234",
    propositionConsent: { given: true, version: "employer-proposition-v1", at: "2026-09-17T12:00:00Z" },
    worker: {
      profileRef: "p-1",
      workerRef: "w-1",
      locale: "ru",
      professionSlug: "warehouse-worker",
      skillSlugs: ["forklift-operation", "inventory-control"],
      languages: ["ru", "en"],
      availabilityStatus: "available",
      currentCountry: "LT",
      basis: "declared",
    },
    vacancy: {
      vacancyRef: "v-1",
      providerKey: "arbetsformedlingen",
      externalId: "29384",
      title: "Lagerarbetare",
      country: "SE",
      city: "Göteborg",
      publishedAt: "2026-08-01T00:00:00Z",
      expiresAt: null,
      applicationUrl: "https://arbetsformedlingen.se/platsbanken/annonser/29384",
      professionSlug: "warehouse-worker",
    },
    employer: { name: "Nordisk Lager AB", externalOrgId: "5560001234", homepage: null },
    interest: { signalRef: "s-1", expressedAt: "2026-09-17T11:59:00Z", matchStatus: "possible" },
  });

  it("has exactly the allow-listed top-level keys", () => {
    expect(Object.keys(envelope).sort()).toEqual([...HANDOFF_ENVELOPE_KEYS].sort());
    expect(envelope.kind).toBe("LABOURMARKET_WORKER_VACANCY_INTEREST");
    expect(envelope.v).toBe(1);
  });

  it("no forbidden field name appears anywhere in the serialized envelope", () => {
    const json = JSON.stringify(envelope).toLowerCase();
    for (const f of HANDOFF_FORBIDDEN_FIELDS) {
      expect(json, `envelope leaked "${f}"`).not.toMatch(new RegExp(`"${f}[a-z_]*"\\s*:`));
    }
  });

  it("the match travels as a STATUS word, never a number", () => {
    expect(envelope.interest.matchStatus).toBe("possible");
    expect(JSON.stringify(envelope.interest)).not.toMatch(/score|rank|points/i);
  });

  it("ungiven consent stays ungiven, with no version and no timestamp", () => {
    const e2 = buildWorkerVacancyInterestEnvelope({
      handoffId: "h-2",
      createdAt: "2026-09-17T12:00:00Z",
      outreachStateAtCreation: "ineligible_too_new",
      employerKey: "arbetsformedlingen:host:bygg.example",
      propositionConsent: { given: false },
      worker: { ...envelope.worker },
      vacancy: { ...envelope.vacancy },
      employer: { name: "Bygg & Co", externalOrgId: null, homepage: "bygg.example" },
      interest: { signalRef: "s-2", expressedAt: "2026-09-17T11:59:00Z", matchStatus: null },
    });
    expect(e2.interest.propositionConsent).toEqual({ given: false, version: null, at: null });
    // A tampered shape (given:"true" as a string) is NOT consent.
    const e3 = buildWorkerVacancyInterestEnvelope({
      handoffId: "h-3",
      createdAt: "2026-09-17T12:00:00Z",
      outreachStateAtCreation: "ineligible_too_new",
      employerKey: "k",
      propositionConsent: { given: "true", version: "employer-proposition-v1" },
      worker: { ...envelope.worker },
      vacancy: { ...envelope.vacancy },
      employer: { name: "X", externalOrgId: "1", homepage: null },
      interest: { signalRef: "s-3", expressedAt: "2026-09-17T11:59:00Z", matchStatus: null },
    });
    expect(e3.interest.propositionConsent.given).toBe(false);
  });

  it("the delivery reader projects no evidence column either (SQL allow-list)", () => {
    const mig = readFileSync(
      join(ROOT, "supabase", "migrations", "20260917160000_vacancy_interest_commercial_handoff_v1.sql"),
      "utf8",
    );
    const fn = mig.slice(
      mig.indexOf("create or replace function public.list_queued_commercial_handoffs_v1"),
      mig.indexOf("revoke all on function public.list_queued_commercial_handoffs_v1"),
    );
    for (const col of ["journal_entries", "worker_documents", "description_raw", "profile_text", "s.note", "email", "phone", "bio", "headline"]) {
      expect(fn, `reader touches ${col}`).not.toContain(col);
    }
    expect(fn.length).toBeGreaterThan(0);
    expect(mig).toContain("grant execute on function public.list_queued_commercial_handoffs_v1(integer) to service_role");
    expect(mig).toContain("revoke all on function public.list_queued_commercial_handoffs_v1(integer) from authenticated");
  });
});

describe("the dispatcher is inert without the owner's door, and never contacts an employer", () => {
  it("answers not_configured with no fetch and no DB touch when the env is unset", async () => {
    const fetchImpl = vi.fn();
    const r = await dispatchQueuedHandoffs({
      env: {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r).toEqual({ kind: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(handoffDoorSettings({ NONSTOP_HANDOFF_ENDPOINT: "http://insecure", NONSTOP_HANDOFF_TOKEN: "x".repeat(40) })).toBeNull();
    expect(handoffDoorSettings({ NONSTOP_HANDOFF_ENDPOINT: "https://nonstopgroup.eu/api/x", NONSTOP_HANDOFF_TOKEN: "short" })).toBeNull();
  });

  it("the only destination is the configured partner door; nothing reads an employer address", () => {
    const src = read("lib", "commercial", "handoff-dispatch.ts");
    expect(src).toContain("fetchImpl(settings.endpoint, {");
    expect(src).not.toMatch(/employer_homepage\s*\)|mailto:|smtp|sendEmail|sendMail/);
    // A row is marked delivered ONLY on the door's own 201/200 answer.
    expect(src).toMatch(/if \(outcome === "delivered" \|\| outcome === "duplicate"\) \{/);
    expect(src).toContain('.eq("status", "queued")');
    // The bearer never reaches a log line.
    expect(src).not.toMatch(/console\.(log|warn|error)\([^)]*token/);
  });

  it("the envelope built from a queued row keeps the contract", () => {
    const e = envelopeFromQueuedRow({
      handoff_id: "h", created_at: "2026-09-17T12:00:00Z", outreach_state: "ineligible_too_new",
      employer_key: "arbetsformedlingen:org:1", proposition_consent: { given: false },
      interest_signal_id: "s", interest_at: null, interest_status: "interested", match_status: "possible",
      profile_id: "p", worker_id: "w", locale: "ru", profession_slug: "warehouse-worker",
      skill_slugs: ["a"], languages: ["ru"], availability_status: "available", current_country: "LT", basis: "declared",
      vacancy_id: "v", provider_key: "arbetsformedlingen", external_id: "1", title: "T", country: "SE", city: null,
      published_at: "2026-09-01T00:00:00Z", expires_at: null, application_url: null, vacancy_profession: null,
      employer_name: "E", employer_org_id: "1", employer_homepage: null,
    });
    expect(e.kind).toBe("LABOURMARKET_WORKER_VACANCY_INTEREST");
    expect(e.interest.expressedAt).toBe("2026-09-17T12:00:00Z");
    expect(e.employer.employerKey).toBe("arbetsformedlingen:org:1");
  });

  it("the cron route is double-gated (CRON_SECRET + door env) and not on the schedule yet", () => {
    const route = read("app", "api", "cron", "commercial-handoffs", "route.ts");
    expect(route).toContain("authorizeCronRequest(request)");
    expect(route).toContain('reason: "not_configured"');
    const vercel = read("vercel.json");
    expect(vercel).not.toContain("commercial-handoffs");
  });
});

describe("interest on a public vacancy — the same table, honest surfaces", () => {
  it("the write goes through the worker's own RLS upsert keyed on (worker, vacancy), then the gated RPC", () => {
    const src = read("lib", "opportunities", "vacancy-interest.ts");
    expect(src).toContain('.from("demand_interest_signals")');
    expect(src).toContain('{ onConflict: "worker_id,public_vacancy_id" }');
    expect(src).toContain('rpc("create_commercial_handoff_v1"');
    // Order: upsert → (funnel) → rule → RPC. The handoff never precedes the stored interest.
    expect(src.indexOf('.upsert(')).toBeLessThan(src.indexOf("decideCommercialHandoff("));
    expect(src.indexOf("decideCommercialHandoff(")).toBeLessThan(src.indexOf('rpc("create_commercial_handoff_v1"'));
    // No admin client, no network.
    expect(src).not.toMatch(/createAdminClient|fetch\(/);
    // Ineligibility is a stable code the surface turns into words.
    expect(src).toContain('handoff: { kind: "ineligible", reason: decision.reason }');
  });

  it("the vacancy is read live under the caller's own client — no oracle", () => {
    const src = read("lib", "opportunities", "vacancy-interest.ts");
    expect(src).toContain("getPublicVacancyById(supabase, input.vacancyId)");
    expect(src).toContain('return { kind: "not-visible" }');
  });

  it("the external card offers the control only when its store exists", () => {
    const row = read("components", "app", "external-vacancies-section.tsx");
    expect(row).toContain("{interest && card.vacancyId ? (");
    const page = read("app", "[locale]", "dashboard", "opportunities", "page.tsx");
    expect(page).toContain("result.capabilities.vacancyInterestAvailable && row.card.vacancyId");
    const loader = read("lib", "opportunities", "load-worker-opportunities.ts");
    expect(loader).toContain("vacancyInterestAvailable: myInterest.vacancyInterestAvailable");
  });

  it("the button's copy never claims an application, a message or a placement", () => {
    for (const locale of ["en", "lt", "ru", "lv", "et", "pl", "de", "nl", "da", "no", "sv"]) {
      const m = JSON.parse(read("messages", `${locale}.json`)) as {
        opportunities: { vacancyInterest: Record<string, unknown> };
      };
      const v = m.opportunities.vacancyInterest;
      expect(v, locale).toBeDefined();
      for (const k of ["express", "sent", "withdraw", "consentLabel", "consentHint", "handoffCreated", "handoffTooNew", "handoffPending", "scopeNote", "error"]) {
        expect(typeof v[k], `${locale}.${k}`).toBe("string");
      }
      const ineligible = v.ineligible as Record<string, string>;
      for (const code of ["worker_not_matchable", "employer_not_identifiable", "vacancy_not_live", "not_public_vacancy", "interest_not_active", "publication_date_unusable"]) {
        expect(typeof ineligible[code], `${locale}.ineligible.${code}`).toBe("string");
      }
      const sent = String(v.handoffCreated).toLowerCase();
      expect(sent).not.toMatch(/application sent|applied|placement confirmed|employer accepted|paraiška išsiųsta|заявка отправлена/);
    }
  });

  it("'Mano susidomėjimai' keeps a vacancy interest as its own row kind", () => {
    const rows = buildMyInterestView(
      [
        {
          requestId: null,
          publicVacancyId: "v-1",
          status: "interested",
          matchSnapshot: { context: { role_text: "Lagerarbetare", country: "SE", location_label: "Göteborg", company_name: "Nordisk Lager AB" } },
          createdAt: "2026-09-17T12:00:00Z",
          updatedAt: null,
        },
        {
          requestId: "d-1",
          publicVacancyId: null,
          status: "interested",
          matchSnapshot: {},
          createdAt: "2026-09-17T12:00:00Z",
          updatedAt: null,
        },
      ],
      new Map([[vacancyLiveKey("v-1"), { roleText: "Lagerarbetare", companyName: "Nordisk Lager AB", locationLabel: "Göteborg", country: "SE" }]]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "vacancy", key: "vacancy:v-1", stillOpen: true, nextAction: "withdraw", cvTemplate: null });
    expect(rows[1]).toMatchObject({ source: "demand", key: "d-1", stillOpen: false });
    // A public ad has no employer inbox here.
    expect(nextActionFor("interested", true, "vacancy")).toBe("withdraw");
    expect(nextActionFor("withdrawn", true, "vacancy")).toBe("none");
  });

  it("the funnel names the owner's states, as bounded events", () => {
    for (const k of [
      "recognitionSuggested",
      "recognitionConfirmed",
      "recognitionCorrected",
      "recognitionRejected",
      "profileMatchable",
      "realOpportunitiesLoaded",
      "vacancyInterestExpressed",
      "commercialHandoffCreated",
    ] as const) {
      expect(FUNNEL_EVENTS[k]).toMatch(/^[a-z_]+$/);
    }
    const core = read("lib", "opportunities", "vacancy-interest.ts");
    // Created ONLY on a new row — never on the idempotent replay.
    const i = core.indexOf("FUNNEL_EVENTS.commercialHandoffCreated");
    expect(core.slice(i - 80, i)).toContain('handoff.kind === "created"');
  });
});

describe("the migration is RED, rolled-back-proven, and ships its rollback", () => {
  it("carries the annotation and the paired down script", () => {
    const mig = readFileSync(
      join(ROOT, "supabase", "migrations", "20260917160000_vacancy_interest_commercial_handoff_v1.sql"),
      "utf8",
    );
    expect(mig.startsWith("-- @human-gate-approved")).toBe(true);
    const down = readFileSync(
      join(ROOT, "supabase", "rollbacks", "20260917160000_vacancy_interest_commercial_handoff_v1.down.sql"),
      "utf8",
    );
    expect(down).toContain("drop table if exists public.commercial_handoffs");
    expect(down).toContain("rollback refused");
    // No anon grant anywhere; the insert path is the SECURITY DEFINER only.
    expect(mig).not.toMatch(/grant [^;]* to anon/i);
    expect(mig).toContain("grant select on public.commercial_handoffs to authenticated");
    expect(mig).not.toMatch(/grant [^;]*insert[^;]* on public\.commercial_handoffs to authenticated/i);
    // Withdrawal closes the handoff.
    expect(mig).toContain("create trigger demand_interest_signals_close_handoff");
  });
});
