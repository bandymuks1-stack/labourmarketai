import { getTranslations } from "next-intl/server";

import { TrackedCta } from "@/components/app/tracked-cta";
import { buttonLinkClassName } from "@/components/ui/Button";
import {
  PaneLabel,
  PaneMeta,
  PaneValue,
  PersonRing,
  WorldLines,
  WorldNode,
  WorldPane,
  WorldScene,
} from "@/components/world/world";
import { cn } from "@/lib/utils";

import { PUBLIC_IMAGERY } from "./public-imagery";
import { StateMark } from "./state-mark";

/**
 * THE PUBLIC FIRST SCREEN — one world, three entrances (home, /for-workers,
 * /for-companies). A real professional in a real working context fills the
 * screen; the relationships around them (person → team → project → work →
 * record → history) are embedded in the scene as panes joined by leader lines,
 * not drawn as a diagram below it. One primary action, one route to the other
 * audience.
 *
 * Every photograph is a labelled sample fixture (public-imagery.ts); every pane
 * is translation copy and the real record-state language. Nothing here claims
 * verification: the "confirmed" pane says a MANAGER confirmed it, and only the
 * person's own record is shown as theirs.
 */
const CTA_SECONDARY =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-text-primary backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

function SamplePill({ label }: { label: string }) {
  return (
    <span className="absolute left-5 top-5 z-20 rounded-full bg-ink-900/60 px-3 py-1 text-basis text-text-secondary backdrop-blur lg:left-[4.9%] lg:top-6">
      {label}
    </span>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="world-in font-display text-[clamp(2.2rem,9.4vw,3.6rem)] font-extrabold leading-[0.93] tracking-tightest text-text-primary lg:text-[clamp(3.6rem,6.4vw,6.4rem)]">
      {children}
    </h1>
  );
}

function CopyBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("relative mb-6 lg:absolute lg:z-20 lg:mb-0", className)}>{children}</div>;
}

const crew = (initials: [string, string]) => (
  <span className="flex -space-x-2">
    <PersonRing src={PUBLIC_IMAGERY.tomasPortrait.src} name="" initials="TK" size={40} objectPosition="50% 22%" zoom={1.15} />
    <PersonRing name="" initials={initials[0]} size={40} />
    <PersonRing name="" initials={initials[1]} size={40} />
  </span>
);

/** HOME — the whole idea on one screen: a scaffolder on the job, his world around him. */
export async function HomeWorldHero() {
  const t = await getTranslations("publicSlice.world");
  const ts = await getTranslations("publicSlice");
  const ti = await getTranslations("publicSlice.imagery");
  const img = PUBLIC_IMAGERY.siteLarge;
  return (
    <WorldScene
      testId="world-hero-home"
      src={img.src}
      width={img.width}
      height={img.height}
      alt={ti("tomasAlt")}
      photoClass="brand"
      objectPosition="50% 38%"
      priority
      badge={<SamplePill label={ts("sample")} />}
    >
      <WorldLines
        paths={[
          { d: "M25.7 23.1 C 36 22.2 43 27.8 50.3 29.1", tone: "gold", delay: 500 },
          { d: "M73.6 21.8 C 65 22.2 59.7 27.8 53.3 32.2", delay: 650 },
          { d: "M74.3 43.6 C 65 42.2 59.7 44.4 54 45.6", delay: 800 },
          { d: "M43 41.3 C 45 43.5 47 46.7 48.9 48.9", tone: "dashed", delay: 950 },
          { d: "M71.5 66.7 C 65 64.4 59.7 60 54.4 55.6", tone: "success", delay: 1100 },
        ]}
      />
      <WorldNode x="50.3%" y="29.1%" />
      <WorldNode x="53.3%" y="32.2%" tone="ring" />
      <WorldNode x="54%" y="45.6%" tone="ring" />
      <WorldNode x="48.9%" y="48.9%" tone="ring" />
      <WorldNode x="54.4%" y="55.6%" tone="success" />

      <CopyBlock className="lg:bottom-[7.5%] lg:left-[4.9%] lg:w-[min(40rem,42%)]">
        <Headline>{t("home.title")}</Headline>
        <p className="mt-5 max-w-[34ch] text-lg leading-relaxed text-text-secondary sm:text-xl">{t("home.sub")}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <TrackedCta href="/for-workers" ctaId="home_world_workers" audience="workers" className={buttonLinkClassName("primary")}>
            {t("home.primary")} →
          </TrackedCta>
          <TrackedCta href="/for-companies" ctaId="home_world_companies" audience="companies" className={CTA_SECONDARY}>
            {t("home.secondary")}
          </TrackedCta>
        </div>
      </CopyBlock>

      <WorldPane tier="context" pos={{ left: "4.9%", top: "16.7%" }} w="clamp(240px,21vw,300px)" delay={150} label={t("labels.person")}>
        <PaneLabel>{t("labels.person")}</PaneLabel>
        <div className="mt-3 flex items-center gap-3">
          <PersonRing src={PUBLIC_IMAGERY.tomasPortrait.src} name="Tomas K." initials="TK" size={52} objectPosition="50% 22%" zoom={1.15} focus />
          <div>
            <PaneValue>Tomas K.</PaneValue>
            <PaneMeta>{t("home.personRole")}</PaneMeta>
          </div>
        </div>
      </WorldPane>
      <WorldPane tier="context" pos={{ right: "5.6%", top: "16.2%" }} w="clamp(240px,23vw,330px)" delay={300} label={t("labels.team")}>
        <PaneLabel>{t("labels.team")}</PaneLabel>
        <div className="mt-3 flex items-center gap-3">
          {crew(["RK", "AJ"])}
          <PaneMeta>{t("home.crew")}</PaneMeta>
        </div>
      </WorldPane>
      <WorldPane tier="context" pos={{ right: "4.9%", top: "37.3%" }} w="clamp(250px,25vw,360px)" delay={450} label={t("labels.project")}>
        <PaneLabel>{t("labels.project")}</PaneLabel>
        <PaneValue>Nemunas Residences</PaneValue>
        <PaneMeta>{t("home.projectMeta")}</PaneMeta>
      </WorldPane>
      <WorldPane tier="focus" pos={{ left: "20.8%", top: "34.4%" }} w="clamp(240px,22vw,320px)" delay={600} label={t("labels.work")}>
        <PaneLabel>{t("labels.work")}</PaneLabel>
        <PaneValue>{t("home.workTitle")}</PaneValue>
        <PaneMeta>{t("home.workMeta")}</PaneMeta>
      </WorldPane>
      <WorldPane tier="context" pos={{ right: "7.6%", top: "62%" }} w="clamp(250px,22vw,320px)" delay={750}>
        <StateMark state="confirmed" label={ts("states.confirmed")} />
        <PaneValue>{t("home.doneTitle")}</PaneValue>
        <PaneMeta>{t("home.doneMeta")}</PaneMeta>
      </WorldPane>
    </WorldScene>
  );
}

/** /FOR-WORKERS — the professional dominates; today, the record, the confirmation beside him. */
export async function WorkersWorldHero() {
  const t = await getTranslations("publicSlice.workers");
  const tw = await getTranslations("publicSlice.world");
  const ts = await getTranslations("publicSlice");
  const ti = await getTranslations("publicSlice.imagery");
  const img = PUBLIC_IMAGERY.van;
  return (
    <WorldScene
      testId="public-hero-workers"
      src={img.src}
      width={img.width}
      height={img.height}
      alt={ti("vanAlt")}
      photoClass="brand"
      mirror
      objectPosition="50% 40%"
      priority
      badge={<SamplePill label={ts("sample")} />}
    >
      <WorldLines
        paths={[
          { d: "M73.6 23.3 C 70 25.5 68.8 31 66.8 35.8", tone: "gold", delay: 500 },
          { d: "M73.6 47.8 C 70.4 46.7 68.8 44.4 67.4 42.2", delay: 700 },
          { d: "M73.6 71.1 C 69.4 65.6 68 53.3 66.1 46.7", tone: "success", delay: 900 },
        ]}
      />
      <WorldNode x="66.8%" y="35.8%" />
      <WorldNode x="67.4%" y="42.2%" tone="ring" />
      <WorldNode x="66.1%" y="46.7%" tone="success" />
      <CopyBlock className="lg:left-[4.9%] lg:top-[18%] lg:w-[min(42rem,48%)]">
        <Headline>
          {t("hero.title")}
          <span className="block text-gradient-accent">{t("hero.accent")}</span>
        </Headline>
        <p className="mt-5 max-w-[34ch] text-lg leading-relaxed text-text-secondary sm:text-xl">{t("hero.sub")}</p>
        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
          <TrackedCta href="/auth/signup" ctaId="workers_hero" audience="workers" className={buttonLinkClassName("primary")}>
            {t("hero.cta")} →
          </TrackedCta>
          <TrackedCta href="/jobs" ctaId="workers_hero_jobs" audience="workers" className={CTA_SECONDARY}>
            {t("hero.secondary")}
          </TrackedCta>
        </div>
        <p className="mt-4 text-support text-text-muted">{t("hero.note")}</p>
      </CopyBlock>
      <WorldPane tier="focus" pos={{ right: "3.9%", top: "14.4%" }} w="clamp(250px,23vw,330px)" delay={200} label={tw("labels.today")}>
        <PaneLabel>{tw("labels.today")}</PaneLabel>
        <PaneValue size="lg">{tw("workers.taskTitle")}</PaneValue>
        <PaneMeta>{tw("workers.taskMeta")}</PaneMeta>
      </WorldPane>
      <WorldPane tier="context" pos={{ right: "3.9%", top: "39%" }} w="clamp(250px,23vw,330px)" delay={400} label={tw("labels.record")}>
        <PaneLabel>{tw("labels.record")}</PaneLabel>
        <PaneValue>{tw("workers.recordTitle")}</PaneValue>
        <PaneMeta>{tw("workers.recordMeta")}</PaneMeta>
      </WorldPane>
      <WorldPane tier="context" pos={{ right: "3.9%", top: "63%" }} w="clamp(250px,23vw,330px)" delay={600}>
        <StateMark state="confirmed" label={ts("states.confirmed")} />
        <PaneValue>{tw("workers.doneTitle")}</PaneValue>
      </WorldPane>
    </WorldScene>
  );
}

/** /FOR-COMPANIES — the restaurant owner and her team; what needs her, the project, the people. */
export async function CompaniesWorldHero() {
  const t = await getTranslations("publicSlice.companies");
  const tw = await getTranslations("publicSlice.world");
  const ts = await getTranslations("publicSlice");
  const ti = await getTranslations("publicSlice.imagery");
  const tt = await getTranslations("publicSlice.transition");
  const items = t.raw("attention.items") as { text: string; state: "wait" | "unk" }[];
  const img = PUBLIC_IMAGERY.owner;
  const W = "clamp(250px,24vw,340px)";
  return (
    <WorldScene
      testId="public-hero-companies"
      src={img.src}
      width={img.width}
      height={img.height}
      alt={ti("ownerAlt")}
      photoClass="brand"
      objectPosition="50% 36%"
      priority
      badge={<SamplePill label={ts("sample")} />}
    >
      <WorldLines
        paths={[
          { d: "M71 22 C 64 24 57 30 51.5 37", tone: "gold", delay: 500 },
          { d: "M71 49 C 65 48 60 46 54.5 44", delay: 700 },
          { d: "M71 63 C 65 62 60 55 53 46", tone: "success", delay: 900 },
        ]}
      />
      <WorldNode x="51.5%" y="37%" />
      <WorldNode x="54.5%" y="44%" tone="ring" />
      <WorldNode x="53%" y="46%" tone="success" />
      <CopyBlock className="lg:bottom-[7.5%] lg:left-[4.9%] lg:w-[min(38rem,42%)]">
        <Headline>
          {t("hero.title")}
          <span className="block text-gradient-accent">{t("hero.accent")}</span>
        </Headline>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <TrackedCta href="/company-need" ctaId="companies_hero" audience="companies" className={buttonLinkClassName("primary")}>
            {t("hero.cta")} →
          </TrackedCta>
          <TrackedCta href="/pricing" ctaId="companies_hero_pricing" audience="companies" className={CTA_SECONDARY}>
            {t("hero.secondary")}
          </TrackedCta>
        </div>
        <p className="mt-4 max-w-[40ch] text-support text-text-muted">{t("hero.note")}</p>
      </CopyBlock>
      <WorldPane tier="focus" pos={{ right: "4.9%", top: "9%" }} w={W} delay={200} label={tw("labels.needs")}>
        <PaneLabel>{tw("labels.needs")}</PaneLabel>
        <p className="mt-1 font-display text-6xl font-extrabold leading-none tracking-tightest text-brand-blue">3</p>
        <ul className="mt-3 grid gap-1.5">
          {items.map((it) => (
            <li key={it.text}>
              <StateMark state={it.state === "wait" ? "waiting" : "unknown"} label={it.text} className="text-text-primary" />
            </li>
          ))}
        </ul>
      </WorldPane>
      <WorldPane tier="context" pos={{ right: "4.9%", top: "47%" }} w={W} delay={400} label={tw("labels.project")}>
        <PaneLabel>{tw("labels.project")}</PaneLabel>
        <PaneValue>{t("project.name")}</PaneValue>
        <div className="mt-2">
          <StateMark state="confirmed" label={tw("companies.projectDone")} />
        </div>
      </WorldPane>
      <WorldPane tier="context" pos={{ right: "4.9%", top: "64%" }} w={W} delay={600} label={tw("labels.team")}>
        <PaneLabel>{tw("labels.kitchen")}</PaneLabel>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex -space-x-2">
            <PersonRing src={PUBLIC_IMAGERY.rasaPortrait.src} name="" initials="RJ" size={44} objectPosition="50% 22%" zoom={1.15} focus />
            <PersonRing name="" initials="JP" size={44} />
            <PersonRing name="" initials="IK" size={44} />
          </span>
          <PaneMeta>{tw("companies.teamMeta")}</PaneMeta>
        </div>
      </WorldPane>
      <WorldPane tier="quiet" pos={{ right: "4.9%", bottom: "5%" }} w={W} delay={800}>
        <PaneLabel>{tt("co.nextLabel")}</PaneLabel>
        <PaneValue>{tt("co.nextNeed")}</PaneValue>
      </WorldPane>
    </WorldScene>
  );
}
