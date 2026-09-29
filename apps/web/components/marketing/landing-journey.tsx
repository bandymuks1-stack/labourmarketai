"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { IdentityStage, type IdentityFact } from "@/components/app/player-card/identity-stage";
import { ProvenanceEdge } from "@/components/app/provenance/provenance-edge";
import { SkillEvidenceChart } from "@/components/app/player-card/skill-evidence-chart";
import { WeekStrip } from "@/components/app/workspace/week-strip";
import type { JourneyStepKey, SampleJourney } from "@/lib/marketing/sample-journey";
import { cn } from "@/lib/utils";

/**
 * THE PUBLIC ENTRY — the product story told by the product's own pieces
 * (owner decision 2026-09-29: landing freeze lifted for the entry hero).
 *
 * ONE OBJECT TRANSFORMS. The person (the product's IdentityStage, the SAME
 * sample persona the landing's card shows) stays put and grows as the story
 * moves — a direction, the hours, a green provenance edge the moment a
 * manager confirms, a new title at "next". Beside it the WORK WORLD changes:
 * opportunities with their fit reasons, a conversation, a project, the
 * week's hours (the chat's own week strip), the skills chart (the card's
 * own), the Living CV spine, the next opportunity.
 *
 * Motion explains the product, it does not decorate it: one step every few
 * seconds, paused while the visitor hovers, focuses or has taken control,
 * and never automatic under prefers-reduced-motion. Every step is reachable
 * by hand. Every fact is SAMPLE copy, and the stage says so on every step.
 */
const STEP_MS = 3800;

export function LandingJourney({ journey }: { journey: SampleJourney }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const hovering = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPlaying(!reduce);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      if (!hovering.current) setStep((s) => (s + 1) % journey.steps.length);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, journey.steps.length]);

  const choose = useCallback((i: number) => {
    setPlaying(false);
    setStep(i);
  }, []);

  const key: JourneyStepKey = journey.steps[step]!.key;
  const at = (k: JourneyStepKey) => journey.steps.findIndex((s) => s.key === k) <= step;

  // The person, as far as the story has got.
  const facts: IdentityFact[] = at("hours")
    ? [
        { value: "40", label: journey.facts.recorded, tone: "evidence", testid: "journey-fact-recorded" },
        { value: at("confirmation") ? "40" : "0", label: journey.facts.confirmed, tone: "neutral", testid: "journey-fact-confirmed" },
        { value: "5", label: journey.facts.days, tone: "neutral", testid: "journey-fact-days" },
      ]
    : [];
  const professions = at("profession")
    ? at("next")
      ? [journey.person.profession, journey.person.nextProfession]
      : [journey.person.profession]
    : [];

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="landing-journey"
      data-step={key}
      aria-roledescription="carousel"
      aria-label={journey.title}
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
      onFocusCapture={() => (hovering.current = true)}
      onBlurCapture={() => (hovering.current = false)}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-2.5 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
          {journey.sampleLabel}
        </span>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="min-h-11 rounded-full border border-ink-500 px-3 font-mono text-meta uppercase tracking-label text-text-secondary hover:border-brand-blue"
          data-testid="landing-journey-play"
        >
          {playing ? journey.controls.pause : journey.controls.play}
        </button>
      </div>

      {/* THE CONSTANT: the person. */}
      <IdentityStage
        name={journey.person.name}
        avatarUrl={null}
        initials={journey.person.initials}
        edge={<ProvenanceEdge provenanceClass={at("confirmation") ? "EMPLOYER_CONFIRMED" : at("hours") ? "EVIDENCE_SUPPORTED" : "SELF_DECLARED"} />}
        heading={<p className="font-display text-2xl font-bold leading-tight tracking-tightest text-text-primary sm:text-3xl">{journey.person.name}</p>}
        professions={professions}
        location={at("direction") ? journey.direction.country : null}
        availability={null}
        currentWork={at("project") ? [journey.project.name] : []}
        currentWorkLabel={journey.currentWorkLabel}
        facts={facts}
      >
        {at("confirmation") ? (
          <p className="text-support text-text-secondary" data-testid="landing-journey-confirmed">{journey.confirmedBy}</p>
        ) : null}
      </IdentityStage>

      {/* THE WORK WORLD around the person — changes with the step. */}
      <div
        key={key}
        className="rise-in min-h-[13rem] rounded-2xl border border-border-subtle bg-surface-1/50 p-4 sm:p-5"
        data-testid="landing-journey-world"
        aria-live="polite"
        inert
      >
        <p className="mb-3 text-sm font-medium text-text-primary">{journey.steps[step]!.caption}</p>
        <World journey={journey} step={key} />
      </div>

      {/* THE JOURNEY — every step reachable by hand. */}
      <ol aria-label={journey.controls.stepsLabel} className="flex flex-wrap gap-1.5" data-testid="landing-journey-steps">
        {journey.steps.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => choose(i)}
              aria-current={i === step ? "step" : undefined}
              data-testid={`landing-journey-step-${s.key}`}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-support transition-colors",
                i === step
                  ? "border-brand-blue bg-brand-blue/10 font-semibold text-text-primary"
                  : i < step
                    ? "border-brand-cyan/40 text-text-secondary hover:border-brand-blue"
                    : "border-ink-600 text-text-muted hover:border-brand-blue",
              )}
            >
              <span aria-hidden className={cn("size-1.5 rounded-full", i <= step ? "bg-brand-cyan" : "bg-ink-500")} />
              {s.label}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

const CHIP = "inline-flex min-h-7 items-center rounded-full border px-2.5 text-meta";

function World({ journey, step }: { journey: SampleJourney; step: JourneyStepKey }) {
  switch (step) {
    case "identity":
    case "profession":
      return (
        <div className="flex flex-wrap gap-2">
          <span className={cn(CHIP, "border-ink-500 text-text-primary")}>{journey.person.profession}</span>
        </div>
      );
    case "direction":
      return (
        <div className="flex flex-wrap gap-2">
          <span className={cn(CHIP, "border-ink-500 bg-ink-800/60 text-text-primary")}>{journey.direction.country}</span>
          <span className={cn(CHIP, "border-ink-500 bg-ink-800/60 text-text-primary")}>{journey.direction.pay}</span>
        </div>
      );
    case "opportunities":
    case "next":
      return (
        <ul className="flex flex-col gap-2">
          {(step === "next"
            ? [{ role: journey.next.role, place: journey.next.place, fits: [journey.next.why] }]
            : journey.opportunities
          ).map((o) => (
            <li key={o.role} className="flex flex-col gap-1.5 rounded-lg border border-ink-600 bg-ink-800/50 p-3">
              <span className="text-sm font-semibold text-text-primary">{o.role}</span>
              <span className="text-meta text-text-secondary">{o.place}</span>
              <span className="flex flex-wrap gap-1.5">
                {o.fits.map((f) => (
                  <span key={f} className={cn(CHIP, "border-brand-cyan/40 bg-brand-cyan/[0.06] text-brand-cyan")}>{f}</span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      );
    case "conversation":
      return (
        <div className="flex flex-col gap-2">
          {journey.conversation.map((m, i) => (
            <p
              key={i}
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                m.from === "person" ? "self-end bg-brand-blue/15 text-text-primary" : "self-start bg-ink-700 text-text-primary",
              )}
            >
              {m.text}
            </p>
          ))}
        </div>
      );
    case "project":
      return (
        <div className="flex flex-col gap-2">
          <span className="font-display text-lg font-semibold text-text-primary">{journey.project.name}</span>
          <span className="text-meta text-text-secondary">{journey.project.place} · {journey.project.team}</span>
          <div className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full bg-ink-800" aria-hidden>
            <span className="rhythm-grow-x h-full w-2/5 bg-brand-cyan/70" />
            <span className="rhythm-grow-x h-full w-2/5 border-l border-ink-900 bg-brand-blue/70" />
            <span className="rhythm-grow-x h-full w-1/5 border-l border-ink-900 bg-brand-violet/70" />
          </div>
        </div>
      );
    case "hours":
    case "confirmation":
      return (
        <WeekStrip
          label={journey.weekLabel}
          week={{
            ...journey.week,
            days: journey.week.days.map((d) => ({
              ...d,
              confirmed: step === "confirmation" && d.minutes > 0 ? "all" : "none",
            })),
          }}
        />
      );
    case "capability":
      return <SkillEvidenceChart skills={journey.skills} labels={journey.skillLabels} />;
    case "cv":
      return (
        <ul className="flex flex-col">
          {journey.cv.map((c) => (
            <li key={c.org} className="relative flex flex-col pb-3 pl-6 last:pb-0">
              <span aria-hidden className="absolute bottom-0 left-[5px] top-2 w-px bg-ink-600" />
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1.5 size-[11px] rounded-full border-2",
                  c.confirmed ? "border-trust-accent bg-trust-accent" : "border-dashed border-ink-500",
                )}
              />
              <span className="font-display text-base font-semibold text-text-primary">{c.org}</span>
              <span className="text-meta text-text-secondary">{c.period}</span>
              <span className="font-mono text-[0.625rem] uppercase tracking-label text-text-muted">{c.standing}</span>
            </li>
          ))}
        </ul>
      );
  }
}
