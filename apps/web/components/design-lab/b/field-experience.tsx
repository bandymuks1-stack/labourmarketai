"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { LabSwitch } from "../lab-switch";
import { LabErrorBoundary } from "../lab-error-boundary";
import { useDeviceTier, useReducedMotion } from "../use-lab-motion";
import type { FieldMode, PlacedNeed } from "./field-scene";
import { FIELD_DEPTH, FIELD_WIDTH } from "./field-material";

const FieldCanvas = dynamic(
  () => import("./field-scene").then((m) => m.FieldCanvas),
  { ssr: false },
);

const GROUND = "#06070A";
const TEXT = "#ECE9E3";
const DIM = "#8C8F98";
const WARM = "#E8A24A";
const COOL = "#8FC0F0";

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** World XZ back to lon/lat, using the same equirectangular window the
 *  committed Europe geometry was generated with (-10..40 E, 34..71 N). */
function worldToLngLat(x: number, z: number): [number, number] {
  const u = x / FIELD_WIDTH + 0.5;
  const v = -z / FIELD_DEPTH + 0.5;
  return [-10 + u * 50, 34 + v * 37];
}

export function FieldExperience({ locale }: { readonly locale: string }) {
  const reduced = useReducedMotion();
  const tier = useDeviceTier();
  const phaseRef = useRef(0);
  const needRef = useRef<PlacedNeed>(null);
  const [need, setNeed] = useState<PlacedNeed>(null);
  const [mode, setMode] = useState<FieldMode>("person");
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let raf = 0;
    const read = () => {
      const vh = window.innerHeight || 1;
      const p = clamp01((window.scrollY / vh - 0.15) / 1.55);
      phaseRef.current = p;
      setPhase((prev) => (Math.abs(prev - p) > 0.005 ? p : prev));
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const place = (p: { x: number; z: number }) => {
    needRef.current = p;
    setNeed(p);
  };
  const clear = () => {
    needRef.current = null;
    setNeed(null);
  };

  const lngLat = need ? worldToLngLat(need.x, need.z) : null;
  const heroOpacity = clamp01((0.42 - phase) / 0.3);
  const midOpacity = clamp01((phase - 0.34) / 0.22) * clamp01((0.84 - phase) / 0.22);
  const endOpacity = clamp01((phase - 0.78) / 0.2);

  return (
    <div
      className="relative w-full"
      style={{ background: GROUND, color: TEXT, height: "300vh" }}
    >
      {/* ── the field ─────────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-0">
        <LabErrorBoundary>
          <FieldCanvas
            mode={mode}
            phaseRef={phaseRef}
            reduced={reduced}
            quality={tier}
            onPlace={place}
            needRef={needRef}
          />
        </LabErrorBoundary>
        {/* horizon lift — keeps the far edge of the plane from reading as a
            cut, without adding a post-processing pass */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(6,7,10,0.92) 0%, rgba(6,7,10,0.30) 14%, rgba(6,7,10,0) 30%, rgba(6,7,10,0) 66%, rgba(6,7,10,0.55) 100%)",
          }}
        />
        {/* reading scrim — the type has to survive over a lit terrain, and a
            gradient is honest about it in a way a solid card would not be */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(6,7,10,0.86) 0%, rgba(6,7,10,0.62) 26%, rgba(6,7,10,0.12) 48%, rgba(6,7,10,0) 62%)",
          }}
        />
      </div>

      {/* ── instrument chrome ─────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-20">
        <div className="flex items-start justify-between px-[22px] pt-8 sm:px-14 sm:pt-10">
          <Mono color={TEXT}>
            <span style={{ opacity: 1 }}>labourmarket.ai</span>
            <span className="mx-3 opacity-40">·</span>
            <span className="opacity-60">living labour market</span>
            <span className="mx-3 hidden opacity-40 sm:inline">·</span>
            <span className="hidden opacity-60 sm:inline">
              concept b — the field
            </span>
          </Mono>
          <div className="hidden text-right sm:block">
            <Mono color={DIM}>
              <div>europe · equirectangular</div>
              <div className="mt-1">
                {lngLat
                  ? `need ${lngLat[0].toFixed(1)}°e ${lngLat[1].toFixed(1)}°n`
                  : "no need placed"}
              </div>
            </Mono>
          </div>
        </div>
      </div>

      {/* ── type + interaction ────────────────────────────────────────── */}
      {/* pointer-events-none: the field IS the page, so a full-height text
          section must never be the thing that swallows a click on it. Only
          the controls below opt back in. */}
      <div className="pointer-events-none relative z-10">
        <section className="relative h-screen px-[22px] sm:px-14">
          <div
            className="absolute bottom-[132px] left-[22px] right-[22px] sm:bottom-[128px] sm:left-14 sm:right-14"
            style={{
              opacity: heroOpacity,
              transition: "opacity 220ms linear",
            }}
          >
            <h1
              className="max-w-[15ch]"
              style={{
                fontFamily: "var(--font-plex), system-ui, sans-serif",
                fontSize: "clamp(2.2rem, 4.4vw, 4.6rem)",
                lineHeight: 1.02,
                letterSpacing: "-0.032em",
                fontWeight: 300,
              }}
            >
              The market already has a shape.
            </h1>
            <p
              className="mt-5 max-w-[52ch] text-[14px] leading-[1.6] sm:text-[15.5px]"
              style={{ color: DIM }}
            >
              Needs rise where work is genuinely being asked for. People stand
              where they actually are. Everything this product does happens on
              the field between the two.
            </p>

            <div className="pointer-events-auto mt-7 flex flex-wrap items-center gap-x-3 gap-y-3">
              <ModeToggle value={mode} onChange={setMode} />
              <span
                className="text-[10px] uppercase"
                style={{
                  fontFamily: "var(--font-plex-mono), monospace",
                  letterSpacing: "0.22em",
                  color: need ? WARM : DIM,
                }}
              >
                {need
                  ? "need placed — the field responded"
                  : "click the field to place a need"}
              </span>
              {need ? (
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-full px-3 py-1 text-[10px] uppercase transition-colors"
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace",
                    letterSpacing: "0.2em",
                    border: "1px solid rgba(236,233,227,0.24)",
                    color: DIM,
                  }}
                >
                  clear
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="relative h-screen px-[22px] sm:px-14">
          <div
            className="absolute right-[22px] top-[16vh] max-w-[36ch] sm:right-14"
            style={{ opacity: midOpacity, transition: "opacity 220ms linear" }}
          >
            <Eyebrow color={WARM}>02 — a need is not a posting</Eyebrow>
            <h2 className="mt-4" style={h2Style}>
              Put one down and the ground moves.
            </h2>
            <p className="mt-4 text-[14.5px] leading-[1.62]" style={{ color: DIM }}>
              A need has a place, a reach and a pull. The people who could
              actually get to it move first, and the ones who could not are not
              quietly counted as if they had. Distance is real here, so the
              product treats it as real.
            </p>
          </div>
        </section>

        <section className="relative h-screen px-[22px] sm:px-14">
          <div
            className="absolute right-[22px] top-[16vh] max-w-[36ch] sm:right-14"
            style={{ opacity: endOpacity, transition: "opacity 220ms linear" }}
          >
            <Eyebrow color={COOL}>03 — and then it is somebody&rsquo;s week</Eyebrow>
            <h2 className="mt-4" style={h2Style}>
              Every filament is a person with a record.
            </h2>
            <p className="mt-4 text-[14.5px] leading-[1.62]" style={{ color: DIM }}>
              The field is only the view from far away. Come down to one of
              them and it is an ordinary working life — evidence, capability,
              and a decision about what to do next.
            </p>
            <p
              className="mt-6 border-t pt-4 text-[11.5px] leading-[1.62]"
              style={{ color: DIM, borderColor: "rgba(236,233,227,0.14)" }}
            >
              Concept surface. The coastline is real geography (Natural Earth,
              public domain); the terrain on top of it is an illustrative
              field. No volume, rate or count is shown, because none is being
              claimed.
            </p>
          </div>
        </section>
      </div>

      <LabSwitch locale={locale} tone="dark" />
    </div>
  );
}

const h2Style: React.CSSProperties = {
  fontFamily: "var(--font-plex), system-ui, sans-serif",
  fontSize: "clamp(1.7rem, 2.6vw, 2.6rem)",
  lineHeight: 1.08,
  letterSpacing: "-0.028em",
  fontWeight: 300,
};

function Mono({
  children,
  color,
}: {
  readonly children: React.ReactNode;
  readonly color: string;
}) {
  return (
    <div
      className="text-[10px] uppercase"
      style={{
        fontFamily: "var(--font-plex-mono), monospace",
        letterSpacing: "0.22em",
        color,
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({
  children,
  color,
}: {
  readonly children: React.ReactNode;
  readonly color: string;
}) {
  return (
    <div
      className="text-[10px] uppercase"
      style={{
        fontFamily: "var(--font-plex-mono), monospace",
        letterSpacing: "0.22em",
        color,
      }}
    >
      {children}
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  readonly value: FieldMode;
  readonly onChange: (m: FieldMode) => void;
}) {
  const options: { readonly id: FieldMode; readonly label: string }[] = [
    { id: "person", label: "I'm looking for work" },
    { id: "organisation", label: "I'm looking for people" },
  ];
  return (
    <div
      className="inline-flex rounded-full p-1"
      style={{ border: "1px solid rgba(236,233,227,0.18)" }}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="rounded-full px-4 py-1.5 text-[12px] transition-all duration-300"
            style={{
              background: active ? TEXT : "transparent",
              color: active ? GROUND : DIM,
              fontFamily: "var(--font-plex), system-ui, sans-serif",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
