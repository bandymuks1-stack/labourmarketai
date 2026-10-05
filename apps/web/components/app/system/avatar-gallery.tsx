import { Brush, Hammer, MessageSquare, Search, Truck } from "lucide-react";

import {
  COMPANIES,
  PROJECTS,
  TEAMS,
  companyById,
  personById,
} from "@/lib/design-proof/product-fixtures";

import { CompanyMark, PersonAvatar, ProjectMark, ServiceMark, TeamMark, TeamStack } from "./identity";
import { Avail, EvidenceBar, Stamp } from "./ui";

/**
 * The identity family, shown together, at every scale and in every context a
 * party appears in. Nothing here is a protagonist: it is a system.
 */
const SIZES = [24, 40, 72, 128] as const;

const person = personById;
const team = (ids: readonly string[]) => ids.map(personById);

function Row({ label, note, children }: { readonly label: string; readonly note?: string; readonly children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-center gap-x-6 gap-y-3 border-t border-text-primary/10 py-5 first:border-t-0 max-md:grid-cols-1">
      <div>
        <p className="text-[0.95rem] font-medium">{label}</p>
        {note ? <p className="mt-0.5 text-meta text-text-muted">{note}</p> : null}
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">{children}</div>
    </div>
  );
}

const Scale = ({ render }: { readonly render: (s: number) => React.ReactNode }) => (
  <>
    {SIZES.map((s) => (
      <figure key={s} className="flex flex-col items-start gap-2">
        {render(s)}
        <figcaption className="sig-stamp">{s}</figcaption>
      </figure>
    ))}
  </>
);

export function AvatarGallery() {
  const tk = person("tk");
  const is = person("is");
  const an = person("an1");
  const cohort = team(TEAMS.large.members);
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-24 sm:px-8" data-testid="avatar-gallery">
      <header className="max-w-[40rem]">
        <Stamp>Identity family</Stamp>
        <h1 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
          Who is in the room, at a glance.
        </h1>
        <p className="mt-4 text-body text-text-secondary">
          Every kind of party has its own silhouette and a deliberate look with and without media. A photograph is content,
          not the system: nothing here depends on one.
        </p>
      </header>

      <section className="mt-12" aria-label="People">
        <Stamp>People</Stamp>
        <div className="mt-3">
          <Row label="With a photograph" note="The person's own photo, face-centred, tonally set into the family.">
            <Scale render={(s) => <PersonAvatar person={tk} size={s} />} />
          </Row>
          <Row label="Without a photograph" note="A deliberate plate: engraved figure, tonal, initials only from 40 px.">
            <Scale render={(s) => <PersonAvatar person={is} size={s} />} />
            <div className="flex items-end gap-3">
              {(["mn", "ap", "do", "lf", "vk", "sr"] as const).map((id) => (
                <PersonAvatar key={id} person={person(id)} size={56} />
              ))}
            </div>
          </Row>
          <Row label="Anonymised" note="A real person whose identity is hidden: veiled figure, no name, no initials.">
            <Scale render={(s) => <PersonAvatar person={an} size={s} />} />
          </Row>
        </div>
      </section>

      <section className="mt-12" aria-label="Businesses">
        <Stamp>Businesses and teams</Stamp>
        <div className="mt-3">
          <Row label="Company with a logo" note="Logo on an ivory plate, squarer than a person.">
            <Scale render={(s) => <CompanyMark company={companyById("nordhaus")} size={s} />} />
            <CompanyMark company={companyById("baltic")} size={72} />
          </Row>
          <Row label="Company without a logo" note="Architectural grid and monogram.">
            <Scale render={(s) => <CompanyMark company={companyById("fjord")} size={s} />} />
            <CompanyMark company={companyById("tellingud")} size={72} />
            <CompanyMark company={companyById("helios")} size={72} />
          </Row>
          <Row label="Team of 2" note="Two halves.">
            <Scale render={(s) => <TeamMark members={team(TEAMS.pair.members)} size={s} />} />
          </Row>
          <Row label="Team of 5" note="Quartered; the fourth cell carries the overflow.">
            <Scale render={(s) => <TeamMark members={team(TEAMS.five.members)} size={s} />} />
          </Row>
          <Row label="Team of 13" note="The same tile at any size; the number does the rest.">
            <Scale render={(s) => <TeamMark members={cohort} size={s} />} />
          </Row>
          <Row label="Inline stacks" note="For headers, threads and rows.">
            <TeamStack members={team(TEAMS.pair.members)} size={32} />
            <TeamStack members={team(TEAMS.five.members)} size={32} />
            <TeamStack members={cohort} size={32} />
            <TeamStack members={cohort} size={24} max={5} />
          </Row>
        </div>
      </section>

      <section className="mt-12" aria-label="Work">
        <Stamp>Projects and services</Stamp>
        <div className="mt-3">
          <Row label="Project with media" note="A wide plate: a project is a place, not a person.">
            <Scale render={(s) => <ProjectMark project={PROJECTS[0]!} size={s} />} />
          </Row>
          <Row label="Project without media" note="A generated site plan, unique per project.">
            <Scale render={(s) => <ProjectMark project={PROJECTS[1]!} size={s} />} />
            <ProjectMark project={PROJECTS[2]!} size={72} />
          </Row>
          <Row label="Service" note="A clipped corner and a category glyph.">
            <Scale render={(s) => <ServiceMark id="s1" size={s} icon={<Hammer strokeWidth={1.5} className="h-full w-full" />} />} />
            <ServiceMark id="s2" size={72} icon={<Truck strokeWidth={1.5} className="h-full w-full" />} />
            <ServiceMark id="s3" size={72} icon={<Brush strokeWidth={1.5} className="h-full w-full" />} />
          </Row>
        </div>
      </section>

      <section className="mt-12" aria-label="In context">
        <Stamp>The same people in every context</Stamp>
        <p className="mt-2 max-w-[40rem] text-support text-text-secondary">
          A person is not redesigned per screen. Here two of them — one with a photograph, one without — and one anonymised
          candidate move through the places they appear.
        </p>
        <div className="mt-5 grid gap-x-12 gap-y-8 md:grid-cols-2">
          {[tk, is, an].map((p) => (
            <div key={p.id} className="flex flex-col gap-4">
              <Ctx label="Navigation">
                <PersonAvatar person={p} size={28} />
              </Ctx>
              <Ctx label="Search result">
                <PersonAvatar person={p} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-[0.95rem] font-medium">{p.name}</p>
                  <p className="truncate text-meta text-text-muted">{p.headline}</p>
                </div>
                <Avail a={p.availability} className="ml-auto max-md:hidden" />
              </Ctx>
              <Ctx label="Conversation">
                <PersonAvatar person={p} size={32} />
                <div className="rounded-2xl rounded-tl-md bg-text-primary/[0.06] px-3.5 py-2 text-support text-text-secondary">Can start on the 10th.</div>
              </Ctx>
              <Ctx label="Match">
                <PersonAvatar person={p} size={56} />
                <span className="h-px flex-1 bg-text-primary/30" />
                <ProjectMark project={PROJECTS[0]!} size={40} />
              </Ctx>
              <Ctx label="Team slot">
                <PersonAvatar person={p} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-[0.9rem] font-medium">{p.name}</p>
                  <Stamp>{p.role}</Stamp>
                </div>
                <EvidenceBar confirmed={p.caps[0]?.confirmed ?? 0} recorded={p.caps[0]?.recorded ?? 0} className="ml-auto" />
              </Ctx>
              <Ctx label="Living CV">
                <PersonAvatar person={p} size={96} />
              </Ctx>
            </div>
          ))}
          <div className="flex flex-col gap-4">
            <Ctx label="Compact list (companies)">
              <div className="flex flex-col gap-2">
                {COMPANIES.map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5">
                    <CompanyMark company={c} size={24} />
                    <span className="text-support">{c.name}</span>
                  </div>
                ))}
              </div>
            </Ctx>
            <Ctx label="Notification">
              <MessageSquare className="h-4 w-4 text-text-muted" aria-hidden />
              <PersonAvatar person={personById("ap")} size={24} />
              <span className="text-support text-text-secondary">Aistė confirmed 6 records</span>
            </Ctx>
            <Ctx label="Search scope">
              <Search className="h-4 w-4 text-text-muted" aria-hidden />
              <TeamMark members={team(TEAMS.five.members)} size={24} />
              <span className="text-support text-text-secondary">Harbour core team</span>
            </Ctx>
          </div>
        </div>
      </section>
    </div>
  );
}

function Ctx({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div>
      <Stamp>{label}</Stamp>
      <div className="mt-2 flex items-center gap-3">{children}</div>
    </div>
  );
}
