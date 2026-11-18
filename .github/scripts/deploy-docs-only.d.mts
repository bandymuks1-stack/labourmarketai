export const MAX_FILES: number;
export function judgeDocsOnly(compare?: {
  status?: string;
  files?: { filename?: string; previous_filename?: string }[];
}): { skip: boolean; reason: string };
export function liveBuildOf(report: unknown): string | null;
