import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import type { DomainCaller } from "@/lib/domain/caller";
import { listRosterPeople } from "@/lib/organization-evidence/import-core";
import { resolveEvidenceOrganization } from "@/lib/organization-evidence/evidence-org-context";

/**
 * THE ROSTER, READ BACK.
 *
 * `organization_people` could be written and never read. The import panel
 * showed an in-memory receipt that died on the next page load, and the only
 * consumer of `listRosterPeople` anywhere in the app built `<select>` options
 * inside the EVIDENCE importer — and only after a staged evidence session
 * existed. So a manager could bring forty people in and, one refresh later,
 * have no way to see that anything had happened.
 *
 * This is the missing read, over the SAME core function the MCP capability
 * calls, under the caller's own RLS. Nothing new is written, nothing new is
 * authorized: `listRosterPeople` resolves the organization from the caller's
 * own memberships and the `organization_people` policies decide the rest.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a profile list. A roster person is not a
 * platform identity, so `link_state` is rendered exactly as stored and the
 * unlinked case is stated in words — an organization vouching for a name is
 * not the same as a person who has agreed to anything. No journal, no skills,
 * no CV, no e-mail: this section shows what the organization itself recorded
 * and nothing the person owns.
 *
 * A failed read is never an empty roster (§12 / SEP-7). Each refusal class
 * keeps its own message and travels as `data-reason`.
 */

const SECTION = "flex flex-col gap-3";
const HEADING = "font-display text-lg font-bold tracking-tight text-text-primary";

/** How many names one page of the roster shows. The core caps at 500. */
const ROSTER_LIMIT = 200;

/**
 * The consent lifecycle as the column's CHECK carries it. A value outside this
 * set is a state this UI has never been taught, so it falls back to the most
 * CONSERVATIVE reading — `unlinked`, which claims nothing about the person —
 * rather than to a missing key or to a stronger claim than the data supports.
 */
const LINK_STATES = new Set(["unlinked", "link_proposed", "linked"]);

function linkStateKey(raw: string | null): string {
  return raw && LINK_STATES.has(raw) ? raw : "unlinked";
}

export async function OrganizationRosterSection({
  locale,
}: {
  readonly locale: string;
}) {
  const t = await getTranslations("organizationRoster");
  // The relationship vocabulary has ONE home. Reusing it here means the roster
  // and the evidence importer can never disagree about what a word means.
  const tRel = await getTranslations("evidenceImport.relationship");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const shell = (children: React.ReactNode) => (
    <div
      className="flex w-full flex-col gap-4"
      data-testid="organization-roster-section"
      id="organization-roster"
    >
      <header className="flex flex-col gap-1">
        <h2 className={HEADING}>{t("title")}</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      </header>
      {children}
    </div>
  );

  const notice = (
    reason: string,
    options?: readonly { readonly id: string; readonly name: string }[],
  ) =>
    shell(
      <section
        data-testid="organization-roster-notice"
        data-reason={reason}
        className="flex flex-col gap-2 rounded-lg border border-state-warning/40 bg-state-warning/5 px-4 py-3"
      >
        <p className="text-sm leading-relaxed text-text-primary">
          {t(`context.${reason}` as never)}
        </p>
        {options && options.length > 0 ? (
          <ul className="flex flex-col gap-1 text-xs text-text-secondary">
            {options.map((o) => (
              <li key={o.id}>{o.name}</li>
            ))}
          </ul>
        ) : null}
      </section>,
    );

  if (!user) return notice("unauthenticated");
  const caller: DomainCaller = { supabase, userId: user.id, locale };

  // ACTING CONTEXT FIRST, exactly as the evidence importer does it: the
  // organization and the authority over it are settled before any row is
  // read, so a personal workspace can never be shown a roster at all.
  const org = await resolveEvidenceOrganization(caller, null);
  if (!org.ok) {
    const reason =
      org.reason === "personal-workspace"
        ? "personalWorkspace"
        : org.reason === "no-organization"
          ? "noOrganization"
          : org.reason === "not-a-member"
            ? "notAMember"
            : org.reason === "choice-required"
              ? "chooseOrganization"
              : org.reason === "not-authorized"
                ? "notAuthorized"
                : org.reason === "needs-migration"
                  ? "needsMigration"
                  : "unavailable";
    return notice(reason, org.options);
  }

  const res = await listRosterPeople(caller, {
    organizationId: org.organizationId,
    limit: ROSTER_LIMIT,
  });
  if (res.kind !== "ok") {
    // A store that is not provisioned, a refusal, and a broken read are three
    // different statements. None of them is "this organization has nobody".
    const reason =
      res.kind === "needs-migration"
        ? "needsMigration"
        : res.kind === "choice-required"
          ? "chooseOrganization"
          : res.kind === "not-authorized"
            ? "notAuthorized"
            : "unavailable";
    return notice(reason, res.kind === "choice-required" ? res.options : undefined);
  }

  const actingFor = (
    <p className="text-xs text-text-muted" data-testid="organization-roster-acting-for">
      {t("actingFor")}:{" "}
      <span className="text-text-secondary">{org.organizationName}</span>
    </p>
  );

  if (res.people.length === 0) {
    // HONEST EMPTY, and it is genuinely empty: the read succeeded. It says so,
    // and points at the one panel that fills it rather than dead-ending.
    return shell(
      <Card compact>
        <section className={SECTION} data-testid="organization-roster-empty">
          {actingFor}
          <p className="text-sm leading-relaxed text-text-secondary">{t("empty")}</p>
          <a
            href="#people-import"
            className="w-fit text-sm font-medium text-brand-blue hover:underline"
            data-testid="organization-roster-import-link"
          >
            {t("emptyAction")} →
          </a>
        </section>
      </Card>,
    );
  }

  return shell(
    <Card compact>
      <section className={SECTION}>
        {actingFor}
        <p className="text-sm text-text-secondary" data-testid="organization-roster-count">
          {t("count", { count: res.people.length })}
          {res.people.length >= ROSTER_LIMIT ? ` ${t("truncated", { limit: ROSTER_LIMIT })}` : ""}
        </p>
        <ul className="flex flex-col divide-y divide-ink-700" data-testid="organization-roster-list">
          {res.people.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
              data-testid={`organization-roster-person-${p.id}`}
            >
              <span className="text-sm text-text-primary">{p.displayName}</span>
              {p.relationshipKind ? (
                <span className="text-xs text-text-secondary">
                  {/* An unknown slug renders as itself rather than as a blank:
                      a relationship the vocabulary does not carry is a gap to
                      see, not one to hide. */}
                  {tRel.has(p.relationshipKind)
                    ? tRel(p.relationshipKind)
                    : p.relationshipKind}
                </span>
              ) : null}
              {p.externalRef ? (
                <span className="font-mono text-meta text-text-muted">{p.externalRef}</span>
              ) : null}
              <span
                className="text-meta uppercase tracking-wide text-text-muted"
                data-link-state={linkStateKey(p.linkState)}
              >
                {t(`linkState.${linkStateKey(p.linkState)}` as never)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed text-text-muted" data-testid="organization-roster-meaning">
          {t("meaning")}
        </p>
      </section>
    </Card>,
  );
}
