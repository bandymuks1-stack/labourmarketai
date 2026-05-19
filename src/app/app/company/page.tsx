import type { Metadata } from "next";
import { CompanyPlayerCard } from "@/components/company/CompanyPlayerCard";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  SAMPLE_NOTICE,
  sampleCompanies,
  sampleHiringNeeds,
} from "@/lib/sample-data";

export const metadata: Metadata = { title: "Company" };

export default function CompanyPage() {
  const company = sampleCompanies[0];
  const openNeeds = sampleHiringNeeds.filter(
    (n) => n.companyId === company.id,
  );

  return (
    <>
      <PageHeader
        eyebrow="Company profile"
        title="Company"
        lead="The company carries the same player-card system as a person. One card, reused across discover, needs and matching."
        actions={<span className="chip">{SAMPLE_NOTICE}</span>}
      />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <CompanyPlayerCard company={company} />
        <div className="space-y-4">
          <div className="glass p-6">
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-dim">
              {company.about}
            </p>
          </div>
          <div className="glass p-6">
            <h3 className="eyebrow">Open needs ({openNeeds.length})</h3>
            <ul className="mt-3 space-y-2">
              {openNeeds.map((n) => (
                <li
                  key={n.id}
                  className="flex items-center justify-between rounded-lg border border-line/60 bg-fg/[0.02] px-4 py-3 text-sm"
                >
                  <span>{n.roleTitle}</span>
                  <span className="text-fg-mute">
                    {n.seats} seat{n.seats > 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
