import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE OWNER'S LIVING CV SCREENS LEAK NOTHING (coordinator order 2026-11-23, owner-approved).
 *
 * `prod-living-cv-screens` photographs REAL production pages through a read-only synthetic
 * account. The repository is public and its artefacts are readable by any signed-in GitHub user,
 * so the rules are pinned here:
 *   - the walk never presses a save, export, send or confirm control;
 *   - names are rewritten in every same-origin body BEFORE rendering, and a page that still holds
 *     one is a failure without a screenshot;
 *   - nothing that names a person or an organization reaches the log: no text locators, no text
 *     assertions, no console output, failures rethrown as the step name only;
 *   - the workflow publishes ONLY the two encrypted files, destroys the plaintext whatever
 *     happens, and publishes only images the manifest lists as privacy PASS;
 *   - owner 2026-11-23: every image has its OWN privacy gate (a failed gate generates no image and
 *     the others still run); at 375 px the layout check is never softened, and a layout FAIL is
 *     still delivered de-identified, marked FAIL with its cause, without blocking 1440 or 390;
 *   - only the coordinator's PUBLIC key is in the repository.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const spec = read("tests/e2e/prod-living-cv-screens.spec.ts");
const workflow = read("../../.github/workflows/prod-qa-walk.yml");
const key = read("tests/e2e/prod-living-cv-screens.public-key.txt");

function stepBlock(name: string): string {
  const at = workflow.indexOf(`- name: "${name}`);
  expect(at, name).toBeGreaterThan(-1);
  const next = workflow.indexOf("\n      - ", at + 1);
  return workflow.slice(at, next === -1 ? undefined : next);
}

describe("the walk is read-only and prints no names", () => {
  it("presses no save, export, send, submit, confirm or delete control", () => {
    expect(spec).not.toMatch(/getByTestId\([^)]*(save|export|send|submit|confirm|delete|approve|decide)/i);
    expect(spec).not.toMatch(/getByRole\(\s*["']button["']\s*,\s*\{\s*name/);
    // The only clicks: the workspace chip's button and a workspace option.
    const clicks = spec.match(/\.click\(/g) ?? [];
    expect(clicks.length).toBeLessThanOrEqual(4);
  });

  it("never matches or asserts page text and never logs", () => {
    expect(spec).not.toMatch(/hasText|getByText|toContainText|toHaveText|console\./);
  });

  it("rewrites bodies before rendering and checks the whole document before each screenshot", () => {
    expect(spec).toMatch(/ctx\.route\("\*\*\/\*"/);
    expect(spec).toMatch(/rewrite\(await res\.text\(\), p\)/);
    expect(spec).toMatch(/document\.documentElement\.outerHTML/);
    const shoot = spec.slice(spec.indexOf("async function shoot"), spec.indexOf("const SCREENS"));
    // Per image: mask, scan, and on a failed scan return BEFORE any screenshot.
    expect(shoot.indexOf("maskRendered(")).toBeGreaterThan(-1);
    expect(shoot.indexOf("maskRendered(")).toBeLessThan(shoot.indexOf("isClean("));
    const failBranch = shoot.slice(shoot.indexOf("if (!gate.clean)"), shoot.indexOf("const problems"));
    expect(failBranch).toMatch(/file: null, privacy: "FAIL"/);
    expect(failBranch).not.toMatch(/screenshot/);
    expect(shoot.indexOf("if (!gate.clean)")).toBeLessThan(shoot.indexOf("page.screenshot("));
    expect(spec).toMatch(/stripPngMetadata\(/);
  });

  it("masks free text in every visible text and field (owner condition 4) and fails closed", () => {
    // Names, contact data, personal codes and unknown capitalised words, through the Node-side masker.
    expect(spec).toMatch(/exposeBinding\("__lcvMask", \(_source, texts: string\[\]\) => texts\.map\(\(t\) => maskFreeText\(t, p, allow\)\)\)/);
    expect(spec).toMatch(/createTreeWalker\(document\.body, NodeFilter\.SHOW_TEXT\)/);
    expect(spec).toMatch(/querySelectorAll<HTMLInputElement \| HTMLTextAreaElement>\("input, textarea"\)/);
    // The markup as sent, AND the visible text case-insensitively.
    expect(spec).toMatch(/leakCount\(html, p, false\) \+ leakCount\(visible, p, true\)/);
    // Each image stands alone: a failure is recorded and the next screen still runs.
    expect(spec).toMatch(/const attempt = async/);
    expect(spec).toMatch(/writeFileSync\(join\(OUT, "manifest\.json"\)/);
    const lib = read("lib/testing/living-cv-deidentify.ts");
    expect(lib).toMatch(/redactContactData\(out\)/);
    expect(lib).toMatch(/LT_NAME_ENDINGS/);
    expect(lib).toMatch(/\[3-6\]\\d\{10\}/);
  });

  it("loads no stored photos or documents", () => {
    expect(spec).toMatch(/type === "image" \|\| type === "media"/);
    expect(spec).toMatch(/return route\.abort\(\)/);
  });

  it("photographs 1440, 390 and 375 px; at 375 px every overflow or hidden block is a FAIL with its cause", () => {
    expect(spec).toMatch(/key: "1440"/);
    expect(spec).toMatch(/key: "390"/);
    expect(spec).toMatch(/key: "375", options: \{ viewport: \{ width: 375/);
    const layout = spec.slice(spec.indexOf("async function layoutProblems"), spec.indexOf("interface ScreenResult"));
    expect(layout).toMatch(/page scrolls sideways/);
    expect(layout).toMatch(/reaches past the right edge/);
    expect(layout).toMatch(/starts past the left edge/);
    expect(layout).toMatch(/hides content/);
    // The cause names the element by tag, test id, id or class: never its text.
    expect(layout).not.toMatch(/innerText|textContent/);
    // A layout FAIL still delivers the de-identified image.
    const shoot = spec.slice(spec.indexOf("async function shoot"), spec.indexOf("const SCREENS"));
    expect(shoot.indexOf("layoutProblems(")).toBeLessThan(shoot.indexOf("page.screenshot("));
    expect(shoot).toMatch(/status: problems\.length \? "FAIL" : "PASS"/);
  });

  it("writes the screens only outside the repository", () => {
    expect(spec).toMatch(/PROD_QA_LCV_DIR must be an absolute directory outside the repository/);
  });
});

describe("the workflow publishes only ciphertext", () => {
  it("encrypts with a random key and the coordinator's public key, and destroys the plaintext", () => {
    const enc = stepBlock("Living CV screens: encrypt, then destroy the plaintext");
    expect(enc).toMatch(/if: always\(\) && needs\.debounce\.outputs\.spec == 'living-cv-screens'/);
    expect(enc).toMatch(/trap destroy EXIT/);
    expect(enc).toMatch(/shred -u/);
    expect(enc).toMatch(/no manifest/);
    expect(enc).toMatch(/s\.privacy === "PASS" && s\.file/);
    expect(enc).toMatch(/m\.screens\.length !== 12 \|\| stray\.length > 0/);
    expect(enc).toMatch(/zip -q -X "\$LCV_TMP\/lcv\.zip" manifest\.json/);
    expect(enc).toMatch(/openssl rand -hex 32/);
    expect(enc).toMatch(/openssl enc -aes-256-cbc -pbkdf2 -salt/);
    expect(enc).toMatch(/openssl pkeyutl -encrypt -pubin -inkey "\$LCV_PUBKEY"/);
    expect(enc).not.toMatch(/upload-artifact/);
  });

  it("uploads exactly the two encrypted files", () => {
    const up = stepBlock("Living CV screens: upload the two encrypted files only");
    expect(up).toMatch(/if: always\(\) && steps\.lcv\.outputs\.encrypted == 'true'/);
    const paths = up.slice(up.indexOf("path: |")).split("\n").slice(1).map((l) => l.trim()).filter((l) => l.startsWith("${{"));
    expect(paths).toEqual(["${{ runner.temp }}/lcv-out/lcv.zip.enc", "${{ runner.temp }}/lcv-out/lcv.key.enc"]);
    expect(up).not.toMatch(/\.png|lcv\.zip\s*$|lcv\.key\s*$/m);
  });

  it("the screens never reach the ordinary result upload", () => {
    const result = workflow.slice(workflow.indexOf("- name: Upload result"));
    expect(result.slice(0, result.indexOf("\n      - "))).not.toMatch(/lcv|\.png|\.enc/);
  });

  it("only a public key is committed", () => {
    expect(key).toMatch(/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n?$/);
    expect(key).not.toMatch(/PRIVATE/);
  });
});
