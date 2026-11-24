/**
 * VOICE CAPTURE MODEL - pure decisions behind the truthful voice states.
 *
 * No React, no DOM objects, no I/O: every function takes plain facts so each
 * state in the owner's list is unit-testable and a future door (chat composer,
 * mobile "Ask") reuses the SAME rules instead of re-deriving them:
 *
 *   microphone available · permission required · permission denied ·
 *   unsupported browser · recording · uploading · transcribing ·
 *   transcription failed · service unavailable · ready for review · cancelled
 *
 * Voice never claims to be available when the browser or the infrastructure
 * is not. Nothing here grants authority: this layer only describes capture.
 */

import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from "./constants";

// -- capability ---------------------------------------------------------------

export type VoiceUnsupportedReason =
  | "insecure_context" // getUserMedia needs https (or localhost)
  | "no_media_devices" // navigator.mediaDevices missing
  | "no_media_recorder" // MediaRecorder missing
  | "no_supported_mime"; // no audio container the service accepts

export type VoiceCapability =
  | { readonly kind: "available" }
  | { readonly kind: "unsupported"; readonly reason: VoiceUnsupportedReason }
  /** The site's own Permissions-Policy denies the microphone for this page. */
  | { readonly kind: "policy_blocked" };

export interface VoiceEnvironment {
  readonly isSecureContext: boolean;
  readonly hasMediaDevices: boolean;
  readonly hasMediaRecorder: boolean;
  /** First container MediaRecorder can produce that the service accepts, or "". */
  readonly recorderMime: string;
  /**
   * `document.permissionsPolicy?.allowsFeature("microphone")` (or the legacy
   * `featurePolicy`). `null` = the browser does not expose it (unknown).
   */
  readonly policyAllowsMicrophone: boolean | null;
}

export function detectVoiceCapability(env: VoiceEnvironment): VoiceCapability {
  if (!env.isSecureContext)
    return { kind: "unsupported", reason: "insecure_context" };
  if (!env.hasMediaDevices)
    return { kind: "unsupported", reason: "no_media_devices" };
  if (!env.hasMediaRecorder)
    return { kind: "unsupported", reason: "no_media_recorder" };
  // Policy is checked BEFORE the mime probe: a blocked page must say "blocked",
  // not "unsupported", so the person is not told to change browsers.
  if (env.policyAllowsMicrophone === false) return { kind: "policy_blocked" };
  if (!env.recorderMime)
    return { kind: "unsupported", reason: "no_supported_mime" };
  return { kind: "available" };
}

/** Preferred containers, in order; must all be members of VOICE_ALLOWED_MIME. */
export const RECORDER_MIME_CANDIDATES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
] as const;

export function pickRecorderMime(
  isTypeSupported: ((mime: string) => boolean) | null,
): string {
  if (!isTypeSupported) return "";
  for (const m of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(m)) return m;
    } catch {
      /* a throwing probe is "not supported" */
    }
  }
  return "";
}

/**
 * Speech needs far less than the encoder default. 48 kbps opus keeps ten
 * minutes at ~3.6 MB (well inside the 25 MB service cap) and a mobile upload
 * small. The service transcodes to 16 kHz mono anyway.
 */
export const RECORDER_BITS_PER_SECOND = 48_000;

// -- getUserMedia failures ----------------------------------------------------

export type MicFailure =
  | "permission_denied"
  | "no_device"
  | "device_busy"
  | "policy_blocked"
  | "unsupported"
  | "failed";

/**
 * Classify a getUserMedia rejection. `policyAllowsMicrophone === false` turns a
 * NotAllowedError into `policy_blocked`: the person cannot fix it in browser
 * settings, so the copy must not tell them to.
 */
export function classifyMicError(
  name: string | undefined,
  policyAllowsMicrophone: boolean | null,
): MicFailure {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return policyAllowsMicrophone === false
        ? "policy_blocked"
        : "permission_denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no_device";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "device_busy";
    case "TypeError":
      return "unsupported";
    default:
      return "failed";
  }
}

// -- upload / transcription failures ------------------------------------------

export type VoiceFailureCode =
  | "bad_mime"
  | "empty"
  | "too_large"
  | "too_long"
  | "undecodable"
  | "engine_failed"
  | "timeout"
  | "rate_limited"
  | "token_expired"
  | "unauthorized"
  | "service_unreachable"
  | "not_authenticated"
  | "no_worker_profile"
  | "internal";

/** Where a failure belongs in the truthful state list. */
export type VoiceFailureClass =
  | "service_unavailable"
  | "transcription_failed"
  | "input_problem"
  | "session";

export function failureClass(code: VoiceFailureCode): VoiceFailureClass {
  switch (code) {
    case "service_unreachable":
    case "rate_limited":
    case "timeout":
      return "service_unavailable";
    case "not_authenticated":
    case "no_worker_profile":
    case "unauthorized":
    case "token_expired":
      return "session";
    case "bad_mime":
    case "empty":
    case "too_large":
    case "too_long":
      return "input_problem";
    default:
      return "transcription_failed";
  }
}

const KNOWN_SERVICE_CODES: readonly VoiceFailureCode[] = [
  "bad_mime",
  "empty",
  "too_large",
  "too_long",
  "undecodable",
  "engine_failed",
  "rate_limited",
  "token_expired",
];

/**
 * Map the service's HTTP answer to a failure code. `status === 0` is a
 * network-level failure (no HTTP answer at all: offline, DNS, TLS, CORS,
 * server down) - reported honestly as "service unreachable", never as a
 * transcription problem.
 */
export function classifyUploadFailure(input: {
  status: number;
  code?: string | null;
  timedOut?: boolean;
}): VoiceFailureCode {
  if (input.timedOut) return "timeout";
  if (input.status === 0) return "service_unreachable";
  const c = (input.code ?? "") as VoiceFailureCode;
  if (KNOWN_SERVICE_CODES.includes(c)) return c;
  if (input.code === "token_used") return "token_expired";
  if (input.status === 401) return "unauthorized";
  if (input.status === 403) return "service_unreachable"; // origin not allowed = deployment misconfiguration
  if (input.status === 413) return "too_large";
  if (input.status === 415) return "bad_mime";
  if (input.status === 429) return "rate_limited";
  if (input.status >= 500) return "engine_failed";
  return "internal";
}

/** A token can be re-minted once transparently; anything else is shown. */
export function isRetryableWithFreshToken(code: VoiceFailureCode): boolean {
  return code === "token_expired";
}

// -- limits -------------------------------------------------------------------

export interface VoiceLimits {
  readonly maxBytes: number;
  readonly maxSeconds: number;
}
export const DEFAULT_VOICE_LIMITS: VoiceLimits = {
  maxBytes: VOICE_MAX_BYTES,
  maxSeconds: VOICE_MAX_SECONDS,
};

/** Client-side size gate. Returns the failure code or null when acceptable. */
export function checkAudioSize(
  bytes: number,
  limits: VoiceLimits = DEFAULT_VOICE_LIMITS,
): VoiceFailureCode | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return "empty";
  if (bytes > limits.maxBytes) return "too_large";
  return null;
}

export function formatLimits(limits: VoiceLimits = DEFAULT_VOICE_LIMITS): {
  minutes: number;
  megabytes: number;
} {
  return {
    minutes: Math.round(limits.maxSeconds / 60),
    megabytes: Math.round(limits.maxBytes / (1024 * 1024)),
  };
}

// -- speech language ----------------------------------------------------------

/** Languages the transcription service accepts (services/transcribe ALLOWED_LANG). */
export const SPEECH_LANGUAGES = [
  "lt",
  "en",
  "ru",
  "nl",
  "de",
  "pl",
  "lv",
  "et",
  "da",
  "no",
  "sv",
  "fi",
] as const;
export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number];
export type SpeechLanguageChoice = SpeechLanguage | "auto";

export function isSpeechLanguageChoice(v: unknown): v is SpeechLanguageChoice {
  return (
    v === "auto" ||
    (typeof v === "string" &&
      (SPEECH_LANGUAGES as readonly string[]).includes(v))
  );
}

/**
 * The DEFAULT only. A stored choice wins (the person chose it); otherwise the
 * UI locale when the service speaks it; otherwise auto-detect. It is never a
 * silent rule: the selector is always shown and always changeable, and the
 * choice is what is sent - an English UI does NOT imply English speech.
 */
export function defaultSpeechLanguage(
  uiLocale: string,
  stored: string | null | undefined,
): SpeechLanguageChoice {
  if (isSpeechLanguageChoice(stored)) return stored;
  const base = uiLocale.toLowerCase().split("-")[0];
  const norm = base === "nb" || base === "nn" ? "no" : base;
  return isSpeechLanguageChoice(norm) ? norm : "auto";
}

export const SPEECH_LANGUAGE_STORAGE_KEY = "lmai:voice-speech-language";

// -- provenance hand-off ------------------------------------------------------

/**
 * What the recorder hands to the ONE canonical journal flow. The text is the
 * worker-REVIEWED transcript; the rest is provenance for the saved entry.
 */
export interface VoiceHandoff {
  readonly v: 1;
  readonly text: string;
  readonly origin: "voice";
  /** The speech-language choice the worker made (a code or "auto"). */
  readonly language: SpeechLanguageChoice;
  /** Which disclosure copy the worker acknowledged before recording. */
  readonly disclosureVersion: string;
  readonly durationSeconds: number | null;
}

export function encodeVoiceHandoff(h: VoiceHandoff): string {
  return JSON.stringify(h);
}

/**
 * Parse a hand-off. Accepts the legacy plain-text form (pre-provenance) as a
 * voice draft with unknown language/disclosure so no in-flight draft is lost.
 */
export function decodeVoiceHandoff(
  raw: string | null | undefined,
): VoiceHandoff | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(trimmed) as Partial<VoiceHandoff>;
      const text = typeof o.text === "string" ? o.text.trim() : "";
      if (!text || o.v !== 1 || o.origin !== "voice") return null;
      return {
        v: 1,
        text,
        origin: "voice",
        language: isSpeechLanguageChoice(o.language) ? o.language : "auto",
        disclosureVersion:
          typeof o.disclosureVersion === "string"
            ? o.disclosureVersion.slice(0, 40)
            : "unknown",
        durationSeconds:
          typeof o.durationSeconds === "number" &&
          Number.isFinite(o.durationSeconds)
            ? o.durationSeconds
            : null,
      };
    } catch {
      return null;
    }
  }
  return {
    v: 1,
    text: trimmed,
    origin: "voice",
    language: "auto",
    disclosureVersion: "unknown",
    durationSeconds: null,
  };
}
