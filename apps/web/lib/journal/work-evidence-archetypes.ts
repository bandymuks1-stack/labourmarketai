/**
 * WORK-EVIDENCE ARCHETYPES — one Work Journal for the full world of work.
 * Pure data + pure resolution. No IO, no AI, no forms.
 *
 * Owner direction (#1689, 2026-09-11): ONE Work Journal engine capable of
 * representing work across the whole ESCO/ISCO occupational universe, with
 * no profession-specific journals, no thousands of static forms and no giant
 * occupation switch. The conceptual chain this module carries:
 *
 *   ESCO/ISCO → OCCUPATION → WORK/EVIDENCE ARCHETYPE(S)
 *     → UNIVERSAL WORK RECORD → ADAPTIVE MODULES → REAL WORK EVIDENCE
 *     → PROFESSIONAL INTELLIGENCE
 *
 * ── WHAT THE EXISTING ENGINE ALREADY IS (audited 2026-09-11, production) ──
 *   · `journal_entries` + `journal_entry_metrics` (metric_slug TEXT with no
 *     check constraint; value_numeric / value_text / unit_slug → the
 *     `productivity_units` registry; `source` ∈ worker_input | ai_extracted |
 *     manager_corrected) — a key-value UNIVERSAL RECORD. Every archetype
 *     field below is a metric slug on that table; none needs a column.
 *   · `esco_occupations` — 3,039 active occupations, every one carrying a
 *     4-digit ISCO-08 unit-group code; 42 of the 43 ISCO sub-major groups
 *     are populated (63, subsistence farmers/fishers, has no ESCO rows).
 *     126,051 occupation↔skill relations over 13,939 ESCO skills.
 *   · `journal_entry_skills` (+ provenance), `journal_entry_photos`,
 *     `journal_entry_confirmations`, the document-import provenance metric,
 *     the canonical work-time rule (`work-time.ts`) and the attribution layer
 *     (`work-intelligence.ts`) — evidence, verification and analytics.
 *   · The profession-template registry (`journal_profession_templates`,
 *     migration 20260714180000) is an UNAPPLIED owner-gated draft: the
 *     template mechanism is not live. This module is the data it would carry,
 *     kept in code so it is testable and diffable, and so no migration is
 *     needed to know which modules an occupation family uses.
 *
 * ── THE MODEL ─────────────────────────────────────────────────────────────
 * An ARCHETYPE is a reusable work-evidence pattern derived from how the
 * occupation family really logs its work (a site diary, a tachograph, a
 * welder's continuity log, a clinical placement logbook, a matter time entry,
 * a maintenance work order, an issue tracker …). It states: the TIME model,
 * the ACTIVITY model, the QUANTITY/OUTPUT model, the tools/systems, whether
 * precise skill-time attribution is even possible, the evidence artefacts,
 * who verifies, regulatory/continuity needs, privacy limits, the result
 * model, and the Living-CV consequence — the owner's matrix columns.
 *
 * A MODULE is a small group of metric slugs an archetype adds to the
 * universal core. Occupations map to archetypes through their ISCO code —
 * sub-major group (2 digits) by default, minor group (3 digits) where a
 * family genuinely mixes patterns — so 3,039 occupations resolve through
 * ~50 data rows, not 3,039 forms. A profession may use several archetypes;
 * the composition is the UNION of their modules with the strictest time
 * model. The person never sees an archetype: the composer shows only the
 * modules that apply, progressively (owner §12).
 *
 * Nothing here scores a person, invents skill-hours, or forces ESCO
 * vocabulary on a human: `skillTimeAttribution` is an honesty flag that
 * tells the analytics layer which attribution the evidence CAN support.
 */

export const WORK_EVIDENCE_ARCHETYPE_IDS = [
  "field_project",
  "shift",
  "construction_trade",
  "production_manufacturing",
  "machine_equipment_operation",
  "maintenance_repair",
  "driving_mobile",
  "logistics_warehouse",
  "clinical_healthcare",
  "supervised_practice",
  "case_client",
  "office_administrative",
  "knowledge_project",
  "software_digital",
  "engineering_technical",
  "research",
  "education_teaching",
  "apprenticeship_training",
  "sales_commercial",
  "customer_service",
  "hospitality",
  "care_work",
  "agriculture_forestry_fisheries",
  "security_emergency",
  "management_leadership",
  "creative_media",
  "legal_professional_services",
  "public_service",
  "cleaning_facility",
  "personal_services",
  "military_regulated",
] as const;
export type WorkEvidenceArchetypeId = (typeof WORK_EVIDENCE_ARCHETYPE_IDS)[number];

/** How the family's real records express time. Strictness order is the
 *  index: a composition keeps the strictest model any archetype needs. */
export const TIME_MODELS = [
  "activity_duration", // "3 h formwork" — a duration per activity
  "session", // lessons, consultations, visits — bounded sessions
  "case_time", // time entries against a case/matter (often 6-min units)
  "clock", // start/end/breaks → actual worked duration
  "shift", // rostered shift with handover
  "driving_duty_rest", // driving vs other work vs rest — legally distinct
] as const;
export type TimeModel = (typeof TIME_MODELS)[number];

export type ActivityModel =
  | "work_package"
  | "task"
  | "procedure"
  | "route_leg"
  | "case_matter"
  | "session"
  | "incident_response"
  | "deliverable"
  | "batch_run";

export type QuantityModel =
  | "physical_output" // m², pieces, tonnes — the productivity_units registry
  | "units_handled" // orders, pallets, contacts, covers
  | "cases" // matters, patients, visits, learners
  | "distance" // km
  | "none";

export type ToolsModel =
  | "equipment_machinery"
  | "vehicle"
  | "instruments"
  | "software_systems"
  | "none";

/** Which skill-time attribution the family's evidence can honestly support.
 *  `precise` = per-activity durations are the norm; `activity` = duration
 *  per activity/work package is common; `involvement` = the record proves a
 *  skill took part, not for how long. Never a licence to invent. */
export type SkillTimeAttribution = "precise" | "activity" | "involvement";

export type EvidenceKind =
  | "photo"
  | "document"
  | "artifact"
  | "system_record"
  | "original_timesheet"
  | "inspection_result"
  | "tachograph_gps"
  | "supervisor_confirmation"
  | "client_confirmation"
  | "peer_review";

export type Verifier = "supervisor" | "client" | "peer" | "regulator" | "self";

export type RegulatoryModel =
  | "none"
  | "continuity" // welder / operator continuity of practice
  | "licence_hours" // pilots, drivers' CPC, apprenticeships — counted hours
  | "duty_time" // legal driving/duty/rest limits
  | "supervised_practice" // clinical / legal / social-work placements
  | "safety_record"; // incident, permit, PPE observations

export type PrivacyModel =
  | "none"
  | "client_confidential"
  | "patient_confidential"
  | "security_sensitive";

export type ResultModel =
  | "completed_partial_blocked"
  | "outcome"
  | "inspection_pass_fail"
  | "handover";

export type LivingCvConsequence =
  | "hours_and_output"
  | "hours_and_cases"
  | "practice_hours"
  | "deliverables"
  | "continuity_record";

/** A group of metric slugs an archetype adds to the universal core. Every
 *  slug is a `journal_entry_metrics.metric_slug` value — no column, no
 *  table. Slugs are lower_snake, ≤ 40 chars (guarded). */
export const JOURNAL_MODULES = {
  // `site_name` is already a universal-core slug; the module adds what the
  // core does not carry.
  site_zone: ["work_zone", "crew"],
  materials_tools: ["materials", "tools", "equipment"],
  weather_safety: ["weather", "safety_observation", "delay_blocker"],
  process_spec: ["process", "procedure_ref", "material_spec", "joint_type", "position"],
  inspection: ["inspection_result", "test_result"],
  vehicle_route: ["vehicle", "route", "distance_km", "driving_time", "duty_time", "rest_time", "loading_activity"],
  asset_fault: ["asset", "fault", "diagnosis", "maintenance_type", "parts", "downtime"],
  case_matter: ["client_ref", "matter_ref", "billable", "deliverable"],
  supervision: ["supervision_level", "competency_practiced", "learning_outcome"],
  shift_post: ["post", "patrol_checkpoint", "handover", "incident"],
  software_delivery: ["repository", "ticket_ref", "change_ref", "environment", "incident_ref"],
  // `topic` is a universal-core slug already.
  session_teaching: ["group", "learners", "session_type"],
  production_batch: ["batch", "line", "machine", "output_units", "scrap"],
  warehouse_units: ["units_handled", "orders", "zone"],
  field_crop: ["field", "crop_or_stock", "treatment", "area"],
  customer_contact: ["contacts_handled", "channel", "outcome"],
  creative_deliverable: ["deliverable", "medium", "publication"],
  research_record: ["experiment", "protocol", "sample", "finding"],
  care_visit: ["visit", "care_activity"],
  sales_activity: ["leads", "meetings", "orders_value"],
  hospitality_service: ["covers", "station", "service_period"],
  cleaning_facility: ["area", "checklist", "consumables"],
  public_service: ["case_ref", "decision", "service_channel"],
  management: ["team", "decisions", "meetings", "plan_ref"],
  military_regulated: ["unit", "exercise", "clearance_level"],
} as const;
export type JournalModuleId = keyof typeof JOURNAL_MODULES;

/** The universal core every entry carries today — the slugs `journal-write-
 *  core.ts` already persists. Listed so the composition contract is explicit
 *  and the guard can prove no module re-declares a core slug. */
export const UNIVERSAL_CORE_SLUGS = [
  "work_date",
  "quantity",
  "parsed_fragment",
  "fragment_time",
  "fragment_activity",
  "work_direction",
  "site_name",
  "institution_name",
  "topic",
  "unknown_phrase",
  "skill_claim",
  "source_document_file",
  "extractor_version",
  "pipeline_version",
] as const;

export type WorkEvidenceArchetype = {
  readonly id: WorkEvidenceArchetypeId;
  readonly timeModel: TimeModel;
  readonly activityModel: ActivityModel;
  readonly quantityModel: QuantityModel;
  readonly tools: ToolsModel;
  readonly skillTimeAttribution: SkillTimeAttribution;
  readonly evidence: readonly EvidenceKind[];
  readonly verifier: Verifier;
  readonly regulatory: RegulatoryModel;
  readonly privacy: PrivacyModel;
  readonly result: ResultModel;
  readonly livingCv: LivingCvConsequence;
  readonly modules: readonly JournalModuleId[];
  /** The real-world record this archetype is modelled on — design evidence,
   *  kept as one line so the code stays the source of truth. */
  readonly modelledOn: string;
};

const A = (
  id: WorkEvidenceArchetypeId,
  a: Omit<WorkEvidenceArchetype, "id">,
): WorkEvidenceArchetype => ({ id, ...a });

export const WORK_EVIDENCE_ARCHETYPES: readonly WorkEvidenceArchetype[] = [
  A("field_project", {
    timeModel: "activity_duration", activityModel: "work_package", quantityModel: "physical_output",
    tools: "equipment_machinery", skillTimeAttribution: "activity",
    evidence: ["photo", "supervisor_confirmation", "client_confirmation"], verifier: "supervisor",
    regulatory: "safety_record", privacy: "none", result: "completed_partial_blocked", livingCv: "hours_and_output",
    modules: ["site_zone", "materials_tools", "weather_safety"],
    modelledOn: "daily site diary / field report: object, zone, crew, activity, quantity, weather, blockers, photos",
  }),
  A("shift", {
    timeModel: "shift", activityModel: "task", quantityModel: "units_handled", tools: "none",
    skillTimeAttribution: "involvement", evidence: ["system_record", "supervisor_confirmation"], verifier: "supervisor",
    regulatory: "none", privacy: "none", result: "handover", livingCv: "hours_and_output",
    modules: ["shift_post"],
    modelledOn: "rostered shift record with handover note; time is the shift, activities are involvement",
  }),
  A("construction_trade", {
    timeModel: "clock", activityModel: "work_package", quantityModel: "physical_output",
    tools: "equipment_machinery", skillTimeAttribution: "activity",
    evidence: ["photo", "original_timesheet", "supervisor_confirmation", "client_confirmation"], verifier: "supervisor",
    regulatory: "safety_record", privacy: "none", result: "completed_partial_blocked", livingCv: "hours_and_output",
    modules: ["site_zone", "materials_tools", "weather_safety", "inspection"],
    modelledOn: "trade daily report: 08:00–17:00, 30 min break, object, work package, m²/pcs, materials, tools, photos, supervisor sign-off",
  }),
  A("production_manufacturing", {
    timeModel: "shift", activityModel: "batch_run", quantityModel: "physical_output",
    tools: "equipment_machinery", skillTimeAttribution: "activity",
    evidence: ["system_record", "inspection_result", "supervisor_confirmation"], verifier: "supervisor",
    regulatory: "safety_record", privacy: "none", result: "inspection_pass_fail", livingCv: "hours_and_output",
    modules: ["production_batch", "inspection"],
    modelledOn: "production/batch log: line, machine, batch, output units, scrap, QC result",
  }),
  A("machine_equipment_operation", {
    timeModel: "clock", activityModel: "task", quantityModel: "physical_output",
    tools: "equipment_machinery", skillTimeAttribution: "precise",
    evidence: ["system_record", "supervisor_confirmation"], verifier: "supervisor",
    regulatory: "continuity", privacy: "none", result: "completed_partial_blocked", livingCv: "continuity_record",
    modules: ["materials_tools", "site_zone"],
    modelledOn: "operator hour-meter / equipment log: machine, hours operated, task, output — continuity of operation",
  }),
  A("maintenance_repair", {
    timeModel: "activity_duration", activityModel: "task", quantityModel: "cases",
    tools: "equipment_machinery", skillTimeAttribution: "activity",
    evidence: ["system_record", "photo", "inspection_result", "client_confirmation"], verifier: "client",
    regulatory: "safety_record", privacy: "none", result: "inspection_pass_fail", livingCv: "hours_and_cases",
    modules: ["asset_fault", "materials_tools", "inspection"],
    modelledOn: "CMMS work order: asset, fault, diagnosis, maintenance type, parts, labour hours, downtime, test, sign-off",
  }),
  A("driving_mobile", {
    timeModel: "driving_duty_rest", activityModel: "route_leg", quantityModel: "distance", tools: "vehicle",
    skillTimeAttribution: "precise", evidence: ["tachograph_gps", "document", "client_confirmation"], verifier: "client",
    regulatory: "duty_time", privacy: "none", result: "completed_partial_blocked", livingCv: "hours_and_output",
    modules: ["vehicle_route"],
    modelledOn: "tachograph / driver daily log (Reg. 561/2006): driving, other work, availability, rest — never merged",
  }),
  A("logistics_warehouse", {
    timeModel: "shift", activityModel: "task", quantityModel: "units_handled",
    tools: "equipment_machinery", skillTimeAttribution: "activity",
    evidence: ["system_record", "supervisor_confirmation"], verifier: "supervisor",
    regulatory: "safety_record", privacy: "none", result: "completed_partial_blocked", livingCv: "hours_and_output",
    modules: ["warehouse_units", "materials_tools"],
    modelledOn: "WMS shift record: zone, orders/pallets handled, equipment (forklift), incidents",
  }),
  A("clinical_healthcare", {
    timeModel: "shift", activityModel: "procedure", quantityModel: "cases", tools: "instruments",
    skillTimeAttribution: "involvement", evidence: ["system_record", "supervisor_confirmation", "peer_review"],
    verifier: "supervisor", regulatory: "supervised_practice", privacy: "patient_confidential", result: "outcome",
    livingCv: "practice_hours",
    modules: ["supervision", "care_visit"],
    modelledOn: "clinical shift / procedure log and placement logbook: procedure category, count, supervision level — never patient content",
  }),
  A("supervised_practice", {
    timeModel: "session", activityModel: "procedure", quantityModel: "cases", tools: "none",
    skillTimeAttribution: "activity", evidence: ["document", "supervisor_confirmation"], verifier: "supervisor",
    regulatory: "supervised_practice", privacy: "client_confidential", result: "outcome", livingCv: "practice_hours",
    modules: ["supervision"],
    modelledOn: "supervised practice record (trainee lawyer, psychologist, social worker, teacher): activity, hours, supervisor sign-off",
  }),
  A("case_client", {
    timeModel: "case_time", activityModel: "case_matter", quantityModel: "cases", tools: "software_systems",
    skillTimeAttribution: "precise", evidence: ["artifact", "document", "client_confirmation"], verifier: "client",
    regulatory: "none", privacy: "client_confidential", result: "outcome", livingCv: "hours_and_cases",
    modules: ["case_matter"],
    modelledOn: "matter time entry: client/matter, activity, duration, billable flag, deliverable — reference, not content",
  }),
  A("office_administrative", {
    timeModel: "clock", activityModel: "task", quantityModel: "units_handled", tools: "software_systems",
    skillTimeAttribution: "involvement", evidence: ["system_record", "artifact"], verifier: "supervisor",
    regulatory: "none", privacy: "none", result: "completed_partial_blocked", livingCv: "hours_and_output",
    modules: ["customer_contact"],
    modelledOn: "office day record: tasks, documents processed, systems used",
  }),
  A("knowledge_project", {
    timeModel: "activity_duration", activityModel: "deliverable", quantityModel: "none", tools: "software_systems",
    skillTimeAttribution: "activity", evidence: ["artifact", "document", "peer_review"], verifier: "peer",
    regulatory: "none", privacy: "client_confidential", result: "outcome", livingCv: "deliverables",
    modules: ["case_matter"],
    modelledOn: "project timesheet + deliverable log: project, activity, hours, deliverable, review",
  }),
  A("software_digital", {
    timeModel: "activity_duration", activityModel: "deliverable", quantityModel: "none", tools: "software_systems",
    skillTimeAttribution: "activity", evidence: ["system_record", "artifact", "peer_review"], verifier: "peer",
    regulatory: "none", privacy: "client_confidential", result: "outcome", livingCv: "deliverables",
    modules: ["software_delivery"],
    modelledOn: "issue tracker + change history: ticket, change, environment, review, incident — time evidence when available, never forced",
  }),
  A("engineering_technical", {
    timeModel: "activity_duration", activityModel: "deliverable", quantityModel: "none", tools: "instruments",
    skillTimeAttribution: "activity", evidence: ["artifact", "document", "inspection_result", "peer_review"],
    verifier: "peer", regulatory: "safety_record", privacy: "none", result: "inspection_pass_fail", livingCv: "deliverables",
    modules: ["process_spec", "inspection"],
    modelledOn: "engineering record: design/inspection/test activity, instrument, standard, result",
  }),
  A("research", {
    timeModel: "activity_duration", activityModel: "procedure", quantityModel: "none", tools: "instruments",
    skillTimeAttribution: "activity", evidence: ["artifact", "document", "peer_review"], verifier: "peer",
    regulatory: "none", privacy: "none", result: "outcome", livingCv: "deliverables",
    modules: ["research_record"],
    modelledOn: "lab notebook: experiment, protocol, sample, observation, finding, dated and witnessed",
  }),
  A("education_teaching", {
    timeModel: "session", activityModel: "session", quantityModel: "cases", tools: "none",
    skillTimeAttribution: "precise", evidence: ["document", "artifact", "peer_review"], verifier: "supervisor",
    regulatory: "none", privacy: "client_confidential", result: "outcome", livingCv: "hours_and_cases",
    modules: ["session_teaching"],
    modelledOn: "lesson register / teaching log: group, topic, session type, learners, duration",
  }),
  A("apprenticeship_training", {
    timeModel: "session", activityModel: "task", quantityModel: "none", tools: "none",
    skillTimeAttribution: "activity", evidence: ["document", "supervisor_confirmation"], verifier: "supervisor",
    regulatory: "licence_hours", privacy: "none", result: "outcome", livingCv: "practice_hours",
    modules: ["supervision"],
    modelledOn: "on-the-job training record: competency practiced, hours, learning outcome, trainer sign-off, cumulative hours",
  }),
  A("sales_commercial", {
    timeModel: "activity_duration", activityModel: "task", quantityModel: "units_handled", tools: "software_systems",
    skillTimeAttribution: "involvement", evidence: ["system_record", "client_confirmation"], verifier: "supervisor",
    regulatory: "none", privacy: "client_confidential", result: "outcome", livingCv: "hours_and_output",
    modules: ["sales_activity", "customer_contact"],
    modelledOn: "CRM activity log: leads, meetings, orders — outcome-based, hours secondary",
  }),
  A("customer_service", {
    timeModel: "shift", activityModel: "task", quantityModel: "units_handled", tools: "software_systems",
    skillTimeAttribution: "involvement", evidence: ["system_record", "supervisor_confirmation"], verifier: "supervisor",
    regulatory: "none", privacy: "client_confidential", result: "outcome", livingCv: "hours_and_output",
    modules: ["customer_contact"],
    modelledOn: "contact-centre / desk shift: contacts handled, channel, outcomes",
  }),
  A("hospitality", {
    timeModel: "shift", activityModel: "task", quantityModel: "units_handled", tools: "equipment_machinery",
    skillTimeAttribution: "involvement", evidence: ["supervisor_confirmation"], verifier: "supervisor",
    regulatory: "safety_record", privacy: "none", result: "completed_partial_blocked", livingCv: "hours_and_output",
    modules: ["hospitality_service"],
    modelledOn: "service-period record: station, covers, shift, food-safety checks",
  }),
  A("care_work", {
    timeModel: "session", activityModel: "procedure", quantityModel: "cases", tools: "none",
    skillTimeAttribution: "activity", evidence: ["document", "client_confirmation", "supervisor_confirmation"],
    verifier: "supervisor", regulatory: "supervised_practice", privacy: "patient_confidential", result: "outcome",
    livingCv: "practice_hours",
    modules: ["care_visit"],
    modelledOn: "care visit log: visit, care activity category, duration — never the client's private detail",
  }),
  A("agriculture_forestry_fisheries", {
    timeModel: "activity_duration", activityModel: "work_package", quantityModel: "physical_output",
    tools: "equipment_machinery", skillTimeAttribution: "activity",
    evidence: ["photo", "document", "system_record"], verifier: "supervisor",
    regulatory: "safety_record", privacy: "none", result: "completed_partial_blocked", livingCv: "hours_and_output",
    modules: ["field_crop", "materials_tools", "weather_safety"],
    modelledOn: "field / spray / catch record: field or stock, treatment, area or catch, weather, machinery",
  }),
  A("security_emergency", {
    timeModel: "shift", activityModel: "incident_response", quantityModel: "none", tools: "equipment_machinery",
    skillTimeAttribution: "involvement", evidence: ["system_record", "supervisor_confirmation"], verifier: "supervisor",
    regulatory: "safety_record", privacy: "security_sensitive", result: "handover", livingCv: "hours_and_cases",
    modules: ["shift_post"],
    modelledOn: "patrol log / daily activity report: post, timestamped checkpoints, incidents, response, handover",
  }),
  A("management_leadership", {
    timeModel: "activity_duration", activityModel: "deliverable", quantityModel: "none", tools: "software_systems",
    skillTimeAttribution: "involvement", evidence: ["artifact", "document", "peer_review"], verifier: "peer",
    regulatory: "none", privacy: "client_confidential", result: "outcome", livingCv: "deliverables",
    modules: ["management"],
    modelledOn: "management record: team, decisions, plans, meetings, outcomes — involvement, not clocked hours",
  }),
  A("creative_media", {
    timeModel: "activity_duration", activityModel: "deliverable", quantityModel: "none", tools: "software_systems",
    skillTimeAttribution: "activity", evidence: ["artifact", "client_confirmation"], verifier: "client",
    regulatory: "none", privacy: "none", result: "outcome", livingCv: "deliverables",
    modules: ["creative_deliverable"],
    modelledOn: "production / publication log: deliverable, medium, publication, client acceptance",
  }),
  A("legal_professional_services", {
    timeModel: "case_time", activityModel: "case_matter", quantityModel: "cases", tools: "software_systems",
    skillTimeAttribution: "precise", evidence: ["artifact", "document", "client_confirmation"], verifier: "client",
    regulatory: "supervised_practice", privacy: "client_confidential", result: "outcome", livingCv: "hours_and_cases",
    modules: ["case_matter", "supervision"],
    modelledOn: "matter time entry (6-minute units) + supervised-practice record where applicable",
  }),
  A("public_service", {
    timeModel: "clock", activityModel: "case_matter", quantityModel: "cases", tools: "software_systems",
    skillTimeAttribution: "involvement", evidence: ["system_record", "document"], verifier: "supervisor",
    regulatory: "none", privacy: "client_confidential", result: "outcome", livingCv: "hours_and_cases",
    modules: ["public_service"],
    modelledOn: "case / service record: case reference, decision, channel — reference only",
  }),
  A("cleaning_facility", {
    timeModel: "shift", activityModel: "task", quantityModel: "physical_output", tools: "equipment_machinery",
    skillTimeAttribution: "activity", evidence: ["photo", "supervisor_confirmation", "client_confirmation"],
    verifier: "client", regulatory: "safety_record", privacy: "none", result: "completed_partial_blocked",
    livingCv: "hours_and_output",
    modules: ["cleaning_facility", "materials_tools"],
    modelledOn: "facility checklist: area, checklist items, consumables, sign-off",
  }),
  A("personal_services", {
    timeModel: "session", activityModel: "session", quantityModel: "cases", tools: "instruments",
    skillTimeAttribution: "precise", evidence: ["photo", "client_confirmation"], verifier: "client",
    regulatory: "none", privacy: "client_confidential", result: "outcome", livingCv: "hours_and_cases",
    modules: ["care_visit"],
    modelledOn: "appointment book: service, duration, client acceptance, before/after photo where consented",
  }),
  A("military_regulated", {
    timeModel: "shift", activityModel: "task", quantityModel: "none", tools: "equipment_machinery",
    skillTimeAttribution: "involvement", evidence: ["document", "supervisor_confirmation"], verifier: "supervisor",
    regulatory: "licence_hours", privacy: "security_sensitive", result: "handover", livingCv: "continuity_record",
    modules: ["military_regulated", "shift_post"],
    modelledOn: "service record / exercise log with clearance-bounded detail",
  }),
];

const ARCHETYPE_BY_ID: ReadonlyMap<WorkEvidenceArchetypeId, WorkEvidenceArchetype> = new Map(
  WORK_EVIDENCE_ARCHETYPES.map((a) => [a.id, a]),
);

/**
 * ISCO-08 → archetypes. Keyed on the SUB-MAJOR group (2 digits) — the 43
 * families of the whole world of work — with MINOR-group (3 digits) rows
 * where one family genuinely mixes patterns. Resolution: 3-digit row wins,
 * else 2-digit, else the major group's first sub-major fallback. Data, not
 * a switch: adding an override is one row.
 */
export const ISCO_ARCHETYPES: Readonly<Record<string, readonly WorkEvidenceArchetypeId[]>> = {
  // 0 · Armed forces
  "01": ["military_regulated", "management_leadership"],
  "02": ["military_regulated", "shift"],
  "03": ["military_regulated", "shift"],
  // 1 · Managers
  "11": ["management_leadership", "public_service"],
  "12": ["management_leadership", "knowledge_project"],
  "13": ["management_leadership", "field_project"],
  "14": ["management_leadership", "hospitality", "sales_commercial"],
  // 2 · Professionals
  "21": ["engineering_technical", "knowledge_project"],
  "22": ["clinical_healthcare", "supervised_practice", "case_client"],
  "23": ["education_teaching", "supervised_practice"],
  "24": ["knowledge_project", "case_client"],
  "25": ["software_digital", "knowledge_project"],
  "26": ["knowledge_project", "case_client"],
  "261": ["legal_professional_services", "supervised_practice"],
  "262": ["knowledge_project", "research"],
  "263": ["research", "case_client", "supervised_practice"],
  "264": ["creative_media"],
  "265": ["creative_media"],
  // 3 · Technicians and associate professionals
  "31": ["engineering_technical", "field_project"],
  "315": ["driving_mobile", "shift"],
  "32": ["clinical_healthcare", "supervised_practice"],
  "33": ["office_administrative", "sales_commercial", "case_client"],
  "34": ["case_client", "supervised_practice"],
  "342": ["personal_services", "education_teaching"],
  "343": ["creative_media", "hospitality"],
  "35": ["software_digital", "customer_service", "creative_media"],
  // 4 · Clerical support workers
  "41": ["office_administrative"],
  "42": ["customer_service", "office_administrative"],
  "43": ["logistics_warehouse", "office_administrative"],
  "44": ["office_administrative"],
  // 5 · Service and sales workers
  "51": ["personal_services", "hospitality"],
  "511": ["driving_mobile", "hospitality", "shift"],
  "513": ["hospitality"],
  "52": ["sales_commercial", "customer_service"],
  "53": ["care_work", "supervised_practice"],
  "54": ["security_emergency", "shift"],
  // 6 · Skilled agricultural, forestry and fishery workers
  "61": ["agriculture_forestry_fisheries", "machine_equipment_operation"],
  "62": ["agriculture_forestry_fisheries", "machine_equipment_operation"],
  "63": ["agriculture_forestry_fisheries"],
  // 7 · Craft and related trades workers
  "71": ["construction_trade", "field_project"],
  "72": ["maintenance_repair", "construction_trade", "engineering_technical"],
  "721": ["construction_trade", "maintenance_repair", "engineering_technical"],
  "73": ["production_manufacturing", "creative_media"],
  "74": ["maintenance_repair", "construction_trade"],
  "75": ["production_manufacturing", "construction_trade"],
  // 8 · Plant and machine operators, and assemblers
  "81": ["production_manufacturing", "machine_equipment_operation"],
  "82": ["production_manufacturing"],
  "83": ["driving_mobile", "machine_equipment_operation"],
  "834": ["machine_equipment_operation", "field_project"],
  "835": ["shift", "driving_mobile"],
  // 9 · Elementary occupations
  "91": ["cleaning_facility", "shift"],
  "92": ["agriculture_forestry_fisheries"],
  "93": ["construction_trade", "production_manufacturing", "logistics_warehouse"],
  "94": ["hospitality", "shift"],
  "95": ["sales_commercial"],
  "96": ["cleaning_facility", "logistics_warehouse", "shift"],
};

/**
 * Archetypes added by the RELATIONSHIP the work is done under, not by the
 * occupation: an apprentice electrician records trade work AND supervised
 * training hours. Keyed on the engagement relationship slug the product
 * already holds (`relationshipTypes`). Unknown slug → nothing added.
 */
export const RELATIONSHIP_ARCHETYPES: Readonly<Record<string, readonly WorkEvidenceArchetypeId[]>> = {
  student: ["apprenticeship_training", "supervised_practice"],
  volunteer: ["field_project"],
};

export function archetypesForRelationship(
  relationshipSlug: string | null | undefined,
): readonly WorkEvidenceArchetypeId[] {
  return RELATIONSHIP_ARCHETYPES[String(relationshipSlug ?? "").trim()] ?? [];
}

/** The 43 ISCO-08 sub-major groups — the closed set the guard proves the
 *  map covers, so no occupation family can fall through. */
export const ISCO_SUB_MAJOR_GROUPS = [
  "01", "02", "03",
  "11", "12", "13", "14",
  "21", "22", "23", "24", "25", "26",
  "31", "32", "33", "34", "35",
  "41", "42", "43", "44",
  "51", "52", "53", "54",
  "61", "62", "63",
  "71", "72", "73", "74", "75",
  "81", "82", "83",
  "91", "92", "93", "94", "95", "96",
] as const;

/**
 * Archetypes for an ISCO-08 code (1–4 digits, as `esco_occupations.isco_group`
 * carries it). Unknown or malformed → [] — the composer then shows the
 * universal core alone, never a guessed module.
 */
export function archetypesForIsco(iscoCode: string | null | undefined): readonly WorkEvidenceArchetypeId[] {
  const code = String(iscoCode ?? "").trim();
  if (!/^\d{1,4}$/.test(code)) return [];
  for (const len of [3, 2] as const) {
    if (code.length < len) continue;
    const hit = ISCO_ARCHETYPES[code.slice(0, len)];
    if (hit) return hit;
  }
  return [];
}

export function archetypeById(id: WorkEvidenceArchetypeId): WorkEvidenceArchetype {
  return ARCHETYPE_BY_ID.get(id)!;
}

/** The composed journal shape for a set of archetypes — the assembly
 *  contract the composer consumes (owner: UNIVERSAL CORE + TIME MODEL +
 *  CONTEXT + ACTIVITY MODEL + ARCHETYPE MODULES + EVIDENCE + VERIFICATION). */
export type JournalComposition = {
  readonly archetypes: readonly WorkEvidenceArchetypeId[];
  /** The strictest time model any archetype needs. */
  readonly timeModel: TimeModel;
  readonly activityModels: readonly ActivityModel[];
  readonly quantityModels: readonly QuantityModel[];
  /** Union of module ids, in catalogue order — only these fields may show. */
  readonly modules: readonly JournalModuleId[];
  /** Union of metric slugs the modules add (never a core slug). */
  readonly metricSlugs: readonly string[];
  readonly evidence: readonly EvidenceKind[];
  readonly verifiers: readonly Verifier[];
  /** The most cautious attribution any archetype allows: if ANY says
   *  involvement-only, the analytics must not claim more for the entry. */
  readonly skillTimeAttribution: SkillTimeAttribution;
  readonly privacy: readonly PrivacyModel[];
  readonly regulatory: readonly RegulatoryModel[];
};

const ATTRIBUTION_CAUTION: Record<SkillTimeAttribution, number> = {
  precise: 0,
  activity: 1,
  involvement: 2,
};

export function composeJournal(ids: readonly WorkEvidenceArchetypeId[]): JournalComposition {
  const archetypes = [...new Set(ids)].map(archetypeById);
  const uniq = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];
  const modules = uniq(archetypes.flatMap((a) => a.modules));
  const moduleOrder = Object.keys(JOURNAL_MODULES) as JournalModuleId[];
  modules.sort((x, y) => moduleOrder.indexOf(x) - moduleOrder.indexOf(y));
  let timeModel: TimeModel = "activity_duration";
  let attribution: SkillTimeAttribution = "precise";
  for (const a of archetypes) {
    if (TIME_MODELS.indexOf(a.timeModel) > TIME_MODELS.indexOf(timeModel)) timeModel = a.timeModel;
    if (ATTRIBUTION_CAUTION[a.skillTimeAttribution] > ATTRIBUTION_CAUTION[attribution]) {
      attribution = a.skillTimeAttribution;
    }
  }
  return {
    archetypes: archetypes.map((a) => a.id),
    timeModel,
    activityModels: uniq(archetypes.map((a) => a.activityModel)),
    quantityModels: uniq(archetypes.map((a) => a.quantityModel)).filter((q) => q !== "none"),
    modules,
    metricSlugs: uniq(modules.flatMap((m) => [...JOURNAL_MODULES[m]])),
    evidence: uniq(archetypes.flatMap((a) => a.evidence)),
    verifiers: uniq(archetypes.map((a) => a.verifier)),
    skillTimeAttribution: archetypes.length === 0 ? "involvement" : attribution,
    privacy: uniq(archetypes.map((a) => a.privacy)).filter((p) => p !== "none"),
    regulatory: uniq(archetypes.map((a) => a.regulatory)).filter((r) => r !== "none"),
  };
}
