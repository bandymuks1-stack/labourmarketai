"use client";

import { useCallback } from "react";
import { useRouter } from "@/lib/i18n/navigation";
import {
  VoiceCapturePanel,
  type VoiceCaptureResult,
} from "@/components/app/voice/voice-capture-panel";
import { encodeVoiceHandoff } from "@/lib/voice/capture-model";
import { VOICE_TRANSCRIPT_DRAFT_KEY } from "@/lib/voice/constants";

/**
 * Voice Work Journal entry - an INPUT METHOD into the ONE canonical chat work
 * log (never a second journal). The capture/review door is VoiceCapturePanel;
 * this wrapper only hands the REVIEWED text, with its provenance (origin,
 * speech language, disclosure version), to the chat via sessionStorage, where
 * the existing work-log preview, explicit confirmation and canonical
 * canonical journal write remain the only write path.
 */
export function VoiceJournalRecorder({
  serviceConfigured,
}: {
  serviceConfigured: boolean;
}) {
  const router = useRouter();
  const onUse = useCallback(
    (r: VoiceCaptureResult): boolean => {
      try {
        window.sessionStorage.setItem(
          VOICE_TRANSCRIPT_DRAFT_KEY,
          encodeVoiceHandoff({
            v: 1,
            text: r.text,
            origin: "voice",
            language: r.language,
            disclosureVersion: r.disclosureVersion,
            durationSeconds: r.durationSeconds,
          }),
        );
      } catch {
        return false;
      }
      router.push("/dashboard");
      return true;
    },
    [router],
  );
  return (
    <VoiceCapturePanel serviceConfigured={serviceConfigured} onUse={onUse} />
  );
}
