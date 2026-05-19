import type { Metadata } from "next";
import { HiringNeedCard } from "@/components/hiring/HiringNeedCard";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  SAMPLE_NOTICE,
  sampleCompanies,
  sampleHiringNeeds,
} from "@/lib/sample-data";

export const metadata: Metadata = { title: "Hiring needs" };

export default function HiringNeedsPage() {
  const companyById = new Map(sampleCompanies.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        eyebrow="Open roles"
        title="Hiring needs"
        lead="Roles are first-class and always anchored to a company card. Seats, engagement and must-haves in one frame."
        actions={<span className="chip">{SAMPLE_NOTICE}</span>}
      />
      <div className="space-y-6">
        {sampleHiringNeeds.map((need) => {
          const company = companyById.get(need.companyId);
          if (!company) return null;
          return (
            <HiringNeedCard
              key={need.id}
              need={need}
              company={company}
            />
          );
        })}
      </div>
    </>
  );
}
