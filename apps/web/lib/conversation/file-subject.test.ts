import { describe, expect, it } from "vitest";

import {
  readFileIntent,
  routeFileIntent,
  type FileActorContext,
} from "@/lib/conversation/file-subject";
import { classifyIntent } from "@/lib/conversation/intent-router";
import { understand } from "@/lib/conversation/utterance-understanding";

const PERSON: FileActorContext = { identity: "person", educationWorkspace: false };
const COMPANY: FileActorContext = { identity: "company", educationWorkspace: false };
const INSTITUTION: FileActorContext = { identity: "company", educationWorkspace: true };

const intentOf = (s: string) => {
  const i = readFileIntent(s);
  expect(i, `"${s}" was not read as a file at all`).not.toBeNull();
  return i!;
};

describe("MY CV", () => {
  for (const s of ["Čia mano CV.", "Here is my CV", "Вот моё резюме", "Dit is mijn cv", "Hier ist mein Lebenslauf"]) {
    it(`"${s}" is the speaker's own CV`, () => {
      const i = intentOf(s);
      expect(i.subject).toBe("self");
      expect(i.kind).toBe("cv");
      expect(routeFileIntent(i, PERSON)).toEqual({
        kind: "capability",
        capability: "self_cv_import",
      });
    });
  }
});

describe("CANDIDATE CV — never the uploader's own", () => {
  for (const s of [
    "Čia kandidato CV.",
    "Here is a candidate CV",
    "Вот резюме кандидата",
  ]) {
    it(`"${s}" is another person, and has no door yet`, () => {
      const i = intentOf(s);
      expect(i.subject).toBe("another_person");
      const route = routeFileIntent(i, COMPANY);
      expect(route.kind, "a candidate CV must never reach the self importer").toBe(
        "unavailable",
      );
      expect(route).not.toMatchObject({ capability: "self_cv_import" });
    });
  }
});

describe("MULTIPLE CANDIDATE CVS — the exact production defect", () => {
  for (const s of [
    "Įkeliu 20 kandidatų CV.",
    "I am uploading 20 candidate CVs",
    "Загружаю 20 резюме кандидатов",
  ]) {
    it(`"${s}" is many people, and never the uploader's own history`, () => {
      // What the router did before, and still does — the fix is a layer above.
      const i = intentOf(s);
      expect(i.subject).toBe("many_people");
      const route = routeFileIntent(i, COMPANY);
      expect(route.kind).toBe("unavailable");
      expect(route).not.toMatchObject({ capability: "self_cv_import" });
    });
  }

  it("a plural sentence carrying MANO is still about the candidates", () => {
    // "my candidates' CVs" — the possessive is about ownership of the
    // relationship, not of the professional history.
    const i = intentOf("Įkeliu mano kandidatų CV");
    expect(i.subject).toBe("many_people");
    expect(routeFileIntent(i, COMPANY).kind).toBe("unavailable");
  });
});

describe("MY CERTIFICATE / CANDIDATE CERTIFICATE", () => {
  it("my certificate reaches the self document door", () => {
    const i = intentOf("Čia mano sertifikatas");
    expect(i.subject).toBe("self");
    expect(i.kind).toBe("document");
    expect(i.documentTypeSlug).toBe("professional_certificate");
    expect(routeFileIntent(i, PERSON)).toEqual({
      kind: "capability",
      capability: "self_document",
    });
  });

  it("a candidate's certificate does NOT", () => {
    const i = intentOf("Čia kandidato sertifikatas");
    expect(i.subject).toBe("another_person");
    expect(i.kind).toBe("document");
    expect(routeFileIntent(i, COMPANY).kind).toBe("unavailable");
  });
});

describe("WORK EVIDENCE", () => {
  it("photos of finished work are evidence, and an organization has a door", () => {
    const i = intentOf("Čia mūsų atlikto darbo nuotraukos");
    expect(i.kind).toBe("work_evidence");
    expect(i.subject).toBe("organization");
    expect(routeFileIntent(i, COMPANY)).toEqual({
      kind: "capability",
      capability: "organization_evidence_import",
    });
  });

  it("a person's own work photos are understood but have no door yet", () => {
    const i = intentOf("Čia mano atlikto darbo nuotraukos");
    expect(i.kind).toBe("work_evidence");
    expect(i.subject).toBe("self");
    expect(routeFileIntent(i, PERSON)).toEqual({ kind: "unavailable", subject: "self" });
  });
});

describe("ORGANIZATION WORKFORCE FILE", () => {
  it("an employee spreadsheet reaches the organization evidence import", () => {
    const i = intentOf("Čia įmonės darbuotojų Excel");
    expect(i.kind).toBe("workforce_table");
    expect(i.subject).toBe("organization");
    expect(routeFileIntent(i, COMPANY)).toEqual({
      kind: "capability",
      capability: "organization_evidence_import",
    });
  });
});

describe("STUDENT / COHORT FILE", () => {
  it("an institution is understood, and told honestly that no file import exists", () => {
    const i = intentOf("Čia studentų sąrašas");
    expect(i.subject).toBe("cohort");
    expect(routeFileIntent(i, INSTITUTION)).toEqual({ kind: "unavailable", subject: "cohort" });
  });
});

describe("AMBIGUOUS FILE SUBJECT — ask, never assume", () => {
  for (const s of ["Čia CV", "Here is a CV", "Вот резюме"]) {
    it(`"${s}" asks whose it is`, () => {
      const i = intentOf(s);
      expect(i.subject, "an unowned file must not default to self").toBe("unstated");
      expect(routeFileIntent(i, PERSON)).toEqual({ kind: "ask_subject" });
      expect(routeFileIntent(i, COMPANY)).toEqual({ kind: "ask_subject" });
    });
  }
});

describe("UNAUTHORIZED SUBJECT — no organization context, no write", () => {
  it("a person in their personal space cannot file an organization's workforce", () => {
    const i = intentOf("Čia įmonės darbuotojų Excel");
    expect(routeFileIntent(i, PERSON)).toEqual({ kind: "needs_organization" });
  });

  it("a company without the education capability cannot file a cohort", () => {
    const i = intentOf("Čia studentų sąrašas");
    expect(routeFileIntent(i, COMPANY)).toEqual({ kind: "needs_organization" });
  });
});

describe("a file offer is not a file question — D and the read path survive", () => {
  for (const s of [
    "Noriu pamatyti savo CV",
    "I want to see my CV",
    "Хочу посмотреть своё резюме",
    "rodyk CV",
    "mano CV",
    "Kur mano CV",
  ]) {
    it(`"${s}" is NOT read as handing a file over`, () => {
      expect(readFileIntent(s), `"${s}" was captured as a file offer`).toBeNull();
    });
  }

  it("the CV read still classifies as cv-view", () => {
    expect(classifyIntent("Noriu pamatyti savo CV").intent).toBe("cv-view");
    const u = understand("Noriu pamatyti savo CV");
    expect(u.kind).toBe("intent");
  });
});

describe("nothing else is captured", () => {
  for (const s of [
    "Ieškau elektriko darbo Švedijoje",
    "Mums reikia 8 pastolininkų Geteborge",
    "Ką galiu padaryti šioje paskyroje?",
    "Perjunk į įmonę",
    "Baltic Staffing Group",
    "Turime 20 laisvų darbuotojų ir ieškome projektų",
  ]) {
    it(`"${s}" is not a file offer`, () => {
      expect(readFileIntent(s)).toBeNull();
    });
  }
});

describe("a PAST upload form is a readback, not a deposit (issue #1689, defect G)", () => {
  // "įkeltą" / "uploaded" / "загруженное" / "hochgeladene" / "geüploade" —
  // the person asks about a file already handed over. The English form used
  // to trip the DEPOSIT list on the bare stem "upload" and ASK whose file it
  // was; every one of these must fall through to the router, where the
  // `evidence-photos` rule answers.
  for (const s of [
    "Parodyk įkeltą nuotrauką ar tikrai išsisaugojo",
    "Parodyk įkeltą nuotrauką",
    "ką tik įkeltas failas",
    "show the photo I just uploaded",
    "Show my uploaded photo",
    "покажи загруженное фото",
    "zeig das hochgeladene Foto",
    "laat de geüploade foto zien",
  ]) {
    it(`"${s}" is NOT read as handing a file over`, () => {
      expect(readFileIntent(s), `"${s}" was captured as a file offer`).toBeNull();
      expect(classifyIntent(s).intent).toBe("evidence-photos");
    });
  }

  it("a genuine deposit that also uses a past form is still a deposit", () => {
    // "čia" says the file is being handed over now; the participle does not
    // undo that.
    const i = readFileIntent("Čia mano įkeltas CV");
    expect(i).not.toBeNull();
    expect(i!.subject).toBe("self");
    expect(i!.kind).toBe("cv");
  });

  it("NEGATIVE CONTROL: the present deposit forms are untouched", () => {
    expect(readFileIntent("I am uploading 20 candidate CVs")).not.toBeNull();
    expect(readFileIntent("Įkeliu 20 kandidatų CV.")).not.toBeNull();
    expect(readFileIntent("Загружаю 20 резюме кандидатов")).not.toBeNull();
  });
});
