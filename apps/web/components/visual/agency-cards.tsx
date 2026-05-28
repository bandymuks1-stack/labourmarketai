import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleOff,
  Lock,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";

import { VISUAL_TOKENS } from "@/lib/visual/tokens";

/**
 * Slice 4 — Agency / company operating cards.
 *
 * Six primitives that together explain how an agency / company
 * participates in labourmarket.ai when the full marketplace is
 * not yet live. The cards are pure presentational; the page
 * renders them with explicit `Sample · …` data so the surface
 * never reads as a verified agency, a real candidate pool, or
 * an active paid-search product.
 *
 * Honesty rules (CLAUDE doctrine §7 + DEMO_TO_REAL_DATA_POLICY):
 *   - Every entity carries `isSample: true` and a "Sample · …"
 *     name prefix.
 *   - Worker / candidate counts default to literal 0 (rendered
 *     as 0 next to a "Preview" pill) — never a fabricated 12.
 *   - externalSearchStatus is hardcoded to "locked" and the card
 *     copy is explicit that broader candidate search is a
 *     separate operator-assisted service, not an open database.
 *   - Owner-approved stamps are intentionally `null` so the
 *     honest "owner-approved laukia" fallback shows.
 *   - The Early Contributor card cites priority CONSIDERATION
 *     only — never guarantees, jobs, offers, payment, or
 *     automatic matching.
 */

const enLabel = (lt: string, en: string, locale: "lt" | "en") =>
  locale === "lt" ? lt : en;

// ---------------------------------------------------------------------------
// A. AgencyCard
// ---------------------------------------------------------------------------

export type AgencyType = "staffing" | "contractor" | "in-house" | "agency" | "company";

export interface AgencyEntity {
  readonly id: string;
  readonly displayName: string;
  readonly agencyType: AgencyType;
  readonly countryOrMarket: string;
  readonly ownWorkerCount: number;
  readonly activeCandidateCount: number;
  readonly profileCompletenessPct: number;
  readonly ownerApprovedBy: string | null;
  readonly isSample: true;
}

const AGENCY_TYPE_LABEL_LT: Record<AgencyType, string> = {
  staffing: "Įdarbinimo agentūra",
  contractor: "Rangos įmonė",
  "in-house": "Vidinė įmonė",
  agency: "Agentūra",
  company: "Įmonė",
};

const AGENCY_TYPE_LABEL_EN: Record<AgencyType, string> = {
  staffing: "Staffing agency",
  contractor: "Contractor",
  "in-house": "In-house company",
  agency: "Agency",
  company: "Company",
};

export function AgencyCard({
  agency,
  locale,
}: {
  readonly agency: AgencyEntity;
  readonly locale: "lt" | "en";
}) {
  const typeLabel =
    locale === "lt"
      ? AGENCY_TYPE_LABEL_LT[agency.agencyType]
      : AGENCY_TYPE_LABEL_EN[agency.agencyType];
  const ownerApprovedFallback = enLabel(
    "owner-approved laukia",
    "owner-approved pending",
    locale,
  );
  const completeness = Math.max(0, Math.min(100, agency.profileCompletenessPct));

  return (
    <article
      className={`flex flex-col gap-3 ${VISUAL_TOKENS.cardRadius} border ${VISUAL_TOKENS.cardBorder} ${VISUAL_TOKENS.cardSurface} p-4`}
      data-testid={`agency-card-${agency.id}`}
    >
      <header className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${VISUAL_TOKENS.chipSurface}`}
          aria-hidden="true"
        >
          <Building2 className="h-5 w-5 text-zinc-700 dark:text-zinc-200" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <h3 className="font-display text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {agency.displayName}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {typeLabel} · {agency.countryOrMarket}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full ${VISUAL_TOKENS.chipSurface} px-2 py-0.5 text-[10px] font-medium ${VISUAL_TOKENS.chipText}`}
        >
          Sample
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {enLabel("Savi darbuotojai", "Own workers", locale)}
          </dt>
          <dd className="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {agency.ownWorkerCount}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {enLabel("Aktyvūs kandidatai", "Active candidates", locale)}
          </dt>
          <dd className="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {agency.activeCandidateCount}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
          <span>{enLabel("Profilio užbaigtumas", "Profile completeness", locale)}</span>
          <span>{completeness}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completeness}
        >
          <div
            className="h-full rounded-full bg-zinc-500 dark:bg-zinc-400"
            style={{ width: `${completeness}%` }}
          />
        </div>
      </div>

      <footer className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          {agency.ownerApprovedBy ?? ownerApprovedFallback}
        </span>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------------
// B. OwnedWorkersScopeCard
// ---------------------------------------------------------------------------

export function OwnedWorkersScopeCard({
  ownWorkerCount,
  locale,
}: {
  readonly ownWorkerCount: number;
  readonly locale: "lt" | "en";
}) {
  return (
    <CardShell
      icon={<Users className="h-4 w-4" aria-hidden="true" />}
      title={enLabel("Matote tik savo darbuotojus", "You see only your own workers", locale)}
      testId="owned-workers-scope-card"
    >
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {enLabel(
          "Šiuo metu agentūros / įmonės puslapyje matote tik savo prie agentūros prisirišusius darbuotojus. Bendros kandidatų bazės nematote — tai sąmoninga produkto taisyklė.",
          "On the agency / company surface you currently see only workers attached to your own agency. A shared candidate pool is not exposed — this is an intentional product rule.",
          locale,
        )}
      </p>
      <ul className="flex flex-col gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <li className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {enLabel("Savi darbuotojai", "Own workers", locale)}:{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{ownWorkerCount}</span>
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {enLabel(
              "Kitų kandidatų prieiga uždaryta pagal nutylėjimą",
              "External candidate access closed by default",
              locale,
            )}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <CircleOff className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {enLabel(
              "Atviro kandidatų rinkos srauto neturime",
              "There is no open candidate marketplace stream",
              locale,
            )}
          </span>
        </li>
      </ul>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// C. CandidateAccessLimitCard
// ---------------------------------------------------------------------------

export function CandidateAccessLimitCard({
  ownWorkersAvailable,
  locale,
}: {
  readonly ownWorkersAvailable: number;
  readonly locale: "lt" | "en";
}) {
  return (
    <CardShell
      icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
      title={enLabel("Kandidatų prieigos ribos", "Candidate access limits", locale)}
      testId="candidate-access-limit-card"
    >
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {enLabel(
          "Platesnė kandidatų paieška veikia kaip atskira paslauga — ne kaip atvira duomenų bazė. Tai operatoriaus / kuratoriaus padedama paieška, ne automatinis matching.",
          "Broader candidate search runs as a separate operator-assisted service — not as an open database. It is a curated search, not automatic matching.",
          locale,
        )}
      </p>
      <ul className="flex flex-col gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <li className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {enLabel("Pasiekiami savi darbuotojai", "Own workers available", locale)}:{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{ownWorkersAvailable}</span>
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {enLabel(
              "Išorinė kandidatų paieška: uždaryta (locked)",
              "External candidate search: locked",
              locale,
            )}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {enLabel(
              "Platesnė paieška ateis kaip paslauga, ne kaip atvira duomenų bazė",
              "Broader search arrives as a service, not as an open database",
              locale,
            )}
          </span>
        </li>
      </ul>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// D. PaidSearchServiceLockedCard
// ---------------------------------------------------------------------------

export type PaidSearchServiceStatus = "locked" | "manual_request" | "planned";

export function PaidSearchServiceLockedCard({
  status,
  locale,
}: {
  readonly status: PaidSearchServiceStatus;
  readonly locale: "lt" | "en";
}) {
  const statusLabel =
    status === "locked"
      ? enLabel("užrakinta", "locked", locale)
      : status === "manual_request"
        ? enLabel("manual_request", "manual_request", locale)
        : enLabel("planned", "planned", locale);
  return (
    <CardShell
      icon={<Lock className="h-4 w-4" aria-hidden="true" />}
      title={enLabel("Mokama paieška / paslauga", "Paid search / service", locale)}
      testId="paid-search-service-locked-card"
    >
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {enLabel(
          "Šiuo metu mokama paieška / paslauga nėra aktyvuota — jokio checkout, jokio mokėjimo. Galite palikti užklausą, ji bus peržiūrėta rankiniu būdu.",
          "Paid search / service is not activated right now — no checkout, no payment. You can leave a request and it is reviewed manually.",
          locale,
        )}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {enLabel("Būsena", "Status", locale)}:{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{statusLabel}</span>
      </p>
      <ul className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
        <li>{enLabel("Atrinktas kandidatų sąrašas (shortlist)", "Curated candidate shortlist", locale)}</li>
        <li>{enLabel("Rankinė peržiūra", "Manual review", locale)}</li>
        <li>{enLabel("Operatoriaus / steigėjo padedamas matching", "Operator / founder-assisted matching", locale)}</li>
      </ul>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={`mt-1 inline-flex w-fit cursor-not-allowed items-center gap-2 rounded-full ${VISUAL_TOKENS.chipSurface} px-3 py-1 text-xs font-medium ${VISUAL_TOKENS.chipText}`}
        data-testid="request-search-service-cta"
      >
        <Lock className="h-3 w-3" aria-hidden="true" />
        {enLabel("Pateikti paslaugos užklausą (preview)", "Request search service (preview)", locale)}
      </button>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
        {enLabel(
          "CTA tik vaizdinė; preview metu užklausos nesiunčiamos.",
          "CTA is preview-only; no request is sent during preview.",
          locale,
        )}
      </p>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// E. EarlyContributorPriorityCard
// ---------------------------------------------------------------------------

export function EarlyContributorPriorityCard({
  locale,
}: {
  readonly locale: "lt" | "en";
}) {
  return (
    <CardShell
      icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
      title={enLabel(
        "Ankstyvi dalyviai — prioriteto peržiūra",
        "Early contributors — priority review",
        locale,
      )}
      testId="early-contributor-priority-card"
    >
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {enLabel(
          "Jūsų prisidėjimas dabar kuria realų duomenų pagrindą, ant kurio vėliau veiks paieška, paslaugos ir naujos funkcijos.",
          "Your contribution now builds the real data foundation that search, service and new features will run on later.",
          locale,
        )}
      </p>

      <section className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {enLabel("Kokie duomenys padeda", "Data that helps", locale)}
        </p>
        <ul className="grid grid-cols-1 gap-1 text-xs text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
          <li>{enLabel("Tikri profiliai", "Real profiles", locale)}</li>
          <li>{enLabel("Tikri įgūdžiai", "Real skills", locale)}</li>
          <li>{enLabel("Prieinamumas", "Availability", locale)}</li>
          <li>{enLabel("Darbo dienoraščio įrašai", "Work Journal entries", locale)}</li>
          <li>{enLabel("Įrodymų vienetai", "Proof / evidence", locale)}</li>
          <li>{enLabel("Patvirtinimų istorija", "Confirmation history", locale)}</li>
          <li>{enLabel("Agentūros / komandos informacija", "Agency / team info", locale)}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {enLabel("Ką dalyviai gali gauti", "What contributors may receive", locale)}
        </p>
        <ul className="grid grid-cols-1 gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <li>{enLabel("Prioritetinė peržiūra (kai atsiras tinkamos galimybės)", "Priority review (when relevant opportunities appear)", locale)}</li>
          <li>{enLabel("Ankstyva prieiga prie naujų funkcijų", "Early access to new features", locale)}</li>
          <li>{enLabel("Stipresnis profilio pasiruošimas", "Stronger profile readiness", locale)}</li>
          <li>{enLabel("Steigėjo / operatoriaus peržiūros prioritetas", "Founder / operator review priority", locale)}</li>
        </ul>
      </section>

      <section
        className={`flex flex-col gap-1 ${VISUAL_TOKENS.cardRadius} border ${VISUAL_TOKENS.cardBorder} p-3`}
        data-testid="no-guarantee-disclaimer"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {enLabel("Sąžiningas atsakomybės atribojimas", "Honest disclaimer", locale)}
        </p>
        <ul className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
          <li>{enLabel("Tai nėra darbo garantija", "This is not a job guarantee", locale)}</li>
          <li>{enLabel("Tai nėra pasiūlymo garantija", "This is not an offer guarantee", locale)}</li>
          <li>{enLabel("Tai nėra automatinio matching pažadas", "This is not an automatic matching promise", locale)}</li>
          <li>{enLabel("Jokio mokėjimo dabar nereikia", "No payment is required now", locale)}</li>
        </ul>
      </section>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// F. AgencyNextActionsCard
// ---------------------------------------------------------------------------

interface NextAction {
  readonly id: string;
  readonly labelLt: string;
  readonly labelEn: string;
  readonly Icon: typeof Building2;
  readonly disabled: boolean;
}

const NEXT_ACTIONS: readonly NextAction[] = [
  {
    id: "manage-workers",
    labelLt: "Valdyti savus darbuotojus",
    labelEn: "Manage own workers",
    Icon: Users,
    disabled: true,
  },
  {
    id: "invite-worker",
    labelLt: "Pakviesti / pridėti darbuotoją",
    labelEn: "Invite / add a worker",
    Icon: UserPlus,
    disabled: true,
  },
  {
    id: "improve-agency-profile",
    labelLt: "Pagerinti agentūros profilį",
    labelEn: "Improve agency profile",
    Icon: CheckCircle2,
    disabled: true,
  },
  {
    id: "request-search-service",
    labelLt: "Pateikti paieškos paslaugos užklausą",
    labelEn: "Request search service",
    Icon: WalletCards,
    disabled: true,
  },
  {
    id: "explain-priority",
    labelLt: "Paaiškinti ankstyvo dalyvio prioritetą",
    labelEn: "Explain early contributor priority",
    Icon: Sparkles,
    disabled: true,
  },
] as const;

export function AgencyNextActionsCard({
  locale,
}: {
  readonly locale: "lt" | "en";
}) {
  return (
    <CardShell
      icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
      title={enLabel("Kiti veiksmai", "Next actions", locale)}
      testId="agency-next-actions-card"
    >
      <ul className="flex flex-col gap-2">
        {NEXT_ACTIONS.map(({ id, labelLt, labelEn, Icon, disabled }) => (
          <li key={id}>
            <button
              type="button"
              disabled={disabled}
              aria-disabled={disabled || undefined}
              className={`flex w-full items-center gap-2 rounded-xl border ${VISUAL_TOKENS.cardBorder} bg-transparent px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 ${disabled ? "cursor-not-allowed opacity-70" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
              data-testid={`agency-next-action-${id}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="flex-1 text-left">{enLabel(labelLt, labelEn, locale)}</span>
              {disabled ? (
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {enLabel("preview", "preview", locale)}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-500">
        {enLabel(
          "Visi mygtukai šiuo metu yra preview — nesiunčiame, nepublikuojame, nesusiekiame.",
          "Every button is preview-only — we do not send, publish, or contact anyone.",
          locale,
        )}
      </p>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Shared card shell
// ---------------------------------------------------------------------------

function CardShell({
  icon,
  title,
  testId,
  children,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <article
      className={`flex flex-col gap-3 ${VISUAL_TOKENS.cardRadius} border ${VISUAL_TOKENS.cardBorder} ${VISUAL_TOKENS.cardSurface} p-4`}
      data-testid={testId}
    >
      <header className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${VISUAL_TOKENS.chipSurface} ${VISUAL_TOKENS.chipText}`}
        >
          {icon}
        </span>
        <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
      </header>
      {children}
    </article>
  );
}
