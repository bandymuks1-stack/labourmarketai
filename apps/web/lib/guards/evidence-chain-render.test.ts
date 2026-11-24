import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EvidenceChain, type EvidenceChainLabels } from "@/components/app/work-world/evidence-chain";
import { deriveEvidenceChain } from "@/lib/evidence/evidence-chain";
import { WORK_VERIFICATION_STATES } from "@/lib/journal/work-verification-state";

const labels: EvidenceChainLabels = {
  label: "Record status",
  own: "By you",
  nodes: { recorded: "Recorded", photo: "Photo", manager: "Manager's record", history: "In your history" },
  status: { done: "Done", waiting: "Waiting", absent: "Not yet", attention: "Needs you", unknown: "Unknown" },
};
const html = (verification: (typeof WORK_VERIFICATION_STATES)[number], photoCount: number | null, size: "compact" | "full" = "full") =>
  renderToStaticMarkup(createElement(EvidenceChain, { chain: deriveEvidenceChain({ verification, photoCount }), labels, size }));

describe("EvidenceChain — state is never colour alone", () => {
  it("is an ordered list with an accessible name and four nodes", () => {
    const h = html("self_reported", 0);
    expect(h).toContain('<ol aria-label="Record status"');
    expect(h.match(/<li /g)).toHaveLength(4);
  });

  it("every state is carried by a ring shape AND a word, not only a colour", () => {
    expect(html("verification_pending", 1)).toMatch(/data-node="manager" data-status="waiting"/);
    expect(html("verification_pending", 1)).toContain("border-dashed"); // shape
    expect(html("verification_pending", 1)).toContain("Waiting"); // word
    expect(html("disputed", 0)).toContain("Needs you");
    expect(html("self_reported", null)).toContain("border-dotted"); // unknown ≠ absent
    expect(html("self_reported", null)).toContain("Unknown");
  });

  it("compact keeps the full state in screen-reader text", () => {
    const h = html("verified", 1, "compact");
    expect(h).toContain("Manager&#x27;s record: Done");
    expect(h).toContain("sr-only");
  });

  it("a self-confirmation is spoken as the person's own, never as a manager's record", () => {
    const h = html("self_confirmed", 0);
    expect(h).toContain('data-own="true"');
    expect(h).toContain("By you");
  });

  it("gold/green are reinforcement only: a manager's record uses the trust-accent token, history the brand token", () => {
    const h = html("verified", 1);
    expect(h).toContain("text-trust-accent");
    expect(h).toContain("text-brand-blue");
  });
});
