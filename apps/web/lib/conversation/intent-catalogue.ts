import type { RoutedIntent } from "./intent-registry";

/**
 * The ONE-LINE HINT per EXISTING conversation intent — the whole vocabulary
 * the Gemini proposer (owner approval 2026-09-05) may choose from. Typed as a
 * complete record so a new intent cannot ship without a hint (it would be
 * invisible to the proposer and reachable only by the deterministic router).
 *
 * Product vocabulary only: no data, no names, no ids of anything. English,
 * because the model reads the catalogue while the sentence may be in any
 * language. Pure module: no IO, safe on client and server.
 */
export const INTENT_HINTS: Readonly<Record<RoutedIntent, string>> = {
  "log-work": "record work the person did (a work-journal entry: what, when, where)",
  "find-work": "find work / job opportunities for the person",
  opportunities: "show matching opportunities for the person",
  "write-employer": "draft a message to an employer or company",
  translate: "translate a message or text",
  "calendar-view": "show the person's plan, agenda, calendar or today's context",
  reminder: "set a reminder",
  cv: "the person's CV: import, show or work on it",
  "cv-export": "download or print the person's verified CV sheet",
  profile: "the person's profile: add a language, skill, experience or education",
  "player-card": "show the person's professional card (player card)",
  experiences: "the person's work experience list",
  engagements: "the person's engagements, contracts and memberships",
  offers: "incoming booking offers the person received",
  "interest-inbox": "responses to the person's own interest in opportunities",
  criteria: "read back the person's search criteria or preferences",
  "next-action": "what the person should do next",
  resume: "resume where the person left off",
  "skill-gap": "which skills the person is missing for a goal",
  "journal-recent": "show the person's recent work-journal entries",
  figures: "confirmed hours, figures or a report (also a CSV export)",
  documents: "the person's documents and certificates: what is valid, expiring or missing",
  "add-document": "record a new document or certificate the person holds",
  "learning-compass": "what the person should learn next (learning compass)",
  "need-workers": "a company needs workers: describe a demand / need",
  "need-service": "a company or person needs a service from the marketplace",
  "offer-value": "offer a service or value on the marketplace",
  "profession-statement": "the person states their profession or a past job ('esu buhalteris', 'dirbau projektų vadovu 5 metus')",
  availability: "the person states from when they can work ('galiu dirbti nuo spalio 1 d.', 'available from October')",
  "company-overview": "overview of the company workspace",
  "create-organization": "create a company or organization",
  context: "which company or role the user is acting for (context readback)",
  "switch-context": "switch the company or role the user acts for",
  projects: "list the company's projects (or the person's projects)",
  "open-project": "open one specific project",
  "create-project": "create a new project or site",
  candidates: "show candidates for the company's demand",
  "find-workers": "find or search workers for the company",
  "who-available": "who in the company's team is free or available in a period",
  "add-task": "add a task or work package to a project",
  "task-status": "mark a task as done, started or blocked",
  "stage-status": "mark a project stage as done, started or blocked",
  "confirm-work": "the employer confirms a person's work entry (verifies the skills it proves), or sees what awaits confirmation",
  "move-worker": "move a person from one project to another (with the consequences first)",
  "project-risk": "which project is at risk or how the projects are going",
  "project-readiness": "what a project or its team still needs (readiness, documents, gaps)",
  "invite-client": "an agency invites a client company",
  "invite-candidate": "invite a worker or candidate to the company's team",
  "propose-candidate": "an agency proposes a candidate for a client's need",
  "client-demand": "what the agency's clients need (shared demands)",
  "proposal-status": "status of the agency's proposals / client decisions",
  "agency-offers": "the candidates an agency offered to this company",
  "offer-capacity":
    "the speaker HAS people or capacity and is offering them to the market (agency supply: \"we have 20 welders and are looking for work for them\") — the opposite of needing workers",
  "invite-student": "an education institution invites a student / learner",
  programmes: "an institution's programmes, cohorts or learner assignment",
  lmc: "credits, balance or payments (LMC)",
  "admin-approvals": "the approvals area (what awaits approval)",
  "admin-requests": "admin requests area",
  timesheets: "timesheets and planning area",
  "hours-import": "import hours from a file",
  "work-hours": "work hours and allocations",
  absences: "absences, leave or holidays",
  "market-map": "the labour-market map",
  activity: "the activity centre / recent activity",
  "messages-view": "messages and conversations inbox",
  invitations: "invitations addressed to me (join an organization, become a student or an employee)",
};

/** The catalogue as the proposer receives it — ids + hints, nothing else. */
export function intentCatalogue(): ReadonlyArray<{ readonly id: RoutedIntent; readonly hint: string }> {
  return (Object.keys(INTENT_HINTS) as RoutedIntent[]).map((id) => ({ id, hint: INTENT_HINTS[id] }));
}
