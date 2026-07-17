import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadataFor } from "@/lib/seo/metadata";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import {
  ESTIMATE_TEMPLATES,
  UNIT_TYPES,
  type EstimateProblem,
} from "@/lib/estimate/estimate";
import {
  ProjectCostCalculator,
  type ProjectCostCalculatorLabels,
} from "@/components/app/project-cost-calculator";
import "./print.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor(
    "projectCostCalculator",
    locale,
    "/calculators/project-cost",
  );
}

/**
 * Public work & project cost calculator (European Work & Project Calculator
 * v1). Account-free, fully client-side, stateless: the page reuses the SAME
 * deterministic estimate engine that powers the authenticated demand wizard
 * (lib/estimate/estimate.ts) — no second engine exists. Cross-sector by
 * design: all nine estimate templates are offered with their existing
 * localized labels; construction is one sector among many, never the frame.
 *
 * All copy is resolved HERE (server) and passed to the client component as
 * labels — the marketing route group ships a minimal client message pick.
 */
export default async function ProjectCostCalculatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("calculators.projectCost");
  const te = await getTranslations("auth.dashboard.wow.demand.estimate");
  const tlm = await getTranslations("labourMarket");

  const record = (keys: readonly string[], map: (k: string) => string) =>
    Object.fromEntries(keys.map((k) => [k, map(k)]));

  const ESTIMATE_PROBLEMS: readonly EstimateProblem[] = [
    "negative_quantity",
    "negative_worker_count",
    "negative_hours",
    "negative_rate",
    "negative_materials",
    "negative_equipment",
    "negative_transport",
    "percent_out_of_range",
    "not_finite",
    "empty_labour",
  ];

  const labels: ProjectCostCalculatorLabels = {
    steps: {
      context: t("steps.context"),
      quantities: t("steps.quantities"),
      rates: t("steps.rates"),
      result: t("steps.result"),
      back: t("steps.back"),
      next: t("steps.next"),
      startOver: t("steps.startOver"),
    },
    fields: {
      template: te("f.template"),
      unitType: te("f.unitType"),
      workType: te("f.workType"),
      workTypePlaceholder: te("f.workTypePlaceholder"),
      quantity: te("f.quantity"),
      workerCount: te("f.workerCount"),
      hoursPerWorker: te("f.hoursPerWorker"),
      totalHours: te("f.totalHours"),
      totalHoursHelp: t("totalHoursHelp"),
      rate: te("f.rate"),
      ratePlaceholder: te("f.ratePlaceholder"),
      currency: te("f.currency"),
      country: te("f.country"),
      countryNone: t("countryNone"),
      materials: te("f.materials"),
      equipment: te("f.equipment"),
      transport: te("f.transport"),
      overhead: te("f.overhead"),
      margin: te("f.margin"),
      contingency: te("f.contingency"),
    },
    templates: record(ESTIMATE_TEMPLATES, (k) => te(`templates.${k}`)),
    units: record(UNIT_TYPES, (k) => te(`units.${k}`)),
    errors: record(ESTIMATE_PROBLEMS, (k) => te(`errors.${k}`)),
    summary: {
      sectionResult: te("sectionResult"),
      labourSubtotal: te("r.labourSubtotal"),
      materials: te("r.materials"),
      equipment: te("r.equipment"),
      transport: te("r.transport"),
      overhead: te("r.overhead"),
      margin: te("r.margin"),
      contingency: te("r.contingency"),
      estimatedTotal: te("r.estimatedTotal"),
      range: te("r.range"),
      assumptionsTitle: te("assumptionsTitle"),
      missingTitle: te("missingTitle"),
      disclaimer: te("disclaimer"),
    },
    assumptionLabels: record(
      [
        "preliminary",
        "totalHoursUsed",
        "labourFromWorkersHours",
        "noOverhead",
        "noMargin",
        "rangeFromContingency",
      ],
      (k) => te(`assumptions.${k}`),
    ),
    missingLabels: record(["rate", "hours", "materials", "contingency"], (k) =>
      te(`missing.${k}`),
    ),
    vat: {
      label: t("vat.label"),
      help: t("vat.help"),
      invalid: t("vat.invalid"),
      net: t("vat.net"),
      amount: t("vat.amount"),
      gross: t("vat.gross"),
    },
    accommodation: {
      title: t("acc.title"),
      note: t("acc.note"),
      workers: t("acc.workers"),
      days: t("acc.days"),
      perWorkerDay: t("acc.perWorkerDay"),
      computed: t("acc.computed"),
      apply: t("acc.apply"),
    },
    pack: {
      toggle: t("pack.toggle"),
      note: t("pack.note"),
      netArea: t("pack.netArea"),
      dimensionsHint: t("pack.dimensionsHint"),
      lengthM: t("pack.lengthM"),
      heightM: t("pack.heightM"),
      openings: t("pack.openings"),
      layers: t("pack.layers"),
      thickness: t("pack.thickness"),
      waste: t("pack.waste"),
      coverage: t("pack.coverage"),
      price: t("pack.price"),
      labourPerM2: t("pack.labourPerM2"),
      crewSize: t("pack.crewSize"),
      outNet: t("pack.outNet"),
      outCoverage: t("pack.outCoverage"),
      outWithWaste: t("pack.outWithWaste"),
      outPackages: t("pack.outPackages"),
      outMaterialCost: t("pack.outMaterialCost"),
      outLabourHours: t("pack.outLabourHours"),
      outDuration: t("pack.outDuration"),
      outVolume: t("pack.outVolume"),
      apply: t("pack.apply"),
      applied: t("pack.applied"),
      errors: {
        no_area: t("pack.errors.no_area"),
        waste_out_of_range: t("pack.errors.waste_out_of_range"),
        layers_out_of_range: t("pack.errors.layers_out_of_range"),
      },
    },
    result: {
      incompleteTitle: t("result.incompleteTitle"),
      incompleteBody: t("result.incompleteBody"),
      emptyTitle: t("result.emptyTitle"),
      emptyBody: t("result.emptyBody"),
      csv: t("result.csv"),
      print: t("result.print"),
      ctaTitle: t("result.ctaTitle"),
      ctaBody: t("result.ctaBody"),
      ctaDashboard: t("result.ctaDashboard"),
      ctaDashboardHelp: t("result.ctaDashboardHelp"),
      ctaCompanyNeed: t("result.ctaCompanyNeed"),
      ctaCompanyNeedHelp: t("result.ctaCompanyNeedHelp"),
    },
    csvLabels: {
      // Stable column ids → localized labels (ids stay in the file too).
      template: te("f.template"),
      workType: te("f.workType"),
      unitType: te("f.unitType"),
      quantity: te("f.quantity"),
      workerCount: te("f.workerCount"),
      hoursPerWorker: te("f.hoursPerWorker"),
      totalHours: te("f.totalHours"),
      rate: te("f.rate"),
      country: te("f.country"),
      materials: te("f.materials"),
      equipment: te("f.equipment"),
      transportAccommodation: te("f.transport"),
      overheadPercent: te("f.overhead"),
      marginPercent: te("f.margin"),
      contingencyPercent: te("f.contingency"),
      vatPercent: t("vat.label"),
      labourHours: te("r.labourHours"),
      labourSubtotal: te("r.labourSubtotal"),
      directCosts: te("r.directCosts"),
      overhead: te("r.overhead"),
      margin: te("r.margin"),
      contingency: te("r.contingency"),
      estimatedTotal: te("r.estimatedTotal"),
      low: te("r.low"),
      high: te("r.high"),
      netTotalExclVat: t("vat.net"),
      vatAmount: t("vat.amount"),
      grossTotalInclVat: t("vat.gross"),
      netAreaM2: t("pack.outNet"),
      coverageAreaM2: t("pack.outCoverage"),
      coverageWithWasteM2: t("pack.outWithWaste"),
      packageCount: t("pack.outPackages"),
      materialCost: t("pack.outMaterialCost"),
      crewDurationHours: t("pack.outDuration"),
      insulationVolumeM3: t("pack.outVolume"),
      hours: te("missing.hours"),
    },
  };

  const countryOptions = MARKET_COUNTRIES.map((code) => ({
    code,
    label: tlm(`countryNames.${code}`),
  }));

  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-14 sm:px-12"
      id="main-content"
    >
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {t("lede")}
        </p>
      </header>

      {/* Plain-language honesty block — contextual, not a legal wall. */}
      <div
        className="card-border flex flex-col gap-2 p-4"
        data-testid="pcc-honesty"
      >
        <p className="font-display text-sm font-semibold text-text-primary">
          {t("honesty.title")}
        </p>
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("honesty.body")}
        </p>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t("honesty.userNumbers")}
        </p>
      </div>

      <ProjectCostCalculator
        labels={labels}
        locale={locale}
        countryOptions={countryOptions}
      />
    </div>
  );
}
