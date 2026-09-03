"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Share2 } from "lucide-react";

import { NATIVE_LOCALE_NAMES } from "@/components/marketing/locale-switcher";
import { activeLocales } from "@/lib/i18n/config";
import {
  createAndSendInvitations,
  type CreateInvitationsResult,
  type InvitationSendOutcome,
} from "@/lib/invitations/actions";
import {
  DEFAULT_RELATIONSHIP_SLUG,
  INVITATION_TYPES,
  MAX_EMAILS_PER_ACTION,
  ORG_INVITATION_TYPES,
  RELATIONSHIP_INVITE_CHOICES,
  relationshipChoiceBlocked,
  type InvitationType,
} from "@/lib/invitations/model";

/**
 * THE canonical "Pakviesti" action (core-network area B). One panel, every
 * invitation type; reachable from the network surface and linked from the
 * company workspace / project operations (?invite=1&type=…&org=…&project=…).
 *
 * Honesty rules baked in:
 *  - "Išsiųsta" appears ONLY for a provider-acknowledged send; without a
 *    configured provider the result is the shareable link (copy / native
 *    share) — never a fake sent state;
 *  - invalid addresses are listed, valid ones proceed — one bad address
 *    never cancels the batch; the per-action cap is stated, not silent;
 *  - the link is shown once to the inviter who minted it.
 */
export function InvitePanel({
  locale,
  organizations,
  projects,
  defaultType,
  defaultOrganizationId,
  defaultProjectId,
  defaultRelationshipSlug,
}: {
  locale: string;
  /**
   * `capabilities` are the organization's declared roles (`organization_roles`).
   * They are used ONLY to explain, before the send, why a capacity is not on
   * offer — `create_invitation_v1` re-checks server-side and is the actual
   * enforcement point. Absent (an older caller) reads as "nothing declared",
   * which is the honest fail-closed answer rather than a silent allow.
   */
  organizations: { id: string; name: string; capabilities?: readonly string[] }[];
  projects: { id: string; title: string | null }[];
  defaultType?: string;
  defaultOrganizationId?: string;
  defaultProjectId?: string;
  /** Deep-link preset for the relationship control (`?relationship=student`). */
  defaultRelationshipSlug?: string;
}) {
  const t = useTranslations("network.invite");
  // The ONE localized relationship vocabulary — the same words the CV prints.
  const tRelationships = useTranslations("relationshipTypes");
  /**
   * THE FORM OPENS WHEN SOMEBODY ASKS FOR IT.
   *
   * Eight controls — type, addresses, recipient language, invited name,
   * proposed role, message, organization, project — used to be unrolled on
   * every visit to a page whose job is to show existing relationships. Owner
   * rule for this train: "Forms should open only after an explicit action
   * such as Pakviesti"; and "an empty feature should normally consume only a
   * few lines".
   *
   * A deep link that already names what to invite (`?invite=1&type=…&org=…`,
   * used from the company workspace and project operations) is itself the
   * explicit action, so it still lands on the open form — closing it for
   * those callers would break a real entry point to make a screenshot
   * tidier. Nothing is removed and no state is reset: this is the same panel,
   * behind its own heading.
   */
  const [open, setOpen] = useState(
    Boolean(defaultType || defaultOrganizationId || defaultProjectId),
  );
  const [type, setType] = useState<InvitationType>(
    (INVITATION_TYPES as readonly string[]).includes(defaultType ?? "")
      ? (defaultType as InvitationType)
      : "join_platform",
  );
  const [emails, setEmails] = useState("");
  // The RECIPIENT'S language (V8 W4-B item 6): email subject/body + invite
  // link land in this language. Defaults to the sender's current locale.
  const [recipientLocale, setRecipientLocale] = useState(
    (activeLocales as readonly string[]).includes(locale) ? locale : "lt",
  );
  const [invitedName, setInvitedName] = useState("");
  const [proposedRole, setProposedRole] = useState("");
  const [message, setMessage] = useState("");
  const [organizationId, setOrganizationId] = useState(
    defaultOrganizationId ?? organizations[0]?.id ?? "",
  );
  const [projectId, setProjectId] = useState(
    defaultProjectId ?? projects[0]?.id ?? "",
  );
  // Defaults to the historical relationship, so a sender who ignores this
  // control gets exactly the invitation the product sent before it existed.
  const [relationshipSlug, setRelationshipSlug] = useState<string>(
    // A deep link may name the relationship (`?relationship=student` from the
    // institution's "Invite learners"); anything outside the closed choice
    // list falls back to the historical default.
    defaultRelationshipSlug &&
      RELATIONSHIP_INVITE_CHOICES.some((c) => c.slug === defaultRelationshipSlug)
      ? defaultRelationshipSlug
      : DEFAULT_RELATIONSHIP_SLUG,
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CreateInvitationsResult | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const needsOrg = (ORG_INVITATION_TYPES as readonly string[]).includes(type);
  const needsProject = type === "join_project";

  /**
   * IN WHAT CAPACITY. Only organization-scoped invitations establish a
   * person↔organization relationship, so the question is asked only there;
   * everywhere else the historical default stands and nothing is sent.
   */
  const selectedOrgCapabilities = useMemo(
    () => organizations.find((o) => o.id === organizationId)?.capabilities ?? [],
    [organizations, organizationId],
  );
  /**
   * Every capacity stays VISIBLE even when the organization cannot offer it
   * yet. Hiding `student` from a school that has not declared it trains people
   * produces the worst possible screen — the thing the reader came to do is
   * simply absent, with no way to find out why. Showing it and saying what is
   * missing turns a dead end into the next step.
   */
  const blockedChoice = useMemo(() => {
    const choice = RELATIONSHIP_INVITE_CHOICES.find(
      (c) => c.slug === relationshipSlug,
    );
    return choice ? relationshipChoiceBlocked(choice, selectedOrgCapabilities) : false;
  }, [relationshipSlug, selectedOrgCapabilities]);

  const availableTypes = useMemo(
    () =>
      INVITATION_TYPES.filter((v) => {
        if ((ORG_INVITATION_TYPES as readonly string[]).includes(v)) {
          return organizations.length > 0;
        }
        if (v === "join_project") return projects.length > 0;
        return true;
      }),
    [organizations.length, projects.length],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setResult(null);
    try {
      const r = await createAndSendInvitations({
        emails,
        invitationType: type,
        locale,
        recipientLocale,
        organizationId: needsOrg ? organizationId : null,
        projectId: needsProject ? projectId : null,
        // Only an organization invitation carries a capacity; anywhere else
        // there is no organization for the relationship to be WITH.
        relationshipSlug: needsOrg ? relationshipSlug : null,
        invitedName: invitedName || null,
        proposedRole: proposedRole || null,
        personalMessage: message || null,
      });
      setResult(r);
      if (r.status === "ok" && r.results.some((x) => x.outcome === "sent" || x.outcome === "created")) {
        setEmails("");
      }
    } finally {
      setSending(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
      setTimeout(() => setCopiedLink(null), 2500);
    } catch {
      /* clipboard unavailable — the link stays visible for manual copy */
    }
  }

  async function shareLink(link: string) {
    try {
      if (navigator.share) {
        await navigator.share({ url: link, title: t("shareTitle") });
      } else {
        await copyLink(link);
      }
    } catch {
      /* user cancelled the share sheet */
    }
  }

  return (
    <section
      className="card-border flex flex-col gap-4 p-4"
      data-testid="invite-panel"
    >
      <header className="flex flex-col gap-1">
        {/* Closed, the heading IS the trigger — the panel's own title is
            already the word the owner named for this action ("Pakviesti"), so
            the compact state needs no new string in any locale, and the
            reader sees the same word whether it is open or shut. */}
        {open ? (
          <h2 className="font-display text-lg font-bold text-text-primary">
            {t("title")}
          </h2>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="invite-panel-open"
            className="flex min-h-11 items-center gap-2 self-start rounded-md border border-ink-500 px-3 py-1.5 font-display text-lg font-bold text-text-primary transition-colors hover:border-brand-blue"
          >
            {t("title")}
          </button>
        )}
        <p className="text-xs text-text-secondary">{t("intro")}</p>
      </header>

      {open && (
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("typeLabel")}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as InvitationType)}
            data-testid="invite-type"
            className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
          >
            {availableTypes.map((v) => (
              <option key={v} value={v}>
                {t(`types.${v}`)}
              </option>
            ))}
          </select>
        </label>

        {needsOrg && (
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("organizationLabel")}
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              data-testid="invite-organization"
              className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* IN WHAT CAPACITY — the control that lets an institution connect a
            learner instead of accidentally declaring them an employee. The
            names come from the `relationshipTypes` catalogue, never from the
            slug (invariant I-8). */}
        {needsOrg && (
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("capacityLabel")}
            <select
              value={relationshipSlug}
              onChange={(e) => setRelationshipSlug(e.target.value)}
              data-testid="invite-capacity"
              className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
            >
              {RELATIONSHIP_INVITE_CHOICES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {tRelationships(c.slug)}
                </option>
              ))}
            </select>
            <span className="text-meta text-text-muted">{t("capacityHint")}</span>
            {blockedChoice && (
              <span
                className="text-meta text-state-danger"
                data-testid="invite-capacity-blocked"
              >
                {t("capacityNeedsCapability")}{" "}
                <a
                  href={`/${locale}/dashboard/company`}
                  className="underline hover:text-text-primary"
                  data-testid="invite-capacity-blocked-cta"
                >
                  {t("capacityNeedsCapabilityCta")}
                </a>
              </span>
            )}
          </label>
        )}

        {needsProject && (
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("projectLabel")}
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              data-testid="invite-project"
              className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title ?? t("untitledProject")}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("recipientLanguageLabel")}
          <select
            value={recipientLocale}
            onChange={(e) => setRecipientLocale(e.target.value)}
            data-testid="invite-recipient-language"
            className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
          >
            {activeLocales.map((l) => (
              <option key={l} value={l}>
                {NATIVE_LOCALE_NAMES[l] ?? l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("emailsLabel", { max: MAX_EMAILS_PER_ACTION })}
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={2}
            required
            placeholder={t("emailsPlaceholder")}
            data-testid="invite-emails"
            className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("nameLabel")}
            <input
              value={invitedName}
              onChange={(e) => setInvitedName(e.target.value)}
              maxLength={120}
              data-testid="invite-name"
              className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("roleLabel")}
            <input
              value={proposedRole}
              onChange={(e) => setProposedRole(e.target.value)}
              maxLength={80}
              data-testid="invite-role"
              className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("messageLabel")}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={500}
            data-testid="invite-message"
            className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
          />
        </label>

        <button
          type="submit"
          disabled={sending || emails.trim().length === 0}
          data-testid="invite-submit"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t("sending") : t("send")}
        </button>
      </form>
      )}

      {result && (
        <div
          role="status"
          className="flex flex-col gap-2 text-xs"
          data-testid="invite-result"
        >
          {result.status === "needs-migration" && (
            <p className="text-text-muted">{t("notEnabled")}</p>
          )}
          {result.status === "not-authed" && (
            <p className="text-text-muted">{t("notAuthed")}</p>
          )}
          {result.status === "ok" && (
            <>
              {!result.emailConfigured &&
                result.results.some((r) => r.outcome === "created") && (
                  <p className="text-text-secondary" data-testid="invite-link-mode-note">
                    {t("linkModeNote")}
                  </p>
                )}
              <ul className="flex flex-col gap-1.5">
                {result.results.map((r) => (
                  <ResultRow
                    key={r.email}
                    r={r}
                    t={t}
                    copiedLink={copiedLink}
                    onCopy={copyLink}
                    onShare={shareLink}
                  />
                ))}
              </ul>
              {result.invalid.length > 0 && (
                <p className="text-state-danger" data-testid="invite-invalid">
                  {t("invalidEmails")}: {result.invalid.join(", ")}
                </p>
              )}
              {result.overflow.length > 0 && (
                <p className="text-state-danger" data-testid="invite-overflow">
                  {t("overflowEmails", { max: MAX_EMAILS_PER_ACTION })}:{" "}
                  {result.overflow.join(", ")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ResultRow({
  r,
  t,
  copiedLink,
  onCopy,
  onShare,
}: {
  r: InvitationSendOutcome;
  t: ReturnType<typeof useTranslations>;
  copiedLink: string | null;
  onCopy: (link: string) => void;
  onShare: (link: string) => void;
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-2 rounded-md border border-ink-600 bg-ink-800/30 px-2.5 py-1.5"
      data-testid={`invite-result-${r.outcome}`}
    >
      <span className="min-w-0 break-all text-text-primary">{r.email}</span>
      <span
        className={`font-mono text-meta uppercase tracking-label ${
          r.outcome === "sent"
            ? "text-state-success"
            : r.outcome === "created"
              ? "text-brand-blue"
              : "text-state-danger"
        }`}
      >
        {t(`outcomes.${r.outcome}`)}
      </span>
      {r.inviteLink && (
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onCopy(r.inviteLink as string)}
            data-testid="invite-copy-link"
            className="inline-flex items-center gap-1 rounded border border-ink-500 px-2 py-1 text-meta text-text-secondary hover:border-brand-blue hover:text-text-primary"
          >
            {copiedLink === r.inviteLink ? (
              <Check className="h-3 w-3" aria-hidden />
            ) : (
              <Copy className="h-3 w-3" aria-hidden />
            )}
            {copiedLink === r.inviteLink ? t("copied") : t("copyLink")}
          </button>
          <button
            type="button"
            onClick={() => onShare(r.inviteLink as string)}
            data-testid="invite-share-link"
            className="inline-flex items-center gap-1 rounded border border-ink-500 px-2 py-1 text-meta text-text-secondary hover:border-brand-blue hover:text-text-primary"
          >
            <Share2 className="h-3 w-3" aria-hidden />
            {t("share")}
          </button>
        </span>
      )}
    </li>
  );
}
