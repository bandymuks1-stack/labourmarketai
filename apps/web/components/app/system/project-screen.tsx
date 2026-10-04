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

import { CompanyMark, PersonAvatar, ProjectMark, TeamStack } from "./identity";
import { PageHeader } from "./shell";
import { Avail, Btn, Stamp, Tabs } from "./ui";

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

export function ProjectScreen({ seats, onOpenProfile, onOpenChat }: { readonly seats: Seats; readonly onOpenProfile: (id: string) => void; readonly onOpenChat: () => void }) {
  const project = PROJECTS[0]!;
  const client = COMPANIES.find((c) => c.id === project.client)!;
  const [tab, setTab] = useState<"overview" | "team" | "schedule">("overview");
  const members = membersOf(seats).map((m) => ({ ...m, person: personById(m.personId) }));
  const cov = coverageOf(seats);
  const covered = cov.every((c) => c.status === "covered");

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-9" data-testid="project-screen">
      <PageHeader
        lead={<ProjectMark project={project} size={72} />}
        title={project.name}
        meta={
          <>
            <span className="inline-flex items-center gap-2"><CompanyMark company={client} size={20} /> {client.name}</span>
            <span>{project.place}</span>
            <span>{project.from} – {project.to}</span>
            <Stamp>Active</Stamp>
          </>
        }
        actions={
          <>
            <Btn kind="secondary" size="sm" onClick={onOpenChat}><MessageSquare className="h-4 w-4" aria-hidden /> Team thread</Btn>
            <Btn kind="primary" size="sm"><Plus className="h-4 w-4" aria-hidden /> Add person</Btn>
          </>
        }
      />

      <Tabs className="mt-7" value={tab} onChange={setTab} options={[{ id: "overview", label: "Overview" }, { id: "team", label: "Team", count: members.length }, { id: "schedule", label: "Schedule" }]} />

      <div className="mt-8 grid gap-x-14 gap-y-12 lg:grid-cols-[1fr_21rem]">
        <section className="min-w-0" aria-label="Team">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <TeamStack members={members.map((m) => m.person)} size={40} max={6} />
            <p className="text-support text-text-secondary">
              <span className="font-display text-[1.3rem] font-semibold tabular-nums text-text-primary">{members.length}</span> people · {NEED.roles.length} roles ·{" "}
              <span className={covered ? "text-text-primary" : "text-state-amber"}>{covered ? "every required capability covered" : "some capabilities not yet covered"}</span>
            </p>
          </div>

          {NEED.roles.map((r) => {
            const rows = members.filter((m) => m.role === r.id);
            if (rows.length === 0) return null;
            return (
              <div key={r.id} className="mt-9">
                <header className="flex items-baseline justify-between gap-4 border-b border-text-primary/10 pb-2.5">
                  <h2 className="font-display text-[1.1rem] font-semibold tracking-[-0.02em]">{r.label}</h2>
                  <span className="text-meta text-text-muted">{RESPONSIBILITY[r.id]}</span>
                </header>
                <ul>
                  {rows.map(({ person: p }) => {
                    const cells = weekCells(p);
                    return (
                      <li key={p.id} data-person={p.id} className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 border-b border-text-primary/10 py-4 md:grid-cols-[auto_1fr_17rem]">
                        <PersonAvatar person={p} size={48} />
                        <div className="min-w-0">
                          <button type="button" onClick={() => onOpenProfile(p.id)} className="text-left text-[1rem] font-medium hover:underline">
                            {p.anonymous ? "Anonymous candidate" : p.name}
                          </button>
                          <p className="text-meta text-text-muted">{p.headline}</p>
                        </div>
                        <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
                          <div className="flex gap-[3px]" role="img" aria-label="Weeks on the project">
                            {cells.map((c, w) => (
                              <span
                                key={w}
                                className={cn(
                                  "h-2 flex-1 rounded-[2px]",
                                  c === "on" && "bg-text-primary/60",
                                  c === "late" && "border border-text-primary/35",
                                  c === "busy" && "bg-state-amber/70",
                                )}
                              />
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-meta text-text-muted">
                            <Avail a={p.availability} className="text-meta" />
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

        <aside className="flex flex-col gap-10">
          <section aria-label="Coming up">
            <Stamp>Coming up</Stamp>
            <ul className="mt-3 flex flex-col">
              {UPCOMING.map((u) => (
                <li key={u.what} className="border-t border-text-primary/10 py-3.5 first:border-t-0">
                  <p className="text-meta text-text-muted">{u.when}</p>
                  <p className="mt-0.5 text-[0.95rem] font-medium">{u.what}</p>
                  <TeamStack className="mt-2" members={u.who.map(personById)} size={24} />
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Activity">
            <Stamp>Activity</Stamp>
            <ul className="mt-3 flex flex-col">
              {ACTIVITY.map((a) => (
                <li key={a.text} className="flex items-center gap-3 border-t border-text-primary/10 py-3 first:border-t-0">
                  <PersonAvatar person={personById(a.who)} size={28} />
                  <span className="text-support text-text-secondary"><span className="text-text-primary">{personById(a.who).name.split(" ")[0]}</span> {a.text}</span>
                  <Stamp className="ml-auto">{a.t}</Stamp>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
