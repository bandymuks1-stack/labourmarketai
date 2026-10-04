"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { PEOPLE, type Person } from "@/lib/design-proof/product-fixtures";

import { PersonAvatar } from "./identity";
import { PageHeader } from "./shell";
import { Avail, Btn, EvidenceBar, LevelMark, Segmented, Stamp } from "./ui";

/**
 * PEOPLE — find, compare, decide. A dense working list, not a gallery.
 *
 *   filters (left)  ·  results (centre)  ·  the selected candidate (right)
 *
 * The row says who, what they can do (with what stands behind it), where, and
 * when they can start — and nothing else. The detail answers "should I take
 * this further?" without leaving the list. An anonymised candidate is a full
 * citizen of the list: same row, same evidence, no identity until they agree.
 */
export const ROLE_FILTERS = ["All", "Site lead", "Scaffolder", "Electrician", "Safety officer", "Finishing trades"] as const;

export const topCaps = (p: Person, n = 3) => [...p.caps].sort((a, b) => b.hours - a.hours).slice(0, n);
const hoursOf = (p: Person) => p.caps.reduce((s, c) => s + c.hours, 0);

export function PeopleSearch({
  selectedId,
  onSelect,
  onOpenProfile,
  inTeam = [],
  onAddToTeam,
  teamLabel = "Add to team",
}: {
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly onOpenProfile: (id: string) => void;
  readonly inTeam?: readonly string[];
  readonly onAddToTeam?: (id: string) => void;
  readonly teamLabel?: string;
}) {
  const [role, setRole] = useState<(typeof ROLE_FILTERS)[number]>("All");
  const [now, setNow] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);

  const list = useMemo(
    () =>
      PEOPLE.filter((p) => (role === "All" ? true : p.role === role))
        .filter((p) => (now ? p.availability.state === "now" : true))
        .filter((p) => (confirmedOnly ? p.caps.some((c) => c.level === "confirmed") : true))
        .sort((a, b) => hoursOf(b) - hoursOf(a)),
    [role, now, confirmedOnly],
  );
  const selected = PEOPLE.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-[1360px] px-4 py-6 md:px-8 md:py-9" data-testid="people-search">
      <PageHeader
        title="People"
        meta={<span>{list.length} of {PEOPLE.length} match</span>}
        actions={<Btn kind="secondary" size="sm"><SlidersHorizontal className="h-4 w-4" aria-hidden /> Saved searches</Btn>}
      />

      <div className="mt-7 grid gap-x-10 gap-y-6 lg:grid-cols-[13.5rem_1fr] xl:grid-cols-[13.5rem_1fr_23rem]">
        {/* filters */}
        <aside className="flex flex-col gap-6 max-lg:flex-row max-lg:flex-wrap max-lg:items-center">
          <div className="flex flex-col gap-2 max-lg:flex-row max-lg:flex-wrap max-lg:items-center">
            <Stamp className="max-lg:hidden">Role</Stamp>
            <div className="flex flex-wrap gap-1.5 lg:flex-col lg:items-start lg:gap-0.5">
              {ROLE_FILTERS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[0.9rem] transition-colors lg:-ml-3",
                    role === r ? "bg-text-primary text-ink-900 font-medium" : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2.5 max-lg:flex-row max-lg:gap-5">
            <Stamp className="max-lg:hidden">Narrow by</Stamp>
            {[
              { label: "Available now", v: now, set: setNow },
              { label: "Confirmed work only", v: confirmedOnly, set: setConfirmedOnly },
            ].map((f) => (
              <label key={f.label} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[0.9rem] text-text-secondary">
                <input type="checkbox" checked={f.v} onChange={(e) => f.set(e.target.checked)} className="h-4 w-4 accent-[rgb(212,175,55)]" />
                {f.label}
              </label>
            ))}
          </div>
        </aside>

        {/* results */}
        <ul className="min-w-0" aria-label="Results">
          {list.map((p) => {
            const on = p.id === selectedId;
            const inT = inTeam.includes(p.id);
            return (
              <li key={p.id} data-person={p.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelect(p.id);
                    setMobileDetail(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onSelect(p.id);
                      setMobileDetail(true);
                    }
                  }}
                  aria-pressed={on}
                  className={cn(
                    "group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 border-t border-text-primary/10 py-4 pl-3 pr-3 transition-colors first:border-t-0 hover:bg-text-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                    on && "bg-text-primary/[0.05] shadow-[inset_3px_0_0_rgb(var(--c-brand-blue))]",
                  )}
                >
                  <PersonAvatar person={p} size={48} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-[1rem] font-medium">
                      {p.anonymous ? "Anonymous candidate" : p.name}
                      {p.anonymous ? <Stamp>Identity hidden</Stamp> : null}
                    </p>
                    <p className="truncate text-support text-text-secondary">{p.headline}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-text-secondary max-sm:hidden">
                      {topCaps(p).map((c) => (
                        <span key={c.label} className="inline-flex items-center gap-1.5">
                          <LevelMark level={c.level} />
                          {c.label}
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Avail a={p.availability} className="text-meta" />
                    <span className="text-meta text-text-muted max-sm:hidden">{p.location}</span>
                  </div>
                  {onAddToTeam ? (
                    <div className="col-span-3 flex justify-end sm:hidden" />
                  ) : null}
                </div>
                {onAddToTeam ? null : null}
                {inT ? <span className="sr-only">In team</span> : null}
              </li>
            );
          })}
          {list.length === 0 ? <li className="py-16 text-center text-support text-text-muted">No one matches these filters.</li> : null}
        </ul>

        {/* the selected candidate */}
        <CandidateDetail
          className="max-xl:hidden"
          person={selected}
          onOpenProfile={onOpenProfile}
          onAdd={onAddToTeam}
          addLabel={teamLabel}
          inTeam={selected ? inTeam.includes(selected.id) : false}
        />
      </div>

      {/* phones: the detail takes the screen */}
      {selected && mobileDetail ? (
        <div className="fixed inset-0 z-40 overflow-auto bg-ink-900 pb-24 xl:hidden">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-text-primary/10 bg-ink-900/90 px-3 py-2 backdrop-blur">
            <Btn kind="ghost" size="sm" onClick={() => setMobileDetail(false)}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Results
            </Btn>
          </div>
          <CandidateDetail person={selected} onOpenProfile={onOpenProfile} onAdd={onAddToTeam} addLabel={teamLabel} inTeam={inTeam.includes(selected.id)} className="px-4 py-6" />
        </div>
      ) : null}
    </div>
  );
}

export function CandidateDetail({
  person,
  onOpenProfile,
  onAdd,
  addLabel,
  inTeam,
  className,
}: {
  readonly person: Person | null;
  readonly onOpenProfile: (id: string) => void;
  readonly onAdd?: (id: string) => void;
  readonly addLabel: string;
  readonly inTeam: boolean;
  readonly className?: string;
}) {
  if (!person) {
    return (
      <aside className={cn("flex flex-col gap-3 border-l border-text-primary/10 pl-8 pt-2 text-support text-text-muted", className)}>
        <Stamp>Candidate</Stamp>
        Choose someone to see what they can do and what stands behind it.
      </aside>
    );
  }
  const caps = topCaps(person, 4);
  return (
    <aside className={cn("flex flex-col gap-6 border-l border-text-primary/10 pl-8 lg:sticky lg:top-24 lg:self-start max-xl:border-l-0 max-xl:pl-0", className)} data-testid="candidate-detail">
      <div className="flex items-center gap-4">
        <PersonAvatar person={person} size={72} />
        <div className="min-w-0">
          <h2 className="font-display text-[1.35rem] font-semibold leading-tight tracking-[-0.025em]">{person.anonymous ? "Anonymous candidate" : person.name}</h2>
          <p className="mt-1 text-support text-text-secondary">{person.headline}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[4.6rem_1fr] gap-x-3 gap-y-2 text-support">
        <dt className="sig-stamp pt-0.5">Starts</dt>
        <dd><Avail a={person.availability} /></dd>
        <dt className="sig-stamp pt-0.5">Based</dt>
        <dd className="text-text-secondary">{person.location}</dd>
        <dt className="sig-stamp pt-0.5">Speaks</dt>
        <dd className="text-text-secondary">{person.languages.join(" · ")}</dd>
      </dl>
      <div>
        <Stamp>What stands behind it</Stamp>
        <ul className="mt-3 flex flex-col gap-3">
          {caps.map((c) => (
            <li key={c.label} className="flex items-center gap-3">
              <LevelMark level={c.level} />
              <span className="text-support">{c.label}</span>
              <EvidenceBar confirmed={c.confirmed} recorded={c.recorded} width={56} className="ml-auto" />
              <span className="w-12 text-right text-meta tabular-nums text-text-muted">{c.hours > 0 ? `${c.hours} h` : "—"}</span>
            </li>
          ))}
        </ul>
      </div>
      {person.experience.length > 0 ? (
        <div>
          <Stamp>Recently</Stamp>
          <ul className="mt-3 flex flex-col gap-2">
            {person.experience.slice(0, 2).map((e) => (
              <li key={e.id} className="text-support text-text-secondary">
                {e.role} · {e.org} <span className="text-text-muted">{e.from}—{e.to}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-support text-text-muted">Employers stay hidden until this person agrees to share them.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {onAdd ? (
          <Btn kind="primary" onClick={() => onAdd(person.id)} disabled={inTeam}>
            {inTeam ? "In the team" : addLabel}
          </Btn>
        ) : null}
        <Btn kind="secondary" onClick={() => onOpenProfile(person.id)}>
          Open profile <ArrowRight className="h-4 w-4" aria-hidden />
        </Btn>
      </div>
    </aside>
  );
}
