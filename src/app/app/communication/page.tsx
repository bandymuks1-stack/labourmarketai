import type { Metadata } from "next";
import { CommunicationStart } from "@/components/communication/CommunicationStart";
import { PageHeader } from "@/components/ui/PageHeader";
import { sampleThreadStarts } from "@/lib/sample-data";

export const metadata: Metadata = { title: "Communication" };

/**
 * The ONE communication route. There is a single communication area and a
 * single entry point for starting a thread — no parallel inbox / messages /
 * DM surface, now or later.
 */
export default function CommunicationPage() {
  return (
    <>
      <PageHeader
        eyebrow="One conversation surface"
        title="Communication"
        lead="Every thread is started from here. There is no separate inbox or messages area — this is the single communication home."
      />
      <CommunicationStart recent={sampleThreadStarts} />
    </>
  );
}
