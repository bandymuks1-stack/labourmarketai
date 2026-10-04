"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  Compass,
  FolderKanban,
  House,
  MessageSquare,
  Plus,
  Search,
  Users,
  UsersRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  COMPANIES,
  PEOPLE,
  PROJECTS,
  TEAMS,
  companyById,
  personById,
} from "@/lib/design-proof/product-fixtures";

import { CompanyMark, PersonAvatar, ProjectMark, TeamMark } from "./identity";
import { Btn, Stamp } from "./ui";

/**
 * THE SHELL — the environment every object lives in.
 *
 * One calm frame for every kind of user. Navigation names WHAT you work with
 * (people, teams, projects, the market, messages), never a role; the CONTEXT
 * SWITCH at the top says WHO you are acting as (yourself, a company, an agency,
 * a project) and everything below is scoped to it. Search reaches across every
 * kind of party at once. The page header carries one primary action. Nothing in
 * the chrome competes with the work: no cards, no widgets, no dashboard.
 *
 *   ≥ 768 px   a slim rail (icons + words) · top bar · content
 *   < 768 px   top bar · content · tab bar
 */
export type NavId = "home" | "people" | "teams" | "projects" | "market" | "messages";

const NAV: readonly { readonly id: NavId; readonly label: string; readonly icon: typeof House }[] = [
  { id: "home", label: "Today", icon: House },
  { id: "people", label: "People", icon: Users },
  { id: "teams", label: "Teams", icon: UsersRound },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "market", label: "Market", icon: Compass },
  { id: "messages", label: "Messages", icon: MessageSquare },
];

const CONTEXTS = [
  { id: "company", kind: "Employer", name: "Nordhaus Build AS" },
  { id: "agency", kind: "Agency", name: "Baltic Staff UAB" },
  { id: "me", kind: "Personal", name: "Tomas Kazlauskas" },
] as const;

export function LMMark({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-label="LabourMarket.ai" className={cn("h-7 w-7", className)}>
      <path d="M4 26V6h4.2l5.8 11 5.8-11H24v20h-3.8V13.4l-4.6 8.6h-3.2l-4.6-8.6V26z" fill="currentColor" />
      <circle cx="27.4" cy="25" r="2" fill="rgb(var(--c-brand-blue))" />
    </svg>
  );
}

export function AppShell({
  active,
  onNav,
  onOpenPerson,
  children,
  contextIndex = 0,
  notice,
}: {
  readonly active: NavId;
  readonly onNav: (id: NavId) => void;
  readonly onOpenPerson?: (id: string) => void;
  readonly children: ReactNode;
  readonly contextIndex?: number;
  readonly notice?: string;
}) {
  const [ctxOpen, setCtxOpen] = useState(false);
  const [ctx, setCtx] = useState(contextIndex);
  const [bell, setBell] = useState(false);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setCtxOpen(false);
        setBell(false);
        setFocus(false);
      }
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, []);

  const current = CONTEXTS[ctx]!;
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? {
        people: PEOPLE.filter((p) => !p.anonymous && (p.name + p.headline).toLowerCase().includes(needle)).slice(0, 3),
        companies: COMPANIES.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 2),
        projects: PROJECTS.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 2),
      }
    : null;

  return (
    <div ref={root} className="relative flex min-h-[100svh] bg-ink-900 text-text-primary" data-testid="app-shell">
      {/* rail */}
      <nav aria-label="Primary" className="sticky top-0 hidden h-[100svh] w-[84px] shrink-0 flex-col items-center gap-1 border-r border-text-primary/10 py-5 md:flex">
        <LMMark className="mb-5 text-text-primary" />
        {NAV.map((n) => {
          const Icon = n.icon;
          const on = active === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onNav(n.id)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "group relative flex w-[68px] flex-col items-center gap-1 rounded-2xl py-2.5 text-[0.72rem] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                on ? "text-text-primary" : "text-text-muted hover:text-text-primary",
              )}
            >
              {on ? <span aria-hidden className="absolute -left-[8px] top-3 h-6 w-[3px] rounded-full bg-brand-blue" /> : null}
              <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 1.9 : 1.5} aria-hidden />
              {n.label}
            </button>
          );
        })}
        <div className="mt-auto">
          <PersonAvatar person={personById("tk")} size={36} />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col pb-[76px] md:pb-0">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-text-primary/10 bg-ink-900/85 px-4 backdrop-blur md:gap-5 md:px-8">
          {/* context */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setCtxOpen((v) => !v)}
              aria-expanded={ctxOpen}
              aria-haspopup="menu"
              className="flex min-h-11 items-center gap-2.5 rounded-xl py-1 pr-2 text-left hover:bg-text-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              {current.id === "me" ? <PersonAvatar person={personById("tk")} size={32} /> : <CompanyMark company={companyById(current.id === "company" ? "nordhaus" : "baltic")} size={32} />}
              <span className="max-md:hidden">
                <span className="block text-[0.92rem] font-medium leading-tight">{current.name}</span>
                <Stamp className="block leading-tight">{current.kind}</Stamp>
              </span>
              <ChevronDown className="h-4 w-4 text-text-muted" aria-hidden />
            </button>
            {ctxOpen ? (
              <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-40 w-[300px] rounded-2xl border border-text-primary/12 bg-[#121110] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
                <Stamp className="block px-3 pb-1 pt-2">Act as</Stamp>
                {CONTEXTS.map((c, i) => (
                  <button
                    key={c.id}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setCtx(i);
                      setCtxOpen(false);
                    }}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-text-primary/[0.06]", i === ctx && "bg-text-primary/[0.05]")}
                  >
                    {c.id === "me" ? <PersonAvatar person={personById("tk")} size={32} /> : <CompanyMark company={companyById(c.id === "company" ? "nordhaus" : "baltic")} size={32} />}
                    <span>
                      <span className="block text-[0.92rem] font-medium leading-tight">{c.name}</span>
                      <Stamp>{c.kind}</Stamp>
                    </span>
                  </button>
                ))}
                <div className="my-1 h-px bg-text-primary/10" />
                <Stamp className="block px-3 pb-1 pt-2">Project</Stamp>
                <button type="button" role="menuitem" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-text-primary/[0.06]">
                  <ProjectMark project={PROJECTS[0]!} size={32} />
                  <span>
                    <span className="block text-[0.92rem] font-medium leading-tight">Harbour Quarter fit-out</span>
                    <Stamp>Oslo · forming team</Stamp>
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          {/* search */}
          <div className="relative min-w-0 flex-1 md:max-w-[560px]">
            <label className="flex min-h-11 items-center gap-2.5 rounded-xl border border-text-primary/12 bg-text-primary/[0.03] px-3.5 focus-within:border-brand-blue/70">
              <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setFocus(true)}
                placeholder="Search people, companies, projects"
                aria-label="Search"
                className="min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-text-muted"
              />
              <span className="sig-stamp hidden rounded border border-text-primary/15 px-1.5 py-0.5 md:inline">⌘K</span>
            </label>
            {focus && hits ? (
              <div className="absolute inset-x-0 top-[calc(100%+6px)] z-40 rounded-2xl border border-text-primary/12 bg-[#121110] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
                {hits.people.map((p) => (
                  <button key={p.id} type="button" onClick={() => { onOpenPerson?.(p.id); setFocus(false); setQ(""); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-text-primary/[0.06]">
                    <PersonAvatar person={p} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.92rem] font-medium">{p.name}</span>
                      <span className="block truncate text-meta text-text-muted">{p.headline}</span>
                    </span>
                    <Stamp className="ml-auto">Person</Stamp>
                  </button>
                ))}
                {hits.companies.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
                    <CompanyMark company={c} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.92rem] font-medium">{c.name}</span>
                      <span className="block text-meta text-text-muted">{c.place}</span>
                    </span>
                    <Stamp className="ml-auto">Company</Stamp>
                  </div>
                ))}
                {hits.projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
                    <ProjectMark project={p} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-[0.92rem] font-medium">{p.name}</span>
                      <span className="block text-meta text-text-muted">{p.place}</span>
                    </span>
                    <Stamp className="ml-auto">Project</Stamp>
                  </div>
                ))}
                {!hits.people.length && !hits.companies.length && !hits.projects.length ? <p className="px-3 py-3 text-support text-text-muted">Nothing matches.</p> : null}
              </div>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-1.5 md:gap-3">
            <div className="relative">
              <button type="button" onClick={() => setBell((v) => !v)} aria-label="Notifications" aria-expanded={bell} className="relative flex h-11 w-11 items-center justify-center rounded-xl text-text-secondary hover:bg-text-primary/[0.06] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
                <Bell className="h-5 w-5" strokeWidth={1.6} aria-hidden />
                <span aria-hidden className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-blue ring-2 ring-ink-900" />
              </button>
              {bell ? (
                <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[320px] rounded-2xl border border-text-primary/12 bg-[#121110] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
                  <Stamp className="block px-3 pb-1 pt-2">Needs you</Stamp>
                  {[
                    { who: personById("mn"), text: "Marek confirmed his start date", t: "2 h" },
                    { who: personById("ap"), text: "Aistė asked about site access", t: "5 h" },
                    { who: personById("pz"), text: "Piotr is busy until 20 Nov", t: "1 d" },
                  ].map((n) => (
                    <div key={n.text} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-text-primary/[0.05]">
                      <PersonAvatar person={n.who} size={32} />
                      <span className="text-support text-text-secondary">{n.text}</span>
                      <Stamp className="ml-auto">{n.t}</Stamp>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <Btn kind="primary" size="sm" className="max-md:hidden">
              <Plus className="h-4 w-4" aria-hidden /> New
            </Btn>
          </div>
        </header>

        {notice ? <div role="status" className="border-b border-text-primary/10 bg-text-primary/[0.04] px-4 py-2 text-support text-text-secondary md:px-8">{notice}</div> : null}

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* tab bar (phones) */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-text-primary/10 bg-ink-900/92 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur md:hidden">
        {NAV.filter((n) => n.id !== "market").map((n) => {
          const Icon = n.icon;
          const on = active === n.id;
          return (
            <button key={n.id} type="button" onClick={() => onNav(n.id)} aria-current={on ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.68rem] font-medium", on ? "text-text-primary" : "text-text-muted")}>
              <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 1.9 : 1.5} aria-hidden />
              {n.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** The page's own header: identity, context, one primary action. */
export function PageHeader({
  lead,
  title,
  meta,
  actions,
}: {
  readonly lead?: ReactNode;
  readonly title: ReactNode;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
      {lead ? <div className="shrink-0">{lead}</div> : null}
      <div className="min-w-0 flex-1 basis-[13rem]">
        <h1 className="font-display text-[clamp(1.55rem,3vw,2rem)] font-semibold leading-[1.05] tracking-[-0.03em]">{title}</h1>
        {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-support text-text-secondary">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 max-md:w-full">{actions}</div> : null}
    </div>
  );
}

export { TeamMark, TEAMS };
