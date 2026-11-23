/**
 * The education types a worker can state — the SAME closed set as the web
 * (`apps/web/lib/worker/worker-education-model.ts`, `EDUCATION_TYPE_SLUGS`).
 * Their labels are the web's own words (`cvSections.educationTypes.*`), carried
 * here as `cv.educationType.*`. Both pinned by
 * `apps/web/lib/guards/mobile-living-cv-editing.test.ts`.
 */
export const EDUCATION_TYPE_SLUGS = [
  "primary",
  "secondary",
  "vocational",
  "college",
  "university_bachelor",
  "university_master",
  "doctorate",
  "course_certificate",
  "other",
] as const;

export type EducationTypeSlug = (typeof EDUCATION_TYPE_SLUGS)[number];

export function isEducationType(value: string): value is EducationTypeSlug {
  return (EDUCATION_TYPE_SLUGS as readonly string[]).includes(value);
}
