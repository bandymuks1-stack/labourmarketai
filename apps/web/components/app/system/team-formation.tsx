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

import { CompanyMark, PersonAvatar, ProjectMark } from "./identity";
import { PageHeader } from "./shell";
import { Avail, Btn, LevelMark, Segmented, Stamp } from "./ui";

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
  const [tab, setTab] = useState<"need" | "team" | "people">("team");
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
    if (replacing) {
      setSeats(replaceSeat(seats, replacing.role, replacing.index, p.id));
      setReplacing(null);
      return;
    }
    const r = addPerson(seats, p.id);
    if (r.result === "added") setSeats(r.seats);
    else if (r.result === "full") setMsg(`All ${roleOfPerson(p) ? NEED.roles.find((x) => x.id === roleOfPerson(p))!.label.toLowerCase() : "matching"} seats are taken. Replace someone, or open another seat.`);
    else if (r.result === "no-role") setMsg(`${p.name} does not fit any role this project asks for.`);
  };

  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 320, damping: 34, mass: 0.9 };

  return (
    <div className="mx-auto max-w-[1380px] px-4 pb-32 pt-6 md:px-8 md:pt-9" data-testid="team-formation" data-ready={ready}>
      <PageHeader
        lead={<ProjectMark project={project} size={60} />}
        title={project.name}
        meta={
          <>
            <span className="inline-flex items-center gap-2"><CompanyMark company={client} size={20} /> {client.name}</span>
            <span>{project.place}</span>
            <span>{project.from} – {project.to}</span>
            <Stamp>{confirmed ? "Team confirmed" : ready ? "Team ready" : "Forming team"}</Stamp>
          </>
        }
        actions={
          <>
            <Btn kind="secondary" size="sm">Save draft</Btn>
            <Btn kind="primary" size="sm" disabled={!ready || confirmed} onClick={onConfirm} data-testid="confirm-team">
              {confirmed ? "Confirmed" : "Confirm team"}
            </Btn>
          </>
        }
      />

      <Segmented
        className="mt-6 xl:hidden"
        label="Workspace"
        value={tab}
        onChange={setTab}
        options={[
          { id: "need", label: "Need" },
          { id: "team", label: `Team ${totals.filled}/${totals.total}` },
          { id: "people", label: "People" },
        ]}
      />

      <LayoutGroup>
        <div className="mt-7 grid gap-x-12 gap-y-10 xl:grid-cols-[19rem_1fr_25rem]">
          {/* THE NEED */}
          <section className={cn("flex flex-col gap-9", tab === "need" ? "flex" : "max-xl:hidden")} aria-label="What the project needs">
            <div>
              <Stamp>Seats</Stamp>
              <p className="mt-2 font-display text-[3rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">
                {totals.filled}
                <span className="text-text-muted"> / {totals.total}</span>
              </p>
              <div className="mt-4 flex flex-col gap-2.5">
                {NEED.roles.map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="w-[6.2rem] shrink-0 text-meta text-text-secondary">{r.label}</span>
                    <span className="flex gap-1">
                      {seats[r.id].map((s, i) => (
                        <span
                          key={i}
                          aria-hidden
                          className={cn(
                            "h-2 w-6 rounded-full transition-colors duration-500",
                            s.kind === "person" ? "bg-text-primary" : s.kind === "invited" ? "bg-text-primary/35" : "border border-dashed border-text-primary/35",
                          )}
                        />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              {missingText ? <p className="mt-4 text-support text-text-secondary">Still needed: {missingText}.</p> : <p className="mt-4 font-accent text-[1.8rem] italic leading-[1.05] text-text-primary">Every seat is held.</p>}
            </div>

            <div>
              <Stamp>What this team can do</Stamp>
              <ul className="mt-3 flex flex-col">
                {coverage.map((c) => (
                  <li key={c.cap} data-status={c.status} className="border-t border-text-primary/10 py-3 first:border-t-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[0.95rem] font-medium">{c.cap}</span>
                      <span className={cn("text-meta", c.status === "missing" ? "text-state-amber" : c.status === "own-records" ? "text-text-secondary" : "text-text-muted")}>
                        {c.status === "covered" ? "Covered" : c.status === "own-records" ? "Own records only" : "Nobody yet"}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      {Array.from({ length: c.needed }).map((_, i) => (
                        <span
                          key={i}
                          aria-hidden
                          className={cn(
                            "h-1.5 flex-1 rounded-full transition-colors duration-500",
                            i < c.confirmed ? "bg-text-primary" : i < c.confirmed + c.recorded ? "bg-text-primary/35" : "border border-dashed border-text-primary/30",
                          )}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-meta text-text-muted">Solid: confirmed work · pale: the person’s own record · dashed: not yet covered.</p>
            </div>
          </section>

          {/* THE TEAM */}
          <section className={cn("flex min-w-0 flex-col gap-9", tab === "team" ? "flex" : "max-xl:hidden")} aria-label="The team">
            {NEED.roles.map((r) => {
              const held = seats[r.id].filter((s) => s.kind === "person").length;
              return (
                <div key={r.id} data-role={r.id}>
                  <header className="flex items-baseline justify-between gap-4 border-b border-text-primary/10 pb-2.5">
                    <h2 className="font-display text-[1.15rem] font-semibold tracking-[-0.02em]">{r.label}</h2>
                    <span className="text-meta text-text-muted">
                      <span className="tabular-nums text-text-secondary">{held} of {r.count}</span> · {r.caps.join(" · ")}
                    </span>
                  </header>
                  <ul>
                    <AnimatePresence initial={false} mode="popLayout">
                      {seats[r.id].map((s, i) => {
                        const key = `${r.id}-${i}-${s.kind}-${s.kind === "person" ? s.id : ""}`;
                        if (s.kind === "person") {
                          const p = personById(s.id);
                          const conflict = conflictOf(p);
                          const mine = p.caps.filter((c) => (r.caps as readonly string[]).includes(c.label));
                          return (
                            <motion.li
                              key={key}
                              layout
                              transition={spring}
                              initial={{ backgroundColor: "rgba(212,175,55,0.16)" }}
                              animate={{ backgroundColor: "rgba(212,175,55,0)" }}
                              exit={{ opacity: 0 }}
                              data-seat="person"
                              data-person={p.id}
                              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1.5 border-b border-text-primary/10 px-1 py-4"
                            >
                              <motion.span layoutId={`av-${p.id}`} transition={spring} className="inline-flex">
                                <PersonAvatar person={p} size={48} />
                              </motion.span>
                              <div className="min-w-0">
                                <button type="button" onClick={() => onOpenProfile(p.id)} className="text-left text-[1rem] font-medium hover:underline">
                                  {p.anonymous ? "Anonymous candidate" : p.name}
                                </button>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-meta text-text-secondary">
                                  {mine.length ? mine.map((c) => (
                                    <span key={c.label} className="inline-flex items-center gap-1.5"><LevelMark level={c.level} />{c.label}</span>
                                  )) : <span className="text-text-muted">Nothing shown for this role yet</span>}
                                </p>
                                {conflict ? (
                                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-meta text-state-amber">
                                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> {conflict.text}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-col items-end gap-1.5">
                                <Avail a={p.availability} className="text-meta max-sm:hidden" />
                                <div className="flex gap-1">
                                  <Btn kind="ghost" size="sm" onClick={() => { setReplacing({ role: r.id, index: i }); setRoleFilter(r.id); setTab("people"); }}>Replace</Btn>
                                  <Btn kind="ghost" size="sm" onClick={() => setSeats(removeSeat(seats, r.id, i))} aria-label={`Remove ${p.name}`}><X className="h-4 w-4" aria-hidden /></Btn>
                                </div>
                              </div>
                            </motion.li>
                          );
                        }
                        return (
                          <motion.li key={key} layout transition={spring} data-seat={s.kind} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 border-b border-dashed border-text-primary/18 px-1 py-4">
                            <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-[28%] border border-dashed border-text-primary/30 text-text-muted">
                              {s.kind === "invited" ? <Mail className="h-4 w-4" strokeWidth={1.5} /> : <span className="text-[1.2rem] leading-none">+</span>}
                            </span>
                            <div>
                              <p className="text-[0.98rem] font-medium text-text-secondary">{s.kind === "invited" ? "Invitation sent" : `${r.label} · seat ${i + 1} of ${r.count}`}</p>
                              <p className="text-meta text-text-muted">{s.kind === "invited" ? "Waiting for an answer" : `Needs ${r.caps.join(" and ")}`}</p>
                            </div>
                            <div className="flex gap-1">
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

          {/* THE PEOPLE */}
          <section className={cn("flex min-w-0 flex-col gap-4 xl:border-l xl:border-text-primary/10 xl:pl-9", tab === "people" ? "flex" : "max-xl:hidden")} aria-label="Available people">
            <header>
              <h2 className="font-display text-[1.15rem] font-semibold tracking-[-0.02em]">{replacing ? `Replace ${(() => { const s = seats[replacing.role][replacing.index]; return s && s.kind === "person" ? personById(s.id).name.split(" ")[0] : "someone"; })()}` : "Available people"}</h2>
              <p className="mt-1 text-meta text-text-muted">{candidates.length} not on the team · best fit first</p>
            </header>
            {replacing ? (
              <div className="flex items-center justify-between rounded-xl border border-brand-blue/50 px-3.5 py-2.5 text-support">
                <span>Choose the person who takes this seat.</span>
                <Btn kind="ghost" size="sm" onClick={() => setReplacing(null)}>Cancel</Btn>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Role">
              {ROLE_TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={roleFilter === t.id} onClick={() => setRoleFilter(t.id as "all" | RoleId)} className={cn("rounded-full px-3 py-1.5 text-[0.85rem] transition-colors", roleFilter === t.id ? "bg-text-primary font-medium text-ink-900" : "text-text-secondary hover:text-text-primary")}>
                  {t.label}
                </button>
              ))}
            </div>
            {msg ? <p role="status" className="rounded-xl bg-state-amber/10 px-3.5 py-2.5 text-support text-state-amber">{msg}</p> : null}
            <ul>
              <AnimatePresence initial={false} mode="popLayout">
                {candidates.map((p) => {
                  const conflict = conflictOf(p);
                  const roleCaps = roleFilter === "all" ? p.caps.slice(0, 2) : p.caps.filter((c) => (NEED.roles.find((r) => r.id === roleFilter)!.caps as readonly string[]).includes(c.label));
                  return (
                    <motion.li key={p.id} layout transition={spring} exit={{ opacity: 0, x: -16 }} data-candidate={p.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3.5 border-b border-text-primary/10 py-3.5">
                      <motion.span layoutId={`av-${p.id}`} transition={spring} className="inline-flex">
                        <PersonAvatar person={p} size={40} />
                      </motion.span>
                      <div className="min-w-0">
                        <button type="button" onClick={() => onOpenProfile(p.id)} className="block max-w-full truncate text-left text-[0.95rem] font-medium hover:underline">
                          {p.anonymous ? "Anonymous candidate" : p.name}
                        </button>
                        <p className="truncate text-meta text-text-muted">{p.headline}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-meta text-text-secondary">
                          {roleCaps.map((c) => (
                            <span key={c.label} className="inline-flex items-center gap-1.5"><LevelMark level={c.level} />{c.label}</span>
                          ))}
                        </p>
                        {conflict ? <p className="mt-1 inline-flex items-center gap-1.5 text-meta text-state-amber"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />{conflict.kind === "busy" ? p.availability.note : conflict.text}</p> : <Avail a={p.availability} className="mt-1 text-meta" />}
                      </div>
                      <Btn kind={replacing ? "primary" : "secondary"} size="sm" onClick={() => add(p)}>{replacing ? "Choose" : "Add"}</Btn>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {candidates.length === 0 ? <li className="py-10 text-center text-support text-text-muted">No one else fits this role. Invite someone new from an open seat.</li> : null}
            </ul>
          </section>
        </div>
      </LayoutGroup>

      {/* the one decision */}
      <div className="fixed inset-x-0 bottom-[68px] z-20 border-t border-text-primary/10 bg-ink-900/92 px-4 py-3 backdrop-blur md:bottom-0 md:left-[84px] md:px-8">
        <div className="mx-auto flex max-w-[1380px] items-center gap-4">
          <p className="min-w-0 flex-1 truncate text-support text-text-secondary">
            {confirmed ? "The team is confirmed and has been invited into the project." : ready ? "Every seat is held. Confirming invites the team into the project." : `${totals.filled} of ${totals.total} seats held · still needed: ${missingText}`}
          </p>
          <Btn kind="primary" disabled={!ready || confirmed} onClick={onConfirm}>{confirmed ? "Confirmed" : "Confirm team"}</Btn>
        </div>
      </div>
    </div>
  );
}
