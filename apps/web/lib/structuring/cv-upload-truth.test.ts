import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * CV upload truth guard — REAL path.
 *
 * CV file upload is a required, live feature: upload → server-side text
 * extraction → deterministic recognition → review → save into the existing
 * owner-only models. This guard fails if the feature regresses back to a
 * "coming soon / M2 / ruošiama" scaffold, if the upload UI exists without a
 * parser/save path, or if it claims fake success / fake verification.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const UPLOAD = "components/app/cv-import-upload.tsx";
const EXTRACT = "lib/cv/extract.ts";
const ROUTE = "app/api/cv/extract/route.ts";
const CLIENT = "lib/cv/cv-import-client.ts";

describe("CV upload UI is real (no coming-soon scaffold)", () => {
  const src = read(UPLOAD);

  it("renders a real file input and wires it to extraction", () => {
    expect(src).toMatch(/type="file"/);
    expect(src).toMatch(/extractCvFile/);
    expect(src).toMatch(/onExtracted/);
  });

  it("has NO coming-soon / M2 / preparing copy or keys", () => {
    expect(src).not.toMatch(/coming.?soon|\bM2\b|ruošiam|готовится|not active yet|being prepared/i);
    expect(src).not.toMatch(/importComingSoon|importNotSaved/);
  });

  it("does not fake-verify imported data", () => {
    expect(src).not.toMatch(/verified|patvirtinta išoriškai|подтверждено/i);
  });
});

describe("CV extraction is genuinely implemented (real parsers, no throw-stub)", () => {
  const src = read(EXTRACT);
  it("no longer throws a not-implemented stub", () => {
    expect(src).not.toMatch(/not implemented until M2|throw new Error\("CV extraction/);
  });
  it("uses the approved pure-JS parsers (unpdf + mammoth)", () => {
    expect(src).toMatch(/unpdf/);
    expect(src).toMatch(/mammoth/);
  });
  it("returns a tagged result and never logs the CV text", () => {
    expect(src).toMatch(/kind:\s*"ok"/);
    expect(src).not.toMatch(/console\.(log|info|debug)\(/);
  });
});

describe("CV extraction route is auth-gated, size-capped, non-logging", () => {
  it("the route exists", () => {
    expect(existsSync(join(root, ROUTE))).toBe(true);
  });
  const src = read(ROUTE);

  // The security property is "an unresolved identity is refused before any
  // byte of the CV is read", not "the route calls auth.getUser" — that was an
  // implementation detail, and it went stale the day identity resolution
  // moved into the canonical boundary (lib/api/api-identity.ts). The guard
  // now asserts the boundary itself: the route resolves identity through the
  // ONE resolver and refuses a failed resolution. Which transports may reach
  // it, and that it never builds a second identity path, is guarded by
  // lib/guards/api-auth-boundary.test.ts.
  const refusesUnresolvedIdentity = (s: string): boolean =>
    /resolveApiIdentity\s*\(/.test(s) && /if\s*\(!auth\.ok\)/.test(s);

  it("negative control: the guard rejects a route that skips the boundary", () => {
    // The exact source shape this guard replaced — direct cookie-client auth.
    const preBoundaryRoute = `
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({}, { status: 401 });`;
    expect(refusesUnresolvedIdentity(preBoundaryRoute)).toBe(false);
    expect(refusesUnresolvedIdentity("")).toBe(false);
  });

  it("requires an authenticated user via the canonical identity boundary", () => {
    expect(refusesUnresolvedIdentity(src)).toBe(true);
  });
  it("enforces a size cap and never logs the CV text", () => {
    expect(src).toMatch(/MAX_CV_BYTES/);
    expect(src).toMatch(/413/);
    // It may log a coarse error string, but never the text/body.
    expect(src).not.toMatch(/console\.(log|info|debug)\(/);
    expect(src).not.toMatch(/console\.error\([^)]*text/);
  });
});

describe("CV import client maps honest, specific errors", () => {
  const src = read(CLIENT);
  it("posts to the extraction route", () => {
    expect(src).toMatch(/\/api\/cv\/extract/);
  });
  it("surfaces specific failure codes (no silent drop / fake success)", () => {
    for (const code of ["unsupported", "too-large", "empty", "failed"]) {
      expect(src).toContain(code);
    }
  });
});

describe("extracted CV text flows into recognition + real save (not a dead end)", () => {
  it("the upload primitive feeds extracted text into the CV input panel's submit path", () => {
    const panel = read("components/app/cv-input-panel.tsx");
    // CvInputPanel hands the extracted text to the SAME path as pasted text.
    expect(panel).toMatch(/<CvImportUpload\s+onExtracted=\{onPasteSubmit\}/);
  });
  it("the profile flow runs the deterministic parser + saves to a real model", () => {
    const flow = read("components/app/profile-text-first-flow.tsx");
    // CV text (pasted OR uploaded) → analyse() → recognition → persisted claims.
    expect(flow).toMatch(/onPasteSubmit=\{\(v\)\s*=>\s*\{/);
    expect(flow).toMatch(/extractProfileSkillClaims/);
    expect(flow).toMatch(/saveProfileSkillClaimsAction/);
    expect(flow).toMatch(/saveWorkerProfileText/);
  });
});

describe("CV upload copy is honest in both locales (no coming-soon)", () => {
  for (const locale of ["lt", "en"] as const) {
    const cv = (JSON.parse(read(`messages/${locale}.json`)) as {
      structuring: { cv: Record<string, string> };
    }).structuring.cv;
    it(`${locale} has the real upload + error keys`, () => {
      for (const k of [
        "uploadPick",
        "uploadFormats",
        "uploadHint",
        "uploadExtracting",
        "uploadErrorType",
        "uploadErrorSize",
        "uploadErrorEmpty",
        "uploadErrorFailed",
      ]) {
        expect(cv[k], `${locale} structuring.cv.${k}`).toBeTruthy();
      }
    });
    it(`${locale} dropped the coming-soon key + has no preparing/M2 wording`, () => {
      expect(cv.uploadComingSoon).toBeUndefined();
      const blob = Object.values(cv).join(" ");
      expect(blob).not.toMatch(/coming.?soon|\bM2\b|ruošiam|готовится|being prepared/i);
    });
  }
});
