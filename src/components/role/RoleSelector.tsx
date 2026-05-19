"use client";

/**
 * RoleSelector — the one question asked at /role: "Who are you?"
 *
 * It only establishes identity. It never asks "what are you looking for" —
 * intent is expressed later through the product, not this step.
 */
import Link from "next/link";
import { useState } from "react";
import type { RoleOption, UserRole } from "@/lib/types";

const ROLES: RoleOption[] = [
  {
    id: "worker",
    title: "Worker / Person",
    subtitle: "I bring skills",
    blurb: "Build one profile. Get drafted into roles that fit your signal.",
    accent: "cyan",
  },
  {
    id: "company",
    title: "Company / Employer",
    subtitle: "I build teams",
    blurb: "Post hiring needs and scout the floor with one company card.",
    accent: "violet",
  },
  {
    id: "recruiter",
    title: "Recruiter / Agency",
    subtitle: "I connect both sides",
    blurb: "Move talent and needs through one connected board.",
    accent: "amber",
  },
];

export function RoleSelector() {
  const [selected, setSelected] = useState<UserRole | null>(null);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3">
        {ROLES.map((role) => {
          const active = selected === role.id;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelected(role.id)}
              aria-pressed={active}
              className={`glass glass-hover relative p-6 text-left transition ${
                active
                  ? `accent-${role.accent} glow-${role.accent} ring-1 ring-cyan/40`
                  : ""
              }`}
            >
              <div
                className={`tier-ring accent-${role.accent} mb-5 inline-block`}
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-2 text-base font-bold">
                  {role.id === "worker"
                    ? "◆"
                    : role.id === "company"
                      ? "▣"
                      : "⬡"}
                </span>
              </div>
              <p className="text-[0.7rem] uppercase tracking-wider text-fg-mute">
                {role.subtitle}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{role.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-dim">
                {role.blurb}
              </p>
              <span
                className={`mt-4 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                  active
                    ? "border-cyan bg-cyan text-ink"
                    : "border-line text-transparent"
                }`}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="text-sm text-fg-mute">
          {selected
            ? "You can refine everything later — there is no gatekeeping step."
            : "Pick the one that fits. You can change it in settings."}
        </p>
        <Link
          href="/app"
          aria-disabled={!selected}
          className={`cta cta-primary ${
            selected ? "" : "pointer-events-none opacity-40"
          }`}
        >
          Continue
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
