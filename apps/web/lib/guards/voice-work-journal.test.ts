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
const ACTION = "lib/voice/transcribe-action.ts";
const CONSTANTS = "lib/voice/constants.ts";
const PAGE = "app/[locale]/dashboard/journal/voice/page.tsx";
const COMPOSER = "components/app/journal-entry-composer.tsx";

describe("voice env stays server-only", () => {
  it("no NEXT_PUBLIC voice variable exists anywhere in lib/env.ts", () => {
    const env = read("lib/env.ts");
    expect(env).toMatch(/VOICE_TRANSCRIBE_URL/);
    expect(env).toMatch(/VOICE_TRANSCRIBE_TOKEN/);
    expect(env).not.toMatch(/NEXT_PUBLIC[A-Z_]*VOICE/i);
  });

  it("the client recorder never touches env, tokens or the service URL", () => {
    const src = read(RECORDER);
    expect(src).toMatch(/^"use client";/);
    expect(src).not.toMatch(/VOICE_TRANSCRIBE/);
    expect(src).not.toMatch(/@\/lib\/env/);
    expect(src).not.toMatch(/process\.env/);
    // No direct network call to any transcription host — the ONLY transport
    // is the server action import.
    expect(src).not.toMatch(/fetch\(/);
    expect(src).toMatch(/transcribeVoiceRecording/);
  });

  it("the transcription proxy is a server action with server-only import", () => {
    const src = read(ACTION);
    expect(src).toMatch(/^"use server";/);
    expect(src).toMatch(/import "server-only";/);
    expect(src).toMatch(/VOICE_TRANSCRIBE_URL/);
    expect(src).toMatch(/authorization: `Bearer \$\{token\}`/);
  });
});

describe("disclosure before recording", () => {
  it("recording is gated on the acknowledgement checkbox", () => {
    const src = read(RECORDER);
    expect(src).toMatch(/ackDisclosure/);
    // startRecording refuses without acknowledgement…
    expect(src).toMatch(
      /if \(!ackDisclosure \|\| !serviceConfigured\) return;/,
    );
    // …and the start button is disabled until acknowledged.
    expect(src).toMatch(/disabled=\{!ackDisclosure\}/);
  });

  it("disclosure names external processing, retention and no-auto-write", () => {
    const src = read(RECORDER);
    for (const key of [
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
    for (const p of [RECORDER, CONSTANTS]) {
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

  it("hand-off goes through the read-once composer key into the ONE composer", () => {
    expect(read(CONSTANTS)).toMatch(/VOICE_TRANSCRIPT_DRAFT_KEY/);
    const composer = read(COMPOSER);
    expect(composer).toMatch(/VOICE_TRANSCRIPT_DRAFT_KEY/);
    expect(composer).toMatch(/removeItem\(VOICE_TRANSCRIPT_DRAFT_KEY\)/);
  });

  it("the voice route nests under the journal (no new top-level module)", () => {
    expect(existsSync(join(WEB, PAGE))).toBe(true);
    expect(
      existsSync(join(WEB, "app", "[locale]", "dashboard", "voice")),
    ).toBe(false);
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
    const action = read(ACTION);
    expect(action).toMatch(/audio\.size > VOICE_MAX_BYTES/);
    expect(action).toMatch(/ALLOWED_MIME\.has\(mime\)/);
    const recorder = read(RECORDER);
    expect(recorder).toMatch(/VOICE_MAX_SECONDS/);
    expect(recorder).toMatch(/VOICE_MAX_BYTES/);
  });

  it("no background recording: unmount stops recorder and microphone", () => {
    const src = read(RECORDER);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*return \(\) => \{/);
    expect(src).toMatch(/getTracks\(\)\.forEach\(\(tr\) => tr\.stop\(\)\)/);
  });

  it("unconfigured service renders the honest unavailable state (no mock)", () => {
    const recorder = read(RECORDER);
    expect(recorder).toMatch(/voice-unavailable/);
    const action = read(ACTION);
    expect(action).toMatch(/return \{ status: "unavailable" \}/);
    // Nothing fakes a transcript anywhere in the voice slice.
    for (const p of [RECORDER, ACTION, CONSTANTS]) {
      expect(read(p)).not.toMatch(/fixture|synthetic|fake|mock/i);
    }
  });

  it("permission-denied has a real retry state", () => {
    const src = read(RECORDER);
    expect(src).toMatch(/setPhase\("denied"\)/);
    expect(src).toMatch(/voice-permission-denied/);
  });
});
