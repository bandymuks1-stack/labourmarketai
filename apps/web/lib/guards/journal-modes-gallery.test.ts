import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getModuleRoute } from "@/lib/dashboard/dashboard-module-registry";

/**
 * WAGON 8 guard (CR train areas 14/15/16) — journal entry modes + project
 * work gallery + photo-first reports.
 *
 * Pins the duplication watchlist rules from the CR map:
 *   - modes are PRESETS over the ONE journal composer (no second composer,
 *     no second save path);
 *   - the gallery READS the existing journal_entry_photos evidence (no second
 *     photo system, no new bucket, private signed URLs only);
 *   - the gallery migration only mirrors the journal_entries manager
 *     boundary (manages_organization via the entry's engagement context) —
 *     never a broader grant;
 *   - honest states everywhere (empty gallery, unavailable previews,
 *     photo-first note) with lt/en/ru copy.
 */
const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const composer = read("components/app/journal-entry-composer.tsx");
const galleryLib = read("lib/journal/project-gallery.ts");
const galleryComp = read("components/app/project-work-gallery.tsx");
const stadiumPage = read("app/[locale]/dashboard/projects/[id]/page.tsx");
const migration = readFileSync(
  join(
    REPO,
    "supabase",
    "migrations",
    "20260705250000_journal_photos_project_gallery.sql",
  ),
  "utf8",
);

describe("area 14 — entry modes are presets over the ONE composer", () => {
  it("all three mode presets render from the single composer", () => {
    expect(composer).toMatch(/data-testid="journal-mode-picker"/);
    // The buttons render from the COMPOSER_MODES list via a template testid —
    // assert the list carries exactly the three presets and the testid wiring.
    expect(composer).toMatch(/journal-mode-\$\{m\}/);
    expect(composer).toMatch(
      /COMPOSER_MODES[\s\S]{0,80}"quick",\s*\n\s*"structured",\s*\n\s*"photo",/,
    );
  });
  it("modes keep the single save spine (create/supersede only)", () => {
    // The composer still imports exactly the existing actions — a mode never
    // introduces a new write path.
    expect(composer).toMatch(/createJournalEntry,\s*\n\s*supersedeJournalEntry/);
    expect(composer).not.toMatch(/createPhotoReport|createQuickEntry|createStructuredEntry/);
  });
  it("no second composer component exists", () => {
    for (const forbidden of [
      "components/app/journal-photo-composer.tsx",
      "components/app/journal-quick-composer.tsx",
      "components/app/journal-structured-composer.tsx",
    ]) {
      expect(existsSync(join(ROOT, forbidden)), forbidden).toBe(false);
    }
  });
  it("photo-first mode states the honest ordering (photo uploads after save)", () => {
    expect(composer).toMatch(/data-testid="journal-photo-first-note"/);
    // The after-save upload contract is untouched.
    expect(composer).toMatch(/uploadJournalEntryPhoto\(\s*result\.entryId/);
  });
  it("mode picker is hidden in edit mode (an edit continues the entry's flow)", () => {
    expect(composer).toMatch(/\{!editingEntry && \(\s*\/\/ WAGON 8/);
  });
});

describe("areas 15/16 — gallery reads the EXISTING photo evidence", () => {
  it("gallery lib reads journal_entry_photos joined to journal_entries only", () => {
    expect(galleryLib).toContain('from("journal_entry_photos")');
    expect(galleryLib).toContain("journal_entries!inner");
    expect(galleryLib).not.toMatch(/create table|insert|upsert|\.delete\(/i);
  });
  it("private bucket + signed URLs only — no public URL, no new bucket", () => {
    expect(galleryLib).toContain('from("journal-entry-photos")');
    expect(galleryLib).toContain("createSignedUrls");
    expect(galleryLib).not.toContain("getPublicUrl");
    // No bucket string other than the existing one.
    const buckets = galleryLib.match(/storage\s*\.from\("([^"]+)"\)/g) ?? [];
    for (const b of buckets) {
      expect(b).toContain("journal-entry-photos");
    }
  });
  it("gallery renders on the manager-only project page with honest states", () => {
    expect(stadiumPage).toContain("ProjectWorkGallery");
    expect(galleryComp).toMatch(/data-testid="project-gallery-empty"/);
    expect(galleryComp).toMatch(/data-testid="project-gallery-previews-unavailable"/);
    expect(galleryComp).toMatch(/data-testid="project-gallery-photo-no-preview"/);
    // Never a broken image: the img renders only from a minted signed URL.
    expect(galleryComp).toMatch(/\{p\.signedUrl \? \(/);
  });
});

describe("gallery migration mirrors the journal_entries manager boundary", () => {
  it("adds SELECT-only policies gated by manages_organization via the entry's engagement context", () => {
    expect(migration).toContain("journal_entry_photos_select_org_manager");
    expect(migration).toContain('"journal-entry-photos org manager select"');
    expect(migration).toMatch(/manages_organization\(ec\.organization_id\)/);
    expect(migration).toMatch(/engagement_contexts ec on ec\.id = je\.engagement_context_id/);
  });
  it("widens nothing else: no insert/update/delete policy, no grant, no new table/bucket", () => {
    expect(migration).not.toMatch(/for (insert|update|delete)/i);
    expect(migration).not.toMatch(/^\s*grant /im);
    expect(migration).not.toMatch(/create table/i);
    expect(migration).not.toMatch(/insert into storage\.buckets/i);
  });
});

// ── Owner browser-smoke finding (2026-07-05): "nesuprantu kur yra foto
// report" — the photo report must be DISCOVERABLE as a journal mode, its
// helper copy must say where it lives and where the photos surface, and the
// command finder must answer the natural terms. One photo system only.
describe("photo report discoverability (owner smoke finding)", () => {
  const lt = () => JSON.parse(read("messages/lt/journal.json"));
  const ltBase = () => JSON.parse(read("messages/lt.json"));
  it("LT mode labels are the owner-specified three", () => {
    const modes = lt().modes;
    expect(modes.quick).toBe("Greitas įrašas");
    expect(modes.structured).toBe("Struktūruota ataskaita");
    expect(modes.photo).toBe("Foto ataskaita");
  });
  it("LT photo-mode helper says it IS a journal entry and names the gallery", () => {
    const hint = lt().modes.photoHint as string;
    expect(hint).toContain("Foto ataskaita yra darbo įrašas su nuotraukomis");
    expect(hint).toContain("Darbo žurnale");
    expect(hint).toContain("darbų galerijoje");
  });
  it("photo field label offers 'paversti foto ataskaita' on any entry", () => {
    expect(lt().photo.label).toContain("paversti foto ataskaita");
  });
  it("gallery context + empty state explain the journal source (LT)", () => {
    const g = ltBase().projectOps.stadium.gallery;
    expect(g.context).toContain("foto ataskaitos iš darbo žurnalo įrašų");
    expect(g.context).toContain("susietų su šiuo projektu");
    expect(g.empty).toContain("Foto ataskaitų dar nėra");
    expect(g.empty).toContain("Darbo žurnale");
  });
  it("command finder routes the natural terms to the right surfaces", () => {
    // Normalize line endings so the pin survives CRLF checkouts.
    const registry = read("lib/navigation/command-registry.ts").replace(/\r/g, "");
    // photo_report → journal (worker); work_gallery → projects (company).
    // Control room PR B/PR G: module-backed entries resolve through the ONE
    // module registry (getModuleRoute), so neither route can drift — the
    // projects surface became a dashboard module in PR G.
    expect(registry).toContain('id: "photo_report",\n    route: getModuleRoute("journal")');
    expect(registry).toMatch(
      /id: "work_gallery",[\s\S]{0,400}?route: getModuleRoute\("projects"\)/,
    );
    expect(getModuleRoute("projects")).toBe("/dashboard/projects");
    for (const term of [
      '"foto ataskaita"',
      '"foto report"',
      '"darbų nuotraukos"',
      '"galerija"',
      '"darbų galerija"',
    ]) {
      expect(registry, `finder term ${term}`).toContain(term);
    }
  });
  it("still ONE photo system: no separate photo-report route exists", () => {
    for (const forbidden of [
      "app/[locale]/dashboard/photo-report",
      "app/[locale]/dashboard/photo-reports",
      "app/[locale]/dashboard/foto-ataskaita",
    ]) {
      expect(existsSync(join(ROOT, forbidden)), forbidden).toBe(false);
    }
    // Production UX repair v2 (F13): /dashboard/gallery IS allowed — but it
    // must stay a READ-ONLY projection of the journal's own photo rows
    // (getPersonalGallery), never a second upload system. Photos are added
    // only through journal entries.
    const galleryPage = readFileSync(
      join(ROOT, "app/[locale]/dashboard/gallery/page.tsx"),
      "utf8",
    );
    expect(galleryPage).toMatch(/getPersonalGallery/);
    expect(galleryPage).not.toMatch(/<input[^>]*type="file"|upload.*action|FormData/i);
  });
  it("no fake verification claim in the new copy (photos never auto-verify work)", () => {
    const hint = (lt().modes.photoHint as string) + JSON.stringify(ltBase().projectOps.stadium.gallery);
    expect(hint).not.toMatch(/automatiškai (?:patvirtina|įrodo)|patvirtina darbą/i);
    // The gallery source note still states photos are never auto-assessed.
    expect(ltBase().projectOps.stadium.gallery.sourceNote).toContain("nevertinamos automatiškai");
  });
});

describe("i18n copy present (lt/en/ru)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: journal.modes preset keys exist`, () => {
      const modes = JSON.parse(read(`messages/${loc}/journal.json`)).modes;
      for (const k of [
        "title",
        "quick",
        "quickHint",
        "structured",
        "structuredHint",
        "photo",
        "photoHint",
        "photoFirstNote",
      ]) {
        expect(
          typeof modes?.[k] === "string" && modes[k].length > 0,
          `${loc} modes.${k}`,
        ).toBe(true);
      }
    });
    it(`${loc}: projectOps.stadium.gallery keys exist`, () => {
      const gallery = JSON.parse(read(`messages/${loc}.json`)).projectOps
        ?.stadium?.gallery;
      for (const k of [
        "title",
        "countLabel",
        "context",
        "empty",
        "previewsUnavailable",
        "previewUnavailableOne",
        "photoAlt",
        "unknownWorker",
        "sourceNote",
      ]) {
        expect(
          typeof gallery?.[k] === "string" && gallery[k].length > 0,
          `${loc} gallery.${k}`,
        ).toBe(true);
      }
    });
  }
});

// ── Issue #1689, defect G (production HUMAN_ACCEPTANCE FAIL): a worker
// uploaded a work photo in the journal, then asked the chat to show it and
// was told the CV was empty. The chat now SHOWS the stored photo — through
// the ONE personal-gallery read, never a second photo system.
describe("the chat shows a stored photo back through the ONE gallery read", () => {
  const adapter = read("lib/conversation/evidence-photos.ts");
  const strip = read("components/app/conversation/chat-photo-strip.tsx");
  const chat = read("components/app/conversation/chat/conversation-chat.tsx");

  it("the chat adapter is a thin layer over getPersonalGallery — no second photo query, no new table, no new bucket", () => {
    expect(adapter).toContain('from "@/lib/journal/personal-gallery"');
    expect(adapter).toContain("getPersonalGallery()");
    expect(adapter).not.toContain('from("journal_entry_photos")');
    expect(adapter).not.toContain("storage");
    expect(adapter).not.toMatch(/create table|insert|upsert|\.delete\(/i);
  });

  it("the adapter names the honest states and never fabricates a photo", () => {
    for (const kind of ['kind: "ok"', 'kind: "none"', 'kind: "no-worker"']) {
      expect(adapter).toContain(kind);
    }
    expect(adapter).toContain("previewsUnavailable");
  });

  it("the strip renders an <img> ONLY from a minted signed URL, with an honest no-preview tile", () => {
    expect(strip).toMatch(/\{p\.signedUrl \? \(/);
    expect(strip).toMatch(/src=\{p\.signedUrl\}/);
    expect(strip).toMatch(/data-testid="chat-photo-strip-no-preview"/);
    expect(strip).toMatch(/data-testid="chat-photo-strip-previews-unavailable"/);
    expect(strip).not.toContain("getPublicUrl");
  });

  it("the chat handler embeds the strip and keeps the gallery one chip away", () => {
    expect(chat).toMatch(/evidencePhotos: \(\) => startEvidencePhotos\(\)/);
    expect(chat).toMatch(/readRecentPhotosForChat\(\{ limit: 3 \}\)/);
    expect(chat).toMatch(/<ChatPhotoStrip photos=\{res\.photos\}/);
    expect(chat).toContain('id: "link:/dashboard/gallery"');
  });

  it("the copy never says 'nothing uploaded' for a read that found none, and never claims verification", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"]) {
      const chatCopy = JSON.parse(read(`messages/${loc}.json`)).conversation.chat as Record<string, string>;
      for (const k of ["photosRecent", "photosNone", "photosNoWorker", "photosUnavailable", "photosPreviewUnavailable", "photoNoPreview", "photoAlt", "chipGallery"]) {
        expect(typeof chatCopy[k], `${loc}.conversation.chat.${k}`).toBe("string");
        expect(chatCopy[k].trim().length, `${loc}.conversation.chat.${k}`).toBeGreaterThan(0);
        expect(chatCopy[k], `${loc}.${k} must not claim verification`).not.toMatch(/verified|patvirtint|verifiziert|geverifieerd|подтвержд/i);
      }
      expect(chatCopy.photosNone, `${loc}.photosNone`).not.toMatch(/nothing uploaded|nieko neįkelta|ничего не загружено/i);
      // The failed-read copy says it could not CHECK.
      expect(chatCopy.photosUnavailable, `${loc}.photosUnavailable`).toMatch(/nepavyko patikrinti|could not check|не удалось проверить|kon niet controleren|konnte nicht prüfen/i);
    }
  });
});
