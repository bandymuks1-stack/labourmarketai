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

describe("the generic voice door over the typed chat spine", () => {
  const chat = () => read("components/app/conversation/chat/conversation-chat.tsx");

  it("a reviewed transcript enters the SAME handleSend a typed sentence takes, tagged voice", () => {
    const src = chat();
    expect(src).toMatch(/handleSend\(r\.text, "voice"\)/);
    // the opener only mounts the capture panel; it calls no dispatcher, capability or executor itself
    const opener = src.slice(src.indexOf("const openVoiceDoor"), src.indexOf("const openVoiceDoor") + 900);
    expect(opener).not.toMatch(/dispatchWorkerAction|prepareConfirmationAction|runCapability|createJournalEntry/);
  });

  it("a bare 'yes' from speech is refused before routing", () => {
    const src = chat();
    expect(src).toMatch(/preRouteDisposition\(\{ origin, text: sent \}\) === "refuse-bare-affirmation"/);
    expect(src).toMatch(/assistant\(t\("voiceBareYes"\)\)/);
  });

  it("switch-context, open-conversation and write-employer show a chip instead of acting on one fuzzy match", () => {
    const src = chat();
    for (const h of ["switchContext", "openConversation", "writeEmployer"]) {
      expect(src, h).toContain(`singleMatchNeedsChip(turnOriginRef.current, "${h}")`);
    }
  });

  it("the microphone is one persistent composer control, rendered only when the service exists", () => {
    const composer = read("components/app/conversation/chat/composer.tsx");
    expect(composer).toMatch(/onVoice && \(/);
    expect(composer).toMatch(/data-testid="composer-voice"/);
    expect(composer).toMatch(/size-11/);
    expect(chat()).toMatch(/onVoice=\{voiceAvailable \? openVoiceDoor : undefined\}/);
  });

  it("speech-to-text needs a signed-in person, not a worker profile (actor-neutral; grants no authority)", () => {
    const src = read("lib/voice/transcribe-action.ts");
    expect(src).not.toMatch(/\.from\("workers"\)/);
    expect(src).not.toMatch(/no_worker_profile/);
    expect(src).toMatch(/auth\.getUser\(\)/);
  });
});

