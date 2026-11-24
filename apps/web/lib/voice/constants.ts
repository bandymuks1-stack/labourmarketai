/** Voice Work Journal — shared client/server bounds. Mirrors the caps the
 *  self-hosted transcription service enforces (services/transcribe). */

export const VOICE_MAX_BYTES = 25 * 1024 * 1024;
export const VOICE_MAX_SECONDS = 600;

/** Version tag of the external-processing disclosure copy the worker must
 *  acknowledge BEFORE recording. Bump when the disclosure text changes. */
export const VOICE_DISCLOSURE_VERSION = "2026-07-12.v1";

/** Closed MIME set accepted end-to-end (browser → proxy → service). */
export const VOICE_ALLOWED_MIME = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
] as const;

/** sessionStorage key for the reviewed-transcript hand-off into the ONE
 *  canonical journal composer. Holds the worker-edited transcript text only,
 *  read once and cleared by the composer. */
export const VOICE_TRANSCRIPT_DRAFT_KEY = "lmai:voice-transcript-draft";
