"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import {
  transcribeVoiceRecording,
  type VoiceTranscribeResult,
} from "@/lib/voice/transcribe-action";
import {
  VOICE_ALLOWED_MIME,
  VOICE_MAX_BYTES,
  VOICE_MAX_SECONDS,
  VOICE_TRANSCRIPT_DRAFT_KEY,
} from "@/lib/voice/constants";

/**
 * Voice Work Journal recorder — an INPUT METHOD into the ONE canonical
 * journal composer, never a second journal.
 *
 * Flow: explicit external-processing disclosure acknowledgement →
 * record (start/pause/resume/stop/cancel, elapsed time, hard caps) or pick a
 * file → server-action transcription (browser never talks to the service) →
 * worker reviews and freely EDITS the transcript → "use in journal" stores
 * the edited text for the composer and navigates to the journal surface,
 * where the existing suggestion-review stage gives per-item accept/reject and
 * the existing journal save action stays the only write path.
 *
 * Honesty rules: no background recording (recorder is torn down on unmount),
 * no invented progress, permission-denied gets a real retry state, and when the
 * transcription service is not configured the surface says so plainly.
 */

type RecorderPhase =
  | "idle"
  | "recording"
  | "paused"
  | "processing"
  | "review"
  | "denied"
  | "failed";

const TICK_MS = 500;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm", "audio/ogg", "audio/mp4"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

export function VoiceJournalRecorder({
  serviceConfigured,
}: {
  /** Server-probed truth: the self-hosted transcription service env exists.
   *  False renders the honest "not configured" state — nothing is invented. */
  serviceConfigured: boolean;
}) {
  const t = useTranslations("journal.voice");
  const locale = useLocale();
  const router = useRouter();

  const [ackDisclosure, setAckDisclosure] = useState(false);
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsedS, setElapsedS] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [handedOff, setHandedOff] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const pausedAtRef = useRef(0);

  function stopStream() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }

  // No background recording: leaving the surface kills recorder + mic.
  useEffect(() => {
    return () => {
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        mediaRef.current.stop();
      }
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const activeMs =
        Date.now() - startedAtRef.current - pausedTotalRef.current;
      const s = Math.floor(activeMs / 1000);
      setElapsedS(s);
      if (s >= VOICE_MAX_SECONDS) {
        void finishRecording();
      }
    }, TICK_MS);
  }

  async function startRecording() {
    if (!ackDisclosure || !serviceConfigured) return;
    setErrorCode(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRef.current = rec;
      rec.start(1000);
      startedAtRef.current = Date.now();
      pausedTotalRef.current = 0;
      setElapsedS(0);
      setPhase("recording");
      startTimer();
    } catch {
      // Permission denied or no device — honest retry state, never silent.
      stopStream();
      setPhase("denied");
    }
  }

  function pauseRecording() {
    const rec = mediaRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    pausedAtRef.current = Date.now();
    setPhase("paused");
  }

  function resumeRecording() {
    const rec = mediaRef.current;
    if (!rec || rec.state !== "paused") return;
    pausedTotalRef.current += Date.now() - pausedAtRef.current;
    rec.resume();
    setPhase("recording");
  }

  function cancelRecording() {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") {
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    stopStream();
    chunksRef.current = [];
    mediaRef.current = null;
    setElapsedS(0);
    setPhase("idle");
  }

  async function finishRecording() {
    const rec = mediaRef.current;
    if (!rec || rec.state === "inactive") return;
    if (timerRef.current) clearInterval(timerRef.current);
    const mimeType = rec.mimeType || "audio/webm";
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    stopStream();
    mediaRef.current = null;
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    await submitAudio(blob);
  }

  async function submitAudio(blob: Blob) {
    if (blob.size === 0) {
      setErrorCode("empty");
      setPhase("failed");
      return;
    }
    if (blob.size > VOICE_MAX_BYTES) {
      setErrorCode("too_large");
      setPhase("failed");
      return;
    }
    setPhase("processing");
    setErrorCode(null);
    const fd = new FormData();
    fd.set("audio", blob);
    fd.set("language", locale);
    let result: VoiceTranscribeResult;
    try {
      result = await transcribeVoiceRecording(fd);
    } catch {
      result = { status: "error", code: "internal" };
    }
    if (result.status === "ok") {
      setTranscript(result.transcript);
      setPhase("review");
      return;
    }
    setErrorCode(result.status === "error" ? result.code : "unavailable");
    setPhase("failed");
  }

  function onFilePicked(file: File | null) {
    if (!file) return;
    const mime = (file.type || "").split(";")[0].trim().toLowerCase();
    if (!(VOICE_ALLOWED_MIME as readonly string[]).includes(mime)) {
      setErrorCode("bad_mime");
      setPhase("failed");
      return;
    }
    void submitAudio(file);
  }

  function useInJournal() {
    const text = transcript.trim();
    if (!text) return;
    try {
      window.sessionStorage.setItem(VOICE_TRANSCRIPT_DRAFT_KEY, text);
    } catch {
      // Storage unavailable (private mode edge) — the worker still has the
      // text on screen; we simply cannot hand it off automatically.
      setErrorCode("handoff_failed");
      return;
    }
    setHandedOff(true);
    router.push("/dashboard/journal#journal-composer");
  }

  const minutes = String(Math.floor(elapsedS / 60)).padStart(2, "0");
  const seconds = String(elapsedS % 60).padStart(2, "0");
  const btn =
    "inline-flex min-h-[2.75rem] items-center justify-center rounded-lg px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue";

  if (!serviceConfigured) {
    return (
      <div
        className="rounded-xl border border-border bg-surface-1 p-4 text-sm leading-relaxed text-text-secondary"
        data-testid="voice-unavailable"
        role="status"
      >
        {t("unavailable")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="voice-recorder">
      {/* Explicit external-processing disclosure — must be acknowledged BEFORE
          the microphone can start. Nothing uploads, nothing updates the
          journal/profile/CV before the worker's explicit confirmations. */}
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("disclosureTitle")}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-text-secondary">
          <li>{t("disclosureProcessing")}</li>
          <li>{t("disclosureWhy")}</li>
          <li>{t("disclosureRetention")}</li>
          <li>{t("disclosureNoAutoWrite")}</li>
        </ul>
        <label className="mt-3 flex min-h-[2.75rem] cursor-pointer items-center gap-3 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={ackDisclosure}
            onChange={(e) => setAckDisclosure(e.target.checked)}
            disabled={phase === "recording" || phase === "paused"}
            className="h-5 w-5 rounded border-border"
            data-testid="voice-disclosure-ack"
          />
          {t("disclosureAck")}
        </label>
      </div>

      {(phase === "idle" || phase === "denied" || phase === "failed") && (
        <div className="flex flex-col gap-3">
          {phase === "denied" && (
            <p
              className="rounded-lg border border-border bg-surface-1 p-3 text-sm text-text-secondary"
              role="alert"
              data-testid="voice-permission-denied"
            >
              {t("permissionDenied")}
            </p>
          )}
          {phase === "failed" && (
            <p
              className="rounded-lg border border-border bg-surface-1 p-3 text-sm text-text-secondary"
              role="alert"
              data-testid="voice-error"
            >
              {t(`errors.${errorCode ?? "internal"}`)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={!ackDisclosure}
              className={`${btn} bg-brand-blue text-white disabled:cursor-not-allowed disabled:opacity-50`}
              data-testid="voice-start"
            >
              {phase === "denied" || phase === "failed"
                ? t("retry")
                : t("start")}
            </button>
            <label
              className={`${btn} cursor-pointer border border-border bg-surface-1 text-text-primary ${ackDisclosure ? "" : "pointer-events-none opacity-50"}`}
            >
              {t("uploadInstead")}
              <input
                type="file"
                accept={VOICE_ALLOWED_MIME.join(",")}
                className="sr-only"
                onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
                disabled={!ackDisclosure}
                data-testid="voice-file-input"
              />
            </label>
          </div>
          <p className="text-xs text-text-secondary">{t("limitsNote")}</p>
        </div>
      )}

      {(phase === "recording" || phase === "paused") && (
        <div className="flex flex-col gap-3" data-testid="voice-recording">
          <p
            className="font-mono text-2xl tabular-nums text-text-primary"
            role="timer"
            aria-live="polite"
          >
            {minutes}:{seconds}
          </p>
          <p className="text-sm text-text-secondary">
            {phase === "recording" ? t("recordingNow") : t("pausedNow")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {phase === "recording" ? (
              <button
                type="button"
                onClick={pauseRecording}
                className={`${btn} border border-border bg-surface-1 text-text-primary`}
                data-testid="voice-pause"
              >
                {t("pause")}
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeRecording}
                className={`${btn} border border-border bg-surface-1 text-text-primary`}
                data-testid="voice-resume"
              >
                {t("resume")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void finishRecording()}
              className={`${btn} bg-brand-blue text-white`}
              data-testid="voice-stop"
            >
              {t("stop")}
            </button>
            <button
              type="button"
              onClick={cancelRecording}
              className={`${btn} border border-border bg-surface-1 text-text-secondary`}
              data-testid="voice-cancel"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <p
          className="rounded-lg border border-border bg-surface-1 p-3 text-sm text-text-secondary"
          role="status"
          data-testid="voice-processing"
        >
          {t("processing")}
        </p>
      )}

      {phase === "review" && (
        <div className="flex flex-col gap-3" data-testid="voice-review">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {t("reviewTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("reviewHint")}
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-border bg-surface-1 p-3 text-sm leading-relaxed text-text-primary"
            data-testid="voice-transcript"
          />
          {errorCode === "handoff_failed" && (
            <p role="alert" className="text-sm text-text-secondary">
              {t("errors.handoff_failed")}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={useInJournal}
              disabled={!transcript.trim() || handedOff}
              className={`${btn} bg-brand-blue text-white disabled:cursor-not-allowed disabled:opacity-50`}
              data-testid="voice-use-in-journal"
            >
              {t("useInJournal")}
            </button>
            <button
              type="button"
              onClick={() => {
                setTranscript("");
                setPhase("idle");
              }}
              className={`${btn} border border-border bg-surface-1 text-text-secondary`}
              data-testid="voice-discard"
            >
              {t("discard")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
