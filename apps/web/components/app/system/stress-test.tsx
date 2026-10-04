import { COMPANIES, PROJECTS, TEAMS } from "@/lib/design-proof/product-fixtures";

import { EntityCard, EntityThumb, type Entity } from "./entity";
import { Eyebrow, RegionHead } from "./ui";

/**
 * IDENTITY STRESS TEST — every kind of party at once, in one composition, at
 * the sizes the product really uses (card, list row, chip). If they belong to
 * one family it must be obvious here, with and without media.
 */
const E: { readonly label: string; readonly e: Entity }[] = [
  { label: "Person · photograph", e: { kind: "person", id: "tk" } },
  { label: "Person · no photograph", e: { kind: "person", id: "is" } },
  { label: "Person · anonymous", e: { kind: "person", id: "an1" } },
  { label: "Company · logo", e: { kind: "company", id: COMPANIES[0]!.id } },
  { label: "Company · no logo", e: { kind: "company", id: "fjord" } },
  { label: "Team", e: { kind: "team", id: TEAMS.five.id } },
  { label: "Project · no media", e: { kind: "project", id: PROJECTS[1]!.id } },
  { label: "Project · media", e: { kind: "project", id: PROJECTS[0]!.id } },
];

export function StressTest() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-28 pt-24 md:px-10" data-testid="stress-test">
      <RegionHead eyebrow="One family" title="Eight kinds of *party*, one language" sub="Photographs and logos are content. Nothing below depends on them." />
      <ul className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4">
        {E.map((x) => (
          <li key={x.label} className="flex flex-col gap-2.5">
            <EntityCard entity={x.e} aspect="4 / 5" />
            <Eyebrow>{x.label}</Eyebrow>
          </li>
        ))}
      </ul>

      <div className="mt-16 grid gap-x-14 gap-y-10 md:grid-cols-2">
        <section>
          <Eyebrow>As list rows</Eyebrow>
          <ul className="mt-4">
            {E.map((x) => (
              <li key={x.label} className="flex items-center gap-4 border-t border-text-primary/10 py-3 first:border-t-0">
                <EntityThumb entity={x.e} size={64} />
                <span className="text-[1rem] font-medium">{x.label}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <Eyebrow>As compact marks</Eyebrow>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-4">
            {E.map((x) => (
              <li key={x.label} className="flex items-center gap-2.5">
                <EntityThumb entity={x.e} size={36} />
                <EntityThumb entity={x.e} size={24} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
