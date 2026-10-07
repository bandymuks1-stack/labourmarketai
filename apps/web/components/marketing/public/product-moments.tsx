import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { playerInitials } from "@/lib/identity/player-identity";
import { cn } from "@/lib/utils";

import { MomentCard, MomentSection } from "./public-sections";
import { PUBLIC_IMAGERY } from "./public-imagery";
import { ProfessionalPortrait } from "./professional-portrait";
import { StateMark } from "./state-mark";

/**
 * FOCUSED product moments for the public pages. Each one is a fragment of a
 * real product surface (today, the record, the professional history, the need,
 * the project, what needs the manager) drawn with the labelled sample persona
 * and the real record-state language — never a screenshot of a dashboard and
 * never a claim the product cannot back (docs/public/PUBLIC_SLICE_TRUTH_TABLE).
 */

/** WORKERS — "Know what happens today": the day card + the record card. */
export async function WorkerDayMoment() {
  const t = await getTranslations("publicSlice.workers.day");
  const ts = await getTranslations("publicSlice");
  const name = (await getTranslations("playercards"))("sample.name");
  const kitchen = PUBLIC_IMAGERY.kitchen;
  return (
    <MomentSection title={t("title")} body={t("body")}>
      <div className="grid gap-4">
        <MomentCard sampleLabel={ts("sample")} testId="moment-today">
          <p className="text-support text-text-muted">{t("todayLabel")}</p>
          <p className="mt-1 font-display text-3xl font-bold leading-tight tracking-tightest text-text-primary">
            {t("task")}
          </p>
          <p className="mt-1 text-body text-text-secondary">{t("taskDetail")}</p>
          <p className="mt-5 rounded-2xl bg-ink-700 px-4 py-3 text-body text-text-primary">{t("message")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex min-h-11 items-center rounded-full bg-brand-blue px-5 text-support font-semibold text-text-on-brand">
              {t("primary")}
            </span>
            <span className="inline-flex min-h-11 items-center rounded-full bg-ink-700 px-5 text-support font-medium text-text-primary">
              {t("secondary")}
            </span>
          </div>
        </MomentCard>
        <MomentCard sampleLabel={ts("sample")} testId="moment-record">
          <div className="flex items-center gap-3">
            <ProfessionalPortrait name={name} initials={playerInitials(name)} size={36} />
            <p className="text-support text-text-muted">{t("recordLabel")}</p>
          </div>
          <p className="mt-4 text-body text-text-primary">{t("recordText")}</p>
          <div className="mt-4 flex items-center gap-3">
            <Image
              src={kitchen.src}
              alt=""
              width={kitchen.width}
              height={kitchen.height}
              sizes="96px"
              className="h-14 w-20 rounded-xl object-cover"
            />
            <p className="text-support text-text-secondary">
              {t("time")} · {t("photo")}
            </p>
          </div>
          <div className="mt-4">
            <StateMark state="waiting" label={t("sent")} />
          </div>
        </MomentCard>
      </div>
    </MomentSection>
  );
}

/** WORKERS — the living professional history. NOW / RECENT / EARLIER are
 *  history; NEXT is dashed and separate and can never read as verified work. */
export async function WorkerHistoryMoment() {
  const t = await getTranslations("publicSlice.workers.history");
  const ts = await getTranslations("publicSlice");
  const rows = [
    { era: "now", state: "confirmed", title: t("nowTitle"), meta: t("nowMeta"), label: t("nowState") },
    { era: "recent", state: "own", title: t("recentTitle"), meta: t("recentMeta"), label: t("recentState") },
    { era: "earlier", state: "unknown", title: t("earlierTitle"), meta: t("earlierMeta"), label: t("earlierState") },
  ] as const;
  return (
    <MomentSection title={t("title")} body={t("body")} reverse>
      <MomentCard sampleLabel={ts("sample")} testId="moment-history">
        <ol className="relative grid gap-7 border-l-2 border-brand-blue/50 pl-6">
          {rows.map((r) => (
            <li key={r.era} className="relative">
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[33px] top-2 h-3.5 w-3.5 rounded-full border-2 border-brand-blue",
                  r.era === "now" ? "bg-brand-blue" : "bg-ink-800",
                )}
              />
              <p className="text-support text-text-muted">{t(r.era)}</p>
              <p className="font-display text-xl font-semibold text-text-primary">{r.title}</p>
              <p className="text-support text-text-secondary">{r.meta}</p>
              <StateMark className="mt-1.5" state={r.state} label={r.label} />
            </li>
          ))}
        </ol>
        <div className="mt-8 border-l-2 border-dashed border-ink-500 pl-6">
          <p className="text-support text-text-muted">{t("next")}</p>
          <p className="font-display text-xl font-semibold text-text-primary">{t("nextTitle")}</p>
          <p className="text-support text-text-secondary">{t("nextMeta")}</p>
          <StateMark className="mt-1.5" state="unknown" label={t("nextState")} />
        </div>
      </MomentCard>
    </MomentSection>
  );
}

/** WORKERS — the outcome statement that closes the story. */
export async function WorkerOutcome() {
  const t = await getTranslations("publicSlice.workers.outcome");
  return (
    <section className="mx-auto max-w-container px-6 py-14 sm:px-12 lg:py-20">
      <h2 className="max-w-4xl font-display text-4xl font-bold leading-[1.05] tracking-tightest text-text-primary sm:text-6xl">
        {t("title")}
      </h2>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-secondary">{t("body")}</p>
    </section>
  );
}

/** COMPANIES — "say what you need, see who fits". */
export async function CompanyNeedMoment() {
  const t = await getTranslations("publicSlice.companies.need");
  const ts = await getTranslations("publicSlice");
  const personName = (await getTranslations("playercards"))("sample.name");
  return (
    <MomentSection title={t("title")} body={t("body")}>
      <div className="grid gap-4">
        <MomentCard sampleLabel={ts("sample")} testId="moment-need">
          <p className="text-support text-text-muted">{t("needLabel")}</p>
          <p className="mt-1 font-display text-3xl font-bold leading-tight tracking-tightest text-text-primary">
            {t("needTitle")}
          </p>
          <p className="mt-1 text-body text-text-secondary">{t("needMeta")}</p>
        </MomentCard>
        <MomentCard sampleLabel={ts("sample")}>
          <div className="flex items-center gap-4">
            <ProfessionalPortrait name={personName} initials={playerInitials(personName)} size={52} />
            <div>
              <p className="font-display text-xl font-semibold text-text-primary">{personName}</p>
              <p className="text-support text-text-secondary">{t("personRole")}</p>
            </div>
          </div>
          <p className="mt-4 text-support text-text-secondary">{t("personMeta")}</p>
          <StateMark className="mt-2" state="confirmed" label={t("personState")} />
        </MomentCard>
      </div>
    </MomentSection>
  );
}

/** COMPANIES — the project, its people, and the records waiting for the manager. */
export async function CompanyProjectMoment() {
  const t = await getTranslations("publicSlice.companies.project");
  const ts = await getTranslations("publicSlice");
  const sample = (await getTranslations("playercards"))("sample.name");
  const people = [sample, "Jonas P.", "Ieva K."];
  return (
    <MomentSection title={t("title")} body={t("body")} reverse>
      <MomentCard sampleLabel={ts("sample")} testId="moment-project">
        <p className="text-support text-text-muted">{t("label")}</p>
        <p className="mt-1 font-display text-3xl font-bold leading-tight tracking-tightest text-text-primary">
          {t("name")}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <div className="flex -space-x-2">
            {people.map((p) => (
              <ProfessionalPortrait key={p} name={p} initials={playerInitials(p)} size={38} className="ring-2 ring-ink-800" />
            ))}
          </div>
          <p className="text-support text-text-secondary">{t("people")}</p>
        </div>
        <div className="mt-6 grid gap-2">
          <StateMark state="waiting" label={t("waiting")} />
          <StateMark state="confirmed" label={t("confirmed")} />
        </div>
      </MomentCard>
    </MomentSection>
  );
}

/** COMPANIES — what needs the manager, then the next need. */
export async function CompanyAttentionMoment() {
  const t = await getTranslations("publicSlice.companies.attention");
  const ts = await getTranslations("publicSlice");
  const items = t.raw("items") as { text: string; state: "wait" | "unk" }[];
  return (
    <MomentSection title={t("title")} body={t("body")}>
      <MomentCard sampleLabel={ts("sample")} testId="moment-attention">
        <p className="text-support text-text-muted">{t("label")}</p>
        <ul className="mt-3 divide-y divide-ink-600/50">
          {items.map((it) => (
            <li key={it.text} className="py-4">
              <StateMark
                state={it.state === "wait" ? "waiting" : "unknown"}
                label={it.text}
                className="text-body text-text-primary"
              />
            </li>
          ))}
        </ul>
      </MomentCard>
    </MomentSection>
  );
}
