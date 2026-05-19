/**
 * SAMPLE preview data — clearly labelled, not real and not live.
 *
 * Used only to render the foundation UI so the visual system can be reviewed.
 * Nothing here is persisted, claimed as a real user, or wired to a backend.
 * Always show {@link SAMPLE_NOTICE} on any surface that renders this data.
 */
import type {
  CommunicationThreadStart,
  CompanyProfile,
  HiringNeed,
  Profile,
} from "./types";

export const SAMPLE_NOTICE = "Sample data — preview only, not live";

export const sampleProfiles: Profile[] = [
  {
    id: "p-aria",
    role: "worker",
    displayName: "Aria Kovács",
    headline: "Senior Structural Welder",
    location: "Rotterdam, NL",
    availability: "open",
    experienceYears: 11,
    skills: ["MIG/MAG welding", "Blueprint reading", "Steel fabrication", "QA inspection", "Rigging"],
    languages: ["English", "Hungarian", "Dutch"],
    bio: "Eleven years on heavy structural sites. Comfortable leading a 4-person fabrication crew.",
    signalScore: 92,
    verified: true,
  },
  {
    id: "p-mateo",
    role: "worker",
    displayName: "Mateo Silva",
    headline: "Logistics & Warehouse Lead",
    location: "Lisbon, PT",
    availability: "open",
    experienceYears: 7,
    skills: ["Inventory control", "Forklift", "Team scheduling", "WMS systems"],
    languages: ["Portuguese", "English", "Spanish"],
    bio: "Runs high-throughput distribution floors. Strong on shift planning and safety.",
    signalScore: 78,
    verified: true,
  },
  {
    id: "p-lena",
    role: "worker",
    displayName: "Lena Brandt",
    headline: "CNC Machinist",
    location: "Munich, DE",
    availability: "engaged",
    experienceYears: 5,
    skills: ["CNC programming", "Fanuc", "Tolerancing", "Tool setting"],
    languages: ["German", "English"],
    bio: "Precision machining for automotive subcontractors.",
    signalScore: 64,
    verified: false,
  },
  {
    id: "r-noor",
    role: "recruiter",
    displayName: "Noor Habibi",
    headline: "Industrial Talent Partner",
    location: "Amsterdam, NL",
    availability: "open",
    experienceYears: 9,
    skills: ["Sourcing", "Workforce planning", "Compliance", "Trades hiring"],
    languages: ["English", "Arabic", "Dutch"],
    bio: "Places skilled trades crews across the Benelux region.",
    signalScore: 81,
    verified: true,
  },
];

export const sampleCompanies: CompanyProfile[] = [
  {
    id: "c-northforge",
    name: "Northforge Industrial",
    industry: "Heavy fabrication",
    location: "Rotterdam, NL",
    size: "201–500",
    about: "Structural steel fabrication for marine and energy infrastructure.",
    hiring: true,
    signalScore: 88,
    verified: true,
  },
  {
    id: "c-portline",
    name: "Portline Logistics",
    industry: "Logistics",
    location: "Lisbon, PT",
    size: "51–200",
    about: "Port-side distribution and last-mile coordination.",
    hiring: true,
    signalScore: 73,
    verified: true,
  },
];

export const sampleHiringNeeds: HiringNeed[] = [
  {
    id: "n-welder",
    companyId: "c-northforge",
    roleTitle: "Senior Structural Welder",
    location: "Rotterdam, NL",
    engagement: "full-time",
    seats: 3,
    mustHaveSkills: ["MIG/MAG welding", "Blueprint reading", "Steel fabrication"],
    startWindow: "Within 4 weeks",
    status: "open",
  },
  {
    id: "n-logistics",
    companyId: "c-portline",
    roleTitle: "Warehouse Shift Lead",
    location: "Lisbon, PT",
    engagement: "shift",
    seats: 2,
    mustHaveSkills: ["Inventory control", "Team scheduling", "WMS systems"],
    startWindow: "Within 2 weeks",
    status: "open",
  },
];

export const sampleThreadStarts: CommunicationThreadStart[] = [
  {
    id: "t-1",
    fromEntityId: "c-northforge",
    toEntityId: "p-aria",
    context: "Hiring need — Senior Structural Welder",
    openingMessage:
      "Your fabrication background lines up with our Rotterdam crew. Open to a short intro call?",
    createdAt: "2026-05-19",
  },
];
