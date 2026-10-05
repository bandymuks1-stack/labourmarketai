import type { ReactNode } from "react";
import { ArrowRight, FileCheck2, GraduationCap } from "lucide-react";

import type { Experience, Person } from "@/lib/design-proof/product-fixtures";
import { COMPANIES } from "@/lib/design-proof/product-fixtures";

import { CompanyMark } from "@/components/app/identity/identity-family";
import { EntityPlate } from "./entity";
import { Avail, EvidenceBar, Eyebrow, LevelMark, RegionHead, Stamp } from "./ui";

const HOURS_FMT = new Intl.NumberFormat("en-US");

/**
 * THE LIVING CV — a person's working life, as normal people read it.
 *
 * Built to hold a first-year apprentice and a site lead with 14 years in the
 * same layout without either looking wrong: every section appears only when
 * there is something true to say, and a thin CV says what would strengthen it
 * instead of showing empty boxes.
 *
 * Order is the order a reader asks: WHO (and whether they can start), WHAT they
 * can do, WHERE and WITH WHOM they did it, what they are QUALIFIED for.
 * Evidence is a quiet property of each line — a small bar and two counts — never
 * a table of its own: the CV is not an evidence database.
 *
 * Marks: solid = a second party stands behind it; hollow = the person's own
 * record; dashed = declared, nothing shows it yet.
 */
const companyFor = (e: Experience) => COMPANIES.find((c) => c.id === e.companyId) ?? { id: e.org, name: e.org, logo: undefined };

const total = (p: Person) =>
  p.caps.reduce(
    (a, c) => ({ confirmed: a.confirmed + c.confirmed, recorded: a.recorded + c.recorded, hours: a.hours + c.hours }),
    { confirmed: 0, recorded: 0, hours: 0 },
  );

export function LivingCv({ person, actions, embedded = false }: { readonly person: Person; readonly actions?: ReactNode; readonly embedded?: boolean }) {
  const t = total(person);
  const caps = [...person.caps].sort((a, b) => b.hours - a.hours || b.confirmed - a.confirmed);
  const shown = caps.slice(0, 7);
  const hiddenCaps = caps.length - shown.length;
  const maxTeam = Math.max(0, ...person.experience.map((e) => e.team ?? 0));
  const thin = !person.anonymous && t.confirmed < 6;
  const anon = person.anonymous;

  const first = (anon ? "Anonymous" : person.name.split(" ")[0]) ?? "";
  const last = anon ? "candidate" : person.name.split(" ").slice(1).join(" ");
  return (
    <article className="mx-auto max-w-[1280px] px-4 py-8 md:px-10 md:py-12" data-testid="living-cv" data-person={person.id}>
      {/* THE IDENTITY MOMENT — who this is, before anything is listed */}
      {embedded ? null : (
        <section className="relative isolate overflow-hidden rounded-[32px] shadow-[inset_0_0_0_1px_rgba(245,241,232,0.10)]" data-testid="cv-identity">
          <div className="absolute inset-0 [mask-image:linear-gradient(90deg,transparent_30%,black_58%)] max-md:[mask-image:none]"><EntityPlate entity={{ kind: "person", id: person.id }} className={person.photo && !person.anonymous ? "md:left-[34%] max-md:bottom-[38%]" : "md:left-[38%] max-md:bottom-[42%]"} /></div>
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,7,6,0.97)_0%,rgba(7,7,6,0.8)_42%,rgba(7,7,6,0.15)_100%)] max-md:bg-[linear-gradient(0deg,rgba(7,7,6,0.97)_0%,rgba(7,7,6,0.7)_58%,rgba(7,7,6,0.05)_100%)]" />
          <div className="relative flex min-h-[420px] flex-col justify-end gap-6 p-6 pt-48 md:min-h-[480px] md:p-12 md:pt-24">
            <div>
              <Eyebrow>{person.role} · {person.location}</Eyebrow>
              <h2 className="mt-3 font-display text-[clamp(2.6rem,7vw,5.6rem)] font-semibold leading-[0.94] tracking-[-0.05em]">
                {first} <em className="font-accent font-normal italic tracking-[-0.01em] text-[rgb(235,200,95)]">{last}</em>
              </h2>
              <p className="mt-4 max-w-[46ch] text-[1.1rem] leading-snug text-text-secondary">{person.headline}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <Avail a={person.availability} className="text-[1rem]" />
              <span className="text-[0.95rem] text-text-secondary">{person.years} {person.years === 1 ? "year" : "years"} in the trade</span>
              <span className="text-[0.95rem] text-text-secondary"><span className="font-display text-[1.25rem] font-semibold tabular-nums text-text-primary">{t.confirmed}</span> confirmed · <span className="font-display text-[1.25rem] font-semibold tabular-nums text-text-primary">{t.recorded}</span> recorded</span>
              {actions ? <div className="flex flex-wrap gap-2 md:ml-auto">{actions}</div> : null}
            </div>
          </div>
        </section>
      )}

      <div className="mt-12 grid gap-x-16 gap-y-12 md:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col gap-6 md:sticky md:top-24 md:self-start">
        <dl className="grid grid-cols-[5.4rem_1fr] gap-x-3 gap-y-3 text-support">
          {embedded ? (<><dt className="sig-stamp pt-0.5">Starts</dt><dd><Avail a={person.availability} /></dd></>) : null}
          <dt className="sig-stamp pt-0.5">Based</dt>
          <dd className="text-text-secondary">{person.location}</dd>
          {person.mobility ? (<><dt className="sig-stamp pt-0.5">Will work</dt><dd className="text-text-secondary">{person.mobility}</dd></>) : null}
          <dt className="sig-stamp pt-0.5">Speaks</dt>
          <dd className="text-text-secondary">{person.languages.join(" · ")}</dd>
          <dt className="sig-stamp pt-0.5">In trade</dt>
          <dd className="text-text-secondary">{person.years} {person.years === 1 ? "year" : "years"}</dd>
        </dl>

        <div className={cn2("flex flex-col gap-2", !embedded && "hidden")}>
          <Stamp>Backed by</Stamp>
          <p className="text-support text-text-secondary">
            <span className="font-display text-[1.35rem] font-semibold tabular-nums text-text-primary">{t.confirmed}</span> confirmed
            <span className="mx-2 text-text-muted">·</span>
            <span className="font-display text-[1.35rem] font-semibold tabular-nums text-text-primary">{t.recorded}</span> recorded
          </p>
        </div>
        {embedded && actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </aside>

      {/* WHAT, WHERE, QUALIFIED */}
      <div className="flex min-w-0 flex-col gap-12">
        {person.progression.length > 1 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {person.progression.map((s, i) => (
              <span key={s} className="flex items-center gap-3">
                <span className={cn2(i === person.progression.length - 1 ? "font-display text-[1.3rem] font-semibold tracking-[-0.02em] text-text-primary" : "text-support text-text-muted")}>{s}</span>
                {i < person.progression.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-text-muted" aria-hidden /> : null}
              </span>
            ))}
          </div>
        ) : null}
        {person.about ? <p className="max-w-[56ch] text-body text-text-secondary">{person.about}</p> : null}

        <section className="flex flex-col gap-4"><RegionHead eyebrow={t.hours > 0 ? `${HOURS_FMT.format(t.hours)} h of recorded work` : "Capabilities"} title="What they *can do*" className="mb-3" />
          <ul className="flex flex-col">
            {shown.map((c) => (
              <li key={c.label} data-level={c.level} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 border-t border-text-primary/10 py-3.5 first:border-t-0 sm:grid-cols-[1fr_5.5rem_9rem_4.5rem]">
                <span className="flex items-center gap-3 text-[1rem] font-medium">
                  <LevelMark level={c.level} />
                  {c.label}
                </span>
                <span className="max-sm:hidden"><EvidenceBar confirmed={c.confirmed} recorded={c.recorded} width={80} /></span>
                <span className="text-meta text-text-muted max-sm:order-3 max-sm:col-span-2">
                  {c.level === "declared" ? "Says so; nothing shows it yet" : `${c.confirmed} confirmed · ${c.recorded} recorded`}
                </span>
                <span className="text-right font-display text-[1rem] font-semibold tabular-nums text-text-secondary">{c.hours > 0 ? `${HOURS_FMT.format(c.hours)} h` : "—"}</span>
              </li>
            ))}
          </ul>
          {hiddenCaps > 0 ? <p className="text-support text-text-muted">+ {hiddenCaps} more</p> : null}
        </section>

        {person.experience.length > 0 ? (
          <section className="flex flex-col gap-4"><RegionHead eyebrow={maxTeam > 0 ? `Led teams of up to ${maxTeam}` : "Experience"} title="Where they have *worked*" className="mb-3" />
            <ol className="flex flex-col">
              {person.experience.map((e) => {
                const co = companyFor(e);
                return (
                  <li key={e.id} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-text-primary/10 py-5 first:border-t-0 md:grid-cols-[6.5rem_auto_1fr_9rem]">
                    <Stamp className="pt-1 max-md:col-span-2">{e.from} — {e.to}</Stamp>
                    <CompanyMark company={co} size={36} />
                    <div className="min-w-0">
                      <p className="text-[1rem] font-medium leading-snug">{e.role}</p>
                      <p className="text-support text-text-secondary">{e.org}{e.project ? ` · ${e.project}` : ""}</p>
                      {e.note || e.team ? <p className="mt-1 text-meta text-text-muted">{e.note ?? `Team of ${e.team}`}</p> : null}
                    </div>
                    <div className="flex items-center gap-3 max-md:col-span-2 max-md:pl-[3.1rem] md:flex-col md:items-end md:gap-1.5">
                      <EvidenceBar confirmed={e.confirmed} recorded={e.recorded} width={72} />
                      <span className="text-meta text-text-muted">{e.confirmed} confirmed{e.hours ? ` · ${HOURS_FMT.format(e.hours)} h` : ""}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : anon ? (
          <section className="flex flex-col gap-4"><RegionHead eyebrow="Experience" title="Where they have *worked*" className="mb-3" /><p className="max-w-[48ch] text-support text-text-muted">Employers and projects stay hidden until this person chooses to share them.</p></section>
        ) : null}

        {person.training.length + person.documents.length > 0 ? (
          <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
            {person.training.length > 0 ? (
              <section className="flex flex-col gap-4"><RegionHead eyebrow="Education" title="*Training*" size="md" className="mb-2" />
                <ul className="flex flex-col">
                  {person.training.map((tr) => (
                    <li key={tr.label} className="flex items-start gap-3 border-t border-text-primary/10 py-3 first:border-t-0">
                      <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.5} aria-hidden />
                      <span className="text-support">{tr.label}</span>
                      <Stamp className="ml-auto">{tr.year}</Stamp>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {person.documents.length > 0 ? (
              <section className="flex flex-col gap-4"><RegionHead eyebrow="Qualifications" title="*Documents*" size="md" className="mb-2" />
                <ul className="flex flex-col">
                  {person.documents.map((d) => (
                    <li key={d.label} className="flex items-start gap-3 border-t border-text-primary/10 py-3 first:border-t-0">
                      <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.5} aria-hidden />
                      <span className="text-support">{d.label}</span>
                      <span className={cn2("ml-auto whitespace-nowrap text-meta", d.state === "expiring" ? "text-state-amber" : "text-text-muted")}>{d.valid}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {thin ? (
          <section className="flex flex-col gap-4"><RegionHead eyebrow="Next" title="What would *strengthen* this" className="mb-2" />
            <ul className="flex flex-col">
              {[
                person.caps.some((c) => c.recorded > 0) ? "Ask a manager to confirm the records already written down" : "Record the next day of work",
                "Add work you have done outside the last job",
                "Upload a certificate you already hold",
              ].map((s) => (
                <li key={s} className="flex items-center justify-between gap-4 border-t border-text-primary/10 py-3.5 text-support first:border-t-0">
                  <span>{s}</span>
                  <ArrowRight className="h-4 w-4 text-text-muted" aria-hidden />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      </div>
    </article>
  );
}

const cn2 = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
