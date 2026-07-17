"use client";
/**
 * Answer page analytics — bounded, PII-free. Uses the existing telemetry pipe
 * (recordEvent) with ONLY allowlisted keys (surface, entity_type=category). No
 * question/answer text, no profile/skills/CV, no personal data.
 */
import { useEffect, useRef } from "react";
import { recordEvent } from "@/lib/telemetry/task";

export function AnswerPageViewed({ category }: { category: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    recordEvent("answer_page_viewed", { surface: "answer_page", entity_type: category });
  }, [category]);
  return null;
}
