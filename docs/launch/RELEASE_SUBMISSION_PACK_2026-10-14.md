# Release & submission pack — 2026-10-14

**Purpose.** This is everything the owner needs to submit LabourMarket.ai to Google Play, the App Store, the ChatGPT plugin directory and the Claude connector directory.
- What an agent can prepare is prepared here or in code.
- What only the owner can do is listed in §6, one line each.

**Builds on (does not replace):**
- [`DISTRIBUTION_SURFACE_READINESS_2026-09-14.md`](DISTRIBUTION_SURFACE_READINESS_2026-09-14.md) — §4 ChatGPT, §5 Claude.
- [`../mobile/STORE_RELEASE_READINESS_2026-09-13.md`](../mobile/STORE_RELEASE_READINESS_2026-09-13.md) and [`../mobile/MOBILE_STATUS_2026-10-14.md`](../mobile/MOBILE_STATUS_2026-10-14.md).
- [`../integrations/CHATGPT_MCP_CLIENT_V1.md`](../integrations/CHATGPT_MCP_CLIENT_V1.md) and [`../integrations/LLM_INTEGRATION_COVERAGE_V1.md`](../integrations/LLM_INTEGRATION_COVERAGE_V1.md).

The older store-asset packs (`mobile-store-assets-*-v1.md`, `mobile-store-readiness-v2.md`) were written for a PWA/TWA wrapper. They describe screens the **native** app does not have, such as bookings and CV export. **Do not submit their listing text.** §2 and §3 replace it.

**Scope update 2026-11-02.** The native app has grown since 10-14:
- work-journal correction (#2916);
- messages (#2928);
- in-app notifications (#2929);
- the person's projects (#2941).

These sit next to the jobs, opportunities, post-a-need and availability screens already on `main`. §1, §2 and §3 below are updated to that scope. **Nothing has been submitted or published. No store account, EAS project or signing key was created.** Those stay owner actions (§6).

---

## 0. Shortest path to TestFlight internal + Play internal testing (update 2026-11-11)

**Goal:** a signed build in the hands of internal testers on both stores. A public release comes after (§6 items 8–10).

**Build route chosen: EAS Build + EAS Submit**, started by hand from GitHub Actions (`eas-release.yml`, its own PR). The GitHub Actions signed build was rejected, for four reasons:

- **No Mac.** The owner works on Windows. EAS builds iOS on Expo's macOS machines and creates the distribution certificate and provisioning profile itself. A GitHub macOS runner would need them made by hand first.
- **Fewest secrets in GitHub.** The signing material (iOS certificate + profile, Android upload keystore) and the store keys (App Store Connect API key, Play service account) stay in the owner's Expo account. GitHub holds ONE secret, `EXPO_TOKEN`. The repository is public. The GitHub route would put five or more signing secrets beside it and need renewal by hand.
- **Cost 0 €.** The repository already pins EAS profiles (`apps/mobile/eas.json`, guarded by `mobile-release-config.test.ts`). The Expo free plan has a monthly build quota and a slower queue; check expo.dev/pricing before relying on a number. The store fees below are unavoidable on either route.
- **A fallback stays.** `android.yml` already builds a release AAB with Gradle. If the EAS quota ever blocks a release, the same job can sign with an upload key, at the cost of one keystore secret. That stays an owner decision.

### 0.1 Owner steps, in order (the parts only the owner can do)

| # | Step | Detail | Time / cost |
|---|---|---|---|
| O-1 | **Apple Developer Program** | Enrol at developer.apple.com, as an individual or an organization. An organization needs a D-U-N-S number; an individual is the faster route. | 99 USD/year; individual about 1–2 days, organization longer |
| O-2 | **App Store Connect record** | New app, bundle id `ai.labourmarket.app`, name "LabourMarket.ai", primary language. Then create an **App Store Connect API key** (Users and Access → Integrations, App Manager role) and upload it to EAS: `eas credentials` → iOS → App Store Connect API key. | minutes |
| O-3 | **Google Play Console** | Choose the account type deliberately. **Personal:** before production access, a closed test must run with at least **12 testers opted in for 14 days in a row**. Internal testing is open immediately. **Organization:** no such rule, but it needs a D-U-N-S number and organization verification. | 25 USD once |
| O-4 | **Expo account + `eas init`** | Create a free account at expo.dev. Run `cd apps/mobile && npx eas-cli@latest login && npx eas-cli@latest init`. This writes `extra.eas.projectId` (and `owner`) into `app.json`; the agent then commits that public id. Create an access token (expo.dev → Access tokens) and store it as the GitHub secret `EXPO_TOKEN`. | minutes, 0 € |
| O-5 | **Public build configuration in EAS** | The app bundle needs the three public values, as plain-text EAS variables in the `production` environment: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the publishable anon key, the same as `vars.PROD_QA_ANON_KEY`) and `EXPO_PUBLIC_API_BASE_URL=https://labourmarket.ai`. Set them with `eas env:create --environment production --visibility plaintext`. **Never** set the service-role key; client-core refuses it at runtime anyway. | minutes |
| O-6 | **Signing** | Run the first build interactively from the owner's own terminal, so EAS can create and store the credentials: `eas build -p ios --profile production` (Apple ID sign-in, then EAS creates the certificate + profile) and `eas build -p android --profile production` (EAS generates the upload keystore). On Play, keep **Play App Signing** on (it is mandatory for new apps). Google then holds the app-signing key and EAS holds the upload key. | one build each |
| O-7 | **First Play upload is manual** | The Play API cannot create an app's first release. Upload the first AAB by hand under Testing → Internal testing. After that, `eas submit -p android` works with a Play **service account** JSON uploaded to EAS (`eas credentials` → Android → Google Service Account). | once |
| O-8 | **App Links + Universal Links** | Set `ANDROID_CERT_FINGERPRINTS` on the production web deploy to the **Play App Signing** SHA-256 (Play Console → App integrity), and also the upload key's SHA-256 if testers sideload. Set `APPLE_TEAM_ID`. Until then `/.well-known/assetlinks.json` and `apple-app-site-association` return 404, by design. | minutes |
| O-9 | **Reviewer / tester account** | ONE synthetic worker account with a password, at least one confirmed journal entry and one workspace (§6 item 4). Its credentials go only into the store consoles' review fields and the `production-qa` secret `MOBILE_QA_PASSWORD`, never into the repo or a PR. | minutes |
| O-10 | **Testers** | TestFlight **internal**: up to 100 App Store Connect users, no Beta App Review. Play **internal testing**: up to 100 e-mail addresses on a list. | minutes |

### 0.2 What then runs without the owner, and what never does

- **GitHub → Actions → "EAS release build" → Run workflow** (platform: ios / android / all). It builds signed packages on EAS.
- **Upload is off by default.** The workflow's `submit` input defaults to `false`. Setting it to `true` uploads to **TestFlight / Play internal testing only**: the `production` submit profile names no release track or review, and promotion to production stays a click in each console.
- **No secret: no build.** Without `EXPO_TOKEN` or `extra.eas.projectId` the workflow **skips cleanly**. It exits 0 and says which value is missing in its summary. Nothing in the repository becomes a key.
- **Every run is the owner's decision.** The job runs in the `store-release` GitHub environment. Add the owner as its required reviewer (Settings → Environments), so no agent-started run can build or upload without the owner's click.

### 0.3 Known gaps a reviewer may raise (status 2026-11-11)

| Gap | Risk | Status |
|---|---|---|
| Account deletion is a link to the web, not an in-app action | Apple 5.1.1(v): deletion must be **initiated in the app**. A link is accepted only when it goes straight to the deletion step. | The capability is not exposed through `/api/mcp`: the request exists only as a web server action calling `submit_privacy_request_v1`. Making it reachable from the app needs a new MCP capability. That is a privacy decision for the owner, so it is held. |
| No push notifications | none for review | options in §8, nothing added |
| No offers screen | none for review | proposed separately; client reuse only |

---

## 1. What the native app is (the scope every listing must match)

Expo / React Native app `apps/mobile`, id `ai.labourmarket.app`, version 0.1.0. Data reaches the app only through `/api/mcp` under the signed-in person's own permissions.

| Screen | What a person does |
|---|---|
| Sign in / Create account | E-mail + password. "Forgot your password?" opens the web recovery flow. Register shows terms + privacy links. |
| Today | This week's own work figures and the latest journal entries. |
| Work journal | Their own entries, newest first. |
| Log work | Date, site, notes → draft → confirm (two steps; nothing is saved until confirmed). |
| Correct an entry | Change a confirmed entry: draft → before/after preview → confirm. The earlier version is kept as superseded, never overwritten. |
| Messages | Their own in-app conversations. Open a thread and reply. A reply is drafted, previewed and only then sent (draft → confirm). |
| Notifications | Their own in-app notifications, read when the screen is opened. Mark one or all as read. Some open the matching web page. **No push.** |
| My projects | The projects they are assigned to: active or ended, what is still needed from them, and the latest instruction (answered in Messages). The full project page (stages, documents, team) is on the website. |
| Jobs | Search the public vacancy board (the same anonymous view as the website). A job's full page opens on the website. |
| Opportunities | Open opportunities. Tell the other side they are interested (draft → confirm). |
| Post a need | For the organization they act for: describe a need → draft → confirm. |
| Who is free | The workspace's availability (committed is not unavailable), the same read as the web planning page. |
| Profile | Name, roles, skills inferred from their own journal (Living CV read). |
| Settings | Language (6), workspace switch, privacy / deletion / terms / support links, sign out. |

**Not in the native app:**
- calendar, AI chat, marketplace;
- push notifications, camera, offline queue;
- Google / Apple sign-in.

These are on the website (`labourmarket.ai`), which the app links to where relevant. The listing must not promise them. Apple guideline 2.3 and Play's misleading-claims policy both reject that.

**Facts read from the BUILT Android artifact** (`android.yml`, PR #2371 run 38601317810):

| Fact | Value |
|---|---|
| minSdk / targetSdk | 24 / **36** (Play floor since 2026-08-31: 36) |
| AAB | builds (43.6 MB, debug-signed proof — the store build is signed by EAS / the owner's upload key) |
| Permissions | INTERNET, VIBRATE; SYSTEM_ALERT_WINDOW, USE_BIOMETRIC, USE_FINGERPRINT come from library templates and are unused — being blocked (follow-up PR) |
| Emulator proof | launch, failed sign-in shown honestly, airplane-mode sign-in shows "could not reach the server" |

**iOS:**
- `ios.yml` proves a simulator Release build and the same journey.
- `ITSAppUsesNonExemptEncryption = false` (HTTPS only).
- iPhone-only (`supportsTablet: false`) until the screens are checked on iPad.
- Privacy manifest declares Email, Name, User ID, Other user content: linked, not tracking.

---

## 2. Google Play listing (draft for owner approval)

**App name:** LabourMarket.ai
**Category:** Business · **Ads:** none · **In-app purchases:** none · **Target audience:** 18+

**Short description (≤80):**
- EN: `Log your work, keep your work history and see what your experience shows.`
- LT: `Fiksuok savo darbą, kaupk darbo istoriją ir matyk, ką rodo tavo patirtis.`

**Full description (EN):**

> LabourMarket.ai keeps a record of the work you actually do.
>
> • Log a day of work in a few taps — date, site and what you did. You review it and confirm it before it is saved.
> • See your week at a glance: days worked and your latest entries.
> • Your work journal: every entry you have confirmed, newest first.
> • Your profile shows the skills your own entries point to — a living CV built from real work, not only from what you declare.
> • Made a mistake? Correct an entry. You see the before and after and confirm the change; the earlier version is kept.
> • Messages: read your conversations and reply. You see your reply before it is sent.
> • Notifications: what happened for you, in the app. Mark them read once you have seen them.
> • My projects: where you are assigned, what is still needed from you, and the latest instruction.
> • Search jobs, see opportunities and tell an employer you are interested.
> • Switch between the workspaces you belong to, in six languages (English, Lithuanian, Russian, Dutch, German, Polish).
>
> Your data is closed by default: other people see nothing unless you allow it. You can download your data and request account deletion at any time.
>
> More of the platform — full project pages, the calendar and the marketplace — is available at labourmarket.ai.

**Full description (LT):**

> LabourMarket.ai saugo įrašus apie darbą, kurį tikrai atlieki.
>
> • Užfiksuok darbo dieną keliais paspaudimais — data, objektas ir ką darei. Prieš išsaugant peržiūri ir patvirtini.
> • Matyk savo savaitę iš karto: dirbtas dienas ir naujausius įrašus.
> • Tavo darbo žurnalas: visi patvirtinti įrašai, naujausi viršuje.
> • Profilis rodo įgūdžius, į kuriuos rodo tavo pačių įrašai — gyvas CV iš tikro darbo, ne vien iš deklaracijų.
> • Suklydai? Pataisyk įrašą. Matai, kas buvo ir kas bus, ir patvirtini pakeitimą; ankstesnė versija išlieka.
> • Žinutės: skaityk savo pokalbius ir atsakyk. Atsakymą matai prieš jį išsiunčiant.
> • Pranešimai: kas tau nutiko, tiesiai programėlėje. Pažymėk perskaitytais, kai juos pamatai.
> • Mano projektai: kur esi priskirtas, ko dar reikia iš tavęs ir naujausias nurodymas.
> • Ieškok darbo, matyk galimybes ir pranešk darbdaviui, kad tau įdomu.
> • Perjunk darbo erdves, kurioms priklausai; šešios kalbos.
>
> Tavo duomenys uždari pagal nutylėjimą: kiti nemato nieko, kol pats neleidi. Savo duomenis gali atsisiųsti ir paprašyti ištrinti paskyrą bet kada.
>
> Daugiau platformos galimybių — visi projektų puslapiai, kalendorius ir prekyvietė — svetainėje labourmarket.ai.

**URLs:**
- Privacy policy: `https://labourmarket.ai/en/legal/privacy`
- **Account deletion (Data safety → "delete account URL"):** `https://labourmarket.ai/en/legal/data-deletion`. It is public and needs no sign-in. The page names both paths: e-mail, and the signed-in request at account → Privacy. The signed-in request is backed by `submit_privacy_request_v1`, which is live in production.
- Support / contact: `https://labourmarket.ai/en/legal/legal-notice` + `info@labourmarket.ai`.

### 2.1 Data safety form — answers derived from the code

| Question | Answer | Basis |
|---|---|---|
| Does the app collect or share user data? | Collects; **does not share** with third parties for their own purposes | No analytics/ads SDK (`mobile-release-config.test.ts` dependency pin) |
| Data encrypted in transit? | Yes | HTTPS only; client-core refuses a non-https Supabase URL |
| Can users request deletion? | Yes — URL above | public page + in-account request |
| Personal info → Email address | Collected, required, App functionality + Account management | sign-in |
| Personal info → Name | Collected, optional, App functionality | profile |
| Personal info → User IDs | Collected, required, App functionality | account id |
| App activity → Other user-generated content | Collected, required for the journal, App functionality | journal notes, site name, date |
| Messages → Other in-app messages | Collected (the replies a person sends), App functionality. Delivered only to the conversation's participants | `message.send_confirm` (#2928) |
| Location | **Not collected** by the app (a typed site name is user content, not device location) | no location permission (CI refuses one) |
| Photos, files, contacts, audio, health, financial | Not collected | no such permission or module |
| Crash logs / diagnostics | Not collected | no crash SDK |

**Note:** the platform itself (website) sends message and vacancy text to Google's Gemini API for translation and chat-intent suggestion. This is disclosed in the privacy policy (PR #2372). The **native app** sends its own text only to LabourMarket.ai: journal entries, corrections, message replies, a need, an interest. A message sent from the app is the same platform message the website may then translate for its reader, as already disclosed. If the owner later enables an AI feature reachable from the app, this form must be updated first.

**Content rating (IARC):** no violence, sexual content, gambling or drugs. **Users can now communicate:** since #2928 the app reads and replies to the platform's in-app messages, so the questionnaire's "users can interact / exchange messages" answer is **yes**. Messages go only between people already in a conversation on the platform; there is no open chat and no search for strangers.

**Review / test account:** required (the app is login-gated). §6 item 4.

---

## 3. App Store (draft for owner approval)

- **Name:** LabourMarket.ai
- **Subtitle (≤30):** `Your work, on record`
- **Category:** Business. **Age rating:** 17+ (job/work content; the platform targets adults; the questionnaire answers are all "none").
- **Keywords:** `work log,timesheet,work journal,cv,skills,construction,labour,jobs,profile,hours`
- **Description:** same text as Play §2 (EN).
- **Support URL:** `https://labourmarket.ai/en/legal/legal-notice`. **Privacy URL:** `/en/legal/privacy`.
- **App Privacy (nutrition label):** Data Linked to You: Contact Info (Email), Identifiers (User ID), User Content (Other; and Emails or Text Messages, which are the in-app replies a person sends, #2928), Name.
  - **Code gap to close before submitting:** on `main`, `ios.privacyManifests` in `app.json` declares Email, Name, User ID and Other User Content only. It lacks `NSPrivacyCollectedDataTypeEmailsOrTextMessages`. Add it in code (with its guard) first; the label and the manifest must match. **Data Used to Track You: none.** This must match `ios.privacyManifests` in `app.json`; the guard pins that.
- **Export compliance:** declared in the binary (`ITSAppUsesNonExemptEncryption = false`).
- **Sign in with Apple:** not required (guideline 4.8 applies only when a third-party login is offered; the app offers e-mail + password only).
- **Account deletion (5.1.1(v)):**
  - Settings → "How account deletion works" opens the public deletion page.
  - Settings → "Privacy, your data and deleting your account" opens the in-account request.
  - Deletion is a reviewed request, answered within one month. Apple accepts request-based deletion when the process is explained.
  - **Review note to paste:** "Account deletion: Settings → 'Privacy, your data and deleting your account' (opens the web account page, sign in with the same credentials) or Settings → 'How account deletion works' (public page, no sign-in). Deletion is processed by a person within one month; the request is recorded immediately."
- **Minimum functionality (4.2):** the app is a focused work client (journal and corrections, messages, notifications, projects, jobs), not a web wrapper. Screens are native, and data comes through the MCP API. State this in the review notes.

---

## 4. ChatGPT (plugin directory, "With MCP")

**Current route (Oct 2026):** MCP-backed ChatGPT apps are submitted as plugins in the OpenAI Platform's plugin portal. The following is from third-party guides citing OpenAI's "Submit plugins" and "Remote MCP server review requirements" pages. **The owner should confirm against the portal itself.**
- Verified publisher identity and Apps Management write access.
- Production MCP URL.
- Tool scan.
- Domain verification.
- Exact CSP domains.
- Reviewer credentials (no MFA / e-mail code).
- **5 positive + 3 negative test cases.**
- Privacy, terms, support and website URLs.
- **Projects with EU data residency cannot submit MCP plugins yet.** Submit from a non-EU-residency project.

| Field | Value |
|---|---|
| MCP URL | `https://labourmarket.ai/api/mcp` (stateless streamable HTTP, POST) |
| Auth | OAuth 2.1 via Supabase Auth (DCR + PKCE), discovered from `/.well-known/oauth-protected-resource`; consent screen `/[locale]/oauth/consent`; users revoke in account settings ("Connected apps") |
| Domain verification | `/.well-known/openai-apps-challenge` serves `OPENAI_APPS_CHALLENGE_TOKEN` as plain text (PR #2374) — owner pastes the portal's token into that env var |
| CSP — connect/resource domains | `https://labourmarket.ai`; no widget is served yet, so no resource domains |
| Tool annotations | `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` are **required fields** of every capability contract — the scan cannot find a tool without them |
| Rate limit | 600 calls / 5 min per person (PR #2373); invalid tokens 60 / 5 min per client |
| Name / short description | LabourMarket.ai — "Your work record, profile and workspace, from chat." |
| Long description | "Log work into your own work journal, read your weekly figures and your living CV, search your workspace's projects, people and messages, and prepare actions that you confirm before anything changes. LabourMarket.ai acts only with your own permissions; consequential actions are always draft → confirm." |
| Privacy URL | `https://labourmarket.ai/en/legal/privacy` (now names connected AI assistants — PR #2372) |

**Test cases.** The reviewer account must be a synthetic worker with ≥1 confirmed journal entry and one workspace.

| # | Prompt | Expected |
|---|---|---|
| P1 | "What did I work on this week?" | `journal_work_intelligence_get` / `journal_list` → this week's entries and days worked; read-only |
| P2 | "Log 8 hours today at Main Street site: laid floor tiles in the kitchen." | `journal_create_draft` → a draft is shown; nothing saved until the user confirms → `journal_confirm` |
| P3 | "What skills does my work history show?" | `living_cv_skills_get` → skills with their evidence state (recorded / declared / confirmed) |
| P4 | "Which workspaces do I belong to? Switch to <name>." | `context_list` then `context_switch` |
| P5 | "Show my notifications and my latest conversations." | `notification_list`, `conversation_list` — read-only |
| N1 | "Delete another user's account." | refused: no such tool; no other person's data is reachable |
| N2 | "Pay the worker 500 euros now." | refused: no payment tool exists; the assistant says it cannot move money |
| N3 | "Show me all workers' phone numbers." | refused / empty: contact data is never part of a search result; RLS closes it |

**The one technical gap ChatGPT reviewers may raise:** 229 tools is large.
- The scan lists all of them. Each has a title and annotations, so it is not a rejection reason in itself.
- If the reviewer asks for a smaller surface, the follow-up is a curated toolset. That is an owner product call about which jobs the ChatGPT listing is for, not a code change.
- **Interactive cards (Apps SDK widgets) are not built.** The listing is valid as a tool-only plugin. Cards are a later, optional addition.

---

## 5. Claude (Connectors Directory)

Official requirements (claude.com/docs/connectors/building/submission), as checked in Oct 2026:
- remote MCP server;
- every tool has a title plus the applicable read-only / destructive hint;
- OAuth 2.0 for authenticated services;
- documentation URL, privacy policy URL, icon and **test account credentials**;
- allowed link URIs if the connector opens links.

Submission goes through `claude.ai/directory/manage`. New listings start as **Community**. Eligibility (Team/Enterprise owner, or also Pro/Max) is reported inconsistently, so the owner should check in the portal.

| Field | Value |
|---|---|
| Server URL | `https://labourmarket.ai/api/mcp` |
| Auth | OAuth 2.1 (Supabase Auth; DCR). **NOT VERIFIED with Claude**: the callback `https://claude.ai/api/mcp/auth_callback` must be accepted by the Supabase OAuth server. Only ChatGPT has completed the full DCR → consent → token chain in production. |
| Icon | `apps/web/public/app-icon.svg` (export a 512 px PNG) |
| Documentation URL | `https://labourmarket.ai/en/llms.txt` + this pack's §4 test cases as the usage guide |
| Allowed link URIs | `https://labourmarket.ai/*` |

**Known risk:** the public privacy and legal pages still carry the "pending legal review" notice. Anthropic's guidance treats an incomplete privacy policy as a rejection reason. Closing it is a **legal-wording decision** (owner + lawyer), not an engineering task.

---

## 6. Owner-only actions (the complete short list)

| # | Action | Unblocks | Why only the owner |
|---|---|---|---|
| 1 | Decide #2362 historical dates: A) 58 records ≤1 month, B) all 165 after confirming labels were never updated after spring 2023, C) hold — analysis on the PR | historical dates | owner's knowledge of how the files were made |
| 2 | Google Play Console account + upload key / Play App Signing; then set `ANDROID_CERT_FINGERPRINTS` on production | Play, App Links | account, identity, payment |
| 3 | Apple Developer Program + App Store Connect record; then set `APPLE_TEAM_ID` | App Store, TestFlight, Universal Links | account, identity, payment |
| 4 | Create ONE synthetic review account with a password (e.g. the QA worker identity) and store it as the `production-qa` environment secret `MOBILE_QA_PASSWORD` | Play + Apple + ChatGPT + Claude reviewer access; signed-in mobile CI journey | an agent may not create credentials |
| 5 | `eas init` (EAS project id), `EXPO_TOKEN`, EAS public variables, first interactive build: §0.1 O-4…O-7 | the uploadable AAB / IPA | signing keys |
| 6 | OpenAI Platform: verify publisher identity, create the plugin draft, copy the domain token into `OPENAI_APPS_CHALLENGE_TOKEN`, submit with §4 cases | ChatGPT directory | account, identity |
| 7 | Claude: open `claude.ai/directory/manage`, add the custom connector once to test OAuth, submit with §5 | Claude directory | account |
| 8 | Lawyer-reviewed privacy policy / terms (remove the pending banner), retention periods | Claude + ChatGPT review, GDPR | legal sign-off |
| 9 | Approve the §2/§3 listing text, the icon and the 18+/17+ rating; take real signed-in screenshots on a phone | store listings | product voice, visual approval |
| 10 | Play Console: a new personal developer account must run a closed test with 12 testers for 14 days before production | Play production | Google policy for personal accounts |

---

## 7. Acceptance table — 2026-10-14 (evidence, not intent)

**Production walks**, `prod-qa-walk.yml` on main (synthetic cast, real production):
- **Green:** role-routes, journal-confirm, calendar-planning, marketplace, agency-chain, living-cv-growth, mcp-chain, mcp-agents, mobile-surfaces, chat-confirm-once.
- **Red:** chat-continuity and brigade-formation (see WEB rows).

| Area | Verdict | Evidence | If not READY: the gap · type · done so far · the one remaining action · who |
|---|---|---|---|
| WEB — core functionality | **BLOCKED** (one defect) | 10/12 prod walks green; legal pages verified live | Brigade disband is MISSING and the per-owner cap of 20 counts every brigade ever created, so an owner past 20 can never form a new brigade (the walk has been red since this morning; the QA owner is at exactly 20). · technical · `disband_team_v1` designed as a RED migration (archives the org, ends members through `end_engagement_lifecycle_v1`, refuses while work is open; cap counts active brigades only) and dry-run on production inside a rolled-back transaction: disbanded → 1 member ended with a lifecycle event → archived → second call `already_disbanded` → a new brigade could be created; verified afterwards that nothing persisted. · owner approves the RED migration + app slice · **owner** |
| WEB — user journeys | **BLOCKED** (one flaky) | journal, calendar, marketplace, agency, living CV, MCP, mobile web — prod walks green | chat-continuity: the cross-workspace thread check failed once (alternating pass/fail across runs since 10-12); the run's own message did not appear in the Alfa thread on re-open. · technical, not yet diagnosed · artifact read; it is NOT a leak (the Beta thread did not show it) · diagnose message persistence vs the "earlier conversation" collapse · agent (next session) |
| MCP — function coverage | **READY** | prod `GET /api/mcp` → toolCount 229 `0.1.0+t229.105ffae5`; mcp-chain + mcp-agents prod walks green; per-person brake #2373 | — (FormData-only actions not exposed: listed in `LLM_INTEGRATION_COVERAGE_V1.md` §4) |
| ChatGPT integration | **BLOCKED** (external) | OAuth DCR → consent → token, read and draft→confirm write proven with real ChatGPT (CHATGPT_MCP_CLIENT_V1); domain-challenge route #2374; §4 cases | Submission needs the owner's OpenAI publisher identity, portal draft, domain token, reviewer account · external · route + pack ready · §6 items 4, 6 · **owner** |
| Claude integration | **NOT VERIFIED** | OAuth AS metadata supports DCR, PKCE S256, public clients, refresh (read live) | Never connected from Claude · external · discovery verified · §6 item 7 (add the custom connector once) · **owner** |
| LabourMarket.ai internal AI | **BLOCKED** (scope) | provider registry (Anthropic, OpenAI, Gemini, …), egress default-deny, per-task cost ceiling, daily + per-org caps, `ai_runs` audit; Gemini live for translation and chat intent | No multi-turn tool calling by an LLM; chat continuity is deterministic. Building it needs a paid-model decision · technical + owner · — · owner decides whether LLM tool calling is wanted and on which provider · **owner** |
| AI agent collaboration | **BLOCKED** (owner decisions) | R1 delegate: any OAuth agent acts as its person, consequential writes draft→confirm, mcp-agents walk green | R2 (agent as its own participant), agent↔agent negotiation: owner decisions AGENT-1..4 · owner · plan in `AI_AGENT_PARTICIPANTS_V1.md` · decide AGENT-1 · **owner** |
| AI search discoverability | **BLOCKED** (owner policy) | robots, 3 sitemaps, hreflang, llms.txt + connector section (#2376), Organization/WebSite/Article JSON-LD — read live | Job-page structured data held at owner gate G-16 (#1433); 0 of 46 organizations have turned on a public profile, so there are no company pages to index · owner · — · G-16 sentence; organizations opt in · **owner** |
| Android — Google Play | **BLOCKED** (external) | targetSdk 36, AAB builds, permissions refused in CI, emulator journeys incl. offline; account surfaces #2371; unused permissions #2375 | Play Console account, upload key, review account, closed test (12 testers / 14 days for personal accounts) · external · §2 listing + data safety drafted · §6 items 2, 4, 5, 9, 10 · **owner** |
| iOS — App Store | **BLOCKED** (external) | simulator Release build + journey (`ios.yml`); export compliance + iPhone-only (#2371); privacy manifest | Apple Developer account, Team ID, signing, TestFlight; no physical-device run · external · §3 drafted · §6 items 3, 4, 5, 9 · **owner** |
| Privacy & security | **BLOCKED** (legal + one technical) | export self-service; deletion request live; processor list made true (#2372); connected-app revoke; MCP brake (#2373); RLS default-closed | (a) legal wording + retention periods (pending banner) · legal · facts corrected · lawyer sign-off · **owner**. (b) erasure is a reviewed manual runbook — no executor RPC · technical but destructive (RED) · runbook exists · owner decides whether to automate · **owner** |
| Official submission documents | **READY** (drafts) | this pack §2–§6 | Wording, icon and screenshots need owner approval (§6 item 9) |

**Not touched, by instruction:**
- the landing page;
- the design D1–D7 work (#2367, #2370 open for the design agent);
- #2362 dates (analysis posted; owner chooses A/B/C).

---

## 8. Push notifications — options for the owner (2026-11-11; nothing added)

Today the app has **in-app** notifications only (`notification_list`, read when the screen opens). Push needs an owner choice first, because it adds a processor and a new kind of personal data: a device token per phone.

| | A. Expo Push Service | B. FCM + APNs directly |
|---|---|---|
| Price | 0 € (no per-message fee) | 0 € (FCM and APNs are free) |
| Path a message takes | our server → Expo → FCM (Android) / APNs (iOS) → phone | our server → FCM / APNs → phone |
| Who processes the data | Expo (650 Industries, USA), Google and Apple | Google and Apple |
| What the owner sets up | the FCM v1 service account and the APNs key, both uploaded to EAS (EAS can create the APNs key) | a Firebase project plus a server-side service-account secret on the VPS, and an APNs `.p8` key on the VPS |
| App code | `expo-notifications` + `getExpoPushTokenAsync` | `expo-notifications` + `getDevicePushTokenAsync` (raw FCM / APNs tokens; no Firebase SDK on iOS) |
| Server code | one HTTPS call to Expo's push API, plus reading its receipts | two senders (FCM HTTP v1, APNs HTTP/2) and token refresh |
| Speed to ship | faster | slower |

**Needed under either option**, all of which an owner approves first:
- a device-token table (a migration with RLS: own rows only, deleted on sign-out and on account erasure);
- a store-and-forget sender;
- opt-in on the phone (iOS asks; Android 13+ asks, so `POST_NOTIFICATIONS` gets added to the CI permission allow-list on purpose);
- the existing `notification_preference_set` as the per-category off switch;
- privacy policy, Play Data safety ("Device or other IDs") and the Apple privacy label updated **before** the build ships.

**What a push should carry, recommended for both options:** no names, no message text, no project or company. A neutral line ("You have something new in LabourMarket.ai") and the notification id only. The app then reads the content through `/api/mcp` under the person's own permissions. This keeps message content out of Expo, Google and Apple, and it suits the EU-first market.

**Recommendation:** A, if the owner accepts Expo as a processor (it needs its DPA reviewed); otherwise B. Either one is one GREEN app PR plus one RED migration PR, after the owner chooses.
