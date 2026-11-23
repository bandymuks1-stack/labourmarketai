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
 *     happens, and publishes nothing unless all eight screens exist;
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
    const shoot = spec.slice(spec.indexOf("async function shoot"));
    expect(shoot.indexOf("maskRendered(")).toBeGreaterThan(-1);
    expect(shoot.indexOf("maskRendered(")).toBeLessThan(shoot.indexOf("assertClean("));
    expect(shoot.indexOf("assertClean(")).toBeLessThan(shoot.indexOf("page.screenshot("));
    expect(spec).toMatch(/stripPngMetadata\(/);
  });

  it("masks free text in every visible text and field (owner condition 4) and fails closed", () => {
    // Names, contact data, personal codes and unknown capitalised words, through the Node-side masker.
    expect(spec).toMatch(/exposeBinding\("__lcvMask", \(_source, texts: string\[\]\) => texts\.map\(\(t\) => maskFreeText\(t, p, allow\)\)\)/);
    expect(spec).toMatch(/createTreeWalker\(document\.body, NodeFilter\.SHOW_TEXT\)/);
    expect(spec).toMatch(/querySelectorAll<HTMLInputElement \| HTMLTextAreaElement>\("input, textarea"\)/);
    // The markup as sent, AND the visible text case-insensitively.
    expect(spec).toMatch(/leakCount\(html, p, false\) \+ leakCount\(visible, p, true\)/);
    const lib = read("lib/testing/living-cv-deidentify.ts");
    expect(lib).toMatch(/redactContactData\(out\)/);
    expect(lib).toMatch(/LT_NAME_ENDINGS/);
    expect(lib).toMatch(/\[3-6\]\\d\{10\}/);
  });

  it("loads no stored photos or documents", () => {
    expect(spec).toMatch(/type === "image" \|\| type === "media"/);
    expect(spec).toMatch(/return route\.abort\(\)/);
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
    expect(enc).toMatch(/"\$n" -ne 8/);
    expect(enc).toMatch(/steps\.walk\.outcome/);
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
