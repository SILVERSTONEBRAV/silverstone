# Silverstone — Task Tracker

**Status legend:** `[ ]` not started · `[~]` in progress · `[!]` blocked · `[x]` done
**Priority:** `P0` foundation/release blocker · `P1` core product · `P2` later enhancement
**Planning state:** Documentation is drafted. The first browser shell builds, and a minimal Rust health API is scaffolded; durable backend workflows, sync, AI, and provider connections have not started.

**Dependency note:** Phase 8 groups shared intelligence work for visibility. Complete `SMART-001`–`SMART-003` and `SMART-008` as part of the core foundation before relying on personalized generation or long-running workflows in Phases 4–7. Complete `SMART-004` before high-impact career drafting, `SMART-009` before external publishing, and `SMART-011` before release gates. Complete `OBS-001` before committing to any broad connector promise, `CORE-009` before connecting observation sources, and `OBS-003` before surfacing cross-source recommendations.

## Implementation snapshot — 2026-11-06

- React + TypeScript + Vite browser shell with responsive workspace navigation and dashboard pages.
- Minimal Axum loopback health endpoint and TypeScript health response/client contract are scaffolded; Rust compilation remains pending because Cargo is unavailable.
- IndexedDB-backed local tasks, notes, a weekly study goal, available-time preference, and completed focus-session log; migration from older Silverstone/Orbit localStorage keys; metadata, search, task completion, and theme preference. localStorage remains a fallback; browser data is not encrypted.
- Local active-recall deck with editable question/answer cards, due-now queue, reveal-before-rating flow, and review intervals that grow from one to 30 days; workspace backup includes card progress.
- Local career tracker for jobs and scholarships with source URL, deadline, fit notes, editable application stage, scholarship eligibility/document checklists, per-opportunity next action and date, Today Radar surfacing, and pipeline counts; records are included in workspace backup/restore and are not submitted externally.
- Manual local Inbox for selected email text, sender/subject/date metadata, user-controlled category/priority/status, transparent keyword hints, follow-up dates, editable reply drafts, and copy-to-clipboard. It is not connected to a mail provider and never sends; browser records are not encrypted.
- Local Creator Studio drafts for Facebook, Instagram, and X with channel selection, text preview, optional local review time, timezone metadata, and chronological planning list; nothing is sent, externally scheduled, or published.
- Local portfolio project drafts with a title, summary, case-study notes, plain-text Markdown preview, and up to 30 prior versions; users can restore an earlier version into the editor before saving. Drafts are local and are not published.
- Optional Supabase Auth email-link sign-in and experimental passkey sign-in, plus explicit per-user workspace upload/restore using RLS and revision-checked writes. Credentials and SQL migration still need project/Vercel setup; automatic sync is not implemented.
- User-triggered JSON workspace backup and schema-validated restore for tasks, notes, study goals/sessions/cards, portfolio drafts/version history, career opportunities, career evidence and linked application drafts, email messages/reply drafts, and social drafts; the export is intentionally unencrypted and restore replaces the current local workspace after confirmation.
- PWA manifest, production service worker with install-time build-asset precaching, cache-first assets, and online/offline status indicator. The app shell and local records can work offline after a successful first install; cross-device sync and conflict recovery are not implemented.
- Dashboard cards and charts use saved local records. No calendar, mail, social, messaging, finance, camera, or AI-provider integrations are connected. Voice uses browser speech APIs; their processing location varies, and Silverstone does not save raw dictation audio.
- The voice panel supports browser click-to-talk, typed messages, device text-to-speech, and simple local task/note/focus/day-summary intents. Browser coverage and processing location vary; native OS integration and secure storage are pending.
- Today dashboard is wired to live local records: dynamic 7-day study time bar chart from completed focus sessions, career pipeline stage breakdown track (Exploring, Preparing, In review, Offer), next deadline runway, interactive Current Radar prioritizing due recall cards, study goals, upcoming deadlines, and content review times, and an Activity timeline fed by actual local capture history.
- Interview preparation in Career: manual role, organization, format, interviewer, date/time, location/link, job excerpt, and focus topics; editable default and custom mock questions; answer autosave, browser dictation, and a transparent deterministic local rubric for STAR coverage, answer length, ownership, filler words, evidence, and entered role context. Includes a reusable STAR story bank, prep checklist, reverse-interview questions, elevator pitch, thank-you draft, debrief notes, recall-card handoff to Study, and Today Radar integration. The rubric is coaching feedback rather than an AI hiring prediction; raw audio is not saved by Silverstone.
- `npm run build` completes successfully. No Rust toolchain was available in the workspace, so the Rust API scaffold has not been compiled.

## Remaining to reach a first usable release

The interface is a working prototype, not yet a connected personal agent. The next critical path is:

1. **Lock the first release targets and data policy.** Choose target desktop/mobile OS, language/RTL needs, hosting or local-only mode, and an initial email/calendar/social provider. Confirm official API and account eligibility before promising an integration.
2. **Make local data dependable.** The browser now uses IndexedDB with localStorage migration/fallback and validated workspace backup/restore. Add a Tauri SQLite adapter, an encryption strategy, per-record deletion, sync outbox, and offline conflict recovery. Validate PWA install and offline behavior on real devices.
3. **Compile and extend the Rust service.** Install/validate the Rust toolchain, compile the health service, then add authentication, durable records, sync, jobs, action approvals, and audit history.
4. **Connect an AI provider safely.** Add a provider adapter for chat, structured intent, retrieval, citations, and multimodal inputs; keep secrets server-side and enforce action policy in Rust. Include a local-model path only if chosen hardware meets performance needs.
5. **Finish core workflows.** Expand study plans with recurring availability, breaks, AI tutoring, quizzes, and material-linked summaries; add evidence-backed CV, scholarship, and email drafts plus eligibility/document checklists; extend portfolio drafts with linked evidence, repository/deployment previews, and approved release; add social-specific variants, media, account connections, a timezone-aware calendar, approvals, and external scheduling.
6. **Package and validate voice/device support.** Check browser and OS speech behavior, microphone disclosures/permissions, raw-camera-frame deletion and session-level observation-note consent, file/share capture, and native notification restrictions.
7. **Add connectors with least privilege.** Implement each account separately after reviewing scopes, app approval, quotas, token revocation, and supported account types. Keep finance read-only and message sending/application submission/publishing approval-gated.
8. **Harden and release.** Add workflow evaluations, accessibility review, server backup/restore, sync and action reconciliation, operational visibility, and a privacy/permission walkthrough before release.

Current hard dependencies are a working Rust toolchain, the user's initial platform/provider choices, AI provider credentials or a local-model decision, and social API access where needed. The task phases below own the detailed implementation and acceptance criteria.

## Phase 0 — Decisions and design validation

- [x] **PLAN-001 · P0** Draft product overview, design specification, and phased tracker.
- [ ] **PLAN-002 · P0** Review and lock initial scope, platform targets, and first release boundary. Depends on user review.
- [ ] **PLAN-003 · P0** Confirm target email/calendar provider and account permission expectations.
- [ ] **PLAN-004 · P0** Confirm social account types, ownership, API access, and Meta/X app approval requirements.
- [ ] **PLAN-005 · P1** Confirm hosting, data residency, retention, backup, and self-hosting preferences.
- [ ] **PLAN-006 · P1** Confirm Arabic/English, RTL, timezone, and accessibility requirements.
- [ ] **PLAN-007 · P0** Produce screen flows and clickable desktop/mobile design prototype for the six primary areas.
- [ ] **PLAN-008 · P0** Define design tokens, typography, icon set, interaction states, and chart rules.
- [ ] **PLAN-009 · P0** Define the per-action autonomy matrix, proactive notification limits, and workspace/memory boundaries.
- [ ] **PLAN-010 · P1** Define a provider-independent quality scorecard and sample scenarios for the core workflows.
- [ ] **PLAN-011 · P0** Define the Observation Mode consent, retention, pause-all, source-exclusion, and data-use experience.
- [ ] **PLAN-012 · P0** Create an OS/provider connector capability matrix for files, messages, social, finance, notifications, device signals, location, health, and smart-home integrations.

## Phase 1 — Platform and offline proof of concept

- [~] **PLAT-001 · P0** Create React + TypeScript + Vite app shell and shared API/client types. Shell exists; API contracts remain.
- [ ] **PLAT-002 · P0** Package a Tauri desktop build for the first target desktop OS.
- [ ] **PLAT-003 · P0** Prototype Tauri mobile build on target iOS/Android devices.
- [ ] **PLAT-004 · P0** Verify camera/image selection, microphone, notifications, file sharing, secure storage, and platform permission flows.
- [~] **PLAT-005 · P0** Add PWA installability, app-shell caching, and offline indicator. Manifest, install-time build-asset precaching, and online/offline status exist; installability and real-device offline behavior need validation.
- [~] **PLAT-006 · P0** Implement browser IndexedDB local store and Tauri SQLite adapter behind a shared repository interface. Browser workspace storage and legacy localStorage migration/fallback exist; Tauri adapter and shared interface remain.
- [~] **PLAT-007 · P0** Prototype sync outbox, conflict detection, retries, and stale-action invalidation. Manual cloud copies use revision-checked writes to catch stale uploads; offline outbox, background sync, merges, and retries remain.
- [ ] **PLAT-008 · P0** Record Tauri feature gaps and decide whether mobile remains Tauri or receives a dedicated native shell.
- [ ] **PLAT-009 · P0** Prototype per-OS permission and background limits for notification metadata, app activity, local file watching, location, health, and sensor capture; document gaps and platform-specific behavior.

## Phase 2 — Rust service foundation

- [~] **CORE-001 · P0** Create Rust workspace, Axum/Tokio API, configuration, structured errors, and health endpoints. Workspace and loopback health route are scaffolded; structured errors and compilation remain.
- [~] **CORE-002 · P0** Design PostgreSQL schema and SQLx migration process for accounts, tasks, captures, workflows, approvals, and audit events. The current Supabase JSONB row is a manual-copy prototype only; design and migrate relational online records with per-user RLS, separate device-only drafts, and automatic sync before adding live connectors.
- [~] **CORE-003 · P0** Implement authentication, sessions, account deletion/export, and server-side secret handling. Supabase email-link sessions and experimental passkeys are scaffolded; account lifecycle, server-side secrets, and configured credentials remain.
- [ ] **CORE-004 · P0** Implement object storage upload/download with scoped, short-lived access.
- [ ] **CORE-005 · P0** Implement device registration, sync cursor, version fields, idempotency keys, and sync outbox endpoints.
- [ ] **CORE-006 · P0** Implement durable PostgreSQL-backed worker, job leases, retry/backoff, cancellation, and execution history.
- [ ] **CORE-007 · P0** Implement action proposal, approval, expiry, payload hashing, policy revalidation, and audit trail.
- [ ] **CORE-008 · P1** Add model-provider adapter, usage/latency accounting, structured outputs, and redacted traces.
- [ ] **CORE-009 · P0** Implement per-source capability grants with separate observe/suggest/act scopes, visible revocation, and a central policy check for every connector operation.
- [ ] **CORE-010 · P0** Implement a minimal, expiring observation event ledger with provenance, sensitivity, retention, and redacted operational logs.

## Phase 3 — App shell, capture, and personal context

- [x] **APP-001 · P0** Build responsive navigation, command bar, global search entry point, and capture action.
- [~] **APP-002 · P0** Build desktop layout, mobile layout, theme tokens, typography, and accessible component states. Initial responsive layouts and light/dark themes exist; accessibility review remains.
- [~] **APP-003 · P0** Build Today, Capture/Inbox, Library, Activity, and Settings screens. Initial Today, capture dialog, Library, Activity, and Settings views exist; a full Inbox remains.
- [~] **APP-004 · P0** Add text, link, image, file, and voice-note capture. Text and browser-transcribed voice-origin notes are stored locally; image/file capture and the reviewed extraction pipeline remain.
- [~] **APP-005 · P0** Store source metadata, user-entered versus extracted values, confidence, and provenance. Text modality, source surface, context, timezone, language, and retention are stored; extraction/provenance review remains.
- [ ] **APP-006 · P1** Add OCR/transcription/extraction pipeline with user correction before structured conversion.
- [~] **APP-007 · P0** Implement cloud-first records with cached offline reads, device-only drafts, pending-sync queue, last-sync timestamps, and conflict resolution screen. Current IndexedDB workspace and static app-shell caching exist; automatic online sync, local-only draft isolation, sync outbox, and conflict handling remain.
- [~] **APP-008 · P1** Add retention controls, sensitivity labels, and delete/export flows for captures and derivatives. Clear-all and validated local workspace backup/restore exist; per-capture retention, sensitivity controls, and derivative deletion remain.
- [ ] **APP-009 · P0** Build Observation Mode controls: source-by-source status, last-read timeline, category exclusions, retention, pause one/pause all, and clear active-sensor indicator.
- [~] **APP-010 · P1** Add conversational voice input and spoken output. Foreground browser speech recognition, transcript display, selectable device voices, spoken replies, and voice UI exist; browser compatibility, accessibility, permission flow, and device-local recognition need validation.
- [~] **APP-011 · P1** Connect local voice turns to safe workspace intents. Basic task/note creation, local task summary, and focus launch exist; model-backed intent parsing, clarification, undo, and action policy remain.

## Phase 4 — Daily planning and study

- [~] **STUDY-001 · P1** Implement verified profile/preferences, goals, tasks, and calendar-block records. A local study-goal record exists; verified profile and calendar records remain.
- [~] **STUDY-002 · P1** Build weekly goal setup and daily availability check-in. Weekly target is saved; today's free-time check-in is surfaced from the Study page/Today suggestion when stale. A recurring prompt/reminder remains.
- [~] **STUDY-003 · P1** Build session planner with duration, breaks, focus mode, and manual rescheduling. A short recommended block can start a timed focus session; break scheduling and rescheduling remain.
- [~] **STUDY-004 · P1** Add tutor, quiz, active-recall, summary, and review workflows tied to selected materials. Manual recall cards, reveal-before-rating review, and offline intervals from one to 30 days exist; AI tutoring, quizzes, and material-linked generation remain.
- [~] **STUDY-005 · P1** Log session outcomes, confidence, unfinished topics, and future review suggestions. Completed timed sessions are stored locally; richer reflections and review suggestions remain.
- [~] **STUDY-006 · P1** Add study dashboard visualizations with clear units, ranges, and data sources. Current-goal completion over the last seven days is shown; more study analytics remain.
- [ ] **STUDY-007 · P2** Add calendar integration and user-approved event creation or modification.

## Phase 5 — Career, scholarships, and email

- [~] **CAREER-001 · P1** Build verified fact/evidence library for education, experience, skills, and achievements. Local typed records, source labels/links, user-confirmed verification stamps, editing, deletion, search, filters, and version-13 workspace migration are implemented. The Application Draft Studio links selected records to CV excerpts, cover letters, and scholarship statement outlines; attachments, portfolio claim references, and generated-claim checks remain.
- [~] **CAREER-002 · P1** Discover and track jobs and scholarships against the user's sourced master CV/profile. Local manual intake stores source, fit notes, deadline, and stage; scholarships support source-linked eligibility checks and per-document status. Scheduled public-source ingestion, stale/closed checks, requirement extraction, and transparent meets/missing/unknown matching remain.
- [~] **CAREER-003 · P1** Build application pipeline and next-action views. Local stage tracking, sorted deadlines, pipeline counters, per-opportunity next action/date, and due/overdue Today Radar surfacing exist; notification delivery and reminder preferences remain.
- [~] **CAREER-004 · P1** Tailor device-only CV and scholarship drafts to live opportunity requirements using cited master-CV evidence. Manual interview prep and local template drafts exist. A private online master profile, opportunity-linked model generation, claim-to-source mapping, unsupported/unknown warnings, document export, and reviewed application handoff remain.
- [~] **CAREER-005 · P1** Build scholarship eligibility checklist and document checklist. Editable per-scholarship criteria have To check/Meets/Does not meet states, notes, and source links; document rows have Not started/In progress/Ready/Submitted states. Suggested prompts are explicitly examples to check against the official award page; file attachments and automatic official-requirement extraction remain.
- [~] **CAREER-006 · P1** Connect Gmail/Outlook for online inbox triage and device-only reply drafts; send only after approval of exact recipients, subject, body, attachments, and account. Manual local paste-in, user-set triage, keyword hints, editable starters, search/filters, and follow-up dates exist; OAuth, online sync, model-assisted review, approval-bound provider send, and outcome reconciliation remain.
- [ ] **CAREER-007 · P1** Build deadlines/pipeline dashboard and reminder preferences.

## Phase 6 — Portfolio studio

- [~] **PORT-001 · P1** Define portfolio project/case-study schema, asset handling, links, skills, and evidence. Local title, summary, body, update time, and version records are defined; linked evidence and assets remain.
- [~] **PORT-002 · P1** Build portfolio project editor and live preview. Local editor, text preview, and draft list exist; rendered Markdown and asset handling remain.
- [ ] **PORT-003 · P1** Generate portfolio change proposals from selected notes/projects; show source evidence and content diff.
- [~] **PORT-004 · P1** Implement version history and rollback. Up to 30 prior versions are saved and can be loaded into the editor; direct rollback and audit history remain.
- [ ] **PORT-005 · P1** Connect Silverstone Portfolio to `bravinemunialo.vercel.app` as the private editor for the live personal site. Inspect the site source repository and current content store; choose a published-content API or reviewable repository/deployment integration with least privilege.
- [ ] **PORT-006 · P1** Keep unpublished content drafts device-only. Require approval for the exact release; record published version, URL, commit/deployment reference, and verified result; support rollback.

## Phase 7 — Social content and scheduling

- [ ] **SOC-001 · P0** Verify current supported APIs, account eligibility, scopes, approval review, publishing types, quotas, and costs per platform.
- [~] **SOC-002 · P1** Build content draft editor, platform-specific variants, media attachments, alt text, and preview cards. Local shared-text drafts, Facebook/Instagram/X selection, and a text preview exist; platform-specific variants, media, and alt text remain.
- [~] **SOC-003 · P1** Build social content calendar with timezone-aware schedule and draft/approval/queued/published/failed states. Local review times and timezone metadata are saved and shown in a sorted list; calendar, approval, and external delivery states remain.
- [ ] **SOC-004 · P1** Implement OAuth connection management and token revocation for supported accounts.
- [ ] **SOC-005 · P1** Implement Meta Page and eligible Instagram publishing adapter where approved and supported.
- [ ] **SOC-006 · P1** Implement X post adapter subject to account API access.
- [ ] **SOC-007 · P0** Run server-side schedule worker with idempotency, retries, cancellation, and ambiguous-outcome review.
- [ ] **SOC-008 · P0** Require exact-content approval before external scheduling/publishing.
- [ ] **SOC-009 · P2** Add platform insights only where permissions and official metrics are available.
- [ ] **SOC-010 · P1** Add manual-publish fallback and reminder when an account or media type is unsupported.

## Phase 8 — Personal context, research, and proactive intelligence

- [ ] **SMART-001 · P0** Define Study, Career, Personal, and Creator context workspaces and their integration/data scopes.
- [ ] **SMART-002 · P0** Implement user-editable memory facts/preferences with source, confidence, scope, validity dates, last confirmation, and correction history.
- [ ] **SMART-003 · P0** Implement scoped exact and semantic retrieval with source links, freshness checks, and deletion propagation for indexes/caches.
- [ ] **SMART-004 · P1** Add reusable verified application answers and stale-fact confirmation before high-impact document generation.
- [ ] **SMART-005 · P1** Implement goal-to-milestone planning with time budgets, dependencies, calendar constraints, breaks, and explicit tradeoffs.
- [ ] **SMART-006 · P1** Implement user-enabled event/deadline triggers, quiet hours, per-category interrupt limits, snooze, and dismissal controls.
- [ ] **SMART-007 · P1** Build cited research briefs with source dates, source quality, conflicting claims, and fact/inference separation.
- [ ] **SMART-008 · P1** Implement resumable workflow contracts, visible run states, checkpoints, pause/resume/cancel, and completion criteria.
- [ ] **SMART-009 · P0** Add post-action verification and reconciliation for sent messages, portfolio releases, and scheduled/published posts.
- [ ] **SMART-010 · P1** Capture user corrections and preference feedback with explicit review; prevent silent memory changes/model training.
- [ ] **SMART-011 · P1** Build a local/provider-independent evaluation harness for factuality, retrieval, clarification, action policy, completion, and sync recovery.
- [ ] **SMART-012 · P2** Add meeting preparation, editable decision/action extraction, and follow-up drafts with consent-aware audio capture.
- [ ] **SMART-013 · P1** Add one-tap mobile share capture, desktop shortcut, and optional home-screen capture action.

### Observation Mode and connector work

- [ ] **OBS-001 · P0** Complete connector feasibility matrix: official API, account eligibility, platform approval, scopes, quotas/cost, supported data/actions, OS limitations, and fallback for each target platform.
- [ ] **OBS-002 · P0** Define event schema and retention lifecycle for source events, extracted signals, provenance links, confidence, expiry, and deletion propagation. Explicit camera-session “Save observation notes” may auto-save derived notes to online Observation Memory, labeled as unverified; raw camera media is never retained.
- [ ] **OBS-003 · P1** Build cross-source correlation that links only user-approved sources, shows evidence/confidence, distinguishes signal from verified fact, and creates reviewable suggestions.
- [ ] **OBS-004 · P1** Add local file observation for user-selected folders with exclusions, metadata-first indexing, content-on-demand, and local deletion/index rebuild controls.
- [ ] **OBS-005 · P1** Add opt-in OS context signals where supported: notification metadata, app/focus session, battery/connectivity, and user-started image/voice capture; do not add keystroke, ambient audio, or hidden screen collection.
- [ ] **OBS-006 · P1** Assess email, calendar, contacts, SMS, and supported message providers; implement only official delegated scopes and show platform-specific coverage in connection setup.
- [ ] **OBS-007 · P1** Evaluate Telegram Bot API versus TDLib as distinct integration choices; document which chats and actions each supported route can access before implementation.
- [ ] **OBS-008 · P1** Assess WhatsApp and other private messaging support using official APIs and approved handoff paths; provide manual capture when private-chat import is unavailable.
- [ ] **OBS-009 · P1** Add social account read/analytics scopes separately from publishing and account administration; show exact account-type support and use manual-publish fallback when APIs do not support a request.
- [ ] **OBS-010 · P1** Add read-only brokerage/finance connectors only where official APIs support them; expose balances/holdings/transactions and threshold alerts without order or transfer tools.
- [ ] **OBS-011 · P2** Add opt-in travel/location and health/wearable summaries with task-scoped collection, short retention, and non-diagnostic wellbeing framing.
- [ ] **OBS-012 · P2** Prototype smart-home status and routines; require per-device grants and explicit confirmation for locks, alarms, purchases, or other consequential controls.
- [ ] **OBS-013 · P1** Add observation policies for quiet hours, urgency/confidence thresholds, duplicate-signal suppression, daily briefing, and suggestion feedback.
- [ ] **OBS-014 · P0** Verify pause-all and revoke behavior stops new reads promptly, prevents queued observations from processing, and records a clear user-visible confirmation.
- [ ] **OBS-015 · P1** Add scoped browser, cloud storage, work, and learning-service connectors; selected tabs/folders/workspaces only, with a separate context for employer or school data.
- [ ] **OBS-016 · P2** Build the device and account concierge for user-selected diagnostics and official troubleshooting guides; require review before changing settings, installing software, or running commands.
- [ ] **OBS-017 · P2** Add evidence-based scam/phishing explanations for user-selected messages, links, and official security notices; label uncertainty and prohibit auto-clicking, forwarding, or security-setting changes.
- [ ] **OBS-018 · P0** Build the foreground camera as a real-time visual sensor. Require explicit camera permission and show active state/timer/stop controls; process sampled frames in volatile memory and never save raw media. In the explicitly enabled **Save observation notes** mode, automatically sync timestamped, confidence/provenance-tagged unverified notes to online Observation Memory. Support local/cloud inference routes, disclose cloud frame transmission, and clear buffers on stop, app hide, timeout, or permission revocation.

## Phase 9 — Advanced dashboard and refinement

- [x] **DASH-001 · P1** Build configurable Today dashboard with task, calendar, study, and approval cards. Today dashboard is wired to live local records for study sessions, opportunity pipeline, deadline runway, and current radar.
- [~] **DASH-002 · P1** Add career pipeline, deadline runway, study progress, and content-calendar visualizations. Today pipeline track, next deadline card, and weekly study session bar chart are live; standalone full-page calendar views remain.
- [ ] **DASH-003 · P1** Add activity timeline showing source, workflow, proposed action, approval, execution, and outcome.
- [ ] **DASH-004 · P1** Add global filtering, search, saved views, time ranges, and chart definitions.
- [~] **DASH-005 · P1** Complete responsive behavior, keyboard access, screen-reader labels, reduced-motion behavior, and contrast review. Initial responsive states and reduced-motion handling exist; full accessibility review remains.
- [ ] **DASH-006 · P2** Add natural-language dashboard queries and user-arranged widgets.
- [ ] **DASH-007 · P1** Build inspectable Memory and Trust Center for facts, sources, permissions, retention, and deletion.
- [ ] **DASH-008 · P1** Add “why this?” details for proactive suggestions and a weekly goals/commitments review.

## Phase 10 — Reliability, privacy, and release

- [ ] **SHIP-001 · P0** Verify offline edits, reconnect, duplicate prevention, conflicts, stale approvals, and failed sync recovery.
- [ ] **SHIP-002 · P0** Verify every external action has a policy check, approval record where required, and user-visible result.
- [ ] **SHIP-003 · P0** Verify OAuth scopes, credential storage, session revocation, upload access controls, and data deletion/export.
- [ ] **SHIP-004 · P0** Verify app behavior on all committed browser, desktop, and mobile targets.
- [~] **SHIP-005 · P1** Add backup/restore, database migrations, deployment rollback, and worker health visibility. Browser workspace export/restore exists; server backups, deployment rollback, and worker health remain.
- [ ] **SHIP-006 · P1** Establish release gates from the workflow quality scorecard and evaluation scenarios.
- [ ] **SHIP-007 · P1** Add operational dashboards for sync errors, workflow outcomes, latency, and model usage with sensitive content redacted.
- [ ] **SHIP-008 · P1** Write onboarding, privacy controls, integration connection, and recovery documentation.

## Phase 11 — Optional personal-life modules

- [ ] **LIFE-001 · P2** Add user-defined habits and routines with gentle check-ins and no medical claims.
- [ ] **LIFE-002 · P2** Add travel and household planning, with explicit confirmation for bookings and opt-in location use.
- [ ] **LIFE-003 · P2** Add read-only bill, subscription, and spending summaries; exclude payment and investment execution.
- [ ] **LIFE-004 · P2** Add user-requested relationship follow-ups and drafts with private, editable context.
- [ ] **LIFE-005 · P2** Add read-only brokerage summaries and user-defined price/account alerts with explicit separation from trading tools.
- [ ] **LIFE-006 · P2** Add optional user-selected wearable summaries for routine planning, with explicit consent and no medical conclusions.

## Current blockers / dependencies

- User review of this product/design draft.
- Final target OS list and mobile packaging decision.
- Email/calendar provider and permission scope.
- Social account types and API access/approval.
- Portfolio hosting/deployment target.
- Hosting and data-retention preference.
- User preferences for proactive reminders, context workspaces, and what may be stored as memory.
