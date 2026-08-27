"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { LabSwitch } from "../lab-switch";
import { LabErrorBoundary } from "../lab-error-boundary";
import { MobileScrim } from "../r2/mobile-scrim";
import { useBudget, useReducedMotion } from "../r2/quality";
import { useStory } from "../r2/story";

const WeatherCanvas = dynamic(
  () => import("./weather-scene").then((m) => m.WeatherCanvas),
  { ssr: false },
);

const INK = "#EAF1FA";
const DIM = "#7E8B9C";

const BEATS = [
  {
    eyebrow: "01 — the volume, not the map",
    title: "Nobody stands still in a labour market.",
    body: "Every strand is somebody moving — between work, between places, between what they used to do and what they can do next. A board of postings cannot show this. A field can.",
  },
  {
    eyebrow: "02 — a need is a low pressure",
    title: "Needs do not sit there waiting to be found.",
    body: "They pull. Whoever is close enough, and enough like it, turns first — and you can watch which currents bend and which carry on past.",
  },
  {
    eyebrow: "03 — and then it is people",
    title: "Fly close enough and a current is a crew.",
    body: "The weather view is only the far one. Underneath every bright braid there are individual records, individual evidence, individual decisions about what to do in March.",
  },
];

export function WeatherExperience({ locale }: { readonly locale: string }) {
  const budget = useBudget();
  const reduced = useReducedMotion();
  const story = useStory(3);
  const placedRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const [placed, setPlaced] = useState(false);
  const [mode, setMode] = useState<"person" | "organisation">("person");

  const onPlace = useCallback((p: { x: number; y: number; z: number }) => {
    placedRef.current = p;
    setPlaced(true);
  }, []);

  // the whole field is the control surface: click anywhere in the volume
  useEffect(() => {
    const host = document.getElementById("c2-stage");
    if (!host) return;
    const onDown = (e: PointerEvent | MouseEvent) => {
      const rect = host.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      // project onto a plane a fixed distance ahead of the flight path
      onPlace({ x: nx * 26, y: ny * 14, z: -18 });
    };
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("click", onDown as EventListener);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("click", onDown as EventListener);
    };
  }, [onPlace]);

  return (
    <div
      className="relative w-full"
      style={{ background: "#04060A", color: INK, height: "400vh" }}
    >
      <div id="c2-stage" className="fixed inset-0 z-0" style={{ cursor: "crosshair" }}>
        <LabErrorBoundary>
          <WeatherCanvas
            budget={budget}
            reduced={reduced}
            storyT={story.t}
            placedRef={placedRef}
            mode={mode}
          />
        </LabErrorBoundary>
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between px-[22px] pt-8 sm:px-12 sm:pt-9">
        <div
          className="text-[10px] uppercase"
          style={{
            fontFamily: "var(--font-mono), monospace",
            letterSpacing: "0.22em",
          }}
        >
          <span style={{ color: INK }}>labourmarket.ai</span>
          <span className="mx-3 opacity-35">·</span>
          <span style={{ color: DIM }}>living labour market</span>
          <span className="mx-3 hidden opacity-35 sm:inline">·</span>
          <span className="hidden sm:inline" style={{ color: DIM }}>
            concept c2 — the weather
          </span>
        </div>
        <div
          className="hidden text-right text-[10px] uppercase sm:block"
          style={{
            fontFamily: "var(--font-mono), monospace",
            letterSpacing: "0.22em",
            color: placed ? "#FFC07A" : DIM,
          }}
        >
          {placed ? "need placed — the field turned" : "click anywhere to place a need"}
        </div>
      </div>

      <MobileScrim tone="#04060A" />

      <div className="pointer-events-none relative z-10">
        {BEATS.map((b, i) => (
          <section
            key={b.eyebrow}
            className={`flex h-[133vh] items-center px-[22px] pb-40 sm:px-12 ${
              i === 1 ? "justify-end text-right" : ""
            }`}
          >
            <div
              className="max-w-[36ch]"
              style={{
                opacity: envelope(story.progress, i, BEATS.length),
                transform: `translateY(${(1 - envelope(story.progress, i, BEATS.length)) * 18}px)`,
              }}
            >
              <div
                className="text-[10px] uppercase"
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  letterSpacing: "0.22em",
                  color: "#7FB4E8",
                }}
              >
                {b.eyebrow}
              </div>
              <h2
                className="mt-4"
                style={{
                  fontFamily: "var(--font-manrope), system-ui, sans-serif",
                  fontSize: "clamp(1.7rem, 2.7vw, 2.7rem)",
                  lineHeight: 1.07,
                  letterSpacing: "-0.032em",
                  fontWeight: 500,
                }}
              >
                {b.title}
              </h2>
              <p
                className="mt-4 text-[14.5px] leading-[1.62]"
                style={{ color: DIM }}
              >
                {b.body}
              </p>
            </div>
          </section>
        ))}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-[22px] pb-20 sm:px-12 sm:pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            <div
              className="inline-flex rounded-full p-1"
              style={{ border: "1px solid rgba(234,241,250,0.18)" }}
            >
              {(["person", "organisation"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className="rounded-full px-4 py-1.5 text-[12px] transition-all duration-300"
                  style={{
                    background: mode === m ? INK : "transparent",
                    color: mode === m ? "#04060A" : DIM,
                    fontFamily: "var(--font-manrope), system-ui, sans-serif",
                  }}
                >
                  {m === "person" ? "I'm looking for work" : "I'm looking for people"}
                </button>
              ))}
            </div>
            {placed ? (
              <button
                type="button"
                onClick={() => {
                  placedRef.current = null;
                  setPlaced(false);
                }}
                className="rounded-full px-3 py-1.5 text-[10px] uppercase"
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  letterSpacing: "0.2em",
                  border: "1px solid rgba(234,241,250,0.24)",
                  color: DIM,
                }}
              >
                clear
              </button>
            ) : null}
          </div>

          <p
            className="max-w-[44ch] text-[11px] leading-[1.6]"
            style={{ color: DIM }}
          >
            Concept surface. The currents and the needs are illustrative — no
            volume, rate, location or count is shown, because none is being
            claimed.
          </p>
        </div>
      </div>

      <LabSwitch locale={locale} tone="dark" />
    </div>
  );
}

function envelope(t: number, i: number, n: number) {
  const w = 1 / n;
  const a = i * w;
  const fadeIn = Math.min(1, Math.max(0, (t - a) / (w * 0.32)));
  const fadeOut = 1 - Math.min(1, Math.max(0, (t - (a + w * 0.7)) / (w * 0.32)));
  return Math.max(0, Math.min(fadeIn, fadeOut));
}
