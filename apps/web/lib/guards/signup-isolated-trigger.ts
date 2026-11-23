/**
 * Whether `.github/workflows/signup-isolated.yml` runs the core journeys for a
 * pull request that changes `path`. It reads the workflow's own change filter
 * (the `grep -qE` pattern in the `changes` job), so a guard checks what CI
 * actually does, not a copy of it. Markdown never runs the journeys.
 */
export function signupIsolatedRunsFor(workflow: string, path: string): boolean {
  const m = workflow.match(/if grep -qE '([^']+)' "\$RUNNER_TEMP\/not-markdown\.txt"/);
  if (!m) throw new Error("signup-isolated.yml has no change filter (grep -qE '…' not-markdown.txt)");
  if (/\.md$/.test(path)) return false;
  return new RegExp(m[1]).test(path);
}
