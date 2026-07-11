import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getDashboardModule,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import {
  DOC_CENTRE_INVENTORY_ANCHOR,
  DOC_CENTRE_VERIFICATION_READ_LIMIT,
  DOCUMENT_STATUS_FILTERS,
  DOCUMENT_VERIFICATION_STATES,
  deriveDocumentAttention,
  filterCentreDocuments,
  inventoryHref,
  parseInventoryFilters,
  summarizeOrgDocsAggregates,
  type CentreDocumentRow,
} from "@/lib/documents/document-centre-model";
import { PRIMARY_ROUTES } from "./primary-route-smoke";
import { activeLocales } from "@/lib/i18n/config";

/**
 * DOCUMENT & WORK-PROOF CENTRE guards (control room PR H, gap map §8).
 *
 * The centre CONSOLIDATES the existing document/evidence axes on the
 * existing /dashboard/documents route — composition only. These pins keep
 * it honest:
 *
 *   - COMPOSITION-ONLY: the centre reuses the existing readiness read layer
 *     (lib/documents/readiness.ts); its only direct table reads are tables
 *     existing libs already read (workers / worker_documents /
 *     journal_entries / journal_entry_photos), bounded; the ONLY rpc is the
 *     applied s6 consent aggregate; never the admin client, never a write,
 *     never storage access, never outbound.
 *   - NO SECOND STORE / NO UPLOAD: no new table or bucket is referenced and
 *     no file-upload UI exists while the worker-documents bucket is absent
 *     (gap map §8 — migration-gated); the page says so honestly.
 *   - REAL-FIELD ATTENTION ONLY: expiring/missing come from the derived
 *     valid_until status; review-needed from the stored verification enum;
 *     an unreadable verification axis contributes NOTHING.
 *   - VERBATIM ENUMS: stored statuses and verification states pass through
 *     unchanged; the page renders them via their enum-keyed i18n labels.
 *   - HONEST DEGRADATION per source + the DOCUMENTS_READINESS_ENABLED
 *     preparing gate stays; work-proof discovery ships around it.
 *   - REAL LINKS ONLY + registered module/command wiring + active-locale copy.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const MODEL = read("lib/documents/document-centre-model.ts");
const COMPOSE = read("lib/documents/document-centre.ts");
const PAGE_REL = "app/[locale]/dashboard/documents/page.tsx";
const PAGE = read(PAGE_REL);
const CENTRE_LAYER = [MODEL, COMPOSE, PAGE];

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function row(over: Partial<CentreDocumentRow> & { id: string }): CentreDocumentRow {
  return {
    documentTypeSlug: "identity_document",
    country: null,
    validUntil: null,
    derivedStatus: "ready",
    verification: null,
    ...over,
  };
}

describe("1. composition-only: existing reads, nothing new, nothing privileged", () => {
  it("reuses the existing readiness read layer (no duplicated inventory query)", () => {
    expect(COMPOSE).toMatch(/from "@\/lib\/documents\/readiness"/);
    expect(COMPOSE).toMatch(/listMyDocuments\(\)/);
    expect(COMPOSE).toMatch(/deriveDocumentStatus/);
  });

  it("direct table reads only on tables existing libs already read, bounded", () => {
    const froms = [...COMPOSE.matchAll(/\.from\("([a-z0-9_-]+)"\)/g)].map(
      (m) => m[1],
    );
    // workers               — read by lib/documents/readiness.ts
    // worker_documents      — read by lib/documents/readiness.ts (verification
    //                         axis column added 20260613100200, degradable)
    // journal_entries(+photos) — read by lib/journal/project-gallery.ts
    expect(new Set(froms)).toEqual(
      new Set(["workers", "worker_documents", "journal_entries", "journal_entry_photos"]),
    );
    expect(COMPOSE).toMatch(/\.limit\(DOC_CENTRE_VERIFICATION_READ_LIMIT\)/);
    expect(DOC_CENTRE_VERIFICATION_READ_LIMIT).toBeLessThanOrEqual(200);
    // Work-proof counts are HEAD counts — no row transfer.
    expect(COMPOSE).toMatch(/head: true/);
    // The pure model touches no table; the page keeps only its role read.
    expect(MODEL).not.toMatch(/\.from\(/);
    expect(PAGE).not.toMatch(/\.from\("(?!profiles")/);
  });

  it("the ONLY rpc is the applied s6 consent-gated aggregate", () => {
    const rpcs = [...COMPOSE.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)].map(
      (m) => m[1],
    );
    expect(rpcs).toEqual(["agency_pool_docs_readiness"]);
    expect(MODEL).not.toMatch(/\.rpc\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
  });

  it("uses the caller-scoped server client, never the admin client", () => {
    expect(COMPOSE).toMatch(/from "@\/lib\/supabase\/server"/);
    for (const src of CENTRE_LAYER.map(stripComments)) {
      expect(src).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    }
  });

  it("read-only: no write verb anywhere in the centre layer", () => {
    for (const src of [MODEL, COMPOSE, PAGE]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("no storage access at all (no bucket read/write, no signed URLs)", () => {
    for (const src of CENTRE_LAYER.map(stripComments)) {
      expect(src).not.toMatch(/\.storage\b/);
      expect(src).not.toMatch(/createSignedUrl|\.upload\(/);
    }
  });

  it("no external transport — the centre contacts nobody", () => {
    for (const src of CENTRE_LAYER) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
  });
});

describe("2. no second store, no bucket, no upload UI (bucket stays migration-gated)", () => {
  it("no worker-documents bucket literal and no bucket creation anywhere in the layer", () => {
    for (const src of CENTRE_LAYER.map(stripComments)) {
      expect(src).not.toMatch(/worker-documents/);
      expect(src).not.toMatch(/createBucket|storage\.buckets/);
    }
  });

  it("no file input and no upload control on the page", () => {
    const code = stripComments(PAGE);
    expect(code).not.toMatch(/type="file"/);
    expect(code).not.toMatch(/<input\b/i);
    expect(code).not.toMatch(/FileUpload|Dropzone|uppy/i);
  });

  it("the page states the metadata-only truth instead", () => {
    expect(PAGE).toMatch(/doc-centre-upload-note/);
    expect(PAGE).toMatch(/tc\("uploadNote"\)/);
    const en = JSON.parse(read("messages/en.json")).documentCentre as {
      uploadNote: string;
    };
    expect(en.uploadNote).toMatch(/file upload is not available yet/i);
    expect(en.uploadNote).toMatch(/metadata/i);
  });
});

describe("3. attention derives ONLY from the real fields", () => {
  it("expiring/missing from the derived valid_until status; review from verification pending/rejected", () => {
    const rows = [
      row({ id: "a", derivedStatus: "expiring" }),
      row({ id: "b", derivedStatus: "missing" }),
      row({ id: "c", derivedStatus: "ready", verification: "pending" }),
      row({ id: "d", derivedStatus: "ready", verification: "rejected" }),
      row({ id: "e", derivedStatus: "ready", verification: "verified" }),
      row({ id: "f", derivedStatus: "blocked", verification: "unverified" }),
    ];
    expect(deriveDocumentAttention(rows)).toEqual({
      expiring: 1,
      missing: 1,
      reviewNeeded: 2,
    });
  });

  it("an unreadable verification axis (null) contributes NOTHING review-shaped", () => {
    const rows = [
      row({ id: "a", verification: null }),
      row({ id: "b", verification: null, derivedStatus: "expiring" }),
    ];
    expect(deriveDocumentAttention(rows).reviewNeeded).toBe(0);
  });

  it("no rows → all zeros; nothing is ever invented", () => {
    expect(deriveDocumentAttention([])).toEqual({
      expiring: 0,
      missing: 0,
      reviewNeeded: 0,
    });
  });

  it("no invented urgency vocabulary in the model (facts, not a score — §19)", () => {
    const code = stripComments(MODEL);
    expect(code).not.toMatch(/urgen|riskScore|priorityScore|\brank(ing)?\b/i);
  });

  it("a rejected-verification row missing from the bounded read carries null — never a defaulted state", () => {
    // The composition maps map-misses to null (see document-centre.ts) —
    // pinned here at the source-code level because the map is IO-fed.
    expect(COMPOSE).toMatch(/verification\?\.get\(d\.id\) \?\? null/);
  });
});

describe("4. enums pass through VERBATIM", () => {
  it("the model's enum sets ARE the database enums", () => {
    expect([...DOCUMENT_VERIFICATION_STATES]).toEqual([
      "unverified",
      "pending",
      "verified",
      "rejected",
    ]);
    expect([...DOCUMENT_STATUS_FILTERS]).toEqual([
      "missing",
      "ready",
      "expiring",
      "blocked",
    ]);
  });

  it("the page renders statuses and verification via their enum-keyed labels", () => {
    expect(PAGE).toMatch(/t\(`status\.\$\{d\.derivedStatus\}` as never\)/);
    expect(PAGE).toMatch(/tc\(`verification\.\$\{d\.verification\}`\)/);
    // Verification is shown ONLY when the axis is really readable.
    expect(PAGE).toMatch(/inv\.verificationAvailable && d\.verification/);
  });

  it("filters validate against the real value sets and never error", () => {
    const types = ["identity_document", "a1_certificate"];
    expect(parseInventoryFilters({}, types)).toEqual({ type: null, status: null });
    expect(
      parseInventoryFilters({ type: "identity_document", status: "expiring" }, types),
    ).toEqual({ type: "identity_document", status: "expiring" });
    // Unknown values silently mean "no filter" — never a crash surface.
    expect(
      parseInventoryFilters({ type: "nope", status: "verified" }, types),
    ).toEqual({ type: null, status: null });
  });

  it("filtering is a pure subset — no row is ever transformed", () => {
    const rows = [
      row({ id: "a", documentTypeSlug: "x", derivedStatus: "ready" }),
      row({ id: "b", documentTypeSlug: "x", derivedStatus: "missing" }),
      row({ id: "c", documentTypeSlug: "y", derivedStatus: "missing" }),
    ];
    expect(filterCentreDocuments(rows, { type: null, status: null })).toEqual(rows);
    expect(
      filterCentreDocuments(rows, { type: "x", status: "missing" }).map((r) => r.id),
    ).toEqual(["b"]);
    expect(filterCentreDocuments(rows, { type: "z", status: null })).toEqual([]);
  });

  it("org aggregates are plain sums of the RPC's count rows", () => {
    expect(
      summarizeOrgDocsAggregates([
        { workerId: "w1", docsTotal: 3, docsValid: 2, docsExpiring: 1, docsAttention: 0 },
        { workerId: "w2", docsTotal: 1, docsValid: 0, docsExpiring: 0, docsAttention: 1 },
      ]),
    ).toEqual({ workers: 2, total: 4, valid: 2, expiring: 1, attention: 1 });
    expect(summarizeOrgDocsAggregates([])).toEqual({
      workers: 0,
      total: 0,
      valid: 0,
      expiring: 0,
      attention: 0,
    });
  });
});

describe("5. real links only — every destination exists on disk", () => {
  it("attention chips resolve into the inventory section anchor", () => {
    expect(inventoryHref({ status: "expiring" })).toBe(
      `/dashboard/documents?status=expiring${DOC_CENTRE_INVENTORY_ANCHOR}`,
    );
    expect(inventoryHref({ country: "NL", type: "a1_certificate" })).toBe(
      `/dashboard/documents?country=NL&type=a1_certificate${DOC_CENTRE_INVENTORY_ANCHOR}`,
    );
    expect(PAGE).toMatch(/DOC_CENTRE_INVENTORY_ANCHOR\.slice\(1\)/);
    expect(PAGE).toMatch(/doc-centre-attention/);
  });

  it("work-proof cards link the REAL existing surfaces (no duplicate report system)", () => {
    expect(PAGE).toMatch(/"\/cv"/);
    expect(PAGE).toMatch(/"\/dashboard\/reports\/evidence"/);
    expect(PAGE).toMatch(/journal\/export/);
    expect(PAGE).toMatch(/"\/dashboard\/journal"/);
    for (const rel of [
      ["app", "[locale]", "cv", "page.tsx"],
      ["app", "[locale]", "dashboard", "reports", "evidence", "page.tsx"],
      ["app", "[locale]", "dashboard", "journal", "page.tsx"],
      ["app", "[locale]", "dashboard", "journal", "export", "route.ts"],
      ["app", "[locale]", "dashboard", "projects", "page.tsx"],
    ]) {
      expect(existsSync(join(ROOT, ...rel)), rel.join("/")).toBe(true);
    }
  });

  it("journal proof counts are real head counts or an honest 'unavailable' — never a fake zero", () => {
    expect(COMPOSE).toMatch(/journalEntryCount: number \| null/);
    expect(PAGE).toMatch(/countsUnavailable/);
    expect(PAGE).toMatch(/doc-centre-journal-proof/);
  });

  it("gallery/CV/evidence surfaces are LINKED, not re-rendered (no duplication)", () => {
    expect(PAGE).toMatch(/doc-centre-gallery-note/);
    expect(PAGE).not.toMatch(/getProjectGallery|buildVerifiedCv|buildEvidenceReport/);
  });
});

describe("6. honest degradation per source + the preparing gate stays", () => {
  it("the readiness read keeps its needs-migration / no-worker / error states", () => {
    expect(PAGE).toMatch(/inv\.kind === "needs-migration"/);
    expect(PAGE).toMatch(/t\("needsMigration"\)/);
    expect(PAGE).toMatch(/inv\.kind === "no-worker"/);
  });

  it("the DOCUMENTS_READINESS_ENABLED preparing gate STAYS and the work-proof discovery ships around it", () => {
    expect(PAGE).toMatch(/if \(!DOCUMENTS_READINESS_ENABLED\)/);
    expect(PAGE).toMatch(/documents-preparing/);
    // The preparing branch still carries the real work-proof exports.
    const preparing = PAGE.slice(
      PAGE.indexOf("if (!DOCUMENTS_READINESS_ENABLED)"),
      PAGE.indexOf('const sp = await searchParams'),
    );
    expect(preparing).toMatch(/WorkProofExports/);
  });

  it("org sessions get ONLY the consent aggregates or an honest note — never rows", () => {
    expect(PAGE).toMatch(/doc-centre-org-unavailable/);
    expect(PAGE).toMatch(/doc-centre-org-empty/);
    expect(PAGE).toMatch(/doc-centre-org-project-link/);
    // The org branch renders no document list and no verification badges.
    const orgBranch = PAGE.slice(
      PAGE.indexOf("ORG_ROLES.has(activeRole)"),
      PAGE.indexOf("const centre = await getWorkerDocumentCentre()"),
    );
    expect(orgBranch).not.toMatch(/documents-list|doc-centre-verification/);
  });

  it("the verification axis degrades independently (null map → no claim)", () => {
    expect(COMPOSE).toMatch(/readVerificationByDocument/);
    expect(COMPOSE).toMatch(/if \(error\) return null/);
    expect(COMPOSE).toMatch(/verificationAvailable: verification !== null/);
  });
});

describe("7. registered everywhere a module must be", () => {
  it("module registry: documents → /dashboard/documents for all roles (unchanged door)", () => {
    const m = getDashboardModule("documents");
    expect(getModuleRoute("documents")).toBe("/dashboard/documents");
    expect(m.surfaces).toContain("grid");
    expect(m.surfaces).toContain("command");
    expect([...m.roles].sort()).toEqual(
      ["agency", "company", "customer", "worker"].sort(),
    );
  });

  it("command registry: the documents entry resolves through getModuleRoute and carries work-proof synonyms", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "documents");
    expect(entry).toBeTruthy();
    expect(entry!.route).toBe(getModuleRoute("documents"));
    expect(entry!.synonyms?.en).toContain("work proof");
    expect(entry!.synonyms?.lt).toContain("darbo įrodymai");
    for (const loc of activeLocales) {
      expect(entry!.labels[loc]?.trim().length, `label ${loc}`).toBeGreaterThan(0);
      expect(
        (entry!.synonyms?.[loc] ?? []).length,
        `synonyms ${loc}`,
      ).toBeGreaterThan(0);
    }
  });

  it("primary-route smoke inventory carries /dashboard/documents", () => {
    const entry = PRIMARY_ROUTES.find(
      (r) => r.urlPattern === "/dashboard/documents",
    );
    expect(entry).toBeTruthy();
    expect(entry!.sourceFile).toBe(PAGE_REL);
    expect(entry!.requiresAuth).toBe(true);
  });

  it("server component — no client state, keyboard-reachable filter links", () => {
    const code = stripComments(PAGE);
    expect(code).not.toMatch(/"use client"/);
    expect(code).not.toMatch(/useState|useEffect|useTransition/);
    // Filters/attention are plain links with a visible focus ring.
    expect(PAGE).toMatch(/focus-visible:ring-2/);
    expect(PAGE).toMatch(/doc-centre-filter-status-/);
  });
});

describe("8. copy resolves in every ACTIVE locale (frozen-subset convention)", () => {
  const resolve = (msgs: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, k) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[k]
          : undefined,
      msgs,
    );

  const KEYS = [
    "documentCentre.attention.title",
    "documentCentre.attention.empty",
    "documentCentre.attention.note",
    "documentCentre.attention.expiring",
    "documentCentre.attention.missing",
    "documentCentre.attention.reviewNeeded",
    "documentCentre.filters.statusLabel",
    "documentCentre.filters.typeLabel",
    "documentCentre.filters.all",
    "documentCentre.filters.noMatches",
    "documentCentre.verification.unverified",
    "documentCentre.verification.pending",
    "documentCentre.verification.verified",
    "documentCentre.verification.rejected",
    "documentCentre.workProof.title",
    "documentCentre.workProof.journalTitle",
    "documentCentre.workProof.journalCounts",
    "documentCentre.workProof.countsUnavailable",
    "documentCentre.workProof.galleryNote",
    "documentCentre.uploadNote",
    "documentCentre.org.title",
    "documentCentre.org.intro",
    "documentCentre.org.workersLabel",
    "documentCentre.org.totalLabel",
    "documentCentre.org.validLabel",
    "documentCentre.org.expiringLabel",
    "documentCentre.org.attentionLabel",
    "documentCentre.org.consentNote",
    "documentCentre.org.noConsented",
    "documentCentre.org.unavailable",
    "documentCentre.org.projectAxisLink",
    "documentCentre.org.projectAxisNote",
  ];

  for (const loc of activeLocales) {
    it(`${loc}: full document-centre catalogue`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of KEYS) {
        const v = resolve(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
      }
    });
  }

  it("attention chips carry the REAL count placeholder in every active locale", () => {
    for (const loc of activeLocales) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        documentCentre: { attention: Record<string, string>; workProof: Record<string, string> };
      };
      for (const key of ["expiring", "missing", "reviewNeeded"]) {
        expect(msgs.documentCentre.attention[key], `${loc}: ${key}`).toContain("{n}");
      }
      expect(msgs.documentCentre.workProof.journalCounts).toContain("{entries}");
      expect(msgs.documentCentre.workProof.journalCounts).toContain("{photos}");
    }
  });

  it("the copy never claims verification where none exists (no 'AI-verified', no guarantees)", () => {
    for (const loc of activeLocales) {
      const blob = JSON.stringify(
        JSON.parse(read(`messages/${loc}.json`)).documentCentre,
      ).toLowerCase();
      expect(blob).not.toMatch(/ai[- ]verified|guarantee|garantij|garantie|гарант/);
    }
  });
});
