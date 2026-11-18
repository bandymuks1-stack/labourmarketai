import { describe, expect, it } from "vitest";
import {
  groupProjectsByOrganization,
  parseProjectChoice,
  projectChoiceIsSatisfied,
  projectNamedInText,
  projectPromptFor,
  rpcProjectParams,
} from "./project-attribution";

describe("projectNamedInText — the sentence names one assigned project", () => {
  const P = [
    { id: "p-oslo", label: "Oslo pamatai" },
    { id: "p-kaunas", label: "Kaunas biurai" },
    { id: "p-riga", label: "Riga" },
  ];
  it("owner scenario: 'Oslo projekte su Jonu armavome pamatus' → Oslo", () => {
    expect(
      projectNamedInText(
        [P[1], P[2], { id: "p-oslo", label: "Oslo" }],
        "Šiandien Oslo projekte su Jonu armavome pamatus, dirbome 8 valandas",
      ),
    ).toBe("p-oslo");
  });
  it("an inflected long word still matches (Kaunas → Kaune)", () => {
    expect(projectNamedInText(P, "vakar Kaune montavome")).toBe("p-kaunas");
  });
  it("two projects named → no guess", () => {
    expect(projectNamedInText(P, "Oslo ir Riga, po 4 val.")).toBeNull();
  });
  it("nothing named, or only generic words → no guess", () => {
    expect(projectNamedInText(P, "dirbau 8 valandas")).toBeNull();
    expect(
      projectNamedInText([{ id: "x", label: "Projektas" }, P[2]], "projekte dirbau"),
    ).toBeNull();
  });
  it("short title words must match whole words", () => {
    expect(projectNamedInText([{ id: "r", label: "Riga" }], "rigas")).toBeNull();
  });
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "99999999-9999-4999-8999-999999999999";

describe("project attribution", () => {
  it("0 projects: nothing to ask; 1: DB auto-selects; 2+: must ask", () => {
    expect(projectPromptFor([])).toBe("none");
    expect(projectPromptFor([{ id: A, label: "A" }])).toBe("auto");
    expect(
      projectPromptFor([
        { id: A, label: "A" },
        { id: B, label: "B" },
      ]),
    ).toBe("ask");
  });

  it("2+ projects: unanswered or foreign is NOT savable; a real project or 'none' is", () => {
    const two = [
      { id: A, label: "A" },
      { id: B, label: "B" },
    ];
    expect(projectChoiceIsSatisfied(two, "")).toBe(false);
    expect(projectChoiceIsSatisfied(two, FOREIGN)).toBe(false);
    expect(projectChoiceIsSatisfied(two, A)).toBe(true);
    expect(projectChoiceIsSatisfied(two, "none")).toBe(true);
    expect(projectChoiceIsSatisfied([{ id: A, label: "A" }], "")).toBe(true);
    expect(projectChoiceIsSatisfied([], "")).toBe(true);
  });

  it("posted value maps to explicit/absent RPC params and never guesses", () => {
    expect(rpcProjectParams(parseProjectChoice(A))).toEqual({
      p_project_id: A,
      p_project_explicit: true,
    });
    expect(rpcProjectParams(parseProjectChoice("none"))).toEqual({
      p_project_id: null,
      p_project_explicit: true,
    });
    for (const junk of [undefined, null, "", "undefined", "not-a-uuid"]) {
      expect(rpcProjectParams(parseProjectChoice(junk))).toEqual({
        p_project_id: null,
        p_project_explicit: false,
      });
    }
  });

  it("groups active projects by their own organization only", () => {
    const m = groupProjectsByOrganization([
      { project_id: A, projects: { id: A, title: "Zeta", organization_id: "o1" } },
      { project_id: B, projects: { id: B, title: "Alfa", organization_id: "o1" } },
      { project_id: "c", projects: { id: "c", title: "Other", organization_id: "o2" } },
      { project_id: "d", projects: { id: "d", title: "NoOrg", organization_id: null } },
      { project_id: A, projects: { id: A, title: "Zeta", organization_id: "o1" } },
    ]);
    expect(m.get("o1")?.map((p) => p.label)).toEqual(["Alfa", "Zeta"]);
    expect(m.get("o2")).toHaveLength(1);
    expect(m.size).toBe(2);
  });
});
