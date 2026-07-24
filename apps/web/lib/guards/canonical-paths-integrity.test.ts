import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for Canonical Paths + Duplicate-Flow integrity v1.
 *
 * Product doctrine for this sprint: "one clear output point, many hidden
 * inputs". This guard pins three honesty/consolidation invariants that were
 * easy to regress:
 *
 *  1. ACCOUNT ROLE STATUS — ONE vocabulary, admin never "Ruošiama".
 *     The /dashboard/account role list must read its status chip from the
 *     single source `roleStatusChipKey` (the SAME chips the role catalogue
 *     renders) — never a second blanket "preview_workspace"/RUOŠIAMA tag. And
 *     because the admin UI toggle (admin entry point) is rendered on the same
 *     page, `admin` — a permission grant, not a preparing workspace — must be
 *     special-cased so it is never labelled "Ruošiama".
 *
 *  2. ONE canonical CV upload surface. CV file-pick UI (a pdf/docx `accept=`
 *     input) may live ONLY in the allowlisted CV primitives, and those
 *     primitives may be mounted ONLY inside the canonical profile flow (or the
 *     dev-only design catalogue). A NEW, parallel CV upload entry point fails
 *     here instead of silently shipping a duplicate flow.
 *
 *  3. The canonical Profile/CV route is reachable from the account surface.
 *
 * Runs in CI via `pnpm -F web test`. Pure source assertions; invents nothing.
 */

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

function walkTsx(absDir: string, acc: string[] = []): string[] {
  if (!existsSync(absDir)) return acc;
  for (const e of readdirSync(absDir, { withFileTypes: true })) {
    const p = join(absDir, e.name);
    if (e.isDirectory()) walkTsx(p, acc);
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function rel(abs: string): string {
  return abs.slice(APP_ROOT.length + 1).split("\\").join("/");
}

// Account lives in the Advanced-mode `(full)` route group (URL unchanged:
// /dashboard/account) after the conversation-first layout split.
const ACCOUNT_PAGE = "app/[locale]/dashboard/(full)/account/page.tsx";

// ── 1. Account role status: one vocabulary, admin never "Ruošiama" ─────────

describe("Guard: account role status reads from ONE source; admin is not 'Ruošiama'", () => {
  const src = read(ACCOUNT_PAGE);

  it("renders the admin UI toggle (the admin entry point exists on this page)", () => {
    expect(src).toMatch(/AdminUiToggle/);
  });

  it("derives admin from the dedicated admin signal (not active_role alone)", () => {
    expect(src).toMatch(/deriveIsAdmin/);
  });

  it("labels roles from the single source roleStatusChipKey", () => {
    expect(src).toMatch(/roleStatusChipKey/);
  });

  it("special-cases admin so it is never tagged a preparing workspace", () => {
    // The role list must branch on the admin role explicitly; admin maps to an
    // active-access chip, never the preparing label.
    expect(src).toMatch(/r\.role === "admin"|role === "admin"/);
  });

  it("does NOT blanket-tag roles with the preview_workspace (RUOŠIAMA) label", () => {
    // The historic bug: `{!isLiveRole && <span>{t("account.preview_workspace")}</span>}`
    // painted EVERY non-active role — including admin — as "Ruošiama" while the
    // admin toggle said admin exists. That blanket tag must be gone here.
    expect(
      src,
      'account page must not re-introduce the blanket account.preview_workspace tag — route role status through roleStatusChipKey instead.',
    ).not.toMatch(/account\.preview_workspace/);
  });

  it("still shows the non-locking rolesIntro paragraph", () => {
    expect(src).toMatch(/account\.rolesIntro/);
  });
});

// ── 2. One canonical CV upload surface (no parallel CV entry points) ───────

// CV file-pick primitives: a component that renders a pdf/docx file input.
const CV_ACCEPT = /accept=\{?["'][^"'}]*(?:pdf|docx)/i;
// The ONLY files allowed to render a CV file-pick input.
const CV_UPLOAD_PRIMITIVES = new Set([
  "components/app/cv-import-upload.tsx",
  "components/app/cv-input-panel.tsx",
]);
// The ONLY parents allowed to mount a CV upload primitive. Two are the
// canonical profile flow; the design preview is a dev-only screenshot catalogue
// (not linked from any user navigation).
const CV_MOUNT_ALLOWLIST = new Set([
  "components/app/profession-skills-picker.tsx", // canonical: skills picker → CvImportUpload
  "components/app/profile-text-first-flow.tsx", // canonical: text-first flow → CvInputPanel
  "app/[locale]/design/text-first/preview.tsx", // dev-only design catalogue
  // Conversation-first CV flow (Phase B): NOT a parallel flow — it mounts the
  // SAME canonical CvImportUpload primitive, parses with the SAME parseCvSections,
  // and persists through the SAME CvImportSectionReview + confirmCv* canonical
  // actions. It is the canonical CV flow surfaced in the assistant, not a copy.
  "components/app/conversation/worker-cv-flow.tsx",
]);

const allTsx = [
  ...walkTsx(join(APP_ROOT, "components")),
  ...walkTsx(join(APP_ROOT, "app", "[locale]")),
].map(rel);

describe("Guard: exactly one canonical CV upload surface", () => {
  const cvAcceptFiles = allTsx
    .filter((f) => CV_ACCEPT.test(read(f)))
    .sort();

  it(`discovered the CV file-pick primitives (no-op floor): ${cvAcceptFiles.length}`, () => {
    // Consolidated to ONE real file-pick primitive (cv-import-upload.tsx),
    // reused by cv-input-panel.tsx (which mounts <CvImportUpload/> rather than
    // rendering its own input). At least one canonical primitive must exist.
    expect(cvAcceptFiles.length).toBeGreaterThanOrEqual(1);
  });

  it("every CV file-pick input lives in an allowlisted CV primitive", () => {
    const stray = cvAcceptFiles.filter((f) => !CV_UPLOAD_PRIMITIVES.has(f));
    expect(
      stray,
      `New CV file-pick surface(s) ${JSON.stringify(stray)} — do not duplicate CV upload UI. Reuse the canonical CvImportUpload/CvInputPanel primitive, or allowlist with justification.`,
    ).toEqual([]);
  });

  it("CV upload primitives are mounted only inside the canonical profile flow (or dev preview)", () => {
    const mounts = allTsx
      .filter((f) => !CV_UPLOAD_PRIMITIVES.has(f))
      .filter((f) => /<CvImportUpload\b|<CvInputPanel\b/.test(read(f)))
      .sort();
    expect(mounts.length, "expected the known canonical mounts to be discovered").toBeGreaterThanOrEqual(2);
    const stray = mounts.filter((f) => !CV_MOUNT_ALLOWLIST.has(f));
    expect(
      stray,
      `CV upload primitive mounted in a non-canonical place ${JSON.stringify(stray)} — this creates a parallel CV flow. Link to /dashboard/profile instead.`,
    ).toEqual([]);
  });

  it("allowlisted CV primitives and mounts still exist (lists are not stale)", () => {
    for (const f of CV_UPLOAD_PRIMITIVES) {
      expect(existsSync(join(APP_ROOT, f)), `${f} missing — update CV_UPLOAD_PRIMITIVES`).toBe(true);
    }
    for (const f of CV_MOUNT_ALLOWLIST) {
      expect(existsSync(join(APP_ROOT, f)), `${f} missing — update CV_MOUNT_ALLOWLIST`).toBe(true);
    }
  });
});

// ── 3. Canonical Profile/CV route is reachable from the account surface ────

describe("Guard: canonical Profile/CV route is reachable", () => {
  it("the canonical profile page exists", () => {
    // Profile is a simple-mode destination in the `(panels)` route group
    // (URL unchanged: /dashboard/profile).
    expect(existsSync(join(APP_ROOT, "app/[locale]/dashboard/(panels)/profile/page.tsx"))).toBe(true);
  });

  it("the account page links to the canonical /dashboard/profile", () => {
    expect(read(ACCOUNT_PAGE)).toMatch(/href="\/dashboard\/profile"/);
  });
});

// ── Negative controls: prove the detectors bite ───────────────────────────

describe("Guard: detectors are real (negative controls)", () => {
  it("the blanket-preview-tag detector matches the historic bug shape", () => {
    const old = '{!isLiveRole && (<span>{t("account.preview_workspace")}</span>)}';
    expect(/account\.preview_workspace/.test(old)).toBe(true);
  });

  it("the CV-accept detector matches a pdf/docx file input and not a plain input", () => {
    expect(CV_ACCEPT.test('<input type="file" accept=".pdf,.docx" />')).toBe(true);
    expect(CV_ACCEPT.test('<input type="text" name="email" />')).toBe(false);
  });
});
