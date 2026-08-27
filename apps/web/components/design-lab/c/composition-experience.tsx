"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LabSwitch } from "../lab-switch";
import { LabErrorBoundary } from "../lab-error-boundary";
import { useDeviceTier, useReducedMotion } from "../use-lab-motion";
import { ROLE_LABEL, TASKS, type Role } from "./composition-model";

const CompositionCanvas = dynamic(
  () => import("./composition-scene").then((m) => m.CompositionCanvas),
  { ssr: false },
);

const PAGE = "#E7E4DE";
const INK = "#17181B";
const DIM = "#6A6C72";

const SWATCH: Readonly<Record<Role, string>> = {
  person: "linear-gradient(135deg,#E0C49B,#B08C5E)",
  team: "linear-gradient(135deg,#FFFFFF,#DAD6CE)",
  agent: "linear-gradient(135deg,#4A4E58,#16181D)",
};

export function CompositionExperience({ locale }: { readonly locale: string }) {
  const reduced = useReducedMotion();
  const tier = useDeviceTier();
  const [taskIndex, setTaskIndex] = useState(0);
  const task = TASKS[taskIndex];

  // keyboard: the composition is a real control, so it takes arrow keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight")
        setTaskIndex((i) => (i + 1) % TASKS.length);
      if (e.key === "ArrowLeft")
        setTaskIndex((i) => (i - 1 + TASKS.length) % TASKS.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden lg:overflow-hidden"
      style={{ background: PAGE, color: INK }}
    >
      <div className="absolute inset-x-0 top-0 z-0 h-[54vh] lg:inset-0 lg:h-full">
        <LabErrorBoundary>
          <CompositionCanvas
            taskIndex={taskIndex}
            reduced={reduced}
            quality={tier}
          />
        </LabErrorBoundary>
      </div>

      {/* The studio band ends in the page colour rather than in a hard edge. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[4] h-[54vh] lg:hidden"
        style={{
          background:
            "linear-gradient(to bottom, rgba(231,228,222,0) 72%, rgba(231,228,222,0.96) 100%)",
        }}
      />

      {/* ── type layer ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col gap-10 px-[22px] pb-28 pt-[calc(54vh+8px)] sm:px-14 lg:justify-between lg:py-10 lg:pb-10 lg:pt-10">
        <div className="absolute left-[22px] right-[22px] top-8 flex items-start justify-between gap-6 sm:left-14 sm:right-14 sm:top-10 lg:static lg:mb-auto">
          <Mono>
            <span style={{ color: INK }}>labourmarket.ai</span>
            <span className="mx-3 opacity-35">·</span>
            <span style={{ color: DIM }}>living labour market</span>
            <span className="mx-3 hidden opacity-35 sm:inline">·</span>
            <span className="hidden sm:inline" style={{ color: DIM }}>
              concept c — the composition
            </span>
          </Mono>
          <Legend />
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,30ch)_minmax(0,1fr)] lg:items-end">
          <div>
            <h1
              className="max-w-[9em]"
              style={{
                fontFamily: "var(--font-manrope), system-ui, sans-serif",
                fontSize: "clamp(2.1rem, 3.9vw, 3.9rem)",
                lineHeight: 1.0,
                letterSpacing: "-0.038em",
                fontWeight: 500,
              }}
            >
              Work is not a job title. It is a composition.
            </h1>
            <p
              className="mt-5 max-w-[38ch] text-[14px] leading-[1.6] sm:text-[15px]"
              style={{ color: DIM }}
            >
              Every need asks for a different mix of people, teams and — under
              human supervision — AI agents. Change the need and the same
              capability assembles differently.
            </p>
          </div>

          <div className="lg:justify-self-end lg:text-right">
            <div
              key={task.id}
              className="max-w-[42ch] lg:ml-auto"
              style={{ animation: "labFade 520ms ease-out both" }}
            >
              <div
                className="text-[10px] uppercase"
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  letterSpacing: "0.22em",
                  color: "#9A5B22",
                }}
              >
                {String(taskIndex + 1).padStart(2, "0")} — {task.label}
              </div>
              <h2
                className="mt-3"
                style={{
                  fontFamily: "var(--font-manrope), system-ui, sans-serif",
                  fontSize: "clamp(1.3rem, 1.9vw, 1.85rem)",
                  lineHeight: 1.12,
                  letterSpacing: "-0.03em",
                  fontWeight: 500,
                }}
              >
                {task.title}
              </h2>
              <p
                className="mt-3 text-[13.5px] leading-[1.62]"
                style={{ color: DIM }}
              >
                {task.body}
              </p>
            </div>

            <div className="pointer-events-auto mt-7 flex flex-wrap gap-2 lg:justify-end">
              {TASKS.map((t, i) => {
                const active = i === taskIndex;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTaskIndex(i)}
                    aria-pressed={active}
                    className="rounded-full px-4 py-2 text-[12.5px] transition-all duration-300"
                    style={{
                      border: `1px solid ${active ? INK : "rgba(23,24,27,0.2)"}`,
                      background: active ? INK : "rgba(255,255,255,0.45)",
                      color: active ? PAGE : INK,
                      fontFamily: "var(--font-manrope), system-ui, sans-serif",
                      backdropFilter: "blur(6px)",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            <p
              className="mt-5 text-[11px] leading-[1.6] lg:ml-auto lg:max-w-[46ch]"
              style={{ color: DIM }}
            >
              Concept surface. The compositions above are illustrative shapes,
              not measured staffing. An AI agent appears here because the
              architecture already treats it as a work subject that has to earn
              its place through reviewed work — never as a legal person.
            </p>
          </div>
        </div>
      </div>

      {/* studio vignette — the cyclorama falls off at the corners the way a
          real one does, so the object is not floating in flat paint */}
      <div
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 42%, rgba(231,228,222,0) 40%, rgba(150,146,138,0.20) 100%)",
        }}
      />

      <LabSwitch locale={locale} tone="light" />

      <style>{`@keyframes labFade{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

function Mono({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] uppercase"
      style={{
        fontFamily: "var(--font-mono), monospace",
        letterSpacing: "0.22em",
      }}
    >
      {children}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
        <div key={r} className="flex items-center gap-2">
          <span
            className="text-[9px] uppercase"
            style={{
              fontFamily: "var(--font-mono), monospace",
              letterSpacing: "0.2em",
              color: DIM,
            }}
          >
            {ROLE_LABEL[r]}
          </span>
          <span
            aria-hidden
            style={{
              width: 22,
              height: 7,
              borderRadius: 3,
              background: SWATCH[r],
              boxShadow: "0 1px 2px rgba(23,24,27,0.18)",
            }}
          />
        </div>
      ))}
    </div>
  );
}
