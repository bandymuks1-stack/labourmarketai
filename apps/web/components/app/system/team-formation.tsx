"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Mail, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  COMPANIES,
  NEED,
  PEOPLE,
  PROJECTS,
  personById,
  type Person,
  type RoleId,
} from "@/lib/design-proof/product-fixtures";
import {
  addPerson,
  conflictOf,
  coverageOf,
  fitRank,
  inviteSeat,
  membersOf,
  removeSeat,
  replaceSeat,
  roleOfPerson,
  seatTotals,
  type Seats,
} from "@/lib/design-proof/team-model";

import { EntityCard, EntityPlate, EntityThumb } from "./entity";
import { Accented, Avail, Btn, Eyebrow, LevelMark, RegionHead, Segmented } from "./ui";

/**
 * TEAM FORMATION — a workforce tool, not a showpiece.
 *
 *   THE NEED (left)        what the project requires and what is covered so far
 *   THE TEAM (centre)      seats grouped by role: who holds them, what each person
 *                          brings, what is open, what clashes with the dates
 *   THE PEOPLE (right)     who could fill a seat, best fit first
 *
 * Everything is derived from the seats (lib/design-proof/team-model.ts). Adding
 * someone moves their identity — the same avatar — from the list into a seat;
 * the coverage on the left changes because of it; an open seat stays visible and
 * says exactly what is missing. "Confirm team" is available only when every seat
 * is held; a clash with the dates never blocks silently — it is named on the
 * person's own row.
 */
const ROLE_TABS = [{ id: "all", label: "All" }, ...NEED.roles.map((r) => ({ id: r.id, label: r.label }))] as const;

export function TeamFormation({
  seats,
  setSeats,
  onOpenProfile,
  onConfirm,
  confirmed,
}: {
  readonly seats: Seats;
  readonly setSeats: (s: Seats) => void;
  readonly onOpenProfile: (id: string) => void;
  readonly onConfirm: () => void;
  readonly confirmed: boolean;
}) {
  const reduce = useReducedMotion();
  const project = PROJECTS[0]!;
  const client = COMPANIES.find((c) => c.id === project.client)!;
  const [tab, setTab] = useState<"team" | "people">("team");
  const [roleFilter, setRoleFilter] = useState<"all" | RoleId>("all");
  const [replacing, setReplacing] = useState<{ role: RoleId; index: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const totals = seatTotals(seats);
  const coverage = useMemo(() => coverageOf(seats), [seats]);
  const members = membersOf(seats);
  const inTeam = new Set(members.map((m) => m.personId));
  const ready = totals.open === 0 && totals.invited === 0;
  const missingText = NEED.roles
    .map((r) => {
      const open = seats[r.id].filter((s) => s.kind !== "person").length;
      return open > 0 ? `${open} ${r.label.toLowerCase()}${open > 1 ? "s" : ""}` : null;
    })
    .filter(Boolean)
    .join(", ");

  const candidates = useMemo(
    () =>
      PEOPLE.filter((p) => !inTeam.has(p.id))
        .filter((p) => (roleFilter === "all" ? true : roleOfPerson(p) === roleFilter))
        .sort((a, b) => fitRank(b, roleFilter === "all" ? null : roleFilter) - fitRank(a, roleFilter === "all" ? null : roleFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seats, roleFilter],
  );

  const add = (p: Person) => {
    setMsg(null);
    const follow = () =>
      window.setTimeout(() => {
        document.querySelector(`[data-seat="person"][data-person="${p.id}"]`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        if (window.matchMedia("(max-width: 1279px)").matches) setTab("team");
      }, 160);
    if (replacing) {
      setSeats(replaceSeat(seats, replacing.role, replacing.index, p.id));
      setReplacing(null);
      follow();
      return;
    }
    const r = addPerson(seats, p.id);
    if (r.result === "added") {
      setSeats(r.seats);
      follow();
    }
    else if (r.result === "full") setMsg(`All ${roleOfPerson(p) ? NEED.roles.find((x) => x.id === roleOfPerson(p))!.label.toLowerCase() : "matching"} seats are taken. Replace someone, or open another seat.`);
    else if (r.result === "no-role") setMsg(`${p.name} does not fit any role this project asks for.`);
  };

  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 320, damping: 34, mass: 0.9 };

  const doneLine = confirmed ? "The team is confirmed and has been invited into the project." : ready ? "Every seat is held. Confirming invites the team into the project." : `${totals.filled} of ${totals.total} seats held · still needed: ${missingText}`;
  const covered = coverage.filter((c) => c.status === "covered").length;

  return (
    <div className="mx-auto max-w-[1380px] px-4 pb-36 pt-6 md:px-10 md:pt-9" data-testid="team-formation" data-ready={ready}>
      {/* the opening: the project this team is for, and the state of the team */}
      <section className="relative isolate overflow-hidden rounded-[30px] shadow-[inset_0_0_0_1px_rgba(245,241,232,0.10)]">
        <div className="absolute inset-0"><EntityPlate entity={{ kind: "project", id: project.id }} /></div>
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,7,6,0.94)_0%,rgba(7,7,6,0.7)_46%,rgba(7,7,6,0.2)_100%)]" />
        <div className="relative flex flex-col gap-8 p-6 pb-8 pt-16 md:flex-row md:items-end md:justify-between md:p-10">
          <div className="min-w-0">
            <Eyebrow>{client.name} · {project.place} · {project.from} – {project.to}</Eyebrow>
            <h1 className="mt-3 font-display text-[clamp(2rem,4.6vw,3.8rem)] font-semibold leading-[1] tracking-[-0.045em]">
              <Accented text={confirmed ? "The team is *confirmed*." : ready ? "The team is *ready*." : `${totals.filled} of ${totals.total} seats *held*.`} />
            </h1>
            <p className="mt-3 max-w-[48ch] text-[1.02rem] leading-snug text-text-secondary max-md:hidden">{doneLine}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:hidden">
            <Btn kind="secondary" size="sm">Save draft</Btn>
            <Btn kind="primary" disabled={!ready || confirmed} onClick={onConfirm} data-testid="confirm-team">{confirmed ? "Confirmed" : "Confirm team"}</Btn>
          </div>
        </div>
      </section>

      {/* what this team can do — the coverage strip, always visible */}
      <section className="mt-9" aria-label="What this team can do">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Eyebrow>What this team can do</Eyebrow>
          <span className="text-[0.88rem] text-text-secondary"><span className="font-display text-[1.3rem] font-semibold tabular-nums text-text-primary">{covered}</span> of {coverage.length} capabilities covered</span>
        </div>
        <ul className="-mx-4 mt-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
          {coverage.map((c) => (
            <li key={c.cap} data-status={c.status} className={cn("flex shrink-0 items-center gap-3 rounded-full py-2 pl-4 pr-3.5 shadow-[inset_0_0_0_1px_rgba(245,241,232,0.10)] transition-colors duration-500", c.status === "covered" ? "bg-[rgba(212,175,55,0.10)]" : c.status === "missing" ? "bg-[rgba(255,184,69,0.07)]" : "bg-[rgba(245,241,232,0.04)]")}>
              <span className="text-[0.92rem] font-medium">{c.cap}</span>
              <span className="flex gap-1">
                {Array.from({ length: c.needed }).map((_, i) => (
                  <span key={i} aria-hidden className={cn("h-1.5 w-4 rounded-full transition-colors duration-500", i < c.confirmed ? "bg-[rgb(235,200,95)]" : i < c.confirmed + c.recorded ? "bg-text-primary/45" : "border border-dashed border-text-primary/35")} />
                ))}
              </span>
              <span className={cn("text-[0.76rem]", c.status === "missing" ? "text-state-amber" : "text-text-muted")}>
                {c.status === "covered" ? "Covered" : c.status === "own-records" ? "Own records" : "Nobody"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Segmented className="mt-9 xl:hidden" label="Workspace" value={tab} onChange={setTab} options={[{ id: "team", label: `Team ${totals.filled}/${totals.total}` }, { id: "people", label: "People" }]} />

      <LayoutGroup>
        <div className="mt-10 grid gap-x-12 gap-y-12 xl:grid-cols-[1fr_27rem]">
          {/* THE TEAM — the primary object */}
          <section className={cn("flex min-w-0 flex-col gap-12", tab === "team" ? "flex" : "max-xl:hidden")} aria-label="The team">
            {NEED.roles.map((r) => {
              const held = seats[r.id].filter((s) => s.kind === "person").length;
              return (
                <div key={r.id} data-role={r.id}>
                  <RegionHead eyebrow={`${held} of ${r.count} · ${r.caps.join(" · ")}`} title={`${r.label}${r.count > 1 ? "s" : ""}`} className="mb-6" />
                  <ul className={cn("grid gap-4", r.count === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")}>
                    <AnimatePresence initial={false} mode="popLayout">
                      {seats[r.id].map((s, i) => {
                        const key = `${r.id}-${i}-${s.kind}-${s.kind === "person" ? s.id : ""}`;
                        if (s.kind === "person") {
                          const p = personById(s.id);
                          const conflict = conflictOf(p);
                          const mine = p.caps.filter((c) => (r.caps as readonly string[]).includes(c.label));
                          return (
                            <motion.li key={key} layout transition={spring} initial={{ opacity: 0.4, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} data-seat="person" data-person={p.id}>
                              <motion.div layoutId={`card-${p.id}`} transition={spring}>
                                <EntityCard entity={{ kind: "person", id: p.id }} aspect={r.count === 1 ? "5 / 2" : "4 / 5"} onClick={() => onOpenProfile(p.id)} as="button">
                                  <span className="mt-2 flex flex-col gap-1">
                                    {mine.map((c) => (
                                      <span key={c.label} className="inline-flex items-center gap-2 text-[0.82rem] text-text-secondary"><LevelMark level={c.level} />{c.label}</span>
                                    ))}
                                    {conflict ? <span className="inline-flex items-center gap-1.5 text-[0.8rem] text-state-amber"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />{conflict.text}</span> : null}
                                  </span>
                                </EntityCard>
                              </motion.div>
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1">
                                <Avail a={p.availability} className="text-[0.8rem] max-md:basis-full" />
                                <span className="flex">
                                  <Btn kind="ghost" size="sm" onClick={() => { setReplacing({ role: r.id, index: i }); setRoleFilter(r.id); setTab("people"); }}>Replace</Btn>
                                  <Btn kind="ghost" size="sm" onClick={() => setSeats(removeSeat(seats, r.id, i))} aria-label={`Remove ${p.name}`}><X className="h-4 w-4" aria-hidden /></Btn>
                                </span>
                              </div>
                            </motion.li>
                          );
                        }
                        return (
                          <motion.li key={key} layout transition={spring} data-seat={s.kind} className="flex flex-col">
                            <div className={cn("relative flex w-full flex-col items-center justify-center gap-3 rounded-[26px] border border-dashed border-text-primary/25 bg-[rgba(245,241,232,0.02)] px-4 text-center", r.count === 1 ? "aspect-[5/2]" : "aspect-[4/5]")}>
                              <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-text-primary/35 text-text-muted">
                                {s.kind === "invited" ? <Mail className="h-5 w-5" strokeWidth={1.5} /> : <span className="text-[1.5rem] leading-none">+</span>}
                              </span>
                              <span>
                                <span className="block text-[1rem] font-medium text-text-secondary">{s.kind === "invited" ? "Invitation sent" : `${r.label}, seat ${i + 1} of ${r.count}`}</span>
                                <span className="mt-1 block text-[0.8rem] text-text-muted">{s.kind === "invited" ? "Waiting for an answer" : `Needs ${r.caps.join(" and ")}`}</span>
                              </span>
                            </div>
                            <div className="mt-2 flex justify-center gap-1.5">
                              {s.kind === "invited" ? (
                                <Btn kind="ghost" size="sm" onClick={() => setSeats(removeSeat(seats, r.id, i))}>Cancel</Btn>
                              ) : (
                                <>
                                  <Btn kind="secondary" size="sm" onClick={() => { setReplacing(null); setRoleFilter(r.id); setTab("people"); }}>Find people</Btn>
                                  <Btn kind="ghost" size="sm" onClick={() => setSeats(inviteSeat(seats, r.id, i))}>Invite</Btn>
                                </>
                              )}
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                </div>
              );
            })}
          </section>

          {/* THE PEOPLE — who could take a seat */}
          <section className={cn("flex min-w-0 flex-col gap-5 xl:sticky xl:top-24 xl:max-h-[calc(100svh-7rem)] xl:self-start xl:overflow-y-auto", tab === "people" ? "flex" : "max-xl:hidden")} aria-label="Available people">
            <RegionHead eyebrow={`${candidates.length} not on the team · best fit first`} title={replacing ? `Replace *${(() => { const st = seats[replacing.role][replacing.index]; return st && st.kind === "person" ? personById(st.id).name.split(" ")[0] : "someone"; })()}*` : "Available *people*"} />
            {replacing ? (
              <div className="flex items-center justify-between rounded-2xl border border-brand-blue/50 px-4 py-3 text-[0.95rem]">
                <span>Choose the person who takes this seat.</span>
                <Btn kind="ghost" size="sm" onClick={() => setReplacing(null)}>Cancel</Btn>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Role">
              {ROLE_TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={roleFilter === t.id} onClick={() => setRoleFilter(t.id as "all" | RoleId)} className={cn("min-h-9 rounded-full px-3.5 text-[0.88rem] transition-colors", roleFilter === t.id ? "bg-text-primary font-medium text-ink-900" : "text-text-secondary hover:text-text-primary")}>
                  {t.label}
                </button>
              ))}
            </div>
            {msg ? <p role="status" className="rounded-2xl bg-state-amber/10 px-4 py-3 text-[0.92rem] text-state-amber">{msg}</p> : null}
            <ul className="flex flex-col gap-3">
              <AnimatePresence initial={false} mode="popLayout">
                {candidates.map((p) => {
                  const conflict = conflictOf(p);
                  const roleCaps = roleFilter === "all" ? p.caps.slice(0, 2) : p.caps.filter((c) => (NEED.roles.find((r) => r.id === roleFilter)!.caps as readonly string[]).includes(c.label));
                  return (
                    <motion.li key={p.id} layout transition={spring} exit={{ opacity: 0, x: -16 }} data-candidate={p.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 rounded-[22px] bg-[rgba(245,241,232,0.035)] p-3 pr-4 shadow-[inset_0_0_0_1px_rgba(245,241,232,0.08)]">
                      <motion.span layoutId={`card-${p.id}`} transition={spring} className="inline-flex">
                        <EntityThumb entity={{ kind: "person", id: p.id }} size={72} />
                      </motion.span>
                      <div className="min-w-0">
                        <button type="button" onClick={() => onOpenProfile(p.id)} className="block max-w-full truncate text-left font-display text-[1.05rem] font-semibold tracking-[-0.02em] hover:underline">
                          {p.anonymous ? "Anonymous candidate" : p.name}
                        </button>
                        <p className="truncate text-[0.82rem] text-text-muted">{p.headline}</p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[0.8rem] text-text-secondary">
                          {roleCaps.map((c) => (
                            <span key={c.label} className="inline-flex items-center gap-1.5"><LevelMark level={c.level} />{c.label}</span>
                          ))}
                        </p>
                        {conflict ? <p className="mt-1.5 inline-flex items-center gap-1.5 text-[0.8rem] text-state-amber"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />{conflict.kind === "busy" ? p.availability.note : conflict.text}</p> : <Avail a={p.availability} className="mt-1.5 text-[0.8rem]" />}
                      </div>
                      <Btn kind={replacing ? "primary" : "secondary"} size="sm" onClick={() => add(p)}>{replacing ? "Choose" : "Add"}</Btn>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {candidates.length === 0 ? <li className="py-10 text-center text-[0.95rem] text-text-muted">No one else fits this role. Invite someone new from an open seat.</li> : null}
            </ul>
          </section>
        </div>
      </LayoutGroup>

      {/* the one decision */}
      <div className="fixed inset-x-0 bottom-[68px] z-20 border-t border-text-primary/10 bg-ink-900/92 px-4 py-3 backdrop-blur md:bottom-0 md:left-[84px] md:px-8">
        <div className="mx-auto flex max-w-[1380px] items-center gap-4">
          <p className="min-w-0 flex-1 truncate text-[0.95rem] text-text-secondary">{doneLine}</p>
          <Btn kind="primary" disabled={!ready || confirmed} onClick={onConfirm}>{confirmed ? "Confirmed" : "Confirm team"}</Btn>
        </div>
      </div>
    </div>
  );
}
