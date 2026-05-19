# labourmarketai — Route Map (locked)

These are the only approved routes. No route may be added, removed or
duplicated without amending this map and the guard together (see the
constitution, §11). Each route owns exactly one main function.

| Route | Approved |
| --- | --- |
| `/` `/login` `/register` `/role` `/app` `/app/profile` `/app/discover` `/app/matches` `/app/company` `/app/hiring-needs` `/app/communication` `/app/settings` `/admin` | ✅ |

---

### `/`
- **For:** the public — workers and companies who do not have an account yet.
- **One function:** explain the product and convert to sign-up / sign-in.
- **May show:** the hero scene, how it works, the both-sides value, CTAs into
  `/register`, `/login`, `/app/discover`, `/app/matches`.
- **Must not duplicate:** the app interior, the profile editor, real account
  data, or any in-app flow. It links to them; it does not reimplement them.

### `/login`
- **For:** returning users.
- **One function:** authenticate an existing user.
- **May show:** sign-in form, honest provider buttons (prepared / coming-soon),
  link to `/register`.
- **Must not duplicate:** registration, role selection, or the profile.

### `/register`
- **For:** new users.
- **One function:** create an account.
- **May show:** sign-up form, honest provider buttons, link to `/login`, the
  next step into `/role`.
- **Must not duplicate:** `/login`, `/role`, or profile creation as a separate
  parallel flow.

### `/role`
- **For:** a user who just registered.
- **One function:** capture identity — "Who are you?": Worker / Person,
  Company / Employer, Recruiter / Agency.
- **May show:** the three role options and a continue action into `/app`.
- **Must not duplicate:** profile fields, and must never ask what the user is
  looking for. Role is captured once here.

### `/app`
- **For:** a signed-in user.
- **One function:** orient the user — a snapshot and a way into each concern.
- **May show:** a summary of the user's own card and links to the other `/app`
  surfaces.
- **Must not duplicate:** it owns no data. It never edits the profile, runs
  matching, or starts conversations itself — it points to those routes.

### `/app/profile`
- **For:** the signed-in user's own identity.
- **One function:** the one place a user's information lives and is edited.
- **May show:** the user's player card (visual projection of the profile),
  skills, experience, languages, availability / job-search status, edit entry.
- **Must not duplicate:** there is no second profile route, no separate avatar
  route, no separate avatar editing flow. Job-search status lives here, not on
  its own route.

### `/app/discover`
- **For:** anyone scouting people (and the draft floor).
- **One function:** browse workers/opportunities as player cards and shortlist
  / draft them.
- **May show:** discover cards built from the same profile / player-card data,
  filters, draft and shortlist actions.
- **Must not duplicate:** it reuses profile and player-card data — it never
  stores its own candidate copy and never defines a second card visual.

### `/app/matches`
- **For:** comparing fit between a profile and a need.
- **One function:** show plain-language fit between profile data and hiring-
  need data.
- **May show:** ranked match results on the same player card, the fit score
  and a human explanation, gaps.
- **Must not duplicate:** matching logic lives in one place; this route does
  not re-derive profiles or needs, and uses no fabricated-intelligence wording.

### `/app/company`
- **For:** a company's own identity.
- **One function:** the one place company information lives and is edited.
- **May show:** the company player card, about, open needs count, edit entry.
- **Must not duplicate:** there is no second company source; it reuses the
  same card visual system as people.

### `/app/hiring-needs`
- **For:** the roles a company needs filled.
- **One function:** the one place a worker/team need is created and listed.
- **May show:** hiring-need cards anchored to their company card, seats,
  engagement, must-have skills, status.
- **Must not duplicate:** the company source (it references it) and does not
  define its own company visual.

### `/app/communication`
- **For:** talking to the right people.
- **One function:** the single communication area and the one entry point to
  start a thread; contact leads here.
- **May show:** start-a-thread surface and recent openers.
- **Must not duplicate:** there is no parallel inbox / messages / chat / DM
  area. All contact paths converge on this one route.

### `/app/settings`
- **For:** account preferences.
- **One function:** manage account, role and sign-in providers honestly.
- **May show:** identity fields, role, honest provider states.
- **Must not duplicate:** the profile editor or the role flow — it links to
  them and never becomes a second profile surface.

### `/admin`
- **For:** operators.
- **One function:** an operational management shell — visibility into entities
  and signals.
- **May show:** counts and an entity directory.
- **Must not duplicate:** it is not an approval, screening, sign-off or
  curation queue, and it never gates onboarding or matching. No second admin
  surface.
