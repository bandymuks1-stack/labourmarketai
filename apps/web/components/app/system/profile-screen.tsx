"use client";

import { useState } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";

import { COMPANIES, PROJECTS, TEAMS, personById, type Person } from "@/lib/design-proof/product-fixtures";

import { PersonAvatar, ProjectMark, TeamMark } from "./identity";
import { LivingCv } from "./living-cv";
import { PageHeader } from "./shell";
import { Avail, Btn, LevelMark, Section, Stamp, Tabs } from "./ui";

/**
 * PERSON — the profile is the Living CV, in its context.
 *
 * The identity band says who this is and whether they can start; the actions are
 * the two things a visitor does next (talk, or take them into a team); the tabs
 * are the other views of the same person. Identity is the same avatar the person
 * has in search, in a team seat and in a thread.
 */
export function ProfileScreen({ person, onBack, onAdd, inTeam }: { readonly person: Person; readonly onBack: () => void; readonly onAdd?: (id: string) => void; readonly inTeam?: boolean }) {
  const [tab, setTab] = useState<"cv" | "teams" | "journal" | "docs">("cv");
  const teams = Object.values(TEAMS).filter((t) => (t.members as readonly string[]).includes(person.id));
  const actions = (
    <>
      <Btn kind="secondary" size="sm"><MessageSquare className="h-4 w-4" aria-hidden /> Message</Btn>
      {onAdd ? <Btn kind="primary" size="sm" disabled={inTeam} onClick={() => onAdd(person.id)}>{inTeam ? "In the team" : "Add to team"}</Btn> : <Btn kind="primary" size="sm">Shortlist</Btn>}
    </>
  );
  return (
    <div data-testid="profile-screen" data-person={person.id}>
      <div className="mx-auto max-w-[1180px] px-4 pt-6 md:px-8 md:pt-8">
        <Btn kind="ghost" size="sm" onClick={onBack} className="-ml-3"><ArrowLeft className="h-4 w-4" aria-hidden /> People</Btn>
        <div className="mt-3">
          <PageHeader
            lead={<PersonAvatar person={person} size={88} />}
            title={person.anonymous ? "Anonymous candidate" : person.name}
            meta={
              <>
                <span>{person.headline}</span>
                <span>{person.location}</span>
                <Avail a={person.availability} />
              </>
            }
            actions={actions}
          />
        </div>
        <Tabs
          className="mt-8"
          value={tab}
          onChange={setTab}
          options={[
            { id: "cv", label: "Living CV" },
            { id: "teams", label: "Teams and projects", count: teams.length + person.experience.filter((e) => e.project).length },
            { id: "journal", label: "Work journal" },
            { id: "docs", label: "Documents", count: person.documents.length },
          ]}
        />
      </div>

      {tab === "cv" ? <LivingCv person={person} embedded /> : null}

      {tab === "teams" ? (
        <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-4 py-9 md:px-8">
          <Section title="Teams">
            {teams.length ? (
              <ul className="flex flex-col">
                {teams.map((t) => (
                  <li key={t.id} className="flex items-center gap-4 border-t border-text-primary/10 py-4 first:border-t-0">
                    <TeamMark members={t.members.map(personById)} size={48} />
                    <span><span className="block text-[1rem] font-medium">{t.name}</span><span className="text-meta text-text-muted">{t.members.length} people</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-support text-text-muted">Not part of a team yet.</p>}
          </Section>
          <Section title="Projects">
            <ul className="flex flex-col">
              {person.experience.filter((e) => e.project).map((e, i) => (
                <li key={e.id} className="flex items-center gap-4 border-t border-text-primary/10 py-4 first:border-t-0">
                  <ProjectMark project={i === 0 ? PROJECTS[0]! : { id: e.id + person.id, name: e.project!, media: undefined }} size={48} />
                  <span><span className="block text-[1rem] font-medium">{e.project}</span><span className="text-meta text-text-muted">{e.role} · {e.org} · {e.from}—{e.to}</span></span>
                </li>
              ))}
              {person.experience.filter((e) => e.project).length === 0 ? <p className="text-support text-text-muted">No projects are visible yet.</p> : null}
            </ul>
          </Section>
        </div>
      ) : null}

      {tab === "journal" ? (
        <div className="mx-auto max-w-[1180px] px-4 py-9 md:px-8">
          <Section title="Recent work" aside="Written by the person; confirmed by a manager where marked">
            <ul className="flex flex-col">
              {person.caps.slice(0, 4).map((c, i) => (
                <li key={c.label} className="grid grid-cols-[6rem_1fr_auto] items-center gap-4 border-t border-text-primary/10 py-4 first:border-t-0">
                  <Stamp>{["Fri 31 Oct", "Thu 30 Oct", "Wed 29 Oct", "Tue 28 Oct"][i]}</Stamp>
                  <span className="text-[0.98rem]">{c.label}</span>
                  <span className="flex items-center gap-2 text-meta text-text-muted"><LevelMark level={i === 0 && c.level === "confirmed" ? "recorded" : c.level} />{i === 0 ? "6 h · waiting" : `${[6, 8, 7][i - 1] ?? 6} h`}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      ) : null}

      {tab === "docs" ? (
        <div className="mx-auto max-w-[1180px] px-4 py-9 md:px-8">
          <Section title="Documents and training">
            <ul className="flex flex-col">
              {[...person.documents.map((d) => ({ label: d.label, meta: d.valid })), ...person.training.map((t) => ({ label: t.label, meta: t.year }))].map((d) => (
                <li key={d.label} className="flex items-center justify-between gap-4 border-t border-text-primary/10 py-4 first:border-t-0">
                  <span className="text-[0.98rem]">{d.label}</span>
                  <span className="text-meta text-text-muted">{d.meta}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      ) : null}
    </div>
  );
}

export const _companies = COMPANIES;
