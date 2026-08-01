import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveAiRuntimeConfig } from "@/lib/ai/runtime/config-core";
import {
  ASSIST_PROJECT_STATUSES,
  EVIDENCE_REPORT_HREF,
  FINANCE_OVERDUE_HREF,
  buildAiProviderView,
  buildAttentionItems,
  buildProjectStatusRow,
  buildWorkerEvidenceSummary,
} from "@/lib/assist/assist-model";
import {
  getDashboardModule,
  getModuleRoute,
} from "@/lib/dashboard/dashboard-module-registry";
import { activeLocales } from "@/lib/i18n/config";
import { COMMAND_REGISTRY } from "@/lib/navigation/command-registry";
import {
  SPINE_SIGNALS,
  type SpineCounts,
} from "@/lib/notifications/spine-signals";
import { buildEvidenceReport } from "@/lib/reports/evidence-report";
import { PRIMARY_ROUTES } from "./primary-route-smoke";

/**
 * AI ASSISTANCE CENTRE guards (control room PR J, capability gap map §10).
 *
 * The slice ships ONE controlled assistance surface that is honest in every
 * provider state. These pins keep it that way:
 *
 *   - DETERMINISTIC ONLY: the assist layer (model + composition + page)
 *     never imports run-agent, the runtime run/provider modules or an LLM
 *     SDK — nothing on this surface can generate text. The only AI import
 *     is the existing config resolver, read for its honest state.
 *   - NO KEY, EVER: the provider view carries state/reason/provider/model
 *     only. No env read, no AI_API_KEY reference, no key-shaped field.
 *   - REAL ATTENTION: every "what needs my attention" row derives from a
 *     real count (spine / derived document expiry / derived finance
 *     overdue), has a real in-app href and names its data source.
 *   - SOURCES VISIBLE: the summaries render their source list; copy states
 *     the fixed-rule derivation; nothing implies a language model ran.
 *   - NO GENERATION UI: no prompt input, no chat, no forms, no
 *     confirm-writes — nothing is generated, so nothing can be accepted.
 *     Recorded gates (gap map §10): provider unconfigured in production
 *     (EXTERNAL_PROVIDER_GATED) + ai_runs/ai_suggestions audit store is an
 *     owner-gated migration. runAiAgent stays unwired until both close.
 *   - Registered everywhere a module must be: module registry, command
 *     registry, primary-route smoke, route truth map, i18n in every ACTIVE
 *     locale.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
/** Strip comments so the scans pin CODE, not the docstrings that honestly
 *  name the forbidden patterns. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const MODEL_REL = "lib/assist/assist-model.ts";
const READS_REL = "lib/assist/assist.ts";
const PAGE_REL = "app/[locale]/dashboard/assist/page.tsx";
const MODEL = read(MODEL_REL);
const READS = read(READS_REL);
const PAGE = read(PAGE_REL);
const ASSIST_LAYER: readonly [string, string][] = [
  [MODEL_REL, MODEL],
  [READS_REL, READS],
  [PAGE_REL, PAGE],
];

const ZERO: SpineCounts = {
  unreadConversations: 0,
  pendingIncomingServiceRequests: 0,
  serviceRequestResponsesNew: 0,
  pendingIncomingBookings: 0,
  bookingResponsesNew: 0,
  pendingInvitations: 0,
  openTaskAttention: 0,
  newJobMatches: 0,
};

const resolveKey = (msgs: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (node, k) =>
      node && typeof node === "object"
        ? (node as Record<string, unknown>)[k]
        : undefined,
    msgs,
  );

describe("1. deterministic only — the assist layer can never generate", () => {
  it("never imports run-agent, the runtime run/providers or an LLM SDK", () => {
    const forbidden =
      /(?:from\s*|import\s*\(\s*)["'](?:@anthropic-ai\/sdk|openai|@\/lib\/ai\/run-agent(?:-server)?|@\/lib\/ai\/runtime\/run(?:-core)?|@\/lib\/ai\/runtime\/providers(?:\/[^"']*)?|@\/lib\/ai\/provider|@\/lib\/ai\/noop-provider)["']/;
    for (const [rel, src] of ASSIST_LAYER) {
      expect(forbidden.test(src), `${rel} reaches a generation path`).toBe(
        false,
      );
    }
  });

  it("never calls runAiAgent / runAiCompletion (code, not prose)", () => {
    for (const [rel, src] of ASSIST_LAYER) {
      expect(code(src), rel).not.toMatch(/runAiAgent|runAiCompletion/);
    }
  });

  it("the ONLY ai imports are the config resolver (server) and pure config-core types (model)", () => {
    const aiImports = [...(MODEL + READS + PAGE).matchAll(
      /from\s*["'](@\/lib\/ai\/[^"']*)["']/g,
    )].map((m) => m[1]);
    expect(new Set(aiImports)).toEqual(
      new Set(["@/lib/ai/runtime/config-core", "@/lib/ai/runtime/config"]),
    );
    // The model imports the PURE core (types only); the server composition
    // uses the existing server wrapper.
    expect(MODEL).toMatch(/from "@\/lib\/ai\/runtime\/config-core"/);
    expect(READS).toMatch(/from "@\/lib\/ai\/runtime\/config"/);
  });

  it("read-only: no writes, no RPC, no outbound anywhere in the assist layer", () => {
    for (const [rel, src] of ASSIST_LAYER) {
      const c = code(src);
      expect(c, rel).not.toMatch(/\.insert\(/);
      expect(c, rel).not.toMatch(/\.update\(/);
      expect(c, rel).not.toMatch(/\.delete\(/);
      expect(c, rel).not.toMatch(/\.upsert\(/);
      expect(c, rel).not.toMatch(/\.rpc\(/);
      expect(c, rel).not.toMatch(/\bfetch\s*\(/);
      expect(c, rel).not.toMatch(
        /import[^;]*(nodemailer|twilio|sendgrid|mailgun|postmark|web-push|firebase|@sendgrid|telegram)/i,
      );
    }
  });

  it("no prompt input / no generation UI: server component with links only", () => {
    const c = code(PAGE);
    expect(c).not.toMatch(/"use client"/);
    expect(c).not.toMatch(/<form\b/);
    expect(c).not.toMatch(/<input\b/);
    expect(c).not.toMatch(/<textarea\b/);
    expect(c).not.toMatch(/<select\b/);
    expect(c).not.toMatch(/action=\{/);
    expect(c).not.toMatch(/contentEditable/i);
    expect(c).not.toMatch(/onChange|onSubmit|useState|useTransition/);
  });
});

describe("2. provider state comes from config-core only — never a key", () => {
  it("no env read and no key reference in the assist layer", () => {
    for (const [rel, src] of ASSIST_LAYER) {
      const c = code(src);
      expect(c, rel).not.toMatch(/process\.env/);
      expect(c, rel).not.toMatch(/AI_API_KEY/);
      expect(c, rel).not.toMatch(/apiKey|hasApiKey/);
      expect(c, rel).not.toMatch(/from "@\/lib\/env"/);
    }
  });

  it("OFF by default: the un-configured runtime maps to the honest disabled view", () => {
    const view = buildAiProviderView(
      resolveAiRuntimeConfig({
        mode: undefined,
        provider: undefined,
        apiKey: undefined,
        model: undefined,
        timeoutMs: undefined,
        maxRetries: undefined,
        maxOutputTokens: undefined,
        dailyRunBudget: undefined,
      }),
    );
    expect(view.state).toBe("disabled");
    expect(view.reason).toBe("mode_disabled");
    // Disabled claims nothing provider-shaped at all.
    expect(view.provider).toBeNull();
    expect(view.model).toBeNull();
  });

  it("live without a key stays disabled (missing_api_key) — never silently live", () => {
    const view = buildAiProviderView(
      resolveAiRuntimeConfig({
        mode: "live",
        provider: "anthropic",
        apiKey: "",
        model: undefined,
        timeoutMs: undefined,
        maxRetries: undefined,
        maxOutputTokens: undefined,
        dailyRunBudget: undefined,
      }),
    );
    expect(view.state).toBe("disabled");
    expect(view.reason).toBe("missing_api_key");
    expect(view.provider).toBeNull();
  });

  it("mock names no vendor; live names provider + model; the key VALUE never travels", () => {
    const mock = buildAiProviderView(
      resolveAiRuntimeConfig({
        mode: "mock",
        provider: undefined,
        apiKey: undefined,
        model: undefined,
        timeoutMs: undefined,
        maxRetries: undefined,
        maxOutputTokens: undefined,
        dailyRunBudget: undefined,
      }),
    );
    expect(mock.state).toBe("mock");
    expect(mock.provider).toBeNull();
    expect(mock.model).toBeNull();

    const fakeKey = "sk-ant-test1"; // short placeholder (test file)
    const live = buildAiProviderView(
      resolveAiRuntimeConfig({
        mode: "live",
        provider: "anthropic",
        apiKey: fakeKey,
        model: undefined,
        timeoutMs: undefined,
        maxRetries: undefined,
        maxOutputTokens: undefined,
        dailyRunBudget: undefined,
      }),
    );
    expect(live.state).toBe("live");
    expect(live.provider).toBe("anthropic");
    expect(typeof live.model).toBe("string");
    // No key-shaped field exists on the view and the value cannot leak.
    expect(Object.keys(live).sort()).toEqual(
      ["model", "provider", "reason", "state"].sort(),
    );
    expect(JSON.stringify(live)).not.toContain(fakeKey);
  });
});

describe("3. attention is a deterministic composition of real counts", () => {
  it("all-zero inputs → an empty answer (honest all-clear, nothing invented)", () => {
    expect(
      buildAttentionItems({ counts: ZERO, documents: null, finance: null }),
    ).toEqual([]);
    expect(
      buildAttentionItems({
        counts: ZERO,
        documents: { expiring: 0, missing: 0, reviewNeeded: 0 },
        finance: { overdueCount: 0 },
      }),
    ).toEqual([]);
  });

  it("spine rows mirror the catalogue exactly (same href, same count, bell copy)", () => {
    const counts: SpineCounts = {
      ...ZERO,
      unreadConversations: 2,
      pendingIncomingBookings: 3,
    };
    const items = buildAttentionItems({ counts, documents: null, finance: null });
    expect(items.map((i) => i.id)).toEqual([
      "spine-unread-messages",
      "spine-pending-bookings",
    ]);
    for (const item of items) {
      const signal = SPINE_SIGNALS.find((s) => `spine-${s.id}` === item.id)!;
      expect(item.href).toBe(signal.href);
      expect(item.count).toBe(signal.count(counts));
      expect(item.labelKey).toBe(`auth.notifications.types.${signal.type}`);
      expect(item.sourceKey).toBe("notificationSpine");
    }
  });

  it("document + finance rows derive from the real inputs with real hrefs", () => {
    const items = buildAttentionItems({
      counts: ZERO,
      documents: { expiring: 2, missing: 1, reviewNeeded: 3 },
      finance: { overdueCount: 4 },
    });
    expect(items.map((i) => i.id)).toEqual([
      "doc-expiring",
      "doc-missing",
      "doc-review",
      "finance-overdue",
    ]);
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("doc-expiring")!.href).toContain(
      "/dashboard/documents?status=expiring",
    );
    expect(byId.get("doc-missing")!.href).toContain(
      "/dashboard/documents?status=missing",
    );
    expect(byId.get("doc-review")!.href).toContain("/dashboard/documents");
    expect(byId.get("finance-overdue")!.href).toBe(FINANCE_OVERDUE_HREF);
    expect(FINANCE_OVERDUE_HREF).toBe("/dashboard/finance?status=overdue");
  });

  it("every possible attention row has a real in-app href and a positive count", () => {
    const items = buildAttentionItems({
      counts: {
        unreadConversations: 1,
        pendingIncomingServiceRequests: 1,
        serviceRequestResponsesNew: 1,
        pendingIncomingBookings: 1,
        bookingResponsesNew: 1,
        pendingInvitations: 1,
        openTaskAttention: 1,
        newJobMatches: 1,
      },
      documents: { expiring: 1, missing: 1, reviewNeeded: 1 },
      finance: { overdueCount: 1 },
    });
    // The complete answer: every spine signal + 3 document rows + 1 finance row.
    expect(items).toHaveLength(SPINE_SIGNALS.length + 4);
    for (const item of items) {
      expect(item.href.startsWith("/dashboard"), item.id).toBe(true);
      expect(item.count).toBeGreaterThan(0);
    }
  });

  for (const loc of activeLocales) {
    it(`${loc}: every attention label + source chip resolves`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      const items = buildAttentionItems({
        counts: {
          unreadConversations: 1,
          pendingIncomingServiceRequests: 1,
          serviceRequestResponsesNew: 1,
          pendingIncomingBookings: 1,
          bookingResponsesNew: 1,
          pendingInvitations: 1,
          openTaskAttention: 1,
          newJobMatches: 1,
        },
        documents: { expiring: 1, missing: 1, reviewNeeded: 1 },
        finance: { overdueCount: 1 },
      });
      for (const item of items) {
        for (const key of [
          item.labelKey,
          `assist.sources.${item.sourceKey}`,
          ...(item.moduleLabelKey ? [item.moduleLabelKey] : []),
        ]) {
          const v = resolveKey(msgs, key);
          expect(
            typeof v === "string" && v.trim().length > 0,
            `${loc}: ${item.id} key ${key}`,
          ).toBe(true);
        }
      }
    });
  }
});

describe("4. deterministic summaries carry their sources", () => {
  it("the worker summary lifts the evidence report's own numbers (never recomputed)", () => {
    const report = buildEvidenceReport({
      tierCounts: {
        self_declared: 2,
        work_supported: 3,
        manager_confirmed: 1,
        verified: 0,
      },
      supportedSkills: ["a", "b", "c"],
      unsupportedSkills: ["d", "e"],
      awaitingConfirmation: ["a"],
      journalEntries: 7,
      confirmations: 4,
      hasWorkNeedContext: false,
    });
    const summary = buildWorkerEvidenceSummary(report);
    expect(summary.totalSkills).toBe(6);
    expect(summary.workSupported).toBe(3);
    expect(summary.confirmed).toBe(1);
    expect(summary.journalEntries).toBe(7);
    expect(summary.confirmations).toBe(4);
    expect(summary.href).toBe(EVIDENCE_REPORT_HREF);
    expect(summary.sourceKeys.length).toBeGreaterThan(0);
  });

  it("project rows link the project's REAL operations centre and reuse the planning status copy", () => {
    const row = buildProjectStatusRow({
      id: "p-1",
      title: "Hall A",
      city: "Vilnius",
      status: "live",
      startDate: "2026-07-01",
      endDate: null,
      assignedCount: 5,
    });
    expect(row.href).toBe("/dashboard/projects/p-1/operations");
    expect(row.statusKey).toBe("planning.projectStatus.live");
    expect([...ASSIST_PROJECT_STATUSES]).toEqual(["draft", "live", "paused"]);
  });

  it("the page renders the visible source lists and the fixed-rule note", () => {
    expect(PAGE).toMatch(/assist-sources/);
    expect(PAGE).toMatch(/sources\.label/);
    expect(PAGE).toMatch(/t\("summaries\.note"\)/);
    expect(PAGE).toMatch(/t\("attention\.note"\)/);
    // Both summary variants attach sources.
    expect(PAGE).toMatch(/sourcesList\(view\.workerSummary\.sourceKeys/);
    expect(PAGE).toMatch(/sourcesList\(ORG_SUMMARY_SOURCE_KEYS/);
  });

  it("the composition reuses the existing reads (no second truth)", () => {
    expect(READS).toMatch(/from "@\/lib\/notifications\/spine"/);
    expect(READS).toMatch(/getSpineCounts\(\)/);
    expect(READS).toMatch(/from "@\/lib\/finance\/finance"/);
    expect(READS).toMatch(/getFinanceSummary/);
    expect(READS).toMatch(/from "@\/lib\/documents\/document-centre"/);
    expect(READS).toMatch(/getWorkerDocumentCentre/);
    expect(READS).toMatch(/buildVerifiedCv/);
    expect(READS).toMatch(/buildEvidenceReport/);
    // RLS-scoped server client only — never the admin client.
    expect(READS).not.toMatch(/supabase\/admin|createAdminClient|service_role/);
    expect(READS).toMatch(/\.limit\(ASSIST_PROJECT_READ_LIMIT\)/);
  });
});

describe("5. registered everywhere a module must be", () => {
  it("module registry: assist → /dashboard/assist, grid+command, ALL roles, sparkles icon, no badge", () => {
    const m = getDashboardModule("assist");
    expect(getModuleRoute("assist")).toBe("/dashboard/assist");
    expect(m.surfaces).toContain("grid");
    expect(m.surfaces).toContain("command");
    // Never a nav tab — the primary nav stays catalogue-derived.
    expect(m.surfaces).not.toContain("nav");
    expect([...m.roles].sort()).toEqual([
      "agency",
      "company",
      "customer",
      "worker",
    ]);
    expect(m.iconKey).toBe("sparkles");
    // The surface aggregates the spine itself — a badge would double-count.
    expect(m.attentionSignalIds).toBeUndefined();
  });

  // W3 Package 4 deleted the second dashboard's module grid (and its icon
  // map) — the registry iconKey pin above is the surviving icon contract.
  it("primary-route smoke inventory carries /dashboard/assist", () => {
    const entry = PRIMARY_ROUTES.find((r) => r.urlPattern === "/dashboard/assist");
    expect(entry).toBeTruthy();
    expect(entry!.sourceFile).toBe(PAGE_REL);
    expect(entry!.requiresAuth).toBe(true);
    expect(existsSync(join(ROOT, PAGE_REL))).toBe(true);
  });

  it("command registry: the assist entry resolves through getModuleRoute with 5-locale copy", () => {
    const entry = COMMAND_REGISTRY.find((e) => e.id === "assist");
    expect(entry).toBeTruthy();
    expect(entry!.route).toBe(getModuleRoute("assist"));
    expect(entry!.audience).toBe("public");
    for (const loc of activeLocales) {
      expect(entry!.labels[loc]?.trim().length, `label ${loc}`).toBeGreaterThan(0);
      expect(entry!.synonyms[loc]?.length, `synonyms ${loc}`).toBeGreaterThan(0);
    }
  });
});

describe("6. copy resolves in every ACTIVE locale and stays honest", () => {
  const STATIC_KEYS = [
    "assist.eyebrow",
    "assist.title",
    "assist.intro",
    "assist.attention.title",
    "assist.attention.note",
    "assist.attention.empty",
    "assist.attention.open",
    "assist.attention.docExpiring",
    "assist.attention.docMissing",
    "assist.attention.docReview",
    "assist.attention.financeOverdue",
    "assist.sources.label",
    "assist.sources.notificationSpine",
    "assist.sources.workerDocuments",
    "assist.sources.financeRecords",
    "assist.sources.workerSkills",
    "assist.sources.workJournal",
    "assist.sources.managerConfirmations",
    "assist.sources.projects",
    "assist.sources.assignments",
    "assist.summaries.title",
    "assist.summaries.note",
    "assist.summaries.none",
    "assist.summaries.worker.title",
    "assist.summaries.worker.totalSkills",
    "assist.summaries.worker.workSupported",
    "assist.summaries.worker.confirmed",
    "assist.summaries.worker.journalEntries",
    "assist.summaries.worker.confirmations",
    "assist.summaries.worker.link",
    "assist.summaries.org.title",
    "assist.summaries.org.teamSize",
    "assist.summaries.org.empty",
    "assist.summaries.org.error",
    "assist.summaries.org.link",
    "assist.provider.title",
    "assist.provider.stateLabel",
    "assist.provider.state.disabled",
    "assist.provider.state.mock",
    "assist.provider.state.live",
    "assist.provider.reason.ok",
    "assist.provider.reason.mode_disabled",
    "assist.provider.reason.unknown_provider",
    "assist.provider.reason.missing_api_key",
    "assist.provider.disabledBody",
    "assist.provider.whenEnabled",
    "assist.provider.gates",
    "assist.provider.providerLabel",
    "assist.provider.modelLabel",
    "assist.provider.notWired",
  ];

  for (const loc of activeLocales) {
    it(`${loc}: full assist catalogue`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as unknown;
      for (const key of STATIC_KEYS) {
        const v = resolveKey(msgs, key);
        expect(
          typeof v === "string" && v.trim().length > 0,
          `${loc}: ${key}`,
        ).toBe(true);
      }
    });
  }

  it("honest disabled copy: says no provider is connected; never claims an active AI", () => {
    const en = JSON.parse(read("messages/en.json")).assist;
    expect(en.provider.disabledBody).toMatch(/No external AI provider/i);
    expect(en.provider.gates).toMatch(/ai_runs/);
    expect(en.provider.gates).toMatch(/owner-gated migration/i);
    const blob = JSON.stringify(en);
    // The same active-AI-claim ban the provider-boundary guard enforces
    // repo-wide, pinned here on the assist namespace specifically.
    expect(blob).not.toMatch(
      /\bAI[- ]?(powered|generated|writes|matches|verifies|drafts your)\b|powered by AI/i,
    );
    // Nothing may imply generation already happened.
    expect(blob).not.toMatch(/generated for you|wrote this for you|AI wrote/i);
  });

  it("the page renders the honest provider card in both branches", () => {
    expect(PAGE).toMatch(/assist-provider/);
    expect(PAGE).toMatch(/t\("provider\.disabledBody"\)/);
    expect(PAGE).toMatch(/t\("provider\.whenEnabled"\)/);
    expect(PAGE).toMatch(/t\("provider\.gates"\)/);
    expect(PAGE).toMatch(/t\("provider\.notWired"\)/);
    expect(PAGE).toMatch(/t\(`provider\.reason\.\$\{view\.provider\.reason\}`\)/);
  });
});
