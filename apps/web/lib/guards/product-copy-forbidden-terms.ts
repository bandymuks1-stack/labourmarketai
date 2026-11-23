/**
 * THE ONE LIST of terms banned from product copy (doctrine §18, full-product-overview
 * plan §17). Read by the message-file guard (`product-copy-forbidden-terms.test.ts`)
 * and by the production UX measurement (`tests/e2e/prod-ux-metrics.spec.ts`), which
 * looks for the same terms in the text a page actually renders. Never a second copy.
 *
 * Unicode lookarounds instead of \b — \b silently fails next to LT diacritics
 * (ą ę ė į š ų ū ž), so "demo" beside them would slip through a \b guard.
 * "demokratija" stays allowed (no "demonstr" stem); "demonstracija" and its
 * cognates do NOT — that whitelist let the landing ship a "Demonstration"
 * badge over the exact framing the ban exists for. Same class, same rule.
 */
export const FORBIDDEN_PRODUCT_COPY: ReadonlyArray<{ readonly re: RegExp; readonly why: string }> = [
  {
    re: /(?<![\p{L}\p{N}_])demos?(?![\p{L}\p{N}_])/iu,
    why: 'word "demo" is banned in product copy — use "preview" / "concept" / "not live yet"',
  },
  {
    re: /(?<![\p{L}\p{N}_])demonstr\p{L}*(?![\p{L}\p{N}_])/iu,
    why: '"demonstration" framing (EN/LT/NL/DE demonstr-*) is the same banned class as "demo" — use "preview" / "concept"',
  },
  {
    re: /демонстр\p{L}*/iu,
    why: 'RU "демонстрация" framing is the same banned class as "demo" — use "предпросмотр" / "концепция"',
  },
  {
    re: /trial\s+access/i,
    why: "§18: no trial-access layer over real features",
  },
  {
    re: /bandom[a-zą-ž]*\s+(prieig|versij|režim)/iu,
    why: "§18: no LT trial-version/access framing over real features",
  },
  {
    re: /demo\s*[-_]?\s*(mode|data|account|rež[a-zą-ž]*|duomen[a-zą-ž]*|paskyr[a-zą-ž]*)/iu,
    why: "no demo-mode/demo-data framing in any locale",
  },
];
