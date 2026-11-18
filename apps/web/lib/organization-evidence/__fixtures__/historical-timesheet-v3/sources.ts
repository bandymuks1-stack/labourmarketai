import type { SourceWorkRow } from "../../source-rows";

/**
 * FIXTURE v3 §2 — THE SOURCES, byte for byte. UTF-8, `;`-delimited, one
 * header row, one data row per line in the order of the spec's table, so a
 * data row's SOURCE POSITION is its `#` minus 1. SYNTHETIC ONLY: the streets
 * do not exist (city names are real only so an address split can be
 * exercised), the codes sit in 9990000xx, and no production identifier
 * appears anywhere.
 *
 * Spec: docs/design/historical-timesheet-fixture-v3.md §2.
 */

export interface FixtureFile {
  readonly key: "S1" | "S2" | "S3" | "S5";
  readonly filename: string;
  readonly text: string;
}

const csv = (lines: readonly string[]): string => `${lines.join("\n")}\n`;

const S1_HEADER = "Worker;Personnel no;Date;Period;Hours;Customer;Customer code;Object;Work performed";

const C1 = "UAB Fixtura Alfa;999000001";
const O1 = "Fixturos g. 3, Vilnius";

/** S1 — 37 data rows: daily rows, two week totals, an undated row, name and
 *  address variants, a partial name, a missing customer, the owner's own day. */
export const S1: FixtureFile = {
  key: "S1",
  filename: "fx-timesheet-2023.csv",
  text: csv([
    S1_HEADER,
    `Person Alpha;EMP-001;2023-03-06;;8;${C1};${O1};Facade work`,
    `Person Alpha;EMP-001;2023-03-07;;8;${C1};${O1};Facade work`,
    `Person Alpha;EMP-001;2023-03-08;;8;${C1};${O1};Facade work`,
    `Person Alpha;EMP-001;2023-03-09;;8;${C1};${O1};Facade work`,
    `Person Alpha;EMP-001;2023-03-10;;8;${C1};${O1};Facade work`,
    "Person Alpha;EMP-001;2023-03-13;;8;Fixtura Alfa, UAB;999000001;Fixturos g 3;Facade work",
    "Person Alpha;EMP-001;2023-03-14;;8;Fixtura Alfa, UAB;999000001;Fixturos g 3;Facade work",
    "Person Alpha;EMP-001;2023-03-15;;8;Fixtura Alfa, UAB;999000001;Fixturos g 3;Facade work",
    "Person Alpha;EMP-001;2023-03-16;;8;Fixtura Alfa, UAB;999000001;Fixturos g 3;Facade work",
    "Person Alpha;EMP-001;2023-03-17;;8;Fixtura Alfa, UAB;999000001;Fixturos g 3;Facade work",
    "Person Alpha;EMP-001;2023-03-20;;8;UAB „FIXTURA ALFA“;999000001;Fixturos gatvė 3 Vilnius;Facade work",
    "Person Alpha;EMP-001;2023-03-21;;8;UAB „FIXTURA ALFA“;999000001;Fixturos gatvė 3 Vilnius;Facade work",
    "Person Alpha;EMP-001;2023-03-22;;8;UAB „FIXTURA ALFA“;999000001;Fixturos gatvė 3 Vilnius;Facade work",
    "Person Alpha;EMP-001;2023-03-23;;8;UAB „FIXTURA ALFA“;999000001;Fixturos gatvė 3 Vilnius;Facade work",
    "Person Alpha;EMP-001;2023-03-24;;8;UAB „FIXTURA ALFA“;999000001;Fixturos gatvė 3 Vilnius;Facade work",
    `Person Bravo;EMP-002;2023-03-06;;8;${C1};${O1};Facade work`,
    `Person Bravo;EMP-002;2023-03-07;;8;${C1};${O1};Facade work`,
    `Person Bravo;EMP-002;2023-03-08;;8;${C1};${O1};Facade work`,
    `Person Bravo;EMP-002;2023-03-09;;8;${C1};${O1};Facade work`,
    `Person Bravo;EMP-002;2023-03-10;;8;${C1};${O1};Facade work`,
    `Person Charlie;;2023-03-08;;9;${C1};${O1};Scaffolding`,
    `Person Charlie;;2023-04-05;;6;${C1};${O1};Window sills`,
    `Person Charlie;;2023-04-06;;?;${C1};${O1};Window sills`,
    `Person Bravo;EMP-002;2023-05-15;;8;${C1};${O1};Balcony slabs`,
    `Person Bravo;EMP-002;2023-05-16;;8;${C1};${O1};Balcony slabs`,
    `Person Bravo;EMP-002;2023-05-17;;8;${C1};${O1};Balcony slabs`,
    `Person Bravo;EMP-002;2023-05-18;;8;${C1};${O1};Balcony slabs`,
    `Person Bravo;EMP-002;2023-05-19;;8;${C1};${O1};Balcony slabs`,
    `P. Delta;;2023-03-09;;8;${C1};${O1};Cleanup`,
    `Person Bravo;EMP-002;;;8;${C1};${O1};Facade work`,
    `Person Alpha;EMP-001;;2023-W10;40;${C1};${O1};Week total`,
    `Person Alpha;EMP-001;;2023-W11;42;${C1};${O1};Week total`,
    "Person Bravo;EMP-002;2023-03-13;;8;UAB Fixtura Alfa;999000005;Fixturos g. 5, Vilnius;Facade work",
    `Person Alpha;EMP-001;2023-03-27;;8;Fixtura Alfa;;${O1};Facade work`,
    "Person Charlie;;2023-03-29;;7;Fixtura Alfa;;Fixturos g. 9, Vilnius;Cleanup",
    "Person Alpha;EMP-001;2023-03-30;;8;;;Sandėlis;Warehouse tidy-up",
    `Owner Oscar;EMP-000;2023-03-20;;4;${C1};${O1};Site supervision`,
  ]),
};

/** S2 — a second, independent file: a conflicting figure and a duplicate. */
export const S2: FixtureFile = {
  key: "S2",
  filename: "fx-daily-report-2023-03.csv",
  text: csv([
    "Date;Employee;Personnel no;Site;Customer;Customer code;Hours;Task",
    "2023-03-08;Person Alpha;EMP-001;Fixturos g. 3, Vilnius;UAB Fixtura Alfa;999000001;9;Facade work",
    "2023-03-09;Person Alpha;EMP-001;Fixturos g. 3, Vilnius;UAB Fixtura Alfa;999000001;8;Facade work",
  ]),
};

/** S3 — monthly and weekly totals with no date column. */
export const S3: FixtureFile = {
  key: "S3",
  filename: "fx-monthly-totals-2024.csv",
  text: csv([
    "Worker;Personnel no;Period;Hours;Customer;Object;Work performed",
    "Person Charlie;;2024-05;160;Fixtura Wonen B.V.;Fixtuurstraat 12, Utrecht;Interior finishing",
    "Person Charlie;;2024-06;150;Fixtura Wonen BV;Fixtuurstraat 12 Utrecht;Interior finishing",
    "Person Bravo;EMP-002;2024-W23;38;FIXTURA WONEN B.V.;fixtuurstraat 12;Tiling",
    "Person Bravo;EMP-002;2024-10;96;Fixtura Wonen B.V.;Fixtuurstraat 12, Utrecht;Bathroom renovation",
    "Person Charlie;;2024-10;;Fixtura Wonen B.V.;Fixtuurstraat 12, Utrecht;Interior finishing",
  ]),
};

/** S5 — a MANAGER's upload with the S1 header. */
export const S5: FixtureFile = {
  key: "S5",
  filename: "fx-timesheet-2023-07-mike.csv",
  text: csv([
    S1_HEADER,
    `Person Alpha;EMP-001;2023-07-03;;8;${C1};${O1};Balcony slabs`,
    "Person Alpha;EMP-001;2023-07-04;;8;Fixtura Gama UAB;999000007;Fixturos g. 11, Vilnius;Painting",
  ]),
};

export const bytesOf = (f: FixtureFile): Buffer => Buffer.from(f.text, "utf8");

/** The same bytes under another name (upload #3 of S1). */
export const S1_COPY_FILENAME = "fx-timesheet-2023 (copy).csv";

/** S4 — the ONE agent row (MCP `submit_rows`, `startIndex` 0). Its verbatim
 *  line uses the S1 header words, so the employee number it states is
 *  readable by the same header vocabulary as a file's. */
export const S4_AGENT_ROW: SourceWorkRow = {
  personLabel: "Person Alpha",
  externalRef: "EMP-001",
  projectLabel: O1,
  workDate: "2023-06-01",
  periodStart: null,
  periodEnd: null,
  hours: 8,
  workText: "Facade work",
  raw: {
    Worker: "Person Alpha",
    "Personnel no": "EMP-001",
    Date: "2023-06-01",
    Hours: 8,
    Customer: "UAB Fixtura Alfa",
    "Customer code": "999000001",
    Object: O1,
    "Work performed": "Facade work",
  },
  factFields: ["personLabel", "externalRef", "projectLabel", "workDate", "hours", "workText"],
  derived: {},
};

/** The explicit fingerprint payload the agent states for S4 (§2). */
export const S4_FINGERPRINT_PAYLOAD = { label: "fixture-agent", payload: { n: 1 } } as const;

export const ALL_FILES: readonly FixtureFile[] = [S1, S2, S3, S5];
