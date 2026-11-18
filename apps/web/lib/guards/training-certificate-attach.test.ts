import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Function 11.8 — attaching a training certificate (lane L, 2026-11-16).
 *
 * `attach_training_certificate_v1` accepts ONLY a file version from the
 * organization's own document register (`invalid_file` otherwise). The form
 * used to ask a manager to type that file's id. It now offers the register's
 * current file versions through the EXISTING read (`getOrgDocumentRegister`)
 * — no free-text id, no second data path.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const ui = read("components/app/training-register.tsx");

/** The attach `<form …>…</form>` block. */
function attachForm(src: string): string {
  const k = src.indexOf("action={attachTrainingCertificateAction}");
  expect(k).toBeGreaterThan(0);
  const open = src.lastIndexOf("<form", k);
  const close = src.indexOf("</form>", k);
  return src.slice(open, close);
}

describe("training certificate attach picks a file from the org's own register", () => {
  it("no free-text input carries the certificate file id", () => {
    const form = attachForm(ui);
    expect(form).not.toMatch(/<input[^>]*name="documentFileId"/);
    expect(form).toMatch(/<select\s[^>]*name="documentFileId"/);
    expect(ui).not.toContain("certificateFilePlaceholder");
  });

  it("the options come from the existing document-register read, for the active organization", () => {
    expect(ui).toContain('import { getOrgDocumentRegister } from "@/lib/documents/document-files";');
    expect(ui).toContain("await getOrgDocumentRegister(activeOrganizationId)");
    // The value is the CURRENT file version — what the RPC checks.
    expect(ui).toContain("e.currentFile.id");
    expect(ui).not.toMatch(/from\("document_files"\)|from\("org_documents"\)/);
  });

  it("NEGATIVE CONTROL: the detector catches a free-text id input", () => {
    const bad = ui.replace(
      /<select\s+name="documentFileId"/,
      '<input type="text" name="documentFileId" /><select name="other"',
    );
    expect(attachForm(bad)).toMatch(/<input[^>]*name="documentFileId"/);
  });

  it("every locale renamed the key — i18n parity", () => {
    const dir = join(WEB, "messages");
    const locales = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(locales.length).toBeGreaterThanOrEqual(11);
    for (const f of locales) {
      const msgs = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        training: { org: Record<string, string> };
      };
      expect(msgs.training.org.certificateFileLabel, f).toBeTruthy();
      expect(msgs.training.org.certificateFilePlaceholder, f).toBeUndefined();
    }
  });
});
