import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";
import { INTENT_REGISTRY } from "./intent-registry";
import { authorizeDispatch } from "./dispatch-core";
import { getConversationAction } from "./action-registry";
import type { Role } from "@/lib/auth/actions";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * REAL PRODUCTION FAILURE (2026-09-04). The first real recruiter, in the
 * agency workspace, typed "noriu pakviesti klientą" and got the generic
 * worker fallback ("Galiu padėti su CV, profiliu ir darbo pasiūlymais…") plus
 * employer navigation chips. Three layers had failed at once: the router had
 * no agency vocabulary; the fallback was worker copy whatever the workspace;
 * and the registered agency actions required the legacy `agency` role that a
 * Direction A agency (a company of type staffing_agency) never holds.
 *
 * These are the sentences that MUST route, in the five routed locales, plus
 * the negative controls that keep the older intents where they were.
 */
const MUST_ROUTE: ReadonlyArray<readonly [string, string]> = [
  // ── invite a client (the real sentence + its variants) ───────────────────
  ["noriu pakviesti klientą", "invite-client"],
  ["noriu pakviesti klienta", "invite-client"], // no diacritics
  ["pakviesk klientą", "invite-client"],
  ["pridėti klientą", "invite-client"],
  ["noriu prijungti įmonę kaip klientą", "invite-client"],
  ["invite a client", "invite-client"],
  ["add a client company", "invite-client"],
  ["пригласить клиента", "invite-client"],
  ["добавить клиента", "invite-client"],
  ["Kunden einladen", "invite-client"],
  ["einen neuen Kunden hinzufügen", "invite-client"],
  ["klant uitnodigen", "invite-client"],
  ["een klant toevoegen", "invite-client"],
  // ── invite a candidate to the roster ─────────────────────────────────────
  ["pakviesk darbuotoją į komandą", "invite-candidate"],
  ["noriu pakviesti kandidatą", "invite-candidate"],
  ["pridėti darbuotoją", "invite-candidate"],
  ["invite a worker to my roster", "invite-candidate"],
  ["пригласить работника", "invite-candidate"],
  ["Mitarbeiter einladen", "invite-candidate"],
  ["medewerker uitnodigen", "invite-candidate"],
  // ── client demand ────────────────────────────────────────────────────────
  ["parodyk kliento poreikį", "client-demand"],
  ["kokias užklausas pasidalino klientai", "client-demand"],
  ["show me the client requests", "client-demand"],
  ["what did the client share", "client-demand"],
  ["запрос клиента", "client-demand"],
  ["Kundenanfrage anzeigen", "client-demand"],
  ["aanvraag van de klant", "client-demand"],
  // ── propose a candidate ──────────────────────────────────────────────────
  ["pasiūlyk kandidatą", "propose-candidate"],
  ["noriu pasiūlyti darbuotoją šiam poreikiui", "propose-candidate"],
  ["propose a candidate", "propose-candidate"],
  ["предложить кандидата", "propose-candidate"],
  ["Kandidaten vorschlagen", "propose-candidate"],
  ["kandidaat voorstellen", "propose-candidate"],
  // ── proposal status ──────────────────────────────────────────────────────
  ["pasiūlymų būsena", "proposal-status"],
  ["kaip sekasi mano pasiūlymams", "proposal-status"],
  ["proposal status", "proposal-status"],
  ["статус предложений", "proposal-status"],
  ["Stand der Vorschläge", "proposal-status"],
  ["status van mijn voorstellen", "proposal-status"],
  // ── student / institution (route-class) ──────────────────────────────────
  ["parodyk mano mokymosi kompasą", "learning-compass"],
  ["show my learning compass", "learning-compass"],
  ["pakviesk studentą", "invite-student"],
  ["invite a learner", "invite-student"],
  ["пригласить студента", "invite-student"],
  ["sukurk programą", "programmes"],
  ["create a cohort", "programmes"],
  ["kokios praktikos man tinka", "opportunities"],
  ["show internships for me", "opportunities"],
];

const NEGATIVE_CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ["reikia darbuotojų", "need-workers"],
  ["parodyk kandidatus", "candidates"],
  ["ką man siūlo", "offers"],
  ["surask man darbą Nyderlanduose", "find-work"],
  ["sukurk įmonę", "create-organization"],
  ["kas susidomėjo mano poreikiu?", "interest-inbox"],
];

describe("agency vocabulary routes (real recruiter pilot, 2026-09-04)", () => {
  for (const [sentence, intent] of MUST_ROUTE) {
    it(`"${sentence}" → ${intent}`, () => {
      expect(classifyIntent(sentence).intent).toBe(intent);
    });
  }
  for (const [sentence, intent] of NEGATIVE_CONTROLS) {
    it(`negative control: "${sentence}" stays ${intent}`, () => {
      expect(classifyIntent(sentence).intent).toBe(intent);
    });
  }
  it("every routed agency/student intent has a registry row", () => {
    for (const intent of [
      "invite-client",
      "invite-candidate",
      "client-demand",
      "propose-candidate",
      "proposal-status",
      "learning-compass",
      "invite-student",
      "programmes",
    ] as const) {
      expect(INTENT_REGISTRY[intent]).toBeDefined();
    }
  });
});

describe("agency actions are authorized for a Direction A agency (company role)", () => {
  const held = (roles: Role[]) => new Set<Role>(roles);
  for (const id of ["agency.invite-client", "agency.propose-candidate", "company.invite-worker"]) {
    it(`${id}: a company-role account passes the conversation gate`, () => {
      const descriptor = getConversationAction(id);
      expect(descriptor).toBeDefined();
      expect(
        authorizeDispatch({ descriptor, heldRoles: held(["company"]), executable: true }),
      ).toEqual({ ok: true });
    });
    it(`${id}: a worker-only account is refused`, () => {
      const descriptor = getConversationAction(id);
      expect(
        authorizeDispatch({ descriptor, heldRoles: held(["worker"]), executable: true }),
      ).toEqual({ ok: false, code: "not_authorized" });
    });
  }
  it("the SQL side stays the authority: the registry never widens beyond company/agency", () => {
    for (const id of ["agency.invite-client", "agency.propose-candidate", "company.invite-worker"]) {
      const roles = getConversationAction(id)!.allowedRoles;
      expect([...roles].sort()).toEqual(["agency", "company"]);
    }
  });
});

describe("the not-understood answer follows the workspace, never worker copy for a company", () => {
  const CHAT = readFileSync(
    join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"),
    "utf8",
  );
  const PAGE = readFileSync(
    join(__dirname, "..", "..", "app", "[locale]", "dashboard", "page.tsx"),
    "utf8",
  );
  it("the fallback is chosen by identity + agency/education workspace", () => {
    expect(CHAT).toMatch(/const fallbackText =[\s\S]{0,400}labels\.fallbackAgency[\s\S]{0,200}labels\.fallbackEducation[\s\S]{0,200}labels\.fallbackCompany[\s\S]{0,100}labels\.fallback;/);
    // No answer path reaches for the worker copy directly any more — every
    // "not understood" goes through the context-aware value.
    const direct = CHAT.match(/labels\.fallback\b(?!Company|Agency|Education)/g) ?? [];
    expect(direct.length).toBe(1); // the one read inside the selector itself
  });
  it("the server resolves the agency workspace and the chat receives it", () => {
    expect(PAGE).toMatch(/loadAgencyWorkspaceFlag\(\)/);
    expect(PAGE).toMatch(/agencyWorkspace=\{agencyWorkspace\}/);
    expect(CHAT).toMatch(/agencyWorkspace = false/);
  });
  it("the agency sentences reach the canonical dispatcher, not a parallel path", () => {
    expect(CHAT).toMatch(/inviteClient: \(\) => startAgencyInvite\("agency\.invite-client", text\)/);
    expect(CHAT).toMatch(/inviteCandidate: \(\) => startAgencyInvite\("company\.invite-worker", text\)/);
    expect(CHAT).toMatch(/loadAgencyBridgeForChat\(\)/);
    expect(CHAT).not.toMatch(/from\("agency_client_connections"\)/);
  });
  it("the chat measures recognition and the missing-data question", () => {
    expect(CHAT).toMatch(/FUNNEL_EVENTS\.chatIntentRecognized/);
    expect(CHAT).toMatch(/FUNNEL_EVENTS\.chatIntentUnrecognized/);
    expect(CHAT).toMatch(/FUNNEL_EVENTS\.chatMissingDataAsked/);
    // Never the sentence itself.
    expect(CHAT).not.toMatch(/trackFunnel\([^)]*\btext\b/);
  });
});
