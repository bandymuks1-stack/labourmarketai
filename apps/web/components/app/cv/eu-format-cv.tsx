import type {
  EuDisplayDocument,
  EuDisplayEntry,
} from "@/lib/cv-export/eu-format";
import type { CvSkillTier } from "@/lib/cv-export/skill-tiers";

/**
 * EU-format CV document (education pilot P0, item 6).
 *
 * A DUMB renderer: every string it prints was resolved by the caller, and the
 * decision about what belongs in the document was made by
 * `lib/cv-export/eu-format.ts`. It holds no data access, no translation and no
 * honesty rule of its own — which is what keeps the EU export from becoming a
 * second, quietly diverging version of the person.
 *
 * The layout follows the Europass two-column convention (section label left,
 * content right) because that is what makes the document recognisable to a
 * European reader. It is print-first: `print:` variants keep it on A4 without
 * the screen chrome.
 *
 * A section with nothing in it is not rendered. An empty heading on a printed
 * CV reads as a gap in the PERSON, not as a gap in the data.
 */

export interface EuFormatLabels {
  readonly documentTitle: string;
  readonly notAnOfficialEuropass: string;
  readonly nameNotProvided: string;
  readonly personal: string;
  readonly workExperience: string;
  readonly educationAndTraining: string;
  readonly personalSkills: string;
  readonly languages: string;
  readonly languagesSelfStated: string;
  readonly jobRelatedSkills: string;
  readonly drivingLicences: string;
  readonly additionalInformation: string;
  readonly summary: string;
  readonly generatedAt: string;
  /** Evidence-strength group names — the CV's existing tier vocabulary. */
  readonly tiers: Readonly<Record<CvSkillTier, string>>;
}

function Row({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="grid grid-cols-1 gap-2 border-t border-zinc-300 pt-4 sm:grid-cols-[10rem_1fr] sm:gap-6"
      data-testid={testId}
    >
      <h2 className="font-display text-xs font-bold uppercase tracking-widest text-zinc-500">
        {label}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Entry({ entry }: { entry: EuDisplayEntry }) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-sm font-semibold">{entry.heading}</span>
        {entry.period ? (
          <span className="font-mono text-xs text-zinc-600">{entry.period}</span>
        ) : null}
      </div>
      {entry.subheading ? (
        <span className="text-sm text-zinc-700">{entry.subheading}</span>
      ) : null}
      {entry.note ? (
        <span className="text-xs text-zinc-500">{entry.note}</span>
      ) : null}
    </div>
  );
}

export function EuFormatCv({
  doc,
  labels,
}: {
  doc: EuDisplayDocument;
  labels: EuFormatLabels;
}) {
  return (
    <article className="flex flex-col gap-5" data-testid="cv-eu-format">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-widest text-zinc-500">
          {labels.documentTitle}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {doc.personName ?? (
            <span className="italic text-zinc-400" data-testid="cv-eu-name-missing">
              {labels.nameNotProvided}
            </span>
          )}
        </h1>
        {doc.professions ? (
          <p className="text-sm text-zinc-600" data-testid="cv-eu-professions">
            {doc.professions}
          </p>
        ) : null}
      </header>

      {/* Screen-only. This document follows the Europass STRUCTURE; it is not
          a Europass issued by the EU, and the person exporting it must not be
          left believing otherwise (§7). It is not printed — the claim it
          corrects is a claim about this app, not about the CV. */}
      <p
        className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 print:hidden"
        data-testid="cv-eu-disclaimer"
      >
        {labels.notAnOfficialEuropass}
      </p>

      {doc.summary ? (
        <Row label={labels.summary} testId="cv-eu-summary">
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {doc.summary}
          </p>
        </Row>
      ) : null}

      {doc.present.workExperience ? (
        <Row label={labels.workExperience} testId="cv-eu-work-experience">
          {doc.workExperience.map((e, i) => (
            <Entry key={`w-${i}`} entry={e} />
          ))}
        </Row>
      ) : null}

      {doc.present.educationAndTraining ? (
        <Row label={labels.educationAndTraining} testId="cv-eu-education">
          {doc.education.map((e, i) => (
            <Entry key={`e-${i}`} entry={e} />
          ))}
        </Row>
      ) : null}

      {doc.present.personalSkills ? (
        <Row label={labels.personalSkills} testId="cv-eu-personal-skills">
          {doc.languages.length > 0 ? (
            <div className="flex flex-col gap-1" data-testid="cv-eu-languages">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                {labels.languages}
              </p>
              <ul className="flex flex-col gap-0.5">
                {doc.languages.map((l) => (
                  <li key={l.name} className="text-sm">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-zinc-600"> — {l.level}</span>
                  </li>
                ))}
              </ul>
              {/* The level is what the person said it is. Europass expects a
                  self-assessed CEFR grid; this is self-stated either way, and
                  saying so is cheaper than implying an assessment happened. */}
              <p className="text-meta uppercase tracking-wide text-zinc-500">
                {labels.languagesSelfStated}
              </p>
            </div>
          ) : null}

          {doc.skillGroups.length > 0 ? (
            <div className="flex flex-col gap-2" data-testid="cv-eu-skills">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                {labels.jobRelatedSkills}
              </p>
              {/* Grouped by how well each skill is backed. Europass has no
                  column for that, and flattening the groups would silently
                  promote every self-declared skill to the same standing as a
                  manager-confirmed one. */}
              {doc.skillGroups.map((g) => (
                <div key={g.tier} className="flex flex-col gap-1" data-testid={`cv-eu-tier-${g.tier}`}>
                  <p className="text-meta uppercase tracking-wide text-zinc-500">
                    {labels.tiers[g.tier]}
                  </p>
                  <p className="text-sm leading-relaxed">{g.names.join(", ")}</p>
                </div>
              ))}
            </div>
          ) : null}

          {doc.drivingLicences.length > 0 ? (
            <div className="flex flex-col gap-1" data-testid="cv-eu-driving-licences">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                {labels.drivingLicences}
              </p>
              <p className="text-sm">{doc.drivingLicences.join(", ")}</p>
            </div>
          ) : null}
        </Row>
      ) : null}

      {doc.present.additionalInformation ? (
        <Row label={labels.additionalInformation} testId="cv-eu-additional">
          {doc.additional.map((e, i) => (
            <Entry key={`a-${i}`} entry={e} />
          ))}
        </Row>
      ) : null}

      <p className="border-t border-zinc-300 pt-3 text-meta text-zinc-500">
        {labels.generatedAt}
      </p>
    </article>
  );
}
