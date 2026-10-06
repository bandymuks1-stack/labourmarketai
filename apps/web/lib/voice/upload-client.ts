import { classifyUploadFailure, type VoiceFailureCode } from "./capture-model";

/**
 * Browser -> transcription service upload. XMLHttpRequest, not fetch, because
 * fetch cannot report UPLOAD progress and the voice surface must tell the truth
 * about which stage it is in: "uploading" (bytes still leaving the device) is a
 * different state from "transcribing" (the service has the audio and is
 * working). Nothing here is simulated: `onUploaded` fires from the real
 * `upload.load` event, and no percentage is ever invented.
 *
 * The audio goes to the service the app minted a token for; the token is a
 * short-lived single-use credential (see transcribe-action.ts), never the
 * master secret. This module never logs audio or transcript content.
 */

export type VoiceUploadResult =
  | { ok: true; transcript: string; language: string; durationSeconds: number }
  | { ok: false; code: VoiceFailureCode; status: number };

export interface VoiceUploadInput {
  readonly url: string;
  readonly token: string;
  readonly blob: Blob;
  /** Container actually sent (lower-case, no codec suffix). */
  readonly mime: string;
  /** A service-accepted language code or "auto". */
  readonly language: string;
  readonly timeoutMs?: number;
  /** 0..1 of bytes sent; only called from real progress events. */
  readonly onProgress?: (fraction: number) => void;
  /** The service now has the whole upload and is transcribing. */
  readonly onUploaded?: () => void;
  readonly signal?: AbortSignal;
}

export const VOICE_UPLOAD_TIMEOUT_MS = 180_000;

export function uploadForTranscription(
  input: VoiceUploadInput,
): Promise<VoiceUploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const done = (r: VoiceUploadResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const fail = (status: number, code: string | null, timedOut = false) =>
      done({
        ok: false,
        code: classifyUploadFailure({ status, code, timedOut }),
        status,
      });

    const sep = input.url.includes("?") ? "&" : "?";
    xhr.open(
      "POST",
      `${input.url}${sep}language=${encodeURIComponent(input.language)}`,
    );
    xhr.timeout = input.timeoutMs ?? VOICE_UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("authorization", `Bearer ${input.token}`);
    xhr.setRequestHeader("content-type", input.mime);
    xhr.responseType = "text";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0)
        input.onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.upload.onload = () => {
      input.onProgress?.(1);
      input.onUploaded?.();
    };
    xhr.onerror = () => fail(0, null);
    xhr.ontimeout = () => fail(xhr.status, null, true);
    xhr.onabort = () => fail(0, null);
    xhr.onload = () => {
      let body: {
        transcript?: unknown;
        language?: unknown;
        durationSeconds?: unknown;
        code?: unknown;
      } = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        body = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const transcript = String(body.transcript ?? "").trim();
        if (!transcript)
          return done({ ok: false, code: "empty", status: xhr.status });
        return done({
          ok: true,
          transcript,
          language: String(body.language ?? input.language),
          durationSeconds: Number(body.durationSeconds ?? 0) || 0,
        });
      }
      fail(xhr.status, typeof body.code === "string" ? body.code : null);
    };

    input.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(input.blob);
  });
}
