"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  RECORDER_BITS_PER_SECOND,
  SPEECH_LANGUAGES,
  SPEECH_LANGUAGE_STORAGE_KEY,
  checkAudioSize,
  classifyMicError,
  defaultSpeechLanguage,
  detectVoiceCapability,
  failureClass,
  formatLimits,
  isRetryableWithFreshToken,
  isSpeechLanguageChoice,
  pickRecorderMime,
  type MicFailure,
  type SpeechLanguageChoice,
  type VoiceCapability,
  type VoiceFailureCode,
  type VoiceLimits,
} from "@/lib/voice/capture-model";
import {
  VOICE_ALLOWED_MIME,
  VOICE_DISCLOSURE_VERSION,
  VOICE_MAX_SECONDS,
} from "@/lib/voice/constants";
import { createVoiceUploadSession } from "@/lib/voice/transcribe-action";
import { uploadForTranscription } from "@/lib/voice/upload-client";

/**
 * VOICE CAPTURE PANEL - the reusable voice DOOR (capture -> transcript -> review).
 *
 * It is an INPUT METHOD, never a feature of its own: it produces REVIEWED TEXT
 * and hands it to the caller (`onUse`). It imports no dispatch, capability or
 * journal module (pinned by lib/guards/voice-door-adapter-boundary.test.ts), so
 * whatever the text is then used for goes through the SAME canonical action
 * spine and authority as typed text. Voice grants no authority of its own.
 *
 * Truthful states (each is a distinct `data-state`, never a generic spinner):
 *   ready - permission_required - requesting - recording - paused - uploading -
 *   transcribing - review - cancelled - failed - service_unavailable -
 *   permission_denied - policy_blocked - unsupported - no_device - device_busy
 *
 * Honest by construction: no background recording (hidden page pauses, the
 * recorder is torn down on unmount), no invented progress (uploading comes from
 * real XHR upload events), the browser/site/infrastructure limits are named
 * when they are the cause, and a failed upload keeps the audio IN MEMORY ONLY
 * so "try again" does not force a re-recording. Raw audio is never persisted.
 */

type Phase =
  | "checking"
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "uploading"
  | "transcribing"
  | "review"
  | "failed"
  | "cancelled";

export interface VoiceCaptureResult {
  readonly text: string;
  readonly language: SpeechLanguageChoice;
  readonly durationSeconds: number | null;
  readonly disclosureVersion: string;
}

const TICK_MS = 500;
const ANNOUNCE_EVERY_S = 60;

function mimeBase(type: string): string {
  return (type || "").split(";")[0].trim().toLowerCase();
}

function readPolicyAllowsMicrophone(): boolean | null {
  try {
    const d = document as unknown as {
      permissionsPolicy?: { allowsFeature(f: string): boolean };
      featurePolicy?: { allowsFeature(f: string): boolean };
    };
    const p = d.permissionsPolicy ?? d.featurePolicy;
    return p ? p.allowsFeature("microphone") : null;
  } catch {
    return null;
  }
}

export function VoiceCapturePanel({
  serviceConfigured,
  onUse,
  useLabelKey = "useInJournal",
  disclosureVersion = VOICE_DISCLOSURE_VERSION,
}: {
  /** Server-probed truth: the self-hosted transcription service env exists. */
  serviceConfigured: boolean;
  /** The caller consumes the REVIEWED text. Return false if it could not. */
  onUse: (result: VoiceCaptureResult) => boolean;
  useLabelKey?: "useInJournal";
  disclosureVersion?: string;
}) {
  const t = useTranslations("journal.voice");
  const locale = useLocale();

  const [capability, setCapability] = useState<VoiceCapability | null>(null);
  const [permission, setPermission] = useState<
    "granted" | "prompt" | "denied" | null
  >(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [micProblem, setMicProblem] = useState<MicFailure | null>(null);
  const [failure, setFailure] = useState<VoiceFailureCode | null>(null);
  const [pausedBecauseHidden, setPausedBecauseHidden] = useState(false);
  const [notice, setNotice] = useState<"cancelled" | "interrupted_kept" | null>(
    null,
  );
  const [ack, setAck] = useState(false);
  const [language, setLanguage] = useState<SpeechLanguageChoice>("auto");
  const [elapsedS, setElapsedS] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [progress, setProgress] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [limits, setLimits] = useState<VoiceLimits | null>(null);
  const [handoffFailed, setHandoffFailed] = useState(false);
  const [handedOff, setHandedOff] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pendingRef = useRef<{ blob: Blob; mime: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const pausedAtRef = useRef(0);
  const finishingRef = useRef(false);
  const stopBtnRef = useRef<HTMLButtonElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLTextAreaElement | null>(null);
  const startBtnRef = useRef<HTMLButtonElement | null>(null);

  // -- environment detection (client only) ------------------------------------
  useEffect(() => {
    const hasRecorder = typeof MediaRecorder !== "undefined";
    setCapability(
      detectVoiceCapability({
        isSecureContext:
          typeof window !== "undefined" && window.isSecureContext,
        hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
        hasMediaRecorder: hasRecorder,
        recorderMime: pickRecorderMime(
          hasRecorder ? (m) => MediaRecorder.isTypeSupported(m) : null,
        ),
        policyAllowsMicrophone: readPolicyAllowsMicrophone(),
      }),
    );
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(SPEECH_LANGUAGE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    setLanguage(defaultSpeechLanguage(locale, stored));
    setPhase("idle");

    let status: PermissionStatus | null = null;
    const onChange = () =>
      status && setPermission(status.state as "granted" | "prompt" | "denied");
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        setPermission(s.state as "granted" | "prompt" | "denied");
        s.addEventListener?.("change", onChange);
      })
      .catch(() => setPermission(null));
    return () => status?.removeEventListener?.("change", onChange);
  }, [locale]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => {
      tr.onended = null;
      tr.stop();
    });
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  // No background recording: leaving the surface kills recorder, mic and audio.
  useEffect(() => {
    return () => {
      const rec = mediaRef.current;
      if (rec && rec.state !== "inactive") {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.stop();
      }
      stopStream();
      clearTimer();
      pendingRef.current = null;
      chunksRef.current = [];
    };
  }, [stopStream, clearTimer]);

  // -- focus management --------------------------------------------------------
  useEffect(() => {
    if (phase === "recording" && !pausedBecauseHidden)
      stopBtnRef.current?.focus();
    if (phase === "review") transcriptRef.current?.focus();
    if (phase === "failed") alertRef.current?.focus();
    if ((phase === "idle" || phase === "cancelled") && notice)
      startBtnRef.current?.focus();
  }, [phase, pausedBecauseHidden, notice]);

  const startTimer = useCallback(
    (onLimit: () => void) => {
      clearTimer();
      timerRef.current = setInterval(() => {
        const s = Math.floor(
          (Date.now() - startedAtRef.current - pausedTotalRef.current) / 1000,
        );
        setElapsedS(s);
        if (s > 0 && s % ANNOUNCE_EVERY_S === 0)
          setAnnounce(t("announceMinutes", { minutes: s / ANNOUNCE_EVERY_S }));
        if (s >= VOICE_MAX_SECONDS) onLimit();
      }, TICK_MS);
    },
    [clearTimer, t],
  );

  // -- transport ---------------------------------------------------------------
  const transcribe = useCallback(
    async (blob: Blob, mime: string) => {
      pendingRef.current = { blob, mime };
      setFailure(null);
      setProgress(0);
      setPhase("uploading");

      const fail = (code: VoiceFailureCode) => {
        setFailure(code);
        setPhase("failed");
      };

      let attempt = 0;
      // A single transparent re-mint covers an expired/used token; nothing else is retried silently.
      for (;;) {
        let session: Awaited<ReturnType<typeof createVoiceUploadSession>>;
        try {
          session = await createVoiceUploadSession();
        } catch {
          return fail("internal");
        }
        if (session.status === "unavailable")
          return fail("service_unreachable");
        if (session.status === "error") return fail(session.code);
        const lim: VoiceLimits = {
          maxBytes: session.maxBytes,
          maxSeconds: session.maxSeconds,
        };
        setLimits(lim);
        const sizeProblem = checkAudioSize(blob.size, lim);
        if (sizeProblem) return fail(sizeProblem);

        const res = await uploadForTranscription({
          url: session.uploadUrl,
          token: session.token,
          blob,
          mime,
          language,
          onProgress: setProgress,
          onUploaded: () => setPhase("transcribing"),
        });
        if (res.ok) {
          pendingRef.current = null;
          setTranscript(res.transcript);
          setDurationSeconds(res.durationSeconds || null);
          setPhase("review");
          return;
        }
        if (isRetryableWithFreshToken(res.code) && attempt === 0) {
          attempt += 1;
          setPhase("uploading");
          continue;
        }
        return fail(res.code);
      }
    },
    [language],
  );

  // -- recording ---------------------------------------------------------------
  const finish = useCallback(
    async (interrupted = false) => {
      const rec = mediaRef.current;
      if (!rec || finishingRef.current) return;
      finishingRef.current = true;
      clearTimer();
      const mime = mimeBase(rec.mimeType) || "audio/webm";
      if (rec.state !== "inactive") {
        await new Promise<void>((resolve) => {
          rec.onstop = () => resolve();
          rec.stop();
        });
      }
      stopStream();
      mediaRef.current = null;
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      finishingRef.current = false;
      setNotice(interrupted ? "interrupted_kept" : null);
      if (blob.size === 0) {
        setFailure("empty");
        setPhase("failed");
        return;
      }
      await transcribe(blob, mime);
    },
    [clearTimer, stopStream, transcribe],
  );

  const start = useCallback(async () => {
    if (!ack || !serviceConfigured || capability?.kind !== "available") return;
    setMicProblem(null);
    setFailure(null);
    setNotice(null);
    setHandoffFailed(false);
    setPhase("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : (e as { name?: string })?.name;
      setMicProblem(classifyMicError(name, readPolicyAllowsMicrophone()));
      setPhase("idle");
      return;
    }
    const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: RECORDER_BITS_PER_SECOND,
      });
    } catch {
      stream.getTracks().forEach((tr) => tr.stop());
      setMicProblem("unsupported");
      setPhase("idle");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    // The device went away mid-recording (unplugged, a call took the mic):
    // keep what was captured and say so - never silently lose it.
    stream.getAudioTracks().forEach((tr) => {
      tr.onended = () => {
        if (mediaRef.current === rec && rec.state !== "inactive")
          void finish(true);
      };
    });
    mediaRef.current = rec;
    rec.start(1000);
    startedAtRef.current = Date.now();
    pausedTotalRef.current = 0;
    setElapsedS(0);
    setAnnounce(t("announceStarted"));
    setPausedBecauseHidden(false);
    setPhase("recording");
    startTimer(() => void finish(false));
  }, [ack, serviceConfigured, capability, finish, startTimer, t]);

  const pause = useCallback((becauseHidden = false) => {
    const rec = mediaRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    pausedAtRef.current = Date.now();
    setPausedBecauseHidden(becauseHidden);
    setPhase("paused");
  }, []);

  const resume = useCallback(() => {
    const rec = mediaRef.current;
    if (!rec || rec.state !== "paused") return;
    pausedTotalRef.current += Date.now() - pausedAtRef.current;
    rec.resume();
    setPausedBecauseHidden(false);
    setPhase("recording");
  }, []);

  // A hidden page pauses the recorder: there is no background recording.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") pause(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pause]);

  const cancel = useCallback(() => {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") {
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.stop();
    }
    clearTimer();
    stopStream();
    chunksRef.current = [];
    pendingRef.current = null;
    mediaRef.current = null;
    setElapsedS(0);
    setNotice("cancelled");
    setPhase("cancelled");
  }, [clearTimer, stopStream]);

  const discard = useCallback(() => {
    pendingRef.current = null;
    setTranscript("");
    setFailure(null);
    setNotice(null);
    setPhase("idle");
  }, []);

  const onFilePicked = useCallback(
    (file: File | null) => {
      if (!file || !ack) return;
      const mime = mimeBase(file.type);
      if (!(VOICE_ALLOWED_MIME as readonly string[]).includes(mime)) {
        setFailure("bad_mime");
        setPhase("failed");
        return;
      }
      setNotice(null);
      void transcribe(file, mime);
    },
    [ack, transcribe],
  );

  const retryUpload = useCallback(() => {
    const p = pendingRef.current;
    if (p) void transcribe(p.blob, p.mime);
  }, [transcribe]);

  const useText = useCallback(() => {
    const text = transcript.trim();
    if (!text) return;
    const ok = onUse({ text, language, durationSeconds, disclosureVersion });
    if (ok) setHandedOff(true);
    else setHandoffFailed(true);
  }, [transcript, language, durationSeconds, disclosureVersion, onUse]);

  const changeLanguage = (v: string) => {
    if (!isSpeechLanguageChoice(v)) return;
    setLanguage(v);
    try {
      window.localStorage.setItem(SPEECH_LANGUAGE_STORAGE_KEY, v);
    } catch {
      /* the choice still applies for this session */
    }
  };

  // -- derived presentation ----------------------------------------------------
  const languageNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      return null;
    }
  }, [locale]);
  const limitsText = formatLimits(limits ?? undefined);

  const stateName: string = (() => {
    if (!serviceConfigured) return "service_unavailable";
    if (phase === "checking") return "checking";
    if (phase === "idle" || phase === "cancelled") {
      if (capability?.kind === "policy_blocked") return "policy_blocked";
      if (capability?.kind === "unsupported") return "unsupported";
      if (micProblem === "policy_blocked") return "policy_blocked";
      if (micProblem === "permission_denied" || permission === "denied")
        return "permission_denied";
      if (micProblem === "no_device") return "no_device";
      if (micProblem === "device_busy") return "device_busy";
      if (micProblem) return "unsupported";
      if (phase === "cancelled") return "cancelled";
      return permission === "prompt" ? "permission_required" : "ready";
    }
    if (phase === "failed") {
      const cls = failure ? failureClass(failure) : "transcription_failed";
      return cls === "service_unavailable" ? "service_unavailable" : "failed";
    }
    return phase;
  })();

  const btn =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue";
  const primary = `${btn} bg-brand-blue text-text-on-brand disabled:cursor-not-allowed disabled:opacity-50`;
  const secondary = `${btn} border border-border bg-surface-1 text-text-primary`;
  const quiet = `${btn} border border-border bg-surface-1 text-text-secondary`;
  const card =
    "rounded-lg border border-border bg-surface-1 p-3 text-sm leading-relaxed text-text-secondary";

  const minutes = String(Math.floor(elapsedS / 60)).padStart(2, "0");
  const seconds = String(elapsedS % 60).padStart(2, "0");
  const canCapture = capability?.kind === "available";
  const idleLike = phase === "idle" || phase === "cancelled";

  if (!serviceConfigured) {
    return (
      <div
        className={card}
        data-testid="voice-unavailable"
        data-state="service_unavailable"
        role="status"
      >
        {t("unavailable")}
      </div>
    );
  }

  const stateMessage: Record<string, string | null> = {
    ready: t("state.ready"),
    permission_required: t("state.permissionRequired"),
    permission_denied: t("permissionDenied"),
    policy_blocked: t("state.policyBlocked"),
    unsupported: t("state.unsupported"),
    no_device: t("state.noDevice"),
    device_busy: t("state.deviceBusy"),
    cancelled: t("state.cancelled"),
    requesting: t("state.requesting"),
  };

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="voice-recorder"
      data-state={stateName}
    >
      {/* One persistent polite region: every state change is announced once. */}
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        data-testid="voice-announce"
      >
        {announce}
      </p>

      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("disclosureTitle")}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-text-secondary">
          <li>{t("disclosureProcessing")}</li>
          <li>{t("disclosureWhy")}</li>
          <li>{t("disclosureRetention")}</li>
          <li>{t("disclosureNoAutoWrite")}</li>
          <li>{t("disclosureProvenance")}</li>
        </ul>
        <label
          data-tap-floor="off"
          className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text-primary"
        >
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            disabled={phase === "recording" || phase === "paused"}
            className="h-5 w-5 rounded border-border"
            data-testid="voice-disclosure-ack"
          />
          {t("disclosureAck")}
        </label>
      </div>

      {idleLike && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="voice-language"
              className="text-sm font-medium text-text-primary"
            >
              {t("language.label")}
            </label>
            <select
              id="voice-language"
              value={language}
              onChange={(e) => changeLanguage(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-surface-1 px-3 text-sm text-text-primary"
              data-testid="voice-language"
            >
              <option value="auto">{t("language.auto")}</option>
              {SPEECH_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {languageNames?.of(l) ?? l}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-secondary">{t("language.hint")}</p>
          </div>

          {stateMessage[stateName] && (
            <p
              className={card}
              role={
                stateName === "ready" ||
                stateName === "permission_required" ||
                stateName === "cancelled"
                  ? "status"
                  : "alert"
              }
              data-testid={
                stateName === "permission_denied"
                  ? "voice-permission-denied"
                  : "voice-state"
              }
              data-state={stateName}
            >
              {stateMessage[stateName]}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              ref={startBtnRef}
              type="button"
              onClick={() => void start()}
              disabled={!ack || !canCapture}
              className={primary}
              data-tap-floor="off"
              data-testid="voice-start"
            >
              {micProblem ? t("retry") : t("start")}
            </button>
            <label
              data-tap-floor="off"
              className={`${secondary} cursor-pointer ${ack ? "" : "pointer-events-none opacity-50"}`}
            >
              {t("uploadInstead")}
              <input
                type="file"
                accept={VOICE_ALLOWED_MIME.join(",")}
                className="sr-only"
                onChange={(e) => {
                  onFilePicked(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
                disabled={!ack}
                data-testid="voice-file-input"
              />
            </label>
          </div>
          <p className="text-xs text-text-secondary">
            {t("limitsNote", {
              minutes: limitsText.minutes,
              megabytes: limitsText.megabytes,
            })}
          </p>
        </div>
      )}

      {phase === "requesting" && (
        <p
          className={card}
          role="status"
          data-testid="voice-state"
          data-state="requesting"
        >
          {stateMessage.requesting}
        </p>
      )}

      {(phase === "recording" || phase === "paused") && (
        <div
          className="flex flex-col gap-3"
          data-testid="voice-recording"
          data-state={phase}
        >
          <p
            className="font-mono text-2xl tabular-nums text-text-primary"
            role="timer"
            aria-live="off"
            data-testid="voice-timer"
          >
            {minutes}:{seconds}
          </p>
          <p
            className="text-sm text-text-secondary"
            role="status"
            data-testid="voice-state"
            data-state={phase}
          >
            {phase === "recording"
              ? t("recordingNow")
              : pausedBecauseHidden
                ? t("state.interrupted")
                : t("pausedNow")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {phase === "recording" ? (
              <button
                type="button"
                onClick={() => pause(false)}
                className={secondary}
                data-tap-floor="off"
                data-testid="voice-pause"
              >
                {t("pause")}
              </button>
            ) : (
              <button
                type="button"
                onClick={resume}
                className={secondary}
                data-tap-floor="off"
                data-testid="voice-resume"
              >
                {t("resume")}
              </button>
            )}
            <button
              ref={stopBtnRef}
              type="button"
              onClick={() => void finish(false)}
              className={primary}
              data-tap-floor="off"
              data-testid="voice-stop"
            >
              {t("stop")}
            </button>
            <button
              type="button"
              onClick={cancel}
              className={quiet}
              data-tap-floor="off"
              data-testid="voice-cancel"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {phase === "uploading" && (
        <div
          className={card}
          role="status"
          data-testid="voice-uploading"
          data-state="uploading"
        >
          <p>{t("state.uploading")}</p>
          <progress
            className="mt-2 h-2 w-full"
            max={100}
            value={Math.round(progress * 100)}
            aria-label={t("state.uploading")}
          />
        </div>
      )}

      {phase === "transcribing" && (
        <p
          className={card}
          role="status"
          data-testid="voice-processing"
          data-state="transcribing"
        >
          {t("processing")}
        </p>
      )}

      {phase === "failed" && (
        <div
          ref={alertRef}
          tabIndex={-1}
          className={card}
          role="alert"
          data-testid="voice-error"
          data-state={stateName}
          data-code={failure ?? "internal"}
        >
          <p>
            {t(`errors.${failure ?? "internal"}`, {
              minutes: limitsText.minutes,
              megabytes: limitsText.megabytes,
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {pendingRef.current &&
              failure &&
              failureClass(failure) !== "input_problem" &&
              failureClass(failure) !== "session" && (
                <button
                  type="button"
                  onClick={retryUpload}
                  className={primary}
                  data-tap-floor="off"
                  data-testid="voice-retry"
                >
                  {t("retry")}
                </button>
              )}
            <button
              type="button"
              onClick={discard}
              className={secondary}
              data-tap-floor="off"
              data-testid="voice-record-again"
            >
              {t("recordAgain")}
            </button>
          </div>
        </div>
      )}

      {phase === "review" && (
        <div
          className="flex flex-col gap-3"
          data-testid="voice-review"
          data-state="review"
        >
          {notice === "interrupted_kept" && (
            <p
              className={card}
              role="status"
              data-testid="voice-interrupted-note"
            >
              {t("state.interruptedKept")}
            </p>
          )}
          <h2 className="font-display text-base font-semibold text-text-primary">
            {t("reviewTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("reviewHint")}
          </p>
          <textarea
            ref={transcriptRef}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            aria-label={t("reviewTitle")}
            rows={10}
            className="w-full rounded-lg border border-border bg-surface-1 p-3 text-sm leading-relaxed text-text-primary"
            data-testid="voice-transcript"
          />
          {handoffFailed && (
            <p role="alert" className="text-sm text-text-secondary">
              {t("errors.handoff_failed")}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={useText}
              disabled={!transcript.trim() || handedOff}
              className={primary}
              data-tap-floor="off"
              data-testid="voice-use-in-journal"
            >
              {t(useLabelKey)}
            </button>
            <button
              type="button"
              onClick={discard}
              className={quiet}
              data-tap-floor="off"
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
