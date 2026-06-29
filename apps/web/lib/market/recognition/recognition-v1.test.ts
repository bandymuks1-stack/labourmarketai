import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { detectJobDemandFields } from "./missing-fields";
import { recognizeJobDemand } from "./recognize-job-demand";
import { explainTopMatches, type MatchCandidate } from "./match-explanation";
import {
  classifyParticipation,
  buildPrivateProgressMessage,
} from "./participation";
import { buildWeeklyPublicDigest } from "./weekly-digest";
import type { MatchNeed } from "@/lib/market/match-v1";

// The exact pasted job post from the owner goal acceptance example.
const SHIP_CARPENTER =
  "Ship carpenter, Ålesund, Norway, rotation 4/2, accommodation, meals, " +
  "travel covered, 3 years of shipyard experience, technical drawings, power tools.";

describe("recognition: pasted job text → structured recognized fields", () => {
  const scan = detectJobDemandFields(SHIP_CARPENTER);
  const recognized = new Set(scan.recognized.map((r) => r.key));
  const missing = new Set(scan.missing.map((m) => m.key));

  it("recognizes the identity fields present in the text", () => {
    for (const k of ["role", "location", "sector", "rotation", "experience"]) {
      expect(recognized, `expected recognized: ${k}`).toContain(k);
    }
  });

  it("detects the missing detail fields the post never states", () => {
    for (const k of [
      "salary",
      "grossNet",
      "currency",
      "weeklyHours",
      "overtime",
      "contractType",
      "legalEmployer",
      "language",
      "requiredDocuments",
      "accommodationType",
      "accommodationDeductions",
    ]) {
      expect(missing, `expected missing: ${k}`).toContain(k);
    }
  });

  it("a field is never both recognized and missing", () => {
    for (const k of recognized) expect(missing.has(k)).toBe(false);
  });
});

describe("recognition: a vague post is not treated as match-ready", () => {
  it("flags pay/hours/legal/language/document risks + a clear next step", () => {
    const card = recognizeJobDemand({ rawText: SHIP_CARPENTER });
    const risks = new Set(card.risks.map((r) => r.code));
    expect(risks).toContain("pay_unclear");
    expect(risks).toContain("hours_overtime_unclear");
    expect(risks).toContain("legal_employer_unclear");
    expect(risks).toContain("language_requirement_unclear");
    expect(risks).toContain("documents_unclear");
    expect(risks).toContain("accommodation_terms_unclear");
    // Important details are missing → the card points at completing them.
    expect(card.nextAction.code).toBe("complete_missing_fields");
    expect(card.nextAction.href).toBe("/dashboard");
    // The structured identity still recognized work type + country.
    expect(card.structured.workType).toBe("carpenter");
    expect(card.structured.country).toBe("NO");
  });

  it("an empty input recognizes nothing and stays honest", () => {
    const card = recognizeJobDemand({ rawText: "" });
    expect(card.recognized).toHaveLength(0);
    expect(card.confidence).toBe("low");
  });
});

describe("matching: top 1–3 explanation with fit / missing / next", () => {
  const need: MatchNeed = {
    escoSkillUris: ["a", "b"],
    country: "NO",
    languages: [],
  };
  const candidates: MatchCandidate[] = [
    {
      id: "w-strong",
      subject: {
        skills: [
          { uri: "a", evidence: "manager_confirmed" },
          { uri: "b", evidence: "manager_confirmed" },
        ],
        country: "NO",
        availabilityStatus: "available",
      },
    },
    {
      id: "w-possible",
      subject: {
        skills: [{ uri: "a", evidence: "manager_confirmed" }],
        country: "NO",
        availabilityStatus: "available",
      },
    },
    {
      id: "w-weak",
      subject: {
        skills: [{ uri: "z", evidence: "self_declared" }],
        country: "LT",
        availabilityStatus: "available",
      },
    },
    {
      id: "w-weak-2",
      subject: {
        skills: [{ uri: "y", evidence: "self_declared" }],
        country: "LT",
        availabilityStatus: "available",
      },
    },
  ];

  it("returns at most 3, strongest first, with a readiness band", () => {
    const top = explainTopMatches(need, candidates, 3);
    expect(top).toHaveLength(3);
    expect(top[0].subjectId).toBe("w-strong");
    expect(top[0].status).toBe("strong");
    expect(top[0].readiness).toBe("ready");
    // weakest of the three is a reject, never silently shown as a fit.
    expect(top[2].readiness).toBe("reject");
    // every explanation carries the real reasons/gaps from the engine.
    expect(top[0].result.reasons.length).toBeGreaterThan(0);
  });

  it("never returns more than the requested max", () => {
    expect(explainTopMatches(need, candidates, 1)).toHaveLength(1);
  });
});

describe("participation: meaningful actions only, never empty logins", () => {
  it("an empty login produces no reward", () => {
    expect(
      classifyParticipation({ action: "login", actor: "worker", improved: ["x"] }),
    ).toBeNull();
    expect(
      classifyParticipation({ action: "", actor: "worker", improved: ["x"] }),
    ).toBeNull();
  });

  it("a meaningful action with no real improvement is not rewarded", () => {
    expect(
      classifyParticipation({
        action: "worker_added_location",
        actor: "worker",
        improved: [],
      }),
    ).toBeNull();
  });

  it("a real improvement produces an honest private message (count only)", () => {
    const event = classifyParticipation({
      action: "worker_added_location",
      actor: "worker",
      improved: ["location", "availability"],
    });
    expect(event).not.toBeNull();
    const msg = buildPrivateProgressMessage(event!);
    expect(msg.code).toBe("marketRecognition.progress.worker");
    expect(msg.params?.count).toBe(2);
  });
});

describe("weekly digest: anonymized, aggregate-only", () => {
  it("builds lines from real counts and emits no line for a zero count", () => {
    const digest = buildWeeklyPublicDigest({
      workersBecameReady: 18,
      needsBecameClear: 7,
      projectsClarified: 0,
      topTradeSlugs: ["ship_carpenter", "welder"],
    });
    const codes = digest.lines.map((l) => l.code);
    expect(codes).toContain("marketRecognition.digest.workersReady");
    expect(codes).toContain("marketRecognition.digest.needsClear");
    expect(codes).not.toContain("marketRecognition.digest.projectsClarified");
    expect(codes).toContain("marketRecognition.digest.topTrades");
  });

  it("contains no person/company names (counts + slugs only)", () => {
    const digest = buildWeeklyPublicDigest({
      workersBecameReady: 3,
      needsBecameClear: 1,
      projectsClarified: 2,
      topTradeSlugs: ["welder"],
    });
    const blob = JSON.stringify(digest);
    // No "Firstname Lastname" style identity can appear — input has no names.
    expect(blob).not.toMatch(/[A-Z][a-z]+\s+[A-Z][a-z]+/);
    // Params only ever carry numbers or lowercase closed-set slugs.
    for (const line of digest.lines) {
      for (const v of Object.values(line.params ?? {})) {
        if (typeof v === "string") expect(v).toMatch(/^[a-z0-9_,\s]+$/);
      }
    }
  });
});

describe("copy: the recognition namespace leaks no forbidden public terms", () => {
  const messagesDir = join(__dirname, "..", "..", "..", "messages");
  // The owner goal additionally bans these user-facing words for this surface.
  const BANNED =
    /\b(demo|trial|beta|coming soon|owner review|manual approval|garantuoj|guarantee)\b/i;
  for (const loc of ["lt", "en", "ru"]) {
    it(`${loc}: marketRecognition copy is clean`, () => {
      const json = JSON.parse(
        readFileSync(join(messagesDir, `${loc}.json`), "utf8"),
      ) as Record<string, unknown>;
      const blob = JSON.stringify(json.marketRecognition ?? {});
      const m = blob.match(BANNED);
      expect(m, `forbidden term in ${loc}: ${m?.[0]}`).toBeNull();
    });
  }
});
