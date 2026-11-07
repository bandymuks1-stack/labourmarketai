import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Card } from "@/components/ui/Card";

/**
 * A `data-testid` on <Card> compiles whether or not the card keeps it, because TypeScript
 * never checks hyphenated JSX props. The approvals card lost its own that way, and only a
 * production walk noticed.
 */
describe("Card keeps a caller's data attributes", () => {
  it("renders them on the card's own element", () => {
    const html = renderToStaticMarkup(
      <Card data-testid="x" data-state="waiting" data-count={3}>
        y
      </Card>,
    );
    expect(html).toContain('data-testid="x"');
    expect(html).toContain('data-state="waiting"');
    expect(html).toContain('data-count="3"');
  });

  it("the variant stays the card's own", () => {
    expect(renderToStaticMarkup(<Card variant="muted" data-variant="other">y</Card>)).toContain('data-variant="muted"');
  });

  it("the approvals card still names itself through it", () => {
    const pulse = readFileSync(join(__dirname, "..", "..", "components/app/arena/confirm-pulse.tsx"), "utf8");
    expect(pulse).toMatch(/<Card className="flex flex-col gap-3" data-testid="organization-approvals" data-state=\{view\.state\}>/);
  });
});
