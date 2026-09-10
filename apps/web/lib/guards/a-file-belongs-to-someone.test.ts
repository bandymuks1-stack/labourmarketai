import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  readFileIntent,
  routeFileIntent,
  type FileActorContext,
  type FileKind,
  type FileSubject,
} from "@/lib/conversation/file-subject";

/**
 * A FILE BELONGS TO SOMEONE, AND IT IS NOT ALWAYS THE UPLOADER.
 *
 * THE PRODUCTION JOURNEY. The conversation's file vocabulary encoded WHICH
 * SURFACE a document belonged to and never WHOSE DOCUMENT IT WAS:
 *
 *     "Įkeliu 20 kandidatų CV."          -> cv          (the uploader's OWN import)
 *     "I am uploading 20 candidate CVs." -> candidates  (the demand surface)
 *
 * Two wrong answers in two languages, and the Lithuanian one aimed a bulk
 * candidate import at the uploader's own professional history. Every CV
 * confirm action in `lib/profile/cv-section-import-actions.ts` takes NO
 * subject parameter — the caller IS the subject, resolved server-side — so a
 * mis-read sentence writes other people's careers into the uploader's record.
 *
 * "Never silently attach a document to the wrong person" is the rule. The
 * strongest form of it is checked here EXHAUSTIVELY rather than by example.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const SUBJECTS: readonly FileSubject[] = [
  "self",
  "another_person",
  "many_people",
  "organization",
  "cohort",
  "unstated",
];
const KINDS: readonly FileKind[] = ["cv", "document", "work_evidence", "workforce_table", "unstated"];
const ACTORS: readonly FileActorContext[] = [
  { identity: "person", educationWorkspace: false },
  { identity: "company", educationWorkspace: false },
  { identity: "company", educationWorkspace: true },
];

describe("THE INVARIANT: only `self` reaches a self-scoped door", () => {
  it("no other subject can reach the self CV importer or the self document door, in ANY context", () => {
    // Exhaustive over subject x kind x actor — 90 combinations. An example
    // test would pass while some unlisted combination leaked.
    const leaks: string[] = [];
    for (const subject of SUBJECTS) {
      for (const kind of KINDS) {
        for (const actor of ACTORS) {
          const route = routeFileIntent({ subject, kind, documentTypeSlug: null }, actor);
          if (route.kind !== "capability") continue;
          const selfScoped =
            route.capability === "self_cv_import" || route.capability === "self_document";
          if (selfScoped && subject !== "self") {
            leaks.push(`${subject}/${kind}/${actor.identity} -> ${route.capability}`);
          }
        }
      }
    }
    expect(leaks, "a non-self file reached a self-scoped door").toEqual([]);
  });

  it("an UNSTATED owner always asks — it never defaults to the uploader", () => {
    for (const kind of KINDS) {
      for (const actor of ACTORS) {
        const route = routeFileIntent({ subject: "unstated", kind, documentTypeSlug: null }, actor);
        expect(route.kind, `unstated/${kind}/${actor.identity} did not ask`).toBe("ask_subject");
      }
    }
  });

  it("an organization subject requires an organization context, always", () => {
    for (const kind of KINDS) {
      const route = routeFileIntent(
        { subject: "organization", kind, documentTypeSlug: null },
        { identity: "person", educationWorkspace: false },
      );
      expect(route.kind, `organization/${kind} was served in a personal space`).toBe(
        "needs_organization",
      );
    }
  });

  it("a cohort requires the education capability, not merely a company", () => {
    for (const kind of KINDS) {
      const route = routeFileIntent(
        { subject: "cohort", kind, documentTypeSlug: null },
        { identity: "company", educationWorkspace: false },
      );
      expect(route.kind).toBe("needs_organization");
    }
  });
});

describe("the production sentences, pinned", () => {
  const CASES: ReadonlyArray<readonly [string, FileSubject]> = [
    ["Čia mano CV.", "self"],
    ["Čia kandidato CV.", "another_person"],
    ["Įkeliu 20 kandidatų CV.", "many_people"],
    ["Čia mūsų darbuotojų CV.", "organization"],
    ["Čia mano sertifikatas.", "self"],
    ["Čia kandidato sertifikatas.", "another_person"],
    ["Čia atlikto darbo nuotraukos.", "unstated"],
    ["Čia įmonės darbuotojų Excel.", "organization"],
    ["Čia studentų sąrašas.", "cohort"],
  ];

  for (const [sentence, subject] of CASES) {
    it(`"${sentence}" -> ${subject}`, () => {
      const intent = readFileIntent(sentence);
      expect(intent, "not read as a file offer").not.toBeNull();
      expect(intent!.subject).toBe(subject);
    });
  }

  it("NOT ONE of them reaches the self CV importer unless it says so", () => {
    for (const [sentence, subject] of CASES) {
      const intent = readFileIntent(sentence)!;
      const route = routeFileIntent(intent, { identity: "company", educationWorkspace: true });
      if (subject !== "self") {
        expect(route).not.toMatchObject({ capability: "self_cv_import" });
      }
    }
  });
});

describe("a file OFFER is not a file QUESTION", () => {
  it("the CV read path (slice D) is untouched", () => {
    for (const s of [
      "Noriu pamatyti savo CV",
      "I want to see my CV",
      "Хочу посмотреть своё резюме",
      "rodyk CV",
      "mano CV",
    ]) {
      expect(readFileIntent(s), `"${s}" was captured as a file offer`).toBeNull();
    }
  });
});

describe("no second import system was built", () => {
  const MODULE = read("lib/conversation/file-subject.ts");

  it("the module parses nothing, stores nothing and resolves no person", () => {
    // Checked against what the module DOES, not the words it recognises: the
    // needle lists legitimately contain "xlsx" and ".csv" because those are
    // things a person types. An earlier draft of this assertion scanned for
    // the bare word and failed on its own vocabulary.
    const imports = [...MODULE.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual([
      "@/lib/conversation/document-type-guess",
      "@/lib/conversation/intent-router",
    ]);
    for (const forbidden of [
      "createClient",
      "supabase",
      ".insert(",
      ".update(",
      ".rpc(",
      "FileReader",
      "arrayBuffer",
      "matchPerson",
      "commitImport",
    ]) {
      expect(MODULE, `${forbidden} in a pure routing module`).not.toContain(forbidden);
    }
  });

  it("it reuses the existing document taxonomy rather than restating it", () => {
    expect(MODULE).toContain("guessDocumentType");
  });

  it("every capability it names is an EXISTING door", () => {
    // If one of these modules is ever deleted or renamed, this fails rather
    // than the chat silently offering a door that is not there.
    expect(read("lib/profile/cv-section-import-actions.ts")).toContain(
      "confirmCvWorkHistoryAction",
    );
    expect(read("lib/organization-evidence/import-core.ts")).toContain("commitImport");
    expect(MODULE).toContain("self_cv_import");
    expect(MODULE).toContain("organization_evidence_import");
  });
});

/**
 * THE WIRING, not just the rule.
 *
 * Added after a negative control stayed GREEN: replacing the chat's
 * "whose is it?" branch with the self-CV answer did not fail anything,
 * because every assertion above tests the PURE module and the person only
 * ever meets the chat. A rule nothing renders is not a safeguard.
 */
describe("the chat renders the rule it was given", () => {
  const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");

  function handlerBody(): string {
    const start = CHAT.indexOf("const handleFileIntent = useCallback");
    expect(start, "handleFileIntent must exist").toBeGreaterThan(-1);
    const end = CHAT.indexOf("const handleQuestion = useCallback", start);
    expect(end).toBeGreaterThan(start);
    return CHAT.slice(start, end);
  }

  function branch(name: string): string {
    const body = handlerBody();
    const start = body.indexOf(`case "${name}":`);
    expect(start, `the ${name} branch must exist`).toBeGreaterThan(-1);
    const rest = body.slice(start + 1);
    const next = rest.search(/\n\s+(case "|default:)/);
    return next === -1 ? rest : rest.slice(0, next);
  }

  it("an unstated owner ASKS — it never answers with a self-scoped door", () => {
    const ask = branch("ask_subject");
    expect(ask).toContain("fileAskSubject");
    expect(ask, "the ask branch offers a self door").not.toContain("fileSelfCv");
    expect(ask, "the ask branch offers the CV import chip").not.toMatch(/id: "cv"/);
  });

  it("EVERY not-yet subject keeps its own sentence", () => {
    // Rendering caught this: one line served four situations and told an
    // agency uploading twenty CVs about "another person's CV" — singular,
    // and naming a CV when the file was a certificate.
    const body = handlerBody();
    for (const key of [
      "fileNotYetCohort",
      "fileNotYetSelf",
      "fileNotYetManyPeople",
      "fileNotYetOrganization",
      "fileNotYetOther",
    ]) {
      expect(body, `${key} is not rendered`).toContain(key);
    }
  });

  it("the five not-yet sentences are actually different text, in every locale", () => {
    const KEYS = [
      "fileNotYetCohort",
      "fileNotYetSelf",
      "fileNotYetManyPeople",
      "fileNotYetOrganization",
      "fileNotYetOther",
    ] as const;
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const chat = (
        JSON.parse(read(join("messages", `${locale}.json`))) as {
          conversation: { chat: Record<string, string> };
        }
      ).conversation.chat;
      const values = KEYS.map((k) => {
        const v = chat[k];
        expect(v, `${k} missing in ${locale}`).toBeTruthy();
        return v;
      });
      expect(
        new Set(values).size,
        `${locale} reuses one sentence for several situations`,
      ).toBe(KEYS.length);
    }
  });

  it("the file check runs BEFORE the intent path that got it wrong", () => {
    const file = CHAT.indexOf("const fileIntent = readFileIntent(sent);");
    const intent = CHAT.indexOf("const reading = understand(sent);");
    expect(file).toBeGreaterThan(-1);
    expect(intent).toBeGreaterThan(-1);
    expect(file, "the file subject must be read first").toBeLessThan(intent);
  });

  it("the handler attaches, uploads and dispatches nothing", () => {
    // Executable code only. The comments describe the defect this exists for
    // ("an agency uploading twenty CVs"), and an earlier draft of this
    // assertion failed on its own explanation.
    const body = handlerBody()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const forbidden of [
      "dispatchIntent",
      "prepareAction",
      "openForm(",
      "upload",
      ".insert(",
      ".update(",
    ]) {
      expect(body, `${forbidden} in a routing handler`).not.toContain(forbidden);
    }
  });
});
