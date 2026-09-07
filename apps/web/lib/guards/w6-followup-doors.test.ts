import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Window 6 follow-up doors (production ca96605b, measured 2026-09-06). Each
 * pin names a dead end a real person hit and the EXISTING door the answer
 * now offers. Structural: the source is read, not executed, so the pins hold
 * without a browser.
 */
const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("A1 — a country the person has not chosen is answered with doors, honestly", () => {
  const wf = read("lib", "ai-workspace", "workflows.ts");
  const reads = read("lib", "conversation", "country-next-steps-server.ts");
  it("the missed-country branch offers the work card (prefilled with ALL countries) and the documents gap", () => {
    expect(wf).toContain('import { loadUnchosenCountryNextSteps } from "@/lib/conversation/country-next-steps-server";');
    expect(wf).toContain("f:worker.save-work-card?preferredCountries=${country.nextCountries.join(\",\")}");
    expect(wf).toContain('{ id: "documents-gap", label: t("chipDocsGap") }');
    // The list REPLACES on save, so the current countries ride along.
    expect(reads).toMatch(/const nextCountries = current\.includes\(upper\) \? current : \[\.\.\.current, upper\];/);
  });
  it("the public-ads claim comes from the ONE bounded indexed read, and a failed read is `unknown`, never `no`", () => {
    expect(reads).toContain('import { readSupplyLastRefreshedAt } from "@/lib/vacancy-store/vacancy-read";');
    expect(reads).toMatch(/if \(read\.status === "ok"\) supply = read\.lastRefreshedAt \? "yes" : "no";/);
    expect(reads).toMatch(/catch \{\s*supply = "unknown";/);
    expect(reads).not.toMatch(/count\(\*\)|\.select\(|\.from\(/);
    // The workflow module itself stays free of any client (W4 guard).
    expect(wf).not.toMatch(/createClient|supabase/);
    for (const key of ["countryNotChosenListings", "countryNotChosenNoListings", "countryNotChosenSupplyUnknown", "countryNotChosenDoors"]) {
      expect(wf).toContain(`t("${key}")`);
    }
  });
  it("a `f:` chip may carry prefill, parsed by the ONE form opener", () => {
    const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
    expect(chat).toMatch(/const \[formAction, query\] = chip\.id\.slice\(2\)\.split\("\?"\);/);
    expect(chat).toMatch(/case "documents-gap":[\s\S]{0,600}runWorkflow\(\(\) => runDocumentsReadiness\(\)\)/);
  });
});

describe("A2 — the journal request never becomes the journal entry", () => {
  const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
  const flow = read("components", "app", "conversation", "worker-worklog-flow.tsx");
  const schema = read("lib", "conversation", "worker-schemas.ts");
  it("the chat opens the flow with EMPTY evidence for a request sentence and asks what was done", () => {
    const fn = chat.slice(chat.indexOf("const startWorkLog = useCallback("), chat.indexOf("* Voice hand-off"));
    expect(fn).toContain("const readiness = journalDraftReadiness(text);");
    expect(fn).toMatch(/draft=\{carriesWork \? draft : \{ \.\.\.draft, notes: "" \}\}/);
    expect(fn).toContain('assistant(t("journalAskWhatYouDid"))');
  });
  it("the flow refuses to confirm evidence with no work content", () => {
    expect(flow).toMatch(/if \(journalDraftReadiness\(notes\) !== "ok"\) \{\s*setPhase\(\{ kind: "error", message: labels\.errorNoWorkContent \}\);/);
  });
  it("the server schema is the floor", () => {
    expect(schema).toMatch(/\.refine\(\(v\) => !isJournalMetaRequest\(v\), \{ message: "journal_meta_request" \}\)/);
  });
});

describe("A3 — availability is registered and opens the ONE work-card form with the date", () => {
  const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
  const registry = read("lib", "conversation", "intent-registry.ts");
  it("registry row + handler", () => {
    expect(registry).toMatch(/availability: \{ domain: "profile", access: "write", handler: "availabilityStatement"/);
    const handler = chat.slice(chat.indexOf("availabilityStatement: () => {"), chat.indexOf("skillGap: () =>"));
    expect(handler).toContain("const from = parseStartDate(text, todayIso());");
    expect(handler).toMatch(/openForm\("worker\.save-work-card", undefined, undefined, \{\s*availabilityStatus: "available",/);
    expect(handler).not.toMatch(/dispatch|execute|\.from\(/);
  });
});

describe("G1 — the company context never runs the person's job search", () => {
  const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
  it("one line + the personal-space chip, before any search", () => {
    const handler = chat.slice(chat.indexOf("findWork: () => runWorkflow(async () => {"), chat.indexOf("professionStatement: () => {"));
    const guard = handler.indexOf('if (identity === "company") {');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(handler.indexOf("return runFindWork(text, goalRef.current?.filters);"));
    expect(handler).toContain('t("findWorkInCompanyContext")');
    expect(handler).toContain('explanation: { why: t("findWorkInCompanyWhy") }');
    expect(handler).toMatch(/id: `ws:\$\{personal\.id\}`, label: t\("workspacePersonal"\)/);
  });
});

describe("every locale carries the follow-up copy", () => {
  const locales = readdirSync(join(WEB, "messages")).filter((f) => f.endsWith(".json"));
  it("11 locales, every key, placeholders intact", () => {
    expect(locales.length).toBeGreaterThanOrEqual(11);
    for (const file of locales) {
      const json = JSON.parse(read("messages", file)) as {
        conversation: {
          chat: { availability?: Record<string, string>; findWorkInCompanyContext?: string; journalAskWhatYouDid?: string };
          worklog: { errorNoWorkContent?: string };
          forms: { fields: { availableFrom?: string } };
        };
        workspace: { ai: Record<string, string> };
      };
      const chat = json.conversation.chat as typeof json.conversation.chat & { findWorkInCompanyWhy?: string };
      expect(typeof chat.findWorkInCompanyContext, file).toBe("string");
      expect(typeof chat.findWorkInCompanyWhy, file).toBe("string");
      expect(typeof chat.journalAskWhatYouDid, file).toBe("string");
      for (const k of ["understood", "understoodFrom", "notInCompany"]) {
        expect(typeof chat.availability?.[k], `${file}: availability.${k}`).toBe("string");
      }
      expect(chat.availability?.understoodFrom).toContain("{date}");
      expect(typeof json.conversation.worklog.errorNoWorkContent, file).toBe("string");
      expect(typeof json.conversation.forms.fields.availableFrom, file).toBe("string");
      for (const k of ["countryNotChosenListings", "countryNotChosenNoListings", "countryNotChosenSupplyUnknown", "countryNotChosenDoors", "chipAddCountry", "chipDocsGap"]) {
        expect(typeof json.workspace.ai[k], `${file}: workspace.ai.${k}`).toBe("string");
      }
    }
  });
});
