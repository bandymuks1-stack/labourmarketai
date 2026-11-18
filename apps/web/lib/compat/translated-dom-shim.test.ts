import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TRANSLATED_DOM_SHIM } from "./translated-dom-shim";

/**
 * 2026-11-05 production incident: Save on a page the browser translated killed
 * the page, because React addressed text nodes the translator had replaced. The
 * shim must (a) leave normal calls native, (b) survive both calls when the node
 * has left, (c) keep real errors for anything else, (d) run before React.
 */

/** The little of a DOM the two calls need, throwing like the real one. */
class FakeNode {
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  constructor(public nodeName: string) {}
  removeChild(child: FakeNode): FakeNode {
    const i = this.childNodes.indexOf(child);
    if (i < 0) throw new Error("NotFoundError: removeChild");
    this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  insertBefore(node: FakeNode, ref: FakeNode | null): FakeNode {
    const i = ref === null ? this.childNodes.length : this.childNodes.indexOf(ref);
    if (i < 0) throw new Error("NotFoundError: insertBefore");
    this.childNodes.splice(i, 0, node);
    node.parentNode = this;
    return node;
  }
}

function install(): typeof FakeNode {
  class Node extends FakeNode {}
  // Own copies on the class's prototype, so that each test patches its own.
  Node.prototype.removeChild = FakeNode.prototype.removeChild;
  Node.prototype.insertBefore = FakeNode.prototype.insertBefore;
  new Function("window", TRANSLATED_DOM_SHIM)({ Node });
  return Node;
}

/** What a translator does: the text node leaves, a <font> takes its place. */
function translate(Node: typeof FakeNode, parent: FakeNode, text: FakeNode, keepInside = false): FakeNode {
  const font = new Node("FONT");
  const i = parent.childNodes.indexOf(text);
  parent.childNodes[i] = font;
  font.parentNode = parent;
  text.parentNode = null;
  if (keepInside) {
    font.childNodes.push(text);
    text.parentNode = font;
  }
  return font;
}

describe("the page survives a browser translator", () => {
  it("the spinner beside a translated label goes in instead of killing the page", () => {
    const Node = install();
    const button = new Node("BUTTON");
    const label = new Node("#text");
    button.insertBefore(label, null);
    const font = translate(Node, button, label);
    const spinner = new Node("svg");
    expect(() => button.insertBefore(spinner, label)).not.toThrow();
    expect(button.childNodes).toEqual([font, spinner]);
  });

  it("removing a translated text node is no error", () => {
    const Node = install();
    const parent = new Node("P");
    const text = new Node("#text");
    parent.insertBefore(text, null);
    const font = translate(Node, parent, text);
    expect(parent.removeChild(text)).toBe(text);
    expect(parent.childNodes).toEqual([font]);
  });

  it("a node still inside the translator's wrapper leaves with the wrapper", () => {
    const Node = install();
    const parent = new Node("P");
    const text = new Node("#text");
    parent.insertBefore(text, null);
    const font = translate(Node, parent, text, true);
    const sibling = new Node("SPAN");
    parent.insertBefore(sibling, text);
    expect(parent.childNodes).toEqual([sibling, font]);
    parent.removeChild(text);
    expect(parent.childNodes).toEqual([sibling]);
  });

  it("normal calls behave as before, and a wrapper that isn't a translator's stays", () => {
    const Node = install();
    const parent = new Node("DIV");
    const a = new Node("A");
    const b = new Node("B");
    parent.insertBefore(b, null);
    parent.insertBefore(a, b);
    expect(parent.childNodes).toEqual([a, b]);
    parent.removeChild(b);
    expect(parent.childNodes).toEqual([a]);
    const inner = new Node("I");
    a.insertBefore(inner, null);
    parent.removeChild(inner);
    expect(parent.childNodes).toEqual([a]);
  });

  it("runs in <head> before any application module", () => {
    const layout = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "layout.tsx"), "utf8");
    const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
    expect(head).toContain("__html: TRANSLATED_DOM_SHIM");
    expect(head.indexOf("TRANSLATED_DOM_SHIM")).toBeGreaterThan(head.indexOf("REGEXP_LOOKBEHIND_SHIM"));
    expect(head.indexOf("TRANSLATED_DOM_SHIM")).toBeLessThan(head.indexOf('type="application/ld+json"'));
  });
});
