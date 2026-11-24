import { describe, expect, it } from "vitest";

import {
  DEFAULT_VOICE_LIMITS,
  RECORDER_BITS_PER_SECOND,
  checkAudioSize,
  classifyMicError,
  classifyUploadFailure,
  decodeVoiceHandoff,
  defaultSpeechLanguage,
  detectVoiceCapability,
  encodeVoiceHandoff,
  failureClass,
  formatLimits,
  isRetryableWithFreshToken,
  pickRecorderMime,
  SPEECH_LANGUAGES,
  type VoiceEnvironment,
} from "./capture-model";
import {
  VOICE_ALLOWED_MIME,
  VOICE_MAX_BYTES,
  VOICE_MAX_SECONDS,
} from "./constants";

const ENV: VoiceEnvironment = {
  isSecureContext: true,
  hasMediaDevices: true,
  hasMediaRecorder: true,
  recorderMime: "audio/webm",
  policyAllowsMicrophone: true,
};

describe("capability - never claims voice is available when the browser or site policy says otherwise", () => {
  it("available only when every precondition holds", () => {
    expect(detectVoiceCapability(ENV)).toEqual({ kind: "available" });
  });
  it("unsupported browser: each missing piece is named, in a stable order", () => {
    expect(detectVoiceCapability({ ...ENV, isSecureContext: false })).toEqual({
      kind: "unsupported",
      reason: "insecure_context",
    });
    expect(detectVoiceCapability({ ...ENV, hasMediaDevices: false })).toEqual({
      kind: "unsupported",
      reason: "no_media_devices",
    });
    expect(detectVoiceCapability({ ...ENV, hasMediaRecorder: false })).toEqual({
      kind: "unsupported",
      reason: "no_media_recorder",
    });
    expect(detectVoiceCapability({ ...ENV, recorderMime: "" })).toEqual({
      kind: "unsupported",
      reason: "no_supported_mime",
    });
  });
  it("a Permissions-Policy that denies the microphone is policy_blocked - NOT 'unsupported' and NOT 'permission denied'", () => {
    expect(
      detectVoiceCapability({ ...ENV, policyAllowsMicrophone: false }),
    ).toEqual({ kind: "policy_blocked" });
    // blocked even when the mime probe also failed: the cause the person can report is the policy
    expect(
      detectVoiceCapability({
        ...ENV,
        policyAllowsMicrophone: false,
        recorderMime: "",
      }),
    ).toEqual({ kind: "policy_blocked" });
  });
  it("an unknown policy (null) does not block", () => {
    expect(
      detectVoiceCapability({ ...ENV, policyAllowsMicrophone: null }),
    ).toEqual({ kind: "available" });
  });
  it("the recorder mime candidates are all accepted by the service's closed MIME set", () => {
    expect(pickRecorderMime((m) => m === "audio/ogg")).toBe("audio/ogg");
    expect(pickRecorderMime(() => true)).toBe("audio/webm");
    expect(pickRecorderMime(() => false)).toBe("");
    expect(pickRecorderMime(null)).toBe("");
    expect(
      pickRecorderMime(() => {
        throw new Error("x");
      }),
    ).toBe("");
    for (const m of ["audio/webm", "audio/ogg", "audio/mp4"])
      expect(VOICE_ALLOWED_MIME as readonly string[]).toContain(m);
  });
  it("speech bitrate keeps the full ten minutes far inside the 25 MB cap", () => {
    const bytes = (RECORDER_BITS_PER_SECOND / 8) * VOICE_MAX_SECONDS;
    expect(bytes).toBeLessThan(VOICE_MAX_BYTES / 4);
  });
});

describe("microphone failures", () => {
  it("classifies each rejection honestly", () => {
    expect(classifyMicError("NotAllowedError", true)).toBe("permission_denied");
    expect(classifyMicError("NotAllowedError", null)).toBe("permission_denied");
    expect(classifyMicError("NotAllowedError", false)).toBe("policy_blocked");
    expect(classifyMicError("NotFoundError", true)).toBe("no_device");
    expect(classifyMicError("NotReadableError", true)).toBe("device_busy");
    expect(classifyMicError("TypeError", true)).toBe("unsupported");
    expect(classifyMicError("WeirdError", true)).toBe("failed");
    expect(classifyMicError(undefined, true)).toBe("failed");
  });
});

describe("upload / transcription failures - an unreachable service is never a transcription problem", () => {
  it("network-level failure (status 0) = service unreachable", () => {
    expect(classifyUploadFailure({ status: 0 })).toBe("service_unreachable");
    expect(failureClass("service_unreachable")).toBe("service_unavailable");
  });
  it("known service codes pass through; unknown codes map by status", () => {
    expect(classifyUploadFailure({ status: 413, code: "too_long" })).toBe(
      "too_long",
    );
    expect(classifyUploadFailure({ status: 413, code: "too_large" })).toBe(
      "too_large",
    );
    expect(classifyUploadFailure({ status: 502, code: "engine_failed" })).toBe(
      "engine_failed",
    );
    expect(classifyUploadFailure({ status: 400, code: "undecodable" })).toBe(
      "undecodable",
    );
    expect(classifyUploadFailure({ status: 429 })).toBe("rate_limited");
    expect(classifyUploadFailure({ status: 415 })).toBe("bad_mime");
    expect(classifyUploadFailure({ status: 401 })).toBe("unauthorized");
    expect(classifyUploadFailure({ status: 401, code: "token_expired" })).toBe(
      "token_expired",
    );
    expect(classifyUploadFailure({ status: 401, code: "token_used" })).toBe(
      "token_expired",
    );
    expect(classifyUploadFailure({ status: 503 })).toBe("engine_failed");
    expect(
      classifyUploadFailure({ status: 403, code: "origin_not_allowed" }),
    ).toBe("service_unreachable");
    expect(classifyUploadFailure({ status: 418 })).toBe("internal");
    expect(classifyUploadFailure({ status: 200, timedOut: true })).toBe(
      "timeout",
    );
  });
  it("only an expired/used token is retried transparently, once", () => {
    expect(isRetryableWithFreshToken("token_expired")).toBe(true);
    for (const c of [
      "engine_failed",
      "service_unreachable",
      "unauthorized",
      "too_large",
    ] as const) {
      expect(isRetryableWithFreshToken(c)).toBe(false);
    }
  });
  it("failures land in exactly one honest class", () => {
    expect(failureClass("engine_failed")).toBe("transcription_failed");
    expect(failureClass("undecodable")).toBe("transcription_failed");
    expect(failureClass("too_large")).toBe("input_problem");
    expect(failureClass("empty")).toBe("input_problem");
    expect(failureClass("timeout")).toBe("service_unavailable");
    expect(failureClass("not_authenticated")).toBe("session");
  });
});

describe("limits - the advertised numbers are the enforced numbers", () => {
  it("25 MB / 10 min", () => {
    expect(formatLimits()).toEqual({ minutes: 10, megabytes: 25 });
    expect(DEFAULT_VOICE_LIMITS).toEqual({
      maxBytes: VOICE_MAX_BYTES,
      maxSeconds: VOICE_MAX_SECONDS,
    });
  });
  it("client size gate", () => {
    expect(checkAudioSize(0)).toBe("empty");
    expect(checkAudioSize(Number.NaN)).toBe("empty");
    expect(checkAudioSize(VOICE_MAX_BYTES + 1)).toBe("too_large");
    expect(checkAudioSize(VOICE_MAX_BYTES)).toBeNull();
    expect(checkAudioSize(5 * 1024 * 1024 + 1)).toBeNull(); // the old 5 MB server-action ceiling is gone
    expect(checkAudioSize(2000, { maxBytes: 1000, maxSeconds: 60 })).toBe(
      "too_large",
    );
  });
});

describe("speech language - a default, never a silent rule", () => {
  it("defaults from the UI locale only when the service speaks it; otherwise auto", () => {
    expect(defaultSpeechLanguage("lt", null)).toBe("lt");
    expect(defaultSpeechLanguage("pl-PL", undefined)).toBe("pl");
    expect(defaultSpeechLanguage("nb", null)).toBe("no");
    expect(defaultSpeechLanguage("uk", null)).toBe("auto");
    expect(defaultSpeechLanguage("ka", null)).toBe("auto");
  });
  it("the stored choice wins: an English UI can speak Lithuanian", () => {
    expect(defaultSpeechLanguage("en", "lt")).toBe("lt");
    expect(defaultSpeechLanguage("en", "auto")).toBe("auto");
    expect(defaultSpeechLanguage("lt", "xx")).toBe("lt"); // junk storage is ignored
  });
  it("the choices are exactly the service's closed set", () => {
    expect([...SPEECH_LANGUAGES].sort()).toEqual([
      "da",
      "de",
      "en",
      "et",
      "fi",
      "lt",
      "lv",
      "nl",
      "no",
      "pl",
      "ru",
      "sv",
    ]);
  });
});

describe("provenance hand-off", () => {
  const h = {
    v: 1 as const,
    text: "Šiandien dirbau",
    origin: "voice" as const,
    language: "lt" as const,
    disclosureVersion: "2026-07-12.v1",
    durationSeconds: 12.4,
  };
  it("round-trips", () => {
    expect(decodeVoiceHandoff(encodeVoiceHandoff(h))).toEqual(h);
  });
  it("accepts the legacy plain-text draft as a voice draft with unknown provenance details", () => {
    expect(decodeVoiceHandoff("  hello  ")).toEqual({
      v: 1,
      text: "hello",
      origin: "voice",
      language: "auto",
      disclosureVersion: "unknown",
      durationSeconds: null,
    });
  });
  it("rejects empty, malformed or non-voice payloads", () => {
    for (const raw of [
      "",
      "   ",
      null,
      undefined,
      "{",
      '{"v":1,"text":"","origin":"voice"}',
      '{"v":2,"text":"x","origin":"voice"}',
      '{"v":1,"text":"x","origin":"typed"}',
    ]) {
      expect(decodeVoiceHandoff(raw as never)).toBeNull();
    }
  });
  it("sanitises unknown language / oversized disclosure fields", () => {
    const d = decodeVoiceHandoff(
      JSON.stringify({
        ...h,
        language: "xx",
        disclosureVersion: "v".repeat(500),
      }),
    );
    expect(d?.language).toBe("auto");
    expect(d?.disclosureVersion.length).toBe(40);
  });
});
