#!/usr/bin/env node
// Every static chunk a public page links must load under BOTH spellings of its
// path: as the page links it, and with every reserved character percent-encoded.
//
// Why (production defect, 2026-11-12): Next links the marketing layout chunk as
// `/_next/static/chunks/app/%5Blocale%5D/(marketing)/layout-<hash>.js`. A browser
// behind a URL-normalising proxy (a corporate security gateway) asks for
// `.../%5Blocale%5D/%28marketing%29/layout-<hash>.js`. That spelling answered
// 404, the chunk failed to load and the whole home page became the error screen.
// Nothing measured it, because every probe asked for the spelling in the HTML.
//
//   node .github/scripts/encoded-chunk-probe.mjs [origin] [page ...]
//
// Anonymous GETs of public pages and public static files only: no secret, no
// sign-in, no write. Exit 1 on any non-200, on a chunk that is not JavaScript,
// or when no route-group chunk was found at all (a blind probe is a failure).

const origin = (process.argv[2] ?? "https://labourmarket.ai").replace(/\/+$/, "");
const pages = process.argv.length > 3 ? process.argv.slice(3) : ["/lt", "/en", "/de", "/lt/auth/login"];
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36";

/** Percent-encode everything a strict normaliser encodes; `encodeURIComponent` leaves `( ) ! ' * ~`. */
export function fullyEncodePath(path) {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(decodeURIComponent(segment)).replace(
        /[()!'*~]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

/** A route-group segment `(name)`, in either spelling. */
export function isRouteGroupChunk(path) {
  return /\/(\(|%28)[^/]+(\)|%29)\//i.test(path);
}

export function chunkPathsIn(html) {
  return [...new Set(html.match(/\/_next\/static\/chunks\/[^"'\\<> ]+\.js/g) ?? [])];
}

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
      const body = await res.text();
      // A dropped request or an edge 5xx is the path's fault, not the spelling's: ask again.
      if (res.status >= 500 && attempt < 3) continue;
      return { status: res.status, type: res.headers.get("content-type") ?? "-", bytes: body.length, body };
    } catch (error) {
      if (attempt >= 3) return { status: 0, type: String(error?.name ?? "error"), bytes: 0, body: "" };
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

async function main() {
  const chunks = new Set();
  let failed = 0;
  for (const page of pages) {
    const res = await get(origin + page);
    if (res.status !== 200) {
      console.log(`FAIL page ${page} -> ${res.status}`);
      failed++;
      continue;
    }
    for (const c of chunkPathsIn(res.body)) chunks.add(c);
  }
  const groups = [...chunks].filter(isRouteGroupChunk).sort();
  console.log(`pages: ${pages.length}, chunks linked: ${chunks.size}, route-group chunks: ${groups.length}`);
  if (groups.length === 0) {
    console.log("FAIL no route-group chunk found: the probe would prove nothing");
    failed++;
  }
  for (const linked of groups) {
    const encoded = fullyEncodePath(linked);
    for (const [form, path] of [["as-linked", linked], ["encoded", encoded]]) {
      const res = await get(origin + path);
      const ok = res.status === 200 && /javascript/i.test(res.type) && res.bytes > 0;
      console.log(`${ok ? "ok  " : "FAIL"} ${form.padEnd(9)} ${res.status} ${res.type.split(";")[0]} ${path}`);
      if (!ok) failed++;
    }
  }
  if (failed > 0) {
    console.log(`\n${failed} failure(s): a visitor behind a URL-normalising proxy gets the error screen.`);
    process.exit(1);
  }
  console.log("\nevery route-group chunk loads under both spellings");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
