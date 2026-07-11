"use server";

import "server-only";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { VOICE_ALLOWED_MIME, VOICE_MAX_BYTES } from "@/lib/voice/constants";

/**
 * Voice Work Journal — server-side transcription proxy.
 *
 * The browser records audio and posts it HERE (a server action). This action
 * forwards the bytes to the LabourMarket.ai-controlled self-hosted whisper.cpp
 * service (services/transcribe) over a bearer-token server-to-server call.
 * The browser never sees the service URL or token, and this module NEVER logs
 * transcript or audio content — only sizes, codes and durations.
 *
 * Honest degradation: when the service env is not configured the caller gets
 * `{ status: "unavailable" }` and the UI shows the truthful "not configured"
 * state. Nothing is simulated, nothing is invented.
 *
 * NO DATABASE WRITE happens here — the reviewed transcript flows into the
 * existing canonical journal composer (createJournalEntry) only after the
 * worker explicitly confirms. Voice job persistence (history, provenance,
 * idempotent confirmation) arrives with the separately gated
 * voice_journal_jobs migration (PR L) and stays absent until the owner
 * applies it.
 */

const ALLOWED_MIME = new Set<string>(VOICE_ALLOWED_MIME);

const ALLOWED_LANG = new Set([
  "auto",
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
]);

const REQUEST_TIMEOUT_MS = 180_000;

export type VoiceTranscribeResult =
  | {
      status: "ok";
      transcript: string;
      language: string;
      durationSeconds: number;
    }
  | { status: "unavailable" }
  | {
      status: "error";
      code:
        | "not_authenticated"
        | "no_worker_profile"
        | "bad_mime"
        | "too_large"
        | "too_long"
        | "empty"
        | "undecodable"
        | "engine_failed"
        | "timeout"
        | "internal";
    };

/** True when the owner has configured the self-hosted transcription service.
 *  Server-only probe for the page shell — reveals nothing about the service. */
export async function isVoiceTranscriptionConfigured(): Promise<boolean> {
  return Boolean(env.VOICE_TRANSCRIBE_URL && env.VOICE_TRANSCRIBE_TOKEN);
}

export async function transcribeVoiceRecording(
  formData: FormData,
): Promise<VoiceTranscribeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", code: "not_authenticated" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return { status: "error", code: "no_worker_profile" };

  const url = env.VOICE_TRANSCRIBE_URL;
  const token = env.VOICE_TRANSCRIBE_TOKEN;
  if (!url || !token) return { status: "unavailable" };

  const audio = formData.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return { status: "error", code: "empty" };
  }
  if (audio.size > VOICE_MAX_BYTES) {
    return { status: "error", code: "too_large" };
  }
  const mime = (audio.type || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { status: "error", code: "bad_mime" };
  }
  const langRaw = String(formData.get("language") ?? "auto").toLowerCase();
  const language = ALLOWED_LANG.has(langRaw) ? langRaw : "auto";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/v1/transcribe?language=${language}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": mime,
        },
        body: Buffer.from(await audio.arrayBuffer()),
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (!res.ok) {
      let code: string | null = null;
      try {
        code = ((await res.json()) as { code?: string }).code ?? null;
      } catch {
        code = null;
      }
      const known = [
        "bad_mime",
        "too_large",
        "too_long",
        "empty",
        "undecodable",
        "engine_failed",
      ] as const;
      const mapped =
        known.find((k) => k === code) ?? ("engine_failed" as const);
      console.error(
        `[voice] transcribe failed http=${res.status} code=${mapped} bytes=${audio.size}`,
      );
      return { status: "error", code: mapped };
    }
    const body = (await res.json()) as {
      transcript?: string;
      language?: string;
      durationSeconds?: number;
    };
    const transcript = String(body.transcript ?? "").trim();
    if (!transcript) return { status: "error", code: "empty" };
    console.log(
      `[voice] transcribe ok bytes=${audio.size} durS=${body.durationSeconds ?? "?"}`,
    );
    return {
      status: "ok",
      transcript,
      language: String(body.language ?? language),
      durationSeconds: Number(body.durationSeconds ?? 0),
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    console.error(
      `[voice] transcribe ${aborted ? "timeout" : "network error"} bytes=${audio.size}`,
    );
    return { status: "error", code: aborted ? "timeout" : "internal" };
  } finally {
    clearTimeout(timer);
  }
}
