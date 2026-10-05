"use client";

import {
  CAPABILITIES,
  CHAPTERS,
  NEED,
  PLATES,
  TODAY_MOMENT,
  readCapabilities,
} from "@/lib/design-proof/sample";

import { IdentityPresence } from "./identity-presence";
import { LivingRecord } from "./living-record";
import { NeedMatch } from "./need-match";

/**
 * The three representative compositions, on a labelled sample person. Strings
 * live here (English, sample copy) because this is the design proof; the
 * components themselves are i18n-agnostic and take every word as a prop.
 */
export type ProofView = "identity" | "record" | "match";

const hours = (h: number) => `${h} h`;
const records = (n: number) => `${n} ${n === 1 ? "record" : "records"}`;

export function DesignProofView({ view }: { readonly view: ProofView }) {
  const allRecords = CHAPTERS.flatMap((c) => c.records);
  const reads = readCapabilities(allRecords);

  if (view === "identity") {
    return (
      <IdentityPresence
        person={{
          first: "Tomas",
          last: "K.",
          role: "Scaffolder, building in Bergen",
          line: "Three cities, four years at height. Every line below traces to work Tomas actually did.",
          stamp: "Professional identity · sample person",
        }}
        plate={PLATES.site}
        reads={reads}
        labels={{
          proven: "What he has proven",
          changing: "What is changing",
          next: "What is possible next",
          confirmedOf: (c, t) => `${c} of ${t} records confirmed by a manager.`,
          recordedOnly: "Tomas's own records show it; no manager has confirmed it yet.",
          declaredOnly: "Tomas says so. Nothing shows it yet.",
          hours,
          records,
          confirmed: "Confirmed",
          recorded: "Recorded",
          declared: "Declared",
        }}
        changing={[
          { when: "This week", text: "A site manager confirmed six hours at height." },
          { when: "Last month", text: "Reading drawings became a line of its own." },
        ]}
        nextStep={{
          title: "Foreman roles in Norway are within reach.",
          body: "Two things stand between: one confirmed record leading a crew, and a signed-off safety plan.",
          cta: "See the three openings",
          href: "#",
        }}
      />
    );
  }

  if (view === "record") {
    return (
      <LivingRecord
        capabilities={CAPABILITIES}
        chapters={CHAPTERS}
        moment={TODAY_MOMENT}
        stamp="Living record · sample person"
        title="Why Tomas can do what he does."
        intro="Every capability is a strand that thickens with the work behind it. Point at one and the history that built it lights up."
        labels={{
          today: "Today",
          waiting: "Waiting for a manager",
          confirmedWord: "Confirmed",
          recordedWord: "Recorded by Tomas",
          confirmAction: "Show: the manager confirms",
          resetAction: "Start over",
          hours,
          capabilitiesHeading: "Capabilities",
          settled: "It is history now.",
        }}
      />
    );
  }

  return (
    <NeedMatch
      need={NEED}
      person={{ name: "Tomas K.", role: "Scaffolder", plate: PLATES.portrait }}
      reads={reads}
      labels={{
        sample: "Sample need · sample person",
        stages: ["Considering", "Conversation", "Agreed"],
        needLabel: "The need",
        personLabel: "The person",
        hours,
        records,
        confirmed: "Confirmed",
        recordedOnly: "His own record · not confirmed yet",
        notShown: "Not shown yet",
        closeWith: { q4: "One confirmed record of leading a crew would close this." },
        recordIt: "Record it",
        relates: (s, p, t) =>
          `${s} of ${t} requirements stand on confirmed work, ${p} on Tomas's own record.`,
        missing: (n) => `${n} thing to close`,
        express: "Express interest",
        matchedTitle: "Tomas and Nordhaus Build, in one conversation.",
        matchedStamp: "Interest sent · conversation open",
        agenda_heading: "To agree before work starts",
        agenda: [
          { id: "a1", text: "Start date and shift pattern" },
          { id: "a2", text: "Rate and how hours are confirmed" },
          { id: "a3", text: "Housing and travel" },
        ],
        agree: "Agree terms",
        agreedTitle: "Tomas joins the Bergen quarter.",
        agreedStamp: "Project active · from 20 October",
        agreedLine: "The agreement becomes the project: the site, the crew and the schedule are now where the next records will be made.",
        reset: "Start over",
      }}
    />
  );
}
