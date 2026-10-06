import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * VOICE IS A DOOR, NOT AN AUTHORITY (owner decision U-26; two equal doors over
 * ONE canonical action spine). The voice capture modules produce reviewed TEXT
 * and nothing else. They must never import the action spine, capability layer,
 * MCP, or any data client - so voice cannot grow its own write path or its own
 * authorization. Whatever the text becomes goes through the same intent router,
 * confirmation and authority as typed text.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

const VOICE_DOOR_FILES = [
  "components/app/voice/voice-capture-panel.tsx",
  "components/app/voice-journal-recorder.tsx",
  "lib/voice/capture-model.ts",
  "lib/voice/upload-client.ts",
];

const FORBIDDEN = [
  /@\/lib\/conversation\//,
  /@\/lib\/capabilities/,
  /@\/lib\/mcp/,
  /@\/lib\/supabase/,
  /@\/lib\/journal\//,
  /dispatchWorkerAction|prepareConfirmationAction/,
  /service[-_]?role|createAdminClient/,
];

describe("voice door adapter boundary", () => {
  for (const f of VOICE_DOOR_FILES) {
    it(`${f} imports no action spine, capability, MCP or data client`, () => {
      const src = read(f);
      for (const re of FORBIDDEN)
        expect(src, `${f} must not match ${re}`).not.toMatch(re);
    });
  }

  it("the only voice server module is the upload-session mint (no writes)", () => {
    const src = read("lib/voice/transcribe-action.ts");
    expect(src).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });
});
