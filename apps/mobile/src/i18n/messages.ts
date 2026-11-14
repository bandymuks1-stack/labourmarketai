import type { ActiveLocale } from "@labourmarket/client-core";

/**
 * The mobile client's own message catalogue.
 *
 * Small on purpose. The web app's `messages/*.json` catalogues are large,
 * route-shaped and loaded by `next-intl`; a phone shell needs a few dozen
 * strings, and copying thousands of keys across would be a maintenance
 * liability with no reader. When a screen here starts showing product content,
 * that content arrives already translated from the canonical domain — the
 * request carries `Accept-Language`, and the server owns the wording.
 *
 * PARITY IS ENFORCED BY THE COMPILER. `MessageKey` is derived from the English
 * catalogue and every other locale is typed `Record<MessageKey, string>`, so a
 * missing translation is a typecheck failure, not a string that quietly falls
 * back to English on someone's phone.
 *
 * The six locales here are exactly the ACTIVE set (doctrine §2.4 / the web
 * app's `activeLocales`). The other five exist in the platform's catalogues but
 * are not offered to anyone yet, on any client.
 */

const en = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Today",
  "nav.journal": "Work journal",
  "nav.profile": "Profile",
  "nav.settings": "Settings",

  "auth.checking": "Checking your session…",
  "auth.signIn.title": "Sign in",
  "auth.signIn.email": "Email",
  "auth.signIn.password": "Password",
  "auth.signIn.submit": "Sign in",
  "auth.signIn.toRegister": "Create an account",
  "auth.register.title": "Create an account",
  "auth.register.submit": "Create account",
  "auth.register.toSignIn": "I already have an account",
  "auth.signIn.forgot": "Forgot your password?",
  "auth.register.legal":
    "By creating an account you accept the terms of service and the privacy policy.",
  "auth.error.rejected": "That email and password did not match.",
  "auth.error.unreachable":
    "We could not reach the server, so we do not know whether those details are right. Check your connection and try again.",
  "auth.error.confirmationRequired":
    "Your account was created. Confirm the link in your email, then sign in.",
  "auth.error.notConfigured":
    "This build has no server configuration, so it cannot sign anyone in.",
  "auth.signOut": "Sign out",

  "account.title": "Privacy & account",
  "account.body":
    "These open in your browser, on the website. Asking for your data, or for your account to be deleted, is done there under Privacy.",
  "account.privacy": "Privacy, your data and deleting your account",
  "account.terms": "Terms of service",
  "account.privacyPolicy": "Privacy policy",
  "account.deletionInfo": "How account deletion works (no sign-in needed)",
  "account.support": "Contact support (info@labourmarket.ai)",
  "account.external": "Browser",
  "account.openFailed": "The link could not be opened on this phone. Nothing was changed.",

  "session.unavailable.title": "We could not check your session",
  "session.unavailable.body":
    "This is not the same as being signed out — your phone's secure storage did not answer. Try again.",
  "session.unavailable.retry": "Try again",

  "route.notFound.title": "That screen is not in this app",
  "route.notFound.body":
    "The link you followed does not lead anywhere here. It may be for the website, or it may be out of date. Nothing was sent anywhere.",
  "route.notFound.action": "Back to the app",

  "crash.title": "The app hit a fault",
  "crash.body":
    "This is a fault in the app itself, not something you did, and nothing was sent anywhere. Try again — if it keeps happening, close the app and reopen it.",

  "config.problem.title": "This build is not configured",
  "config.problem.body":
    "The app cannot start until these values are set. No data has been sent anywhere.",

  "workspace.title": "Acting for",
  "workspace.loading": "Reading your workspaces…",
  "workspace.active": "Active",
  "workspace.switching": "Switching…",
  "workspace.failed.title": "We could not read your workspaces",
  "workspace.failed.body":
    "This is a failed read, not an answer: it does not mean you belong to no organization. Try again in a moment.",
  "workspace.pointerUnavailable":
    "This is worked out from what you belong to, not a choice saved for you, and it cannot be changed here yet.",
  "workspace.switchFailed": "The workspace was not changed. Nothing was moved.",
  "context.loading": "Reading your roles…",
  "context.active": "Active",
  "context.none": "No participation role is recorded on this account yet. That is what we read — not a problem with the app.",
  "context.title": "You are working as",
  "context.unavailable.title": "We cannot list your contexts yet",
  "context.unavailable.body":
    "The app can sign you in, but it cannot yet read which organizations you belong to. Nothing is missing from your account — this client simply cannot ask yet.",
  "context.mode.worker": "Myself",
  "context.mode.company": "Company",
  "context.mode.agency": "Agency",
  "context.mode.customer": "Customer",

  "language.title": "Language",
  "language.preview": "Preview translation",

  "domain.loading": "Asking the server…",
  "domain.retry": "Try again",
  "domain.failedTitle": "We could not load this",
  "domain.unavailable.notConnectedYet": "Not connected yet",
  "domain.unavailable.signInAgain": "Please sign in again.",
  "domain.unavailable.offline": "No connection. Nothing was sent.",
  "domain.unavailable.unexpectedAnswer":
    "The server answered with something this app did not understand.",
  "domain.refused.no_credentials": "Please sign in again.",
  "domain.refused.invalid_token": "Your session has ended. Please sign in again.",
  "domain.refused.no_profile": "This account has no profile yet.",
  "domain.refused.not_authorized":
    "The server declined this request for this account.",
  "domain.refused.rate_limited":
    "The server asked this app to slow down. Try again in a moment.",
  "domain.refused.capability": "The server declined this request.",
  "domain.refused.identity_unavailable":
    "We could not confirm who you are. This is not a refusal — try again.",

  "today.signedInAs": "Signed in as",
  "today.recentWork": "Recent work",
  "journal.empty": "No work journal entries recorded yet.",
  "journal.logWork": "Log work",
  "journal.compose.title": "Log work",
  "journal.compose.intro":
    "Write what you did, in your own words. Your work journal records exactly what you write.",
  "journal.compose.date": "Date of the work",
  "journal.compose.dateHint": "Year-month-day, for example 2026-09-01",
  "journal.compose.today": "Today",
  "journal.compose.yesterday": "Yesterday",
  "journal.compose.notes": "What you did",
  "journal.compose.notesHint":
    "Your own words. Times and places belong here too.",
  "journal.compose.site": "Site or place (optional)",
  "journal.compose.context": "Work context",
  "journal.compose.contextUnnamed": "Not named",
  "journal.compose.review": "Review before saving",
  "journal.compose.previewTitle": "Check this before it is saved",
  "journal.compose.previewNothingSaved":
    "Nothing has been saved yet. This is exactly what will be recorded.",
  "journal.compose.save": "Save to my work journal",
  "journal.compose.edit": "Change something",
  "journal.compose.chooseContext": "Which work does this belong to?",
  "journal.compose.chooseContextBody":
    "This entry could belong to more than one of your work contexts, so nothing was prepared and nothing was saved. Choose one.",
  "journal.compose.savedTitle": "Saved to your work journal",
  "journal.compose.savedBody":
    "This is now a recorded entry. It is what the server stored.",
  "journal.compose.another": "Log another",
  "journal.compose.backToJournal": "Back to the journal",
  "journal.compose.checkThis": "Check this first",
  "journal.compose.invalidDate":
    "Write the date as year-month-day, for example 2026-09-01. Nothing was sent.",
  "journal.compose.futureDate":
    "The work date cannot be in the future — a journal entry records work that has happened. Nothing was sent.",
  "journal.compose.notesRequired":
    "Write what you did before saving. Nothing was sent.",
  "journal.compose.draftFailedTitle": "We could not prepare this entry",
  "journal.compose.saveFailedTitle": "We could not save this entry",
  "journal.compose.staleDraft":
    "This was not saved: your journal changed after this was prepared, so the check it was based on is out of date. Review it again.",
  "journal.compose.noContext":
    "This account has no active work context, so an entry has nowhere to be recorded. Add where you work on the website first, then log work here.",
  "journal.compose.unsureSaved":
    "The connection dropped after this was sent, so we do not know whether it arrived. Open your work journal to check before writing it again. Trying again cannot create a duplicate.",
  "journal.compose.skillsAdded": "New skills recorded",
  "journal.compose.skillsStrengthened": "Skills with new evidence",
  "journal.compose.skillsClaims": "Capabilities noted from your words",
  "journal.compose.skillsReview": "Waiting for your review",
  "journal.compose.noCvChange":
    "Nothing new was added to your Living CV from this entry.",
  "journal.compose.skillsPartial":
    "Part of the Living CV update did not finish. The entry itself is saved.",
  "journal.compose.skillsFailed":
    "The Living CV update did not run this time. The entry itself is saved.",
  "journal.compose.reviewOnWeb":
    "What is waiting for review is confirmed on the website.",
  "profile.skillsEmpty": "No skills recorded yet.",
  "journal.correct.action":
    "Correct this entry",
  "journal.correct.title":
    "Correct an entry",
  "journal.correct.intro":
    "Change what is wrong — the words, the day or the site. The previous version stays in your history; your totals count the corrected one.",
  "journal.correct.nothingChanged":
    "Nothing was changed yet. Edit the words, the day or the site first.",
  "journal.correct.previewTitle":
    "Check the correction before it is saved",
  "journal.correct.before":
    "Now",
  "journal.correct.after":
    "After the correction",
  "journal.correct.hours":
    "Hours",
  "journal.correct.output":
    "Output",
  "journal.correct.wasConfirmed":
    "A manager confirmed this entry. That confirmation stays on the earlier version; the corrected version is saved as not yet confirmed.",
  "journal.correct.save":
    "Save the correction",
  "journal.correct.savedTitle":
    "Correction saved",
  "journal.correct.savedBody":
    "Your journal and your totals now show the corrected version.",
  "journal.correct.savedConfirmedBody":
    "The corrected version is saved and waits for a manager's confirmation; the earlier confirmed version stays in your history.",
  "journal.correct.draftFailedTitle":
    "We could not prepare this correction",
  "journal.correct.saveFailedTitle":
    "We could not save this correction",
  "journal.correct.unsureSaved":
    "The correction was sent but no answer came back, so we cannot tell whether it was saved. Trying again is safe: a correction that already landed is refused, never saved twice.",
  "journal.correct.staleDraft":
    "This was not saved: your journal changed after the correction was prepared. Review it again.",
  "journal.correct.superseded":
    "This entry was already corrected or removed. Open the journal again and correct the current version.",
  "journal.correct.notFound":
    "This entry is not among your latest journal entries. It may have been corrected already.",
  "journal.correct.conflict":
    "The new words state one duration for the whole entry, but the entry also records an output, and both need the same field. State the time per activity, or correct this entry on the website.",
  "journal.correct.missingTitle":
    "This entry cannot be corrected here",
  "today.openMessages":
    "Messages",
  "messages.title":
    "Messages",
  "messages.conversation":
    "Conversation",
  "messages.intro":
    "Your conversations inside LabourMarket.ai. Messages stay in the app — nothing is sent by email or SMS. New messages show when you open this screen.",
  "messages.none":
    "You have no conversations yet.",
  "messages.untitled":
    "Conversation",
  "messages.threadEmpty":
    "No messages in this conversation yet.",
  "messages.fromMe":
    "You",
  "messages.fromThem":
    "Them",
  "messages.replyLabel":
    "Your reply",
  "messages.review":
    "Review before sending",
  "messages.emptyBody":
    "Write a message first.",
  "messages.previewTitle":
    "Check this before it is sent",
  "messages.previewNothingSent":
    "Nothing has been sent yet. This is exactly the text the other person will see.",
  "messages.send":
    "Send",
  "messages.sentTitle":
    "Sent",
  "messages.sentBody":
    "Your message is in the conversation.",
  "messages.sentUnverified":
    "The server accepted your message, but reading it back did not match. Open the conversation again to check it.",
  "messages.writeAnother":
    "Write another message",
  "messages.draftFailedTitle":
    "We could not prepare this message",
  "messages.sendFailedTitle":
    "We could not send this message",
  "messages.unsureSent":
    "The message was sent but no answer came back, so we cannot tell whether it arrived. Open the conversation again before sending it a second time.",
  "messages.staleDraft":
    "Not sent: a new message arrived in this conversation after you prepared yours. Read it, then review your reply again.",
  "messages.notFound":
    "This conversation is not one of yours, or it no longer exists.",
  "messages.noPermission":
    "You may not write in this conversation.",
  "today.openNotifications":
    "Notifications",
  "notifications.title":
    "Notifications",
  "notifications.intro":
    "What happened in your work, newest first. Opening one marks it read. Notifications are not pushed to your phone — they show here when you open this screen.",
  "notifications.none":
    "You have no notifications.",
  "notifications.unread":
    "New",
  "notifications.markAll":
    "Mark all as read",
  "notifications.markFailedTitle":
    "We could not mark this as read",
  "notifications.type.unknown":
    "A notification",
  "notifications.type.event_absence_approved":
    "Your absence was approved",
  "notifications.type.event_absence_rejected":
    "Your absence was rejected",
  "notifications.type.event_absence_requested":
    "An absence was filed for you",
  "notifications.type.event_booking_accepted":
    "Your booking proposal was accepted",
  "notifications.type.event_booking_declined":
    "Your booking proposal was declined",
  "notifications.type.event_booking_proposed":
    "You received a booking proposal",
  "notifications.type.event_booking_withdrawn":
    "The booking proposal was withdrawn",
  "notifications.type.event_demand_interest_expressed":
    "A worker expressed interest in your demand",
  "notifications.type.event_demand_interest_reviewed":
    "A company marked your interest as reviewed",
  "notifications.type.event_document_ack_assigned":
    "You were asked to confirm you have read a document.",
  "notifications.type.event_document_ack_completed":
    "A document you sent for confirmation was confirmed.",
  "notifications.type.event_document_expiring":
    "A document's validity is ending soon.",
  "notifications.type.event_engagement_created":
    "A new engagement was created",
  "notifications.type.event_engagement_ended":
    "The engagement was ended",
  "notifications.type.event_history_link_offered":
    "An organization offered to connect your recorded work history to your account",
  "notifications.type.event_invitation_accepted":
    "Somebody accepted your invitation",
  "notifications.type.event_job_alert":
    "A new job fits what you are looking for",
  "notifications.type.event_journal_review_decided":
    "Your journal entry was reviewed",
  "notifications.type.event_journal_review_decided_approved":
    "Your journal entry was confirmed",
  "notifications.type.event_journal_review_decided_changes_requested":
    "Changes were requested on your journal entry",
  "notifications.type.event_journal_review_decided_rejected":
    "Your journal entry was rejected",
  "notifications.type.event_message_received":
    "You have a new message",
  "notifications.type.event_saved_search_match":
    "A search you saved has new results",
  "notifications.type.event_weekly_digest":
    "Your weekly work and opportunities summary is ready",
  "notifications.type.event_weekly_digest_journal":
    "Your week’s work journal summary is ready",
  "notifications.type.event_weekly_digest_profile_completion":
    "To see jobs that fit you, confirm what work you do",
  "notifications.type.event_work_task_assigned":
    "A task was assigned to you",
  "notifications.type.event_workflow_decided":
    "Your approval request has been decided",
  "notifications.type.event_workflow_delegated":
    "An approval round was handed over to you",
  "notifications.type.event_workflow_escalated":
    "An approval round passed its deadline",
  "notifications.type.event_workflow_step_pending":
    "An approval request is waiting for your decision",
  "today.openProjects":
    "My projects",
  "projects.title":
    "My projects",
  "projects.detailTitle":
    "Project",
  "projects.none":
    "You are not assigned to any project.",
  "projects.active":
    "Active",
  "projects.ended":
    "Ended",
  "projects.asksCount":
    "Still needed from you",
  "projects.moreOnWeb":
    "Only your first projects are shown here. The website lists all of them.",
  "projects.notFound":
    "This project is not one of yours, or it is not among the projects shown here.",
  "projects.asksTitle":
    "Still needed from you",
  "projects.asksShownOf":
    "Shown here / still open in all — the full list is on the website",
  "projects.asksUnavailable":
    "What is still needed from you could not be read just now. Try again, or open the project on the website.",
  "projects.asksNotRead":
    "This assignment has ended. What was asked of you on it is on the project's web page.",
  "projects.asksIncomplete":
    "More is open across your projects than the app can list, so this project's part may not be shown. Its web page has the full list.",
  "projects.asksNone":
    "Nothing is open for you on this project.",
  "projects.ask.needed":
    "Needed",
  "projects.ask.missing":
    "Missing",
  "projects.ask.rejected":
    "Rejected — needs a new one",
  "projects.ask.expired":
    "Expired",
  "projects.instructionTitle":
    "Latest instruction",
  "projects.answerInstruction":
    "Answer in Messages",
  "projects.webDetail":
    "The full project page — stages, documents and the team — is on the website.",
  "messages.threadNotShown":
    "The conversation is not on screen yet. Wait for it to load, read it, then review your reply.",
  "messages.newBeforeReview":
    "A new message arrived in this conversation. It is now shown above — read it, then review your reply again.",
  "profile.noWorkerProfile": "This account has no worker profile yet.",
  "profile.figuresTitle": "Skills, with your recorded hours",
  "profile.groupManagerConfirmed": "Confirmed by a manager",
  "profile.groupJournalBacked": "Backed by your work journal",
  "profile.groupDeclared": "Declared by you",
  "profile.figuresUnavailable":
    "Hours, share and entries could not be read this time. The skills below are still your recorded skills — nothing is shown as 0.",
  "profile.figuresLegend":
    "Hours · share of the hours attributed to a skill · entries, all time. The same figures as the website.",
  "profile.figuresNotRead": "figures could not be read",
  "profile.noFigures": "no recorded hours",
  "profile.involvedUnattributed": "involved; time not attributed to this skill alone",
  "profile.hoursShort": "h",
  "profile.entriesLabel": "entries",
  "profile.selfStatedMissing":
    "Capabilities you noted in your own words are not carried to this screen yet; the website shows them under your skills.",
  "profile.openJournal": "Open your work journal",
  "journal.openProfile": "See what these entries add up to on your profile",

  "today.figuresTitle": "Your work in numbers",
  "today.periodToday": "Today",
  "today.periodWeek": "Last 7 days",
  "today.hoursLabel": "Hours",
  "today.daysUnitLabel": "recorded in days",
  "today.entriesLabel": "Entries",
  "today.daysLabel": "Days",
  "today.confirmedLabel": "Confirmed by a manager, h",
  "today.periodEmpty": "Nothing recorded in this window.",
  "today.periodMissing": "The server sent no figure for this window.",
  "today.dominantTitle": "Largest share of your hours, last 7 days",
  "today.dominantShare": "of the hours attributed to a skill",
  "today.dominantNone":
    "No hours attributed to a single skill in the last 7 days.",
  "today.coverageTruncated":
    "These figures rest on the last entries read — older entries are not included.",
  "today.figuresScope":
    "From your own work journal entries, by the same rule as the website. Calendar days end today (UTC).",
  "today.openJournal": "Open your work journal",
  "today.openProfile": "Open your profile and skills",
  "today.openNeed": "Post a need for people",
  "need.title": "Post a need",
  "need.intro": "A worker-need for the organization you are acting for. You review it before it is created; workers who may see it find it on their board.",
  "need.descriptionLabel": "What do you need?",
  "need.descriptionHint": "In your own words — the work, when, how many people.",
  "need.roleLabel": "Role",
  "need.locationLabel": "Place",
  "need.teamSizeLabel": "How many people",
  "need.teamSizeHint": "A whole number",
  "need.urgencyLabel": "How urgent",
  "need.urgency.flexible": "Flexible",
  "need.urgency.this_week": "This week",
  "need.urgency.urgent": "Urgent",
  "need.descriptionRequired": "Write at least a few words about what you need. Nothing was sent.",
  "need.teamSizeInvalid": "The number of people must be a whole number from 1 upwards. Nothing was sent.",
  "need.review": "Review before creating",
  "need.cancel": "Back",
  "need.previewTitle": "Check before you create it",
  "need.previewBody": "Nothing has been created yet.",
  "need.actingFor": "For",
  "need.confirm": "Create the need",
  "need.edit": "Edit",
  "need.sentTitle": "Created",
  "need.sentBody": "The need is now open for the organization. You can follow it on the website.",
  "need.done": "Back to Today",
  "need.overLimit": "This organization has reached the active-position limit of its plan. Nothing was created — close a need or change the plan on the website.",
  "need.draftFailedTitle": "We could not prepare this need",
  "need.sendFailedTitle": "We could not create this need",
  "today.openJobs": "Browse open jobs",
  "jobs.title": "Jobs",
  "jobs.intro": "The public job board — the same listings as the website. Details such as the employer and how to apply open on the web page as you.",
  "jobs.queryLabel": "Search",
  "jobs.queryHint": "An occupation or a word from the title, in any language",
  "jobs.search": "Search jobs",
  "jobs.total": "Jobs",
  "jobs.page": "page",
  "jobs.none": "No jobs match this search right now.",
  "jobs.prev": "Previous page",
  "jobs.next": "Next page",
  "jobs.openWeb": "Open the full listing",
  "jobs.positions": "Positions",
  "jobs.compensation": "Pay",
  "jobs.published": "Published",
  "jobs.untitled": "Job",
  "jobs.notProvisioned": "The job board is not enabled on this environment.",
  "jobs.unavailable": "The job board did not answer in time. That is not the same as no jobs — try again.",
  "jobs.linkedNotFound": "That job is no longer on the board (it may have closed).",
  "today.openOpportunities": "See needs open to you",
  "today.openAvailability": "Who on your roster is free",
  "opportunities.title": "Opportunities",
  "opportunities.intro": "Needs that are visible to you right now. Expressing interest shows it to the need's owner on their own view — nothing leaves the platform.",
  "opportunities.noneVisible": "No needs are visible to you right now. When an organization you are connected to opens one, it appears here.",
  "opportunities.express": "I am interested",
  "opportunities.noteLabel": "A note for them (optional)",
  "opportunities.noteHint": "A sentence about why or when — they read it as written.",
  "opportunities.draft": "Review before sending",
  "opportunities.previewTitle": "Check before you send",
  "opportunities.previewBody": "Nothing has been sent yet.",
  "opportunities.alreadyExpressed": "You have already expressed interest in this need; sending again refreshes it.",
  "today.openOffers": "Offers and invitations for you",
  "offers.title": "Offers",
  "offers.reviewNotice": "If you accept, a manager of {organization} can read the work you record for them and sign it off. Until they do, it stays your own entry.",
  "offers.as": "As",
  "offers.relationship.collaborator": "Collaborator",
  "offers.relationship.consultant": "Consultant",
  "offers.relationship.employee": "Employee",
  "offers.relationship.freelancer": "Freelancer",
  "offers.relationship.manager": "Manager",
  "offers.relationship.owner": "Owner",
  "offers.relationship.student": "Student",
  "offers.relationship.unemployed": "Unemployed",
  "offers.relationship.volunteer": "Volunteer",
  "offers.relationship.intern": "Intern",
  "offers.relationship.external_manager": "External manager (client)",
  "offers.relationship.other": "Other relationship",
  "offers.intro": "Job proposals and invitations addressed to you. Nothing changes until you confirm your answer.",
  "offers.bookingsHeading": "Job proposals",
  "offers.invitationsHeading": "Invitations",
  "offers.noBookings": "No job proposals are waiting for your answer.",
  "offers.noInvitations": "No invitations are waiting for your answer.",
  "offers.untitledBooking": "Job proposal",
  "offers.untitledInvitation": "Invitation",
  "offers.from": "From",
  "offers.dates": "Dates",
  "offers.answerBy": "Answer by",
  "offers.accept": "Accept",
  "offers.decline": "Decline",
  "offers.previewAcceptBooking": "Accept this job proposal?",
  "offers.previewDeclineBooking": "Decline this job proposal?",
  "offers.previewAcceptInvitation": "Accept this invitation?",
  "offers.previewBody": "This is a real answer: the other side sees it. Nothing has been sent yet.",
  "offers.confirm": "Confirm my answer",
  "offers.cancel": "Back",
  "offers.doneTitle": "Your answer is recorded",
  "offers.doneBody": "The other side can see it now.",
  "offers.backToList": "Back to offers",
  "offers.prepareFailedTitle": "This answer could not be prepared",
  "offers.confirmFailedTitle": "Your answer was not recorded",
  "offers.clash": "These dates clash with work you already accepted. Open the proposal on the website to see the clash and decide there.",
  "offers.changed": "This offer has changed or was already answered. Go back to see the current list.",
  "opportunities.confirm": "Send",
  "opportunities.cancel": "Back",
  "opportunities.sentTitle": "Sent",
  "opportunities.sentBody": "The owner of this need can now see your interest on their own view.",
  "opportunities.sentStatus": "Status",
  "opportunities.another": "Back to the list",
  "opportunities.notVisible": "That need is no longer visible to you (it may have closed).",
  "opportunities.draftFailedTitle": "We could not prepare this",
  "opportunities.sendFailedTitle": "We could not send this",
  "availability.title": "Who is free",
  "availability.intro": "Your active roster over the next 7 days. Committed is not unavailable: an overlap is a warning, not a refusal.",
  "availability.actingFor": "Acting for",
  "availability.window": "Window",
  "availability.rosterTotal": "Roster members",
  "availability.state.free": "free",
  "availability.state.committed": "committed",
  "availability.state.unavailable": "unavailable",
  "availability.notFreeUntil": "not free until",
  "availability.committedTo": "committed to",
  "availability.overridable": "an authorized person may override",
  "availability.sourcesPartial": "Not every source answered: absences or commitments could not be read, so nobody here is reported as free with certainty.",
  "availability.personalWorkspace": "You are in your personal space. Switch to an organization workspace in Settings to see its roster.",
  "availability.noOrganization": "This account belongs to no organization, so there is no roster to report on.",
  "availability.noRoster": "This organization has no active roster members, so there is nobody to report on.",
  "availability.noCompanyContext": "This workspace cannot act as an employer, so there is no roster to report on.",
} as const;

export type MessageKey = keyof typeof en;

type Catalogue = Record<MessageKey, string>;

const lt: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Šiandien",
  "nav.journal": "Darbo dienoraštis",
  "nav.profile": "Profilis",
  "nav.settings": "Nustatymai",

  "auth.checking": "Tikriname tavo seansą…",
  "auth.signIn.title": "Prisijungti",
  "auth.signIn.email": "El. paštas",
  "auth.signIn.password": "Slaptažodis",
  "auth.signIn.submit": "Prisijungti",
  "auth.signIn.toRegister": "Sukurti paskyrą",
  "auth.register.title": "Sukurti paskyrą",
  "auth.register.submit": "Sukurti paskyrą",
  "auth.register.toSignIn": "Jau turiu paskyrą",
  "auth.signIn.forgot": "Pamiršai slaptažodį?",
  "auth.register.legal":
    "Sukurti paskyrą reiškia sutikti su naudojimo sąlygomis ir privatumo politika.",
  "auth.error.rejected": "Toks el. paštas ir slaptažodis nesutampa.",
  "auth.error.unreachable":
    "Nepavyko pasiekti serverio, todėl nežinome, ar duomenys teisingi. Patikrink ryšį ir bandyk dar kartą.",
  "auth.error.confirmationRequired":
    "Paskyra sukurta. Patvirtink nuorodą el. laiške ir tada prisijunk.",
  "auth.error.notConfigured":
    "Ši versija neturi serverio konfigūracijos, todėl prijungti negali.",
  "auth.signOut": "Atsijungti",

  "account.title": "Privatumas ir paskyra",
  "account.body":
    "Šios nuorodos atidaromos naršyklėje, svetainėje. Savo duomenų arba paskyros ištrynimo prašymas pateikiamas ten, skiltyje „Privatumas“.",
  "account.privacy": "Privatumas, tavo duomenys ir paskyros ištrynimas",
  "account.terms": "Naudojimo sąlygos",
  "account.privacyPolicy": "Privatumo politika",
  "account.deletionInfo": "Kaip ištrinama paskyra (prisijungti nereikia)",
  "account.support": "Susisiekti su pagalba (info@labourmarket.ai)",
  "account.external": "Naršyklė",
  "account.openFailed": "Nuorodos šiame telefone atidaryti nepavyko. Niekas nepakeista.",

  "session.unavailable.title": "Nepavyko patikrinti tavo seanso",
  "session.unavailable.body":
    "Tai nereiškia, kad atsijungei — telefono saugykla neatsakė. Bandyk dar kartą.",
  "session.unavailable.retry": "Bandyti dar kartą",

  "route.notFound.title": "Tokio ekrano šioje programėlėje nėra",
  "route.notFound.body":
    "Nuoroda, kuria atėjai, čia niekur neveda. Ji gali būti skirta svetainei arba būti pasenusi. Niekas niekur nebuvo išsiųsta.",
  "route.notFound.action": "Grįžti į programėlę",

  "crash.title": "Programėlėje įvyko klaida",
  "crash.body":
    "Tai pačios programėlės klaida, ne tavo veiksmas, ir niekas niekur nebuvo išsiųsta. Bandyk dar kartą — jei kartojasi, uždaryk programėlę ir atidaryk iš naujo.",

  "config.problem.title": "Ši versija nesukonfigūruota",
  "config.problem.body":
    "Programa negali pasileisti, kol nenustatytos šios reikšmės. Jokie duomenys niekur nebuvo išsiųsti.",

  "workspace.title": "Veiki kaip",
  "workspace.loading": "Skaitome tavo darbo erdves…",
  "workspace.active": "Aktyvi",
  "workspace.switching": "Keičiama…",
  "workspace.failed.title": "Nepavyko perskaityti tavo darbo erdvių",
  "workspace.failed.body":
    "Tai nepavykęs skaitymas, o ne atsakymas: tai nereiškia, kad nepriklausai jokiai organizacijai. Pabandyk po akimirkos.",
  "workspace.pointerUnavailable":
    "Tai apskaičiuota iš to, kam priklausai, o ne tavo išsaugotas pasirinkimas, ir kol kas čia to pakeisti negalima.",
  "workspace.switchFailed": "Darbo erdvė nepakeista. Niekas neperkelta.",
  "context.loading": "Skaitome tavo roles…",
  "context.active": "Aktyvi",
  "context.none": "Šioje paskyroje kol kas neįrašyta nė viena dalyvavimo rolė. Tai perskaitėme — ne programėlės klaida.",
  "context.title": "Dirbi kaip",
  "context.unavailable.title": "Kol kas negalime parodyti tavo kontekstų",
  "context.unavailable.body":
    "Programa gali tave prijungti, bet dar negali nuskaityti, kurioms organizacijoms priklausai. Tavo paskyroje nieko netrūksta — tiesiog ši programa dar negali to paklausti.",
  "context.mode.worker": "Aš pats",
  "context.mode.company": "Įmonė",
  "context.mode.agency": "Agentūra",
  "context.mode.customer": "Užsakovas",

  "language.title": "Kalba",
  "language.preview": "Peržiūros vertimas",

  "domain.loading": "Klausiame serverio…",
  "domain.retry": "Bandyti dar kartą",
  "domain.failedTitle": "Nepavyko įkelti",
  "domain.unavailable.notConnectedYet": "Dar neprijungta",
  "domain.unavailable.signInAgain": "Prisijunk iš naujo.",
  "domain.unavailable.offline": "Nėra ryšio. Niekas nebuvo išsiųsta.",
  "domain.unavailable.unexpectedAnswer":
    "Serveris atsakė tuo, ko ši programa nesuprato.",
  "domain.refused.no_credentials": "Prisijunk iš naujo.",
  "domain.refused.invalid_token": "Tavo seansas baigėsi. Prisijunk iš naujo.",
  "domain.refused.no_profile": "Ši paskyra dar neturi profilio.",
  "domain.refused.not_authorized":
    "Serveris atmetė šią užklausą šiai paskyrai.",
  "domain.refused.rate_limited":
    "Serveris paprašė programos sulėtėti. Bandyk po akimirkos.",
  "domain.refused.capability": "Serveris atmetė šią užklausą.",
  "domain.refused.identity_unavailable":
    "Nepavyko patvirtinti, kas esi. Tai nėra atsisakymas — bandyk dar kartą.",

  "today.signedInAs": "Prisijungta kaip",
  "today.recentWork": "Naujausi darbai",
  "journal.empty": "Darbo dienoraštyje dar nėra įrašų.",
  "journal.logWork": "Įrašyti darbą",
  "journal.compose.title": "Įrašyti darbą",
  "journal.compose.intro":
    "Aprašyk savais žodžiais, ką nuveikei. Darbo dienoraštis užfiksuos būtent tai, ką parašysi.",
  "journal.compose.date": "Darbo data",
  "journal.compose.dateHint": "Metai-mėnuo-diena, pavyzdžiui 2026-09-01",
  "journal.compose.today": "Šiandien",
  "journal.compose.yesterday": "Vakar",
  "journal.compose.notes": "Ką nuveikei",
  "journal.compose.notesHint":
    "Savais žodžiais. Laikas ir vietos rašomi taip pat čia.",
  "journal.compose.site": "Objektas arba vieta (nebūtina)",
  "journal.compose.context": "Darbo kontekstas",
  "journal.compose.contextUnnamed": "Nenurodyta",
  "journal.compose.review": "Peržiūrėti prieš įrašant",
  "journal.compose.previewTitle": "Patikrink prieš įrašant",
  "journal.compose.previewNothingSaved":
    "Kol kas niekas neįrašyta. Bus užfiksuota būtent tai.",
  "journal.compose.save": "Įrašyti į darbo dienoraštį",
  "journal.compose.edit": "Pakeisti",
  "journal.compose.chooseContext": "Kuriam darbui tai priklauso?",
  "journal.compose.chooseContextBody":
    "Šis įrašas gali priklausyti daugiau nei vienam tavo darbo kontekstui, todėl niekas neparuošta ir niekas neįrašyta. Pasirink vieną.",
  "journal.compose.savedTitle": "Įrašyta į darbo dienoraštį",
  "journal.compose.savedBody":
    "Tai jau užfiksuotas įrašas. Serveris išsaugojo būtent tai.",
  "journal.compose.another": "Įrašyti dar vieną",
  "journal.compose.backToJournal": "Grįžti į dienoraštį",
  "journal.compose.checkThis": "Pirmiausia patikrink",
  "journal.compose.invalidDate":
    "Datą rašyk metai-mėnuo-diena, pavyzdžiui 2026-09-01. Niekas nebuvo išsiųsta.",
  "journal.compose.futureDate":
    "Darbo data negali būti ateityje — žurnalo įrašas fiksuoja darbą, kuris jau įvyko. Niekas nebuvo išsiųsta.",
  "journal.compose.notesRequired":
    "Prieš įrašant aprašyk, ką nuveikei. Niekas nebuvo išsiųsta.",
  "journal.compose.draftFailedTitle": "Nepavyko paruošti šio įrašo",
  "journal.compose.saveFailedTitle": "Nepavyko įrašyti šio įrašo",
  "journal.compose.staleDraft":
    "Neįrašyta: po paruošimo tavo dienoraštis pasikeitė, todėl patikra nebegalioja. Peržiūrėk dar kartą.",
  "journal.compose.noContext":
    "Ši paskyra neturi aktyvaus darbo konteksto, todėl įrašui nėra kur atsidurti. Pirmiausia svetainėje nurodyk, kur dirbi, o tada įrašyk darbą čia.",
  "journal.compose.unsureSaved":
    "Ryšys nutrūko jau išsiuntus, todėl nežinome, ar įrašas pasiekė serverį. Prieš rašant iš naujo atsidaryk darbo dienoraštį ir patikrink. Bandymas dar kartą dublikato nesukurs.",
  "journal.compose.skillsAdded": "Nauji užfiksuoti įgūdžiai",
  "journal.compose.skillsStrengthened": "Įgūdžiai su naujais įrodymais",
  "journal.compose.skillsClaims": "Iš tavo žodžių pastebėti gebėjimai",
  "journal.compose.skillsReview": "Laukia tavo peržiūros",
  "journal.compose.noCvChange":
    "Iš šio įrašo į gyvąjį CV nieko naujo nepridėta.",
  "journal.compose.skillsPartial":
    "Dalis gyvojo CV atnaujinimo nebaigta. Pats įrašas išsaugotas.",
  "journal.compose.skillsFailed":
    "Šįkart gyvojo CV atnaujinimas nebuvo atliktas. Pats įrašas išsaugotas.",
  "journal.compose.reviewOnWeb":
    "Tai, kas laukia peržiūros, patvirtinama svetainėje.",
  "profile.skillsEmpty": "Įgūdžių dar neužfiksuota.",
  "journal.correct.action":
    "Taisyti šį įrašą",
  "journal.correct.title":
    "Taisyti įrašą",
  "journal.correct.intro":
    "Pakeisk tai, kas neteisinga – žodžius, dieną ar vietą. Ankstesnė versija lieka tavo istorijoje; sumos skaičiuoja pataisytą.",
  "journal.correct.nothingChanged":
    "Kol kas niekas nepakeista. Pirmiausia pataisyk žodžius, dieną ar vietą.",
  "journal.correct.previewTitle":
    "Patikrink pataisymą prieš įrašant",
  "journal.correct.before":
    "Dabar",
  "journal.correct.after":
    "Po pataisymo",
  "journal.correct.hours":
    "Valandos",
  "journal.correct.output":
    "Atlikta",
  "journal.correct.wasConfirmed":
    "Šį įrašą patvirtino vadovas. Patvirtinimas lieka ankstesnei versijai; pataisyta versija įrašoma kaip dar nepatvirtinta.",
  "journal.correct.save":
    "Įrašyti pataisymą",
  "journal.correct.savedTitle":
    "Pataisymas įrašytas",
  "journal.correct.savedBody":
    "Tavo dienoraštis ir sumos dabar rodo pataisytą versiją.",
  "journal.correct.savedConfirmedBody":
    "Pataisyta versija įrašyta ir laukia vadovo patvirtinimo; ankstesnė patvirtinta versija lieka tavo istorijoje.",
  "journal.correct.draftFailedTitle":
    "Nepavyko paruošti pataisymo",
  "journal.correct.saveFailedTitle":
    "Nepavyko įrašyti pataisymo",
  "journal.correct.unsureSaved":
    "Pataisymas išsiųstas, bet atsakymas negrįžo, todėl nežinome, ar jis įrašytas. Bandyti dar kartą saugu: jau įrašytas pataisymas atmetamas, dvigubai neįrašomas.",
  "journal.correct.staleDraft":
    "Neįrašyta: po pataisymo paruošimo tavo dienoraštis pasikeitė. Peržiūrėk dar kartą.",
  "journal.correct.superseded":
    "Šis įrašas jau pataisytas arba pašalintas. Atidaryk dienoraštį iš naujo ir taisyk dabartinę versiją.",
  "journal.correct.notFound":
    "Šio įrašo nėra tarp naujausių tavo dienoraščio įrašų. Galbūt jis jau pataisytas.",
  "journal.correct.conflict":
    "Nauji žodžiai nurodo vieną trukmę visam įrašui, bet įraše dar yra atliktas kiekis, o abiem reikia to paties lauko. Nurodyk laiką kiekvienai veiklai arba pataisyk įrašą svetainėje.",
  "journal.correct.missingTitle":
    "Šio įrašo čia pataisyti negalima",
  "today.openMessages":
    "Žinutės",
  "messages.title":
    "Žinutės",
  "messages.conversation":
    "Pokalbis",
  "messages.intro":
    "Tavo pokalbiai LabourMarket.ai viduje. Žinutės lieka programėlėje – nieko nesiunčiame el. paštu ar SMS. Naujos žinutės matomos atidarius šį ekraną.",
  "messages.none":
    "Kol kas neturi pokalbių.",
  "messages.untitled":
    "Pokalbis",
  "messages.threadEmpty":
    "Šiame pokalbyje dar nėra žinučių.",
  "messages.fromMe":
    "Tu",
  "messages.fromThem":
    "Pašnekovas",
  "messages.replyLabel":
    "Tavo atsakymas",
  "messages.review":
    "Peržiūrėti prieš siunčiant",
  "messages.emptyBody":
    "Pirmiausia parašyk žinutę.",
  "messages.previewTitle":
    "Patikrink prieš siunčiant",
  "messages.previewNothingSent":
    "Kol kas niekas neišsiųsta. Būtent šį tekstą matys kitas žmogus.",
  "messages.send":
    "Siųsti",
  "messages.sentTitle":
    "Išsiųsta",
  "messages.sentBody":
    "Tavo žinutė yra pokalbyje.",
  "messages.sentUnverified":
    "Serveris žinutę priėmė, bet nuskaityta ji nesutapo. Atidaryk pokalbį iš naujo ir patikrink.",
  "messages.writeAnother":
    "Rašyti kitą žinutę",
  "messages.draftFailedTitle":
    "Nepavyko paruošti žinutės",
  "messages.sendFailedTitle":
    "Nepavyko išsiųsti žinutės",
  "messages.unsureSent":
    "Žinutė išsiųsta, bet atsakymas negrįžo, todėl nežinome, ar ji pasiekė. Prieš siųsdamas antrą kartą, atidaryk pokalbį iš naujo.",
  "messages.staleDraft":
    "Neišsiųsta: tau ruošiant atsakymą, pokalbyje atsirado nauja žinutė. Perskaityk ją ir peržiūrėk atsakymą dar kartą.",
  "messages.notFound":
    "Šis pokalbis nėra tavo arba jo nebėra.",
  "messages.noPermission":
    "Šiame pokalbyje rašyti negali.",
  "today.openNotifications":
    "Pranešimai",
  "notifications.title":
    "Pranešimai",
  "notifications.intro":
    "Kas nutiko tavo darbe – naujausi viršuje. Atidarius pranešimas pažymimas kaip perskaitytas. Pranešimai į telefoną nesiunčiami – jie matomi čia, atidarius šį ekraną.",
  "notifications.none":
    "Pranešimų neturi.",
  "notifications.unread":
    "Nauja",
  "notifications.markAll":
    "Pažymėti visus kaip perskaitytus",
  "notifications.markFailedTitle":
    "Nepavyko pažymėti kaip perskaityto",
  "notifications.type.unknown":
    "Pranešimas",
  "notifications.type.event_absence_approved":
    "Tavo neatvykimas patvirtintas",
  "notifications.type.event_absence_rejected":
    "Tavo neatvykimas atmestas",
  "notifications.type.event_absence_requested":
    "Tau užregistruotas neatvykimas",
  "notifications.type.event_booking_accepted":
    "Tavo rezervacijos pasiūlymas priimtas",
  "notifications.type.event_booking_declined":
    "Tavo rezervacijos pasiūlymas atmestas",
  "notifications.type.event_booking_proposed":
    "Gavai rezervacijos pasiūlymą",
  "notifications.type.event_booking_withdrawn":
    "Rezervacijos pasiūlymas atšauktas",
  "notifications.type.event_demand_interest_expressed":
    "Darbuotojas pareiškė susidomėjimą tavo poreikiu",
  "notifications.type.event_demand_interest_reviewed":
    "Įmonė pažymėjo tavo susidomėjimą kaip peržiūrėtą",
  "notifications.type.event_document_ack_assigned":
    "Tavęs paprašyta patvirtinti, kad perskaitei dokumentą.",
  "notifications.type.event_document_ack_completed":
    "Dokumentas, kurį siuntei patvirtinti, buvo patvirtintas.",
  "notifications.type.event_document_expiring":
    "Netrukus baigsis dokumento galiojimas.",
  "notifications.type.event_engagement_created":
    "Sukurtas naujas bendradarbiavimas",
  "notifications.type.event_engagement_ended":
    "Darbo santykis baigtas",
  "notifications.type.event_history_link_offered":
    "Organizacija pasiūlė susieti tavo užfiksuotą darbo istoriją su tavo paskyra",
  "notifications.type.event_invitation_accepted":
    "Kažkas priėmė tavo kvietimą",
  "notifications.type.event_job_alert":
    "Atsirado naujas darbas pagal tavo paieškos kriterijus",
  "notifications.type.event_journal_review_decided":
    "Tavo darbo žurnalo įrašas peržiūrėtas",
  "notifications.type.event_journal_review_decided_approved":
    "Tavo darbo žurnalo įrašas patvirtintas",
  "notifications.type.event_journal_review_decided_changes_requested":
    "Paprašyta pakeisti tavo darbo žurnalo įrašą",
  "notifications.type.event_journal_review_decided_rejected":
    "Tavo darbo žurnalo įrašas atmestas",
  "notifications.type.event_message_received":
    "Gavai naują žinutę",
  "notifications.type.event_saved_search_match":
    "Tavo išsaugotoje paieškoje yra naujų rezultatų",
  "notifications.type.event_weekly_digest":
    "Paruošta tavo savaitės darbo ir galimybių apžvalga",
  "notifications.type.event_weekly_digest_journal":
    "Paruošta tavo savaitės darbo žurnalo apžvalga",
  "notifications.type.event_weekly_digest_profile_completion":
    "Norint pamatyti tau tinkamus darbus, patvirtink, kokį darbą dirbi",
  "notifications.type.event_work_task_assigned":
    "Tau priskirta užduotis",
  "notifications.type.event_workflow_decided":
    "Dėl tavo tvirtinimo prašymo priimtas sprendimas",
  "notifications.type.event_workflow_delegated":
    "Tau perduotas tvirtinimo etapas",
  "notifications.type.event_workflow_escalated":
    "Tvirtinimo etapas viršijo terminą",
  "notifications.type.event_workflow_step_pending":
    "Tvirtinimo prašymas laukia tavo sprendimo",
  "today.openProjects":
    "Mano projektai",
  "projects.title":
    "Mano projektai",
  "projects.detailTitle":
    "Projektas",
  "projects.none":
    "Tau nepriskirtas joks projektas.",
  "projects.active":
    "Aktyvus",
  "projects.ended":
    "Baigtas",
  "projects.asksCount":
    "Dar reikia iš tavęs",
  "projects.moreOnWeb":
    "Čia rodomi tik pirmieji tavo projektai. Svetainėje matysi visus.",
  "projects.notFound":
    "Šis projektas nėra tavo arba jo nėra tarp čia rodomų projektų.",
  "projects.asksTitle":
    "Dar reikia iš tavęs",
  "projects.asksShownOf":
    "Rodoma čia / iš viso dar atvira – visas sąrašas svetainėje",
  "projects.asksUnavailable":
    "Šiuo metu nepavyko nuskaityti, ko dar reikia iš tavęs. Bandyk dar kartą arba atidaryk projektą svetainėje.",
  "projects.asksNotRead":
    "Šis priskyrimas baigtas. Kas jame buvo prašyta iš tavęs, matysi projekto puslapyje svetainėje.",
  "projects.asksIncomplete":
    "Tavo projektuose atvira daugiau, nei programėlė gali išvardyti, todėl šio projekto dalis gali būti neparodyta. Visas sąrašas – projekto puslapyje svetainėje.",
  "projects.asksNone":
    "Šiame projekte tau nieko neliko atlikti.",
  "projects.ask.needed":
    "Reikia",
  "projects.ask.missing":
    "Trūksta",
  "projects.ask.rejected":
    "Atmesta – reikia naujo",
  "projects.ask.expired":
    "Nebegalioja",
  "projects.instructionTitle":
    "Naujausias nurodymas",
  "projects.answerInstruction":
    "Atsakyti žinutėse",
  "projects.webDetail":
    "Visas projekto puslapis – etapai, dokumentai ir komanda – yra svetainėje.",
  "messages.threadNotShown":
    "Pokalbis dar neparodytas. Palauk, kol jis įsikels, perskaityk jį ir tada peržiūrėk savo atsakymą.",
  "messages.newBeforeReview":
    "Šiame pokalbyje atėjo nauja žinutė. Ji jau rodoma aukščiau – perskaityk ją ir dar kartą peržiūrėk savo atsakymą.",
  "profile.noWorkerProfile": "Ši paskyra dar neturi darbuotojo profilio.",
  "profile.figuresTitle": "Įgūdžiai su tavo užrašytomis valandomis",
  "profile.groupManagerConfirmed": "Vadovo patvirtinta",
  "profile.groupJournalBacked": "Paremta tavo darbo dienoraščiu",
  "profile.groupDeclared": "Tavo nurodyta",
  "profile.figuresUnavailable":
    "Valandų, dalies ir įrašų šį kartą perskaityti nepavyko. Įgūdžiai žemiau vis tiek yra tavo užfiksuoti įgūdžiai — niekas nerodoma kaip 0.",
  "profile.figuresLegend":
    "Valandos · dalis iš įgūdžiams priskirtų valandų · įrašai, per visą laiką. Tie patys skaičiai kaip svetainėje.",
  "profile.figuresNotRead": "skaičių perskaityti nepavyko",
  "profile.noFigures": "užrašytų valandų nėra",
  "profile.involvedUnattributed": "dalyvavo; laikas nepriskirtas vien šiam įgūdžiui",
  "profile.hoursShort": "val.",
  "profile.entriesLabel": "įr.",
  "profile.selfStatedMissing":
    "Gebėjimai, kuriuos užrašei savais žodžiais, į šį ekraną dar neperkeliami; svetainė juos rodo prie tavo įgūdžių.",
  "profile.openJournal": "Atidaryti darbo dienoraštį",
  "journal.openProfile": "Kiek šie įrašai sudaro — tavo profilyje",

  "today.figuresTitle": "Tavo veikla skaičiais",
  "today.periodToday": "Šiandien",
  "today.periodWeek": "Paskutinės 7 dienos",
  "today.hoursLabel": "Valandos",
  "today.daysUnitLabel": "užrašyta dienomis",
  "today.entriesLabel": "Įrašai",
  "today.daysLabel": "Dienos",
  "today.confirmedLabel": "Vadovo patvirtinta, val.",
  "today.periodEmpty": "Šiame lange nieko neužrašyta.",
  "today.periodMissing": "Serveris šiam langui skaičiaus neatsiuntė.",
  "today.dominantTitle": "Didžiausia tavo valandų dalis per 7 dienas",
  "today.dominantShare": "iš įgūdžiams priskirtų valandų",
  "today.dominantNone":
    "Per paskutines 7 dienas nė vienam įgūdžiui valandos nepriskirtos.",
  "today.coverageTruncated":
    "Šie skaičiai remiasi paskutiniais perskaitytais įrašais — senesni įrašai neįtraukti.",
  "today.figuresScope":
    "Iš tavo darbo dienoraščio įrašų, pagal tą pačią taisyklę kaip svetainėje. Kalendorinės dienos baigiasi šiandien (UTC).",
  "today.openJournal": "Atidaryti darbo dienoraštį",
  "today.openProfile": "Atidaryti profilį ir įgūdžius",
  "today.openNeed": "Paskelbti poreikį žmonėms",
  "need.title": "Paskelbti poreikį",
  "need.intro": "Darbuotojų poreikis organizacijai, už kurią veiki. Prieš sukuriant peržiūri; darbuotojai, kurie gali jį matyti, randa jį savo lentoje.",
  "need.descriptionLabel": "Ko reikia?",
  "need.descriptionHint": "Savais žodžiais — koks darbas, kada, kiek žmonių.",
  "need.roleLabel": "Vaidmuo",
  "need.locationLabel": "Vieta",
  "need.teamSizeLabel": "Kiek žmonių",
  "need.teamSizeHint": "Sveikas skaičius",
  "need.urgencyLabel": "Kaip skubu",
  "need.urgency.flexible": "Lanksčiai",
  "need.urgency.this_week": "Šią savaitę",
  "need.urgency.urgent": "Skubu",
  "need.descriptionRequired": "Parašyk bent kelis žodžius apie tai, ko reikia. Niekas neišsiųsta.",
  "need.teamSizeInvalid": "Žmonių skaičius turi būti sveikas skaičius nuo 1. Niekas neišsiųsta.",
  "need.review": "Peržiūrėti prieš kuriant",
  "need.cancel": "Atgal",
  "need.previewTitle": "Patikrink prieš sukurdamas",
  "need.previewBody": "Dar niekas nesukurta.",
  "need.actingFor": "Kam",
  "need.confirm": "Sukurti poreikį",
  "need.edit": "Taisyti",
  "need.sentTitle": "Sukurta",
  "need.sentBody": "Poreikis dabar atviras organizacijai. Sekti gali svetainėje.",
  "need.done": "Grįžti į Šiandien",
  "need.overLimit": "Ši organizacija pasiekė savo plano aktyvių pozicijų ribą. Niekas nesukurta — uždaryk poreikį arba pakeisk planą svetainėje.",
  "need.draftFailedTitle": "Nepavyko paruošti šio poreikio",
  "need.sendFailedTitle": "Nepavyko sukurti šio poreikio",
  "today.openJobs": "Naršyti atvirus darbus",
  "jobs.title": "Darbai",
  "jobs.intro": "Viešas darbo skelbimų sąrašas — tie patys skelbimai kaip svetainėje. Darbdavys ir kaip kandidatuoti atsidaro svetainėje tavo vardu.",
  "jobs.queryLabel": "Paieška",
  "jobs.queryHint": "Profesija arba žodis iš pavadinimo, bet kuria kalba",
  "jobs.search": "Ieškoti darbų",
  "jobs.total": "Darbai",
  "jobs.page": "puslapis",
  "jobs.none": "Šiuo metu pagal šią paiešką darbų nėra.",
  "jobs.prev": "Ankstesnis puslapis",
  "jobs.next": "Kitas puslapis",
  "jobs.openWeb": "Atidaryti visą skelbimą",
  "jobs.positions": "Vietos",
  "jobs.compensation": "Atlygis",
  "jobs.published": "Paskelbta",
  "jobs.untitled": "Darbas",
  "jobs.notProvisioned": "Darbo skelbimų sąrašas šioje aplinkoje neįjungtas.",
  "jobs.unavailable": "Darbo skelbimų sąrašas neatsakė laiku. Tai nereiškia, kad darbų nėra — pabandyk dar kartą.",
  "jobs.linkedNotFound": "Šio skelbimo sąraše nebėra (galbūt jis uždarytas).",
  "today.openOpportunities": "Tau atviri poreikiai",
  "today.openAvailability": "Kas iš tavo komandos laisvas",
  "opportunities.title": "Galimybės",
  "opportunities.intro": "Poreikiai, kuriuos matai dabar. Susidomėjimas parodomas poreikio savininkui jo paties rodinyje — niekas neišeina už platformos ribų.",
  "opportunities.noneVisible": "Šiuo metu tau nematomas joks poreikis. Kai organizacija, su kuria esi susietas, atvers poreikį, jis atsiras čia.",
  "opportunities.express": "Man įdomu",
  "opportunities.noteLabel": "Žinutė jiems (nebūtina)",
  "opportunities.noteHint": "Sakinys apie tai, kodėl arba kada — jie skaito taip, kaip parašyta.",
  "opportunities.draft": "Peržiūrėti prieš siunčiant",
  "opportunities.previewTitle": "Patikrink prieš siųsdamas",
  "opportunities.previewBody": "Dar niekas neišsiųsta.",
  "opportunities.alreadyExpressed": "Susidomėjimą šiuo poreikiu jau išreiškei; siunčiant dar kartą jis atnaujinamas.",
  "today.openOffers": "Tau skirti pasiūlymai ir kvietimai",
  "offers.title": "Pasiūlymai",
  "offers.reviewNotice": "Jei sutiksi, {organization} vadovas galės skaityti tavo šiai įmonei užfiksuotą darbą, jį peržiūrėti ir pažymėti. Kol to nepadaro, tai lieka tavo įrašas.",
  "offers.as": "Kaip",
  "offers.relationship.collaborator": "Bendradarbis",
  "offers.relationship.consultant": "Konsultantas",
  "offers.relationship.employee": "Darbuotojas",
  "offers.relationship.freelancer": "Laisvai samdomas",
  "offers.relationship.manager": "Vadovas",
  "offers.relationship.owner": "Savininkas",
  "offers.relationship.student": "Studentas",
  "offers.relationship.unemployed": "Bedarbis",
  "offers.relationship.volunteer": "Savanoris",
  "offers.relationship.intern": "Praktikantas",
  "offers.relationship.external_manager": "Išorinis vadovas (užsakovo)",
  "offers.relationship.other": "Kitas ryšys",
  "offers.intro": "Tau skirti darbo pasiūlymai ir kvietimai. Niekas nepasikeičia, kol nepatvirtini savo atsakymo.",
  "offers.bookingsHeading": "Darbo pasiūlymai",
  "offers.invitationsHeading": "Kvietimai",
  "offers.noBookings": "Nėra darbo pasiūlymų, laukiančių tavo atsakymo.",
  "offers.noInvitations": "Nėra kvietimų, laukiančių tavo atsakymo.",
  "offers.untitledBooking": "Darbo pasiūlymas",
  "offers.untitledInvitation": "Kvietimas",
  "offers.from": "Nuo",
  "offers.dates": "Datos",
  "offers.answerBy": "Atsakyti iki",
  "offers.accept": "Priimti",
  "offers.decline": "Atsisakyti",
  "offers.previewAcceptBooking": "Priimti šį darbo pasiūlymą?",
  "offers.previewDeclineBooking": "Atsisakyti šio darbo pasiūlymo?",
  "offers.previewAcceptInvitation": "Priimti šį kvietimą?",
  "offers.previewBody": "Tai tikras atsakymas: kita pusė jį matys. Kol kas niekas neišsiųsta.",
  "offers.confirm": "Patvirtinti atsakymą",
  "offers.cancel": "Atgal",
  "offers.doneTitle": "Tavo atsakymas užfiksuotas",
  "offers.doneBody": "Kita pusė jį jau mato.",
  "offers.backToList": "Atgal į pasiūlymus",
  "offers.prepareFailedTitle": "Šio atsakymo nepavyko paruošti",
  "offers.confirmFailedTitle": "Tavo atsakymas neužfiksuotas",
  "offers.clash": "Šios datos kertasi su jau priimtu darbu. Atidaryk pasiūlymą svetainėje, pamatyk susikirtimą ir nuspręsk ten.",
  "offers.changed": "Šis pasiūlymas pasikeitė arba į jį jau atsakyta. Grįžk atgal ir pamatyk dabartinį sąrašą.",
  "opportunities.confirm": "Siųsti",
  "opportunities.cancel": "Atgal",
  "opportunities.sentTitle": "Išsiųsta",
  "opportunities.sentBody": "Šio poreikio savininkas dabar mato tavo susidomėjimą savo rodinyje.",
  "opportunities.sentStatus": "Būsena",
  "opportunities.another": "Grįžti į sąrašą",
  "opportunities.notVisible": "Šio poreikio nebematai (galbūt jis uždarytas).",
  "opportunities.draftFailedTitle": "Nepavyko paruošti",
  "opportunities.sendFailedTitle": "Nepavyko išsiųsti",
  "availability.title": "Kas laisvas",
  "availability.intro": "Tavo aktyvi komanda artimiausias 7 dienas. Įsipareigojęs nereiškia neprieinamas: persidengimas yra įspėjimas, ne atsisakymas.",
  "availability.actingFor": "Veikiama už",
  "availability.window": "Langas",
  "availability.rosterTotal": "Komandos nariai",
  "availability.state.free": "laisvas",
  "availability.state.committed": "įsipareigojęs",
  "availability.state.unavailable": "neprieinamas",
  "availability.notFreeUntil": "nelaisvas iki",
  "availability.committedTo": "įsipareigojęs",
  "availability.overridable": "įgaliotas asmuo gali nuspręsti kitaip",
  "availability.sourcesPartial": "Atsakė ne visi šaltiniai: nepavyko perskaityti nebuvimų arba įsipareigojimų, todėl niekas čia nerodomas kaip tikrai laisvas.",
  "availability.personalWorkspace": "Esi savo asmeninėje erdvėje. Nustatymuose perjunk į organizacijos erdvę, kad matytum jos komandą.",
  "availability.noOrganization": "Ši paskyra nepriklauso jokiai organizacijai, todėl nėra komandos, apie kurią pranešti.",
  "availability.noRoster": "Ši organizacija neturi aktyvių komandos narių, todėl nėra apie ką pranešti.",
  "availability.noCompanyContext": "Ši erdvė negali veikti kaip darbdavys, todėl nėra komandos, apie kurią pranešti.",
};

const ru: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Сегодня",
  "nav.journal": "Дневник работы",
  "nav.profile": "Профиль",
  "nav.settings": "Настройки",

  "auth.checking": "Проверяем вашу сессию…",
  "auth.signIn.title": "Вход",
  "auth.signIn.email": "Электронная почта",
  "auth.signIn.password": "Пароль",
  "auth.signIn.submit": "Войти",
  "auth.signIn.toRegister": "Создать аккаунт",
  "auth.register.title": "Создать аккаунт",
  "auth.register.submit": "Создать аккаунт",
  "auth.register.toSignIn": "У меня уже есть аккаунт",
  "auth.signIn.forgot": "Забыли пароль?",
  "auth.register.legal":
    "Создавая аккаунт, вы принимаете условия использования и политику конфиденциальности.",
  "auth.error.rejected": "Такая почта и пароль не совпадают.",
  "auth.error.unreachable":
    "Не удалось связаться с сервером, поэтому мы не знаем, верны ли данные. Проверьте соединение и попробуйте снова.",
  "auth.error.confirmationRequired":
    "Аккаунт создан. Подтвердите ссылку в письме, затем войдите.",
  "auth.error.notConfigured":
    "В этой сборке нет настроек сервера, поэтому вход невозможен.",
  "auth.signOut": "Выйти",

  "account.title": "Конфиденциальность и аккаунт",
  "account.body":
    "Эти ссылки открываются в браузере, на сайте. Запросить свои данные или удаление аккаунта можно там, в разделе «Конфиденциальность».",
  "account.privacy": "Конфиденциальность, ваши данные и удаление аккаунта",
  "account.terms": "Условия использования",
  "account.privacyPolicy": "Политика конфиденциальности",
  "account.deletionInfo": "Как удаляется аккаунт (вход не нужен)",
  "account.support": "Связаться с поддержкой (info@labourmarket.ai)",
  "account.external": "Браузер",
  "account.openFailed": "Не удалось открыть ссылку на этом телефоне. Ничего не изменено.",

  "session.unavailable.title": "Не удалось проверить вашу сессию",
  "session.unavailable.body":
    "Это не значит, что вы вышли, — защищённое хранилище телефона не ответило. Попробуйте снова.",
  "session.unavailable.retry": "Попробовать снова",

  "route.notFound.title": "Такого экрана в приложении нет",
  "route.notFound.body":
    "Ссылка, по которой вы перешли, здесь никуда не ведёт. Возможно, она предназначена для сайта или устарела. Никуда ничего не отправлено.",
  "route.notFound.action": "Вернуться в приложение",

  "crash.title": "В приложении произошёл сбой",
  "crash.body":
    "Это сбой самого приложения, а не ваша ошибка, и никуда ничего не отправлено. Попробуйте снова — если повторяется, закройте приложение и откройте заново.",

  "config.problem.title": "Эта сборка не настроена",
  "config.problem.body":
    "Приложение не запустится, пока не заданы эти значения. Никакие данные никуда не отправлялись.",

  "workspace.title": "Действуете от имени",
  "workspace.loading": "Читаем ваши рабочие пространства…",
  "workspace.active": "Активное",
  "workspace.switching": "Переключаем…",
  "workspace.failed.title": "Не удалось прочитать ваши рабочие пространства",
  "workspace.failed.body":
    "Это неудавшееся чтение, а не ответ: оно не означает, что вы не состоите ни в одной организации. Попробуйте через мгновение.",
  "workspace.pointerUnavailable":
    "Это выведено из того, где вы состоите, а не сохранённый вами выбор, и изменить это здесь пока нельзя.",
  "workspace.switchFailed": "Рабочее пространство не изменено. Ничего не перенесено.",
  "context.loading": "Читаем ваши роли…",
  "context.active": "Активная",
  "context.none": "В этой учётной записи пока не записана ни одна роль участия. Это то, что мы прочитали, а не сбой приложения.",
  "context.title": "Вы работаете как",
  "context.unavailable.title": "Пока мы не можем показать ваши контексты",
  "context.unavailable.body":
    "Приложение может вас авторизовать, но пока не может прочитать, к каким организациям вы относитесь. В вашем аккаунте ничего не пропало — это приложение просто ещё не может об этом спросить.",
  "context.mode.worker": "Я сам",
  "context.mode.company": "Компания",
  "context.mode.agency": "Агентство",
  "context.mode.customer": "Заказчик",

  "language.title": "Язык",
  "language.preview": "Предварительный перевод",

  "domain.loading": "Спрашиваем сервер…",
  "domain.retry": "Попробовать снова",
  "domain.failedTitle": "Не удалось загрузить",
  "domain.unavailable.notConnectedYet": "Пока не подключено",
  "domain.unavailable.signInAgain": "Войдите снова.",
  "domain.unavailable.offline": "Нет соединения. Ничего не отправлено.",
  "domain.unavailable.unexpectedAnswer":
    "Сервер ответил тем, чего это приложение не поняло.",
  "domain.refused.no_credentials": "Войдите снова.",
  "domain.refused.invalid_token": "Ваша сессия закончилась. Войдите снова.",
  "domain.refused.no_profile": "У этого аккаунта пока нет профиля.",
  "domain.refused.not_authorized":
    "Сервер отклонил этот запрос для этого аккаунта.",
  "domain.refused.rate_limited":
    "Сервер попросил приложение замедлиться. Попробуйте чуть позже.",
  "domain.refused.capability": "Сервер отклонил этот запрос.",
  "domain.refused.identity_unavailable":
    "Не удалось подтвердить, кто вы. Это не отказ — попробуйте снова.",

  "today.signedInAs": "Вы вошли как",
  "today.recentWork": "Недавняя работа",
  "journal.empty": "В дневнике работы пока нет записей.",
  "journal.logWork": "Записать работу",
  "journal.compose.title": "Записать работу",
  "journal.compose.intro":
    "Опишите своими словами, что вы сделали. Дневник работы сохранит именно то, что вы напишете.",
  "journal.compose.date": "Дата работы",
  "journal.compose.dateHint": "Год-месяц-день, например 2026-09-01",
  "journal.compose.today": "Сегодня",
  "journal.compose.yesterday": "Вчера",
  "journal.compose.notes": "Что вы сделали",
  "journal.compose.notesHint":
    "Своими словами. Время и места пишите здесь же.",
  "journal.compose.site": "Объект или место (необязательно)",
  "journal.compose.context": "Рабочий контекст",
  "journal.compose.contextUnnamed": "Не указан",
  "journal.compose.review": "Проверить перед сохранением",
  "journal.compose.previewTitle": "Проверьте это перед сохранением",
  "journal.compose.previewNothingSaved":
    "Пока ничего не сохранено. Записано будет именно это.",
  "journal.compose.save": "Сохранить в дневник работы",
  "journal.compose.edit": "Изменить",
  "journal.compose.chooseContext": "К какой работе это относится?",
  "journal.compose.chooseContextBody":
    "Эта запись может относиться более чем к одному вашему рабочему контексту, поэтому ничего не подготовлено и ничего не сохранено. Выберите один.",
  "journal.compose.savedTitle": "Сохранено в дневник работы",
  "journal.compose.savedBody":
    "Это уже сохранённая запись. Сервер сохранил именно это.",
  "journal.compose.another": "Записать ещё",
  "journal.compose.backToJournal": "Вернуться в дневник",
  "journal.compose.checkThis": "Сначала проверьте",
  "journal.compose.invalidDate":
    "Укажите дату как год-месяц-день, например 2026-09-01. Ничего не отправлено.",
  "journal.compose.futureDate":
    "Дата работы не может быть в будущем — запись в журнале фиксирует уже выполненную работу. Ничего не отправлено.",
  "journal.compose.notesRequired":
    "Опишите, что вы сделали, прежде чем сохранять. Ничего не отправлено.",
  "journal.compose.draftFailedTitle": "Не удалось подготовить эту запись",
  "journal.compose.saveFailedTitle": "Не удалось сохранить эту запись",
  "journal.compose.staleDraft":
    "Не сохранено: после подготовки ваш дневник изменился, и проверка устарела. Проверьте ещё раз.",
  "journal.compose.noContext":
    "У этого аккаунта нет активного рабочего контекста, поэтому записи некуда попасть. Сначала укажите на сайте, где вы работаете, затем записывайте работу здесь.",
  "journal.compose.unsureSaved":
    "Связь пропала уже после отправки, поэтому мы не знаем, дошла ли запись. Откройте дневник работы и проверьте, прежде чем писать заново. Повторная попытка не создаст дубликат.",
  "journal.compose.skillsAdded": "Новые записанные навыки",
  "journal.compose.skillsStrengthened": "Навыки с новым подтверждением",
  "journal.compose.skillsClaims": "Способности, отмеченные из ваших слов",
  "journal.compose.skillsReview": "Ждёт вашей проверки",
  "journal.compose.noCvChange":
    "Из этой записи в живое CV ничего нового не добавлено.",
  "journal.compose.skillsPartial":
    "Часть обновления живого CV не завершилась. Сама запись сохранена.",
  "journal.compose.skillsFailed":
    "Обновление живого CV в этот раз не выполнялось. Сама запись сохранена.",
  "journal.compose.reviewOnWeb":
    "То, что ждёт проверки, подтверждается на сайте.",
  "profile.skillsEmpty": "Навыки пока не записаны.",
  "journal.correct.action":
    "Исправить эту запись",
  "journal.correct.title":
    "Исправить запись",
  "journal.correct.intro":
    "Измените то, что неверно, — текст, день или место. Прежняя версия остаётся в истории; итоги считают исправленную.",
  "journal.correct.nothingChanged":
    "Пока ничего не изменено. Сначала исправьте текст, день или место.",
  "journal.correct.previewTitle":
    "Проверьте исправление перед сохранением",
  "journal.correct.before":
    "Сейчас",
  "journal.correct.after":
    "После исправления",
  "journal.correct.hours":
    "Часы",
  "journal.correct.output":
    "Выполнено",
  "journal.correct.wasConfirmed":
    "Эту запись подтвердил руководитель. Подтверждение остаётся у прежней версии; исправленная сохраняется как ещё не подтверждённая.",
  "journal.correct.save":
    "Сохранить исправление",
  "journal.correct.savedTitle":
    "Исправление сохранено",
  "journal.correct.savedBody":
    "Журнал и итоги теперь показывают исправленную версию.",
  "journal.correct.savedConfirmedBody":
    "Исправленная версия сохранена и ждёт подтверждения руководителя; прежняя подтверждённая версия остаётся в истории.",
  "journal.correct.draftFailedTitle":
    "Не удалось подготовить исправление",
  "journal.correct.saveFailedTitle":
    "Не удалось сохранить исправление",
  "journal.correct.unsureSaved":
    "Исправление отправлено, но ответ не пришёл, поэтому неизвестно, сохранено ли оно. Повторить безопасно: уже сохранённое исправление будет отклонено, а не сохранено дважды.",
  "journal.correct.staleDraft":
    "Не сохранено: журнал изменился после подготовки исправления. Проверьте ещё раз.",
  "journal.correct.superseded":
    "Эта запись уже исправлена или удалена. Откройте журнал снова и исправьте текущую версию.",
  "journal.correct.notFound":
    "Этой записи нет среди ваших последних записей журнала. Возможно, она уже исправлена.",
  "journal.correct.conflict":
    "Новый текст указывает одну длительность на всю запись, но в записи есть и объём работы, а обоим нужно одно и то же поле. Укажите время по каждому виду работ или исправьте запись на сайте.",
  "journal.correct.missingTitle":
    "Эту запись здесь исправить нельзя",
  "today.openMessages":
    "Сообщения",
  "messages.title":
    "Сообщения",
  "messages.conversation":
    "Разговор",
  "messages.intro":
    "Ваши разговоры внутри LabourMarket.ai. Сообщения остаются в приложении — ничего не отправляется по e-mail или SMS. Новые сообщения видны при открытии этого экрана.",
  "messages.none":
    "У вас пока нет разговоров.",
  "messages.untitled":
    "Разговор",
  "messages.threadEmpty":
    "В этом разговоре пока нет сообщений.",
  "messages.fromMe":
    "Вы",
  "messages.fromThem":
    "Собеседник",
  "messages.replyLabel":
    "Ваш ответ",
  "messages.review":
    "Проверить перед отправкой",
  "messages.emptyBody":
    "Сначала напишите сообщение.",
  "messages.previewTitle":
    "Проверьте перед отправкой",
  "messages.previewNothingSent":
    "Пока ничего не отправлено. Именно этот текст увидит собеседник.",
  "messages.send":
    "Отправить",
  "messages.sentTitle":
    "Отправлено",
  "messages.sentBody":
    "Ваше сообщение в разговоре.",
  "messages.sentUnverified":
    "Сервер принял сообщение, но при обратном чтении текст не совпал. Откройте разговор снова и проверьте.",
  "messages.writeAnother":
    "Написать ещё",
  "messages.draftFailedTitle":
    "Не удалось подготовить сообщение",
  "messages.sendFailedTitle":
    "Не удалось отправить сообщение",
  "messages.unsureSent":
    "Сообщение отправлено, но ответ не пришёл, поэтому неизвестно, дошло ли оно. Перед повторной отправкой откройте разговор снова.",
  "messages.staleDraft":
    "Не отправлено: пока вы готовили ответ, в разговоре появилось новое сообщение. Прочитайте его и проверьте ответ ещё раз.",
  "messages.notFound":
    "Этот разговор не ваш или больше не существует.",
  "messages.noPermission":
    "Вы не можете писать в этом разговоре.",
  "today.openNotifications":
    "Уведомления",
  "notifications.title":
    "Уведомления",
  "notifications.intro":
    "Что произошло в вашей работе, новые сверху. При открытии уведомление отмечается прочитанным. Уведомления не приходят на телефон — они видны здесь, когда вы открываете этот экран.",
  "notifications.none":
    "У вас нет уведомлений.",
  "notifications.unread":
    "Новое",
  "notifications.markAll":
    "Отметить все прочитанными",
  "notifications.markFailedTitle":
    "Не удалось отметить как прочитанное",
  "notifications.type.unknown":
    "Уведомление",
  "notifications.type.event_absence_approved":
    "Ваше отсутствие одобрено",
  "notifications.type.event_absence_rejected":
    "Ваше отсутствие отклонено",
  "notifications.type.event_absence_requested":
    "Для вас зарегистрировано отсутствие",
  "notifications.type.event_booking_accepted":
    "Ваше предложение бронирования принято",
  "notifications.type.event_booking_declined":
    "Ваше предложение бронирования отклонено",
  "notifications.type.event_booking_proposed":
    "Вы получили предложение бронирования",
  "notifications.type.event_booking_withdrawn":
    "Предложение о бронировании отозвано",
  "notifications.type.event_demand_interest_expressed":
    "Работник проявил интерес к вашей заявке",
  "notifications.type.event_demand_interest_reviewed":
    "Компания отметила ваш интерес как рассмотренный",
  "notifications.type.event_document_ack_assigned":
    "Вас попросили подтвердить, что вы прочитали документ.",
  "notifications.type.event_document_ack_completed":
    "Документ, отправленный вами на подтверждение, был подтверждён.",
  "notifications.type.event_document_expiring":
    "Срок действия документа скоро закончится.",
  "notifications.type.event_engagement_created":
    "Создано новое сотрудничество",
  "notifications.type.event_engagement_ended":
    "Рабочие отношения завершены",
  "notifications.type.event_history_link_offered":
    "Организация предложила связать зафиксированную историю вашей работы с вашим аккаунтом",
  "notifications.type.event_invitation_accepted":
    "Кто-то принял ваше приглашение",
  "notifications.type.event_job_alert":
    "Появилась новая работа, подходящая под ваш запрос",
  "notifications.type.event_journal_review_decided":
    "Запись в вашем журнале проверена",
  "notifications.type.event_journal_review_decided_approved":
    "Запись в вашем журнале подтверждена",
  "notifications.type.event_journal_review_decided_changes_requested":
    "По записи в вашем журнале запрошены изменения",
  "notifications.type.event_journal_review_decided_rejected":
    "Запись в вашем журнале отклонена",
  "notifications.type.event_message_received":
    "У вас новое сообщение",
  "notifications.type.event_saved_search_match":
    "В сохранённом поиске есть новые результаты",
  "notifications.type.event_weekly_digest":
    "Ваш еженедельный обзор работы и возможностей готов",
  "notifications.type.event_weekly_digest_journal":
    "Готов обзор вашего рабочего журнала за неделю",
  "notifications.type.event_weekly_digest_profile_completion":
    "Чтобы показать подходящие вакансии, подтвердите, какую работу вы выполняете",
  "notifications.type.event_work_task_assigned":
    "Вам назначена задача",
  "notifications.type.event_workflow_decided":
    "По вашему запросу на согласование принято решение",
  "notifications.type.event_workflow_delegated":
    "Вам передан этап согласования",
  "notifications.type.event_workflow_escalated":
    "Этап согласования превысил срок",
  "notifications.type.event_workflow_step_pending":
    "Запрос на согласование ждёт вашего решения",
  "today.openProjects":
    "Мои проекты",
  "projects.title":
    "Мои проекты",
  "projects.detailTitle":
    "Проект",
  "projects.none":
    "У вас нет назначенных проектов.",
  "projects.active":
    "Активный",
  "projects.ended":
    "Завершён",
  "projects.asksCount":
    "Ещё нужно от вас",
  "projects.moreOnWeb":
    "Здесь показаны только первые ваши проекты. На сайте видны все.",
  "projects.notFound":
    "Этот проект не ваш или его нет среди показанных здесь.",
  "projects.asksTitle":
    "Ещё нужно от вас",
  "projects.asksShownOf":
    "Показано здесь / всего открыто — полный список на сайте",
  "projects.asksUnavailable":
    "Сейчас не удалось прочитать, что ещё нужно от вас. Попробуйте ещё раз или откройте проект на сайте.",
  "projects.asksNotRead":
    "Это назначение завершено. Что по нему требовалось от вас, видно на странице проекта на сайте.",
  "projects.asksIncomplete":
    "В ваших проектах открыто больше, чем приложение может показать, поэтому часть этого проекта может быть не видна. Полный список — на странице проекта на сайте.",
  "projects.asksNone":
    "По этому проекту от вас ничего не требуется.",
  "projects.ask.needed":
    "Нужно",
  "projects.ask.missing":
    "Отсутствует",
  "projects.ask.rejected":
    "Отклонено — нужен новый",
  "projects.ask.expired":
    "Истёк срок",
  "projects.instructionTitle":
    "Последнее указание",
  "projects.answerInstruction":
    "Ответить в сообщениях",
  "projects.webDetail":
    "Полная страница проекта — этапы, документы и команда — на сайте.",
  "messages.threadNotShown":
    "Разговор ещё не показан. Дождитесь загрузки, прочитайте его, затем проверьте свой ответ.",
  "messages.newBeforeReview":
    "В этом разговоре пришло новое сообщение. Оно уже показано выше — прочитайте его и проверьте свой ответ ещё раз.",
  "profile.noWorkerProfile": "У этого аккаунта пока нет профиля работника.",
  "profile.figuresTitle": "Навыки с вашими записанными часами",
  "profile.groupManagerConfirmed": "Подтверждено руководителем",
  "profile.groupJournalBacked": "Подкреплено вашим дневником работы",
  "profile.groupDeclared": "Указано вами",
  "profile.figuresUnavailable":
    "Часы, долю и записи в этот раз прочитать не удалось. Навыки ниже по-прежнему ваши записанные навыки — ничего не показывается как 0.",
  "profile.figuresLegend":
    "Часы · доля от часов, отнесённых к навыкам · записи, за всё время. Те же цифры, что и на сайте.",
  "profile.figuresNotRead": "цифры прочитать не удалось",
  "profile.noFigures": "записанных часов нет",
  "profile.involvedUnattributed": "участвовал; время не отнесено только к этому навыку",
  "profile.hoursShort": "ч",
  "profile.entriesLabel": "зап.",
  "profile.selfStatedMissing":
    "Умения, которые вы записали своими словами, на этот экран пока не переносятся; сайт показывает их рядом с вашими навыками.",
  "profile.openJournal": "Открыть дневник работы",
  "journal.openProfile": "Что складывается из этих записей — в вашем профиле",

  "today.figuresTitle": "Ваша работа в цифрах",
  "today.periodToday": "Сегодня",
  "today.periodWeek": "Последние 7 дней",
  "today.hoursLabel": "Часы",
  "today.daysUnitLabel": "записано в днях",
  "today.entriesLabel": "Записи",
  "today.daysLabel": "Дни",
  "today.confirmedLabel": "Подтверждено руководителем, ч",
  "today.periodEmpty": "В этом окне ничего не записано.",
  "today.periodMissing": "Сервер не прислал цифру для этого окна.",
  "today.dominantTitle": "Наибольшая доля ваших часов за 7 дней",
  "today.dominantShare": "от часов, отнесённых к навыкам",
  "today.dominantNone":
    "За последние 7 дней ни одному навыку часы не отнесены.",
  "today.coverageTruncated":
    "Эти цифры опираются на последние прочитанные записи — более старые не включены.",
  "today.figuresScope":
    "Из ваших собственных записей дневника работы, по тому же правилу, что и на сайте. Календарные дни заканчиваются сегодня (UTC).",
  "today.openJournal": "Открыть дневник работы",
  "today.openProfile": "Открыть профиль и навыки",
  "today.openNeed": "Опубликовать потребность в людях",
  "need.title": "Опубликовать потребность",
  "need.intro": "Потребность в работниках для организации, от имени которой вы действуете. Вы проверяете её перед созданием; работники, которым она видна, находят её на своей доске.",
  "need.descriptionLabel": "Что нужно?",
  "need.descriptionHint": "Своими словами — какая работа, когда, сколько человек.",
  "need.roleLabel": "Роль",
  "need.locationLabel": "Место",
  "need.teamSizeLabel": "Сколько человек",
  "need.teamSizeHint": "Целое число",
  "need.urgencyLabel": "Насколько срочно",
  "need.urgency.flexible": "Гибко",
  "need.urgency.this_week": "На этой неделе",
  "need.urgency.urgent": "Срочно",
  "need.descriptionRequired": "Напишите хотя бы несколько слов о том, что нужно. Ничего не отправлено.",
  "need.teamSizeInvalid": "Число людей должно быть целым числом от 1. Ничего не отправлено.",
  "need.review": "Проверить перед созданием",
  "need.cancel": "Назад",
  "need.previewTitle": "Проверьте перед созданием",
  "need.previewBody": "Пока ничего не создано.",
  "need.actingFor": "Для",
  "need.confirm": "Создать потребность",
  "need.edit": "Изменить",
  "need.sentTitle": "Создано",
  "need.sentBody": "Потребность теперь открыта для организации. Следить за ней можно на сайте.",
  "need.done": "Назад к «Сегодня»",
  "need.overLimit": "Эта организация достигла лимита активных позиций своего плана. Ничего не создано — закройте потребность или измените план на сайте.",
  "need.draftFailedTitle": "Не удалось подготовить эту потребность",
  "need.sendFailedTitle": "Не удалось создать эту потребность",
  "today.openJobs": "Открытые вакансии",
  "jobs.title": "Вакансии",
  "jobs.intro": "Публичная доска вакансий — те же объявления, что и на сайте. Работодатель и способ отклика открываются на веб-странице от вашего имени.",
  "jobs.queryLabel": "Поиск",
  "jobs.queryHint": "Профессия или слово из названия, на любом языке",
  "jobs.search": "Искать вакансии",
  "jobs.total": "Вакансии",
  "jobs.page": "страница",
  "jobs.none": "Сейчас по этому запросу вакансий нет.",
  "jobs.prev": "Предыдущая страница",
  "jobs.next": "Следующая страница",
  "jobs.openWeb": "Открыть полное объявление",
  "jobs.positions": "Мест",
  "jobs.compensation": "Оплата",
  "jobs.published": "Опубликовано",
  "jobs.untitled": "Вакансия",
  "jobs.notProvisioned": "Доска вакансий в этой среде не включена.",
  "jobs.unavailable": "Доска вакансий не ответила вовремя. Это не значит, что вакансий нет — попробуйте ещё раз.",
  "jobs.linkedNotFound": "Этой вакансии больше нет на доске (возможно, закрыта).",
  "today.openOpportunities": "Открытые для вас потребности",
  "today.openAvailability": "Кто из вашей команды свободен",
  "opportunities.title": "Возможности",
  "opportunities.intro": "Потребности, которые видны вам сейчас. Интерес показывается владельцу потребности в его собственном представлении — за пределы платформы ничего не уходит.",
  "opportunities.noneVisible": "Сейчас вам не видна ни одна потребность. Когда связанная с вами организация откроет её, она появится здесь.",
  "opportunities.express": "Мне интересно",
  "opportunities.noteLabel": "Сообщение для них (необязательно)",
  "opportunities.noteHint": "Одно предложение о том, почему или когда — они читают его как написано.",
  "opportunities.draft": "Проверить перед отправкой",
  "opportunities.previewTitle": "Проверьте перед отправкой",
  "opportunities.previewBody": "Пока ничего не отправлено.",
  "opportunities.alreadyExpressed": "Вы уже выразили интерес к этой потребности; повторная отправка обновит его.",
  "today.openOffers": "Предложения и приглашения для вас",
  "offers.title": "Предложения",
  "offers.reviewNotice": "Если вы примете приглашение, руководитель {organization} сможет читать записанную вами для него работу и подписывать её. Пока он этого не сделал, это остаётся вашей собственной записью.",
  "offers.as": "В качестве",
  "offers.relationship.collaborator": "Соисполнитель",
  "offers.relationship.consultant": "Консультант",
  "offers.relationship.employee": "Сотрудник",
  "offers.relationship.freelancer": "Фрилансер",
  "offers.relationship.manager": "Руководитель",
  "offers.relationship.owner": "Владелец",
  "offers.relationship.student": "Студент",
  "offers.relationship.unemployed": "Безработный",
  "offers.relationship.volunteer": "Волонтёр",
  "offers.relationship.intern": "Стажёр",
  "offers.relationship.external_manager": "Внешний руководитель (заказчик)",
  "offers.relationship.other": "Другая связь",
  "offers.intro": "Предложения работы и приглашения, адресованные вам. Ничего не меняется, пока вы не подтвердите ответ.",
  "offers.bookingsHeading": "Предложения работы",
  "offers.invitationsHeading": "Приглашения",
  "offers.noBookings": "Нет предложений работы, ожидающих вашего ответа.",
  "offers.noInvitations": "Нет приглашений, ожидающих вашего ответа.",
  "offers.untitledBooking": "Предложение работы",
  "offers.untitledInvitation": "Приглашение",
  "offers.from": "От",
  "offers.dates": "Даты",
  "offers.answerBy": "Ответить до",
  "offers.accept": "Принять",
  "offers.decline": "Отклонить",
  "offers.previewAcceptBooking": "Принять это предложение работы?",
  "offers.previewDeclineBooking": "Отклонить это предложение работы?",
  "offers.previewAcceptInvitation": "Принять это приглашение?",
  "offers.previewBody": "Это настоящий ответ: другая сторона его увидит. Пока ничего не отправлено.",
  "offers.confirm": "Подтвердить ответ",
  "offers.cancel": "Назад",
  "offers.doneTitle": "Ваш ответ записан",
  "offers.doneBody": "Другая сторона уже его видит.",
  "offers.backToList": "Назад к предложениям",
  "offers.prepareFailedTitle": "Не удалось подготовить ответ",
  "offers.confirmFailedTitle": "Ваш ответ не записан",
  "offers.clash": "Эти даты пересекаются с уже принятой работой. Откройте предложение на сайте, посмотрите пересечение и решите там.",
  "offers.changed": "Это предложение изменилось или на него уже ответили. Вернитесь, чтобы увидеть актуальный список.",
  "opportunities.confirm": "Отправить",
  "opportunities.cancel": "Назад",
  "opportunities.sentTitle": "Отправлено",
  "opportunities.sentBody": "Владелец этой потребности теперь видит ваш интерес в своём представлении.",
  "opportunities.sentStatus": "Статус",
  "opportunities.another": "Назад к списку",
  "opportunities.notVisible": "Эта потребность вам больше не видна (возможно, закрыта).",
  "opportunities.draftFailedTitle": "Не удалось подготовить",
  "opportunities.sendFailedTitle": "Не удалось отправить",
  "availability.title": "Кто свободен",
  "availability.intro": "Ваша активная команда на ближайшие 7 дней. «Занят» не значит «недоступен»: пересечение — это предупреждение, а не отказ.",
  "availability.actingFor": "От имени",
  "availability.window": "Период",
  "availability.rosterTotal": "Участники команды",
  "availability.state.free": "свободен",
  "availability.state.committed": "занят",
  "availability.state.unavailable": "недоступен",
  "availability.notFreeUntil": "не свободен до",
  "availability.committedTo": "занят на",
  "availability.overridable": "уполномоченное лицо может решить иначе",
  "availability.sourcesPartial": "Ответили не все источники: не удалось прочитать отсутствия или обязательства, поэтому никто здесь не показан как точно свободный.",
  "availability.personalWorkspace": "Вы в личном пространстве. Переключитесь на пространство организации в настройках, чтобы видеть её команду.",
  "availability.noOrganization": "Эта учётная запись не принадлежит ни одной организации, поэтому команды нет.",
  "availability.noRoster": "В этой организации нет активных участников команды, поэтому отчитываться не о ком.",
  "availability.noCompanyContext": "Это пространство не может выступать работодателем, поэтому команды нет.",
};

const nl: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Vandaag",
  "nav.journal": "Werkdagboek",
  "nav.profile": "Profiel",
  "nav.settings": "Instellingen",

  "auth.checking": "We controleren je sessie…",
  "auth.signIn.title": "Inloggen",
  "auth.signIn.email": "E-mailadres",
  "auth.signIn.password": "Wachtwoord",
  "auth.signIn.submit": "Inloggen",
  "auth.signIn.toRegister": "Account aanmaken",
  "auth.register.title": "Account aanmaken",
  "auth.register.submit": "Account aanmaken",
  "auth.register.toSignIn": "Ik heb al een account",
  "auth.signIn.forgot": "Wachtwoord vergeten?",
  "auth.register.legal":
    "Door een account aan te maken, ga je akkoord met de gebruiksvoorwaarden en het privacybeleid.",
  "auth.error.rejected": "Dit e-mailadres en wachtwoord komen niet overeen.",
  "auth.error.unreachable":
    "We konden de server niet bereiken, dus we weten niet of deze gegevens kloppen. Controleer je verbinding en probeer het opnieuw.",
  "auth.error.confirmationRequired":
    "Je account is aangemaakt. Bevestig de link in je e-mail en log daarna in.",
  "auth.error.notConfigured":
    "Deze versie heeft geen serverconfiguratie en kan daarom niemand inloggen.",
  "auth.signOut": "Uitloggen",

  "account.title": "Privacy en account",
  "account.body":
    "Deze links openen in je browser, op de website. Je gegevens opvragen of je account laten verwijderen doe je daar, onder Privacy.",
  "account.privacy": "Privacy, je gegevens en je account verwijderen",
  "account.terms": "Gebruiksvoorwaarden",
  "account.privacyPolicy": "Privacybeleid",
  "account.deletionInfo": "Hoe het verwijderen van een account werkt (inloggen niet nodig)",
  "account.support": "Contact met support (info@labourmarket.ai)",
  "account.external": "Browser",
  "account.openFailed": "De link kon op deze telefoon niet worden geopend. Er is niets gewijzigd.",

  "session.unavailable.title": "We konden je sessie niet controleren",
  "session.unavailable.body":
    "Dit betekent niet dat je bent uitgelogd — de beveiligde opslag van je telefoon gaf geen antwoord. Probeer het opnieuw.",
  "session.unavailable.retry": "Opnieuw proberen",

  "route.notFound.title": "Dat scherm bestaat niet in deze app",
  "route.notFound.body":
    "De link die je volgde leidt hier nergens heen. Misschien is hij voor de website bedoeld, of is hij verouderd. Er is niets verstuurd.",
  "route.notFound.action": "Terug naar de app",

  "crash.title": "De app liep vast",
  "crash.body":
    "Dit is een fout in de app zelf, niet iets wat jij deed, en er is niets verstuurd. Probeer het opnieuw — als het blijft gebeuren, sluit de app en open hem opnieuw.",

  "config.problem.title": "Deze versie is niet geconfigureerd",
  "config.problem.body":
    "De app kan niet starten totdat deze waarden zijn ingesteld. Er zijn geen gegevens verstuurd.",

  "workspace.title": "Handelt namens",
  "workspace.loading": "Je werkruimtes worden gelezen…",
  "workspace.active": "Actief",
  "workspace.switching": "Wisselen…",
  "workspace.failed.title": "We konden je werkruimtes niet lezen",
  "workspace.failed.body":
    "Dit is een mislukte leesactie, geen antwoord: het betekent niet dat je bij geen enkele organisatie hoort. Probeer het zo opnieuw.",
  "workspace.pointerUnavailable":
    "Dit is afgeleid uit waar je bij hoort, niet een keuze die voor jou is bewaard, en het kan hier nog niet gewijzigd worden.",
  "workspace.switchFailed": "De werkruimte is niet gewijzigd. Er is niets verplaatst.",
  "context.loading": "Je rollen worden gelezen…",
  "context.active": "Actief",
  "context.none": "Voor dit account is nog geen deelnamerol vastgelegd. Dat is wat we gelezen hebben — geen fout in de app.",
  "context.title": "Je werkt als",
  "context.unavailable.title": "We kunnen je contexten nog niet tonen",
  "context.unavailable.body":
    "De app kan je inloggen, maar kan nog niet lezen bij welke organisaties je hoort. Er ontbreekt niets in je account — deze client kan het alleen nog niet opvragen.",
  "context.mode.worker": "Mijzelf",
  "context.mode.company": "Bedrijf",
  "context.mode.agency": "Bureau",
  "context.mode.customer": "Opdrachtgever",

  "language.title": "Taal",
  "language.preview": "Voorlopige vertaling",

  "domain.loading": "We vragen het aan de server…",
  "domain.retry": "Opnieuw proberen",
  "domain.failedTitle": "Dit kon niet worden geladen",
  "domain.unavailable.notConnectedYet": "Nog niet verbonden",
  "domain.unavailable.signInAgain": "Log opnieuw in.",
  "domain.unavailable.offline": "Geen verbinding. Er is niets verstuurd.",
  "domain.unavailable.unexpectedAnswer":
    "De server gaf een antwoord dat deze app niet begreep.",
  "domain.refused.no_credentials": "Log opnieuw in.",
  "domain.refused.invalid_token": "Je sessie is verlopen. Log opnieuw in.",
  "domain.refused.no_profile": "Dit account heeft nog geen profiel.",
  "domain.refused.not_authorized":
    "De server weigerde dit verzoek voor dit account.",
  "domain.refused.rate_limited":
    "De server vroeg deze app om te vertragen. Probeer het zo opnieuw.",
  "domain.refused.capability": "De server weigerde dit verzoek.",
  "domain.refused.identity_unavailable":
    "We konden niet bevestigen wie je bent. Dit is geen weigering — probeer het opnieuw.",

  "today.signedInAs": "Ingelogd als",
  "today.recentWork": "Recent werk",
  "journal.empty": "Nog geen werkdagboek-items vastgelegd.",
  "journal.logWork": "Werk vastleggen",
  "journal.compose.title": "Werk vastleggen",
  "journal.compose.intro":
    "Schrijf in je eigen woorden op wat je hebt gedaan. Je werkdagboek legt precies dat vast.",
  "journal.compose.date": "Datum van het werk",
  "journal.compose.dateHint": "Jaar-maand-dag, bijvoorbeeld 2026-09-01",
  "journal.compose.today": "Vandaag",
  "journal.compose.yesterday": "Gisteren",
  "journal.compose.notes": "Wat je hebt gedaan",
  "journal.compose.notesHint":
    "In je eigen woorden. Tijden en plaatsen horen hier ook.",
  "journal.compose.site": "Locatie of plek (optioneel)",
  "journal.compose.context": "Werkcontext",
  "journal.compose.contextUnnamed": "Niet benoemd",
  "journal.compose.review": "Controleren voor het opslaan",
  "journal.compose.previewTitle": "Controleer dit voordat het wordt opgeslagen",
  "journal.compose.previewNothingSaved":
    "Er is nog niets opgeslagen. Dit is precies wat wordt vastgelegd.",
  "journal.compose.save": "Opslaan in mijn werkdagboek",
  "journal.compose.edit": "Iets wijzigen",
  "journal.compose.chooseContext": "Bij welk werk hoort dit?",
  "journal.compose.chooseContextBody":
    "Dit item kan bij meer dan één van je werkcontexten horen, dus er is niets voorbereid en niets opgeslagen. Kies er één.",
  "journal.compose.savedTitle": "Opgeslagen in je werkdagboek",
  "journal.compose.savedBody":
    "Dit is nu een vastgelegd item. Dit is wat de server heeft opgeslagen.",
  "journal.compose.another": "Nog een vastleggen",
  "journal.compose.backToJournal": "Terug naar het dagboek",
  "journal.compose.checkThis": "Controleer dit eerst",
  "journal.compose.invalidDate":
    "Schrijf de datum als jaar-maand-dag, bijvoorbeeld 2026-09-01. Er is niets verstuurd.",
  "journal.compose.futureDate":
    "De werkdatum kan niet in de toekomst liggen — een journaalpost legt werk vast dat al is gebeurd. Er is niets verstuurd.",
  "journal.compose.notesRequired":
    "Schrijf op wat je hebt gedaan voordat je opslaat. Er is niets verstuurd.",
  "journal.compose.draftFailedTitle": "We konden dit item niet voorbereiden",
  "journal.compose.saveFailedTitle": "We konden dit item niet opslaan",
  "journal.compose.staleDraft":
    "Niet opgeslagen: je dagboek is veranderd nadat dit was voorbereid, dus de controle is verouderd. Controleer het opnieuw.",
  "journal.compose.noContext":
    "Dit account heeft geen actieve werkcontext, dus een item kan nergens worden vastgelegd. Geef eerst op de website aan waar je werkt en leg hier daarna werk vast.",
  "journal.compose.unsureSaved":
    "De verbinding viel weg nadat dit was verstuurd, dus we weten niet of het is aangekomen. Open je werkdagboek om te controleren voordat je het opnieuw schrijft. Opnieuw proberen kan geen dubbel item maken.",
  "journal.compose.skillsAdded": "Nieuw vastgelegde vaardigheden",
  "journal.compose.skillsStrengthened": "Vaardigheden met nieuw bewijs",
  "journal.compose.skillsClaims": "Capaciteiten opgemerkt uit je woorden",
  "journal.compose.skillsReview": "Wacht op jouw beoordeling",
  "journal.compose.noCvChange":
    "Uit dit item is niets nieuws aan je Living CV toegevoegd.",
  "journal.compose.skillsPartial":
    "Een deel van de Living CV-update is niet afgerond. Het item zelf is opgeslagen.",
  "journal.compose.skillsFailed":
    "De Living CV-update is deze keer niet uitgevoerd. Het item zelf is opgeslagen.",
  "journal.compose.reviewOnWeb":
    "Wat op beoordeling wacht, bevestig je op de website.",
  "profile.skillsEmpty": "Nog geen vaardigheden vastgelegd.",
  "journal.correct.action":
    "Deze invoer corrigeren",
  "journal.correct.title":
    "Invoer corrigeren",
  "journal.correct.intro":
    "Wijzig wat niet klopt: de tekst, de dag of de locatie. De vorige versie blijft in je geschiedenis; je totalen tellen de gecorrigeerde.",
  "journal.correct.nothingChanged":
    "Er is nog niets gewijzigd. Pas eerst de tekst, de dag of de locatie aan.",
  "journal.correct.previewTitle":
    "Controleer de correctie voordat die wordt opgeslagen",
  "journal.correct.before":
    "Nu",
  "journal.correct.after":
    "Na de correctie",
  "journal.correct.hours":
    "Uren",
  "journal.correct.output":
    "Productie",
  "journal.correct.wasConfirmed":
    "Een leidinggevende heeft deze invoer bevestigd. Die bevestiging blijft bij de vorige versie; de gecorrigeerde versie wordt opgeslagen als nog niet bevestigd.",
  "journal.correct.save":
    "Correctie opslaan",
  "journal.correct.savedTitle":
    "Correctie opgeslagen",
  "journal.correct.savedBody":
    "Je logboek en je totalen tonen nu de gecorrigeerde versie.",
  "journal.correct.savedConfirmedBody":
    "De gecorrigeerde versie is opgeslagen en wacht op bevestiging door een leidinggevende; de eerder bevestigde versie blijft in je geschiedenis.",
  "journal.correct.draftFailedTitle":
    "We konden deze correctie niet voorbereiden",
  "journal.correct.saveFailedTitle":
    "We konden deze correctie niet opslaan",
  "journal.correct.unsureSaved":
    "De correctie is verstuurd maar er kwam geen antwoord, dus we weten niet of ze is opgeslagen. Opnieuw proberen is veilig: een correctie die al is opgeslagen wordt geweigerd, nooit dubbel opgeslagen.",
  "journal.correct.staleDraft":
    "Niet opgeslagen: je logboek is gewijzigd nadat de correctie was voorbereid. Bekijk het opnieuw.",
  "journal.correct.superseded":
    "Deze invoer is al gecorrigeerd of verwijderd. Open het logboek opnieuw en corrigeer de huidige versie.",
  "journal.correct.notFound":
    "Deze invoer staat niet bij je laatste logboekinvoer. Misschien is ze al gecorrigeerd.",
  "journal.correct.conflict":
    "De nieuwe tekst noemt één duur voor de hele invoer, maar de invoer bevat ook een productie, en beide hebben hetzelfde veld nodig. Geef de tijd per activiteit op, of corrigeer deze invoer op de website.",
  "journal.correct.missingTitle":
    "Deze invoer kan hier niet worden gecorrigeerd",
  "today.openMessages":
    "Berichten",
  "messages.title":
    "Berichten",
  "messages.conversation":
    "Gesprek",
  "messages.intro":
    "Je gesprekken binnen LabourMarket.ai. Berichten blijven in de app — er wordt niets per e-mail of sms verstuurd. Nieuwe berichten zie je als je dit scherm opent.",
  "messages.none":
    "Je hebt nog geen gesprekken.",
  "messages.untitled":
    "Gesprek",
  "messages.threadEmpty":
    "Nog geen berichten in dit gesprek.",
  "messages.fromMe":
    "Jij",
  "messages.fromThem":
    "De ander",
  "messages.replyLabel":
    "Je antwoord",
  "messages.review":
    "Bekijken voor verzenden",
  "messages.emptyBody":
    "Schrijf eerst een bericht.",
  "messages.previewTitle":
    "Controleer dit voordat het wordt verstuurd",
  "messages.previewNothingSent":
    "Er is nog niets verstuurd. Dit is precies de tekst die de ander ziet.",
  "messages.send":
    "Versturen",
  "messages.sentTitle":
    "Verstuurd",
  "messages.sentBody":
    "Je bericht staat in het gesprek.",
  "messages.sentUnverified":
    "De server heeft je bericht aangenomen, maar bij het teruglezen kwam het niet overeen. Open het gesprek opnieuw om het te controleren.",
  "messages.writeAnother":
    "Nog een bericht schrijven",
  "messages.draftFailedTitle":
    "We konden dit bericht niet voorbereiden",
  "messages.sendFailedTitle":
    "We konden dit bericht niet versturen",
  "messages.unsureSent":
    "Het bericht is verstuurd maar er kwam geen antwoord, dus we weten niet of het is aangekomen. Open het gesprek opnieuw voordat je het nog eens verstuurt.",
  "messages.staleDraft":
    "Niet verstuurd: er kwam een nieuw bericht in dit gesprek nadat je het jouwe had voorbereid. Lees het en bekijk je antwoord opnieuw.",
  "messages.notFound":
    "Dit gesprek is niet van jou of bestaat niet meer.",
  "messages.noPermission":
    "Je mag niet in dit gesprek schrijven.",
  "today.openNotifications":
    "Meldingen",
  "notifications.title":
    "Meldingen",
  "notifications.intro":
    "Wat er in je werk is gebeurd, nieuwste eerst. Openen markeert een melding als gelezen. Meldingen worden niet naar je telefoon gepusht — ze staan hier wanneer je dit scherm opent.",
  "notifications.none":
    "Je hebt geen meldingen.",
  "notifications.unread":
    "Nieuw",
  "notifications.markAll":
    "Alles als gelezen markeren",
  "notifications.markFailedTitle":
    "We konden dit niet als gelezen markeren",
  "notifications.type.unknown":
    "Een melding",
  "notifications.type.event_absence_approved":
    "Je afwezigheid is goedgekeurd",
  "notifications.type.event_absence_rejected":
    "Je afwezigheid is afgewezen",
  "notifications.type.event_absence_requested":
    "Er is een afwezigheid voor je geregistreerd",
  "notifications.type.event_booking_accepted":
    "Je boekingsvoorstel is geaccepteerd",
  "notifications.type.event_booking_declined":
    "Je boekingsvoorstel is afgewezen",
  "notifications.type.event_booking_proposed":
    "Je hebt een boekingsvoorstel ontvangen",
  "notifications.type.event_booking_withdrawn":
    "Het boekingsvoorstel is ingetrokken",
  "notifications.type.event_demand_interest_expressed":
    "Een werknemer heeft interesse getoond in je aanvraag",
  "notifications.type.event_demand_interest_reviewed":
    "Een bedrijf heeft je interesse als bekeken gemarkeerd",
  "notifications.type.event_document_ack_assigned":
    "Je bent gevraagd te bevestigen dat je een document hebt gelezen.",
  "notifications.type.event_document_ack_completed":
    "Een document dat je ter bevestiging stuurde, is bevestigd.",
  "notifications.type.event_document_expiring":
    "De geldigheid van een document loopt binnenkort af.",
  "notifications.type.event_engagement_created":
    "Er is een nieuwe samenwerking aangemaakt",
  "notifications.type.event_engagement_ended":
    "De samenwerking is beëindigd",
  "notifications.type.event_history_link_offered":
    "Een organisatie biedt aan je geregistreerde werkgeschiedenis aan je account te koppelen",
  "notifications.type.event_invitation_accepted":
    "Iemand heeft je uitnodiging aangenomen",
  "notifications.type.event_job_alert":
    "Er is een nieuwe baan die bij je zoekopdracht past",
  "notifications.type.event_journal_review_decided":
    "Je journaalitem is beoordeeld",
  "notifications.type.event_journal_review_decided_approved":
    "Je journaalitem is bevestigd",
  "notifications.type.event_journal_review_decided_changes_requested":
    "Er zijn wijzigingen gevraagd voor je journaalitem",
  "notifications.type.event_journal_review_decided_rejected":
    "Je journaalitem is afgewezen",
  "notifications.type.event_message_received":
    "Je hebt een nieuw bericht",
  "notifications.type.event_saved_search_match":
    "Een opgeslagen zoekopdracht heeft nieuwe resultaten",
  "notifications.type.event_weekly_digest":
    "Je wekelijkse samenvatting van werk en kansen staat klaar",
  "notifications.type.event_weekly_digest_journal":
    "Het weekoverzicht van je werkjournaal is klaar",
  "notifications.type.event_weekly_digest_profile_completion":
    "Om je passende banen te tonen, bevestig welk werk je doet",
  "notifications.type.event_work_task_assigned":
    "Er is een taak aan je toegewezen",
  "notifications.type.event_workflow_decided":
    "Over je goedkeuringsverzoek is beslist",
  "notifications.type.event_workflow_delegated":
    "Een goedkeuringsronde is aan jou overgedragen",
  "notifications.type.event_workflow_escalated":
    "Een goedkeuringsronde heeft haar termijn overschreden",
  "notifications.type.event_workflow_step_pending":
    "Een goedkeuringsverzoek wacht op je beslissing",
  "today.openProjects":
    "Mijn projecten",
  "projects.title":
    "Mijn projecten",
  "projects.detailTitle":
    "Project",
  "projects.none":
    "Je bent aan geen enkel project toegewezen.",
  "projects.active":
    "Actief",
  "projects.ended":
    "Beëindigd",
  "projects.asksCount":
    "Nog nodig van jou",
  "projects.moreOnWeb":
    "Hier staan alleen je eerste projecten. De website toont ze allemaal.",
  "projects.notFound":
    "Dit project is niet van jou, of het staat niet bij de projecten die hier worden getoond.",
  "projects.asksTitle":
    "Nog nodig van jou",
  "projects.asksShownOf":
    "Hier getoond / in totaal nog open — de volledige lijst staat op de website",
  "projects.asksUnavailable":
    "Wat er nog van je nodig is, kon nu niet worden gelezen. Probeer het opnieuw of open het project op de website.",
  "projects.asksNotRead":
    "Deze toewijzing is beëindigd. Wat er daarbij van je werd gevraagd, staat op de projectpagina op de website.",
  "projects.asksIncomplete":
    "Er staat in je projecten meer open dan de app kan tonen, dus het deel van dit project wordt mogelijk niet getoond. De projectpagina op de website heeft de volledige lijst.",
  "projects.asksNone":
    "Voor jou staat er op dit project niets open.",
  "projects.ask.needed":
    "Nodig",
  "projects.ask.missing":
    "Ontbreekt",
  "projects.ask.rejected":
    "Afgewezen — er is een nieuwe nodig",
  "projects.ask.expired":
    "Verlopen",
  "projects.instructionTitle":
    "Laatste instructie",
  "projects.answerInstruction":
    "Antwoorden in Berichten",
  "projects.webDetail":
    "De volledige projectpagina — fasen, documenten en het team — staat op de website.",
  "messages.threadNotShown":
    "Het gesprek staat nog niet op het scherm. Wacht tot het geladen is, lees het en bekijk dan je antwoord.",
  "messages.newBeforeReview":
    "Er is een nieuw bericht in dit gesprek binnengekomen. Het staat nu hierboven — lees het en bekijk je antwoord opnieuw.",
  "profile.noWorkerProfile": "Dit account heeft nog geen werkersprofiel.",
  "profile.figuresTitle": "Vaardigheden, met je vastgelegde uren",
  "profile.groupManagerConfirmed": "Bevestigd door een leidinggevende",
  "profile.groupJournalBacked": "Onderbouwd door je werkdagboek",
  "profile.groupDeclared": "Door jou opgegeven",
  "profile.figuresUnavailable":
    "Uren, aandeel en items konden deze keer niet worden gelezen. De vaardigheden hieronder zijn nog steeds je vastgelegde vaardigheden — niets wordt als 0 getoond.",
  "profile.figuresLegend":
    "Uren · aandeel van de aan een vaardigheid toegekende uren · items, alle tijd. Dezelfde cijfers als op de website.",
  "profile.figuresNotRead": "cijfers konden niet worden gelezen",
  "profile.noFigures": "geen vastgelegde uren",
  "profile.involvedUnattributed": "betrokken; tijd niet alleen aan deze vaardigheid toegeschreven",
  "profile.hoursShort": "u",
  "profile.entriesLabel": "items",
  "profile.selfStatedMissing":
    "Vaardigheden die je in je eigen woorden noteerde, komen nog niet op dit scherm; de website toont ze bij je vaardigheden.",
  "profile.openJournal": "Werkdagboek openen",
  "journal.openProfile": "Wat deze items samen opleveren — op je profiel",

  "today.figuresTitle": "Je werk in cijfers",
  "today.periodToday": "Vandaag",
  "today.periodWeek": "Laatste 7 dagen",
  "today.hoursLabel": "Uren",
  "today.daysUnitLabel": "vastgelegd in dagen",
  "today.entriesLabel": "Items",
  "today.daysLabel": "Dagen",
  "today.confirmedLabel": "Bevestigd door een leidinggevende, u",
  "today.periodEmpty": "Niets vastgelegd in dit venster.",
  "today.periodMissing": "De server stuurde geen cijfer voor dit venster.",
  "today.dominantTitle": "Grootste aandeel van je uren, laatste 7 dagen",
  "today.dominantShare": "van de aan een vaardigheid toegekende uren",
  "today.dominantNone":
    "In de laatste 7 dagen zijn geen uren aan één vaardigheid toegekend.",
  "today.coverageTruncated":
    "Deze cijfers berusten op de laatst gelezen items — oudere items zijn niet meegenomen.",
  "today.figuresScope":
    "Uit je eigen werkdagboek-items, volgens dezelfde regel als de website. Kalenderdagen eindigen vandaag (UTC).",
  "today.openJournal": "Werkdagboek openen",
  "today.openProfile": "Profiel en vaardigheden openen",
  "today.openNeed": "Een behoefte aan mensen plaatsen",
  "need.title": "Behoefte plaatsen",
  "need.intro": "Een behoefte aan werkkrachten voor de organisatie namens welke je handelt. Je controleert die voordat hij wordt aangemaakt; werkers die hem mogen zien, vinden hem op hun bord.",
  "need.descriptionLabel": "Wat heb je nodig?",
  "need.descriptionHint": "In je eigen woorden — het werk, wanneer, hoeveel mensen.",
  "need.roleLabel": "Rol",
  "need.locationLabel": "Plaats",
  "need.teamSizeLabel": "Hoeveel mensen",
  "need.teamSizeHint": "Een heel getal",
  "need.urgencyLabel": "Hoe dringend",
  "need.urgency.flexible": "Flexibel",
  "need.urgency.this_week": "Deze week",
  "need.urgency.urgent": "Dringend",
  "need.descriptionRequired": "Schrijf minstens een paar woorden over wat je nodig hebt. Er is niets verstuurd.",
  "need.teamSizeInvalid": "Het aantal mensen moet een heel getal vanaf 1 zijn. Er is niets verstuurd.",
  "need.review": "Controleren voor aanmaken",
  "need.cancel": "Terug",
  "need.previewTitle": "Controleer voordat je het aanmaakt",
  "need.previewBody": "Er is nog niets aangemaakt.",
  "need.actingFor": "Voor",
  "need.confirm": "Behoefte aanmaken",
  "need.edit": "Bewerken",
  "need.sentTitle": "Aangemaakt",
  "need.sentBody": "De behoefte staat nu open voor de organisatie. Je kunt hem volgen op de website.",
  "need.done": "Terug naar Vandaag",
  "need.overLimit": "Deze organisatie heeft de limiet van actieve posities van haar plan bereikt. Er is niets aangemaakt — sluit een behoefte of wijzig het plan op de website.",
  "need.draftFailedTitle": "We konden deze behoefte niet voorbereiden",
  "need.sendFailedTitle": "We konden deze behoefte niet aanmaken",
  "today.openJobs": "Open vacatures bekijken",
  "jobs.title": "Vacatures",
  "jobs.intro": "Het openbare vacaturebord — dezelfde vacatures als op de website. De werkgever en hoe je reageert openen op de webpagina als jijzelf.",
  "jobs.queryLabel": "Zoeken",
  "jobs.queryHint": "Een beroep of een woord uit de titel, in elke taal",
  "jobs.search": "Vacatures zoeken",
  "jobs.total": "Vacatures",
  "jobs.page": "pagina",
  "jobs.none": "Er zijn nu geen vacatures die bij deze zoekopdracht passen.",
  "jobs.prev": "Vorige pagina",
  "jobs.next": "Volgende pagina",
  "jobs.openWeb": "Volledige vacature openen",
  "jobs.positions": "Plaatsen",
  "jobs.compensation": "Loon",
  "jobs.published": "Gepubliceerd",
  "jobs.untitled": "Vacature",
  "jobs.notProvisioned": "Het vacaturebord is in deze omgeving niet ingeschakeld.",
  "jobs.unavailable": "Het vacaturebord antwoordde niet op tijd. Dat is niet hetzelfde als geen vacatures — probeer het opnieuw.",
  "jobs.linkedNotFound": "Die vacature staat niet meer op het bord (mogelijk gesloten).",
  "today.openOpportunities": "Behoeften die voor je openstaan",
  "today.openAvailability": "Wie van je team is vrij",
  "opportunities.title": "Kansen",
  "opportunities.intro": "Behoeften die je nu kunt zien. Interesse tonen laat het de eigenaar van de behoefte in zijn eigen weergave zien — er verlaat niets het platform.",
  "opportunities.noneVisible": "Er is nu geen behoefte voor je zichtbaar. Zodra een organisatie waarmee je verbonden bent er een opent, verschijnt die hier.",
  "opportunities.express": "Ik heb interesse",
  "opportunities.noteLabel": "Een bericht voor hen (optioneel)",
  "opportunities.noteHint": "Eén zin over waarom of wanneer — zij lezen het zoals geschreven.",
  "opportunities.draft": "Controleren voor verzenden",
  "opportunities.previewTitle": "Controleer voor je verzendt",
  "opportunities.previewBody": "Er is nog niets verzonden.",
  "opportunities.alreadyExpressed": "Je hebt al interesse getoond in deze behoefte; opnieuw verzenden vernieuwt die.",
  "today.openOffers": "Aanbiedingen en uitnodigingen voor jou",
  "offers.title": "Aanbiedingen",
  "offers.reviewNotice": "Als je accepteert, kan een leidinggevende van {organization} het werk lezen dat je voor hen vastlegt en het aftekenen. Tot die tijd blijft het je eigen vermelding.",
  "offers.as": "Als",
  "offers.relationship.collaborator": "Samenwerkingspartner",
  "offers.relationship.consultant": "Consultant",
  "offers.relationship.employee": "Werknemer",
  "offers.relationship.freelancer": "Freelancer",
  "offers.relationship.manager": "Manager",
  "offers.relationship.owner": "Eigenaar",
  "offers.relationship.student": "Student",
  "offers.relationship.unemployed": "Werkzoekend",
  "offers.relationship.volunteer": "Vrijwilliger",
  "offers.relationship.intern": "Stagiair",
  "offers.relationship.external_manager": "Externe manager (opdrachtgever)",
  "offers.relationship.other": "Andere relatie",
  "offers.intro": "Werkvoorstellen en uitnodigingen die aan jou gericht zijn. Er verandert niets totdat je je antwoord bevestigt.",
  "offers.bookingsHeading": "Werkvoorstellen",
  "offers.invitationsHeading": "Uitnodigingen",
  "offers.noBookings": "Er wachten geen werkvoorstellen op je antwoord.",
  "offers.noInvitations": "Er wachten geen uitnodigingen op je antwoord.",
  "offers.untitledBooking": "Werkvoorstel",
  "offers.untitledInvitation": "Uitnodiging",
  "offers.from": "Van",
  "offers.dates": "Data",
  "offers.answerBy": "Antwoorden vóór",
  "offers.accept": "Accepteren",
  "offers.decline": "Afwijzen",
  "offers.previewAcceptBooking": "Dit werkvoorstel accepteren?",
  "offers.previewDeclineBooking": "Dit werkvoorstel afwijzen?",
  "offers.previewAcceptInvitation": "Deze uitnodiging accepteren?",
  "offers.previewBody": "Dit is een echt antwoord: de andere kant ziet het. Er is nog niets verstuurd.",
  "offers.confirm": "Mijn antwoord bevestigen",
  "offers.cancel": "Terug",
  "offers.doneTitle": "Je antwoord is vastgelegd",
  "offers.doneBody": "De andere kant ziet het nu.",
  "offers.backToList": "Terug naar aanbiedingen",
  "offers.prepareFailedTitle": "Dit antwoord kon niet worden voorbereid",
  "offers.confirmFailedTitle": "Je antwoord is niet vastgelegd",
  "offers.clash": "Deze data overlappen met werk dat je al hebt geaccepteerd. Open het voorstel op de website om de overlap te zien en daar te beslissen.",
  "offers.changed": "Dit aanbod is gewijzigd of al beantwoord. Ga terug om de huidige lijst te zien.",
  "opportunities.confirm": "Verzenden",
  "opportunities.cancel": "Terug",
  "opportunities.sentTitle": "Verzonden",
  "opportunities.sentBody": "De eigenaar van deze behoefte ziet je interesse nu in zijn eigen weergave.",
  "opportunities.sentStatus": "Status",
  "opportunities.another": "Terug naar de lijst",
  "opportunities.notVisible": "Die behoefte is niet meer zichtbaar voor je (mogelijk gesloten).",
  "opportunities.draftFailedTitle": "We konden dit niet voorbereiden",
  "opportunities.sendFailedTitle": "We konden dit niet verzenden",
  "availability.title": "Wie is vrij",
  "availability.intro": "Je actieve team voor de komende 7 dagen. Toegezegd is niet onbeschikbaar: een overlap is een waarschuwing, geen weigering.",
  "availability.actingFor": "Namens",
  "availability.window": "Periode",
  "availability.rosterTotal": "Teamleden",
  "availability.state.free": "vrij",
  "availability.state.committed": "toegezegd",
  "availability.state.unavailable": "niet beschikbaar",
  "availability.notFreeUntil": "niet vrij tot",
  "availability.committedTo": "toegezegd aan",
  "availability.overridable": "een bevoegd persoon kan anders beslissen",
  "availability.sourcesPartial": "Niet elke bron antwoordde: afwezigheden of toezeggingen konden niet worden gelezen, dus niemand hier wordt met zekerheid als vrij gemeld.",
  "availability.personalWorkspace": "Je bent in je persoonlijke ruimte. Schakel in Instellingen over naar een organisatieruimte om het team te zien.",
  "availability.noOrganization": "Dit account hoort bij geen enkele organisatie, dus er is geen team om over te rapporteren.",
  "availability.noRoster": "Deze organisatie heeft geen actieve teamleden, dus er is niemand om over te rapporteren.",
  "availability.noCompanyContext": "Deze ruimte kan niet als werkgever optreden, dus er is geen team om over te rapporteren.",
};

const de: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Heute",
  "nav.journal": "Arbeitstagebuch",
  "nav.profile": "Profil",
  "nav.settings": "Einstellungen",

  "auth.checking": "Wir prüfen Ihre Sitzung…",
  "auth.signIn.title": "Anmelden",
  "auth.signIn.email": "E-Mail",
  "auth.signIn.password": "Passwort",
  "auth.signIn.submit": "Anmelden",
  "auth.signIn.toRegister": "Konto erstellen",
  "auth.register.title": "Konto erstellen",
  "auth.register.submit": "Konto erstellen",
  "auth.register.toSignIn": "Ich habe bereits ein Konto",
  "auth.signIn.forgot": "Passwort vergessen?",
  "auth.register.legal":
    "Mit dem Erstellen eines Kontos akzeptieren Sie die Nutzungsbedingungen und die Datenschutzerklärung.",
  "auth.error.rejected": "Diese E-Mail und dieses Passwort passen nicht zusammen.",
  "auth.error.unreachable":
    "Wir konnten den Server nicht erreichen und wissen daher nicht, ob die Angaben stimmen. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
  "auth.error.confirmationRequired":
    "Ihr Konto wurde erstellt. Bestätigen Sie den Link in Ihrer E-Mail und melden Sie sich dann an.",
  "auth.error.notConfigured":
    "Diese Version hat keine Serverkonfiguration und kann daher niemanden anmelden.",
  "auth.signOut": "Abmelden",

  "account.title": "Datenschutz und Konto",
  "account.body":
    "Diese Links öffnen sich in Ihrem Browser, auf der Website. Ihre Daten anfordern oder Ihr Konto löschen lassen können Sie dort unter „Datenschutz“.",
  "account.privacy": "Datenschutz, Ihre Daten und das Löschen Ihres Kontos",
  "account.terms": "Nutzungsbedingungen",
  "account.privacyPolicy": "Datenschutzerklärung",
  "account.deletionInfo": "So funktioniert die Kontolöschung (ohne Anmeldung)",
  "account.support": "Support kontaktieren (info@labourmarket.ai)",
  "account.external": "Browser",
  "account.openFailed": "Der Link konnte auf diesem Telefon nicht geöffnet werden. Es wurde nichts geändert.",

  "session.unavailable.title": "Wir konnten Ihre Sitzung nicht prüfen",
  "session.unavailable.body":
    "Das heißt nicht, dass Sie abgemeldet sind — der sichere Speicher Ihres Telefons hat nicht geantwortet. Versuchen Sie es erneut.",
  "session.unavailable.retry": "Erneut versuchen",

  "route.notFound.title": "Diesen Bildschirm gibt es in dieser App nicht",
  "route.notFound.body":
    "Der Link, dem Sie gefolgt sind, führt hier nirgendwohin. Vielleicht gehört er zur Website, vielleicht ist er veraltet. Es wurde nichts gesendet.",
  "route.notFound.action": "Zurück zur App",

  "crash.title": "Die App ist auf einen Fehler gestoßen",
  "crash.body":
    "Das ist ein Fehler in der App selbst und nicht Ihrer, und es wurde nichts gesendet. Versuchen Sie es erneut — wenn es weiter passiert, schließen Sie die App und öffnen Sie sie neu.",

  "config.problem.title": "Diese Version ist nicht konfiguriert",
  "config.problem.body":
    "Die App kann erst starten, wenn diese Werte gesetzt sind. Es wurden keine Daten gesendet.",

  "workspace.title": "Handelt für",
  "workspace.loading": "Ihre Arbeitsbereiche werden gelesen…",
  "workspace.active": "Aktiv",
  "workspace.switching": "Wird gewechselt…",
  "workspace.failed.title": "Wir konnten Ihre Arbeitsbereiche nicht lesen",
  "workspace.failed.body":
    "Das ist ein fehlgeschlagener Lesevorgang, keine Antwort: Es bedeutet nicht, dass Sie zu keiner Organisation gehören. Versuchen Sie es gleich noch einmal.",
  "workspace.pointerUnavailable":
    "Das ist daraus abgeleitet, wo Sie dazugehören, und keine für Sie gespeicherte Wahl; ändern lässt es sich hier noch nicht.",
  "workspace.switchFailed": "Der Arbeitsbereich wurde nicht geändert. Es wurde nichts verschoben.",
  "context.loading": "Ihre Rollen werden gelesen…",
  "context.active": "Aktiv",
  "context.none": "Für dieses Konto ist noch keine Teilnahmerolle erfasst. Das haben wir gelesen — kein Fehler der App.",
  "context.title": "Sie arbeiten als",
  "context.unavailable.title": "Wir können Ihre Kontexte noch nicht anzeigen",
  "context.unavailable.body":
    "Die App kann Sie anmelden, aber noch nicht lesen, zu welchen Organisationen Sie gehören. In Ihrem Konto fehlt nichts — dieser Client kann nur noch nicht danach fragen.",
  "context.mode.worker": "Ich selbst",
  "context.mode.company": "Unternehmen",
  "context.mode.agency": "Agentur",
  "context.mode.customer": "Auftraggeber",

  "language.title": "Sprache",
  "language.preview": "Vorläufige Übersetzung",

  "domain.loading": "Wir fragen den Server…",
  "domain.retry": "Erneut versuchen",
  "domain.failedTitle": "Konnte nicht geladen werden",
  "domain.unavailable.notConnectedYet": "Noch nicht verbunden",
  "domain.unavailable.signInAgain": "Bitte melden Sie sich erneut an.",
  "domain.unavailable.offline": "Keine Verbindung. Es wurde nichts gesendet.",
  "domain.unavailable.unexpectedAnswer":
    "Der Server hat mit etwas geantwortet, das diese App nicht verstanden hat.",
  "domain.refused.no_credentials": "Bitte melden Sie sich erneut an.",
  "domain.refused.invalid_token":
    "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  "domain.refused.no_profile": "Dieses Konto hat noch kein Profil.",
  "domain.refused.not_authorized":
    "Der Server hat diese Anfrage für dieses Konto abgelehnt.",
  "domain.refused.rate_limited":
    "Der Server hat diese App gebeten, langsamer zu machen. Versuchen Sie es gleich erneut.",
  "domain.refused.capability": "Der Server hat diese Anfrage abgelehnt.",
  "domain.refused.identity_unavailable":
    "Wir konnten nicht bestätigen, wer Sie sind. Das ist keine Ablehnung — versuchen Sie es erneut.",

  "today.signedInAs": "Angemeldet als",
  "today.recentWork": "Aktuelle Arbeit",
  "journal.empty": "Noch keine Einträge im Arbeitstagebuch.",
  "journal.logWork": "Arbeit erfassen",
  "journal.compose.title": "Arbeit erfassen",
  "journal.compose.intro":
    "Schreiben Sie in Ihren eigenen Worten, was Sie getan haben. Ihr Arbeitstagebuch hält genau das fest.",
  "journal.compose.date": "Datum der Arbeit",
  "journal.compose.dateHint": "Jahr-Monat-Tag, zum Beispiel 2026-09-01",
  "journal.compose.today": "Heute",
  "journal.compose.yesterday": "Gestern",
  "journal.compose.notes": "Was Sie getan haben",
  "journal.compose.notesHint":
    "In Ihren eigenen Worten. Zeiten und Orte gehören ebenfalls hierher.",
  "journal.compose.site": "Baustelle oder Ort (optional)",
  "journal.compose.context": "Arbeitskontext",
  "journal.compose.contextUnnamed": "Nicht benannt",
  "journal.compose.review": "Vor dem Speichern prüfen",
  "journal.compose.previewTitle": "Prüfen Sie das, bevor es gespeichert wird",
  "journal.compose.previewNothingSaved":
    "Es wurde noch nichts gespeichert. Genau das wird erfasst.",
  "journal.compose.save": "In mein Arbeitstagebuch speichern",
  "journal.compose.edit": "Etwas ändern",
  "journal.compose.chooseContext": "Zu welcher Arbeit gehört das?",
  "journal.compose.chooseContextBody":
    "Dieser Eintrag könnte zu mehr als einem Ihrer Arbeitskontexte gehören, deshalb wurde nichts vorbereitet und nichts gespeichert. Wählen Sie einen aus.",
  "journal.compose.savedTitle": "In Ihrem Arbeitstagebuch gespeichert",
  "journal.compose.savedBody":
    "Das ist jetzt ein erfasster Eintrag. Genau das hat der Server gespeichert.",
  "journal.compose.another": "Noch einen erfassen",
  "journal.compose.backToJournal": "Zurück zum Tagebuch",
  "journal.compose.checkThis": "Bitte zuerst prüfen",
  "journal.compose.invalidDate":
    "Schreiben Sie das Datum als Jahr-Monat-Tag, zum Beispiel 2026-09-01. Es wurde nichts gesendet.",
  "journal.compose.futureDate":
    "Das Arbeitsdatum kann nicht in der Zukunft liegen — ein Journaleintrag hält bereits geleistete Arbeit fest. Es wurde nichts gesendet.",
  "journal.compose.notesRequired":
    "Schreiben Sie vor dem Speichern, was Sie getan haben. Es wurde nichts gesendet.",
  "journal.compose.draftFailedTitle":
    "Wir konnten diesen Eintrag nicht vorbereiten",
  "journal.compose.saveFailedTitle":
    "Wir konnten diesen Eintrag nicht speichern",
  "journal.compose.staleDraft":
    "Nicht gespeichert: Ihr Tagebuch hat sich geändert, nachdem dies vorbereitet wurde, deshalb ist die Prüfung veraltet. Prüfen Sie es erneut.",
  "journal.compose.noContext":
    "Dieses Konto hat keinen aktiven Arbeitskontext, deshalb hat ein Eintrag keinen Ort. Geben Sie zuerst auf der Website an, wo Sie arbeiten, und erfassen Sie Arbeit dann hier.",
  "journal.compose.unsureSaved":
    "Die Verbindung brach ab, nachdem dies gesendet wurde, deshalb wissen wir nicht, ob es angekommen ist. Öffnen Sie Ihr Arbeitstagebuch und prüfen Sie es, bevor Sie es erneut schreiben. Ein erneuter Versuch kann keinen doppelten Eintrag erzeugen.",
  "journal.compose.skillsAdded": "Neu erfasste Fähigkeiten",
  "journal.compose.skillsStrengthened": "Fähigkeiten mit neuem Nachweis",
  "journal.compose.skillsClaims": "Aus Ihren Worten notierte Fähigkeiten",
  "journal.compose.skillsReview": "Wartet auf Ihre Prüfung",
  "journal.compose.noCvChange":
    "Aus diesem Eintrag wurde Ihrem Living CV nichts Neues hinzugefügt.",
  "journal.compose.skillsPartial":
    "Ein Teil der Living-CV-Aktualisierung wurde nicht abgeschlossen. Der Eintrag selbst ist gespeichert.",
  "journal.compose.skillsFailed":
    "Die Living-CV-Aktualisierung lief diesmal nicht. Der Eintrag selbst ist gespeichert.",
  "journal.compose.reviewOnWeb":
    "Was auf Prüfung wartet, wird auf der Website bestätigt.",
  "profile.skillsEmpty": "Noch keine Fähigkeiten erfasst.",
  "journal.correct.action":
    "Diesen Eintrag korrigieren",
  "journal.correct.title":
    "Eintrag korrigieren",
  "journal.correct.intro":
    "Ändern Sie, was nicht stimmt – den Text, den Tag oder den Ort. Die vorige Fassung bleibt in Ihrem Verlauf; Ihre Summen zählen die korrigierte.",
  "journal.correct.nothingChanged":
    "Noch nichts geändert. Bearbeiten Sie zuerst den Text, den Tag oder den Ort.",
  "journal.correct.previewTitle":
    "Korrektur vor dem Speichern prüfen",
  "journal.correct.before":
    "Jetzt",
  "journal.correct.after":
    "Nach der Korrektur",
  "journal.correct.hours":
    "Stunden",
  "journal.correct.output":
    "Leistung",
  "journal.correct.wasConfirmed":
    "Eine Führungskraft hat diesen Eintrag bestätigt. Die Bestätigung bleibt bei der vorigen Fassung; die korrigierte Fassung wird als noch nicht bestätigt gespeichert.",
  "journal.correct.save":
    "Korrektur speichern",
  "journal.correct.savedTitle":
    "Korrektur gespeichert",
  "journal.correct.savedBody":
    "Ihr Arbeitsjournal und Ihre Summen zeigen jetzt die korrigierte Fassung.",
  "journal.correct.savedConfirmedBody":
    "Die korrigierte Fassung ist gespeichert und wartet auf die Bestätigung einer Führungskraft; die zuvor bestätigte Fassung bleibt in Ihrem Verlauf.",
  "journal.correct.draftFailedTitle":
    "Diese Korrektur konnte nicht vorbereitet werden",
  "journal.correct.saveFailedTitle":
    "Diese Korrektur konnte nicht gespeichert werden",
  "journal.correct.unsureSaved":
    "Die Korrektur wurde gesendet, aber es kam keine Antwort, daher wissen wir nicht, ob sie gespeichert wurde. Ein erneuter Versuch ist sicher: Eine bereits gespeicherte Korrektur wird abgelehnt, nie doppelt gespeichert.",
  "journal.correct.staleDraft":
    "Nicht gespeichert: Ihr Journal hat sich geändert, nachdem die Korrektur vorbereitet wurde. Bitte erneut prüfen.",
  "journal.correct.superseded":
    "Dieser Eintrag wurde bereits korrigiert oder entfernt. Öffnen Sie das Journal erneut und korrigieren Sie die aktuelle Fassung.",
  "journal.correct.notFound":
    "Dieser Eintrag ist nicht unter Ihren neuesten Journaleinträgen. Vielleicht wurde er bereits korrigiert.",
  "journal.correct.conflict":
    "Der neue Text nennt eine Dauer für den ganzen Eintrag, der Eintrag enthält aber auch eine Leistungsmenge, und beide brauchen dasselbe Feld. Geben Sie die Zeit je Tätigkeit an oder korrigieren Sie den Eintrag auf der Website.",
  "journal.correct.missingTitle":
    "Dieser Eintrag kann hier nicht korrigiert werden",
  "today.openMessages":
    "Nachrichten",
  "messages.title":
    "Nachrichten",
  "messages.conversation":
    "Unterhaltung",
  "messages.intro":
    "Ihre Unterhaltungen in LabourMarket.ai. Nachrichten bleiben in der App – nichts wird per E-Mail oder SMS versendet. Neue Nachrichten erscheinen, wenn Sie diese Seite öffnen.",
  "messages.none":
    "Sie haben noch keine Unterhaltungen.",
  "messages.untitled":
    "Unterhaltung",
  "messages.threadEmpty":
    "In dieser Unterhaltung gibt es noch keine Nachrichten.",
  "messages.fromMe":
    "Sie",
  "messages.fromThem":
    "Gegenüber",
  "messages.replyLabel":
    "Ihre Antwort",
  "messages.review":
    "Vor dem Senden prüfen",
  "messages.emptyBody":
    "Schreiben Sie zuerst eine Nachricht.",
  "messages.previewTitle":
    "Vor dem Senden prüfen",
  "messages.previewNothingSent":
    "Noch wurde nichts gesendet. Genau diesen Text sieht die andere Person.",
  "messages.send":
    "Senden",
  "messages.sentTitle":
    "Gesendet",
  "messages.sentBody":
    "Ihre Nachricht ist in der Unterhaltung.",
  "messages.sentUnverified":
    "Der Server hat Ihre Nachricht angenommen, aber beim Zurücklesen stimmte sie nicht überein. Öffnen Sie die Unterhaltung erneut, um sie zu prüfen.",
  "messages.writeAnother":
    "Weitere Nachricht schreiben",
  "messages.draftFailedTitle":
    "Diese Nachricht konnte nicht vorbereitet werden",
  "messages.sendFailedTitle":
    "Diese Nachricht konnte nicht gesendet werden",
  "messages.unsureSent":
    "Die Nachricht wurde gesendet, aber es kam keine Antwort, daher wissen wir nicht, ob sie angekommen ist. Öffnen Sie die Unterhaltung erneut, bevor Sie sie noch einmal senden.",
  "messages.staleDraft":
    "Nicht gesendet: Nachdem Sie Ihre Antwort vorbereitet haben, kam eine neue Nachricht in diese Unterhaltung. Lesen Sie sie und prüfen Sie Ihre Antwort erneut.",
  "messages.notFound":
    "Diese Unterhaltung gehört nicht Ihnen oder existiert nicht mehr.",
  "messages.noPermission":
    "Sie dürfen in dieser Unterhaltung nicht schreiben.",
  "today.openNotifications":
    "Benachrichtigungen",
  "notifications.title":
    "Benachrichtigungen",
  "notifications.intro":
    "Was in Ihrer Arbeit passiert ist, neueste zuerst. Beim Öffnen wird eine Benachrichtigung als gelesen markiert. Benachrichtigungen werden nicht auf Ihr Telefon gepusht – sie erscheinen hier, wenn Sie diese Seite öffnen.",
  "notifications.none":
    "Sie haben keine Benachrichtigungen.",
  "notifications.unread":
    "Neu",
  "notifications.markAll":
    "Alle als gelesen markieren",
  "notifications.markFailedTitle":
    "Konnte nicht als gelesen markiert werden",
  "notifications.type.unknown":
    "Eine Benachrichtigung",
  "notifications.type.event_absence_approved":
    "Ihre Abwesenheit wurde genehmigt",
  "notifications.type.event_absence_rejected":
    "Ihre Abwesenheit wurde abgelehnt",
  "notifications.type.event_absence_requested":
    "Für Sie wurde eine Abwesenheit eingetragen",
  "notifications.type.event_booking_accepted":
    "Ihr Buchungsvorschlag wurde angenommen",
  "notifications.type.event_booking_declined":
    "Ihr Buchungsvorschlag wurde abgelehnt",
  "notifications.type.event_booking_proposed":
    "Sie haben einen Buchungsvorschlag erhalten",
  "notifications.type.event_booking_withdrawn":
    "Der Buchungsvorschlag wurde zurückgezogen",
  "notifications.type.event_demand_interest_expressed":
    "Eine Arbeitskraft hat Interesse an Ihrem Bedarf bekundet",
  "notifications.type.event_demand_interest_reviewed":
    "Ein Unternehmen hat Ihr Interesse als geprüft markiert",
  "notifications.type.event_document_ack_assigned":
    "Sie wurden gebeten zu bestätigen, dass Sie ein Dokument gelesen haben.",
  "notifications.type.event_document_ack_completed":
    "Ein von Ihnen zur Bestätigung gesendetes Dokument wurde bestätigt.",
  "notifications.type.event_document_expiring":
    "Die Gültigkeit eines Dokuments endet bald.",
  "notifications.type.event_engagement_created":
    "Ein neues Engagement wurde erstellt",
  "notifications.type.event_engagement_ended":
    "Das Arbeitsverhältnis wurde beendet",
  "notifications.type.event_history_link_offered":
    "Eine Organisation bietet an, Ihre erfasste Arbeitshistorie mit Ihrem Konto zu verbinden",
  "notifications.type.event_invitation_accepted":
    "Jemand hat Ihre Einladung angenommen",
  "notifications.type.event_job_alert":
    "Eine neue Stelle passt zu Ihrer Suche",
  "notifications.type.event_journal_review_decided":
    "Ihr Journaleintrag wurde geprüft",
  "notifications.type.event_journal_review_decided_approved":
    "Ihr Journaleintrag wurde bestätigt",
  "notifications.type.event_journal_review_decided_changes_requested":
    "Für Ihren Journaleintrag wurden Änderungen angefordert",
  "notifications.type.event_journal_review_decided_rejected":
    "Ihr Journaleintrag wurde abgelehnt",
  "notifications.type.event_message_received":
    "Sie haben eine neue Nachricht",
  "notifications.type.event_saved_search_match":
    "Eine gespeicherte Suche hat neue Ergebnisse",
  "notifications.type.event_weekly_digest":
    "Ihre wöchentliche Übersicht zu Arbeit und Chancen ist bereit",
  "notifications.type.event_weekly_digest_journal":
    "Die Wochenübersicht Ihres Arbeitsjournals ist fertig",
  "notifications.type.event_weekly_digest_profile_completion":
    "Damit wir Ihnen passende Jobs zeigen können, bestätigen Sie, welche Arbeit Sie machen",
  "notifications.type.event_work_task_assigned":
    "Ihnen wurde eine Aufgabe zugewiesen",
  "notifications.type.event_workflow_decided":
    "Über Ihre Freigabeanfrage wurde entschieden",
  "notifications.type.event_workflow_delegated":
    "Eine Freigaberunde wurde an Sie übergeben",
  "notifications.type.event_workflow_escalated":
    "Eine Freigaberunde hat ihre Frist überschritten",
  "notifications.type.event_workflow_step_pending":
    "Eine Freigabeanfrage wartet auf Ihre Entscheidung",
  "today.openProjects":
    "Meine Projekte",
  "projects.title":
    "Meine Projekte",
  "projects.detailTitle":
    "Projekt",
  "projects.none":
    "Sie sind keinem Projekt zugewiesen.",
  "projects.active":
    "Aktiv",
  "projects.ended":
    "Beendet",
  "projects.asksCount":
    "Noch von Ihnen benötigt",
  "projects.moreOnWeb":
    "Hier werden nur Ihre ersten Projekte angezeigt. Die Website zeigt alle.",
  "projects.notFound":
    "Dieses Projekt gehört nicht zu Ihren oder ist nicht unter den hier gezeigten Projekten.",
  "projects.asksTitle":
    "Noch von Ihnen benötigt",
  "projects.asksShownOf":
    "Hier angezeigt / insgesamt noch offen – die vollständige Liste finden Sie auf der Website",
  "projects.asksUnavailable":
    "Was noch von Ihnen benötigt wird, konnte gerade nicht gelesen werden. Versuchen Sie es erneut oder öffnen Sie das Projekt auf der Website.",
  "projects.asksNotRead":
    "Dieser Einsatz ist beendet. Was dabei von Ihnen verlangt wurde, steht auf der Projektseite der Website.",
  "projects.asksIncomplete":
    "In Ihren Projekten ist mehr offen, als die App anzeigen kann; der Teil dieses Projekts wird daher möglicherweise nicht gezeigt. Die vollständige Liste steht auf der Projektseite der Website.",
  "projects.asksNone":
    "Für Sie ist in diesem Projekt nichts offen.",
  "projects.ask.needed":
    "Benötigt",
  "projects.ask.missing":
    "Fehlt",
  "projects.ask.rejected":
    "Abgelehnt – ein neues wird benötigt",
  "projects.ask.expired":
    "Abgelaufen",
  "projects.instructionTitle":
    "Letzte Anweisung",
  "projects.answerInstruction":
    "In Nachrichten antworten",
  "projects.webDetail":
    "Die vollständige Projektseite – Phasen, Dokumente und Team – finden Sie auf der Website.",
  "messages.threadNotShown":
    "Das Gespräch wird noch nicht angezeigt. Warten Sie, bis es geladen ist, lesen Sie es und prüfen Sie dann Ihre Antwort.",
  "messages.newBeforeReview":
    "In diesem Gespräch ist eine neue Nachricht eingegangen. Sie wird jetzt oben angezeigt – lesen Sie sie und prüfen Sie Ihre Antwort erneut.",
  "profile.noWorkerProfile": "Dieses Konto hat noch kein Arbeiterprofil.",
  "profile.figuresTitle": "Fähigkeiten mit Ihren erfassten Stunden",
  "profile.groupManagerConfirmed": "Von einer Führungskraft bestätigt",
  "profile.groupJournalBacked": "Durch Ihr Arbeitstagebuch belegt",
  "profile.groupDeclared": "Von Ihnen angegeben",
  "profile.figuresUnavailable":
    "Stunden, Anteil und Einträge konnten diesmal nicht gelesen werden. Die Fähigkeiten unten sind weiterhin Ihre erfassten Fähigkeiten — nichts wird als 0 gezeigt.",
  "profile.figuresLegend":
    "Stunden · Anteil an den einer Fähigkeit zugeordneten Stunden · Einträge, gesamt. Dieselben Zahlen wie auf der Website.",
  "profile.figuresNotRead": "Zahlen konnten nicht gelesen werden",
  "profile.noFigures": "keine erfassten Stunden",
  "profile.involvedUnattributed": "beteiligt; Zeit nicht allein dieser Fähigkeit zugeordnet",
  "profile.hoursShort": "Std.",
  "profile.entriesLabel": "Einträge",
  "profile.selfStatedMissing":
    "Fähigkeiten, die Sie in eigenen Worten notiert haben, erreichen diesen Bildschirm noch nicht; die Website zeigt sie bei Ihren Fähigkeiten.",
  "profile.openJournal": "Arbeitstagebuch öffnen",
  "journal.openProfile": "Was diese Einträge ergeben — in Ihrem Profil",

  "today.figuresTitle": "Ihre Arbeit in Zahlen",
  "today.periodToday": "Heute",
  "today.periodWeek": "Letzte 7 Tage",
  "today.hoursLabel": "Stunden",
  "today.daysUnitLabel": "in Tagen erfasst",
  "today.entriesLabel": "Einträge",
  "today.daysLabel": "Tage",
  "today.confirmedLabel": "Von einer Führungskraft bestätigt, Std.",
  "today.periodEmpty": "In diesem Zeitfenster nichts erfasst.",
  "today.periodMissing": "Der Server hat für dieses Zeitfenster keine Zahl gesendet.",
  "today.dominantTitle": "Größter Anteil Ihrer Stunden, letzte 7 Tage",
  "today.dominantShare": "der einer Fähigkeit zugeordneten Stunden",
  "today.dominantNone":
    "In den letzten 7 Tagen wurden keiner einzelnen Fähigkeit Stunden zugeordnet.",
  "today.coverageTruncated":
    "Diese Zahlen beruhen auf den zuletzt gelesenen Einträgen — ältere Einträge sind nicht enthalten.",
  "today.figuresScope":
    "Aus Ihren eigenen Arbeitstagebuch-Einträgen, nach derselben Regel wie die Website. Kalendertage enden heute (UTC).",
  "today.openJournal": "Arbeitstagebuch öffnen",
  "today.openProfile": "Profil und Fähigkeiten öffnen",
  "today.openNeed": "Einen Personalbedarf melden",
  "need.title": "Bedarf melden",
  "need.intro": "Ein Personalbedarf für die Organisation, für die Sie handeln. Sie prüfen ihn vor dem Anlegen; Arbeitskräfte, die ihn sehen dürfen, finden ihn auf ihrem Board.",
  "need.descriptionLabel": "Was brauchen Sie?",
  "need.descriptionHint": "In Ihren eigenen Worten — die Arbeit, wann, wie viele Personen.",
  "need.roleLabel": "Rolle",
  "need.locationLabel": "Ort",
  "need.teamSizeLabel": "Wie viele Personen",
  "need.teamSizeHint": "Eine ganze Zahl",
  "need.urgencyLabel": "Wie dringend",
  "need.urgency.flexible": "Flexibel",
  "need.urgency.this_week": "Diese Woche",
  "need.urgency.urgent": "Dringend",
  "need.descriptionRequired": "Schreiben Sie wenigstens ein paar Worte dazu, was Sie brauchen. Es wurde nichts gesendet.",
  "need.teamSizeInvalid": "Die Personenzahl muss eine ganze Zahl ab 1 sein. Es wurde nichts gesendet.",
  "need.review": "Vor dem Anlegen prüfen",
  "need.cancel": "Zurück",
  "need.previewTitle": "Prüfen Sie, bevor Sie es anlegen",
  "need.previewBody": "Es wurde noch nichts angelegt.",
  "need.actingFor": "Für",
  "need.confirm": "Bedarf anlegen",
  "need.edit": "Bearbeiten",
  "need.sentTitle": "Angelegt",
  "need.sentBody": "Der Bedarf ist jetzt für die Organisation offen. Sie können ihn auf der Website verfolgen.",
  "need.done": "Zurück zu Heute",
  "need.overLimit": "Diese Organisation hat die Grenze aktiver Positionen ihres Plans erreicht. Es wurde nichts angelegt — schließen Sie einen Bedarf oder ändern Sie den Plan auf der Website.",
  "need.draftFailedTitle": "Wir konnten diesen Bedarf nicht vorbereiten",
  "need.sendFailedTitle": "Wir konnten diesen Bedarf nicht anlegen",
  "today.openJobs": "Offene Stellen durchsuchen",
  "jobs.title": "Stellen",
  "jobs.intro": "Die öffentliche Stellenbörse — dieselben Anzeigen wie auf der Website. Arbeitgeber und Bewerbungsweg öffnen sich auf der Webseite in Ihrem Namen.",
  "jobs.queryLabel": "Suche",
  "jobs.queryHint": "Ein Beruf oder ein Wort aus dem Titel, in jeder Sprache",
  "jobs.search": "Stellen suchen",
  "jobs.total": "Stellen",
  "jobs.page": "Seite",
  "jobs.none": "Zu dieser Suche gibt es derzeit keine Stellen.",
  "jobs.prev": "Vorherige Seite",
  "jobs.next": "Nächste Seite",
  "jobs.openWeb": "Vollständige Anzeige öffnen",
  "jobs.positions": "Stellen",
  "jobs.compensation": "Vergütung",
  "jobs.published": "Veröffentlicht",
  "jobs.untitled": "Stelle",
  "jobs.notProvisioned": "Die Stellenbörse ist in dieser Umgebung nicht aktiviert.",
  "jobs.unavailable": "Die Stellenbörse hat nicht rechtzeitig geantwortet. Das heißt nicht, dass es keine Stellen gibt — versuchen Sie es erneut.",
  "jobs.linkedNotFound": "Diese Stelle ist nicht mehr auf der Börse (möglicherweise geschlossen).",
  "today.openOpportunities": "Bedarfe, die Ihnen offenstehen",
  "today.openAvailability": "Wer aus Ihrem Team ist frei",
  "opportunities.title": "Möglichkeiten",
  "opportunities.intro": "Bedarfe, die Sie gerade sehen können. Interesse zu bekunden zeigt es dem Eigentümer des Bedarfs in seiner eigenen Ansicht — nichts verlässt die Plattform.",
  "opportunities.noneVisible": "Derzeit ist für Sie kein Bedarf sichtbar. Sobald eine mit Ihnen verbundene Organisation einen öffnet, erscheint er hier.",
  "opportunities.express": "Ich bin interessiert",
  "opportunities.noteLabel": "Eine Nachricht an sie (optional)",
  "opportunities.noteHint": "Ein Satz dazu, warum oder wann — sie lesen ihn so, wie er geschrieben ist.",
  "opportunities.draft": "Vor dem Senden prüfen",
  "opportunities.previewTitle": "Prüfen Sie, bevor Sie senden",
  "opportunities.previewBody": "Es wurde noch nichts gesendet.",
  "opportunities.alreadyExpressed": "Sie haben für diesen Bedarf bereits Interesse bekundet; erneutes Senden aktualisiert es.",
  "today.openOffers": "Angebote und Einladungen für Sie",
  "offers.title": "Angebote",
  "offers.reviewNotice": "Wenn Sie annehmen, kann eine Führungskraft von {organization} die Arbeit lesen, die Sie für sie erfassen, und sie abzeichnen. Bis dahin bleibt es Ihr eigener Eintrag.",
  "offers.as": "Als",
  "offers.relationship.collaborator": "Mitwirkender",
  "offers.relationship.consultant": "Berater",
  "offers.relationship.employee": "Angestellter",
  "offers.relationship.freelancer": "Freiberufler",
  "offers.relationship.manager": "Manager",
  "offers.relationship.owner": "Inhaber",
  "offers.relationship.student": "Student",
  "offers.relationship.unemployed": "Arbeitslos",
  "offers.relationship.volunteer": "Freiwilliger",
  "offers.relationship.intern": "Praktikant/in",
  "offers.relationship.external_manager": "Externer Vorgesetzter (Auftraggeber)",
  "offers.relationship.other": "Andere Beziehung",
  "offers.intro": "Arbeitsangebote und Einladungen an Sie. Nichts ändert sich, bis Sie Ihre Antwort bestätigen.",
  "offers.bookingsHeading": "Arbeitsangebote",
  "offers.invitationsHeading": "Einladungen",
  "offers.noBookings": "Keine Arbeitsangebote warten auf Ihre Antwort.",
  "offers.noInvitations": "Keine Einladungen warten auf Ihre Antwort.",
  "offers.untitledBooking": "Arbeitsangebot",
  "offers.untitledInvitation": "Einladung",
  "offers.from": "Von",
  "offers.dates": "Zeitraum",
  "offers.answerBy": "Antworten bis",
  "offers.accept": "Annehmen",
  "offers.decline": "Ablehnen",
  "offers.previewAcceptBooking": "Dieses Arbeitsangebot annehmen?",
  "offers.previewDeclineBooking": "Dieses Arbeitsangebot ablehnen?",
  "offers.previewAcceptInvitation": "Diese Einladung annehmen?",
  "offers.previewBody": "Das ist eine echte Antwort: Die andere Seite sieht sie. Noch wurde nichts gesendet.",
  "offers.confirm": "Antwort bestätigen",
  "offers.cancel": "Zurück",
  "offers.doneTitle": "Ihre Antwort ist erfasst",
  "offers.doneBody": "Die andere Seite sieht sie jetzt.",
  "offers.backToList": "Zurück zu den Angeboten",
  "offers.prepareFailedTitle": "Diese Antwort konnte nicht vorbereitet werden",
  "offers.confirmFailedTitle": "Ihre Antwort wurde nicht erfasst",
  "offers.clash": "Dieser Zeitraum überschneidet sich mit bereits angenommener Arbeit. Öffnen Sie das Angebot auf der Website, um die Überschneidung zu sehen und dort zu entscheiden.",
  "offers.changed": "Dieses Angebot hat sich geändert oder wurde bereits beantwortet. Gehen Sie zurück, um die aktuelle Liste zu sehen.",
  "opportunities.confirm": "Senden",
  "opportunities.cancel": "Zurück",
  "opportunities.sentTitle": "Gesendet",
  "opportunities.sentBody": "Der Eigentümer dieses Bedarfs sieht Ihr Interesse jetzt in seiner eigenen Ansicht.",
  "opportunities.sentStatus": "Status",
  "opportunities.another": "Zurück zur Liste",
  "opportunities.notVisible": "Dieser Bedarf ist für Sie nicht mehr sichtbar (möglicherweise geschlossen).",
  "opportunities.draftFailedTitle": "Wir konnten das nicht vorbereiten",
  "opportunities.sendFailedTitle": "Wir konnten das nicht senden",
  "availability.title": "Wer ist frei",
  "availability.intro": "Ihr aktives Team für die nächsten 7 Tage. Zugesagt heißt nicht nicht verfügbar: eine Überschneidung ist eine Warnung, keine Ablehnung.",
  "availability.actingFor": "Handelnd für",
  "availability.window": "Zeitraum",
  "availability.rosterTotal": "Teammitglieder",
  "availability.state.free": "frei",
  "availability.state.committed": "zugesagt",
  "availability.state.unavailable": "nicht verfügbar",
  "availability.notFreeUntil": "nicht frei bis",
  "availability.committedTo": "zugesagt für",
  "availability.overridable": "eine befugte Person kann anders entscheiden",
  "availability.sourcesPartial": "Nicht jede Quelle hat geantwortet: Abwesenheiten oder Zusagen konnten nicht gelesen werden, daher wird hier niemand mit Sicherheit als frei gemeldet.",
  "availability.personalWorkspace": "Sie sind in Ihrem persönlichen Bereich. Wechseln Sie in den Einstellungen zu einem Organisationsbereich, um dessen Team zu sehen.",
  "availability.noOrganization": "Dieses Konto gehört zu keiner Organisation, daher gibt es kein Team, über das berichtet werden kann.",
  "availability.noRoster": "Diese Organisation hat keine aktiven Teammitglieder, daher gibt es niemanden, über den berichtet werden kann.",
  "availability.noCompanyContext": "Dieser Bereich kann nicht als Arbeitgeber handeln, daher gibt es kein Team, über das berichtet werden kann.",
};

const pl: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "Dziś",
  "nav.journal": "Dziennik pracy",
  "nav.profile": "Profil",
  "nav.settings": "Ustawienia",

  "auth.checking": "Sprawdzamy Twoją sesję…",
  "auth.signIn.title": "Zaloguj się",
  "auth.signIn.email": "E-mail",
  "auth.signIn.password": "Hasło",
  "auth.signIn.submit": "Zaloguj się",
  "auth.signIn.toRegister": "Załóż konto",
  "auth.register.title": "Załóż konto",
  "auth.register.submit": "Załóż konto",
  "auth.register.toSignIn": "Mam już konto",
  "auth.signIn.forgot": "Nie pamiętasz hasła?",
  "auth.register.legal":
    "Tworząc konto, akceptujesz warunki korzystania z usługi i politykę prywatności.",
  "auth.error.rejected": "Ten e-mail i hasło do siebie nie pasują.",
  "auth.error.unreachable":
    "Nie udało się połączyć z serwerem, więc nie wiemy, czy te dane są poprawne. Sprawdź połączenie i spróbuj ponownie.",
  "auth.error.confirmationRequired":
    "Twoje konto zostało utworzone. Potwierdź link w e-mailu, a potem zaloguj się.",
  "auth.error.notConfigured":
    "Ta wersja nie ma konfiguracji serwera, więc nie może nikogo zalogować.",
  "auth.signOut": "Wyloguj się",

  "session.unavailable.title": "Nie udało się sprawdzić Twojej sesji",
  "session.unavailable.body":
    "To nie to samo co wylogowanie — bezpieczna pamięć Twojego telefonu nie odpowiedziała. Spróbuj ponownie.",
  "session.unavailable.retry": "Spróbuj ponownie",

  "route.notFound.title": "Tego ekranu nie ma w tej aplikacji",
  "route.notFound.body":
    "Link, który tu prowadzi, nigdzie w tej aplikacji nie trafia. Może należeć do strony internetowej albo być nieaktualny. Nic nigdzie nie zostało wysłane.",
  "route.notFound.action": "Wróć do aplikacji",

  "crash.title": "W aplikacji wystąpił błąd",
  "crash.body":
    "To błąd samej aplikacji, a nie Twoje działanie, i nic nigdzie nie zostało wysłane. Spróbuj ponownie — jeśli powtarza się dalej, zamknij aplikację i otwórz ją od nowa.",

  "config.problem.title": "Ta wersja nie jest skonfigurowana",
  "config.problem.body":
    "Aplikacja nie uruchomi się, dopóki te wartości nie zostaną ustawione. Żadne dane nigdzie nie zostały wysłane.",

  "workspace.title": "Działasz w imieniu",
  "workspace.loading": "Wczytujemy Twoje przestrzenie robocze…",
  "workspace.active": "Aktywna",
  "workspace.switching": "Przełączanie…",
  "workspace.failed.title": "Nie udało się odczytać Twoich przestrzeni roboczych",
  "workspace.failed.body":
    "To nieudany odczyt, a nie odpowiedź: nie oznacza, że nie należysz do żadnej organizacji. Spróbuj za chwilę.",
  "workspace.pointerUnavailable":
    "To jest wyliczane z tego, do czego należysz, a nie zapisany dla Ciebie wybór, i nie da się tego tutaj jeszcze zmienić.",
  "workspace.switchFailed": "Przestrzeń robocza nie została zmieniona. Nic nie zostało przeniesione.",
  "context.loading": "Wczytujemy Twoje role…",
  "context.active": "Aktywna",
  "context.none": "Na tym koncie nie zapisano jeszcze żadnej roli uczestnictwa. Tyle odczytaliśmy — to nie błąd aplikacji.",
  "context.title": "Pracujesz jako",
  "context.unavailable.title": "Nie możemy jeszcze pokazać Twoich kontekstów",
  "context.unavailable.body":
    "Aplikacja potrafi Cię zalogować, ale nie potrafi jeszcze odczytać, do których organizacji należysz. W Twoim koncie niczego nie brakuje — ten klient po prostu nie umie jeszcze o to zapytać.",
  "context.mode.worker": "Ja",
  "context.mode.company": "Firma",
  "context.mode.agency": "Agencja",
  "context.mode.customer": "Zleceniodawca",

  "language.title": "Język",
  "language.preview": "Tłumaczenie poglądowe",

  "domain.loading": "Pytamy serwer…",
  "domain.retry": "Spróbuj ponownie",
  "domain.failedTitle": "Nie udało się tego wczytać",
  "domain.unavailable.notConnectedYet": "Jeszcze niepołączone",
  "domain.unavailable.signInAgain": "Zaloguj się ponownie.",
  "domain.unavailable.offline": "Brak połączenia. Nic nie zostało wysłane.",
  "domain.unavailable.unexpectedAnswer":
    "Serwer odpowiedział czymś, czego ta aplikacja nie zrozumiała.",
  "domain.refused.no_credentials": "Zaloguj się ponownie.",
  "domain.refused.invalid_token":
    "Twoja sesja wygasła. Zaloguj się ponownie.",
  "domain.refused.no_profile": "To konto nie ma jeszcze profilu.",
  "domain.refused.not_authorized":
    "Serwer odrzucił to żądanie dla tego konta.",
  "domain.refused.rate_limited":
    "Serwer poprosił aplikację o zwolnienie tempa. Spróbuj za chwilę.",
  "domain.refused.capability": "Serwer odrzucił to żądanie.",
  "domain.refused.identity_unavailable":
    "Nie udało się potwierdzić, kim jesteś. To nie jest odmowa — spróbuj ponownie.",

  "today.signedInAs": "Zalogowano jako",
  "today.recentWork": "Ostatnie prace",
  "journal.empty": "W Dzienniku pracy nie ma jeszcze żadnych wpisów.",
  "journal.logWork": "Zapisz pracę",
  "journal.compose.title": "Zapisz pracę",
  "journal.compose.intro":
    "Opisz własnymi słowami swoją pracę. Twój Dziennik pracy zapisuje dokładnie to, co napiszesz.",
  "journal.compose.date": "Data pracy",
  "journal.compose.dateHint": "Rok-miesiąc-dzień, na przykład 2026-09-01",
  "journal.compose.today": "Dziś",
  "journal.compose.yesterday": "Wczoraj",
  "journal.compose.notes": "Co zostało zrobione",
  "journal.compose.notesHint":
    "Własnymi słowami. Godziny i miejsca też należą tutaj.",
  "journal.compose.site": "Budowa lub miejsce (opcjonalnie)",
  "journal.compose.context": "Kontekst pracy",
  "journal.compose.contextUnnamed": "Nie podano",
  "journal.compose.review": "Sprawdź przed zapisaniem",
  "journal.compose.previewTitle": "Sprawdź to, zanim zostanie zapisane",
  "journal.compose.previewNothingSaved":
    "Nic jeszcze nie zostało zapisane. Dokładnie to zostanie zarejestrowane.",
  "journal.compose.save": "Zapisz w moim Dzienniku pracy",
  "journal.compose.edit": "Zmień coś",
  "journal.compose.chooseContext": "Do której pracy to należy?",
  "journal.compose.chooseContextBody":
    "Ten wpis mógłby należeć do więcej niż jednego z Twoich kontekstów pracy, więc nic nie zostało przygotowane ani zapisane. Wybierz jeden.",
  "journal.compose.savedTitle": "Zapisano w Twoim Dzienniku pracy",
  "journal.compose.savedBody":
    "To jest już zarejestrowany wpis. Dokładnie to zapisał serwer.",
  "journal.compose.another": "Zapisz kolejny wpis",
  "journal.compose.backToJournal": "Wróć do dziennika",
  "journal.compose.checkThis": "Najpierw to sprawdź",
  "journal.compose.invalidDate":
    "Datę zapisz jako rok-miesiąc-dzień, na przykład 2026-09-01. Nic nie zostało wysłane.",
  "journal.compose.futureDate":
    "Data pracy nie może być w przyszłości — wpis w dzienniku zapisuje pracę, która już się odbyła. Nic nie zostało wysłane.",
  "journal.compose.notesRequired":
    "Przed zapisaniem opisz, co zostało zrobione. Nic nie zostało wysłane.",
  "journal.compose.draftFailedTitle": "Nie udało się przygotować tego wpisu",
  "journal.compose.saveFailedTitle": "Nie udało się zapisać tego wpisu",
  "journal.compose.staleDraft":
    "Nie zapisano: Twój dziennik zmienił się po przygotowaniu tego wpisu, więc sprawdzenie, na którym się opierał, jest nieaktualne. Przejrzyj go jeszcze raz.",
  "journal.compose.noContext":
    "To konto nie ma aktywnego kontekstu pracy, więc wpis nie ma gdzie zostać zarejestrowany. Najpierw wskaż na stronie internetowej, gdzie pracujesz, a potem zapisuj pracę tutaj.",
  "journal.compose.unsureSaved":
    "Połączenie zerwało się już po wysłaniu, więc nie wiemy, czy wpis dotarł. Zanim napiszesz go ponownie, otwórz Dziennik pracy i sprawdź. Ponowna próba nie utworzy duplikatu.",
  "journal.compose.skillsAdded": "Nowo zapisane umiejętności",
  "journal.compose.skillsStrengthened": "Umiejętności z nowym dowodem",
  "journal.compose.skillsClaims": "Kompetencje zauważone w Twoich słowach",
  "journal.compose.skillsReview": "Czeka na Twoje sprawdzenie",
  "journal.compose.noCvChange":
    "Z tego wpisu nie dodano nic nowego do Twojego Living CV.",
  "journal.compose.skillsPartial":
    "Część aktualizacji Living CV nie została ukończona. Sam wpis jest zapisany.",
  "journal.compose.skillsFailed":
    "Aktualizacja Living CV tym razem nie została wykonana. Sam wpis jest zapisany.",
  "journal.compose.reviewOnWeb":
    "To, co czeka na sprawdzenie, potwierdza się na stronie internetowej.",
  "profile.skillsEmpty": "Nie zapisano jeszcze żadnych umiejętności.",
  "journal.correct.action":
    "Popraw ten wpis",
  "journal.correct.title":
    "Popraw wpis",
  "journal.correct.intro":
    "Zmień to, co jest błędne — treść, dzień lub miejsce. Poprzednia wersja zostaje w historii; sumy liczą poprawioną.",
  "journal.correct.nothingChanged":
    "Nic jeszcze nie zmieniono. Najpierw popraw treść, dzień lub miejsce.",
  "journal.correct.previewTitle":
    "Sprawdź poprawkę przed zapisaniem",
  "journal.correct.before":
    "Teraz",
  "journal.correct.after":
    "Po poprawce",
  "journal.correct.hours":
    "Godziny",
  "journal.correct.output":
    "Wykonano",
  "journal.correct.wasConfirmed":
    "Ten wpis potwierdził kierownik. Potwierdzenie zostaje przy poprzedniej wersji; poprawiona wersja zostaje zapisana jako jeszcze niepotwierdzona.",
  "journal.correct.save":
    "Zapisz poprawkę",
  "journal.correct.savedTitle":
    "Poprawka zapisana",
  "journal.correct.savedBody":
    "Dziennik i sumy pokazują teraz poprawioną wersję.",
  "journal.correct.savedConfirmedBody":
    "Poprawiona wersja jest zapisana i czeka na potwierdzenie kierownika; poprzednia potwierdzona wersja zostaje w historii.",
  "journal.correct.draftFailedTitle":
    "Nie udało się przygotować poprawki",
  "journal.correct.saveFailedTitle":
    "Nie udało się zapisać poprawki",
  "journal.correct.unsureSaved":
    "Poprawka została wysłana, ale nie wróciła odpowiedź, więc nie wiemy, czy została zapisana. Ponowna próba jest bezpieczna: poprawka, która już została zapisana, zostanie odrzucona, a nie zapisana dwa razy.",
  "journal.correct.staleDraft":
    "Nie zapisano: dziennik zmienił się po przygotowaniu poprawki. Sprawdź ją ponownie.",
  "journal.correct.superseded":
    "Ten wpis został już poprawiony lub usunięty. Otwórz dziennik ponownie i popraw bieżącą wersję.",
  "journal.correct.notFound":
    "Tego wpisu nie ma wśród Twoich najnowszych wpisów w dzienniku. Możliwe, że został już poprawiony.",
  "journal.correct.conflict":
    "Nowa treść podaje jeden czas dla całego wpisu, ale wpis zawiera też ilość wykonanej pracy, a oba wymagają tego samego pola. Podaj czas dla każdej czynności albo popraw wpis na stronie.",
  "journal.correct.missingTitle":
    "Tego wpisu nie można tu poprawić",
  "today.openMessages":
    "Wiadomości",
  "messages.title":
    "Wiadomości",
  "messages.conversation":
    "Rozmowa",
  "messages.intro":
    "Twoje rozmowy w LabourMarket.ai. Wiadomości zostają w aplikacji — nic nie jest wysyłane e-mailem ani SMS-em. Nowe wiadomości widać po otwarciu tego ekranu.",
  "messages.none":
    "Nie masz jeszcze żadnych rozmów.",
  "messages.untitled":
    "Rozmowa",
  "messages.threadEmpty":
    "W tej rozmowie nie ma jeszcze wiadomości.",
  "messages.fromMe":
    "Ty",
  "messages.fromThem":
    "Rozmówca",
  "messages.replyLabel":
    "Twoja odpowiedź",
  "messages.review":
    "Sprawdź przed wysłaniem",
  "messages.emptyBody":
    "Najpierw napisz wiadomość.",
  "messages.previewTitle":
    "Sprawdź przed wysłaniem",
  "messages.previewNothingSent":
    "Nic jeszcze nie wysłano. Dokładnie ten tekst zobaczy druga osoba.",
  "messages.send":
    "Wyślij",
  "messages.sentTitle":
    "Wysłano",
  "messages.sentBody":
    "Twoja wiadomość jest w rozmowie.",
  "messages.sentUnverified":
    "Serwer przyjął wiadomość, ale po odczytaniu nie zgadzała się. Otwórz rozmowę ponownie, aby ją sprawdzić.",
  "messages.writeAnother":
    "Napisz kolejną wiadomość",
  "messages.draftFailedTitle":
    "Nie udało się przygotować wiadomości",
  "messages.sendFailedTitle":
    "Nie udało się wysłać wiadomości",
  "messages.unsureSent":
    "Wiadomość została wysłana, ale nie wróciła odpowiedź, więc nie wiemy, czy dotarła. Zanim wyślesz ją ponownie, otwórz rozmowę jeszcze raz.",
  "messages.staleDraft":
    "Nie wysłano: po przygotowaniu Twojej odpowiedzi w rozmowie pojawiła się nowa wiadomość. Przeczytaj ją i sprawdź odpowiedź ponownie.",
  "messages.notFound":
    "Ta rozmowa nie jest Twoja albo już nie istnieje.",
  "messages.noPermission":
    "Nie możesz pisać w tej rozmowie.",
  "today.openNotifications":
    "Powiadomienia",
  "notifications.title":
    "Powiadomienia",
  "notifications.intro":
    "Co wydarzyło się w Twojej pracy, najnowsze na górze. Otwarcie oznacza powiadomienie jako przeczytane. Powiadomienia nie są wysyłane na telefon — widać je tutaj po otwarciu tego ekranu.",
  "notifications.none":
    "Nie masz powiadomień.",
  "notifications.unread":
    "Nowe",
  "notifications.markAll":
    "Oznacz wszystkie jako przeczytane",
  "notifications.markFailedTitle":
    "Nie udało się oznaczyć jako przeczytane",
  "notifications.type.unknown":
    "Powiadomienie",
  "notifications.type.event_absence_approved":
    "Twoja nieobecność została zatwierdzona",
  "notifications.type.event_absence_rejected":
    "Twoja nieobecność została odrzucona",
  "notifications.type.event_absence_requested":
    "Zgłoszono dla Ciebie nieobecność",
  "notifications.type.event_booking_accepted":
    "Twoja propozycja rezerwacji została przyjęta",
  "notifications.type.event_booking_declined":
    "Twoja propozycja rezerwacji została odrzucona",
  "notifications.type.event_booking_proposed":
    "Otrzymałeś propozycję rezerwacji",
  "notifications.type.event_booking_withdrawn":
    "Propozycja rezerwacji została wycofana",
  "notifications.type.event_demand_interest_expressed":
    "Pracownik wyraził zainteresowanie Twoim zapotrzebowaniem",
  "notifications.type.event_demand_interest_reviewed":
    "Firma oznaczyła Twoje zainteresowanie jako rozpatrzone",
  "notifications.type.event_document_ack_assigned":
    "Poproszono Cię o potwierdzenie, że zapoznano się z dokumentem.",
  "notifications.type.event_document_ack_completed":
    "Dokument wysłany przez Ciebie do potwierdzenia został potwierdzony.",
  "notifications.type.event_document_expiring":
    "Ważność dokumentu wkrótce się kończy.",
  "notifications.type.event_engagement_created":
    "Utworzono nową współpracę",
  "notifications.type.event_engagement_ended":
    "Współpraca została zakończona",
  "notifications.type.event_history_link_offered":
    "Organizacja zaproponowała powiązanie zarejestrowanej historii Twojej pracy z Twoim kontem",
  "notifications.type.event_invitation_accepted":
    "Ktoś przyjął Twoje zaproszenie",
  "notifications.type.event_job_alert":
    "Pojawiła się nowa oferta pasująca do Twoich kryteriów",
  "notifications.type.event_journal_review_decided":
    "Twój wpis w dzienniku został sprawdzony",
  "notifications.type.event_journal_review_decided_approved":
    "Twój wpis w dzienniku został potwierdzony",
  "notifications.type.event_journal_review_decided_changes_requested":
    "Poproszono o zmiany w Twoim wpisie w dzienniku",
  "notifications.type.event_journal_review_decided_rejected":
    "Twój wpis w dzienniku został odrzucony",
  "notifications.type.event_message_received":
    "Masz nową wiadomość",
  "notifications.type.event_saved_search_match":
    "Zapisane wyszukiwanie ma nowe wyniki",
  "notifications.type.event_weekly_digest":
    "Twoje tygodniowe podsumowanie pracy i możliwości jest gotowe",
  "notifications.type.event_weekly_digest_journal":
    "Podsumowanie Twojego dziennika pracy z tego tygodnia jest gotowe",
  "notifications.type.event_weekly_digest_profile_completion":
    "Aby pokazać pasujące oferty, potwierdź, jaką pracę wykonujesz",
  "notifications.type.event_work_task_assigned":
    "Przypisano ci zadanie",
  "notifications.type.event_workflow_decided":
    "Podjęto decyzję w sprawie Twojego wniosku o zatwierdzenie",
  "notifications.type.event_workflow_delegated":
    "Przekazano Ci etap zatwierdzania",
  "notifications.type.event_workflow_escalated":
    "Etap zatwierdzania przekroczył termin",
  "notifications.type.event_workflow_step_pending":
    "Wniosek o zatwierdzenie czeka na Twoją decyzję",
  "today.openProjects":
    "Moje projekty",
  "projects.title":
    "Moje projekty",
  "projects.detailTitle":
    "Projekt",
  "projects.none":
    "Nie masz przypisanego żadnego projektu.",
  "projects.active":
    "Aktywny",
  "projects.ended":
    "Zakończony",
  "projects.asksCount":
    "Jeszcze potrzebne od Ciebie",
  "projects.moreOnWeb":
    "Tutaj widać tylko Twoje pierwsze projekty. Na stronie widać wszystkie.",
  "projects.notFound":
    "Ten projekt nie jest Twój albo nie ma go wśród pokazanych tutaj.",
  "projects.asksTitle":
    "Jeszcze potrzebne od Ciebie",
  "projects.asksShownOf":
    "Pokazane tutaj / łącznie otwarte — pełna lista jest na stronie internetowej",
  "projects.asksUnavailable":
    "Nie udało się teraz odczytać, co jeszcze jest potrzebne od Ciebie. Spróbuj ponownie albo otwórz projekt na stronie internetowej.",
  "projects.asksNotRead":
    "To przypisanie się zakończyło. Co było w nim od Ciebie wymagane, zobaczysz na stronie projektu.",
  "projects.asksIncomplete":
    "W Twoich projektach otwartych jest więcej, niż aplikacja może pokazać, więc część tego projektu może nie być widoczna. Pełna lista jest na stronie projektu.",
  "projects.asksNone":
    "W tym projekcie nic nie czeka na Ciebie.",
  "projects.ask.needed":
    "Potrzebne",
  "projects.ask.missing":
    "Brakuje",
  "projects.ask.rejected":
    "Odrzucone — potrzebny nowy",
  "projects.ask.expired":
    "Wygasło",
  "projects.instructionTitle":
    "Najnowsze polecenie",
  "projects.answerInstruction":
    "Odpowiedz w wiadomościach",
  "projects.webDetail":
    "Pełna strona projektu — etapy, dokumenty i zespół — jest na stronie internetowej.",
  "messages.threadNotShown":
    "Rozmowa nie jest jeszcze widoczna. Poczekaj, aż się wczyta, przeczytaj ją, a potem sprawdź swoją odpowiedź.",
  "messages.newBeforeReview":
    "W tej rozmowie pojawiła się nowa wiadomość. Jest teraz widoczna powyżej — przeczytaj ją i sprawdź swoją odpowiedź jeszcze raz.",
  "profile.noWorkerProfile": "To konto nie ma jeszcze profilu pracownika.",
  "profile.figuresTitle": "Umiejętności wraz z Twoimi zapisanymi godzinami",
  "profile.groupManagerConfirmed": "Potwierdzone przez kierownika",
  "profile.groupJournalBacked": "Poparte Twoim Dziennikiem pracy",
  "profile.groupDeclared": "Zadeklarowane przez Ciebie",
  "profile.figuresUnavailable":
    "Godzin, udziału i wpisów nie udało się tym razem odczytać. Umiejętności poniżej nadal są Twoimi zapisanymi umiejętnościami — nic nie jest pokazywane jako 0.",
  "profile.figuresLegend":
    "Godziny · udział w godzinach przypisanych do umiejętności · wpisy, od początku. Te same liczby co na stronie internetowej.",
  "profile.figuresNotRead": "nie udało się odczytać liczb",
  "profile.noFigures": "brak zapisanych godzin",
  "profile.involvedUnattributed": "udział; czas nieprzypisany wyłącznie tej umiejętności",
  "profile.hoursShort": "godz.",
  "profile.entriesLabel": "wpisy",
  "profile.selfStatedMissing":
    "Kompetencje zapisane przez Ciebie własnymi słowami nie trafiają jeszcze na ten ekran; strona internetowa pokazuje je przy Twoich umiejętnościach.",
  "profile.openJournal": "Otwórz Dziennik pracy",
  "journal.openProfile": "Zobacz w profilu, co dają te wpisy",

  "today.figuresTitle": "Twoja praca w liczbach",
  "today.periodToday": "Dziś",
  "today.periodWeek": "Ostatnie 7 dni",
  "today.hoursLabel": "Godziny",
  "today.daysUnitLabel": "zapisane w dniach",
  "today.entriesLabel": "Wpisy",
  "today.daysLabel": "Dni",
  "today.confirmedLabel": "Potwierdzone przez kierownika, godz.",
  "today.periodEmpty": "W tym okresie nic nie zapisano.",
  "today.periodMissing": "Serwer nie przysłał liczby dla tego okresu.",
  "today.dominantTitle": "Największy udział Twoich godzin, ostatnie 7 dni",
  "today.dominantShare": "godzin przypisanych do umiejętności",
  "today.dominantNone":
    "W ostatnich 7 dniach żadnej pojedynczej umiejętności nie przypisano godzin.",
  "today.coverageTruncated":
    "Te liczby opierają się na ostatnio odczytanych wpisach — starsze wpisy nie są uwzględnione.",
  "today.figuresScope":
    "Z Twoich własnych wpisów w Dzienniku pracy, według tej samej zasady co strona internetowa. Dni kalendarzowe kończą się dzisiaj (UTC).",
  "today.openJournal": "Otwórz Dziennik pracy",
  "today.openProfile": "Otwórz profil i umiejętności",
  "today.openNeed": "Zgłoś zapotrzebowanie na ludzi",
  "need.title": "Zgłoś zapotrzebowanie",
  "need.intro": "Zapotrzebowanie na pracowników dla organizacji, w imieniu której działasz. Sprawdzasz je przed utworzeniem; pracownicy, którzy mogą je zobaczyć, znajdą je na swojej tablicy.",
  "need.descriptionLabel": "Czego potrzebujesz?",
  "need.descriptionHint": "Własnymi słowami — jaka praca, kiedy, ile osób.",
  "need.roleLabel": "Rola",
  "need.locationLabel": "Miejsce",
  "need.teamSizeLabel": "Ile osób",
  "need.teamSizeHint": "Liczba całkowita",
  "need.urgencyLabel": "Jak pilne",
  "need.urgency.flexible": "Elastycznie",
  "need.urgency.this_week": "W tym tygodniu",
  "need.urgency.urgent": "Pilne",
  "need.descriptionRequired": "Napisz przynajmniej kilka słów o tym, czego potrzebujesz. Nic nie zostało wysłane.",
  "need.teamSizeInvalid": "Liczba osób musi być liczbą całkowitą od 1. Nic nie zostało wysłane.",
  "need.review": "Sprawdź przed utworzeniem",
  "need.cancel": "Wstecz",
  "need.previewTitle": "Sprawdź, zanim utworzysz",
  "need.previewBody": "Nic jeszcze nie zostało utworzone.",
  "need.actingFor": "Dla",
  "need.confirm": "Utwórz zapotrzebowanie",
  "need.edit": "Edytuj",
  "need.sentTitle": "Utworzono",
  "need.sentBody": "Zapotrzebowanie jest teraz otwarte dla organizacji. Możesz je śledzić na stronie.",
  "need.done": "Wróć do Dziś",
  "need.overLimit": "Ta organizacja osiągnęła limit aktywnych pozycji swojego planu. Nic nie zostało utworzone — zamknij zapotrzebowanie lub zmień plan na stronie.",
  "need.draftFailedTitle": "Nie udało się przygotować tego zapotrzebowania",
  "need.sendFailedTitle": "Nie udało się utworzyć tego zapotrzebowania",
  "today.openJobs": "Przeglądaj otwarte oferty",
  "jobs.title": "Oferty pracy",
  "jobs.intro": "Publiczna tablica ofert — te same ogłoszenia co na stronie. Pracodawca i sposób aplikowania otwierają się na stronie w Twoim imieniu.",
  "jobs.queryLabel": "Szukaj",
  "jobs.queryHint": "Zawód lub słowo z tytułu, w dowolnym języku",
  "jobs.search": "Szukaj ofert",
  "jobs.total": "Oferty",
  "jobs.page": "strona",
  "jobs.none": "Obecnie nie ma ofert pasujących do tego wyszukiwania.",
  "jobs.prev": "Poprzednia strona",
  "jobs.next": "Następna strona",
  "jobs.openWeb": "Otwórz pełne ogłoszenie",
  "jobs.positions": "Miejsca",
  "jobs.compensation": "Wynagrodzenie",
  "jobs.published": "Opublikowano",
  "jobs.untitled": "Oferta",
  "jobs.notProvisioned": "Tablica ofert nie jest włączona w tym środowisku.",
  "jobs.unavailable": "Tablica ofert nie odpowiedziała na czas. To nie znaczy, że nie ma ofert — spróbuj ponownie.",
  "jobs.linkedNotFound": "Tej oferty nie ma już na tablicy (mogła zostać zamknięta).",
  "today.openOpportunities": "Potrzeby otwarte dla Ciebie",
  "today.openAvailability": "Kto z Twojego zespołu jest wolny",
  "opportunities.title": "Możliwości",
  "opportunities.intro": "Potrzeby, które widzisz teraz. Wyrażenie zainteresowania pokazuje je właścicielowi potrzeby w jego własnym widoku — nic nie opuszcza platformy.",
  "opportunities.noneVisible": "Obecnie nie widzisz żadnej potrzeby. Gdy powiązana z Tobą organizacja ją otworzy, pojawi się tutaj.",
  "opportunities.express": "Jestem zainteresowany",
  "opportunities.noteLabel": "Wiadomość dla nich (opcjonalnie)",
  "opportunities.noteHint": "Jedno zdanie o tym, dlaczego lub kiedy — przeczytają je tak, jak zostało napisane.",
  "opportunities.draft": "Sprawdź przed wysłaniem",
  "opportunities.previewTitle": "Sprawdź, zanim wyślesz",
  "opportunities.previewBody": "Nic jeszcze nie zostało wysłane.",
  "opportunities.alreadyExpressed": "Zainteresowanie tą potrzebą zostało już wyrażone; ponowne wysłanie je odświeży.",
  "today.openOffers": "Oferty i zaproszenia dla Ciebie",
  "offers.title": "Oferty",
  "offers.reviewNotice": "Jeśli zaakceptujesz, przełożony w {organization} będzie mógł czytać pracę, którą dla niego zapisujesz, i ją zatwierdzić. Do tego czasu pozostaje to Twój własny wpis.",
  "offers.as": "Jako",
  "offers.relationship.collaborator": "współpracownik",
  "offers.relationship.consultant": "konsultant",
  "offers.relationship.employee": "pracownik",
  "offers.relationship.freelancer": "zleceniobiorca",
  "offers.relationship.manager": "kierownik",
  "offers.relationship.owner": "właściciel",
  "offers.relationship.student": "student",
  "offers.relationship.unemployed": "bezrobotny",
  "offers.relationship.volunteer": "wolontariusz",
  "offers.relationship.intern": "Praktykant",
  "offers.relationship.external_manager": "Kierownik zewnętrzny (zleceniodawca)",
  "offers.relationship.other": "Inny związek",
  "offers.intro": "Propozycje pracy i zaproszenia skierowane do Ciebie. Nic się nie zmienia, dopóki nie potwierdzisz odpowiedzi.",
  "offers.bookingsHeading": "Propozycje pracy",
  "offers.invitationsHeading": "Zaproszenia",
  "offers.noBookings": "Żadna propozycja pracy nie czeka na Twoją odpowiedź.",
  "offers.noInvitations": "Żadne zaproszenie nie czeka na Twoją odpowiedź.",
  "offers.untitledBooking": "Propozycja pracy",
  "offers.untitledInvitation": "Zaproszenie",
  "offers.from": "Od",
  "offers.dates": "Daty",
  "offers.answerBy": "Odpowiedz do",
  "offers.accept": "Przyjmij",
  "offers.decline": "Odrzuć",
  "offers.previewAcceptBooking": "Przyjąć tę propozycję pracy?",
  "offers.previewDeclineBooking": "Odrzucić tę propozycję pracy?",
  "offers.previewAcceptInvitation": "Przyjąć to zaproszenie?",
  "offers.previewBody": "To prawdziwa odpowiedź: druga strona ją zobaczy. Nic jeszcze nie zostało wysłane.",
  "offers.confirm": "Potwierdź odpowiedź",
  "offers.cancel": "Wstecz",
  "offers.doneTitle": "Twoja odpowiedź została zapisana",
  "offers.doneBody": "Druga strona już ją widzi.",
  "offers.backToList": "Wróć do ofert",
  "offers.prepareFailedTitle": "Nie udało się przygotować odpowiedzi",
  "offers.confirmFailedTitle": "Twoja odpowiedź nie została zapisana",
  "offers.clash": "Te daty pokrywają się z już przyjętą pracą. Otwórz propozycję na stronie, aby zobaczyć kolizję i tam zdecydować.",
  "offers.changed": "Ta oferta się zmieniła lub została już rozpatrzona. Wróć, aby zobaczyć aktualną listę.",
  "opportunities.confirm": "Wyślij",
  "opportunities.cancel": "Wstecz",
  "opportunities.sentTitle": "Wysłano",
  "opportunities.sentBody": "Właściciel tej potrzeby widzi teraz Twoje zainteresowanie w swoim widoku.",
  "opportunities.sentStatus": "Status",
  "opportunities.another": "Wróć do listy",
  "opportunities.notVisible": "Ta potrzeba nie jest już dla Ciebie widoczna (mogła zostać zamknięta).",
  "opportunities.draftFailedTitle": "Nie udało się przygotować",
  "opportunities.sendFailedTitle": "Nie udało się wysłać",
  "availability.title": "Kto jest wolny",
  "availability.intro": "Twój aktywny zespół na najbliższe 7 dni. Zajęty nie znaczy niedostępny: nakładanie się to ostrzeżenie, nie odmowa.",
  "availability.actingFor": "W imieniu",
  "availability.window": "Okres",
  "availability.rosterTotal": "Członkowie zespołu",
  "availability.state.free": "wolny",
  "availability.state.committed": "zajęty",
  "availability.state.unavailable": "niedostępny",
  "availability.notFreeUntil": "niewolny do",
  "availability.committedTo": "zajęty przy",
  "availability.overridable": "upoważniona osoba może zdecydować inaczej",
  "availability.sourcesPartial": "Nie wszystkie źródła odpowiedziały: nie udało się odczytać nieobecności lub zobowiązań, więc nikt tutaj nie jest z pewnością pokazany jako wolny.",
  "availability.personalWorkspace": "Jesteś w swojej przestrzeni osobistej. Przełącz się w Ustawieniach na przestrzeń organizacji, aby zobaczyć jej zespół.",
  "availability.noOrganization": "To konto nie należy do żadnej organizacji, więc nie ma zespołu, o którym można raportować.",
  "availability.noRoster": "Ta organizacja nie ma aktywnych członków zespołu, więc nie ma o kim raportować.",
  "availability.noCompanyContext": "Ta przestrzeń nie może działać jako pracodawca, więc nie ma zespołu, o którym można raportować.",
  "account.title": "Prywatność i konto",
  "account.body":
    "Te strony otwierają się w przeglądarce, na stronie internetowej. Prośbę o Twoje dane lub o usunięcie konta składasz tam, w sekcji Prywatność.",
  "account.privacy": "Prywatność, Twoje dane i usunięcie konta",
  "account.terms": "Warunki korzystania z usługi",
  "account.privacyPolicy": "Polityka prywatności",
  "account.deletionInfo": "Jak działa usuwanie konta (bez logowania)",
  "account.support": "Skontaktuj się z pomocą (info@labourmarket.ai)",
  "account.external": "Przeglądarka",
  "account.openFailed": "Nie udało się otworzyć linku na tym telefonie. Nic nie zostało zmienione.",
};

export const MESSAGES: Record<ActiveLocale, Catalogue> = { en, lt, ru, nl, de, pl };

export const LANGUAGE_NAMES: Record<ActiveLocale, string> = {
  // Each language named in itself — a person looking for their own language
  // recognises it faster than a translated label.
  lt: "Lietuvių",
  en: "English",
  ru: "Русский",
  nl: "Nederlands",
  de: "Deutsch",
  pl: "Polski",
};
