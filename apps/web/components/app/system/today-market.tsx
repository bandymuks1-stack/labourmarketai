"use client";

import { Brush, Hammer, Truck } from "lucide-react";

import { COMPANIES, PROJECTS, TEAMS, personById } from "@/lib/design-proof/product-fixtures";

import { CompanyMark, PersonAvatar, ProjectMark, ServiceMark, TeamMark, TeamStack } from "./identity";
import { PageHeader } from "./shell";
import { Btn, Section, Stamp } from "./ui";

/** TODAY — what needs you, and the work you are responsible for. */
export function TodayScreen({ onOpenProject, onOpenTeam, onOpenChat }: { readonly onOpenProject: () => void; readonly onOpenTeam: () => void; readonly onOpenChat: () => void }) {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-7 md:px-8 md:py-10" data-testid="today-screen">
      <PageHeader title="Today" meta={<span>Saturday 1 November · Nordhaus Build AS</span>} actions={<Btn kind="primary" size="sm">New need</Btn>} />
      <div className="mt-10 grid gap-x-14 gap-y-12 lg:grid-cols-2">
        <Section title="Needs you">
          <ul className="flex flex-col">
            {[
              { who: "mn", text: "accepted a seat on Harbour Quarter", act: "Open team", on: onOpenTeam },
              { who: "ap", text: "asked about site access", act: "Reply", on: onOpenChat },
              { who: "pz", text: "is busy until 20 Nov — overlaps the start", act: "Resolve", on: onOpenTeam },
            ].map((n) => (
              <li key={n.text} className="flex items-center gap-4 border-t border-text-primary/10 py-4 first:border-t-0">
                <PersonAvatar person={personById(n.who)} size={44} />
                <span className="min-w-0 flex-1 text-[0.98rem]"><span className="font-medium">{personById(n.who).name.split(" ")[0]}</span> <span className="text-text-secondary">{n.text}</span></span>
                <Btn kind="secondary" size="sm" onClick={n.on}>{n.act}</Btn>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Projects">
          <ul className="flex flex-col">
            {PROJECTS.map((p) => (
              <li key={p.id} className="flex items-center gap-4 border-t border-text-primary/10 py-4 first:border-t-0">
                <ProjectMark project={p} size={52} />
                <button type="button" onClick={onOpenProject} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[1rem] font-medium">{p.name}</span>
                  <span className="text-meta text-text-muted">{p.place} · {p.from} – {p.to}</span>
                </button>
                <Stamp>{p.status}</Stamp>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Teams">
          <ul className="flex flex-col">
            {Object.values(TEAMS).map((t) => (
              <li key={t.id} className="flex items-center gap-4 border-t border-text-primary/10 py-4 first:border-t-0">
                <TeamMark members={t.members.map(personById)} size={48} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[1rem] font-medium">{t.name}</span><span className="text-meta text-text-muted">{t.members.length} people</span></span>
                <TeamStack members={t.members.map(personById)} size={24} max={4} className="max-sm:hidden" />
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

/** MARKET — needs, opportunities and services, each with its own identity. */
export function MarketScreen() {
  const needs = [
    { co: COMPANIES[0]!, title: "Scaffolders, 3 months", place: "Oslo, NO", note: "3 seats · starts 10 Nov" },
    { co: COMPANIES[2]!, title: "Electricians for a hotel refit", place: "Stavanger, NO", note: "2 seats · starts 12 Jan" },
    { co: COMPANIES[4]!, title: "Tiler for occupied apartments", place: "Hamburg, DE", note: "1 seat · starts 2 Dec" },
  ];
  const services = [
    { id: "s1", name: "Scaffold hire and erection", by: "Tallinna Tellingud OÜ", icon: <Hammer className="h-full w-full" strokeWidth={1.5} /> },
    { id: "s2", name: "Site transport, 3.5 t", by: "Baltic Staff UAB", icon: <Truck className="h-full w-full" strokeWidth={1.5} /> },
    { id: "s3", name: "Painting and plastering", by: "Lena Fischer", icon: <Brush className="h-full w-full" strokeWidth={1.5} /> },
  ];
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-7 md:px-8 md:py-10" data-testid="market-screen">
      <PageHeader title="Market" meta={<span>What businesses need and what people offer</span>} actions={<Btn kind="primary" size="sm">Post a need</Btn>} />
      <div className="mt-10 grid gap-x-14 gap-y-12 lg:grid-cols-2">
        <Section title="Needs">
          <ul className="flex flex-col">
            {needs.map((n) => (
              <li key={n.title} className="flex items-center gap-4 border-t border-text-primary/10 py-4 first:border-t-0">
                <CompanyMark company={n.co} size={48} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[1rem] font-medium">{n.title}</span><span className="text-meta text-text-muted">{n.co.name} · {n.place}</span></span>
                <Stamp className="max-sm:hidden">{n.note}</Stamp>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Services">
          <ul className="flex flex-col">
            {services.map((s) => (
              <li key={s.id} className="flex items-center gap-4 border-t border-text-primary/10 py-4 first:border-t-0">
                <ServiceMark id={s.id} size={48} icon={s.icon} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[1rem] font-medium">{s.name}</span><span className="text-meta text-text-muted">{s.by}</span></span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
