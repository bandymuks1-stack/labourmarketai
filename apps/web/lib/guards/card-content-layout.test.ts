import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Card, splitCardClassName } from "@/components/ui/Card";

// createElement's overloads want `children` inside props; this view of Card
// takes them as the extra arguments instead (react/no-children-prop).
const CardEl = Card as (props: { className?: string; children?: ReactNode }) => ReactElement;

/**
 * Production 2026-10-25: /labour-market rendered "LietuvaPERŽIŪRĖTI" — the
 * caller's `flex justify-between gap-3` sat on the card's outer div, whose
 * only child is the inner `relative` content wrapper, so the layout never
 * reached the two spans. Content-layout utilities now land on that wrapper.
 */
describe("Card content layout reaches the content", () => {
  it("splits content layout from card sizing and surface utilities", () => {
    expect(
      splitCardClassName("flex items-center justify-between gap-3 opacity-70 hover:border-brand-blue"),
    ).toEqual({
      surface: "opacity-70 hover:border-brand-blue",
      content: "flex items-center justify-between gap-3",
    });
    // The card's own size in its parent stays outside.
    expect(splitCardClassName("flex flex-1 flex-col justify-center")).toEqual({
      surface: "flex-1",
      content: "flex flex-col justify-center",
    });
    expect(splitCardClassName("wow-card grid gap-4 sm:grid-cols-2 !p-0")).toEqual({
      surface: "wow-card !p-0",
      content: "grid gap-4 sm:grid-cols-2",
    });
    expect(splitCardClassName(undefined)).toEqual({ surface: "", content: "" });
  });

  it("renders the layout on the wrapper that holds the children", () => {
    const html = renderToStaticMarkup(
      createElement(
        CardEl,
        { className: "flex items-center justify-between gap-3 opacity-70" },
        createElement("span", null, "Lietuva"),
        createElement("span", null, "PERŽIŪRĖTI"),
      ),
    );
    expect(html).toMatch(
      /^<div class="card-border p-6 flex flex-col opacity-70"><div class="relative min-w-0 flex-1 flex items-center justify-between gap-3"><span>Lietuva<\/span><span>PERŽIŪRĖTI<\/span><\/div><\/div>$/,
    );
  });

  it("leaves a card without content layout exactly as before", () => {
    const html = renderToStaticMarkup(createElement(CardEl, { className: "mt-4" }, "x"));
    expect(html).toBe('<div class="card-border p-6 mt-4"><div class="relative">x</div></div>');
  });
});
