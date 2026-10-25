import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PROFILE_DISCOVERABILITY_DEFAULT_NOTICE_V1,
  PROFILE_DISCOVERABILITY_V1,
  consentTextHash,
} from "@/lib/privacy/consent-definitions";
import { employerVisibilityOf } from "@/lib/privacy/employer-visibility";
import { discoverabilityScreen } from "@/lib/privacy/discoverability-screen";
import { deriveTodayDoors, unknownTodayDoors } from "@/lib/today/today-model";

/**
 * FREE WORKERS ARE DISCOVERABLE BY DEFAULT (owner decision 2026-10-25) — the
 * invariants that make it lawful and keep every earlier choice.
 *
 *  - ONE ledger, no second store: the default is DERIVED from the person's own
 *    ledger facts (no decision row + the recorded notice + the owner switch +
 *    free worker + not a learner); nothing is written on anyone's behalf.
 *  - A switch-off (withdrawn) or a recorded "not now" (declined) is never
 *    switched on by any default; NOT_ASKED is never a refusal.
 *  - The notice is versioned + hashed like a consent text and pinned by the
 *    migration; the switch ships OFF.
 *  - Discovery stays anonymous; contacts, journal, documents, external links
 *    are untouched (no RLS change in the migration).
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIG = readFileSync(
  join(REPO, "supabase", "migrations", "20261025100000_free_worker_visibility_default_v1.sql"),
  "utf8",
);
const DOWN_PATH = join(REPO, "supabase", "rollbacks", "20261025100000_free_worker_visibility_default_v1.down.sql");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const fn = (name: string) => {
  const start = MIG.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThan(0);
  return MIG.slice(start, MIG.indexOf("$function$;", start));
};

describe("the migration — one ledger, the default derived, the switch OFF", () => {
  it("pins EXACTLY the registry's notice version and hash", () => {
    const def = PROFILE_DISCOVERABILITY_DEFAULT_NOTICE_V1;
    expect(MIG).toContain(`default_notice_version = '${def.version}'`);
    expect(MIG).toContain(`default_notice_hash = '${consentTextHash(def)}'`);
  });

  it("ships the owner switch OFF: nothing sets default_on_from / default_basis", () => {
    const updates = MIG.match(/^update public\.privacy_consent_purposes[\s\S]*?;/gim) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toMatch(/default_on_from|default_basis/);
  });

  it("writes rows ONLY from the person's own session: notice, not-now, withdrawal — never a grant or a default", () => {
    const inserts = MIG.match(/insert into public\.privacy_consent_events/g) ?? [];
    expect(inserts).toHaveLength(3);
    expect(fn("record_visibility_default_notice_v1")).toContain("'notice_shown'");
    expect(fn("decline_profile_discoverability_v1")).toContain("'declined'");
    expect(fn("withdraw_profile_discoverability_consent")).toContain("'withdrawn'");
    expect(MIG).not.toMatch(/'default_enabled'|values[^;]*'granted'/);
    for (const name of ["record_visibility_default_notice_v1", "decline_profile_discoverability_v1", "withdraw_profile_discoverability_consent"]) {
      expect(fn(name), name).toContain("v_uid uuid := auth.uid();");
    }
  });

  it("the default needs: no decision, the switch armed, the notice on record, a free worker, not a learner", () => {
    const st = fn("discoverability_state_v1");
    expect(st).toContain("e.action in ('granted', 'withdrawn', 'declined')");
    expect(st).toMatch(/d_action is null and default_on_from is not null and notice_at is not null\s+and default_from <= now\(\) and is_worker and not employed and not learner/);
    expect(st).toContain("'discoverable', not deletion_open and (");
    expect(fn("worker_profile_discoverable")).toContain("discoverability_state_v1(p_profile)");
  });

  it("an earlier decision always wins: the notice is never recorded over it", () => {
    expect(fn("record_visibility_default_notice_v1")).toMatch(
      /e\.action in \('granted', 'withdrawn', 'declined'\)[\s\S]{0,80}\)\s+then\s+return jsonb_build_object\('ok', true, 'recorded', false, 'reason', 'decision_on_record'\)/,
    );
  });

  it("employed = an active employee/manager engagement with an organization or an active roster row; learner = student/intern or current education", () => {
    const emp = fn("worker_visibility_employed_v1");
    expect(emp).toContain("ec.organization_id is not null");
    expect(emp).toContain("ec.relationship_slug in ('employee', 'manager')");
    expect(emp).toContain("from public.company_workers cw");
    const learner = fn("worker_visibility_learner_v1");
    expect(learner).toContain("ec.relationship_slug in ('student', 'intern')");
    expect(learner).toContain("we.is_current");
  });

  it("the withdrawal ledger locale is the account language, never the constant 'lt'", () => {
    const w = fn("withdraw_profile_discoverability_consent");
    expect(w).toContain("from public.profiles p where p.id = v_uid");
    expect(w).not.toMatch(/'lt', p_source\)/);
  });

  it("changes no RLS policy and no discovery projection", () => {
    const code = MIG.replace(/--[^\n]*/g, "");
    expect(code).not.toMatch(/create policy|drop policy|alter policy/i);
    expect(code).not.toMatch(/list_discoverable_worker_(profiles|ids)_v1/);
    expect(code).not.toMatch(/grant [a-z, ]+ to (anon|public)\b/i);
  });

  it("ships a rollback that refuses while the switch is armed or ledger facts exist", () => {
    expect(existsSync(DOWN_PATH)).toBe(true);
    const down = readFileSync(DOWN_PATH, "utf8");
    expect(down).toContain("rollback refused: the default is armed");
    expect(down).toContain("rollback refused: declined / notice_shown ledger rows exist");
  });

  it("the version is unique among the migrations", () => {
    const files = readdirSync(join(REPO, "supabase", "migrations")).filter((f) => f.startsWith("20261025100000"));
    expect(files).toEqual(["20261025100000_free_worker_visibility_default_v1.sql"]);
  });
});

describe("the notice text — information, not consent", () => {
  it("is NOT in the consent registry and names the basis, the objection and the controller in every locale", () => {
    const def = PROFILE_DISCOVERABILITY_DEFAULT_NOTICE_V1;
    for (const [locale, t] of Object.entries(def.texts)) {
      expect(t.freedom, locale).toMatch(/6/);
      expect(t.controller, locale).toBe(PROFILE_DISCOVERABILITY_V1.texts[locale as keyof typeof def.texts].controller);
      for (const v of Object.values(t)) expect(v, locale).toMatch(/\S/);
    }
    expect(def.version).not.toBe(PROFILE_DISCOVERABILITY_V1.version);
  });
});

describe("the app — the default reads ON, the notice is recorded only on screen", () => {
  it("a default in force is ON everywhere; a running notice period is not yet", () => {
    expect(employerVisibilityOf({ kind: "ok", status: "default_on" })).toBe("on");
    expect(employerVisibilityOf({ kind: "ok", status: "default_pending" })).toBe("off");
    expect(discoverabilityScreen({ status: "default_on", confirmed: null })).toBe("granted");
    expect(discoverabilityScreen({ status: "default_pending", confirmed: null })).toBe("pending");
    // A switch-off in this session wins over a stale default read.
    expect(discoverabilityScreen({ status: "default_on", confirmed: "off" })).toBe("choice");
  });

  it("only the consent component records the notice, from an effect guarded by the notice being on screen", () => {
    const CONSENT = read("components/app/discoverability-consent.tsx");
    expect(CONSENT).toContain(
      "const noticeShown = st.kind === \"ok\" && st.noticeDue === true && notice !== null && confirmed === null;",
    );
    expect(CONSENT).toMatch(/if \(!noticeShown \|\| noticeRecorded\.current\) return;[\s\S]{0,120}recordVisibilityDefaultNotice\(/);
    // The notice screen offers the switch-off right away and grants nothing.
    const noticeScreen = CONSENT.slice(CONSENT.indexOf('data-testid="discoverability-notice"'), CONSENT.indexOf("const screen = discoverabilityScreen"));
    expect(noticeScreen).toContain("{withdrawButton}");
    expect(noticeScreen).not.toMatch(/onGrant|discoverability-grant/);
    for (const rel of [
      "components/app/profile-hub-overview.tsx",
      "components/app/home/home-employer-visibility.tsx",
      "app/[locale]/onboarding/page.tsx",
      "app/[locale]/dashboard/privacy/page.tsx",
      "lib/conversation/employer-visibility-chat.ts",
    ]) {
      expect(read(rel), rel).not.toMatch(/recordVisibilityDefaultNotice|record_visibility_default_notice_v1/);
    }
  });

  it("every door hands the component the registry's notice", () => {
    expect(read("components/app/profile-hub-overview.tsx")).toContain("notice={defaultVisibilityNotice(locale)}");
    expect(read("app/[locale]/dashboard/privacy/page.tsx")).toContain("notice={defaultVisibilityNotice(locale)}");
    expect(read("lib/conversation/employer-visibility-chat.ts")).toContain("notice: defaultVisibilityNotice(locale),");
  });

  it("a failed write re-reads the server and shows its truth (never a guess)", () => {
    const CONSENT = read("components/app/discoverability-consent.tsx");
    expect(CONSENT).toMatch(/async function reconcile\(\)[\s\S]{0,200}getMyDiscoverabilityState\(\)[\s\S]{0,120}setLive\(fresh\);\s+setConfirmed\(null\);/);
    const failures = CONSENT.match(/setPhase\("error"\);\s+await reconcile\(\);/g) ?? [];
    expect(failures).toHaveLength(2);
  });

  it('"not now" is recorded as a decision (never mistaken for never asked)', () => {
    const CONSENT = read("components/app/discoverability-consent.tsx");
    const decline = CONSENT.split('data-testid="discoverability-decline"')[0].split("onClick=").pop() ?? "";
    expect(decline).toContain('setPhase("declined")');
    expect(decline).toContain("declineProfileDiscoverability({ locale, source })");
  });
});

describe("the privacy policy and copy say the same thing in all six active locales", () => {
  for (const locale of ["lt", "en", "ru", "nl", "de", "pl"]) {
    it(`${locale}: legitimate interest + objection in the policy; the default notes exist`, () => {
      const m = JSON.parse(read(`messages/${locale}.json`));
      const sections = m.legal.privacy.sections;
      expect(sections[4].items[1], locale).toMatch(/6/);
      expect(sections[4].items[1], locale).not.toMatch(/NOT visible|NEmatomas|НЕ виден|NICHT sichtbar|NIET zichtbaar|NIE jest widoczny/);
      expect(sections[7].items[2].length, locale).toBeGreaterThan(80);
      expect(m.privacyConsent.switch.defaultOnNote, locale).toMatch(/\S/);
      expect(m.privacyConsent.switch.defaultPendingNote, locale).toContain("{date}");
      expect(m.privacyConsent.history.action.declined, locale).toMatch(/\S/);
      expect(m.privacyConsent.history.action.notice_shown, locale).toMatch(/\S/);
      expect(m.todayScreen.home.open.verifyEmail, locale).toMatch(/\S/);
    });
  }

  it("the legitimate-interests assessment exists and covers the three tests, the exclusions and the objection", () => {
    const lia = readFileSync(
      join(REPO, "docs", "legal", "gdpr-2026-10-15", "internal", "lia-free-worker-discoverability-v1.md"),
      "utf8",
    );
    for (const heading of ["Purpose test", "Necessity test", "Balancing test", "Safeguards", "Data-subject rights", "Residual risks"]) {
      expect(lia, heading).toContain(heading);
    }
    expect(lia).toMatch(/Learners/);
    expect(lia).toMatch(/Art\. 21/);
  });
});

describe("the home never says a read failed when only the mailbox is unproven", () => {
  it("an unproven mailbox is a door to the proof, not an unknown counter", () => {
    const attention = { offers: 0, invitations: 0, unread: { count: 0, onlyId: null }, invitationsMailboxUnproven: true };
    expect(unknownTodayDoors(attention)).toEqual([]);
    expect(deriveTodayDoors(attention)).toEqual([{ kind: "verifyEmail", href: "/dashboard/network" }]);
  });

  it("the Today loader keeps the account-keyed invitations and flags the mailbox", () => {
    const SERVER = read("lib/today/today-server.ts");
    expect(SERVER).toContain('invitations?.status === "ok" || invitations?.status === "email_unverified" ? invitations.total : null');
    expect(SERVER).toContain('invitationsMailboxUnproven: invitations?.status === "email_unverified"');
  });
});
