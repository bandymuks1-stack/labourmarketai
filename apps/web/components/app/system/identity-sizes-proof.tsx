import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { CompanyMark, PersonAvatar, ProjectMark, TeamMark } from "@/components/app/identity/identity-family";
import { personMonogram } from "@/lib/visual/avatar-monogram";

/**
 * IDENTITY AT OPERATING SIZES — DEVELOPMENT EVIDENCE (the route 404s in
 * production). One person with no photograph, one with, one anonymous, a
 * company, a team and a project, at the sizes the product actually uses:
 *
 *   navigation 28 · team seat 32 · conversation 36 · list 44 ·
 *   dashboard 64 · profile / Living CV hero 168
 *
 * The REAL components render here (`PersonPortrait`, `PersonAvatar`, the
 * family marks); only the people are invented and labelled. Toggle
 * `document.documentElement.dataset.theme = "light"` to see the same
 * identities on the light theme tokens.
 */
const SIZES = [
  ["navigation", 28],
  ["team seat", 32],
  ["conversation", 36],
  ["list", 44],
  ["dashboard", 64],
  ["profile hero", 168],
] as const;

const NO_PHOTO = { id: "p-asta", name: "Asta Kazlauskienė" };
const PHOTO = { id: "p-photo", name: "Tomas Petrauskas", photo: { src: "/hero/tomas/00-base-960.webp" } };
const ANON = { id: "p-anon", name: "Anonymous", anonymous: true };
const TEAM = [NO_PHOTO, { id: "p-b", name: "Rasa Jonaitytė" }, { id: "p-c", name: "Ola Nordmann" }, { id: "p-d", name: "Jonas Jonaitis" }, { id: "p-e", name: "Eva Berg" }];

export function IdentitySizesProof() {
  return (
    <div data-testid="identity-sizes-proof" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      <p className="text-support text-text-muted" data-proof-banner>
        COMPONENT PROOF — real identity components, invented people. Theme: set <code>data-theme</code> on the document.
      </p>
      {SIZES.map(([label, size]) => (
        <section key={label} data-size={label} className="flex flex-col gap-3 border-t border-text-primary/10 pt-5">
          <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
            {label} · {size}px
          </h2>
          <div className="flex flex-wrap items-end gap-5">
            <PersonPortrait name={NO_PHOTO.name} avatarUrl={null} initials={personMonogram(NO_PHOTO.name)} width={`${Math.round(size * 0.8)}px`} />
            <PersonAvatar person={NO_PHOTO} size={size} />
            <PersonAvatar person={PHOTO} size={size} />
            <PersonAvatar person={ANON} size={size} anonymousLabel="Anonymous candidate" />
            <CompanyMark company={{ id: "c-nord", name: "Nordhaus Build AS" }} size={size} />
            <TeamMark members={TEAM.slice(0, 4)} size={size} />
            <ProjectMark project={{ id: "pr-harbour", name: "Harbour fit-out" }} size={size} />
          </div>
        </section>
      ))}
    </div>
  );
}
