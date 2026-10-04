"use client";

import { useState } from "react";
import { ArrowLeft, Paperclip, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { COMPANIES, PROJECTS, personById, type Person } from "@/lib/design-proof/product-fixtures";
import { coverageOf, membersOf, seatTotals, type Seats } from "@/lib/design-proof/team-model";

import { CompanyMark, PersonAvatar, ProjectMark, TeamMark, TeamStack } from "./identity";
import { Btn, Stamp } from "./ui";

/**
 * CONVERSATION — in the context it belongs to.
 *
 * A thread is never free-floating. It says WHAT it is about (here, a project),
 * WHO is in it (the same identities as everywhere), and carries the facts the
 * conversation depends on — the agreement and what the team covers — pinned
 * above the messages, so nobody has to ask "what did we agree?". Changes to
 * the team appear in the thread as events, with the person who changed.
 */
type Msg =
  | { readonly kind: "system"; readonly text: string; readonly who?: string; readonly time: string }
  | { readonly kind: "msg"; readonly who: string; readonly text: string; readonly time: string; readonly file?: string };

const THREAD_MSGS: readonly Msg[] = [
  { kind: "system", text: "Harbour core team created", time: "Mon 09:12" },
  { kind: "msg", who: "is", text: "Welcome. Week one: site induction Monday 10 Nov, 07:00 at gate B. Bring your own PPE; locks and cards are issued on the day.", time: "Mon 09:20" },
  { kind: "msg", who: "mn", text: "Can I bring my own tester? It is calibrated to the end of the year.", time: "Mon 10:02" },
  { kind: "msg", who: "ap", text: "Yes, as long as the certificate is on file. Send it to me and I will add it to the site register.", time: "Mon 10:15" },
  { kind: "system", text: "Marek Nowak was added as Electrician", who: "mn", time: "Mon 11:40" },
  { kind: "msg", who: "tk", text: "Scaffold plan v2 is up. Level 3 access moved to the east stair.", time: "Mon 14:31", file: "Scaffold plan v2.pdf" },
];

const THREADS = [
  { id: "team", kind: "team", title: "Harbour core team", preview: "Scaffold plan v2 is up…", time: "14:31", unread: 2 },
  { id: "is", kind: "person", who: "is", title: "Ingrid Solheim", preview: "Can you start on the 3rd?", time: "11:05", unread: 0 },
  { id: "co", kind: "company", title: "Nordhaus Build AS", preview: "Agreement ready to sign", time: "Mon", unread: 0 },
  { id: "an", kind: "person", who: "an1", title: "Anonymous candidate", preview: "Available from the 17th", time: "Mon", unread: 1 },
] as const;

export function ConversationScreen({ seats, initialOpen = false }: { readonly seats: Seats; readonly initialOpen?: boolean }) {
  const project = PROJECTS[0]!;
  const nord = COMPANIES[0]!;
  const members = membersOf(seats).map((m) => personById(m.personId));
  const totals = seatTotals(seats);
  const cov = coverageOf(seats);
  const covered = cov.filter((c) => c.status === "covered").length;
  const [open, setOpen] = useState<string | null>(initialOpen ? "team" : null);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<Msg[]>([]);
  const thread = THREADS[0]!;
  const all = [...THREAD_MSGS, ...sent];

  const list = (
    <ul aria-label="Conversations" className="flex flex-col">
      {THREADS.map((t) => {
        const active = t.id === "team";
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => setOpen(t.id)}
              aria-current={active ? "true" : undefined}
              className={cn("grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3.5 border-b border-text-primary/10 px-4 py-3.5 text-left transition-colors hover:bg-text-primary/[0.04] md:px-5", active && "bg-text-primary/[0.05]")}
            >
              {t.kind === "team" ? <TeamMark members={members} size={44} /> : t.kind === "company" ? <CompanyMark company={nord} size={44} /> : <PersonAvatar person={personById(t.who)} size={44} />}
              <span className="min-w-0">
                <span className="block truncate text-[0.95rem] font-medium">{t.title}</span>
                <span className="block truncate text-meta text-text-muted">{t.preview}</span>
              </span>
              <span className="flex flex-col items-end gap-1.5">
                <Stamp>{t.time}</Stamp>
                {t.unread ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-blue px-1.5 text-[0.7rem] font-semibold text-text-on-brand">{t.unread}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const pane = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3.5 border-b border-text-primary/10 px-4 py-3 md:px-6">
        <button type="button" onClick={() => setOpen(null)} aria-label="Back to conversations" className="-ml-1 flex h-10 w-10 items-center justify-center rounded-xl text-text-secondary hover:bg-text-primary/[0.06] md:hidden">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <TeamMark members={members} size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[1.1rem] font-semibold tracking-[-0.02em]">{thread.title}</h1>
          <p className="flex items-center gap-2 truncate text-meta text-text-muted">
            <ProjectMark project={project} size={16} wide={false} className="!rounded-[3px]" />
            {project.name}
          </p>
        </div>
        <TeamStack members={members} size={28} max={4} className="max-md:hidden" />
      </header>

      {/* the context the conversation depends on */}
      <div className="grid gap-x-8 gap-y-3 border-b border-text-primary/10 bg-text-primary/[0.025] px-4 py-3.5 md:grid-cols-[1fr_auto] md:px-6" data-testid="thread-context">
        <div>
          <Stamp>Agreed</Stamp>
          <p className="mt-1 text-support text-text-secondary">
            {project.from} – {project.to} · 40 h a week · housing provided · hours confirmed weekly by the site lead
          </p>
        </div>
        <div className="flex items-center gap-5 text-support">
          <span><span className="font-display text-[1.2rem] font-semibold tabular-nums">{totals.filled}</span><span className="text-text-muted"> / {totals.total} seats</span></span>
          <span><span className="font-display text-[1.2rem] font-semibold tabular-nums">{covered}</span><span className="text-text-muted"> / {cov.length} covered</span></span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-6" role="log" aria-label="Messages">
        <ul className="flex flex-col gap-5">
          {all.map((m, i) =>
            m.kind === "system" ? (
              <li key={i} className="flex items-center gap-3 text-meta text-text-muted">
                <span className="h-px flex-1 bg-text-primary/10" />
                {m.who ? <PersonAvatar person={personById(m.who)} size={20} /> : null}
                <span>{m.text}</span>
                <Stamp>{m.time}</Stamp>
                <span className="h-px flex-1 bg-text-primary/10" />
              </li>
            ) : (
              <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3.5">
                <PersonAvatar person={personById(m.who)} size={36} />
                <div className="min-w-0">
                  <p className="flex items-baseline gap-2.5">
                    <span className="text-[0.95rem] font-medium">{personById(m.who).name}</span>
                    <Stamp>{personById(m.who).role} · {m.time}</Stamp>
                  </p>
                  <p className="mt-1 max-w-[62ch] text-[0.98rem] leading-relaxed text-text-secondary">{m.text}</p>
                  {m.file ? (
                    <span className="mt-2 inline-flex items-center gap-2 rounded-lg border border-text-primary/12 px-3 py-2 text-support"><Paperclip className="h-3.5 w-3.5 text-text-muted" aria-hidden />{m.file}</span>
                  ) : null}
                </div>
              </li>
            ),
          )}
        </ul>
      </div>

      <form
        className="flex items-center gap-2 border-t border-text-primary/10 px-3 py-3 md:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setSent((s) => [...s, { kind: "msg", who: "tk", text: draft.trim(), time: "now" }]);
          setDraft("");
        }}
      >
        <button type="button" aria-label="Attach" className="flex h-11 w-11 items-center justify-center rounded-xl text-text-muted hover:bg-text-primary/[0.06]"><Paperclip className="h-5 w-5" aria-hidden /></button>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message the team" aria-label="Message" className="min-h-11 flex-1 rounded-xl border border-text-primary/12 bg-text-primary/[0.03] px-4 text-[0.95rem] outline-none placeholder:text-text-muted focus:border-brand-blue/70" />
        <Btn kind="primary" size="sm" type="submit" aria-label="Send"><Send className="h-4 w-4" aria-hidden /></Btn>
      </form>
    </div>
  );

  const side = (
    <aside className="flex flex-col gap-8 px-6 py-6 max-xl:hidden" aria-label="In this project">
      <div>
        <Stamp>In this project</Stamp>
        <ul className="mt-3 flex flex-col">
          {members.map((p: Person) => (
            <li key={p.id} className="flex items-center gap-3 border-t border-text-primary/10 py-2.5 first:border-t-0">
              <PersonAvatar person={p} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-[0.9rem] font-medium">{p.anonymous ? "Anonymous candidate" : p.name}</span>
                <span className="block truncate text-meta text-text-muted">{p.role}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Stamp>Client</Stamp>
        <div className="mt-3 flex items-center gap-3">
          <CompanyMark company={nord} size={36} />
          <span><span className="block text-[0.92rem] font-medium">{nord.name}</span><span className="block text-meta text-text-muted">{nord.place}</span></span>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="mx-auto h-[calc(100svh-4rem-76px)] max-w-[1480px] md:h-[calc(100svh-4rem)] md:grid md:grid-cols-[21rem_1fr] xl:grid-cols-[21rem_1fr_19rem]" data-testid="conversation-screen">
      <div className={cn("overflow-auto border-r border-text-primary/10", open ? "max-md:hidden" : "")}>
        <div className="flex items-baseline justify-between px-4 py-5 md:px-5">
          <h1 className="font-display text-[1.5rem] font-semibold tracking-[-0.03em]">Messages</h1>
          <Stamp>4 conversations</Stamp>
        </div>
        {list}
      </div>
      <div className={cn("min-h-0 border-r border-text-primary/10", open ? "" : "max-md:hidden")}>{pane}</div>
      {side}
    </div>
  );
}
