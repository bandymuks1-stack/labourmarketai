import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Voice Work Journal guard — static invariants of the voice input method
 * (master goal v1 §Outcome B; gap map docs/launch/voice-work-journal-gap-map-v1.md).
 *
 * Voice is an INPUT METHOD into the ONE canonical journal. These pins keep it
 * honest: server-proxied transcription (browser never sees the service), an
 * explicit disclosure BEFORE recording, no second write path, no secret in the
 * client, no content logging, and truthful degradation when the self-hosted
 * service is not configured.
 */

const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

const RECORDER = "components/app/voice-journal-recorder.tsx";
const PANEL = "components/app/voice/voice-capture-panel.tsx";
const UPLOAD_CLIENT = "lib/voice/upload-client.ts";
const MODEL = "lib/voice/capture-model.ts";
const ACTION = "lib/voice/transcribe-action.ts";
const CONSTANTS = "lib/voice/constants.ts";
const PAGE = "app/[locale]/dashboard/journal/voice/page.tsx";
const COMPOSER = "components/app/journal-entry-composer.tsx";
const CHAT = "components/app/conversation/chat/conversation-chat.tsx";

describe("voice env stays server-only", () => {
  it("no NEXT_PUBLIC voice variable exists anywhere in lib/env.ts", () => {
    const env = read("lib/env.ts");
    expect(env).toMatch(/VOICE_TRANSCRIBE_URL/);
    expect(env).toMatch(/VOICE_TRANSCRIBE_TOKEN/);
    expect(env).not.toMatch(/NEXT_PUBLIC[A-Z_]*VOICE/i);
  });

  it("the client never touches env, the master secret or process.env", () => {
    for (const p of [RECORDER, PANEL, UPLOAD_CLIENT, MODEL]) {
      const src = read(p);
      expect(src, p).not.toMatch(/VOICE_TRANSCRIBE/);
      expect(src, p).not.toMatch(/@\/lib\/env/);
      expect(src, p).not.toMatch(/process\.env/);
    }
    expect(read(PANEL)).toMatch(/^"use client";/);
  });

  it("audio goes browser -> service directly with a SHORT-LIVED SINGLE-USE token, never the master secret", () => {
    // The 25 MB recording cannot pass a 5 MB server action nor the platform's
    // ~4.5 MB function body; the global action limit is NOT raised for voice.
    expect(read("next.config.ts")).toMatch(/bodySizeLimit: "5mb"/);
    const client = read(UPLOAD_CLIENT);
    expect(client).toMatch(/Bearer \$\{input\.token\}/);
    expect(client).toMatch(/XMLHttpRequest/);
    const panel = read(PANEL);
    expect(panel).toMatch(/createVoiceUploadSession/);
    expect(panel).toMatch(/uploadForTranscription/);
    expect(panel).not.toMatch(/transcribeVoiceRecording/);
  });

  it("the upload session is a server action with server-only import, minting a signed token", () => {
    const src = read(ACTION);
    expect(src).toMatch(/^"use server";/);
    expect(src).toMatch(/import "server-only";/);
    expect(src).toMatch(/VOICE_TRANSCRIBE_URL/);
    expect(src).toMatch(/mintUploadToken/);
    expect(src).toMatch(/auth\.getUser\(\)/);
    // the master secret is only ever the SIGNING key, never returned
    expect(src).not.toMatch(/token: secret/);
  });
});

describe("disclosure before recording", () => {
  it("recording is gated on the acknowledgement checkbox", () => {
    const src = read(PANEL);
    expect(src).toMatch(/if \(!ack \|\| !serviceConfigured/);
    // the start button is disabled until acknowledged
    expect(src).toMatch(/disabled=\{!ack \|\| !canCapture\}/);
  });

  it("disclosure names external processing, retention and no-auto-write", () => {
    const src = read(PANEL);
    for (const key of [
      "disclosureProvenance",
      "disclosureProcessing",
      "disclosureWhy",
      "disclosureRetention",
      "disclosureNoAutoWrite",
      "disclosureAck",
    ]) {
      expect(src).toContain(key);
    }
  });

  it("every locale carries the full voice namespace (same-PR i18n rule)", () => {
    const locales = [
      "da", "de", "en", "et", "fi", "lt", "lv", "nl", "no", "pl", "ru", "sv",
    ];
    for (const loc of locales) {
      const p = join(WEB, "messages", loc, "journal.json");
      expect(existsSync(p), `${loc}/journal.json`).toBe(true);
      const d = JSON.parse(readFileSync(p, "utf8")) as {
        voice?: Record<string, unknown>;
      };
      expect(d.voice, `${loc} journal.voice`).toBeTruthy();
      for (const key of [
        "disclosureProcessing",
        "disclosureRetention",
        "disclosureNoAutoWrite",
        "unavailable",
        "useInJournal",
      ]) {
        expect(d.voice?.[key], `${loc} voice.${key}`).toBeTruthy();
      }
    }
  });
});

describe("one canonical journal — voice adds NO second write path", () => {
  it("the voice surface never imports supabase or journal actions", () => {
    for (const p of [RECORDER, PANEL, UPLOAD_CLIENT, MODEL, CONSTANTS]) {
      const src = read(p);
      expect(src).not.toMatch(/@\/lib\/supabase/);
      expect(src).not.toMatch(/createJournalEntry|supersedeJournalEntry/);
      expect(src).not.toMatch(/\.from\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    }
  });

  it("the transcription action performs no database write", () => {
    const src = read(ACTION);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("hand-off goes through the read-once key into the CHAT — the one intake (W5 slice 2)", () => {
    expect(read(CONSTANTS)).toMatch(/VOICE_TRANSCRIPT_DRAFT_KEY/);
    // The chat consumes the transcript and runs the SAME deterministic
    // work-log flow (startWorkLog → explicit confirm → createJournalEntry).
    const chat = read(CHAT);
    expect(chat).toMatch(/VOICE_TRANSCRIPT_DRAFT_KEY/);
    expect(chat).toMatch(/removeItem\(VOICE_TRANSCRIPT_DRAFT_KEY\)/);
    expect(chat).toMatch(/decodeVoiceHandoff\(draft\)/);
    expect(chat).toMatch(/startWorkLog\(text, \{ voice:/);
    // The recorder targets the chat workspace, never the journal page's
    // composer anchor — since chat-first intake that composer mounts only in
    // edit mode, so the old target silently swallowed the transcript.
    const recorder = read(RECORDER);
    expect(recorder).toMatch(/router\.push\("\/dashboard"\)/);
    expect(recorder).not.toMatch(/#journal-composer/);
    // The composer's dead consumer stays deleted.
    const composer = read(COMPOSER);
    expect(composer).not.toMatch(/VOICE_TRANSCRIPT_DRAFT_KEY/);
  });

  it("the voice surface has a real door from the journal page", () => {
    const journalPage = read("app/[locale]/dashboard/journal/page.tsx");
    expect(journalPage).toMatch(/journal-log-via-voice-cta/);
    expect(journalPage).toMatch(/\/dashboard\/journal\/voice/);
  });

  it("the voice route nests under the journal (no new top-level module)", () => {
    expect(existsSync(join(WEB, PAGE))).toBe(true);
    expect(
      existsSync(join(WEB, "app", "[locale]", "dashboard", "voice")),
    ).toBe(false);
  });
});

describe("the accepted microphone capability is not silently disabled by header hardening", () => {
  it("next.config grants the microphone to THIS origin only (never () / * / a foreign origin)", () => {
    const cfg = read("next.config.ts");
    const m = /microphone=\(([^)]*)\)/.exec(cfg);
    expect(m, "Permissions-Policy has a microphone directive").not.toBeNull();
    expect(m![1]).toBe("self");
  });

  it("the CSP connect-src names the transcription service origin (exact, https only)", () => {
    const cfg = read("next.config.ts");
    expect(cfg).toMatch(/voiceServiceOrigin\(\)/);
    expect(cfg).toMatch(/u\.protocol === "https:"/);
  });

  it("the voice surface carries the language choice and does not equate speech language with UI locale", () => {
    const panel = read(PANEL);
    expect(panel).toMatch(/voice-language/);
    expect(panel).toMatch(/SPEECH_LANGUAGE_STORAGE_KEY/);
    expect(panel).not.toMatch(/fd\.set\("language", locale\)/);
  });
});

describe("privacy and honesty", () => {
  it("the proxy never logs transcript or audio content", () => {
    const src = read(ACTION);
    const logs = src.match(/console\.(log|error|warn)\([^)]*\)/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toMatch(/transcript/i);
      expect(line).not.toMatch(/audio\b(?!\.size)/);
    }
  });

  it("caps are enforced on both sides (25 MB / closed MIME / 10 min)", () => {
    const constants = read(CONSTANTS);
    expect(constants).toMatch(/25 \* 1024 \* 1024/);
    expect(constants).toMatch(/VOICE_MAX_SECONDS = 600/);
    // the minted token carries the byte cap; the client gates on it; the
    // panel stops the recording at the time cap
    expect(read(ACTION)).toMatch(/maxBytes: VOICE_MAX_BYTES/);
    expect(read(MODEL)).toMatch(/checkAudioSize/);
    expect(read(PANEL)).toMatch(/VOICE_MAX_SECONDS/);
    expect(read(PANEL)).toMatch(/VOICE_ALLOWED_MIME/);
  });

  it("no background recording: unmount stops recorder and microphone", () => {
    const src = read(PANEL);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*return \(\) => \{/);
    expect(src).toMatch(/getTracks\(\)\.forEach\(\(tr\) => \{/);
    expect(src).toMatch(/tr\.stop\(\)/);
    // a hidden page pauses the recorder
    expect(src).toMatch(/visibilitychange/);
  });

  it("unconfigured service renders the honest unavailable state (no mock)", () => {
    const recorder = read(PANEL);
    expect(recorder).toMatch(/voice-unavailable/);
    const action = read(ACTION);
    expect(action).toMatch(/return \{ status: "unavailable" \}/);
    // Nothing fakes a transcript anywhere in the voice slice.
    for (const p of [RECORDER, PANEL, UPLOAD_CLIENT, ACTION, CONSTANTS]) {
      expect(read(p)).not.toMatch(/fixture|synthetic|fake|mock/i);
    }
  });

  it("permission-denied has a real retry state", () => {
    const src = read(PANEL);
    expect(src).toMatch(/permission_denied/);
    expect(src).toMatch(/voice-permission-denied/);
    expect(src).toMatch(/classifyMicError/);
  });
});

describe("provenance - voice-derived entries say so (self-declared label, never a verification)", () => {
  it("the SAME canonical write persists input_origin/voice_language/voice_disclosure_version", () => {
    const core = read("lib/journal/journal-write-core.ts");
    for (const slug of ["input_origin", "voice_language", "voice_disclosure_version"]) {
      expect(core).toContain(`"${slug}"`);
    }
    // only the worker_input source; never an AI/verified source
    expect(core).toMatch(/input_origin", value_text: "voice", source: "worker_input"/);
    // and still exactly one writer: no new journal insert from the voice slice
    expect(read("lib/conversation/worker-executors.ts")).toMatch(/input_origin: "voice"/);
    expect(read("lib/conversation/worker-schemas.ts")).toMatch(/voice: z/);
  });
  it("the chat carries provenance through the existing work-log flow (no direct write)", () => {
    expect(read(CHAT)).toMatch(/voice=\{opts\?\.voice\}/);
    expect(read("components/app/conversation/worker-worklog-flow.tsx")).toMatch(/\.\.\.\(voice \? \{ voice \} : \{\}\)/);
  });
});

describe("vendor (browser) dictation in the command finder is disclosed before it starts", () => {
  const finder = () => read("components/app/command-finder.tsx");
  it("the mic button asks for the disclosure first and remembers acceptance", () => {
    const src = finder();
    expect(src).toMatch(/onClick=\{listening \? stopListening : requestListening\}/);
    expect(src).toMatch(/SPEECH_CONSENT_KEY/);
    expect(src).toMatch(/command-finder-voice-consent/);
    expect(src).not.toMatch(/no external AI service/);
  });
  it("every active locale carries the disclosure copy", () => {
    for (const loc of ["de", "en", "lt", "nl", "pl", "ru"]) {
      const d = JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")) as {
        commandFinder?: Record<string, string>;
      };
      for (const k of ["voiceConsentText", "voiceConsentAllow", "voiceConsentCancel", "voiceFailed"]) {
        expect(d.commandFinder?.[k], `${loc} commandFinder.${k}`).toBeTruthy();
      }
    }
  });
});
