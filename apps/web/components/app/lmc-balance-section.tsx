import { getTranslations } from "next-intl/server";

import { lmcCommerceEnabled } from "@/lib/billing/lmc-flags";
import { formatUtcDate } from "@/lib/time/display";
import {
  LMC_UNIT_LABEL,
  readOwnLmcAccount,
  type LmcAccountView,
  type LmcMovement,
} from "@/lib/lmc/lmc-account";

/**
 * The ONE place a person can see their LMC.
 *
 * The ledger has been correct and unreachable at the same time: every monetary
 * invariant proven on production, and no screen anywhere showing a balance. This
 * is the projection that closes that — a server component reading the canonical
 * view under the caller's own RLS, rendering three things in the first viewport
 * and deferring the rest:
 *
 *   BALANCE  ·  WHAT CHANGED MOST RECENTLY  ·  WHAT TO DO, IF ANYTHING
 *
 * THREE STATES, AND THEY ARE NOT THE SAME NUMBER.
 *   ready        — a real balance, from `lmc_account_balances`.
 *   no_account   — nothing has ever happened. The ordinary state for almost
 *                  everyone, said plainly instead of dressed as "0".
 *   unavailable  — the read FAILED. It shows that it failed. It does NOT show a
 *                  zero, because a balance a user cannot be told is not a
 *                  balance of zero — the same distinction #1314 drew for roles.
 *
 * NO CLIENT ARITHMETIC. The figures come from the database view that sums
 * spendable lot remainders, which is the arithmetic `lmc_spend_v1` itself
 * enforces. This component formats; it never computes a balance.
 *
 * NO INVENTED COMMERCE. Top-up is gated by `lmc_settings` flags that are
 * `owner_only` and false, so there is no top-up button here — a control that
 * cannot work is worse than a sentence explaining why. The honest line is
 * rendered instead, and it will become a real action the day the owner opens
 * the flow.
 */

/**
 * The transaction kinds this surface has a NAME for.
 *
 * The ledger's `kind` is a closed CHECK today, but it has been widened twice
 * already and will be again. A `t(`kind.${kind}`)` on a kind the catalogue does
 * not carry throws in next-intl, so a future migration would take the whole
 * balance screen down for anyone holding one of the new rows. This is the
 * closed set, and anything outside it degrades to a truthful generic label
 * rather than an error page.
 */
const NAMED_KINDS: ReadonlySet<string> = new Set([
  "purchased",
  "promotional_signup",
  "promotional_activity",
  "admin_grant",
  "referral_reward",
  "spend",
  "expiry",
  "reversal",
  "refund_reversal",
  "chargeback_reversal",
  "spend_compensation",
]);

/** 1 LMC = 1 EUR of internal platform credit; storage is LMC-cents (100 = 1). */
function formatLmc(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Dates go through the canonical UTC formatter, never a bare
 * `Intl.DateTimeFormat`.
 *
 * The product model is storage=UTC, display=UTC, localized by locale, and an
 * omitted `timeZone` silently formats in the AMBIENT zone — the server process
 * here. That is invisible on Vercel (which runs UTC) and wrong everywhere else,
 * which is precisely why `lib/time/display.ts` exists and why the W12 ratchet
 * fails any construction that does not use it. On a money ledger a date that
 * slides by a day is not cosmetic: it is the day a charge appears to have
 * happened.
 */
function formatDate(iso: string, locale: string): string {
  return formatUtcDate(iso, locale, { dateStyle: "medium" }) ?? iso;
}

function MovementRow({
  movement,
  locale,
  kindLabel,
}: {
  movement: LmcMovement;
  locale: string;
  kindLabel: string;
}) {
  const sign = movement.direction === "credit" ? "+" : "−";
  return (
    <li
      className="flex items-start justify-between gap-3 border-t border-border-subtle py-2 first:border-t-0"
      data-testid="lmc-movement"
      data-kind={movement.kind}
      data-direction={movement.direction}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-text-primary">{kindLabel}</span>
        {/* The ledger's OWN stored reason, verbatim. Never a rewritten,
            friendlier version of why money moved. */}
        <span className="truncate text-meta text-text-muted">
          {movement.reason} · {formatDate(movement.createdAt, locale)}
        </span>
      </span>
      <span
        className={
          "shrink-0 font-mono text-sm " +
          (movement.direction === "credit"
            ? "text-state-success"
            : "text-text-secondary")
        }
      >
        {sign}
        {formatLmc(movement.amountCents, locale)}
      </span>
    </li>
  );
}

export async function LmcBalanceSection({ locale }: { locale: string }) {
  const t = await getTranslations("lmc");
  const kindLabel = (kind: string) =>
    NAMED_KINDS.has(kind) ? t(`kind.${kind}`) : t("kind.other");
  const account: LmcAccountView = await readOwnLmcAccount();

  const shell = (children: React.ReactNode, state: string) => (
    <section
      className="card-border p-5"
      id="lmc"
      data-testid="lmc-balance-section"
      data-state={state}
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("title")}
      </p>
      {children}
    </section>
  );

  if (account.state === "unavailable") {
    // A failed read, said as a failed read. No number is shown, because there
    // is no number to show.
    return shell(
      <p
        className="mt-2 text-sm leading-relaxed text-state-warning"
        data-testid="lmc-unavailable"
        data-reason={account.reason}
      >
        {t("unavailable")}
      </p>,
      "unavailable",
    );
  }

  if (account.state === "no_account") {
    return shell(
      <p
        className="mt-2 text-sm leading-relaxed text-text-secondary"
        data-testid="lmc-no-account"
      >
        {t("noAccount")}
      </p>,
      "no_account",
    );
  }

  const latest = account.movements[0];

  return shell(
    <>
      {/* BALANCE — the first thing, and the biggest. */}
      <p className="mt-2 flex items-baseline gap-2">
        <span
          className="font-display text-3xl font-bold tracking-tightest text-text-primary"
          data-testid="lmc-available"
          data-cents={account.availableCents}
        >
          {formatLmc(account.availableCents, locale)}
        </span>
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {LMC_UNIT_LABEL}
        </span>
      </p>

      {/* The breakdown only appears when it says something. A person holding
          only purchased credit does not need a line telling them they hold no
          promotional credit. */}
      {(account.purchasedCents > 0 || account.promotionalCents > 0) && (
        <p className="mt-1 text-meta text-text-muted" data-testid="lmc-breakdown">
          {t("breakdown", {
            purchased: formatLmc(account.purchasedCents, locale),
            promotional: formatLmc(account.promotionalCents, locale),
          })}
        </p>
      )}

      {/* Expired value is surfaced rather than quietly subtracted: a balance
          that shrank on its own is the thing people write in about. */}
      {account.expiredRemainderCents > 0 && (
        <p
          className="mt-1 text-meta text-text-muted"
          data-testid="lmc-expired"
        >
          {t("expired", {
            amount: formatLmc(account.expiredRemainderCents, locale),
          })}
        </p>
      )}

      {/* WHAT CHANGED — one line, the most recent real movement. */}
      {latest ? (
        <p className="mt-3 text-sm text-text-secondary" data-testid="lmc-latest">
          {t("latest", {
            kind: kindLabel(latest.kind),
            amount: formatLmc(latest.amountCents, locale),
            when: formatDate(latest.createdAt, locale),
          })}
        </p>
      ) : (
        <p className="mt-3 text-sm text-text-muted" data-testid="lmc-no-movements">
          {t("noMovements")}
        </p>
      )}

      {/* WHAT TO DO — honest, because top-up is owner-gated and closed. This is
          a sentence, not a button that cannot work. */}
      {!lmcCommerceEnabled() && (
        <p className="mt-3 text-meta leading-relaxed text-text-muted" data-testid="lmc-topup-state">
          {t("topUpClosed")}
        </p>
      )}

      {/* DETAIL — collapsed, because the balance is the answer and the history
          is the follow-up question. */}
      {account.movements.length > 0 && (
        <details className="group mt-4" data-testid="lmc-history">
          <summary className="cursor-pointer list-none py-2 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="transition-transform group-open:rotate-90">
                ›
              </span>
              {t("historyTitle")}
            </span>
          </summary>
          <ul className="mt-1 flex flex-col">
            {account.movements.map((m) => (
              <MovementRow
                key={m.id}
                movement={m}
                locale={locale}
                kindLabel={kindLabel(m.kind)}
              />
            ))}
          </ul>
        </details>
      )}
    </>,
    "ready",
  );
}
