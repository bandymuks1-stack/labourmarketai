import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PLAYER_IDENTITY_VARIANTS } from "@/lib/identity/player-identity";
import { SEMANTIC_CONCEPTS } from "@/components/app/semantic-icon";
import {
  buildHistoricalCalendar,
  dayFormation,
  decisionCount,
  fieldFormationWeek,
  fieldWeekView,
  objectMonogram,
  objectStreams,
  personDaySeries,
  personObjectLanes,
  personRing,
} from "@/lib/organization-evidence/import-visual";

import { projectionOfTheSession, renderWorkspace } from "./history-client-boundary.test";

/**
 * HISTORICAL REALITY → LIVING PERSON / TEAM / COMPANY, VISUAL-FIRST — the
 * owner's LABOURMARKET_VISUAL_FIRST constitution (2026-09-16, §BL) pinned
 * structurally, on top of the post-#1748 living-model rules. The premium
 * player identity is ONE identity across the product; the field is a
 * projection, not a team; the calendar is a calendar; the workspace is one
 * screen with modes, not a document; nothing here is a second model.
 *
 * Not pixel tests: every assertion is a structural fact a file can prove.
 */

const dir = path.resolve(__dirname, "../..");
/** Line endings normalised: a Windows checkout is CRLF, CI is LF, the anchors are one. */
const read = (p: string) => readFileSync(path.join(dir, p), "utf8").replace(/\r\n/g, "\n");
/** The code without its comments — the comments NAME what is forbidden. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const card = read("components/app/historical-player-card.tsx");
const board = read("components/app/historical-field-board.tsx");
const reconstruction = read("components/app/evidence-import-reconstruction.tsx");
const workspace = read("components/app/historical/historical-workspace.tsx");
const overview = read("components/app/historical/historical-overview.tsx");
const calendar = read("components/app/historical/historical-calendar.tsx");
const objects = read("components/app/historical/historical-objects.tsx");
const attention = read("components/app/historical/historical-attention.tsx");
const visual = read("lib/organization-evidence/import-visual.ts");
const projections = read("lib/organization-evidence/import-projections.ts");
const semantics = read("lib/organization-evidence/time-semantics.ts");
const section = read("components/app/evidence-import-section.tsx");
const VIEWS = { card, board, workspace, overview, calendar, objects, attention };
const lt = JSON.parse(read("messages/lt.json")) as { evidenceImport: { reconstruction: Record<string, unknown> } };
const ltR = lt.evidenceImport.reconstruction;

// ── ONE workspace, modes replace — never a sequence of sections ─────────────

describe("the reconstruction is ONE workspace whose modes REPLACE the centre", () => {
  it("the server reconstruction renders the workspace and nothing sequential", () => {
    expect(reconstruction).toMatch(/<HistoricalWorkspace/);
    for (const id of ["evidence-people", "evidence-places", "evidence-calendar", "evidence-company", "evidence-impact"]) {
      expect(reconstruction, id).not.toContain(`data-testid="${id}"`);
    }
    expect(reconstruction).not.toMatch(/<Card|<table|<HistoricalPlayerCard|<HistoricalFieldBoard/);
  });
  it("every mode is conditional on ONE mode state; the six modes exist", () => {
    for (const m of ["overview", "people", "field", "objects", "calendar", "attention"]) {
      expect(workspace, m).toMatch(new RegExp(`\\{mode === "${m}" && \\(`));
      expect(workspace, m).toContain(`data-testid={\`historical-mode-\${m.id}\`}`);
      expect(ltR.mode && (ltR.mode as Record<string, string>)[m], `lt mode.${m}`).toBeTruthy();
    }
    expect(workspace).toMatch(/role="tablist"/);
    expect(workspace).toMatch(/aria-selected=\{active\}/);
  });
  it("the selection (week · person · object · day) is ONE state shared by the modes", () => {
    expect(workspace).toMatch(/const \[week, setWeek\]/);
    expect(workspace).toMatch(/const \[person, setPerson\]/);
    expect(workspace).toMatch(/const \[object, setObject\]/);
    expect(workspace).toMatch(/const \[day, setDay\]/);
    expect(workspace).toMatch(/selection=\{\{ week, person, object, day \}\}/);
    expect(workspace).toMatch(/personFilter=\{person\}\s+objectFilter=\{object\}/);
    // the day chosen on the calendar is the day lit on the field, and both open the SAME day formation
    expect(workspace).toMatch(/\(mode === "calendar" \|\| mode === "field"\) && day/);
  });
  it("the default view is visual, not prose: no paragraph of explanation on the overview or the workspace chrome", () => {
    expect(code(overview)).not.toMatch(/<p\b/);
    expect(code(workspace)).not.toMatch(/leading-relaxed/);
    // implementation vocabulary never reaches the normal user
    for (const [name, src] of Object.entries(VIEWS)) {
      const strings = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1].trim()).filter(Boolean);
      for (const s of strings) expect(s, name).not.toMatch(/provenance|canonical|derived|ledger|RLS|RPC/i);
    }
  });
  it("the rendered default fits the real session: overview only, seven COMPACT identities, no expanded card, no object report", () => {
    const html = renderWorkspace(projectionOfTheSession(), "lt");
    expect(html.match(/data-testid="historical-player-compact"/g)?.length).toBe(7);
    expect(html).not.toContain('data-testid="historical-player-card"');
    expect(html).not.toContain('data-testid="historical-object"');
    expect(html).not.toContain('data-testid="historical-calendar-table"');
    expect(html).not.toContain('data-testid="evidence-time-row"');
    expect(html).not.toContain("<table");
    expect(html).toContain('data-testid="historical-footprint-map"');
    expect(html).toContain('data-testid="evidence-company-unknown"');
  });
});

// ── the premium player identity ─────────────────────────────────────────────

describe("the premium player identity is the ONE person identity, in its history-card variant", () => {
  it("is a registered variant of the canonical identity, compact and focus from one file", () => {
    expect(PLAYER_IDENTITY_VARIANTS).toContain("history-card");
    expect(card.match(/data-identity-variant="history-card"/g)?.length).toBe(2);
    expect(card).toMatch(/export function HistoricalPlayerCompact/);
    expect(card).toMatch(/export function HistoricalPlayerCard/);
    // the identity tile is the ONE mark (historical-marks), which is the canonical foundation
    expect(card).toMatch(/<PersonMark\s+label=\{name\}/);
    expect(card).not.toMatch(/rounded-full[^"]*font-display[^"]*font-semibold/);
    const marks = read("components/app/historical/historical-marks.tsx");
    expect(marks).toMatch(/playerInitials\(label\)/);
    expect(marks).toMatch(/PLAYER_IDENTITY_AVATAR_BORDER/);
    expect(marks).toMatch(/PLAYER_IDENTITY_FALLBACK_SURFACE/);
    // the evidence ring is drawn from the period's real weeks and their evidenced days — never from a score
    expect(marks).toMatch(/function EvidenceRing/);
    expect(marks).toMatch(/seg\.days \/ 7/);
    expect(card).toMatch(/ring=\{ring\}/);
    const ring = personRing(projectionOfTheSession().calendar, "Person A");
    expect(ring.length).toBe(9);
    expect(ring.every((r) => r.days >= 0 && r.days <= 7)).toBe(true);
    expect(personRing(projectionOfTheSession().calendar, "Person G").every((r) => r.days === 0)).toBe(true);
    // the daily rhythm is the person's dated days with DAILY hours only; an unknown day stays null
    const days = personDaySeries(projectionOfTheSession().calendar, "Person A");
    expect(days.length).toBe(40);
    expect(days.every((d) => d.hours === null || d.hours < 24)).toBe(true);
    expect(card).toMatch(/data-testid="historical-player-rhythm"/);
    expect(card).toMatch(/strokeDasharray/);
  });
  it("never a synthesised face, never an image from nowhere — on any view", () => {
    for (const [name, src] of Object.entries(VIEWS)) {
      expect(src, name).not.toMatch(/<img|avatar\.(png|jpg|svg)|dicebear|robohash|gravatar|generated|faces?\//i);
    }
  });
  it("carries the ONE provenance derivation — organization-reported evidence, never gold", () => {
    expect(card).toMatch(/<ProvenanceEdge provenanceClass="EVIDENCE_SUPPORTED" \/>/);
    expect(card).toMatch(/<ProvenanceLine\s+provenanceClass="EVIDENCE_SUPPORTED"/);
    for (const [name, src] of Object.entries(VIEWS)) expect(code(src), name).not.toMatch(/EMPLOYER_CONFIRMED|trust-accent|\bgold\b/);
  });
  it("shows evidence-backed facts as icon · value · unit; the work reality as object lanes on time; and no score", () => {
    for (const id of ["historical-player-figures", "historical-player-weeks", "historical-player-places", "historical-player-evidence", "historical-player-interpretations", "historical-player-unknowns", "historical-player-aggregate", "historical-player-current"]) {
      expect(card, id).toContain(`data-testid="${id}"`);
    }
    expect(card).toMatch(/personObjectLanes\(person\)/);
    expect(card).toMatch(/<WorkHistoryTimeline/);
    for (const [name, src] of Object.entries(VIEWS)) {
      expect(code(src), name).not.toMatch(/\b(score|rating|rank|stars?|tier|percentile|reliability)\b/i);
      expect(src, name).not.toMatch(/ReadinessRing|CountUp|SkillEvidenceChart/);
    }
  });
  it("the compact identity is a selectable button and the group views use it, never seven expanded cards", () => {
    expect(card).toMatch(/data-testid="historical-player-compact"[\s\S]{0,400}aria-pressed=\{selected\}|aria-pressed=\{selected\}[\s\S]{0,400}data-testid="historical-player-compact"/);
    expect(overview).toMatch(/<HistoricalPlayerCompact/);
    expect(overview).not.toMatch(/<HistoricalPlayerCard\b/);
    // the focus card mounts with the product's CSS entrance (rise-in), never a framer `initial` that
    // would render invisible on the server and stay invisible under reduced motion
    expect(workspace).toMatch(/\{personProjection \? \(\s*<div[^>]*className=\{RISE\}[^>]*>\s*<HistoricalPlayerCard/);
    for (const [name, src] of Object.entries(VIEWS)) expect(code(src), name).not.toMatch(/initial=\{\{\s*opacity/);
    expect(read("app/globals.css")).toMatch(/\.rise-in,[\s\S]{0,400}animation: none/);
  });
  it("says the person's CURRENT state is not inferred — as a token, the sentence on request", () => {
    expect(card).toMatch(/data-testid="historical-player-current"[\s\S]{0,200}title=\{labels\.currentNotInferred\}/);
    expect(String((ltR.card as Record<string, string>).currentNotInferred)).toMatch(/nenustatoma/);
    expect(String((ltR.card as Record<string, string>).currentToken)).toMatch(/\?/);
    const personInterface = projections.slice(projections.indexOf("export interface PersonProjection"), projections.indexOf("export type PlaceProjectionState"));
    expect(code(personInterface)).not.toMatch(/availability|availableFrom|employed|wage|salary|locationCountry|current/i);
  });
  it("hours never become competency: no skill is written or shown from the import", () => {
    for (const [name, src] of Object.entries(VIEWS)) expect(code(src), name).not.toMatch(/worker_skills|skills\b.*verified|competenc|esco/i);
    expect(code(projections)).not.toMatch(/worker_skills|competency/);
    expect(code(visual)).not.toMatch(/skill|competenc/i);
  });
});

// ── the field ───────────────────────────────────────────────────────────────

describe("the historical field is people in time, read-only, never a team", () => {
  it("is client-side state over server-computed data: no fetch, no action, no write", () => {
    expect(board.startsWith('"use client";')).toBe(true);
    expect(board).not.toMatch(/fetch\(|useActionState|createClient|\.rpc\(|from\(|<form/);
  });
  it("is a FORMATION: places are lanes, time is columns, people are tokens; selects by WEEK, PERSON, PLACE and DAY", () => {
    expect(board).toMatch(/data-testid="field-week"/);
    expect(board).toMatch(/data-testid="field-person"/);
    expect(board).toMatch(/data-testid="field-place"/);
    expect(board).toMatch(/data-testid="field-day"/);
    expect(board).toMatch(/data-testid="field-lane"/);
    expect(board).toMatch(/data-testid="field-path"/);
    expect(board).toMatch(/role="rowheader"/);
    expect(board).toMatch(/role="columnheader"/);
    expect(board).toMatch(/fieldFormationWeek\(calendar, week\)/);
    expect(board).toMatch(/fieldFormationPeriod\(calendar\)/);
    // the rejected representations: a grid of place rectangles with people inside; a person × day matrix of chips
    expect(board).not.toMatch(/data-testid="field-places"/);
    expect(board).not.toMatch(/<PlaceMark/);
    // the formation of the real week 45: lanes most-worked first, a person on several places on one day, the unknown split dashed
    const week = fieldFormationWeek(projectionOfTheSession().calendar, 45);
    expect(week?.lanes[0]?.name).toBe("Testgracht 3");
    const friday = week?.days.indexOf("2025-11-07") ?? -1;
    const onT3 = week?.lanes.find((l) => l.name === "Testgracht 3")?.cells[friday]?.find((t) => t.label === "Person A");
    const onT5 = week?.lanes.find((l) => l.name === "Testgracht 5")?.cells[friday]?.find((t) => t.label === "Person A");
    expect(onT3?.hours).toBeNull();
    expect(onT5?.hours).toBe(8.5);
    expect(onT3?.dayHours).toBe(9);
    // the work path steps through the lane with the most stated hours, never invents a step
    const steps = week?.paths.get("Person A") ?? [];
    expect(steps.length).toBe(6);
    expect(steps.find((st) => st.day === friday)?.lane).toBe(week?.lanes.findIndex((l) => l.name === "Testgracht 5"));
    // the company's objects as streams: most-worked first, one week entry per period week, a person's narrowing never exceeds the whole
    const streams = objectStreams(projectionOfTheSession().calendar);
    expect(streams[0]?.name).toBe("Testgracht 3");
    expect(streams.every((o) => o.weeks.length === 9)).toBe(true);
    const mine = objectStreams(projectionOfTheSession().calendar, "Person A");
    for (const o of mine) expect(o.personDays).toBeLessThanOrEqual(streams.find((x) => x.name === o.name)?.personDays ?? 0);
  });
  it("uses the ONE identity mark and the ONE place mark (name first, monogram only as a tooltip), never colour alone", () => {
    const marks = read("components/app/historical/historical-marks.tsx");
    expect(marks).toMatch(/playerInitials\(label\)/);
    expect(marks).toMatch(/PLAYER_IDENTITY_FALLBACK_SURFACE/);
    expect(marks).toMatch(/title=\{`\$\{name\} \(\$\{objectMonogram\(name\)\}\)/);
    expect(marks).toMatch(/export function PersonToken/);
    expect(marks).toMatch(/data-token-state=\{unknown \? "unknown" : "actual"\}/);
    expect(marks).toMatch(/outline-dashed/);
    expect(board).toMatch(/<PersonToken/);
    expect(board).toMatch(/<ObjectMark/);
    expect(calendar).toMatch(/<PersonToken/);
    // the code is not the architecture: no monogram is rendered as cell text on the field or the calendar
    for (const src of [board, calendar]) expect(src).not.toMatch(/\{objectMonogram\(/);
    expect(objectMonogram("Hoofdgracht 3")).toBe("H3");
    expect(objectMonogram("Kruisweg 19")).toBe("K19");
    expect(objectMonogram("Vera Voorbeeldlaan 16")).toBe("VV16");
    expect(objectMonogram("Kantoor")).toBe("Ka");
  });
  it("never calls co-occurrence a team, and the projection carries no membership", () => {
    expect(board).toMatch(/data-testid="field-not-a-team"/);
    expect(String((ltR.field as Record<string, string>).notATeam)).toMatch(/≠ komanda/);
    expect(String((ltR.field as Record<string, string>).notATeamWhy)).toMatch(/ne komanda/);
    expect(String((ltR.field as Record<string, string>).title)).not.toMatch(/komand/i);
    expect(code(projections)).not.toMatch(/membership|team_id|brigade_id/);
    expect(code(visual)).not.toMatch(/membership|team_id|brigade_id|brigade/);
    expect(projections).toMatch(/never a[\s*]+team membership \(ARCH-4\)/);
  });
  it("an unknown split is `?`, never divided (UNKNOWN ≠ ZERO)", () => {
    expect(board).toMatch(/labels\.hoursUnknown/);
    expect(visual).not.toMatch(/\/\s*(places|people)\.length/);
    expect(visual).toMatch(/hours: p\.hours,/);
    const week = fieldWeekView(projectionOfTheSession().calendar, 45);
    const a = week?.rows.find((r) => r.label === "Person A")?.cells.find((c) => c?.iso === "2025-11-07");
    expect(a?.hours).toBe(9);
    expect(a?.places.find((p) => p.name === "Testgracht 3")?.hours).toBeNull();
    expect(a?.places.find((p) => p.name === "Testgracht 5")?.hours).toBe(8.5);
  });
});

// ── the calendar ────────────────────────────────────────────────────────────

describe("the calendar is a calendar", () => {
  it("month / week grid, Monday first, built on the journal calendar's own day arithmetic", () => {
    expect(visual).toMatch(/from "@\/lib\/journal\/journal-calendar"/);
    expect(calendar).toMatch(/WEEKDAY_ANCHOR_ISO/);
    expect(calendar).toMatch(/grid-cols-7/);
    expect(calendar).toMatch(/data-testid="historical-calendar-day"/);
    expect(calendar).toMatch(/historical-calendar-scale-\$\{s\}/);
    const grid = buildHistoricalCalendar({ calendar: projectionOfTheSession().calendar, scale: "month", anchor: "2025-11-01", selected: null });
    for (const w of grid.weeks) expect(w).toHaveLength(7);
    expect(grid.weeks[0][0].iso).toBe("2025-10-27");
    const nov7 = grid.weeks.flat().find((c) => c.iso === "2025-11-07");
    expect(nov7?.people.map((p) => p.label)).toContain("Person A");
    expect(nov7?.hours).toBe(54);
  });
  it("a period aggregate is never a day: the visual module never touches aggregates; the calendar lists them APART", () => {
    expect(code(visual)).not.toMatch(/aggregates/);
    expect(calendar).toMatch(/data-testid="evidence-calendar-aggregates"/);
    const gridStart = calendar.indexOf('data-testid="historical-calendar-grid"');
    const gridCode = calendar.slice(gridStart, calendar.indexOf('<p className="flex flex-wrap', gridStart));
    expect(gridCode.length).toBeGreaterThan(2000);
    expect(gridCode).not.toMatch(/aggregate/);
    const grid = buildHistoricalCalendar({ calendar: projectionOfTheSession().calendar, scale: "month", anchor: "2025-11-01", selected: null });
    const nov17 = grid.weeks.flat().find((c) => c.iso === "2025-11-17");
    // Person G's 800 h and Person E's 165 h are recorded on 17 Nov and appear in NO cell
    expect(nov17?.people.map((p) => p.label)).not.toContain("Person G");
    for (const p of nov17?.people ?? []) expect(p.hours ?? 0, p.label).toBeLessThan(24);
    expect(projectionOfTheSession().calendar.aggregates.map((a) => `${a.label}:${a.sourceHours}`)).toEqual(["Person E:165", "Person G:800"]);
    expect(semantics).toMatch(/periodStart: null,\s*periodEnd: null,/);
  });
  it("the weekly table is the OPTIONAL report view, never the default", () => {
    expect(workspace).toMatch(/useState<\s*"calendar" \| "table"\s*>\(\s*"calendar",?\s*\)/);
    expect(calendar).toMatch(/view === "calendar" \? \(/);
    expect(calendar).toMatch(/<WeekTable/);
  });
  it("selecting a day opens the day's actual reality: person → places → hours or ?", () => {
    expect(calendar).toMatch(/export function HistoricalDayReality/);
    expect(calendar).toMatch(/dayFormation\(calendar, iso\)/);
    expect(calendar).toMatch(/data-testid="historical-day-place"/);
    expect(calendar).toMatch(/p\.hours !== null \? \(\s*`\$\{fmt\.hours\(p\.hours\)\} h`\s*\) : \(\s*<UnknownToken/);
    expect(workspace).toMatch(/node: dayNode\(day\)/);
    // the day formation of 7 Nov: places most-people first, Person A's unknown split on Testgracht 3, 8.5 h on Testgracht 5
    const day = dayFormation(projectionOfTheSession().calendar, "2025-11-07");
    expect(day?.places[0]?.name).toBe("Testgracht 3");
    expect(day?.places.find((p) => p.name === "Testgracht 3")?.people.find((t) => t.label === "Person A")?.hours).toBeNull();
    expect(day?.places.find((p) => p.name === "Testgracht 5")?.people.find((t) => t.label === "Person A")?.hours).toBe(8.5);
    expect(day?.hours).toBe(54);
  });
});

// ── objects · attention · commit · source ───────────────────────────────────

describe("objects, attention, the decision bar and the source", () => {
  it("objects are compact nodes that focus the same workspace; spellings are LEVEL 3", () => {
    expect(objects).toMatch(/data-testid="historical-object"/);
    expect(objects).toMatch(/data-testid="historical-object-focus"/);
    expect(objects).toMatch(/data-testid="historical-object-source"/);
    expect(objects).toMatch(/<details[\s\S]{0,1200}data-testid="evidence-place-spellings"/);
    expect(objects).not.toMatch(/<table/);
  });
  it("attention shows only decisions, the 800/165 case as period-total candidates with remote and period tokens, the source on demand", () => {
    expect(attention).toMatch(/data-testid="evidence-time-row"/);
    expect(attention).toMatch(/labels\.detected\}: \{r\.machineReading === "period_aggregate" \? labels\.machineReading\.period_aggregate : "\?"\}/);
    expect(attention).toMatch(/r\.remote === true \? "✓" : r\.remote === false \? "✕" : "\?"/);
    expect(attention).toMatch(/<EvidenceTimeSemanticsForm/);
    expect(attention).toMatch(/<details>[\s\S]{0,300}labels\.source/);
    expect(decisionCount(projectionOfTheSession().issues)).toBe(1);
  });
  it("ONE decision form per aggregate row — two people's periods are never stamped by one form (B1 walk, 2026-09-17)", () => {
    // The 800 h and the 165 h figures belong to two people and two periods
    // (six months and five). A single form over `i.rowIds` could only give
    // both the same period; the form now sits INSIDE the per-row list item
    // and hands the server action exactly that row.
    const rowsList = attention.slice(attention.indexOf('data-testid="evidence-time-rows"'), attention.indexOf("</ul>", attention.indexOf('data-testid="evidence-time-rows"')));
    expect(rowsList).toMatch(/<EvidenceTimeSemanticsForm[\s\S]{0,400}rowIds=\{\[r\.rowId\]\}/);
    expect(rowsList).toMatch(/suggestedRemote=\{r\.remote === true \? true : null\}/);
    expect(attention).not.toMatch(/rowIds=\{i\.rowIds\}/);
    expect(attention).not.toMatch(/i\.timeRows\.every\(/);
    expect(attention).not.toMatch(/i\.timeRows\.some\(/);
  });
  it("the decision bar is persistent, CONFIRM is withheld while a decision blocks, the commit control is the existing one", () => {
    expect(workspace).toMatch(/data-testid="evidence-decision-bar"/);
    expect(workspace).toMatch(/fixed inset-x-0 bottom-0/);
    expect(workspace).toMatch(/data-testid="evidence-decision-bar-spacer"/);
    expect(workspace).toMatch(/disabled=\{blocking > 0\}/);
    expect(workspace).toMatch(/\{confirmOpen && blocking === 0 && \(/);
    expect(section).toMatch(/const commitNode = \(/);
    expect(section.indexOf("{planBlock}")).toBeLessThan(section.indexOf("<EvidenceCommitForm"));
    expect(section).toMatch(/commit=\{commitNode\}/);
  });
  it("the raw rows stay one action away: SOURCE opens the disclosure the section keeps", () => {
    expect(workspace).toMatch(/data-testid="evidence-source-link"/);
    expect(workspace).toMatch(/document\.getElementById\(sourceRowsId\)/);
    expect(section).toMatch(/<details data-testid="evidence-preview-rows-disclosure" id="evidence-source-rows"/);
    expect(section).toMatch(/sourceRowsId="evidence-source-rows"/);
  });
  it("the semantic icon vocabulary binds every named concept, and the views use it rather than raw glyphs", () => {
    for (const c of ["person", "work", "object", "project", "time", "calendar", "journal", "team", "evidence", "confirmed", "unconfirmed", "unknown", "historical", "current", "remote", "location", "money", "warning", "source"]) {
      expect(SEMANTIC_CONCEPTS).toContain(c);
    }
    for (const [name, src] of Object.entries(VIEWS)) {
      expect(src, name).toMatch(/from "@\/components\/app\/semantic-icon"/);
      expect(src, name).not.toMatch(/from "lucide-react"/);
    }
  });
  it("every icon carries an accessible label; state is never colour alone", () => {
    const icon = read("components/app/semantic-icon.tsx");
    expect(icon).toMatch(/<span className="sr-only">\{label\}<\/span>/);
    expect(icon).toMatch(/label: string;/);
  });
});

// ── no second model, no write ───────────────────────────────────────────────

describe("no second model of anything, no write before commit", () => {
  it("no new table, migration, calendar store, player-card store or team store", () => {
    const migrations = readdirSync(path.join(dir, "../../supabase/migrations"));
    expect(migrations.some((m) => m > "20260916" && /player|team|calendar|history|evidence|visual/.test(m))).toBe(false);
    for (const f of ["lib/player-card/historical-player-card.ts", "lib/organization-evidence/team-board.ts", "lib/organization-evidence/calendar-store.ts", "lib/organization-evidence/historical-store.ts"]) {
      expect(existsSync(path.join(dir, f)), f).toBe(false);
    }
    for (const [name, src] of Object.entries({ ...VIEWS, visual, projections })) {
      expect(src, name).not.toMatch(/localStorage|indexedDB|\.insert\(|\.upsert\(|\.rpc\(|createClient|fetch\(/);
    }
  });
  it("the visual module is a pure re-shaping of the ONE projection", () => {
    expect(visual).toMatch(/from "\.\/import-projections"/);
    expect(code(visual)).not.toMatch(/import .* from "@\/lib\/supabase|Date\.now\(\)|new Date\(\)/);
    const lanes = personObjectLanes(projectionOfTheSession().people[0]);
    expect(lanes.length).toBeGreaterThan(0);
    for (const l of lanes) {
      expect(l.startFraction).toBeGreaterThanOrEqual(0);
      expect(l.endFraction).toBeLessThanOrEqual(1);
    }
  });
  it("the identity comes from the existing foundation; the lanes from the existing player-card band; the sheet from the existing mobile primitive", () => {
    expect(read("components/app/historical/historical-marks.tsx")).toMatch(/from "@\/lib\/identity\/player-identity"/);
    expect(card).toMatch(/from "@\/components\/app\/historical\/historical-marks"/);
    expect(card).toMatch(/from "@\/components\/app\/player-card\/work-history-timeline"/);
    // the band is the canonical one, composed bare in the evidence tone — extended, not forked
    expect(card).toMatch(/appearance="bare"/);
    expect(card).toMatch(/tone="evidence"/);
    const band = read("components/app/player-card/work-history-timeline.tsx");
    expect(band).toMatch(/appearance = "boxed"/);
    expect(band).toMatch(/tone = "brand"/);
    expect(card).toMatch(/from "@\/components\/app\/provenance\/provenance-edge"/);
    expect(workspace).toMatch(/from "@\/components\/ui\/MobileSheet"/);
    expect(workspace).toMatch(/open=\{narrow\}/);
  });
});
