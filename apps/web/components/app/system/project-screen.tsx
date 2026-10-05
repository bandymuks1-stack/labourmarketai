"use client";

import { useState } from "react";
import { MessageSquare, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  COMPANIES,
  NEED,
  PROJECTS,
  WEEKS,
  personById,
  type Person,
} from "@/lib/design-proof/product-fixtures";
import { conflictOf, coverageOf, membersOf, type Seats } from "@/lib/design-proof/team-model";

import { CompanyMark, TeamStack } from "@/components/app/identity/identity-family";
import { EntityCard, EntityPlate, EntityThumb } from "./entity";
import { Accented, Avail, Btn, Eyebrow, RegionHead, Surface, Tabs } from "./ui";

/**
 * PROJECT — the formed team, at work.
 *
 * The same people, the same avatars, now in their roles: who is responsible for
 * what, when each person is actually there, and what is coming up. A person is
 * not redrawn when they join: they keep their identity and gain a responsibility.
 */
const RESPONSIBILITY: Record<string, string> = {
  lead: "Runs the site and the weekly plan",
  scaf: "Erects, inspects and hands over scaffolding",
  elec: "Installs, tests and documents circuits",
  hse: "Owns the safety plan and the inspections",
};

/** 14 weeks: on the project, late, or busy elsewhere. */
function weekCells(p: Person): ("on" | "late" | "busy")[] {
  const c = conflictOf(p);
  const late = c?.kind === "late" ? Number(/(\d+) week/.exec(c.text)?.[1] ?? 1) : 0;
  const busy = c?.kind === "busy" ? 7 : 0;
  return Array.from({ length: WEEKS }, (_, w) => (w < late ? "late" : w < busy ? "busy" : "on"));
}

const UPCOMING = [
  { when: "Mon 10 Nov", what: "Site induction, all trades", who: ["is", "ap"] },
  { when: "Wed 12 Nov", what: "Scaffold plan sign-off", who: ["tk", "mt"] },
  { when: "Mon 17 Nov", what: "Electrical rough-in starts", who: ["mn", "an1"] },
];

const ACTIVITY = [
  { who: "ap", text: "confirmed the safety plan v3", t: "2 h" },
  { who: "tk", text: "uploaded Scaffold plan v2", t: "5 h" },
  { who: "mn", text: "accepted the seat", t: "1 d" },
  { who: "is", text: "created the team", t: "2 d" },
];

export function ProjectScreen({ seats, onOpenProfile, onOpenChat, initialTab = "overview" }: { readonly initialTab?: "overview" | "team" | "schedule"; readonly seats: Seats; readonly onOpenProfile: (id: string) => void; readonly onOpenChat: () => void }) {
  const project = PROJECTS[0]!;
  const client = COMPANIES.find((c) => c.id === project.client)!;
  const [tab, setTab] = useState<"overview" | "team" | "schedule">(initialTab);
  const members = membersOf(seats).map((m) => ({ ...m, person: personById(m.personId) }));
  const cov = coverageOf(seats);
  const covered = cov.every((c) => c.status === "covered");

  return (
    <div data-testid="project-screen">
      {/* THE CONTEXTUAL OPENING — where this is, who is in it, what state it is in */}
      <section className="relative isolate mx-auto mt-6 max-w-[1380px] overflow-hidden rounded-[32px] shadow-[inset_0_0_0_1px_rgba(245,241,232,0.10)] max-md:mx-4 md:mx-10" data-testid="project-opening">
        <div className="absolute inset-0"><EntityPlate entity={{ kind: "project", id: project.id }} /></div>
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,7,6,0.96)_0%,rgba(7,7,6,0.55)_46%,rgba(7,7,6,0.1)_100%)]" />
        <div className="relative flex min-h-[460px] flex-col justify-end gap-8 p-6 pt-40 md:min-h-[520px] md:p-12">
          <div>
            <Eyebrow className="inline-flex items-center gap-2"><span aria-hidden className="h-2 w-2 rounded-full bg-[rgb(52,211,153)]" />Active · week 1 of 16</Eyebrow>
            <h1 className="mt-3 max-w-[16ch] font-display text-[clamp(2.6rem,7vw,5.8rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
              <Accented text="Harbour Quarter *fit-out*" />
            </h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[1.02rem] text-text-secondary">
              <span className="inline-flex items-center gap-2"><CompanyMark company={client} size={24} /> {client.name}</span>
              <span>{project.place}</span>
              <span>{project.from} – {project.to}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <TeamStack members={members.map((m) => m.person)} size={44} max={5} />
              <p className="basis-full text-[0.98rem] text-text-secondary md:basis-auto">
                <span className="font-display text-[1.5rem] font-semibold tabular-nums text-text-primary">{members.length}</span> people · {NEED.roles.length} roles ·{" "}
                <span className={covered ? "text-text-primary" : "text-state-amber"}>{covered ? "every capability covered" : "gaps remain"}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Btn kind="secondary" onClick={onOpenChat}><MessageSquare className="h-4 w-4" aria-hidden /> Team thread</Btn>
              <Btn kind="primary"><Plus className="h-4 w-4" aria-hidden /> Add person</Btn>
            </div>
          </div>
        </div>
      </section>

      {/* THE OPERATING INTERFACE */}
      <div className="mx-auto max-w-[1380px] px-4 pb-32 pt-10 md:px-10">
        <Tabs value={tab} onChange={setTab} options={[{ id: "overview", label: "Overview" }, { id: "team", label: "Team", count: members.length }, { id: "schedule", label: "Schedule" }]} />

        {tab === "team" ? (
          <div className="mt-12" data-testid="project-team-tab">
            <RegionHead eyebrow={`${members.length} people · ${NEED.roles.length} roles`} title="The *team*" sub="Everyone on the project with what they bring to it." />
            <ul className="mt-9 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {members.map(({ person: p, role }) => (
                <li key={p.id}>
                  <EntityCard entity={{ kind: "person", id: p.id }} aspect="4 / 5" as="button" onClick={() => onOpenProfile(p.id)}>
                    <span className="mt-1.5 text-[0.82rem] text-text-secondary">{NEED.roles.find((r) => r.id === role)!.label} · {RESPONSIBILITY[role]}</span>
                  </EntityCard>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === "schedule" ? (
          <div className="mt-12" data-testid="project-schedule-tab">
            <RegionHead eyebrow="14 weeks · 10 Nov – 15 Feb" title="Who is *there*, when" sub="Weeks on site per person, and the milestones the project is working toward." />
            <Surface className="mt-9 overflow-x-auto p-5 md:p-7">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[13rem_1fr] items-end gap-x-4 pb-3">
                  <span />
                  <div className="grid grid-cols-14 text-[0.72rem] text-text-muted" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
                    {Array.from({ length: WEEKS }).map((_, w) => <span key={w} className="text-center tabular-nums">{w + 1}</span>)}
                  </div>
                </div>
                {members.map(({ person: p }) => (
                  <div key={p.id} className="grid grid-cols-[13rem_1fr] items-center gap-x-4 border-t border-text-primary/10 py-3">
                    <span className="flex items-center gap-3">
                      <EntityThumb entity={{ kind: "person", id: p.id }} size={40} />
                      <span className="truncate text-[0.92rem] font-medium">{p.anonymous ? "Anonymous" : p.name.split(" ")[0]}</span>
                    </span>
                    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
                      {weekCells(p).map((c, w) => (
                        <span key={w} className={cn("h-5 rounded-[3px]", c === "on" && "bg-[rgb(235,200,95)]/75", c === "late" && "border border-dashed border-text-primary/40", c === "busy" && "bg-state-amber/70")} />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-[13rem_1fr] items-center gap-x-4 border-t border-text-primary/10 pt-4">
                  <Eyebrow>Milestones</Eyebrow>
                  <div className="relative h-8" style={{ display: "grid", gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
                    {[{ w: 0, t: "Induction" }, { w: 3, t: "Plan sign-off" }, { w: 8, t: "Rough-in done" }, { w: 13, t: "Handover" }].map((m) => (
                      <span key={m.t} className="relative" style={{ gridColumn: m.w + 1 }}>
                        <span aria-hidden className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[3px] bg-[rgb(235,200,95)]" />
                        <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[0.72rem] text-text-secondary">{m.t}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Surface>
            <p className="mt-4 text-[0.82rem] text-text-muted">Gold: on site · dashed: starts later · amber: busy on another project.</p>
          </div>
        ) : null}

        <div className={cn("mt-12 grid gap-x-14 gap-y-14 lg:grid-cols-[1fr_22rem]", tab !== "overview" && "hidden")}>
          <section className="min-w-0" aria-label="Team">
            <RegionHead eyebrow="The team" title="Who is *responsible* for what" sub="Each person with their role, and the weeks they are actually on site." />
            {NEED.roles.map((r) => {
              const rows = members.filter((m) => m.role === r.id);
              if (rows.length === 0) return null;
              return (
                <div key={r.id} className="mt-9">
                  <p className="flex flex-wrap items-baseline justify-between gap-3 border-b border-text-primary/10 pb-2.5">
                    <span className="font-display text-[1.15rem] font-semibold tracking-[-0.02em]">{r.label}</span>
                    <span className="text-[0.85rem] text-text-muted">{RESPONSIBILITY[r.id]}</span>
                  </p>
                  <ul>
                    {rows.map(({ person: p }) => {
                      const cells = weekCells(p);
                      return (
                        <li key={p.id} data-person={p.id} className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 border-b border-text-primary/10 py-4 md:grid-cols-[auto_1fr_17rem]">
                          <EntityThumb entity={{ kind: "person", id: p.id }} size={64} />
                          <div className="min-w-0">
                            <button type="button" onClick={() => onOpenProfile(p.id)} className="text-left font-display text-[1.1rem] font-semibold tracking-[-0.02em] hover:underline">
                              {p.anonymous ? "Anonymous candidate" : p.name}
                            </button>
                            <p className="text-[0.88rem] text-text-muted">{p.headline}</p>
                          </div>
                          <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
                            <div className="flex gap-[3px]" role="img" aria-label="Weeks on the project">
                              {cells.map((c, w) => (
                                <span key={w} className={cn("h-2 flex-1 rounded-[2px]", c === "on" && "bg-[rgb(235,200,95)]/80", c === "late" && "border border-text-primary/35", c === "busy" && "bg-state-amber/70")} />
                              ))}
                            </div>
                            <div className="flex items-center justify-between text-[0.8rem] text-text-muted">
                              <Avail a={p.availability} className="text-[0.8rem]" />
                              <span>weeks 1–{WEEKS}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>

          <aside className="flex flex-col gap-12">
            <section aria-label="Coming up">
              <RegionHead eyebrow="Coming up" title="Next *three*" size="md" />
              <Surface className="mt-6 overflow-hidden">
                <ul>
                  {UPCOMING.map((u) => (
                    <li key={u.what} className="border-t border-text-primary/10 px-5 py-4 first:border-t-0">
                      <p className="text-[0.8rem] text-text-muted">{u.when}</p>
                      <p className="mt-0.5 text-[1rem] font-medium">{u.what}</p>
                      <TeamStack className="mt-2.5" members={u.who.map(personById)} size={28} />
                    </li>
                  ))}
                </ul>
              </Surface>
            </section>
            <section aria-label="Activity">
              <RegionHead eyebrow="Activity" title="What *happened*" size="md" />
              <Surface className="mt-6 overflow-hidden">
                <ul>
                  {ACTIVITY.map((a) => (
                    <li key={a.text} className="flex items-center gap-3 border-t border-text-primary/10 px-5 py-3.5 first:border-t-0">
                      <EntityThumb entity={{ kind: "person", id: a.who }} size={36} />
                      <span className="text-[0.92rem] text-text-secondary"><span className="text-text-primary">{personById(a.who).name.split(" ")[0]}</span> {a.text}</span>
                      <span className="ml-auto text-[0.78rem] text-text-muted">{a.t}</span>
                    </li>
                  ))}
                </ul>
              </Surface>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
