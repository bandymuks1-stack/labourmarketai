# Server lifecycle — binding policy v1

> Established 2026-08-29, after a real workflow defect. Applies to every agent
> and every human working in this repository.

## The defect that created this rule

An agent reported obsolete dev servers as stopped **because it had been told
they were stopped**, without inspecting the machine. They were still running.
Three `next start` servers were serving stale builds on `:3111`, `:3112` and
`:3113`, and a port scan that only covered the ports the agent remembered
starting missed two more it had never known about: a frozen `next dev` on
`:3106` (it had fallen back there because `:3100` was already taken) and an
abandoned worktree server on `:3117`.

This is the same failure class the repository has already paid for twice:

* **2026-08-28** — a `next start -p 3100` left over from another worktree, 22
  commits behind, answered the e2e suite for a whole session. `scrollY` stayed
  at exactly 0 with the target element present, intermittently, and it read
  exactly like a product race in the page's own lifecycle. It was not one.
* The same day, a source-scanning guard suite was run *while a build wrote into
  the same worktree*, and reported 12 failures that did not exist.

In every case the cost was not the stray process. It was that a **claim was
made without a check**, and everything downstream inherited the error.

## The rule

1. **Development and build servers are temporary resources.** They exist to
   answer one question and stop when it is answered.

2. **Never leave `next dev` or `next start` running after verification**
   unless a retained preview server is explicitly required and documented.

3. **Every started server is recorded** with its purpose, its port and the
   task that owns it.

4. **Every completed task stops its own server before reporting completion.**
   The task that started it owns stopping it.

5. **Before claiming "stopped", verify the process and the port are gone.**
   Two independent checks, not one: the process table *and* a real connection
   attempt. A port can be bound by a hung process that answers nothing —
   `:3106` above was listening and timed out.

6. **Background task panels end at zero**, unless a deliberately retained
   server is documented in the report that leaves it running.

## The claim rule this generalises to

**Never report a process stopped, a PR merged, a change deployed, or a result
verified unless the current state has been directly checked.**

Being told something is true is not a check. Having done it yourself earlier is
not a check — state moves. Reporting someone else's assertion as your own
finding launders an assumption into a fact, and the next decision is made on it.

If a check was not run, the honest report says so.

## Practical form

Enumerate what is actually listening, resolved to owning processes:

```powershell
$procs = @{}
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  ForEach-Object { $procs[[int]$_.ProcessId] = $_.CommandLine }
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $procs.ContainsKey([int]$_.OwningProcess) -and
                 $procs[[int]$_.OwningProcess] -match 'labourmarketai' } |
  Select-Object -Unique LocalPort, OwningProcess | Sort-Object LocalPort
```

Do not scan only the ports you remember starting. Next falls back to the next
free port when its own is taken, so the port a server ended up on is not
necessarily the port that was asked for.

Then confirm each stopped port really refuses a connection, rather than
trusting the process table alone.

## Related

* `apps/web/playwright.config.ts` — `reuseExistingServer: !LOCAL_STACK`, so a
  local run fails loudly instead of inheriting a stranger's server (#1332).
* `apps/web/tests/e2e/build-identity.ts` — asserts the server answering
  `baseURL` serves the build in `.next/BUILD_ID`, which catches a foreign
  server that is up and responding but running different code (#1334).

Those two close the door for the e2e suite. This policy covers everything
else — and covers the part neither of them can: what a person or an agent
*says* about the machine.
