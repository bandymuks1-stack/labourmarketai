import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Profile = Work Card Source guard (slice profile-work-card-source, PR B).
 *
 * The worker profile must read as the SOURCE behind "Mano darbo kortelė" and
 * benefit-first — not a bureaucratic "complete your profile" form. Pins:
 *   - the hub is framed as the work-card source (benefit-first),
 *   - no profile-completion nagging / percentage / module wording,
 *   - the not-verified line stays an honest negation (no scary standalone
 *     "verification" card),
 *   - one primary CTA, and no standalone skill-verification card on profile.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const PROFILE_PAGE = "app/[locale]/dashboard/profile/page.tsx";

const hub = (j: Record<string, unknown>) => j.profileHub as Record<string, string>;
const skills = (j: Record<string, unknown>) =>
  j.skills as Record<string, string>;

describe("profile is framed as the work-card source, benefit-first", () => {
  it("LT hub + subtitle lead with what we already know, evidence- and employer-first", () => {
    // Human-first profile v1: the jargon eyebrow ("Mano darbo kortelės
    // šaltinis") and the literal work-card naming in the subtitle were
    // replaced with plain language. The source-behind-what-employers-see
    // framing now lives in lead (what we know) + explainer (employer
    // benefit) + subtitle (evidence).
    expect(hub(lt).eyebrow).toBeUndefined();
    expect(hub(lt).lead).toMatch(/jau žinome/i);
    expect(hub(lt).explainer).toMatch(/darbdav/i); // employer benefit
    expect(skills(lt).pageSubtitle).toMatch(/parody|įrody/i); // evidence framing
  });
  it("EN hub + subtitle mirror the same framing", () => {
    expect(hub(en).eyebrow).toBeUndefined();
    expect(hub(en).lead).toMatch(/already know/i);
    expect(hub(en).explainer).toMatch(/employer/i);
    expect(skills(en).pageSubtitle).toMatch(/prov|show/i); // evidence framing
  });
});

describe("no bureaucratic / completion-nagging wording", () => {
  for (const [name, j] of [["lt", lt], ["en", en]] as const) {
    it(`${name}: profileHub copy has no completion/percentage/module nagging`, () => {
      const blob = JSON.stringify(hub(j)) + " " + skills(j).pageSubtitle;
      expect(blob).not.toMatch(/profilio užbaigim|profile completion|\d+\s?%|\bmodulis\b|\bmodule\b/i);
      // The CTA is benefit-first, not "complete/finish your profile".
      expect(hub(j).primaryAction).not.toMatch(/užbaig|complete your|finish/i);
    });
  }
  it("notVerified is quiet and makes no fake verified claim (disclaimer removed)", () => {
    // Quiet-UI reframe (fix/cv): the "not yet verified" disclaimer was removed.
    expect(hub(lt).notVerified).not.toMatch(/\bpatvirtinta\b/i);
    expect(hub(en).notVerified).not.toMatch(/\bverified\b/i);
  });
});

describe("profile first screen stays focused", () => {
  const page = read(PROFILE_PAGE);
  it("mounts the hub overview", () => {
    expect(page).toMatch(/<ProfileHubOverview\b/);
  });
  it("has at most one primary gradient CTA on the page", () => {
    const n = (page.match(/from-brand-blue to-brand-cyan|variant="primary"/g) ?? []).length;
    expect(n).toBeLessThanOrEqual(1);
  });
  it("renders no standalone skill-verification card", () => {
    expect(page).not.toMatch(/Įgūdžių patvirtinim/i);
    expect(page).not.toMatch(/Skill verification/i);
    // the removed duplicate panels stay removed
    expect(page).not.toMatch(/<ProfileCvClarityCard\b|<WorkerEvidenceCard\b|<ProfileProcessAssistant\b/);
  });
});
