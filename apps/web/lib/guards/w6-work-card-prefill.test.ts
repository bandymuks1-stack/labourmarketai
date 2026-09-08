import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 — the work-card form opens PREFILLED from the current card (measured on
 * production, #1579: the plain chips "Kur nori dirbti?" / "Nurodyti, kada
 * galiu dirbti" opened `worker.save-work-card` EMPTY, and `preferred_countries`
 * is saved as a whole list, so a person adding one country replaced the
 * others). Structural pins: the source is read, not executed.
 */
const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("the ONE form opener prefills the work card from the canonical snapshot", () => {
  const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
  const server = read("lib", "conversation", "criteria-summary.ts");
  const activity = read("lib", "conversation", "worker-activity.ts");

  it("openForm reads the current card for worker.save-work-card and lays the caller's prefill OVER it", () => {
    expect(chat).toMatch(/import \{ loadCriteriaSummaryForChat, loadWorkCardPrefillForChat \} from "@\/lib\/conversation\/criteria-summary";/);
    expect(chat).toMatch(
      /if \(actionId === "worker\.save-work-card"\) \{\s*loadWorkCardPrefillForChat\(\)\s*\.then\(\(r\) => render\(\{ \.\.\.\(r\.kind === "prefill" \? r\.values : \{\}\), \.\.\.\(initialValues \?\? \{\}\) \}\)\)\s*\.catch\(\(\) => render\(initialValues\)\);\s*return;/,
    );
    // The chip path and the sentence path both go through openForm — no
    // second opener may bypass the prefill.
    expect(chat.match(/<InlineActionForm/g)?.length, "exactly one InlineActionForm render site").toBe(1);
  });

  it("the prefill read is the ONE canonical worker snapshot, mapped by the pure form mapper", () => {
    expect(server).toMatch(/export async function loadWorkCardPrefillForChat\(\): Promise<WorkCardPrefillResult>/);
    expect(server).toMatch(/const snapshot = await getWorkerCriteriaSnapshot\(user\.id\);\s*if \(!snapshot\) return \{ kind: "unavailable", reason: "no_worker" \};\s*return \{ kind: "prefill", values: workCardPrefillFromCard\(snapshot\) \};/);
    expect(server).not.toMatch(/\.from\(["']workers["']/);
    // The snapshot now carries the location country the form edits.
    expect(activity).toMatch(/current_location_country/);
    expect(activity).toMatch(/locationCountry: \(worker\.current_location_country as string \| null\) \?\? null,/);
  });

  it("the chips that open the work card carry no prefill of their own that the snapshot would not (the #1579 chip lays its list over it)", () => {
    const wf = read("lib", "ai-workspace", "workflows.ts");
    expect(wf).toContain('chips.push({ id: "f:worker.save-work-card", label: t("chipWhereToWork") });');
    expect(wf).toContain("f:worker.save-work-card?preferredCountries=${country.nextCountries.join(\",\")}");
  });
});

describe("the save merges: omitted keeps, only an explicit [] clears", () => {
  it("form: a blank country field is undefined, never []", () => {
    const forms = read("lib", "conversation", "worker-forms.ts");
    expect(forms).toMatch(/\.filter\(\(c\) => c\.length === 2\)\s*: undefined,/);
    expect(forms).not.toMatch(/\.filter\(\(c\) => c\.length === 2\)\s*: \[\],/);
  });
  it("executor: the clear flag rides only with an explicit empty list", () => {
    const exec = read("lib", "conversation", "worker-executors.ts");
    expect(exec).toMatch(/const clearCountries =\s*input\.preferredCountries !== undefined && input\.preferredCountries\.length === 0;/);
    expect(exec).toMatch(/preferred_countries_clear: clearCountries \? "1" : undefined,/);
  });
  it("action + core: the flag is the only empty-list path; the RPC stays the coalescing save_worker_card", () => {
    const actions = read("lib", "worker", "work-card-actions.ts");
    expect(actions).toMatch(/String\(formData\.get\("preferred_countries_clear"\) \?\? ""\) === "1"\s*\? \[\]\s*: parseCountries\(formData\.get\("preferred_countries"\)\),/);
    const core = read("lib", "worker", "work-card-core.ts");
    expect(core).toMatch(/if \(!raw\) return null;\s*if \(raw\.length === 0\) return \[\];/);
    expect(core).toMatch(/\.rpc\("save_worker_card"/);
    const migration = readFileSync(join(WEB, "..", "..", "supabase", "migrations", "20260608120000_worker_work_card.sql"), "utf8");
    expect(migration).toMatch(/preferred_countries\s*=\s*coalesce\(p_preferred_countries, preferred_countries\)/);
  });
});
