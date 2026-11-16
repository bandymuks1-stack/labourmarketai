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
 * The seven locales here are exactly the ACTIVE set (doctrine §2.4 / the web
 * app's `activeLocales`). The other four exist in the platform's catalogues but
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
  "cv.workTitle": "Work history",
  "cv.workEmpty": "No work history yet.",
  "cv.workUntitled": "Work",
  "cv.now": "now",
  "cv.addWork": "Add work",
  "cv.languagesTitle": "Languages",
  "cv.languagesEmpty": "No languages yet.",
  "cv.levelNative": "Native",
  "cv.addLanguage": "Add a language",
  "cv.save": "Save",
  "cv.cancel": "Back",
  "cv.saveFailedTitle": "We could not save this",
  "cv.work.title": "Add work",
  "cv.work.titleLabel": "What was the work?",
  "cv.work.startLabel": "Start year",
  "cv.work.endLabel": "End year",
  "cv.work.ongoing": "I still work here",
  "cv.work.titleRequired": "Write what the work was, at least 3 characters. Nothing was saved.",
  "cv.work.yearInvalid": "Enter the start year as four digits. Nothing was saved.",
  "cv.work.endInvalid": "Enter an end year, not before the start year, or mark that you still work here. Nothing was saved.",
  "cv.language.title": "Add a language",
  "cv.language.languageLabel": "Language",
  "cv.language.levelLabel": "Level",
  "cv.language.chooseBoth": "Choose a language and a level. Nothing was saved.",
  "cv.educationTitle": "Education",
  "cv.educationEmpty": "No education yet.",
  "cv.addEducation": "Add education",
  "cv.education.title": "Add education",
  "cv.education.institutionLabel": "School or institution",
  "cv.education.programLabel": "Programme or field",
  "cv.education.typeLabel": "Type",
  "cv.education.ongoing": "I still study here",
  "cv.education.institutionRequired": "Write the name of the school or institution, at least 2 characters. Nothing was saved.",
  "cv.education.typeRequired": "Choose the type of education. Nothing was saved.",
  "cv.education.yearsInvalid": "Enter years as four digits, the end not before the start. Nothing was saved.",
  "today.openCandidates": "Find candidates",
  "candidates.title": "Find candidates",
  "candidates.noNeeds": "No open needs yet.",
  "candidates.untitledNeed": "Need",
  "candidates.interested": "Interested",
  "candidates.shortlisted": "Shortlisted",
  "candidates.open": "Show candidates",
  "candidates.allNeeds": "All needs",
  "candidates.found": "Candidates",
  "candidates.none": "No candidates for this need yet.",
  "candidates.onShortlist": "On the shortlist",
  "candidates.confirmTitle": "Add to the shortlist?",
  "candidates.confirmBody": "Only your organization sees its shortlist. Nothing is sent to the person.",
  "candidates.confirm": "Add",
  "candidates.shortlist": "Shortlist",
  "candidates.notStructured": "This need has nothing to match on yet. Add the work type or skills to it on the web.",
  "booking.propose": "Propose a booking",
  "booking.cannotContact": "Contact is not possible yet.",
  "booking.startLabel": "Start date",
  "booking.endLabel": "End date",
  "booking.noteLabel": "Note to the person",
  "booking.review": "Review",
  "booking.dateInvalid": "Enter dates as YYYY-MM-DD, the end not before the start. Nothing was sent.",
  "booking.confirmTitle": "Send this booking proposal?",
  "booking.confirmBody": "The person sees it in their offers and answers there.",
  "booking.confirm": "Send",
  "booking.sent": "Proposal sent.",
  "booking.failedTitle": "We could not send this proposal",
  "needs.close": "Close need",
  "needs.reopen": "Reopen need",
  "needs.closeTitle": "Close this need?",
  "needs.closeBody": "It leaves the worker board. Its candidates and shortlist are kept.",
  "needs.reopenTitle": "Reopen this need?",
  "needs.reopenBody": "It returns to the worker board.",
  "needs.closedLabel": "Closed",
  "candidates.match.strong": "Strong fit",
  "candidates.match.possible": "Possible fit",
  "candidates.match.weak": "Weak fit",
  "candidates.match.insufficient_data": "Not enough data",
  "cv.educationType.primary": "Primary school",
  "cv.educationType.secondary": "Secondary school",
  "cv.educationType.vocational": "Vocational",
  "cv.educationType.college": "College",
  "cv.educationType.university_bachelor": "University (Bachelor)",
  "cv.educationType.university_master": "University (Master)",
  "cv.educationType.doctorate": "Doctorate",
  "cv.educationType.course_certificate": "Course / certificate",
  "cv.educationType.other": "Other",
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

  "auth.checking": "Tikriname jūsų seansą…",
  "auth.signIn.title": "Prisijungti",
  "auth.signIn.email": "El. paštas",
  "auth.signIn.password": "Slaptažodis",
  "auth.signIn.submit": "Prisijungti",
  "auth.signIn.toRegister": "Sukurti paskyrą",
  "auth.register.title": "Sukurti paskyrą",
  "auth.register.submit": "Sukurti paskyrą",
  "auth.register.toSignIn": "Jau turiu paskyrą",
  "auth.signIn.forgot": "Pamiršote slaptažodį?",
  "auth.register.legal":
    "Sukurti paskyrą reiškia sutikti su naudojimo sąlygomis ir privatumo politika.",
  "auth.error.rejected": "Toks el. paštas ir slaptažodis nesutampa.",
  "auth.error.unreachable":
    "Nepavyko pasiekti serverio, todėl nežinome, ar duomenys teisingi. Patikrinkite ryšį ir bandykite dar kartą.",
  "auth.error.confirmationRequired":
    "Paskyra sukurta. Patvirtinkite nuorodą el. laiške ir tada prisijunkite.",
  "auth.error.notConfigured":
    "Ši versija neturi serverio konfigūracijos, todėl prijungti negali.",
  "auth.signOut": "Atsijungti",

  "account.title": "Privatumas ir paskyra",
  "account.body":
    "Šios nuorodos atidaromos naršyklėje, svetainėje. Savo duomenų arba paskyros ištrynimo prašymas pateikiamas ten, skiltyje „Privatumas“.",
  "account.privacy": "Privatumas, jūsų duomenys ir paskyros ištrynimas",
  "account.terms": "Naudojimo sąlygos",
  "account.privacyPolicy": "Privatumo politika",
  "account.deletionInfo": "Kaip ištrinama paskyra (prisijungti nereikia)",
  "account.support": "Susisiekti su pagalba (info@labourmarket.ai)",
  "account.external": "Naršyklė",
  "account.openFailed": "Nuorodos šiame telefone atidaryti nepavyko. Niekas nepakeista.",

  "session.unavailable.title": "Nepavyko patikrinti jūsų seanso",
  "session.unavailable.body":
    "Tai nereiškia, kad atsijungėte — telefono saugykla neatsakė. Bandykite dar kartą.",
  "session.unavailable.retry": "Bandyti dar kartą",

  "route.notFound.title": "Tokio ekrano šioje programėlėje nėra",
  "route.notFound.body":
    "Nuoroda, kuria atėjote, čia niekur neveda. Ji gali būti skirta svetainei arba būti pasenusi. Niekas niekur nebuvo išsiųsta.",
  "route.notFound.action": "Grįžti į programėlę",

  "crash.title": "Programėlėje įvyko klaida",
  "crash.body":
    "Tai pačios programėlės klaida, ne jūsų veiksmas, ir niekas niekur nebuvo išsiųsta. Bandykite dar kartą — jei kartojasi, uždarykite programėlę ir atidarykite iš naujo.",

  "config.problem.title": "Ši versija nesukonfigūruota",
  "config.problem.body":
    "Programa negali pasileisti, kol nenustatytos šios reikšmės. Jokie duomenys niekur nebuvo išsiųsti.",

  "workspace.title": "Veikiate kaip",
  "workspace.loading": "Skaitome jūsų darbo erdves…",
  "workspace.active": "Aktyvi",
  "workspace.switching": "Keičiama…",
  "workspace.failed.title": "Nepavyko perskaityti jūsų darbo erdvių",
  "workspace.failed.body":
    "Tai nepavykęs skaitymas, o ne atsakymas: tai nereiškia, kad nepriklausote jokiai organizacijai. Pabandykite po akimirkos.",
  "workspace.pointerUnavailable":
    "Tai apskaičiuota iš to, kam priklausote, o ne jūsų išsaugotas pasirinkimas, ir kol kas čia to pakeisti negalima.",
  "workspace.switchFailed": "Darbo erdvė nepakeista. Niekas neperkelta.",
  "context.loading": "Skaitome jūsų roles…",
  "context.active": "Aktyvi",
  "context.none": "Šioje paskyroje kol kas neįrašyta nė viena dalyvavimo rolė. Tai perskaitėme — ne programėlės klaida.",
  "context.title": "Dirbate kaip",
  "context.unavailable.title": "Kol kas negalime parodyti jūsų kontekstų",
  "context.unavailable.body":
    "Programa gali jus prijungti, bet dar negali nuskaityti, kurioms organizacijoms priklausote. Jūsų paskyroje nieko netrūksta — tiesiog ši programa dar negali to paklausti.",
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
  "domain.unavailable.signInAgain": "Prisijunkite iš naujo.",
  "domain.unavailable.offline": "Nėra ryšio. Niekas nebuvo išsiųsta.",
  "domain.unavailable.unexpectedAnswer":
    "Serveris atsakė tuo, ko ši programa nesuprato.",
  "domain.refused.no_credentials": "Prisijunkite iš naujo.",
  "domain.refused.invalid_token": "Jūsų seansas baigėsi. Prisijunkite iš naujo.",
  "domain.refused.no_profile": "Ši paskyra dar neturi profilio.",
  "domain.refused.not_authorized":
    "Serveris atmetė šią užklausą šiai paskyrai.",
  "domain.refused.rate_limited":
    "Serveris paprašė programos sulėtėti. Bandykite po akimirkos.",
  "domain.refused.capability": "Serveris atmetė šią užklausą.",
  "domain.refused.identity_unavailable":
    "Nepavyko patvirtinti, kas esate. Tai nėra atsisakymas — bandykite dar kartą.",

  "today.signedInAs": "Prisijungta kaip",
  "today.recentWork": "Naujausi darbai",
  "journal.empty": "Darbo dienoraštyje dar nėra įrašų.",
  "journal.logWork": "Įrašyti darbą",
  "journal.compose.title": "Įrašyti darbą",
  "journal.compose.intro":
    "Aprašykite savais žodžiais, ką nuveikėte. Darbo dienoraštis užfiksuos būtent tai, ką parašysite.",
  "journal.compose.date": "Darbo data",
  "journal.compose.dateHint": "Metai-mėnuo-diena, pavyzdžiui 2026-09-01",
  "journal.compose.today": "Šiandien",
  "journal.compose.yesterday": "Vakar",
  "journal.compose.notes": "Ką nuveikėte",
  "journal.compose.notesHint":
    "Savais žodžiais. Laikas ir vietos rašomi taip pat čia.",
  "journal.compose.site": "Objektas arba vieta (nebūtina)",
  "journal.compose.context": "Darbo kontekstas",
  "journal.compose.contextUnnamed": "Nenurodyta",
  "journal.compose.review": "Peržiūrėti prieš įrašant",
  "journal.compose.previewTitle": "Patikrinkite prieš įrašant",
  "journal.compose.previewNothingSaved":
    "Kol kas niekas neįrašyta. Bus užfiksuota būtent tai.",
  "journal.compose.save": "Įrašyti į darbo dienoraštį",
  "journal.compose.edit": "Pakeisti",
  "journal.compose.chooseContext": "Kuriam darbui tai priklauso?",
  "journal.compose.chooseContextBody":
    "Šis įrašas gali priklausyti daugiau nei vienam jūsų darbo kontekstui, todėl niekas neparuošta ir niekas neįrašyta. Pasirinkite vieną.",
  "journal.compose.savedTitle": "Įrašyta į darbo dienoraštį",
  "journal.compose.savedBody":
    "Tai jau užfiksuotas įrašas. Serveris išsaugojo būtent tai.",
  "journal.compose.another": "Įrašyti dar vieną",
  "journal.compose.backToJournal": "Grįžti į dienoraštį",
  "journal.compose.checkThis": "Pirmiausia patikrinkite",
  "journal.compose.invalidDate":
    "Datą rašykite metai-mėnuo-diena, pavyzdžiui 2026-09-01. Niekas nebuvo išsiųsta.",
  "journal.compose.futureDate":
    "Darbo data negali būti ateityje — žurnalo įrašas fiksuoja darbą, kuris jau įvyko. Niekas nebuvo išsiųsta.",
  "journal.compose.notesRequired":
    "Prieš įrašant aprašykite, ką nuveikėte. Niekas nebuvo išsiųsta.",
  "journal.compose.draftFailedTitle": "Nepavyko paruošti šio įrašo",
  "journal.compose.saveFailedTitle": "Nepavyko įrašyti šio įrašo",
  "journal.compose.staleDraft":
    "Neįrašyta: po paruošimo jūsų dienoraštis pasikeitė, todėl patikra nebegalioja. Peržiūrėkite dar kartą.",
  "journal.compose.noContext":
    "Ši paskyra neturi aktyvaus darbo konteksto, todėl įrašui nėra kur atsidurti. Pirmiausia svetainėje nurodykite, kur dirbate, o tada įrašykite darbą čia.",
  "journal.compose.unsureSaved":
    "Ryšys nutrūko jau išsiuntus, todėl nežinome, ar įrašas pasiekė serverį. Prieš rašant iš naujo atsidarykite darbo dienoraštį ir patikrinkite. Bandymas dar kartą dublikato nesukurs.",
  "journal.compose.skillsAdded": "Nauji užfiksuoti įgūdžiai",
  "journal.compose.skillsStrengthened": "Įgūdžiai su naujais įrodymais",
  "journal.compose.skillsClaims": "Iš jūsų žodžių pastebėti gebėjimai",
  "journal.compose.skillsReview": "Laukia jūsų peržiūros",
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
    "Pakeiskite tai, kas neteisinga – žodžius, dieną ar vietą. Ankstesnė versija lieka jūsų istorijoje; sumos skaičiuoja pataisytą.",
  "journal.correct.nothingChanged":
    "Kol kas niekas nepakeista. Pirmiausia pataisykite žodžius, dieną ar vietą.",
  "journal.correct.previewTitle":
    "Patikrinkite pataisymą prieš įrašant",
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
    "Jūsų dienoraštis ir sumos dabar rodo pataisytą versiją.",
  "journal.correct.savedConfirmedBody":
    "Pataisyta versija įrašyta ir laukia vadovo patvirtinimo; ankstesnė patvirtinta versija lieka jūsų istorijoje.",
  "journal.correct.draftFailedTitle":
    "Nepavyko paruošti pataisymo",
  "journal.correct.saveFailedTitle":
    "Nepavyko įrašyti pataisymo",
  "journal.correct.unsureSaved":
    "Pataisymas išsiųstas, bet atsakymas negrįžo, todėl nežinome, ar jis įrašytas. Bandyti dar kartą saugu: jau įrašytas pataisymas atmetamas, dvigubai neįrašomas.",
  "journal.correct.staleDraft":
    "Neįrašyta: po pataisymo paruošimo jūsų dienoraštis pasikeitė. Peržiūrėkite dar kartą.",
  "journal.correct.superseded":
    "Šis įrašas jau pataisytas arba pašalintas. Atidarykite dienoraštį iš naujo ir taisykite dabartinę versiją.",
  "journal.correct.notFound":
    "Šio įrašo nėra tarp naujausių jūsų dienoraščio įrašų. Galbūt jis jau pataisytas.",
  "journal.correct.conflict":
    "Nauji žodžiai nurodo vieną trukmę visam įrašui, bet įraše dar yra atliktas kiekis, o abiem reikia to paties lauko. Nurodykite laiką kiekvienai veiklai arba pataisykite įrašą svetainėje.",
  "journal.correct.missingTitle":
    "Šio įrašo čia pataisyti negalima",
  "today.openMessages":
    "Žinutės",
  "messages.title":
    "Žinutės",
  "messages.conversation":
    "Pokalbis",
  "messages.intro":
    "Jūsų pokalbiai LabourMarket.ai viduje. Žinutės lieka programėlėje – nieko nesiunčiame el. paštu ar SMS. Naujos žinutės matomos atidarius šį ekraną.",
  "messages.none":
    "Kol kas neturite pokalbių.",
  "messages.untitled":
    "Pokalbis",
  "messages.threadEmpty":
    "Šiame pokalbyje dar nėra žinučių.",
  "messages.fromMe":
    "Jūs",
  "messages.fromThem":
    "Pašnekovas",
  "messages.replyLabel":
    "Jūsų atsakymas",
  "messages.review":
    "Peržiūrėti prieš siunčiant",
  "messages.emptyBody":
    "Pirmiausia parašykite žinutę.",
  "messages.previewTitle":
    "Patikrinkite prieš siunčiant",
  "messages.previewNothingSent":
    "Kol kas niekas neišsiųsta. Būtent šį tekstą matys kitas žmogus.",
  "messages.send":
    "Siųsti",
  "messages.sentTitle":
    "Išsiųsta",
  "messages.sentBody":
    "Jūsų žinutė yra pokalbyje.",
  "messages.sentUnverified":
    "Serveris žinutę priėmė, bet nuskaityta ji nesutapo. Atidarykite pokalbį iš naujo ir patikrinkite.",
  "messages.writeAnother":
    "Rašyti kitą žinutę",
  "messages.draftFailedTitle":
    "Nepavyko paruošti žinutės",
  "messages.sendFailedTitle":
    "Nepavyko išsiųsti žinutės",
  "messages.unsureSent":
    "Žinutė išsiųsta, bet atsakymas negrįžo, todėl nežinome, ar ji pasiekė. Prieš siunčiant antrą kartą, atidarykite pokalbį iš naujo.",
  "messages.staleDraft":
    "Neišsiųsta: jums ruošiant atsakymą, pokalbyje atsirado nauja žinutė. Perskaitykite ją ir peržiūrėkite atsakymą dar kartą.",
  "messages.notFound":
    "Šis pokalbis nėra jūsų arba jo nebėra.",
  "messages.noPermission":
    "Šiame pokalbyje rašyti negalite.",
  "today.openNotifications":
    "Pranešimai",
  "notifications.title":
    "Pranešimai",
  "notifications.intro":
    "Kas nutiko jūsų darbe – naujausi viršuje. Atidarius pranešimas pažymimas kaip perskaitytas. Pranešimai į telefoną nesiunčiami – jie matomi čia, atidarius šį ekraną.",
  "notifications.none":
    "Pranešimų neturite.",
  "notifications.unread":
    "Nauja",
  "notifications.markAll":
    "Pažymėti visus kaip perskaitytus",
  "notifications.markFailedTitle":
    "Nepavyko pažymėti kaip perskaityto",
  "notifications.type.unknown":
    "Pranešimas",
  "notifications.type.event_absence_approved":
    "Jūsų neatvykimas patvirtintas",
  "notifications.type.event_absence_rejected":
    "Jūsų neatvykimas atmestas",
  "notifications.type.event_absence_requested":
    "Jums užregistruotas neatvykimas",
  "notifications.type.event_booking_accepted":
    "Jūsų rezervacijos pasiūlymas priimtas",
  "notifications.type.event_booking_declined":
    "Jūsų rezervacijos pasiūlymas atmestas",
  "notifications.type.event_booking_proposed":
    "Gavote rezervacijos pasiūlymą",
  "notifications.type.event_booking_withdrawn":
    "Rezervacijos pasiūlymas atšauktas",
  "notifications.type.event_demand_interest_expressed":
    "Darbuotojas pareiškė susidomėjimą jūsų poreikiu",
  "notifications.type.event_demand_interest_reviewed":
    "Įmonė pažymėjo jūsų susidomėjimą kaip peržiūrėtą",
  "notifications.type.event_document_ack_assigned":
    "Jūsų paprašyta patvirtinti, kad perskaitėte dokumentą.",
  "notifications.type.event_document_ack_completed":
    "Dokumentas, kurį siuntėte patvirtinti, buvo patvirtintas.",
  "notifications.type.event_document_expiring":
    "Netrukus baigsis dokumento galiojimas.",
  "notifications.type.event_engagement_created":
    "Sukurtas naujas bendradarbiavimas",
  "notifications.type.event_engagement_ended":
    "Darbo santykis baigtas",
  "notifications.type.event_history_link_offered":
    "Organizacija pasiūlė susieti jūsų užfiksuotą darbo istoriją su jūsų paskyra",
  "notifications.type.event_invitation_accepted":
    "Kažkas priėmė jūsų kvietimą",
  "notifications.type.event_job_alert":
    "Atsirado naujas darbas pagal jūsų paieškos kriterijus",
  "notifications.type.event_journal_review_decided":
    "Jūsų darbo žurnalo įrašas peržiūrėtas",
  "notifications.type.event_journal_review_decided_approved":
    "Jūsų darbo žurnalo įrašas patvirtintas",
  "notifications.type.event_journal_review_decided_changes_requested":
    "Paprašyta pakeisti jūsų darbo žurnalo įrašą",
  "notifications.type.event_journal_review_decided_rejected":
    "Jūsų darbo žurnalo įrašas atmestas",
  "notifications.type.event_message_received":
    "Gavote naują žinutę",
  "notifications.type.event_saved_search_match":
    "Jūsų išsaugotoje paieškoje yra naujų rezultatų",
  "notifications.type.event_weekly_digest":
    "Paruošta jūsų savaitės darbo ir galimybių apžvalga",
  "notifications.type.event_weekly_digest_journal":
    "Paruošta jūsų savaitės darbo žurnalo apžvalga",
  "notifications.type.event_weekly_digest_profile_completion":
    "Norint pamatyti jums tinkamus darbus, patvirtinkite, kokį darbą dirbate",
  "notifications.type.event_work_task_assigned":
    "Jums priskirta užduotis",
  "notifications.type.event_workflow_decided":
    "Dėl jūsų tvirtinimo prašymo priimtas sprendimas",
  "notifications.type.event_workflow_delegated":
    "Jums perduotas tvirtinimo etapas",
  "notifications.type.event_workflow_escalated":
    "Tvirtinimo etapas viršijo terminą",
  "notifications.type.event_workflow_step_pending":
    "Tvirtinimo prašymas laukia jūsų sprendimo",
  "today.openProjects":
    "Mano projektai",
  "projects.title":
    "Mano projektai",
  "projects.detailTitle":
    "Projektas",
  "projects.none":
    "Jums nepriskirtas joks projektas.",
  "projects.active":
    "Aktyvus",
  "projects.ended":
    "Baigtas",
  "projects.asksCount":
    "Dar reikia iš jūsų",
  "projects.moreOnWeb":
    "Čia rodomi tik pirmieji jūsų projektai. Svetainėje matysite visus.",
  "projects.notFound":
    "Šis projektas nėra jūsų arba jo nėra tarp čia rodomų projektų.",
  "projects.asksTitle":
    "Dar reikia iš jūsų",
  "projects.asksShownOf":
    "Rodoma čia / iš viso dar atvira – visas sąrašas svetainėje",
  "projects.asksUnavailable":
    "Šiuo metu nepavyko nuskaityti, ko dar reikia iš jūsų. Bandykite dar kartą arba atidarykite projektą svetainėje.",
  "projects.asksNotRead":
    "Šis priskyrimas baigtas. Kas jame buvo prašyta iš jūsų, matysite projekto puslapyje svetainėje.",
  "projects.asksIncomplete":
    "Jūsų projektuose atvira daugiau, nei programėlė gali išvardyti, todėl šio projekto dalis gali būti neparodyta. Visas sąrašas – projekto puslapyje svetainėje.",
  "projects.asksNone":
    "Šiame projekte jums nieko neliko atlikti.",
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
    "Pokalbis dar neparodytas. Palaukite, kol jis įsikels, perskaitykite jį ir tada peržiūrėkite savo atsakymą.",
  "messages.newBeforeReview":
    "Šiame pokalbyje atėjo nauja žinutė. Ji jau rodoma aukščiau – perskaitykite ją ir dar kartą peržiūrėkite savo atsakymą.",
  "profile.noWorkerProfile": "Ši paskyra dar neturi darbuotojo profilio.",
  "profile.figuresTitle": "Įgūdžiai su jūsų užrašytomis valandomis",
  "profile.groupManagerConfirmed": "Vadovo patvirtinta",
  "profile.groupJournalBacked": "Paremta jūsų darbo dienoraščiu",
  "profile.groupDeclared": "Jūsų nurodyta",
  "profile.figuresUnavailable":
    "Valandų, dalies ir įrašų šį kartą perskaityti nepavyko. Įgūdžiai žemiau vis tiek yra jūsų užfiksuoti įgūdžiai — niekas nerodoma kaip 0.",
  "profile.figuresLegend":
    "Valandos · dalis iš įgūdžiams priskirtų valandų · įrašai, per visą laiką. Tie patys skaičiai kaip svetainėje.",
  "profile.figuresNotRead": "skaičių perskaityti nepavyko",
  "profile.noFigures": "užrašytų valandų nėra",
  "profile.involvedUnattributed": "dalyvavo; laikas nepriskirtas vien šiam įgūdžiui",
  "profile.hoursShort": "val.",
  "profile.entriesLabel": "įr.",
  "profile.selfStatedMissing":
    "Gebėjimai, kuriuos užrašėte savais žodžiais, į šį ekraną dar neperkeliami; svetainė juos rodo prie jūsų įgūdžių.",
  "profile.openJournal": "Atidaryti darbo dienoraštį",
  "cv.workTitle": "Darbo patirtis",
  "cv.workEmpty": "Darbo patirties dar nėra.",
  "cv.workUntitled": "Darbas",
  "cv.now": "dabar",
  "cv.addWork": "Pridėti darbą",
  "cv.languagesTitle": "Kalbos",
  "cv.languagesEmpty": "Kalbų dar nėra.",
  "cv.levelNative": "Gimtoji",
  "cv.addLanguage": "Pridėti kalbą",
  "cv.save": "Išsaugoti",
  "cv.cancel": "Atgal",
  "cv.saveFailedTitle": "Nepavyko išsaugoti",
  "cv.work.title": "Pridėti darbą",
  "cv.work.titleLabel": "Koks tai buvo darbas?",
  "cv.work.startLabel": "Pradžios metai",
  "cv.work.endLabel": "Pabaigos metai",
  "cv.work.ongoing": "Vis dar dirbu čia",
  "cv.work.titleRequired": "Parašykite, koks tai buvo darbas, bent 3 simboliai. Niekas neišsaugota.",
  "cv.work.yearInvalid": "Įveskite pradžios metus keturiais skaitmenimis. Niekas neišsaugota.",
  "cv.work.endInvalid": "Įveskite pabaigos metus, ne ankstesnius už pradžios, arba pažymėkite, kad vis dar dirbate. Niekas neišsaugota.",
  "cv.language.title": "Pridėti kalbą",
  "cv.language.languageLabel": "Kalba",
  "cv.language.levelLabel": "Lygis",
  "cv.language.chooseBoth": "Pasirinkite kalbą ir lygį. Niekas neišsaugota.",
  "cv.educationTitle": "Išsilavinimas",
  "cv.educationEmpty": "Išsilavinimo dar nėra.",
  "cv.addEducation": "Pridėti išsilavinimą",
  "cv.education.title": "Pridėti išsilavinimą",
  "cv.education.institutionLabel": "Mokykla ar įstaiga",
  "cv.education.programLabel": "Programa ar sritis",
  "cv.education.typeLabel": "Tipas",
  "cv.education.ongoing": "Vis dar mokausi čia",
  "cv.education.institutionRequired": "Parašykite mokyklos ar įstaigos pavadinimą, bent 2 simboliai. Niekas neišsaugota.",
  "cv.education.typeRequired": "Pasirinkite išsilavinimo tipą. Niekas neišsaugota.",
  "cv.education.yearsInvalid": "Įveskite metus keturiais skaitmenimis, pabaiga ne ankstesnė už pradžią. Niekas neišsaugota.",
  "today.openCandidates": "Rasti kandidatų",
  "candidates.title": "Rasti kandidatų",
  "candidates.noNeeds": "Atvirų poreikių dar nėra.",
  "candidates.untitledNeed": "Poreikis",
  "candidates.interested": "Susidomėję",
  "candidates.shortlisted": "Atrinkti",
  "candidates.open": "Rodyti kandidatus",
  "candidates.allNeeds": "Visi poreikiai",
  "candidates.found": "Kandidatai",
  "candidates.none": "Šiam poreikiui kandidatų dar nėra.",
  "candidates.onShortlist": "Atrinktųjų sąraše",
  "candidates.confirmTitle": "Įtraukti į atrinktųjų sąrašą?",
  "candidates.confirmBody": "Atrinktųjų sąrašą mato tik jūsų organizacija. Žmogui niekas nesiunčiama.",
  "candidates.confirm": "Įtraukti",
  "candidates.shortlist": "Atrinkti",
  "candidates.notStructured": "Šis poreikis dar neturi duomenų atitikimui. Pridėkite darbo tipą ar įgūdžius svetainėje.",
  "booking.propose": "Pasiūlyti užsakymą",
  "booking.cannotContact": "Susisiekti dar negalima.",
  "booking.startLabel": "Pradžios data",
  "booking.endLabel": "Pabaigos data",
  "booking.noteLabel": "Pastaba žmogui",
  "booking.review": "Peržiūrėti",
  "booking.dateInvalid": "Įveskite datas formatu MMMM-MM-DD, pabaiga ne ankstesnė už pradžią. Niekas neišsiųsta.",
  "booking.confirmTitle": "Išsiųsti šį užsakymo pasiūlymą?",
  "booking.confirmBody": "Žmogus jį matys savo pasiūlymuose ir ten atsakys.",
  "booking.confirm": "Siųsti",
  "booking.sent": "Pasiūlymas išsiųstas.",
  "booking.failedTitle": "Nepavyko išsiųsti šio pasiūlymo",
  "needs.close": "Uždaryti poreikį",
  "needs.reopen": "Atnaujinti poreikį",
  "needs.closeTitle": "Uždaryti šį poreikį?",
  "needs.closeBody": "Jis dings iš darbuotojų lentos. Kandidatai ir atrinktųjų sąrašas išliks.",
  "needs.reopenTitle": "Atnaujinti šį poreikį?",
  "needs.reopenBody": "Jis grįš į darbuotojų lentą.",
  "needs.closedLabel": "Uždarytas",
  "candidates.match.strong": "Stipri atitiktis",
  "candidates.match.possible": "Galima atitiktis",
  "candidates.match.weak": "Silpna atitiktis",
  "candidates.match.insufficient_data": "Per mažai duomenų",
  "cv.educationType.primary": "Pradinis",
  "cv.educationType.secondary": "Vidurinis",
  "cv.educationType.vocational": "Profesinis",
  "cv.educationType.college": "Kolegija",
  "cv.educationType.university_bachelor": "Universitetas (bakalauras)",
  "cv.educationType.university_master": "Universitetas (magistras)",
  "cv.educationType.doctorate": "Doktorantūra",
  "cv.educationType.course_certificate": "Kursai / pažymėjimas",
  "cv.educationType.other": "Kita",
  "journal.openProfile": "Kiek šie įrašai sudaro — jūsų profilyje",

  "today.figuresTitle": "Jūsų veikla skaičiais",
  "today.periodToday": "Šiandien",
  "today.periodWeek": "Paskutinės 7 dienos",
  "today.hoursLabel": "Valandos",
  "today.daysUnitLabel": "užrašyta dienomis",
  "today.entriesLabel": "Įrašai",
  "today.daysLabel": "Dienos",
  "today.confirmedLabel": "Vadovo patvirtinta, val.",
  "today.periodEmpty": "Šiame lange nieko neužrašyta.",
  "today.periodMissing": "Serveris šiam langui skaičiaus neatsiuntė.",
  "today.dominantTitle": "Didžiausia jūsų valandų dalis per 7 dienas",
  "today.dominantShare": "iš įgūdžiams priskirtų valandų",
  "today.dominantNone":
    "Per paskutines 7 dienas nė vienam įgūdžiui valandos nepriskirtos.",
  "today.coverageTruncated":
    "Šie skaičiai remiasi paskutiniais perskaitytais įrašais — senesni įrašai neįtraukti.",
  "today.figuresScope":
    "Iš jūsų darbo dienoraščio įrašų, pagal tą pačią taisyklę kaip svetainėje. Kalendorinės dienos baigiasi šiandien (UTC).",
  "today.openJournal": "Atidaryti darbo dienoraštį",
  "today.openProfile": "Atidaryti profilį ir įgūdžius",
  "today.openNeed": "Paskelbti poreikį žmonėms",
  "need.title": "Paskelbti poreikį",
  "need.intro": "Darbuotojų poreikis organizacijai, už kurią veikiate. Prieš sukuriant peržiūrite; darbuotojai, kurie gali jį matyti, randa jį savo lentoje.",
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
  "need.descriptionRequired": "Parašykite bent kelis žodžius apie tai, ko reikia. Niekas neišsiųsta.",
  "need.teamSizeInvalid": "Žmonių skaičius turi būti sveikas skaičius nuo 1. Niekas neišsiųsta.",
  "need.review": "Peržiūrėti prieš kuriant",
  "need.cancel": "Atgal",
  "need.previewTitle": "Patikrinkite prieš sukuriant",
  "need.previewBody": "Dar niekas nesukurta.",
  "need.actingFor": "Kam",
  "need.confirm": "Sukurti poreikį",
  "need.edit": "Taisyti",
  "need.sentTitle": "Sukurta",
  "need.sentBody": "Poreikis dabar atviras organizacijai. Sekti galite svetainėje.",
  "need.done": "Grįžti į Šiandien",
  "need.overLimit": "Ši organizacija pasiekė savo plano aktyvių pozicijų ribą. Niekas nesukurta — uždarykite poreikį arba pakeiskite planą svetainėje.",
  "need.draftFailedTitle": "Nepavyko paruošti šio poreikio",
  "need.sendFailedTitle": "Nepavyko sukurti šio poreikio",
  "today.openJobs": "Naršyti atvirus darbus",
  "jobs.title": "Darbai",
  "jobs.intro": "Viešas darbo skelbimų sąrašas — tie patys skelbimai kaip svetainėje. Darbdavys ir kaip kandidatuoti atsidaro svetainėje jūsų vardu.",
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
  "jobs.unavailable": "Darbo skelbimų sąrašas neatsakė laiku. Tai nereiškia, kad darbų nėra — pabandykite dar kartą.",
  "jobs.linkedNotFound": "Šio skelbimo sąraše nebėra (galbūt jis uždarytas).",
  "today.openOpportunities": "Jums atviri poreikiai",
  "today.openAvailability": "Kas iš jūsų komandos laisvas",
  "opportunities.title": "Galimybės",
  "opportunities.intro": "Poreikiai, kuriuos matote dabar. Susidomėjimas parodomas poreikio savininkui jo paties rodinyje — niekas neišeina už platformos ribų.",
  "opportunities.noneVisible": "Šiuo metu jums nematomas joks poreikis. Kai su jumis susieta organizacija atvers poreikį, jis atsiras čia.",
  "opportunities.express": "Man įdomu",
  "opportunities.noteLabel": "Žinutė jiems (nebūtina)",
  "opportunities.noteHint": "Sakinys apie tai, kodėl arba kada — jie skaito taip, kaip parašyta.",
  "opportunities.draft": "Peržiūrėti prieš siunčiant",
  "opportunities.previewTitle": "Patikrinkite prieš siunčiant",
  "opportunities.previewBody": "Dar niekas neišsiųsta.",
  "opportunities.alreadyExpressed": "Susidomėjimą šiuo poreikiu jau išreiškėte; siunčiant dar kartą jis atnaujinamas.",
  "today.openOffers": "Jums skirti pasiūlymai ir kvietimai",
  "offers.title": "Pasiūlymai",
  "offers.reviewNotice": "Jei sutiksite, {organization} vadovas galės skaityti jūsų šiai įmonei užfiksuotą darbą, jį peržiūrėti ir pažymėti. Kol to nepadaro, tai lieka jūsų įrašas.",
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
  "offers.intro": "Jums skirti darbo pasiūlymai ir kvietimai. Niekas nepasikeičia, kol nepatvirtinate savo atsakymo.",
  "offers.bookingsHeading": "Darbo pasiūlymai",
  "offers.invitationsHeading": "Kvietimai",
  "offers.noBookings": "Nėra darbo pasiūlymų, laukiančių jūsų atsakymo.",
  "offers.noInvitations": "Nėra kvietimų, laukiančių jūsų atsakymo.",
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
  "offers.doneTitle": "Jūsų atsakymas užfiksuotas",
  "offers.doneBody": "Kita pusė jį jau mato.",
  "offers.backToList": "Atgal į pasiūlymus",
  "offers.prepareFailedTitle": "Šio atsakymo nepavyko paruošti",
  "offers.confirmFailedTitle": "Jūsų atsakymas neužfiksuotas",
  "offers.clash": "Šios datos kertasi su jau priimtu darbu. Atidarykite pasiūlymą svetainėje, peržiūrėkite susikirtimą ir nuspręskite ten.",
  "offers.changed": "Šis pasiūlymas pasikeitė arba į jį jau atsakyta. Grįžkite atgal ir peržiūrėkite dabartinį sąrašą.",
  "opportunities.confirm": "Siųsti",
  "opportunities.cancel": "Atgal",
  "opportunities.sentTitle": "Išsiųsta",
  "opportunities.sentBody": "Šio poreikio savininkas dabar mato jūsų susidomėjimą savo rodinyje.",
  "opportunities.sentStatus": "Būsena",
  "opportunities.another": "Grįžti į sąrašą",
  "opportunities.notVisible": "Šio poreikio nebematote (galbūt jis uždarytas).",
  "opportunities.draftFailedTitle": "Nepavyko paruošti",
  "opportunities.sendFailedTitle": "Nepavyko išsiųsti",
  "availability.title": "Kas laisvas",
  "availability.intro": "Jūsų aktyvi komanda artimiausias 7 dienas. Įsipareigojęs nereiškia neprieinamas: persidengimas yra įspėjimas, ne atsisakymas.",
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
  "availability.personalWorkspace": "Esate savo asmeninėje erdvėje. Nustatymuose perjunkite į organizacijos erdvę, kad matytumėte jos komandą.",
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
  "cv.workTitle": "Опыт работы",
  "cv.workEmpty": "Опыта работы пока нет.",
  "cv.workUntitled": "Работа",
  "cv.now": "сейчас",
  "cv.addWork": "Добавить работу",
  "cv.languagesTitle": "Языки",
  "cv.languagesEmpty": "Языков пока нет.",
  "cv.levelNative": "Родной",
  "cv.addLanguage": "Добавить язык",
  "cv.save": "Сохранить",
  "cv.cancel": "Назад",
  "cv.saveFailedTitle": "Не удалось сохранить",
  "cv.work.title": "Добавить работу",
  "cv.work.titleLabel": "Что это была за работа?",
  "cv.work.startLabel": "Год начала",
  "cv.work.endLabel": "Год окончания",
  "cv.work.ongoing": "Я работаю здесь сейчас",
  "cv.work.titleRequired": "Напишите, что это была за работа, не менее 3 символов. Ничего не сохранено.",
  "cv.work.yearInvalid": "Введите год начала четырьмя цифрами. Ничего не сохранено.",
  "cv.work.endInvalid": "Введите год окончания, не раньше года начала, или отметьте, что работаете здесь сейчас. Ничего не сохранено.",
  "cv.language.title": "Добавить язык",
  "cv.language.languageLabel": "Язык",
  "cv.language.levelLabel": "Уровень",
  "cv.language.chooseBoth": "Выберите язык и уровень. Ничего не сохранено.",
  "cv.educationTitle": "Образование",
  "cv.educationEmpty": "Образования пока нет.",
  "cv.addEducation": "Добавить образование",
  "cv.education.title": "Добавить образование",
  "cv.education.institutionLabel": "Учебное заведение",
  "cv.education.programLabel": "Программа или специальность",
  "cv.education.typeLabel": "Тип",
  "cv.education.ongoing": "Я учусь здесь сейчас",
  "cv.education.institutionRequired": "Напишите название учебного заведения, не менее 2 символов. Ничего не сохранено.",
  "cv.education.typeRequired": "Выберите тип образования. Ничего не сохранено.",
  "cv.education.yearsInvalid": "Введите годы четырьмя цифрами, окончание не раньше начала. Ничего не сохранено.",
  "today.openCandidates": "Найти кандидатов",
  "candidates.title": "Найти кандидатов",
  "candidates.noNeeds": "Открытых потребностей пока нет.",
  "candidates.untitledNeed": "Потребность",
  "candidates.interested": "Заинтересованы",
  "candidates.shortlisted": "В шорт-листе",
  "candidates.open": "Показать кандидатов",
  "candidates.allNeeds": "Все потребности",
  "candidates.found": "Кандидаты",
  "candidates.none": "Для этой потребности кандидатов пока нет.",
  "candidates.onShortlist": "В шорт-листе",
  "candidates.confirmTitle": "Добавить в шорт-лист?",
  "candidates.confirmBody": "Шорт-лист видит только ваша организация. Человеку ничего не отправляется.",
  "candidates.confirm": "Добавить",
  "candidates.shortlist": "В шорт-лист",
  "candidates.notStructured": "Для этой потребности пока не с чем сравнивать. Добавьте тип работы или навыки на сайте.",
  "booking.propose": "Предложить бронирование",
  "booking.cannotContact": "Связаться пока нельзя.",
  "booking.startLabel": "Дата начала",
  "booking.endLabel": "Дата окончания",
  "booking.noteLabel": "Записка для человека",
  "booking.review": "Проверить",
  "booking.dateInvalid": "Введите даты в формате ГГГГ-ММ-ДД, окончание не раньше начала. Ничего не отправлено.",
  "booking.confirmTitle": "Отправить это предложение?",
  "booking.confirmBody": "Человек увидит его в своих предложениях и ответит там.",
  "booking.confirm": "Отправить",
  "booking.sent": "Предложение отправлено.",
  "booking.failedTitle": "Не удалось отправить это предложение",
  "needs.close": "Закрыть потребность",
  "needs.reopen": "Открыть заново",
  "needs.closeTitle": "Закрыть эту потребность?",
  "needs.closeBody": "Она исчезнет с доски для работников. Кандидаты и шорт-лист сохранятся.",
  "needs.reopenTitle": "Открыть эту потребность заново?",
  "needs.reopenBody": "Она вернётся на доску для работников.",
  "needs.closedLabel": "Закрыта",
  "candidates.match.strong": "Сильное соответствие",
  "candidates.match.possible": "Возможное соответствие",
  "candidates.match.weak": "Слабое соответствие",
  "candidates.match.insufficient_data": "Недостаточно данных",
  "cv.educationType.primary": "Начальное",
  "cv.educationType.secondary": "Среднее",
  "cv.educationType.vocational": "Профессиональное",
  "cv.educationType.college": "Колледж",
  "cv.educationType.university_bachelor": "Университет (бакалавр)",
  "cv.educationType.university_master": "Университет (магистр)",
  "cv.educationType.doctorate": "Докторантура",
  "cv.educationType.course_certificate": "Курсы / сертификат",
  "cv.educationType.other": "Другое",
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

  "auth.checking": "We controleren uw sessie…",
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
    "We konden de server niet bereiken, dus we weten niet of deze gegevens kloppen. Controleer uw verbinding en probeer het opnieuw.",
  "auth.error.confirmationRequired":
    "Uw account is aangemaakt. Bevestig de link in uw e-mail en log daarna in.",
  "auth.error.notConfigured":
    "Deze versie heeft geen serverconfiguratie en kan daarom niemand inloggen.",
  "auth.signOut": "Uitloggen",

  "account.title": "Privacy en account",
  "account.body":
    "Deze links openen in uw browser, op de website. Uw gegevens opvragen of uw account laten verwijderen doet u daar, onder Privacy.",
  "account.privacy": "Privacy, uw gegevens en uw account verwijderen",
  "account.terms": "Gebruiksvoorwaarden",
  "account.privacyPolicy": "Privacybeleid",
  "account.deletionInfo": "Hoe het verwijderen van een account werkt (inloggen niet nodig)",
  "account.support": "Contact met support (info@labourmarket.ai)",
  "account.external": "Browser",
  "account.openFailed": "De link kon op deze telefoon niet worden geopend. Er is niets gewijzigd.",

  "session.unavailable.title": "We konden uw sessie niet controleren",
  "session.unavailable.body":
    "Dit betekent niet dat u bent uitgelogd — de beveiligde opslag van uw telefoon gaf geen antwoord. Probeer het opnieuw.",
  "session.unavailable.retry": "Opnieuw proberen",

  "route.notFound.title": "Dat scherm bestaat niet in deze app",
  "route.notFound.body":
    "De link die u volgde leidt hier nergens heen. Misschien is hij voor de website bedoeld, of is hij verouderd. Er is niets verstuurd.",
  "route.notFound.action": "Terug naar de app",

  "crash.title": "De app liep vast",
  "crash.body":
    "Dit is een fout in de app zelf, niet iets wat u deed, en er is niets verstuurd. Probeer het opnieuw — als het blijft gebeuren, sluit de app en open hem opnieuw.",

  "config.problem.title": "Deze versie is niet geconfigureerd",
  "config.problem.body":
    "De app kan niet starten totdat deze waarden zijn ingesteld. Er zijn geen gegevens verstuurd.",

  "workspace.title": "Handelt namens",
  "workspace.loading": "Uw werkruimtes worden gelezen…",
  "workspace.active": "Actief",
  "workspace.switching": "Wisselen…",
  "workspace.failed.title": "We konden uw werkruimtes niet lezen",
  "workspace.failed.body":
    "Dit is een mislukte leesactie, geen antwoord: het betekent niet dat u bij geen enkele organisatie hoort. Probeer het zo opnieuw.",
  "workspace.pointerUnavailable":
    "Dit is afgeleid uit waar u bij hoort, niet een keuze die voor u is bewaard, en het kan hier nog niet gewijzigd worden.",
  "workspace.switchFailed": "De werkruimte is niet gewijzigd. Er is niets verplaatst.",
  "context.loading": "Uw rollen worden gelezen…",
  "context.active": "Actief",
  "context.none": "Voor dit account is nog geen deelnamerol vastgelegd. Dat is wat we gelezen hebben — geen fout in de app.",
  "context.title": "U werkt als",
  "context.unavailable.title": "We kunnen uw contexten nog niet tonen",
  "context.unavailable.body":
    "De app kan u inloggen, maar kan nog niet lezen bij welke organisaties u hoort. Er ontbreekt niets in uw account — deze client kan het alleen nog niet opvragen.",
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
  "domain.refused.invalid_token": "Uw sessie is verlopen. Log opnieuw in.",
  "domain.refused.no_profile": "Dit account heeft nog geen profiel.",
  "domain.refused.not_authorized":
    "De server weigerde dit verzoek voor dit account.",
  "domain.refused.rate_limited":
    "De server vroeg deze app om te vertragen. Probeer het zo opnieuw.",
  "domain.refused.capability": "De server weigerde dit verzoek.",
  "domain.refused.identity_unavailable":
    "We konden niet bevestigen wie u bent. Dit is geen weigering — probeer het opnieuw.",

  "today.signedInAs": "Ingelogd als",
  "today.recentWork": "Recent werk",
  "journal.empty": "Nog geen werkdagboek-items vastgelegd.",
  "journal.logWork": "Werk vastleggen",
  "journal.compose.title": "Werk vastleggen",
  "journal.compose.intro":
    "Schrijf in uw eigen woorden op wat u heeft gedaan. Uw werkdagboek legt precies dat vast.",
  "journal.compose.date": "Datum van het werk",
  "journal.compose.dateHint": "Jaar-maand-dag, bijvoorbeeld 2026-09-01",
  "journal.compose.today": "Vandaag",
  "journal.compose.yesterday": "Gisteren",
  "journal.compose.notes": "Wat u heeft gedaan",
  "journal.compose.notesHint":
    "In uw eigen woorden. Tijden en plaatsen horen hier ook.",
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
    "Dit item kan bij meer dan één van uw werkcontexten horen, dus er is niets voorbereid en niets opgeslagen. Kies er één.",
  "journal.compose.savedTitle": "Opgeslagen in uw werkdagboek",
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
    "Schrijf op wat u heeft gedaan voordat u opslaat. Er is niets verstuurd.",
  "journal.compose.draftFailedTitle": "We konden dit item niet voorbereiden",
  "journal.compose.saveFailedTitle": "We konden dit item niet opslaan",
  "journal.compose.staleDraft":
    "Niet opgeslagen: uw dagboek is veranderd nadat dit was voorbereid, dus de controle is verouderd. Controleer het opnieuw.",
  "journal.compose.noContext":
    "Dit account heeft geen actieve werkcontext, dus een item kan nergens worden vastgelegd. Geef eerst op de website aan waar u werkt en leg hier daarna werk vast.",
  "journal.compose.unsureSaved":
    "De verbinding viel weg nadat dit was verstuurd, dus we weten niet of het is aangekomen. Open uw werkdagboek om te controleren voordat u het opnieuw schrijft. Opnieuw proberen kan geen dubbel item maken.",
  "journal.compose.skillsAdded": "Nieuw vastgelegde vaardigheden",
  "journal.compose.skillsStrengthened": "Vaardigheden met nieuw bewijs",
  "journal.compose.skillsClaims": "Capaciteiten opgemerkt uit uw woorden",
  "journal.compose.skillsReview": "Wacht op uw beoordeling",
  "journal.compose.noCvChange":
    "Uit dit item is niets nieuws aan uw Living CV toegevoegd.",
  "journal.compose.skillsPartial":
    "Een deel van de Living CV-update is niet afgerond. Het item zelf is opgeslagen.",
  "journal.compose.skillsFailed":
    "De Living CV-update is deze keer niet uitgevoerd. Het item zelf is opgeslagen.",
  "journal.compose.reviewOnWeb":
    "Wat op beoordeling wacht, bevestigt u op de website.",
  "profile.skillsEmpty": "Nog geen vaardigheden vastgelegd.",
  "journal.correct.action":
    "Deze invoer corrigeren",
  "journal.correct.title":
    "Invoer corrigeren",
  "journal.correct.intro":
    "Wijzig wat niet klopt: de tekst, de dag of de locatie. De vorige versie blijft in uw geschiedenis; uw totalen tellen de gecorrigeerde.",
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
    "Uw logboek en uw totalen tonen nu de gecorrigeerde versie.",
  "journal.correct.savedConfirmedBody":
    "De gecorrigeerde versie is opgeslagen en wacht op bevestiging door een leidinggevende; de eerder bevestigde versie blijft in uw geschiedenis.",
  "journal.correct.draftFailedTitle":
    "We konden deze correctie niet voorbereiden",
  "journal.correct.saveFailedTitle":
    "We konden deze correctie niet opslaan",
  "journal.correct.unsureSaved":
    "De correctie is verstuurd maar er kwam geen antwoord, dus we weten niet of ze is opgeslagen. Opnieuw proberen is veilig: een correctie die al is opgeslagen wordt geweigerd, nooit dubbel opgeslagen.",
  "journal.correct.staleDraft":
    "Niet opgeslagen: uw logboek is gewijzigd nadat de correctie was voorbereid. Bekijk het opnieuw.",
  "journal.correct.superseded":
    "Deze invoer is al gecorrigeerd of verwijderd. Open het logboek opnieuw en corrigeer de huidige versie.",
  "journal.correct.notFound":
    "Deze invoer staat niet bij uw laatste logboekinvoer. Misschien is ze al gecorrigeerd.",
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
    "Uw gesprekken binnen LabourMarket.ai. Berichten blijven in de app — er wordt niets per e-mail of sms verstuurd. Nieuwe berichten ziet u als u dit scherm opent.",
  "messages.none":
    "U heeft nog geen gesprekken.",
  "messages.untitled":
    "Gesprek",
  "messages.threadEmpty":
    "Nog geen berichten in dit gesprek.",
  "messages.fromMe":
    "U",
  "messages.fromThem":
    "De ander",
  "messages.replyLabel":
    "Uw antwoord",
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
    "Uw bericht staat in het gesprek.",
  "messages.sentUnverified":
    "De server heeft uw bericht aangenomen, maar bij het teruglezen kwam het niet overeen. Open het gesprek opnieuw om het te controleren.",
  "messages.writeAnother":
    "Nog een bericht schrijven",
  "messages.draftFailedTitle":
    "We konden dit bericht niet voorbereiden",
  "messages.sendFailedTitle":
    "We konden dit bericht niet versturen",
  "messages.unsureSent":
    "Het bericht is verstuurd maar er kwam geen antwoord, dus we weten niet of het is aangekomen. Open het gesprek opnieuw voordat u het nog eens verstuurt.",
  "messages.staleDraft":
    "Niet verstuurd: er kwam een nieuw bericht in dit gesprek nadat u het uwe had voorbereid. Lees het en bekijk uw antwoord opnieuw.",
  "messages.notFound":
    "Dit gesprek is niet van u of bestaat niet meer.",
  "messages.noPermission":
    "U mag niet in dit gesprek schrijven.",
  "today.openNotifications":
    "Meldingen",
  "notifications.title":
    "Meldingen",
  "notifications.intro":
    "Wat er in uw werk is gebeurd, nieuwste eerst. Openen markeert een melding als gelezen. Meldingen worden niet naar uw telefoon gepusht — ze staan hier wanneer u dit scherm opent.",
  "notifications.none":
    "U heeft geen meldingen.",
  "notifications.unread":
    "Nieuw",
  "notifications.markAll":
    "Alles als gelezen markeren",
  "notifications.markFailedTitle":
    "We konden dit niet als gelezen markeren",
  "notifications.type.unknown":
    "Een melding",
  "notifications.type.event_absence_approved":
    "Uw afwezigheid is goedgekeurd",
  "notifications.type.event_absence_rejected":
    "Uw afwezigheid is afgewezen",
  "notifications.type.event_absence_requested":
    "Er is een afwezigheid voor u geregistreerd",
  "notifications.type.event_booking_accepted":
    "Uw boekingsvoorstel is geaccepteerd",
  "notifications.type.event_booking_declined":
    "Uw boekingsvoorstel is afgewezen",
  "notifications.type.event_booking_proposed":
    "U heeft een boekingsvoorstel ontvangen",
  "notifications.type.event_booking_withdrawn":
    "Het boekingsvoorstel is ingetrokken",
  "notifications.type.event_demand_interest_expressed":
    "Een werknemer heeft interesse getoond in uw aanvraag",
  "notifications.type.event_demand_interest_reviewed":
    "Een bedrijf heeft uw interesse als bekeken gemarkeerd",
  "notifications.type.event_document_ack_assigned":
    "U bent gevraagd te bevestigen dat u een document heeft gelezen.",
  "notifications.type.event_document_ack_completed":
    "Een document dat u ter bevestiging stuurde, is bevestigd.",
  "notifications.type.event_document_expiring":
    "De geldigheid van een document loopt binnenkort af.",
  "notifications.type.event_engagement_created":
    "Er is een nieuwe samenwerking aangemaakt",
  "notifications.type.event_engagement_ended":
    "De samenwerking is beëindigd",
  "notifications.type.event_history_link_offered":
    "Een organisatie biedt aan uw geregistreerde werkgeschiedenis aan uw account te koppelen",
  "notifications.type.event_invitation_accepted":
    "Iemand heeft uw uitnodiging aangenomen",
  "notifications.type.event_job_alert":
    "Er is een nieuwe baan die bij uw zoekopdracht past",
  "notifications.type.event_journal_review_decided":
    "Uw journaalitem is beoordeeld",
  "notifications.type.event_journal_review_decided_approved":
    "Uw journaalitem is bevestigd",
  "notifications.type.event_journal_review_decided_changes_requested":
    "Er zijn wijzigingen gevraagd voor uw journaalitem",
  "notifications.type.event_journal_review_decided_rejected":
    "Uw journaalitem is afgewezen",
  "notifications.type.event_message_received":
    "U heeft een nieuw bericht",
  "notifications.type.event_saved_search_match":
    "Een opgeslagen zoekopdracht heeft nieuwe resultaten",
  "notifications.type.event_weekly_digest":
    "Uw wekelijkse samenvatting van werk en kansen staat klaar",
  "notifications.type.event_weekly_digest_journal":
    "Het weekoverzicht van uw werkjournaal is klaar",
  "notifications.type.event_weekly_digest_profile_completion":
    "Om u passende banen te tonen, bevestig welk werk u doet",
  "notifications.type.event_work_task_assigned":
    "Er is een taak aan u toegewezen",
  "notifications.type.event_workflow_decided":
    "Over uw goedkeuringsverzoek is beslist",
  "notifications.type.event_workflow_delegated":
    "Een goedkeuringsronde is aan u overgedragen",
  "notifications.type.event_workflow_escalated":
    "Een goedkeuringsronde heeft haar termijn overschreden",
  "notifications.type.event_workflow_step_pending":
    "Een goedkeuringsverzoek wacht op uw beslissing",
  "today.openProjects":
    "Mijn projecten",
  "projects.title":
    "Mijn projecten",
  "projects.detailTitle":
    "Project",
  "projects.none":
    "U bent aan geen enkel project toegewezen.",
  "projects.active":
    "Actief",
  "projects.ended":
    "Beëindigd",
  "projects.asksCount":
    "Nog nodig van u",
  "projects.moreOnWeb":
    "Hier staan alleen uw eerste projecten. De website toont ze allemaal.",
  "projects.notFound":
    "Dit project is niet van u, of het staat niet bij de projecten die hier worden getoond.",
  "projects.asksTitle":
    "Nog nodig van u",
  "projects.asksShownOf":
    "Hier getoond / in totaal nog open — de volledige lijst staat op de website",
  "projects.asksUnavailable":
    "Wat er nog van u nodig is, kon nu niet worden gelezen. Probeer het opnieuw of open het project op de website.",
  "projects.asksNotRead":
    "Deze toewijzing is beëindigd. Wat er daarbij van u werd gevraagd, staat op de projectpagina op de website.",
  "projects.asksIncomplete":
    "Er staat in uw projecten meer open dan de app kan tonen, dus het deel van dit project wordt mogelijk niet getoond. De projectpagina op de website heeft de volledige lijst.",
  "projects.asksNone":
    "Voor u staat er op dit project niets open.",
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
    "Het gesprek staat nog niet op het scherm. Wacht tot het geladen is, lees het en bekijk dan uw antwoord.",
  "messages.newBeforeReview":
    "Er is een nieuw bericht in dit gesprek binnengekomen. Het staat nu hierboven — lees het en bekijk uw antwoord opnieuw.",
  "profile.noWorkerProfile": "Dit account heeft nog geen werkersprofiel.",
  "profile.figuresTitle": "Vaardigheden, met uw vastgelegde uren",
  "profile.groupManagerConfirmed": "Bevestigd door een leidinggevende",
  "profile.groupJournalBacked": "Onderbouwd door uw werkdagboek",
  "profile.groupDeclared": "Door u opgegeven",
  "profile.figuresUnavailable":
    "Uren, aandeel en items konden deze keer niet worden gelezen. De vaardigheden hieronder zijn nog steeds uw vastgelegde vaardigheden — niets wordt als 0 getoond.",
  "profile.figuresLegend":
    "Uren · aandeel van de aan een vaardigheid toegekende uren · items, alle tijd. Dezelfde cijfers als op de website.",
  "profile.figuresNotRead": "cijfers konden niet worden gelezen",
  "profile.noFigures": "geen vastgelegde uren",
  "profile.involvedUnattributed": "betrokken; tijd niet alleen aan deze vaardigheid toegeschreven",
  "profile.hoursShort": "u",
  "profile.entriesLabel": "items",
  "profile.selfStatedMissing":
    "Vaardigheden die u in uw eigen woorden noteerde, komen nog niet op dit scherm; de website toont ze bij uw vaardigheden.",
  "profile.openJournal": "Werkdagboek openen",
  "cv.workTitle": "Werkervaring",
  "cv.workEmpty": "Nog geen werkervaring.",
  "cv.workUntitled": "Werk",
  "cv.now": "nu",
  "cv.addWork": "Werk toevoegen",
  "cv.languagesTitle": "Talen",
  "cv.languagesEmpty": "Nog geen talen.",
  "cv.levelNative": "Moedertaal",
  "cv.addLanguage": "Taal toevoegen",
  "cv.save": "Opslaan",
  "cv.cancel": "Terug",
  "cv.saveFailedTitle": "We konden dit niet opslaan",
  "cv.work.title": "Werk toevoegen",
  "cv.work.titleLabel": "Wat voor werk was het?",
  "cv.work.startLabel": "Beginjaar",
  "cv.work.endLabel": "Eindjaar",
  "cv.work.ongoing": "Ik werk hier nog",
  "cv.work.titleRequired": "Schrijf wat het werk was, minstens 3 tekens. Er is niets opgeslagen.",
  "cv.work.yearInvalid": "Vul het beginjaar in met vier cijfers. Er is niets opgeslagen.",
  "cv.work.endInvalid": "Vul een eindjaar in, niet vóór het beginjaar, of geef aan dat u hier nog werkt. Er is niets opgeslagen.",
  "cv.language.title": "Taal toevoegen",
  "cv.language.languageLabel": "Taal",
  "cv.language.levelLabel": "Niveau",
  "cv.language.chooseBoth": "Kies een taal en een niveau. Er is niets opgeslagen.",
  "cv.educationTitle": "Opleiding",
  "cv.educationEmpty": "Nog geen opleiding.",
  "cv.addEducation": "Opleiding toevoegen",
  "cv.education.title": "Opleiding toevoegen",
  "cv.education.institutionLabel": "School of instelling",
  "cv.education.programLabel": "Opleiding of vakgebied",
  "cv.education.typeLabel": "Soort",
  "cv.education.ongoing": "Ik studeer hier nog",
  "cv.education.institutionRequired": "Vul de naam van de school of instelling in, minstens 2 tekens. Er is niets opgeslagen.",
  "cv.education.typeRequired": "Kies de soort opleiding. Er is niets opgeslagen.",
  "cv.education.yearsInvalid": "Vul jaren in met vier cijfers, het einde niet vóór het begin. Er is niets opgeslagen.",
  "today.openCandidates": "Kandidaten zoeken",
  "candidates.title": "Kandidaten zoeken",
  "candidates.noNeeds": "Nog geen open behoeften.",
  "candidates.untitledNeed": "Behoefte",
  "candidates.interested": "Geïnteresseerd",
  "candidates.shortlisted": "Op de shortlist",
  "candidates.open": "Kandidaten tonen",
  "candidates.allNeeds": "Alle behoeften",
  "candidates.found": "Kandidaten",
  "candidates.none": "Nog geen kandidaten voor deze behoefte.",
  "candidates.onShortlist": "Op de shortlist",
  "candidates.confirmTitle": "Aan de shortlist toevoegen?",
  "candidates.confirmBody": "Alleen uw organisatie ziet haar shortlist. Er wordt niets naar de persoon gestuurd.",
  "candidates.confirm": "Toevoegen",
  "candidates.shortlist": "Op shortlist",
  "candidates.notStructured": "Deze behoefte heeft nog niets om op te matchen. Voeg op de website het soort werk of de vaardigheden toe.",
  "booking.propose": "Boeking voorstellen",
  "booking.cannotContact": "Contact is nog niet mogelijk.",
  "booking.startLabel": "Startdatum",
  "booking.endLabel": "Einddatum",
  "booking.noteLabel": "Bericht aan de persoon",
  "booking.review": "Bekijken",
  "booking.dateInvalid": "Vul datums in als JJJJ-MM-DD, het einde niet vóór het begin. Er is niets verstuurd.",
  "booking.confirmTitle": "Dit boekingsvoorstel versturen?",
  "booking.confirmBody": "De persoon ziet het bij zijn aanbiedingen en antwoordt daar.",
  "booking.confirm": "Versturen",
  "booking.sent": "Voorstel verstuurd.",
  "booking.failedTitle": "We konden dit voorstel niet versturen",
  "needs.close": "Behoefte sluiten",
  "needs.reopen": "Behoefte heropenen",
  "needs.closeTitle": "Deze behoefte sluiten?",
  "needs.closeBody": "Ze verdwijnt van het werkbord. De kandidaten en de shortlist blijven bewaard.",
  "needs.reopenTitle": "Deze behoefte heropenen?",
  "needs.reopenBody": "Ze komt terug op het werkbord.",
  "needs.closedLabel": "Gesloten",
  "candidates.match.strong": "Sterke fit",
  "candidates.match.possible": "Mogelijke fit",
  "candidates.match.weak": "Zwakke fit",
  "candidates.match.insufficient_data": "Niet genoeg data",
  "cv.educationType.primary": "Basisschool",
  "cv.educationType.secondary": "Middelbare school",
  "cv.educationType.vocational": "Vakopleiding (mbo)",
  "cv.educationType.college": "Hogeschool",
  "cv.educationType.university_bachelor": "Universiteit (bachelor)",
  "cv.educationType.university_master": "Universiteit (master)",
  "cv.educationType.doctorate": "Doctoraat",
  "cv.educationType.course_certificate": "Cursus / certificaat",
  "cv.educationType.other": "Overig",
  "journal.openProfile": "Wat deze items samen opleveren — op uw profiel",

  "today.figuresTitle": "Uw werk in cijfers",
  "today.periodToday": "Vandaag",
  "today.periodWeek": "Laatste 7 dagen",
  "today.hoursLabel": "Uren",
  "today.daysUnitLabel": "vastgelegd in dagen",
  "today.entriesLabel": "Items",
  "today.daysLabel": "Dagen",
  "today.confirmedLabel": "Bevestigd door een leidinggevende, u",
  "today.periodEmpty": "Niets vastgelegd in dit venster.",
  "today.periodMissing": "De server stuurde geen cijfer voor dit venster.",
  "today.dominantTitle": "Grootste aandeel van uw uren, laatste 7 dagen",
  "today.dominantShare": "van de aan een vaardigheid toegekende uren",
  "today.dominantNone":
    "In de laatste 7 dagen zijn geen uren aan één vaardigheid toegekend.",
  "today.coverageTruncated":
    "Deze cijfers berusten op de laatst gelezen items — oudere items zijn niet meegenomen.",
  "today.figuresScope":
    "Uit uw eigen werkdagboek-items, volgens dezelfde regel als de website. Kalenderdagen eindigen vandaag (UTC).",
  "today.openJournal": "Werkdagboek openen",
  "today.openProfile": "Profiel en vaardigheden openen",
  "today.openNeed": "Een behoefte aan mensen plaatsen",
  "need.title": "Behoefte plaatsen",
  "need.intro": "Een behoefte aan werkkrachten voor de organisatie namens welke u handelt. U controleert die voordat hij wordt aangemaakt; werkers die hem mogen zien, vinden hem op hun bord.",
  "need.descriptionLabel": "Wat heeft u nodig?",
  "need.descriptionHint": "In uw eigen woorden — het werk, wanneer, hoeveel mensen.",
  "need.roleLabel": "Rol",
  "need.locationLabel": "Plaats",
  "need.teamSizeLabel": "Hoeveel mensen",
  "need.teamSizeHint": "Een heel getal",
  "need.urgencyLabel": "Hoe dringend",
  "need.urgency.flexible": "Flexibel",
  "need.urgency.this_week": "Deze week",
  "need.urgency.urgent": "Dringend",
  "need.descriptionRequired": "Schrijf minstens een paar woorden over wat u nodig heeft. Er is niets verstuurd.",
  "need.teamSizeInvalid": "Het aantal mensen moet een heel getal vanaf 1 zijn. Er is niets verstuurd.",
  "need.review": "Controleren voor aanmaken",
  "need.cancel": "Terug",
  "need.previewTitle": "Controleer voordat u het aanmaakt",
  "need.previewBody": "Er is nog niets aangemaakt.",
  "need.actingFor": "Voor",
  "need.confirm": "Behoefte aanmaken",
  "need.edit": "Bewerken",
  "need.sentTitle": "Aangemaakt",
  "need.sentBody": "De behoefte staat nu open voor de organisatie. U kunt hem volgen op de website.",
  "need.done": "Terug naar Vandaag",
  "need.overLimit": "Deze organisatie heeft de limiet van actieve posities van haar plan bereikt. Er is niets aangemaakt — sluit een behoefte of wijzig het plan op de website.",
  "need.draftFailedTitle": "We konden deze behoefte niet voorbereiden",
  "need.sendFailedTitle": "We konden deze behoefte niet aanmaken",
  "today.openJobs": "Open vacatures bekijken",
  "jobs.title": "Vacatures",
  "jobs.intro": "Het openbare vacaturebord — dezelfde vacatures als op de website. De werkgever en hoe u reageert openen op de webpagina als uzelf.",
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
  "today.openOpportunities": "Behoeften die voor u openstaan",
  "today.openAvailability": "Wie van uw team is vrij",
  "opportunities.title": "Kansen",
  "opportunities.intro": "Behoeften die u nu kunt zien. Interesse tonen laat het de eigenaar van de behoefte in zijn eigen weergave zien — er verlaat niets het platform.",
  "opportunities.noneVisible": "Er is nu geen behoefte voor u zichtbaar. Zodra een organisatie waarmee u verbonden bent er een opent, verschijnt die hier.",
  "opportunities.express": "Ik heb interesse",
  "opportunities.noteLabel": "Een bericht voor hen (optioneel)",
  "opportunities.noteHint": "Eén zin over waarom of wanneer — zij lezen het zoals geschreven.",
  "opportunities.draft": "Controleren voor verzenden",
  "opportunities.previewTitle": "Controleer voor u verzendt",
  "opportunities.previewBody": "Er is nog niets verzonden.",
  "opportunities.alreadyExpressed": "U heeft al interesse getoond in deze behoefte; opnieuw verzenden vernieuwt die.",
  "today.openOffers": "Aanbiedingen en uitnodigingen voor u",
  "offers.title": "Aanbiedingen",
  "offers.reviewNotice": "Als u accepteert, kan een leidinggevende van {organization} het werk lezen dat u voor hen vastlegt en het aftekenen. Tot die tijd blijft het uw eigen vermelding.",
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
  "offers.intro": "Werkvoorstellen en uitnodigingen die aan u gericht zijn. Er verandert niets totdat u uw antwoord bevestigt.",
  "offers.bookingsHeading": "Werkvoorstellen",
  "offers.invitationsHeading": "Uitnodigingen",
  "offers.noBookings": "Er wachten geen werkvoorstellen op uw antwoord.",
  "offers.noInvitations": "Er wachten geen uitnodigingen op uw antwoord.",
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
  "offers.doneTitle": "Uw antwoord is vastgelegd",
  "offers.doneBody": "De andere kant ziet het nu.",
  "offers.backToList": "Terug naar aanbiedingen",
  "offers.prepareFailedTitle": "Dit antwoord kon niet worden voorbereid",
  "offers.confirmFailedTitle": "Uw antwoord is niet vastgelegd",
  "offers.clash": "Deze data overlappen met werk dat u al heeft geaccepteerd. Open het voorstel op de website om de overlap te zien en daar te beslissen.",
  "offers.changed": "Dit aanbod is gewijzigd of al beantwoord. Ga terug om de huidige lijst te zien.",
  "opportunities.confirm": "Verzenden",
  "opportunities.cancel": "Terug",
  "opportunities.sentTitle": "Verzonden",
  "opportunities.sentBody": "De eigenaar van deze behoefte ziet uw interesse nu in zijn eigen weergave.",
  "opportunities.sentStatus": "Status",
  "opportunities.another": "Terug naar de lijst",
  "opportunities.notVisible": "Die behoefte is niet meer zichtbaar voor u (mogelijk gesloten).",
  "opportunities.draftFailedTitle": "We konden dit niet voorbereiden",
  "opportunities.sendFailedTitle": "We konden dit niet verzenden",
  "availability.title": "Wie is vrij",
  "availability.intro": "Uw actieve team voor de komende 7 dagen. Toegezegd is niet onbeschikbaar: een overlap is een waarschuwing, geen weigering.",
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
  "availability.personalWorkspace": "U bent in uw persoonlijke ruimte. Schakel in Instellingen over naar een organisatieruimte om het team te zien.",
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
  "cv.workTitle": "Berufserfahrung",
  "cv.workEmpty": "Noch keine Berufserfahrung.",
  "cv.workUntitled": "Arbeit",
  "cv.now": "heute",
  "cv.addWork": "Arbeit hinzufügen",
  "cv.languagesTitle": "Sprachen",
  "cv.languagesEmpty": "Noch keine Sprachen.",
  "cv.levelNative": "Muttersprache",
  "cv.addLanguage": "Sprache hinzufügen",
  "cv.save": "Speichern",
  "cv.cancel": "Zurück",
  "cv.saveFailedTitle": "Wir konnten das nicht speichern",
  "cv.work.title": "Arbeit hinzufügen",
  "cv.work.titleLabel": "Was war die Arbeit?",
  "cv.work.startLabel": "Startjahr",
  "cv.work.endLabel": "Endjahr",
  "cv.work.ongoing": "Ich arbeite hier noch",
  "cv.work.titleRequired": "Schreiben Sie, was die Arbeit war, mindestens 3 Zeichen. Es wurde nichts gespeichert.",
  "cv.work.yearInvalid": "Geben Sie das Startjahr vierstellig ein. Es wurde nichts gespeichert.",
  "cv.work.endInvalid": "Geben Sie ein Endjahr ein, nicht vor dem Startjahr, oder markieren Sie, dass Sie hier noch arbeiten. Es wurde nichts gespeichert.",
  "cv.language.title": "Sprache hinzufügen",
  "cv.language.languageLabel": "Sprache",
  "cv.language.levelLabel": "Niveau",
  "cv.language.chooseBoth": "Wählen Sie eine Sprache und ein Niveau. Es wurde nichts gespeichert.",
  "cv.educationTitle": "Ausbildung",
  "cv.educationEmpty": "Noch keine Ausbildung.",
  "cv.addEducation": "Ausbildung hinzufügen",
  "cv.education.title": "Ausbildung hinzufügen",
  "cv.education.institutionLabel": "Schule oder Einrichtung",
  "cv.education.programLabel": "Studiengang oder Fachrichtung",
  "cv.education.typeLabel": "Art",
  "cv.education.ongoing": "Ich lerne hier noch",
  "cv.education.institutionRequired": "Geben Sie den Namen der Schule oder Einrichtung ein, mindestens 2 Zeichen. Es wurde nichts gespeichert.",
  "cv.education.typeRequired": "Wählen Sie die Art der Ausbildung. Es wurde nichts gespeichert.",
  "cv.education.yearsInvalid": "Geben Sie Jahre vierstellig ein, das Ende nicht vor dem Beginn. Es wurde nichts gespeichert.",
  "today.openCandidates": "Kandidaten finden",
  "candidates.title": "Kandidaten finden",
  "candidates.noNeeds": "Noch keine offenen Bedarfe.",
  "candidates.untitledNeed": "Bedarf",
  "candidates.interested": "Interessiert",
  "candidates.shortlisted": "Auf der Shortlist",
  "candidates.open": "Kandidaten anzeigen",
  "candidates.allNeeds": "Alle Bedarfe",
  "candidates.found": "Kandidaten",
  "candidates.none": "Noch keine Kandidaten für diesen Bedarf.",
  "candidates.onShortlist": "Auf der Shortlist",
  "candidates.confirmTitle": "Zur Shortlist hinzufügen?",
  "candidates.confirmBody": "Nur Ihre Organisation sieht ihre Shortlist. Der Person wird nichts gesendet.",
  "candidates.confirm": "Hinzufügen",
  "candidates.shortlist": "Auf die Shortlist",
  "candidates.notStructured": "Für diesen Bedarf gibt es noch nichts zum Abgleichen. Fügen Sie auf der Website die Art der Arbeit oder die Fähigkeiten hinzu.",
  "booking.propose": "Buchung vorschlagen",
  "booking.cannotContact": "Kontakt ist noch nicht möglich.",
  "booking.startLabel": "Startdatum",
  "booking.endLabel": "Enddatum",
  "booking.noteLabel": "Notiz an die Person",
  "booking.review": "Prüfen",
  "booking.dateInvalid": "Geben Sie Daten als JJJJ-MM-TT ein, das Ende nicht vor dem Beginn. Es wurde nichts gesendet.",
  "booking.confirmTitle": "Diesen Buchungsvorschlag senden?",
  "booking.confirmBody": "Die Person sieht ihn bei ihren Angeboten und antwortet dort.",
  "booking.confirm": "Senden",
  "booking.sent": "Vorschlag gesendet.",
  "booking.failedTitle": "Wir konnten diesen Vorschlag nicht senden",
  "needs.close": "Bedarf schließen",
  "needs.reopen": "Bedarf wieder öffnen",
  "needs.closeTitle": "Diesen Bedarf schließen?",
  "needs.closeBody": "Er verschwindet von der Stellenwand. Kandidaten und Shortlist bleiben erhalten.",
  "needs.reopenTitle": "Diesen Bedarf wieder öffnen?",
  "needs.reopenBody": "Er kehrt auf die Stellenwand zurück.",
  "needs.closedLabel": "Geschlossen",
  "candidates.match.strong": "Starke Eignung",
  "candidates.match.possible": "Mögliche Eignung",
  "candidates.match.weak": "Schwache Eignung",
  "candidates.match.insufficient_data": "Nicht genug Daten",
  "cv.educationType.primary": "Grundschule",
  "cv.educationType.secondary": "Sekundarschule",
  "cv.educationType.vocational": "Berufsausbildung",
  "cv.educationType.college": "Fachhochschule",
  "cv.educationType.university_bachelor": "Universität (Bachelor)",
  "cv.educationType.university_master": "Universität (Master)",
  "cv.educationType.doctorate": "Promotion",
  "cv.educationType.course_certificate": "Kurs / Zertifikat",
  "cv.educationType.other": "Sonstiges",
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
  "cv.workTitle": "Doświadczenie zawodowe",
  "cv.workEmpty": "Brak doświadczenia zawodowego.",
  "cv.workUntitled": "Praca",
  "cv.now": "obecnie",
  "cv.addWork": "Dodaj pracę",
  "cv.languagesTitle": "Języki",
  "cv.languagesEmpty": "Brak języków.",
  "cv.levelNative": "Ojczysty",
  "cv.addLanguage": "Dodaj język",
  "cv.save": "Zapisz",
  "cv.cancel": "Wstecz",
  "cv.saveFailedTitle": "Nie udało się zapisać",
  "cv.work.title": "Dodaj pracę",
  "cv.work.titleLabel": "Na czym polegała praca?",
  "cv.work.startLabel": "Rok rozpoczęcia",
  "cv.work.endLabel": "Rok zakończenia",
  "cv.work.ongoing": "Nadal tu pracuję",
  "cv.work.titleRequired": "Proszę opisać pracę, co najmniej 3 znaki. Nic nie zostało zapisane.",
  "cv.work.yearInvalid": "Proszę podać rok rozpoczęcia w postaci czterech cyfr. Nic nie zostało zapisane.",
  "cv.work.endInvalid": "Proszę podać rok zakończenia, nie wcześniejszy niż rok rozpoczęcia, albo zaznaczyć, że nadal tu Państwo pracują. Nic nie zostało zapisane.",
  "cv.language.title": "Dodaj język",
  "cv.language.languageLabel": "Język",
  "cv.language.levelLabel": "Poziom",
  "cv.language.chooseBoth": "Proszę wybrać język i poziom. Nic nie zostało zapisane.",
  "cv.educationTitle": "Wykształcenie",
  "cv.educationEmpty": "Brak wykształcenia.",
  "cv.addEducation": "Dodaj wykształcenie",
  "cv.education.title": "Dodaj wykształcenie",
  "cv.education.institutionLabel": "Szkoła lub instytucja",
  "cv.education.programLabel": "Kierunek lub dziedzina",
  "cv.education.typeLabel": "Rodzaj",
  "cv.education.ongoing": "Nadal się tu uczę",
  "cv.education.institutionRequired": "Proszę podać nazwę szkoły lub instytucji, co najmniej 2 znaki. Nic nie zostało zapisane.",
  "cv.education.typeRequired": "Proszę wybrać rodzaj wykształcenia. Nic nie zostało zapisane.",
  "cv.education.yearsInvalid": "Proszę podać lata w postaci czterech cyfr, koniec nie wcześniej niż początek. Nic nie zostało zapisane.",
  "today.openCandidates": "Znajdź kandydatów",
  "candidates.title": "Znajdź kandydatów",
  "candidates.noNeeds": "Brak otwartych zapotrzebowań.",
  "candidates.untitledNeed": "Zapotrzebowanie",
  "candidates.interested": "Zainteresowani",
  "candidates.shortlisted": "Na krótkiej liście",
  "candidates.open": "Pokaż kandydatów",
  "candidates.allNeeds": "Wszystkie zapotrzebowania",
  "candidates.found": "Kandydaci",
  "candidates.none": "Brak kandydatów dla tego zapotrzebowania.",
  "candidates.onShortlist": "Na krótkiej liście",
  "candidates.confirmTitle": "Dodać do krótkiej listy?",
  "candidates.confirmBody": "Krótką listę widzi tylko Państwa organizacja. Nic nie jest wysyłane do tej osoby.",
  "candidates.confirm": "Dodaj",
  "candidates.shortlist": "Na krótką listę",
  "candidates.notStructured": "To zapotrzebowanie nie ma jeszcze danych do dopasowania. Proszę dodać rodzaj pracy lub umiejętności na stronie.",
  "booking.propose": "Zaproponuj rezerwację",
  "booking.cannotContact": "Kontakt nie jest jeszcze możliwy.",
  "booking.startLabel": "Data rozpoczęcia",
  "booking.endLabel": "Data zakończenia",
  "booking.noteLabel": "Notatka dla tej osoby",
  "booking.review": "Sprawdź",
  "booking.dateInvalid": "Proszę podać daty w formacie RRRR-MM-DD, koniec nie wcześniej niż początek. Nic nie zostało wysłane.",
  "booking.confirmTitle": "Wysłać tę propozycję rezerwacji?",
  "booking.confirmBody": "Ta osoba zobaczy ją w swoich ofertach i tam odpowie.",
  "booking.confirm": "Wyślij",
  "booking.sent": "Propozycja wysłana.",
  "booking.failedTitle": "Nie udało się wysłać tej propozycji",
  "needs.close": "Zamknij zapotrzebowanie",
  "needs.reopen": "Otwórz ponownie",
  "needs.closeTitle": "Zamknąć to zapotrzebowanie?",
  "needs.closeBody": "Zniknie z tablicy dla pracowników. Kandydaci i krótka lista zostaną zachowani.",
  "needs.reopenTitle": "Otworzyć ponownie to zapotrzebowanie?",
  "needs.reopenBody": "Wróci na tablicę dla pracowników.",
  "needs.closedLabel": "Zamknięte",
  "candidates.match.strong": "Silne dopasowanie",
  "candidates.match.possible": "Możliwe dopasowanie",
  "candidates.match.weak": "Słabe dopasowanie",
  "candidates.match.insufficient_data": "Za mało danych",
  "cv.educationType.primary": "Szkoła podstawowa",
  "cv.educationType.secondary": "Szkoła średnia",
  "cv.educationType.vocational": "Szkoła zawodowa",
  "cv.educationType.college": "Kolegium / studium",
  "cv.educationType.university_bachelor": "Studia licencjackie",
  "cv.educationType.university_master": "Studia magisterskie",
  "cv.educationType.doctorate": "Doktorat",
  "cv.educationType.course_certificate": "Kurs / certyfikat",
  "cv.educationType.other": "Inne",
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

const sv: Catalogue = {
  "app.name": "LabourMarket.ai",

  "nav.today": "I dag",
  "nav.journal": "Arbetsjournal",
  "nav.profile": "Profil",
  "nav.settings": "Inställningar",

  "auth.checking": "Kontrollerar din session…",
  "auth.signIn.title": "Logga in",
  "auth.signIn.email": "E-post",
  "auth.signIn.password": "Lösenord",
  "auth.signIn.submit": "Logga in",
  "auth.signIn.toRegister": "Skapa ett konto",
  "auth.register.title": "Skapa ett konto",
  "auth.register.submit": "Skapa konto",
  "auth.register.toSignIn": "Jag har redan ett konto",
  "auth.signIn.forgot": "Har du glömt ditt lösenord?",
  "auth.register.legal":
    "Genom att skapa ett konto godkänner du användarvillkoren och integritetspolicyn.",
  "auth.error.rejected": "E-postadressen och lösenordet stämde inte överens.",
  "auth.error.unreachable":
    "Vi kunde inte nå servern, så vi vet inte om uppgifterna stämmer. Kontrollera din anslutning och försök igen.",
  "auth.error.confirmationRequired":
    "Ditt konto har skapats. Bekräfta länken i din e-post och logga sedan in.",
  "auth.error.notConfigured":
    "Den här versionen saknar serverkonfiguration och kan därför inte logga in någon.",
  "auth.signOut": "Logga ut",

  "account.title": "Integritet och konto",
  "account.body":
    "Dessa öppnas i din webbläsare, på webbplatsen. Där, under Integritet, begär du ut dina uppgifter eller ber om att ditt konto raderas.",
  "account.privacy": "Integritet, dina uppgifter och radering av ditt konto",
  "account.terms": "Användarvillkor",
  "account.privacyPolicy": "Integritetspolicy",
  "account.deletionInfo": "Så fungerar radering av konto (ingen inloggning krävs)",
  "account.support": "Kontakta supporten (info@labourmarket.ai)",
  "account.external": "Webbläsare",
  "account.openFailed": "Länken kunde inte öppnas på den här telefonen. Inget ändrades.",

  "session.unavailable.title": "Vi kunde inte kontrollera din session",
  "session.unavailable.body":
    "Det här är inte samma sak som att vara utloggad – telefonens säkra lagring svarade inte. Försök igen.",
  "session.unavailable.retry": "Försök igen",

  "route.notFound.title": "Den skärmen finns inte i appen",
  "route.notFound.body":
    "Länken du följde leder inte någonstans här. Den kan vara avsedd för webbplatsen, eller så är den inaktuell. Inget skickades någonstans.",
  "route.notFound.action": "Tillbaka till appen",

  "crash.title": "Ett fel uppstod i appen",
  "crash.body":
    "Det här är ett fel i själva appen, inte något du gjorde, och inget skickades någonstans. Försök igen – om det fortsätter att hända, stäng appen och öppna den igen.",

  "config.problem.title": "Den här versionen är inte konfigurerad",
  "config.problem.body":
    "Appen kan inte starta förrän dessa värden har angetts. Inga uppgifter har skickats någonstans.",

  "workspace.title": "Agerar för",
  "workspace.loading": "Läser dina arbetsytor…",
  "workspace.active": "Aktiv",
  "workspace.switching": "Byter…",
  "workspace.failed.title": "Vi kunde inte läsa dina arbetsytor",
  "workspace.failed.body":
    "Det här är en misslyckad läsning, inte ett svar: det betyder inte att du inte tillhör någon organisation. Försök igen om en stund.",
  "workspace.pointerUnavailable":
    "Det här härleds från vad du tillhör, inte från ett val som sparats åt dig, och det kan inte ändras här ännu.",
  "workspace.switchFailed": "Arbetsytan ändrades inte. Inget flyttades.",
  "context.loading": "Läser dina roller…",
  "context.active": "Aktiv",
  "context.none": "Ingen deltagarroll är registrerad på det här kontot ännu. Det är vad vi läste – inte ett problem med appen.",
  "context.title": "Du arbetar som",
  "context.unavailable.title": "Vi kan inte lista dina kontexter ännu",
  "context.unavailable.body":
    "Appen kan logga in dig, men den kan ännu inte läsa vilka organisationer du tillhör. Inget saknas i ditt konto – den här klienten kan helt enkelt inte fråga ännu.",
  "context.mode.worker": "Jag själv",
  "context.mode.company": "Företag",
  "context.mode.agency": "Bemanningsföretag",
  "context.mode.customer": "Kund",

  "language.title": "Språk",
  "language.preview": "Förhandsversion av översättningen",

  "domain.loading": "Frågar servern…",
  "domain.retry": "Försök igen",
  "domain.failedTitle": "Vi kunde inte läsa in det här",
  "domain.unavailable.notConnectedYet": "Inte ansluten ännu",
  "domain.unavailable.signInAgain": "Logga in igen.",
  "domain.unavailable.offline": "Ingen anslutning. Inget skickades.",
  "domain.unavailable.unexpectedAnswer":
    "Servern svarade med något som appen inte förstod.",
  "domain.refused.no_credentials": "Logga in igen.",
  "domain.refused.invalid_token": "Din session har upphört. Logga in igen.",
  "domain.refused.no_profile": "Det här kontot har ingen profil ännu.",
  "domain.refused.not_authorized":
    "Servern avböjde den här begäran för det här kontot.",
  "domain.refused.rate_limited":
    "Servern bad appen att sakta ner. Försök igen om en stund.",
  "domain.refused.capability": "Servern avböjde den här begäran.",
  "domain.refused.identity_unavailable":
    "Vi kunde inte bekräfta vem du är. Det här är inget avslag – försök igen.",

  "today.signedInAs": "Inloggad som",
  "today.recentWork": "Senaste arbete",
  "journal.empty": "Inga poster i arbetsjournalen ännu.",
  "journal.logWork": "Registrera arbete",
  "journal.compose.title": "Registrera arbete",
  "journal.compose.intro":
    "Skriv vad du gjorde, med dina egna ord. Din arbetsjournal registrerar exakt det du skriver.",
  "journal.compose.date": "Datum för arbetet",
  "journal.compose.dateHint": "År-månad-dag, till exempel 2026-09-01",
  "journal.compose.today": "I dag",
  "journal.compose.yesterday": "I går",
  "journal.compose.notes": "Vad du gjorde",
  "journal.compose.notesHint":
    "Med dina egna ord. Tider och platser hör också hemma här.",
  "journal.compose.site": "Arbetsplats eller ort (valfritt)",
  "journal.compose.context": "Arbetskontext",
  "journal.compose.contextUnnamed": "Inte namngiven",
  "journal.compose.review": "Granska innan du sparar",
  "journal.compose.previewTitle": "Kontrollera detta innan det sparas",
  "journal.compose.previewNothingSaved":
    "Inget har sparats ännu. Det här är exakt vad som kommer att registreras.",
  "journal.compose.save": "Spara i min arbetsjournal",
  "journal.compose.edit": "Ändra något",
  "journal.compose.chooseContext": "Vilket arbete hör det här till?",
  "journal.compose.chooseContextBody":
    "Den här posten kan höra till fler än en av dina arbetskontexter, så inget förbereddes och inget sparades. Välj en.",
  "journal.compose.savedTitle": "Sparat i din arbetsjournal",
  "journal.compose.savedBody":
    "Det här är nu en registrerad post. Det är vad servern lagrade.",
  "journal.compose.another": "Registrera ett till",
  "journal.compose.backToJournal": "Tillbaka till journalen",
  "journal.compose.checkThis": "Kontrollera detta först",
  "journal.compose.invalidDate":
    "Skriv datumet som år-månad-dag, till exempel 2026-09-01. Inget skickades.",
  "journal.compose.futureDate":
    "Arbetsdatumet kan inte ligga i framtiden – en journalpost registrerar arbete som redan har utförts. Inget skickades.",
  "journal.compose.notesRequired":
    "Skriv vad du gjorde innan du sparar. Inget skickades.",
  "journal.compose.draftFailedTitle": "Vi kunde inte förbereda den här posten",
  "journal.compose.saveFailedTitle": "Vi kunde inte spara den här posten",
  "journal.compose.staleDraft":
    "Det här sparades inte: din journal ändrades efter att detta förbereddes, så kontrollen det byggde på är inaktuell. Granska det igen.",
  "journal.compose.noContext":
    "Det här kontot har ingen aktiv arbetskontext, så en post har ingenstans att registreras. Lägg först till var du arbetar på webbplatsen och registrera sedan arbete här.",
  "journal.compose.unsureSaved":
    "Anslutningen bröts efter att detta skickades, så vi vet inte om det kom fram. Öppna din arbetsjournal och kontrollera innan du skriver det igen. Att försöka igen kan inte skapa en dubblett.",
  "journal.compose.skillsAdded": "Nya färdigheter registrerade",
  "journal.compose.skillsStrengthened": "Färdigheter med nya belägg",
  "journal.compose.skillsClaims": "Förmågor som noterats utifrån dina ord",
  "journal.compose.skillsReview": "Väntar på din granskning",
  "journal.compose.noCvChange":
    "Inget nytt lades till i ditt Levande CV från den här posten.",
  "journal.compose.skillsPartial":
    "En del av uppdateringen av ditt Levande CV slutfördes inte. Själva posten är sparad.",
  "journal.compose.skillsFailed":
    "Uppdateringen av ditt Levande CV kördes inte den här gången. Själva posten är sparad.",
  "journal.compose.reviewOnWeb":
    "Det som väntar på granskning bekräftas på webbplatsen.",
  "profile.skillsEmpty": "Inga färdigheter registrerade ännu.",
  "journal.correct.action":
    "Rätta den här posten",
  "journal.correct.title":
    "Rätta en post",
  "journal.correct.intro":
    "Ändra det som är fel – orden, dagen eller arbetsplatsen. Den tidigare versionen finns kvar i din historik; dina summor räknar den rättade.",
  "journal.correct.nothingChanged":
    "Inget har ändrats ännu. Redigera först orden, dagen eller arbetsplatsen.",
  "journal.correct.previewTitle":
    "Kontrollera rättelsen innan den sparas",
  "journal.correct.before":
    "Nu",
  "journal.correct.after":
    "Efter rättelsen",
  "journal.correct.hours":
    "Timmar",
  "journal.correct.output":
    "Utfört arbete",
  "journal.correct.wasConfirmed":
    "En chef bekräftade den här posten. Bekräftelsen ligger kvar på den tidigare versionen; den rättade versionen sparas som ännu inte bekräftad.",
  "journal.correct.save":
    "Spara rättelsen",
  "journal.correct.savedTitle":
    "Rättelsen sparades",
  "journal.correct.savedBody":
    "Din journal och dina summor visar nu den rättade versionen.",
  "journal.correct.savedConfirmedBody":
    "Den rättade versionen är sparad och väntar på en chefs bekräftelse; den tidigare bekräftade versionen finns kvar i din historik.",
  "journal.correct.draftFailedTitle":
    "Vi kunde inte förbereda den här rättelsen",
  "journal.correct.saveFailedTitle":
    "Vi kunde inte spara den här rättelsen",
  "journal.correct.unsureSaved":
    "Rättelsen skickades men inget svar kom tillbaka, så vi kan inte avgöra om den sparades. Det är säkert att försöka igen: en rättelse som redan har kommit fram avvisas och sparas aldrig två gånger.",
  "journal.correct.staleDraft":
    "Det här sparades inte: din journal ändrades efter att rättelsen förbereddes. Granska den igen.",
  "journal.correct.superseded":
    "Den här posten har redan rättats eller tagits bort. Öppna journalen igen och rätta den aktuella versionen.",
  "journal.correct.notFound":
    "Den här posten finns inte bland dina senaste journalposter. Den kan redan ha rättats.",
  "journal.correct.conflict":
    "De nya orden anger en enda tidsåtgång för hela posten, men posten registrerar också ett utfört arbete, och båda behöver samma fält. Ange tiden per aktivitet, eller rätta posten på webbplatsen.",
  "journal.correct.missingTitle":
    "Den här posten kan inte rättas här",
  "today.openMessages":
    "Meddelanden",
  "messages.title":
    "Meddelanden",
  "messages.conversation":
    "Konversation",
  "messages.intro":
    "Dina konversationer i LabourMarket.ai. Meddelandena stannar i appen – inget skickas via e-post eller sms. Nya meddelanden visas när du öppnar den här skärmen.",
  "messages.none":
    "Du har inga konversationer ännu.",
  "messages.untitled":
    "Konversation",
  "messages.threadEmpty":
    "Inga meddelanden i den här konversationen ännu.",
  "messages.fromMe":
    "Du",
  "messages.fromThem":
    "Motparten",
  "messages.replyLabel":
    "Ditt svar",
  "messages.review":
    "Granska innan du skickar",
  "messages.emptyBody":
    "Skriv ett meddelande först.",
  "messages.previewTitle":
    "Kontrollera detta innan det skickas",
  "messages.previewNothingSent":
    "Inget har skickats ännu. Det här är exakt den text som den andra personen kommer att se.",
  "messages.send":
    "Skicka",
  "messages.sentTitle":
    "Skickat",
  "messages.sentBody":
    "Ditt meddelande finns i konversationen.",
  "messages.sentUnverified":
    "Servern tog emot ditt meddelande, men när det lästes tillbaka stämde det inte. Öppna konversationen igen och kontrollera.",
  "messages.writeAnother":
    "Skriv ett nytt meddelande",
  "messages.draftFailedTitle":
    "Vi kunde inte förbereda det här meddelandet",
  "messages.sendFailedTitle":
    "Vi kunde inte skicka det här meddelandet",
  "messages.unsureSent":
    "Meddelandet skickades men inget svar kom tillbaka, så vi kan inte avgöra om det kom fram. Öppna konversationen igen innan du skickar det en gång till.",
  "messages.staleDraft":
    "Inte skickat: ett nytt meddelande kom in i konversationen efter att du förberett ditt. Läs det och granska sedan ditt svar igen.",
  "messages.notFound":
    "Den här konversationen är inte din, eller så finns den inte längre.",
  "messages.noPermission":
    "Du får inte skriva i den här konversationen.",
  "today.openNotifications":
    "Aviseringar",
  "notifications.title":
    "Aviseringar",
  "notifications.intro":
    "Det som har hänt i ditt arbete, nyast först. När du öppnar en avisering markeras den som läst. Aviseringar skickas inte som push till din telefon – de visas här när du öppnar den här skärmen.",
  "notifications.none":
    "Du har inga aviseringar.",
  "notifications.unread":
    "Ny",
  "notifications.markAll":
    "Markera alla som lästa",
  "notifications.markFailedTitle":
    "Vi kunde inte markera detta som läst",
  "notifications.type.unknown":
    "En avisering",
  "notifications.type.event_absence_approved":
    "Din frånvaro godkändes",
  "notifications.type.event_absence_rejected":
    "Din frånvaro avböjdes",
  "notifications.type.event_absence_requested":
    "En frånvaro registrerades för dig",
  "notifications.type.event_booking_accepted":
    "Ditt bokningsförslag accepterades",
  "notifications.type.event_booking_declined":
    "Ditt bokningsförslag avböjdes",
  "notifications.type.event_booking_proposed":
    "Du har fått ett bokningsförslag",
  "notifications.type.event_booking_withdrawn":
    "Bokningsförslaget drogs tillbaka",
  "notifications.type.event_demand_interest_expressed":
    "En arbetstagare har visat intresse för ditt behov",
  "notifications.type.event_demand_interest_reviewed":
    "Ett företag har markerat ditt intresse som granskat",
  "notifications.type.event_document_ack_assigned":
    "Du ombads bekräfta att du har läst ett dokument.",
  "notifications.type.event_document_ack_completed":
    "Ett dokument som du skickade för bekräftelse har bekräftats.",
  "notifications.type.event_document_expiring":
    "Ett dokuments giltighet upphör snart.",
  "notifications.type.event_engagement_created":
    "Ett nytt engagemang skapades",
  "notifications.type.event_engagement_ended":
    "Engagemanget avslutades",
  "notifications.type.event_history_link_offered":
    "En organisation erbjuder att koppla din registrerade arbetshistorik till ditt konto",
  "notifications.type.event_invitation_accepted":
    "Någon har tackat ja till din inbjudan",
  "notifications.type.event_job_alert":
    "Det finns ett nytt jobb som passar det du söker",
  "notifications.type.event_journal_review_decided":
    "Din journalpost har granskats",
  "notifications.type.event_journal_review_decided_approved":
    "Din journalpost har bekräftats",
  "notifications.type.event_journal_review_decided_changes_requested":
    "Ändringar har begärts i din journalpost",
  "notifications.type.event_journal_review_decided_rejected":
    "Din journalpost har avvisats",
  "notifications.type.event_message_received":
    "Du har ett nytt meddelande",
  "notifications.type.event_saved_search_match":
    "En sparad sökning har nya resultat",
  "notifications.type.event_weekly_digest":
    "Din veckoöversikt över arbete och möjligheter är klar",
  "notifications.type.event_weekly_digest_journal":
    "Veckans sammanfattning av din arbetsjournal är klar",
  "notifications.type.event_weekly_digest_profile_completion":
    "För att visa dig passande jobb, bekräfta vilket arbete du utför",
  "notifications.type.event_work_task_assigned":
    "En uppgift har tilldelats dig",
  "notifications.type.event_workflow_decided":
    "Ett beslut har fattats om din godkännandeförfrågan",
  "notifications.type.event_workflow_delegated":
    "En godkännanderunda har lämnats över till dig",
  "notifications.type.event_workflow_escalated":
    "En godkännanderunda har passerat sin frist",
  "notifications.type.event_workflow_step_pending":
    "En godkännandeförfrågan väntar på ditt beslut",
  "today.openProjects":
    "Mina projekt",
  "projects.title":
    "Mina projekt",
  "projects.detailTitle":
    "Projekt",
  "projects.none":
    "Du är inte tilldelad något projekt.",
  "projects.active":
    "Aktivt",
  "projects.ended":
    "Avslutat",
  "projects.asksCount":
    "Behövs fortfarande från dig",
  "projects.moreOnWeb":
    "Bara dina första projekt visas här. Webbplatsen listar alla.",
  "projects.notFound":
    "Det här projektet är inte ditt, eller så finns det inte bland projekten som visas här.",
  "projects.asksTitle":
    "Behövs fortfarande från dig",
  "projects.asksShownOf":
    "Visas här / fortfarande öppet totalt – hela listan finns på webbplatsen",
  "projects.asksUnavailable":
    "Det som fortfarande behövs från dig kunde inte läsas just nu. Försök igen, eller öppna projektet på webbplatsen.",
  "projects.asksNotRead":
    "Den här tilldelningen har avslutats. Det som begärdes av dig i den finns på projektets webbsida.",
  "projects.asksIncomplete":
    "Det finns mer öppet i dina projekt än appen kan lista, så det här projektets del kanske inte visas. Dess webbsida har hela listan.",
  "projects.asksNone":
    "Inget är öppet för dig i det här projektet.",
  "projects.ask.needed":
    "Behövs",
  "projects.ask.missing":
    "Saknas",
  "projects.ask.rejected":
    "Avvisat – behöver ett nytt",
  "projects.ask.expired":
    "Har gått ut",
  "projects.instructionTitle":
    "Senaste instruktion",
  "projects.answerInstruction":
    "Svara i Meddelanden",
  "projects.webDetail":
    "Hela projektsidan – etapper, dokument och teamet – finns på webbplatsen.",
  "messages.threadNotShown":
    "Konversationen visas inte på skärmen ännu. Vänta tills den har lästs in, läs den och granska sedan ditt svar.",
  "messages.newBeforeReview":
    "Ett nytt meddelande kom in i konversationen. Det visas nu ovanför – läs det och granska sedan ditt svar igen.",
  "profile.noWorkerProfile": "Det här kontot har ingen arbetstagarprofil ännu.",
  "profile.figuresTitle": "Färdigheter, med dina registrerade timmar",
  "profile.groupManagerConfirmed": "Bekräftade av en chef",
  "profile.groupJournalBacked": "Styrkta av din arbetsjournal",
  "profile.groupDeclared": "Angivna av dig",
  "profile.figuresUnavailable":
    "Timmar, andel och poster kunde inte läsas den här gången. Färdigheterna nedan är fortfarande dina registrerade färdigheter – inget visas som 0.",
  "profile.figuresLegend":
    "Timmar · andel av de timmar som tillskrivs en färdighet · poster, totalt. Samma siffror som på webbplatsen.",
  "profile.figuresNotRead": "siffrorna kunde inte läsas",
  "profile.noFigures": "inga registrerade timmar",
  "profile.involvedUnattributed": "ingår; tiden tillskrivs inte enbart den här färdigheten",
  "profile.hoursShort": "tim",
  "profile.entriesLabel": "poster",
  "profile.selfStatedMissing":
    "Förmågor som du noterat med dina egna ord visas inte på den här skärmen ännu; webbplatsen visar dem under dina färdigheter.",
  "profile.openJournal": "Öppna din arbetsjournal",
  "cv.workTitle": "Arbetslivserfarenhet",
  "cv.workEmpty": "Ingen arbetslivserfarenhet ännu.",
  "cv.workUntitled": "Arbete",
  "cv.now": "nu",
  "cv.addWork": "Lägg till arbete",
  "cv.languagesTitle": "Språk",
  "cv.languagesEmpty": "Inga språk ännu.",
  "cv.levelNative": "Modersmål",
  "cv.addLanguage": "Lägg till språk",
  "cv.save": "Spara",
  "cv.cancel": "Tillbaka",
  "cv.saveFailedTitle": "Vi kunde inte spara detta",
  "cv.work.title": "Lägg till arbete",
  "cv.work.titleLabel": "Vad var arbetet?",
  "cv.work.startLabel": "Startår",
  "cv.work.endLabel": "Slutår",
  "cv.work.ongoing": "Jag arbetar här fortfarande",
  "cv.work.titleRequired": "Skriv vad arbetet var, minst 3 tecken. Inget sparades.",
  "cv.work.yearInvalid": "Ange startåret med fyra siffror. Inget sparades.",
  "cv.work.endInvalid": "Ange ett slutår, inte före startåret, eller markera att du fortfarande arbetar här. Inget sparades.",
  "cv.language.title": "Lägg till språk",
  "cv.language.languageLabel": "Språk",
  "cv.language.levelLabel": "Nivå",
  "cv.language.chooseBoth": "Välj ett språk och en nivå. Inget sparades.",
  "cv.educationTitle": "Utbildning",
  "cv.educationEmpty": "Ingen utbildning ännu.",
  "cv.addEducation": "Lägg till utbildning",
  "cv.education.title": "Lägg till utbildning",
  "cv.education.institutionLabel": "Skola eller institution",
  "cv.education.programLabel": "Program eller område",
  "cv.education.typeLabel": "Typ",
  "cv.education.ongoing": "Jag studerar här fortfarande",
  "cv.education.institutionRequired": "Skriv namnet på skolan eller institutionen, minst 2 tecken. Inget sparades.",
  "cv.education.typeRequired": "Välj typ av utbildning. Inget sparades.",
  "cv.education.yearsInvalid": "Ange år med fyra siffror, slutet inte före starten. Inget sparades.",
  "today.openCandidates": "Hitta kandidater",
  "candidates.title": "Hitta kandidater",
  "candidates.noNeeds": "Inga öppna behov ännu.",
  "candidates.untitledNeed": "Behov",
  "candidates.interested": "Intresserade",
  "candidates.shortlisted": "På kortlistan",
  "candidates.open": "Visa kandidater",
  "candidates.allNeeds": "Alla behov",
  "candidates.found": "Kandidater",
  "candidates.none": "Inga kandidater för det här behovet ännu.",
  "candidates.onShortlist": "På kortlistan",
  "candidates.confirmTitle": "Lägga till på kortlistan?",
  "candidates.confirmBody": "Bara din organisation ser kortlistan. Inget skickas till personen.",
  "candidates.confirm": "Lägg till",
  "candidates.shortlist": "Kortlista",
  "candidates.notStructured": "Det här behovet har inget att matcha mot ännu. Lägg till typ av arbete eller färdigheter på webben.",
  "booking.propose": "Föreslå bokning",
  "booking.cannotContact": "Kontakt är inte möjlig ännu.",
  "booking.startLabel": "Startdatum",
  "booking.endLabel": "Slutdatum",
  "booking.noteLabel": "Meddelande till personen",
  "booking.review": "Granska",
  "booking.dateInvalid": "Ange datum som ÅÅÅÅ-MM-DD, slutet inte före starten. Inget skickades.",
  "booking.confirmTitle": "Skicka detta bokningsförslag?",
  "booking.confirmBody": "Personen ser det bland sina erbjudanden och svarar där.",
  "booking.confirm": "Skicka",
  "booking.sent": "Förslaget skickat.",
  "booking.failedTitle": "Vi kunde inte skicka förslaget",
  "needs.close": "Stäng behovet",
  "needs.reopen": "Öppna behovet igen",
  "needs.closeTitle": "Stänga det här behovet?",
  "needs.closeBody": "Det försvinner från jobbtavlan. Kandidaterna och kortlistan sparas.",
  "needs.reopenTitle": "Öppna det här behovet igen?",
  "needs.reopenBody": "Det kommer tillbaka på jobbtavlan.",
  "needs.closedLabel": "Stängt",
  "candidates.match.strong": "Stark matchning",
  "candidates.match.possible": "Möjlig matchning",
  "candidates.match.weak": "Svag matchning",
  "candidates.match.insufficient_data": "Inte tillräckligt med data",
  "cv.educationType.primary": "Grundskola",
  "cv.educationType.secondary": "Gymnasieskola",
  "cv.educationType.vocational": "Yrkesutbildning",
  "cv.educationType.college": "Högskola",
  "cv.educationType.university_bachelor": "Universitet (kandidat)",
  "cv.educationType.university_master": "Universitet (master)",
  "cv.educationType.doctorate": "Doktorsexamen",
  "cv.educationType.course_certificate": "Kurs / certifikat",
  "cv.educationType.other": "Annat",
  "journal.openProfile": "Se vad dessa poster sammantaget ger på din profil",

  "today.figuresTitle": "Ditt arbete i siffror",
  "today.periodToday": "I dag",
  "today.periodWeek": "Senaste 7 dagarna",
  "today.hoursLabel": "Timmar",
  "today.daysUnitLabel": "registrerat i dagar",
  "today.entriesLabel": "Poster",
  "today.daysLabel": "Dagar",
  "today.confirmedLabel": "Bekräftat av en chef, tim",
  "today.periodEmpty": "Inget registrerat under den här perioden.",
  "today.periodMissing": "Servern skickade ingen siffra för den här perioden.",
  "today.dominantTitle": "Största andelen av dina timmar, senaste 7 dagarna",
  "today.dominantShare": "av de timmar som tillskrivs en färdighet",
  "today.dominantNone":
    "Inga timmar tillskrivna en enskild färdighet under de senaste 7 dagarna.",
  "today.coverageTruncated":
    "Siffrorna bygger på de senast lästa posterna – äldre poster ingår inte.",
  "today.figuresScope":
    "Från dina egna poster i arbetsjournalen, enligt samma regel som på webbplatsen. Kalenderdagarna slutar i dag (UTC).",
  "today.openJournal": "Öppna din arbetsjournal",
  "today.openProfile": "Öppna din profil och dina färdigheter",
  "today.openNeed": "Lägg upp ett behov av personal",
  "need.title": "Lägg upp ett behov",
  "need.intro": "Ett personalbehov för organisationen du agerar för. Du granskar det innan det skapas; arbetstagare som får se det hittar det på sin tavla.",
  "need.descriptionLabel": "Vad behöver du?",
  "need.descriptionHint": "Med dina egna ord – arbetet, när och hur många personer.",
  "need.roleLabel": "Roll",
  "need.locationLabel": "Plats",
  "need.teamSizeLabel": "Hur många personer",
  "need.teamSizeHint": "Ett heltal",
  "need.urgencyLabel": "Hur brådskande",
  "need.urgency.flexible": "Flexibelt",
  "need.urgency.this_week": "Den här veckan",
  "need.urgency.urgent": "Brådskande",
  "need.descriptionRequired": "Skriv åtminstone några ord om vad du behöver. Inget skickades.",
  "need.teamSizeInvalid": "Antalet personer måste vara ett heltal från 1 och uppåt. Inget skickades.",
  "need.review": "Granska innan du skapar",
  "need.cancel": "Tillbaka",
  "need.previewTitle": "Kontrollera innan du skapar det",
  "need.previewBody": "Inget har skapats ännu.",
  "need.actingFor": "För",
  "need.confirm": "Skapa behovet",
  "need.edit": "Redigera",
  "need.sentTitle": "Skapat",
  "need.sentBody": "Behovet är nu öppet för organisationen. Du kan följa det på webbplatsen.",
  "need.done": "Tillbaka till I dag",
  "need.overLimit": "Organisationen har nått gränsen för aktiva tjänster i sin plan. Inget skapades – stäng ett behov eller byt plan på webbplatsen.",
  "need.draftFailedTitle": "Vi kunde inte förbereda det här behovet",
  "need.sendFailedTitle": "Vi kunde inte skapa det här behovet",
  "today.openJobs": "Bläddra bland lediga jobb",
  "jobs.title": "Jobb",
  "jobs.intro": "Den offentliga jobbtavlan – samma annonser som på webbplatsen. Detaljer som arbetsgivaren och hur du söker öppnas på webbsidan som du.",
  "jobs.queryLabel": "Sök",
  "jobs.queryHint": "Ett yrke eller ett ord ur titeln, på valfritt språk",
  "jobs.search": "Sök jobb",
  "jobs.total": "Jobb",
  "jobs.page": "sida",
  "jobs.none": "Inga jobb matchar den här sökningen just nu.",
  "jobs.prev": "Föregående sida",
  "jobs.next": "Nästa sida",
  "jobs.openWeb": "Öppna hela annonsen",
  "jobs.positions": "Tjänster",
  "jobs.compensation": "Lön",
  "jobs.published": "Publicerad",
  "jobs.untitled": "Jobb",
  "jobs.notProvisioned": "Jobbtavlan är inte aktiverad i den här miljön.",
  "jobs.unavailable": "Jobbtavlan svarade inte i tid. Det är inte samma sak som att det inte finns några jobb – försök igen.",
  "jobs.linkedNotFound": "Det jobbet finns inte längre på tavlan (det kan ha stängts).",
  "today.openOpportunities": "Se behov som är öppna för dig",
  "today.openAvailability": "Vem i din personalstyrka är ledig",
  "opportunities.title": "Möjligheter",
  "opportunities.intro": "Behov som är synliga för dig just nu. När du visar intresse ser behovets ägare det i sin egen vy – inget lämnar plattformen.",
  "opportunities.noneVisible": "Inga behov är synliga för dig just nu. När en organisation som du är kopplad till öppnar ett behov visas det här.",
  "opportunities.express": "Jag är intresserad",
  "opportunities.noteLabel": "Ett meddelande till dem (valfritt)",
  "opportunities.noteHint": "En mening om varför eller när – de läser den precis som den är skriven.",
  "opportunities.draft": "Granska innan du skickar",
  "opportunities.previewTitle": "Kontrollera innan du skickar",
  "opportunities.previewBody": "Inget har skickats ännu.",
  "opportunities.alreadyExpressed": "Du har redan visat intresse för det här behovet; om du skickar igen uppdateras det.",
  "opportunities.confirm": "Skicka",
  "opportunities.cancel": "Tillbaka",
  "opportunities.sentTitle": "Skickat",
  "opportunities.sentBody": "Ägaren av det här behovet kan nu se ditt intresse i sin egen vy.",
  "opportunities.sentStatus": "Status",
  "opportunities.another": "Tillbaka till listan",
  "opportunities.notVisible": "Det behovet är inte längre synligt för dig (det kan ha stängts).",
  "opportunities.draftFailedTitle": "Vi kunde inte förbereda detta",
  "opportunities.sendFailedTitle": "Vi kunde inte skicka detta",
  "availability.title": "Vem är ledig",
  "availability.intro": "Din aktiva personalstyrka under de kommande 7 dagarna. Bokad är inte detsamma som otillgänglig: en överlappning är en varning, inte ett avslag.",
  "availability.actingFor": "Agerar för",
  "availability.window": "Period",
  "availability.rosterTotal": "Personer i personalstyrkan",
  "availability.state.free": "ledig",
  "availability.state.committed": "bokad",
  "availability.state.unavailable": "otillgänglig",
  "availability.notFreeUntil": "inte ledig förrän",
  "availability.committedTo": "bokad för",
  "availability.overridable": "en behörig person kan åsidosätta",
  "availability.sourcesPartial": "Inte alla källor svarade: frånvaro eller åtaganden kunde inte läsas, så ingen här rapporteras som säkert ledig.",
  "availability.personalWorkspace": "Du är i ditt personliga utrymme. Byt till en organisations arbetsyta i Inställningar för att se dess personalstyrka.",
  "availability.noOrganization": "Det här kontot tillhör ingen organisation, så det finns ingen personalstyrka att rapportera om.",
  "availability.noRoster": "Den här organisationen har inga aktiva personer i personalstyrkan, så det finns ingen att rapportera om.",
  "availability.noCompanyContext": "Den här arbetsytan kan inte agera som arbetsgivare, så det finns ingen personalstyrka att rapportera om.",
  // Offers screen (#3218): added with the other six catalogues' offers keys.
  "today.openOffers": "Erbjudanden och inbjudningar till dig",
  "offers.title": "Erbjudanden",
  "offers.reviewNotice": "Om du tackar ja kan en chef på {organization} läsa det arbete du registrerar för dem och attestera det. Till dess förblir det din egen post.",
  "offers.as": "Som",
  "offers.relationship.collaborator": "Medarbetare",
  "offers.relationship.consultant": "Konsult",
  "offers.relationship.employee": "Anställd",
  "offers.relationship.freelancer": "Frilansare",
  "offers.relationship.manager": "Chef",
  "offers.relationship.owner": "Ägare",
  "offers.relationship.student": "Student",
  "offers.relationship.unemployed": "Arbetslös",
  "offers.relationship.volunteer": "Volontär",
  "offers.relationship.intern": "Praktikant",
  "offers.relationship.external_manager": "Extern chef (beställare)",
  "offers.relationship.other": "Annan relation",
  "offers.intro": "Arbetserbjudanden och inbjudningar till dig. Inget ändras förrän du bekräftar ditt svar.",
  "offers.bookingsHeading": "Arbetserbjudanden",
  "offers.invitationsHeading": "Inbjudningar",
  "offers.noBookings": "Inga arbetserbjudanden väntar på ditt svar.",
  "offers.noInvitations": "Inga inbjudningar väntar på ditt svar.",
  "offers.untitledBooking": "Arbetserbjudande",
  "offers.untitledInvitation": "Inbjudan",
  "offers.from": "Från",
  "offers.dates": "Period",
  "offers.answerBy": "Svara senast",
  "offers.accept": "Tacka ja",
  "offers.decline": "Tacka nej",
  "offers.previewAcceptBooking": "Tacka ja till det här arbetserbjudandet?",
  "offers.previewDeclineBooking": "Tacka nej till det här arbetserbjudandet?",
  "offers.previewAcceptInvitation": "Tacka ja till den här inbjudan?",
  "offers.previewBody": "Det här är ett riktigt svar: den andra parten ser det. Inget har skickats ännu.",
  "offers.confirm": "Bekräfta svaret",
  "offers.cancel": "Tillbaka",
  "offers.doneTitle": "Ditt svar är registrerat",
  "offers.doneBody": "Den andra parten ser det nu.",
  "offers.backToList": "Tillbaka till erbjudandena",
  "offers.prepareFailedTitle": "Det här svaret kunde inte förberedas",
  "offers.confirmFailedTitle": "Ditt svar registrerades inte",
  "offers.clash": "Den här perioden krockar med arbete som du redan har tackat ja till. Öppna erbjudandet på webbplatsen för att se krocken och bestäm där.",
  "offers.changed": "Det här erbjudandet har ändrats eller har redan besvarats. Gå tillbaka för att se den aktuella listan.",
};

export const MESSAGES: Record<ActiveLocale, Catalogue> = { en, lt, ru, nl, de, pl, sv };

export const LANGUAGE_NAMES: Record<ActiveLocale, string> = {
  // Each language named in itself — a person looking for their own language
  // recognises it faster than a translated label.
  lt: "Lietuvių",
  en: "English",
  ru: "Русский",
  nl: "Nederlands",
  de: "Deutsch",
  pl: "Polski",
  sv: "Svenska",
};
