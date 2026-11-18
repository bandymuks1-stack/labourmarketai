import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

import { ChatTraceStrip } from "@/components/app/conversation/chat-trace-strip";

/** The chat's "what changed" embed draws the SAME step shapes as the home. */
describe("ChatTraceStrip", () => {
  const html = renderToStaticMarkup(
    createElement(ChatTraceStrip, {
      partial: "Couldn't read notifications.",
      items: [
        {
          id: "journal:e1",
          title: "Panel P-1",
          when: "10/13/2026",
          href: "/dashboard/journal",
          reachedCv: true,
          steps: [
            { text: "Recorded 8 h", tone: "fact" },
            { text: "Confirmed by: Manager", tone: "confirmed" },
            { text: "Living CV: Panels · 5 confirmed entries", tone: "derived" },
            { text: "Matching sees confirmed work: Panels", tone: "derived" },
          ],
        },
        {
          id: "journal:e2",
          title: "Panel P-3",
          when: "10/14/2026",
          href: "/dashboard/journal",
          reachedCv: false,
          steps: [
            { text: "Recorded 2.5 h", tone: "fact" },
            { text: "Waiting for confirmation", tone: "pending" },
          ],
        },
      ],
    }),
  );

  it("renders every chain with its source link", () => {
    expect(html).toContain('data-testid="chat-trace"');
    expect((html.match(/href="\/dashboard\/journal"/g) ?? []).length).toBe(2);
  });

  it("pending and derived keep their shapes; green only on the second party's approval", () => {
    expect(html).toContain('data-basis="pending"');
    expect(html).toContain('data-basis="derived"');
    expect((html.match(/text-trust-accent/g) ?? []).length).toBe(1);
  });

  it("celebrates once, on the first derived step of a chain that reached the Living CV", () => {
    expect((html.match(/ua-confirmed/g) ?? []).length).toBe(1);
  });

  it("names a half-failed read", () => {
    expect(html).toContain('data-testid="chat-trace-partial"');
  });
});
