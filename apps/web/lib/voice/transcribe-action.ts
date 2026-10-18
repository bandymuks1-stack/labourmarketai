"use server";

import "server-only";
import { outboundIntegrationUrl } from "@/lib/config/outbound-host-policy";
import { readRequestHost } from "@/lib/config/request-host";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from "@/lib/voice/constants";
import {
  UPLOAD_TOKEN_TTL_SECONDS,
  mintUploadToken,
} from "@/lib/voice/upload-token";

/**
 * VOICE_TRANSCRIBE_URL after the PRODUCTION host policy (2026-09-23): on the
 * production deployment a loopback / private / tunnel host - i.e. the service
 * running on somebody's workstation - is refused and the surface shows its
 * honest "not configured" state. The host must be an always-on VM or
 * container service (services/transcribe/README.md § Deploy).
 */
async function transcribeServiceUrl(): Promise<string | undefined> {
  return outboundIntegrationUrl(env.VOICE_TRANSCRIBE_URL, {
    integration: "VOICE_TRANSCRIBE_URL",
    requestHost: await readRequestHost(),
  });
}

/**
 * Voice Work Journal - UPLOAD SESSION (replaces the audio-proxy action).
 *
 * WHY THE AUDIO NO LONGER TRAVELS THROUGH THIS APP. The advertised recording
 * is 25 MB / 10 minutes. A Server Action is capped at 5 MB (and the GLOBAL
 * action limit must not be raised for one feature), and the platform caps any
 * function request body at ~4.5 MB, so a 25 MB upload can only be honest if it
 * goes straight from the browser to the transcription service.
 *
 * THE SECURITY MODEL IS PRESERVED, NOT WEAKENED:
 *   - this action authenticates the person. ANY signed-in identity (worker,
 *     employer, agency) may dictate: speech-to-text grants NO authority - what
 *     the text then does is decided by the same chat spine and server-side
 *     authority as typed text;
 *   - the browser never receives the master secret: it receives a SHORT-LIVED
 *     (120 s), SINGLE-USE, byte-bounded token signed with it, carrying only an
 *     OPAQUE subject (no profile id leaves this app);
 *   - the service accepts that token only from an exact allow-listed origin
 *     and rate-limits per subject (services/transcribe/upload-auth.mjs);
 *   - the raw audio is never stored by this app and is deleted by the service
 *     as soon as the text is ready; nothing is logged but sizes and codes;
 *   - minting is rate-limited per person.
 *
 * Honest degradation: when the service env is not configured the caller gets
 * `{ status: "unavailable" }` and the UI shows the truthful state. Nothing is
 * simulated. NO DATABASE WRITE happens here; the reviewed transcript reaches
 * the canonical journal only after the worker's explicit confirmation.
 */

export type VoiceUploadSession =
  | {
      status: "ok";
      /** Absolute URL of the service's transcribe endpoint (no secret in it). */
      uploadUrl: string;
      token: string;
      /** Unix seconds. */
      expiresAt: number;
      maxBytes: number;
      maxSeconds: number;
    }
  | { status: "unavailable" }
  | {
      status: "error";
      code:
        | "not_authenticated"
        | "rate_limited"
        | "internal";
    };

/** True when the owner has configured the self-hosted transcription service.
 *  Server-only probe for the page shell - reveals nothing about the service. */
export async function isVoiceTranscriptionConfigured(): Promise<boolean> {
  return Boolean((await transcribeServiceUrl()) && env.VOICE_TRANSCRIBE_TOKEN);
}

export async function createVoiceUploadSession(): Promise<VoiceUploadSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", code: "not_authenticated" };

  const url = await transcribeServiceUrl();
  const secret = env.VOICE_TRANSCRIBE_TOKEN;
  if (!url || !secret) return { status: "unavailable" };

  // A person records a handful of times a day; this only stops a loop.
  if (
    rateLimit({
      name: "voice_upload_session",
      key: user.id,
      limit: 30,
      windowMs: 10 * 60_000,
    }).limited
  ) {
    return { status: "error", code: "rate_limited" };
  }

  try {
    const { token, claims } = mintUploadToken({
      secret,
      profileId: user.id,
      maxBytes: VOICE_MAX_BYTES,
      ttlSeconds: UPLOAD_TOKEN_TTL_SECONDS,
    });
    return {
      status: "ok",
      uploadUrl: `${url.replace(/\/$/, "")}/v1/transcribe`,
      token,
      expiresAt: claims.exp,
      maxBytes: VOICE_MAX_BYTES,
      maxSeconds: VOICE_MAX_SECONDS,
    };
  } catch {
    console.error("[voice] upload session mint failed");
    return { status: "error", code: "internal" };
  }
}
