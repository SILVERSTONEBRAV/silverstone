# Silverstone — Product and Technical Design

**Status:** Draft for review
**Scope:** Product, interface, architecture, offline behavior, integrations, and release plan
**Implementation status:** Browser app shell now has IndexedDB-backed local tasks, notes, a manual local Inbox with email triage and reply drafts, career opportunity tracking, source-linked scholarship eligibility and document checklists, per-opportunity next actions with local Today Radar surfacing, a local career evidence library with user-confirmed source checks, and an Application Draft Studio that creates editable CV excerpts, cover letters, and scholarship statement outlines from selected records with missing/unverified-source warnings. Social post drafts with local review times, manual active-recall cards with local review intervals, a basic weekly study goal/session log, offline shell caching, browser-native voice, and local portfolio drafts with preview and version history are also implemented. The Career workspace includes manually configured interview plans, separate format-aware Learn and mock Q&A modes, autosaved mock answers, browser dictation, a transparent deterministic local assessment rubric, editable STAR stories, a prep checklist, reverse-interview prompts, pitch/debrief notes, and Study recall handoff. Optional Supabase email-link auth, passkey sign-in, and revision-checked manual workspace copy/restore are implemented; new cloud uploads now exclude email, application, portfolio, and social drafts while restores preserve the device's drafts. Older deployed cloud rows may still contain drafts until replaced from an updated device. Workspace JSON backup/restore remains a local-file operation. The minimal Rust health API is scaffolded; cloud-first relational sync, the Gmail/Outlook connector, opportunity discovery, live portfolio publishing, camera observation, and AI remain unstarted. Rust code has not been compiled because the toolchain is unavailable in the workspace.

## 1. Product vision

Build a polished personal assistant that helps the user capture information, plan their day, study toward goals, manage career opportunities, maintain a portfolio, and prepare/publish social content. It should feel like one coherent personal workspace across browser, desktop, and mobile.

The product is “smart” through a reliable context model, specialized workflows, useful retrieval, transparent action proposals, and feedback—not through unrestricted tool access. Deterministic application code owns permissions, persistence, scheduling, and action execution. Models interpret requests, reason over relevant context, and prepare drafts.

## 2. Goals

- Provide a shared experience across web, desktop, and mobile.
- Support text, voice, images, links, and files as first-class inputs.
- Capture explicit and extracted metadata with provenance and user correction.
- Support offline capture, reading, and editing with understandable sync behavior.
- Help plan free time and set realistic daily and weekly goals.
- Support study, job applications, scholarships, email drafts, portfolio updates, and social content.
- Provide an advanced but calm dashboard with useful visualizations and a clear activity history.
- Require explicit, content-specific approval for consequential external actions.
- Keep the service lightweight and avoid no-code automation products.
- Maintain useful personal context with provenance, freshness, user control, and clear scope boundaries.
- Proactively surface high-value next steps without interrupting or over-scheduling the user.
- Verify workflow outcomes, recover from failures, and improve quality from explicit feedback.

## 3. Non-goals for the first release

- A fully autonomous agent with unrestricted browser, email, file, or social-account access.
- Guaranteed offline model inference. Offline mode covers local data and capture; model calls need a network unless a local model is added later.
- Automatically signing declarations, making financial decisions, paying bills, or accepting/declining offers.
- Circumventing platform APIs, rate limits, account requirements, or publishing rules.
- Importing a complete third-party product as the app’s design or implementation.

## 4. Product capabilities

### 4.1 Universal capture and personal library

Capture text, dictate a voice note, take/select an image, share a link, or attach a file. The system creates an inbox item and proposes a type: note, task, deadline, study material, job, scholarship, portfolio update, or social idea. The user can correct the type and extracted fields before they become structured records.

The browser prototype also offers a foreground click-to-talk panel with typed fallback, a temporary transcript, device text-to-speech, and a small set of local task, note, focus, and day-summary commands. This is a transport/demo layer, not the conversational AI. Browser speech recognition support and processing location vary; disclose that before the first microphone session, do not persist raw audio, and provide a clear stop control. User-saved voice transcripts carry voice modality metadata.

Keep original assets distinct from generated transcripts, OCR, summaries, and structured records. Extracted values include their source, confidence, and timestamp. Do not automatically turn every capture into a lasting personal fact.

### 4.2 Daily planning and study

- Read calendar availability and ask which open blocks are genuinely usable.
- Let the user set a target, available duration, energy level, and preferred reminder style.
- Create a flexible plan with buffers and breaks; allow manual edits.
- Study modes: explain, plan, focus, quiz, active recall, and review.
- Log session topics, completion, confidence, and follow-up topics.
- Estimate topic mastery from practice results and user confidence; adapt question difficulty and suggest spaced review while keeping estimates visible and editable.
- Use these records to suggest future revision and adjust goals.
- Ask before moving calendar events or sending invitations.

### 4.3 Career and scholarships

- Save opportunities and extract organization, role/program, location, eligibility, deadline, and source link.
- Discover opportunities on a schedule from public employer and scholarship sources. Prefer first-party board APIs; use a rate-limited, source-allowlisted page reader only where access is permitted. Preserve the original URL, retrieval time, and exact requirement excerpts, and mark closed or stale postings.
- Compare each job or award with the user's current profile and master CV. Show each requirement as **meets**, **missing**, or **unknown**, cite the supporting profile fact or source text, and explain the match. Treat this as decision support, never a guarantee of eligibility.
- Tailor a CV or scholarship response from sourced facts and the posting's requirements. Keep the generated, unsubmitted draft on the user's device; send only relevant source excerpts to the configured AI provider for generation and disclose that processing route.
- For scholarships, maintain editable eligibility checks and document readiness per opportunity. Treat suggested checklist entries as prompts only, verify each requirement against the official award information, and attach the source to each checked criterion.
- Keep one explicit next action and optional due date per opportunity; show the nearest dated action in Today Radar, and reserve push notifications for a later reminder-preferences milestone.
- Connect Gmail or Outlook through delegated OAuth with the narrowest available scopes. Keep the mail provider as the inbox source of truth; fetch message bodies when needed and store only selected online metadata, sync cursors, and action status in Silverstone.
- Keep education, experience, skills, achievements, credentials, and projects in a private online evidence library; verification is a user confirmation against a source label or link.
- Compare requirements with a verified profile and evidence-backed experience facts.
- Generate tailored CVs, cover letters, essays, checklists, and interview notes.
- The current local Draft Studio creates editable CV excerpts, cover letters, and scholarship statement outlines from selected evidence. It copies the chosen record text, stores source record IDs, and flags deleted or not-yet-reviewed records. It does not write model-generated claims, determine whether claims are supported by source documents, or submit the application.
- Prepare interviews with role-specific Learn and Q&A modes, practice questions, answer feedback, a reusable STAR story bank, a readiness checklist, interviewer questions, and post-interview debrief notes.
- Mark unsupported claims and ask for missing information rather than inventing it.
- Track stages, deadlines, contacts, documents, and next actions.
- Prepare application forms where possible; require review before submission.
- Keep reusable, user-verified application answers with sources and freshness dates.
- Where allowed, offer browser-assisted form preparation in the user's session, then pause for field-by-field review and final submission. Stop at sign-in, MFA, CAPTCHA, attestations, or unsupported steps and hand control to the user.

### 4.4 Email and personal administration

- Summarize and classify connected messages, identify dates/action items, and prepare reply drafts. Keep reply drafts on the user's device until the user sends or explicitly exports them.
- Before sending, show the exact recipients, subject, body, attachments, and sending account. Send only after the user approves that specific message, and record the provider's response without treating acceptance as proof of delivery.
- Track appointments, renewals, reminders, and household tasks.
- Keep sending, booking, payments, and commitments behind explicit action policies.

### 4.5 Portfolio

- Store projects, evidence, skills, images, outcomes, links, and case-study sections.
- Treat Silverstone's Portfolio module as the private editor and publishing console for Bravine's public portfolio at `https://bravinemunialo.vercel.app/`. Keep unpublished edits as device-only drafts; put approved published content in the online content store consumed by the public site.
- Draft portfolio updates from user notes or selected project records.
- Show a preview and a diff against the live content.
- Publish an exact, user-approved version through a least-privilege content API or reviewable repository/deployment change; preserve version history, verify the resulting public URL, and provide rollback.

### 4.6 Creator Studio and social publishing

- Turn an idea or portfolio update into platform-specific drafts.
- Support captions, media, alt text, hashtags, and per-platform previews.
- Keep a calendar with draft, approval, queued, publishing, published, failed, and cancelled states.
- Store scheduled jobs on the server so publishing does not depend on the phone or desktop app staying open.
- Require approval of the exact final content and target accounts before first scheduling/publishing.
- Retry safely only when the platform response makes retry safe; use idempotency keys and show ambiguous outcomes for manual review.
- Show analytics only where the platform API grants access and defines the metric.
- Maintain a user-approved brand profile with tone, audience, themes, excluded claims/topics, and examples; let the user edit each platform variant.
- Propose content reuse from portfolio releases or completed projects, with source links and a preview of every channel's version.

Platform access is a product dependency. The documented Meta Instagram publishing workflow is for Professional accounts; Facebook access is Page-oriented. X provides post creation through its API; this design schedules through the app’s own server worker. Verify account eligibility, permissions, application review, cost/access, and supported media types before implementing each connector. Provide a manual-publish reminder when official API access is unavailable.

### 4.7 Personal dashboard and visualizations

The dashboard should answer “What needs my attention?” and “How are my goals progressing?” rather than displaying decorative metrics.

- **Today:** agenda, next task, free-time suggestions, study target, and pending approvals.
- **Study:** goal progress, planned versus completed sessions, revision topics, and deadlines.
- **Career:** application pipeline, upcoming deadlines, and next action by opportunity.
- **Studio:** content calendar, queued/published posts, and available engagement trends.
- **Portfolio:** pending content changes, recent published updates, and broken/incomplete project fields where data is available.
- **Activity:** recent agent runs, sources consulted, actions proposed, approvals, outcomes, and sync events.
- **Memory and Trust:** facts/preferences the assistant may use, their sources and freshness, connected services and permissions, retention, and deletion controls.
- **Observation:** live source status, recently observed events, inferred signals, suggested tasks, quiet hours, exclusions, and pause/revoke controls. Make collection status and last-read time obvious; separate source health from AI conclusions.
- **Weekly review:** goal progress, completed work, postponed commitments, decisions, and next-week suggestions.
- **Why this?** Each proactive recommendation can show its trigger, evidence, relevance to a goal, and confidence.

Every chart has a clear title, timeframe, units, data source, and useful empty state. Prefer timelines for deadlines, calendars for schedules, tables/boards for workflows, and trend charts for progress. Avoid using a chart where a list or next-action callout is clearer.

### 4.8 Goals, constraints, and adaptive planning

- Let the user connect long-term aims to outcomes, milestones, projects, and next actions.
- Plan around deadlines, dependencies, calendar commitments, available time, preferred work windows, energy, breaks, and user-stated priorities.
- Show tradeoffs when time is insufficient; suggest what to defer or reduce rather than filling every open slot.
- Revisit plans after missed sessions or new commitments without guilt-oriented streaks or pressure.
- Keep goals editable and distinguish the user's stated goal from an agent-suggested goal.

### 4.9 Proactive monitoring and follow-through

- Monitor only connected sources and user-enabled rules for deadlines, study review dates, pending applications, unanswered messages, scheduled posts, and waiting tasks.
- Explain why a suggestion appeared, what source triggered it, its urgency, and the proposed next step.
- Offer accept, edit, snooze, dismiss, or disable controls. Respect quiet hours, per-category interrupt limits, and notification preferences.
- Learn from repeated dismissals only as an inspectable preference and let the user reset it.
- Keep long-running tasks resumable across app closure, device changes, and approval pauses.
- Verify external outcomes when possible (for example, post ID, deployment URL, or sent-message status). Show “unverified” when confirmation is unavailable; do not report success based only on an attempted request.

### 4.10 Research and decision support

- Research current questions using sources appropriate to the topic; prefer primary or authoritative sources when available.
- Attach source links, publication dates, claims, and retrieval time to important conclusions.
- Separate sourced facts, model synthesis, and recommendations. Surface disagreement, weak evidence, and stale material.
- Save a research brief into the Library and reuse it in an application, study plan, portfolio draft, or decision.
- Compare options against user-stated criteria and show tradeoffs; leave the final decision with the user.

### 4.11 Meetings and follow-ups

- Prepare for selected events with an agenda, relevant notes, goals, and open questions.
- Let the user capture notes or dictate a recap, then extract decisions, owners, and due dates for review.
- Create follow-up message drafts and tasks with links back to the event and notes.
- Recording or processing other people's speech requires a clear user-controlled consent step; meeting summaries must be editable before sharing.

### 4.12 Inspectable memory and feedback

- Keep distinct: verified facts, explicit preferences, workspace/project context, activity history, and derived search indexes.
- Let the user inspect, edit, scope, expire, export, or delete remembered facts and preferences.
- Learn a preference only from an explicit user instruction or opt-in feedback rule; show when it will apply and provide reset controls.
- Ask when a material fact is missing, conflicting, stale, or uncertain. Keep generated claims linked to evidence and let the user correct them at the point of use.
- Record corrections as feedback. Use them to update a user-approved fact or preference, not silently as model training.
- Offer context workspaces such as Study, Career, Personal, and Creator. The user can choose which facts, files, and integrations are available in each workspace.
- Provide one-tap capture from the mobile share sheet, a desktop shortcut, or a home-screen action; keep background microphone and broad file access opt-in and visible.

### 4.13 Optional later life modules

These extend the assistant after the core planning, study, career, portfolio, and publishing workflows are reliable:

| Module | Useful actions | Boundary |
|---|---|---|
| Routines and wellbeing | Track user-defined habits, exercise plans, breaks, and check-ins | No diagnosis, treatment, or pressure-based streaks |
| Travel and household | Organize itineraries, packing lists, recurring home tasks, and local reminders | Confirm bookings and use location only when enabled |
| Finance overview | Track due dates, subscriptions, and user-imported spending summaries | Read-only summaries; no payments, investment decisions, or account transfers |
| Relationships and follow-up | Remember user-requested follow-ups, contact context, and draft messages | No inferred emotional scoring or messages sent without approval |

### 4.14 Observation Mode and personal context

Observation Mode is an opt-in, read-only layer that helps the assistant notice useful context across selected sources and suggest next steps. It does not authorize sending, publishing, purchasing, changing account settings, or placing trades. Observation and action permissions are separate, and each connected source has its own scope, status, and pause/revoke control.

The user can set each connector to **Off**, **Observe**, **Suggest**, or **Act**. `Observe` can collect the minimum enabled signals; `Suggest` can turn those signals into a reviewable insight, draft, or task; `Act` is separately configured and still subject to the action and approval policy. The status should be visible in the Trust Center and in the app shell whenever a sensor is active.

Potential observation sources, subject to operating-system and provider capability:

| Source | Useful signals | Default boundary |
|---|---|---|
| Selected local folders | New or changed files, document dates, project material | User selects allowed folders and exclusions; index metadata first and read full contents only when needed |
| Browser and saved web content | User-selected tabs, bookmarks, and pages for research or follow-up | Explicit browser extension permission; selected-tab capture first, no hidden browsing-history collection |
| Email, calendar, contacts, and supported messages | Deadlines, commitments, follow-ups, people and organizations the user chose to track | Official delegated APIs and per-category scopes; never assume all personal chats are accessible |
| Work, school, and cloud services | Tasks, course deadlines, project updates, and shared files from supported services | Connect only named workspaces/folders and approved APIs; keep employer/school data in a separate context |
| Social accounts and creator analytics | Mentions, post status, and available account insights | Official APIs only; keep reading separate from publishing and account administration |
| Security notices and selected inbound content | Explain suspicious links, impersonation cues, unusual payment requests, or provider security alerts | Advisory only with evidence and uncertainty; never collect passwords/MFA codes or change security settings automatically |
| Device activity and diagnostics | Foreground app, optional window title, user-set focus sessions, battery, storage, connectivity, and selected device model/OS data | Explicit OS permission, app/site exclusions, no keystroke capture, no hidden screen recording or remote control |
| Notifications | Source app, timestamp, category, and optionally selected content | Per-app opt-in; allow sensitive-app exclusions and content masking |
| Camera, microphone, and clipboard | Camera can provide live visual signals and, in an explicitly enabled session, save derived notes to cloud memory; microphone/clipboard remain separate inputs | Camera off by default, visible time-bounded session; raw frames never persisted; notes are provenance-tagged and user-deletable; no ambient audio or persistent clipboard history |
| Location, travel, and environment | Coarse location or a user-selected trip context for timely reminders | Off by default; collect only for a defined task, with short retention |
| Health and wearables | User-selected sleep/activity summaries to schedule routines and study sessions | Off by default; wellbeing support only, not diagnosis or treatment |
| Bank and brokerage accounts | Balances, transactions, holdings, and user-defined threshold alerts where official access exists | Read-only by default; no transfers, orders, or investment decisions |
| Smart home and connected devices | User-selected status and routine triggers | Add later; explicit per-device permissions and confirmation for locks, alarms, purchases, or other consequential controls |

Use a metadata-first event pipeline: record the source, time, permission mode, minimal event type, retention deadline, and a link to the original item. Extracted details must retain provenance and confidence. When the user explicitly enables **Save observation notes** for a camera session, Silverstone may write derived, timestamped notes directly to the online Observation Memory without asking for each note. Mark them as observations, keep their source and confidence, and never promote them to verified profile facts without user confirmation. Correlate events into a reviewable timeline—for example, an email deadline plus a calendar block plus a study goal—and explain why each suggestion appeared.

The user must be able to pause all observation immediately, pause one source, inspect recent reads and derived signals, set quiet hours, exclude sources or content categories, select local-only processing where supported, set retention, and export/delete records. Never collect passwords, authentication codes, payment-card data, or hidden screen contents. Mask password managers, MFA prompts, and financial screens from any optional visual context capture. Do not promise universal access: validate each connector against official APIs, platform permissions, account eligibility, and current terms before adding it.

Connector-specific planning constraints:

- Telegram needs an explicit connector choice. The Bot API provides bot access; TDLib is the client library for building a Telegram client. These are different access models and must not be presented as equivalent ([Bot API](https://core.telegram.org/bots/api), [TDLib](https://core.telegram.org/tdlib/)).
- For WhatsApp and other private messaging, implement only a currently supported official integration or a platform-approved, user-initiated handoff. Do not promise import of every personal chat or scrape/automate unsupported clients.
- Social connectors must show exactly which account type and data scopes are supported before connecting. Keep social reading, publishing, and account administration as distinct permissions.
- Brokerage integrations start with read-only balances, holdings, transactions, and user-defined alerts when the provider permits them. Trading stays out of the initial release. If added later, require a separate execution feature, explicit order preview and confirmation for every order, a clear paper/live label, and hard user-defined limits. Broker scopes can distinguish read access from order placement; for example, Alpaca's `trading` scope permits placing, cancelling, or modifying orders ([Alpaca scopes](https://docs.alpaca.markets/us/docs/using-oauth2-and-trading-api)).

### 4.15 Context graph and just-in-time help

Connect user-approved records into a private context graph: goals, tasks, people, projects, events, documents, applications, posts, and evidence. Resolve duplicates conservatively, retain source links, and show conflicting details instead of silently choosing one. Use this graph to answer questions such as “what is waiting on me?”, “what can I study in this 30-minute gap?”, or “which portfolio project supports this application requirement?”

Proactive help should be thresholded by value and confidence. Show a concise reason and evidence, suggest one useful next action, and learn from accept/edit/snooze/dismiss choices only as an inspectable preference. Ask before promoting derived data to a verified profile fact, changing a schedule, contacting a person, submitting an application, publishing, or changing an external account. The explicit session-level **Save observation notes** setting may persist camera-derived text without a per-note prompt, but entries remain unverified and correctable. Prefer a quiet daily/weekly briefing when a signal is useful but not urgent.

Add a digital safety helper for user-selected messages, links, and official account alerts. It can explain suspicious cues and suggest verification through a known official channel, but it must label uncertainty and never auto-click links, forward messages, lock accounts, or change security settings.

### 4.16 Device and account concierge

Offer opt-in help for device health and supported account setup: explain storage/battery/connectivity problems, find relevant official manuals or support pages using the user-selected model and operating system, and guide through troubleshooting one step at a time. Use local diagnostics where possible and let the user choose which values to share. Do not silently scan installed apps, collect serial numbers, change system settings, install software, reset devices, or execute terminal commands. Show the exact proposed change and require confirmation before applying a consequential fix.

### 4.17 Live visual observation and memory

Let the user start a foreground camera session that works as a real-time visual sensor: Silverstone can observe the scene, make concise timestamped notes, and save those notes to online Observation Memory for later search. Starting requires browser/OS camera permission, a visible in-app “camera active” indicator, an elapsed-time/session label, and an immediate stop control. Keep the camera active only while the session is visibly running; stop all media tracks when stopped, timed out, the app is hidden/backgrounded, or permission is revoked. Browser camera access requires HTTPS and user permission ([getUserMedia requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)); never attempt silent or hidden activation.

Provide two distinct modes:

- **Local vision + saved notes:** analyze a live sample stream on-device where a suitable model is installed. Keep raw frames only in volatile memory. If **Save observation notes** is on, sync derived text notes and provenance to the user's cloud memory; do not upload frames.
- **Cloud vision + saved notes:** send only sampled frames needed for inference to the configured vision service, then discard local frame buffers. Save derived notes to online Observation Memory only when the user has enabled that session mode. Show the cloud route before starting and explain provider-side handling; Silverstone must not claim the frames never leave the device.

Raw images, video, thumbnails, and frame embeddings are never saved by Observation Mode. The separate **Save observation notes** setting controls derived text: when enabled, save timestamped notes with session ID, camera source, confidence, retention, and an **unverified observation** label. Make notes searchable but keep them separate from user-confirmed profile facts; let the user inspect, correct, export, and delete them. Do not enable audio unless the user separately starts microphone capture. Do not identify people or infer sensitive traits. Encourage pointing the camera at the item or scene the user wants help with, and avoid capturing bystanders or private screens. If the chosen service cannot meet the configured retention requirement, disable cloud-assisted mode and explain why.

## 5. Information architecture and interface

### Desktop shell

- Left navigation: Today, Study, Career, Portfolio, Studio, Library, Activity, Observation, Settings.
- Top command bar: global search, universal capture, voice control, and current workspace/context.
- Camera is started only by an explicit “Live visual context” action. Show the active camera state and session timer beside the preview and provide a one-tap stop control.
- Main canvas: one focused workflow or dashboard.
- Optional right inspector: source evidence, extracted metadata, approval details, or related records.
- Keyboard command palette and responsive collapsible navigation.
- Global search across tasks, conversations, captures, projects, and source-backed memories, with scope filters.
- Desktop shortcut and mobile share-sheet entry for quick capture; both land in the same reviewable inbox.

### Mobile shell

- Bottom navigation with a small number of primary destinations.
- Persistent capture affordance for text, voice, image, or file.
- Offer “Live visual context” as a separate camera action from saving a photo; show the active indicator, session timer, local/cloud route, and stop control.
- Single-column cards; convert wide tables into compact, filterable lists.
- Approval screen shows exact action, account/recipient, content, scheduled time, and relevant source.

### Visual direction

Use a calm, premium “quiet futuristic” style: graphite/ink surfaces, a readable light theme, restrained electric accent, precise typography, ample spacing, subtle borders, and motion only for meaningful state changes. Glass effects or glow can be accents; contrast and legibility take priority. Use semantic colors for success, waiting, warning, and failure.

Define design tokens for color, spacing, typography, radii, shadows, and motion before building screens. Use a consistent icon family and chart palette. Design loading, empty, error, offline, permission-denied, conflict, and success states alongside the happy path. Target keyboard access, screen-reader labels, visible focus, reduced motion, and accessible contrast.

### GitHub design references

Use these repositories as references for individual patterns, not as a copied full interface:

- [Plane](https://github.com/makeplane/plane): workflow states, boards, project navigation, and task organization.
- [Twenty](https://github.com/twentyhq/twenty): record lists, detail views, filters, and saved views.
- [shadcn/ui](https://github.com/shadcn-ui/ui): composable, customizable UI primitives and examples.
- [Langfuse](https://github.com/langfuse/langfuse): AI run traces, filters, dashboards, and activity inspection.

Check repository licenses before reusing source code. Use screenshots and live experiences to study density, hierarchy, and interaction behavior; create Silverstone-specific tokens and compositions.

## 6. Platform and offline architecture

### Client strategy

- Build one responsive React + TypeScript + Vite SPA.
- Serve it as an installable web PWA.
- Package the same frontend using Tauri 2 for Windows, macOS, Linux, iOS, and Android.
- Keep platform-specific APIs behind small adapters and permission prompts.
- Implement hardware and OS observation only through explicit platform capabilities. Prototype notification access, foreground-app context, background execution, location, and health APIs per operating system; do not assume the web app or every Tauri target can provide the same signals.
- Prototype microphone, camera/image selection, notifications, share sheets, secure storage, and background behavior on target platforms before locking in mobile packaging. Tauri plugin coverage differs across operating systems. If a critical mobile capability cannot meet quality requirements, use a dedicated native shell while keeping the same API and design tokens.

### Cloud-first and local storage

- Canonical user records live online in Supabase Auth/PostgreSQL and private object storage, protected by per-user RLS and automatic authenticated sync. Migrate away from the current single JSONB workspace-copy prototype to relational, versioned records before integrating live accounts.
- Migration `202611060002_cloud_first_records.sql` is the first additive schema foundation: it defines per-record non-draft workspace data, private profile/master-CV context, derived observation notes, email connection/header metadata, and a published-only portfolio table. The app still reads and writes the bootstrap JSONB copy; record sync and data migration are separate unfinished steps.
- Email connection/message metadata and portfolio publication rows are server-managed, with browser clients limited to reading their permitted data. The Rust API must enforce OAuth scope and exact-content approval before sending mail or publishing; its database integration is not implemented yet.
- Keep unsent email replies and unsubmitted application, portfolio, and social drafts in IndexedDB or Tauri SQLite on the originating device. Drafts stay out of cloud backup/sync unless the user explicitly exports, sends, or publishes them.
- The PWA caches its app shell and a clearly marked, read-only subset of recently synced records. Offline capture may be queued locally with a pending label until the server confirms receipt; do not call a cloud mutation saved before acknowledgment.
- Tauri client: SQLite stores device-only drafts, short-lived caches, and an explicit pending-sync outbox.
- Use a versioned sync protocol, per-device identifiers, idempotency keys, conflict resolution, and visible sync status.
- Encrypt credentials with platform secure storage; assess local database/media encryption before storing highly sensitive material.

### Offline behavior

Available offline: the app shell, read-only cached online records, local-only drafts, and new captures queued with a visible pending state. Cached records show their last sync time; queued records become canonical only after the server acknowledges sync.

Requires a connection: model reasoning unless a local model is later installed, email/calendar refresh, connected-platform data, cross-device sync, and external publishing.

An offline post can remain a local draft or proposed schedule. It is not a confirmed scheduled post until the server acknowledges it. If its intended time has passed before synchronization, ask whether to publish now, choose another time, or discard it.

### Conflict behavior

- Append-only activity/events merge by unique ID.
- Simple preferences may use last-write-wins with a visible updated time.
- Concurrent edits to applications, essays, CVs, and posts create a comparison/resolution view; do not silently overwrite.
- An approval becomes invalid if its payload, account, recipient, schedule, or relevant version changes.
- Never execute a stale external action from an offline queue without a fresh server-side policy check.

## 7. Backend and AI architecture

### Services

- Hosted web workspace: Supabase Auth, relational Postgres, private Storage, and per-user RLS provide the online source of truth. Migration `202611060002_cloud_first_records.sql` prepares initial domain tables, but the app still uses the manual JSONB bootstrap copy until per-record sync and a data cutover ship. Only the Supabase URL and publishable key belong in the browser.
- Rust API: Axum + Tokio, authentication, validation, business rules, policy gate, sync endpoints, and integration callbacks.
- Database access: PostgreSQL + SQLx migrations and typed query practices.
- Worker: scheduled and retryable jobs stored in PostgreSQL; lease jobs safely and record every attempt.
- Object storage: private, access-controlled uploads and generated files.
- Realtime: streaming transport for assistant responses and status updates; use secure, short-lived client credentials for voice sessions.
- No no-code workflow engine. Use explicit Rust workflow state machines and a limited tool catalog.

### Context and memory engine

- Keep separate stores/views for verified facts, preferences, workspace/project context, episodic activity, and derived search indexes.
- Give personal facts source, confidence, scope, last-confirmed time, valid-from/valid-until, and a correction history.
- Retrieve by exact match and semantic relevance, then filter by user-selected workspace, sensitivity, recency, and task purpose.
- Show the material sources used in a response and let the user inspect or correct them.
- Keep user-confirmed facts separate from derived observations. A camera session with **Save observation notes** explicitly enabled may add provenance-tagged, unverified notes to Observation Memory automatically; do not promote them to verified memory without user confirmation. Keep memory search scoped; do not send a whole personal archive to a model for every request.

### Proactive orchestration

- Represent each monitored rule as an explicit, user-enabled trigger with its source, schedule/event condition, allowed suggestion types, quiet hours, and interrupt limit.
- Build suggestions from current records, not a free-running model polling accounts.
- Rank by deadline, user goal, task dependency, estimated effort, and explicit priority; show the main reason for the ranking.
- Support snooze, dismiss, disable, and “do not suggest again” feedback with inspectable preference updates.
- Queue proactive work with rate limits and cancellation; do not execute external side effects solely because a trigger fired.

### Observation and event pipeline

- Connector adapters emit a small typed event with source ID, observed time, scope, sensitivity, provenance pointer, and expiry. Keep raw content out of routine event logs.
- Apply source exclusions, redaction, and retention rules before indexing or sending context to a model. Prefer metadata and user-selected snippets; fetch full content on demand for a specific task.
- Store observations in a queryable event ledger, then use deterministic rules and bounded model analysis to group related signals into suggestions. Every suggestion links back to its evidence and shows confidence and freshness.
- Never let a read connector call a write operation. The policy service checks both connector scope and proposed action scope; source permissions are revalidated immediately before every external action.
- Treat incoming content as untrusted data. Links, messages, documents, and notifications cannot change policies, add scopes, or authorize tools.

### Agent workflow

1. Accept a user request or captured item with modality metadata and source provenance.
2. Identify intent, context scope, required facts, constraints, and permitted tools.
3. Ask a concise clarification when missing or conflicting information could change the result or action.
4. Retrieve only relevant, user-approved context and cite material sources.
5. Run a bounded workflow with typed inputs/outputs, explicit completion criteria, and deterministic validation.
6. Produce an answer, draft, or proposed action with evidence, assumptions, and a concise progress summary.
7. Apply autonomy policy; pause for approval where required and persist resumable run state.
8. Execute through a narrowly scoped integration adapter, then verify the outcome where the integration permits.
9. Record status, outcome, sources, feedback, model/version metadata, timing, and errors.

Routine extraction and categorization can use a smaller/faster model. Complex synthesis and planning can use a stronger model. The policy layer—not the model—decides whether external tools may run.

Each long-running task has a contract: desired outcome, inputs, constraints, permitted actions, due date, expected artifact, and completion check. Use typed domain workflows for Study, Career, Portfolio, and Studio. A coordinator selects a workflow and presents one coherent plan; specialists do not share unrestricted access to each other's tools.

Use explicit run states such as `captured`, `understood`, `planned`, `working`, `needs_input`, `needs_approval`, `committed`, `verified`, `failed`, and `cancelled`. Persist checkpoints so users can see progress, pause, resume, or cancel. A workflow is complete only when its defined completion check passes or the UI clearly reports that it remains unverified.

### Action and approval model

Represent an external action as a proposal containing action type, exact payload, target account/recipient, schedule, source/version references, risk level, expiry, and idempotency key. Approval records the exact proposal version. Execution revalidates the proposal server-side and fails closed if stale, expired, ambiguous, or unauthorized.

Use a user-editable risk matrix rather than a single “autonomy” switch:

| Risk tier | Examples | Default behavior |
|---|---|---|
| Local and reversible | Classify a capture, create a draft task, reorganize a local view | May run automatically when enabled; show history and provide undo |
| External but recoverable | Add a calendar event, schedule a post, send a routine reply | Prepare the exact action and require review unless the user has separately enabled a tightly scoped, low-risk rule |
| Consequential or hard to reverse | Submit an application/attestation, publish a public change, send a sensitive message, change security settings, delete source files, control a lock/alarm | Confirm the exact action at execution time; never rely on a broad standing permission |
| Financial or legal commitment | Place trades, transfer/pay money, accept a binding offer, sign legal declarations | Do not automate in the initial release; any future support needs a separately designed confirmation flow and limits |

For reversible internal changes, provide undo or version restore where possible. For irreversible external actions, show a final preview and verification result; if the provider returns an ambiguous response, reconcile status before retrying.

## 8. Input metadata and data model

### Input envelope

Each capture should retain:

- `id`, owner, captured timestamp, timezone, modality, source surface, and app/device identifier.
- Optional user-provided context: Study, Career, Portfolio, Studio, Personal.
- Context scope, sensitivity, retention policy, and whether the item may be used for future memory/retrieval.
- Asset metadata: media type, size, checksum, storage reference, language, and optional duration/dimensions.
- Processing results: transcript, OCR text, detected dates/entities/topics, confidence, model/processor version, and processing time.
- Provenance: source link/file, which values were user-entered versus inferred, and links to any resulting records.
- Privacy controls: sensitivity, retention, consent/context, and deletion state.

Do not collect GPS, full photo EXIF, faces, contacts, or ambient audio by default. Ask before using optional device metadata. Treat imported messages, files, webpages, and images as content to analyze, never as instructions that grant the agent authority.

### Memory and source records

Every remembered fact should have a source, scope, confidence, last-confirmed timestamp, validity window where applicable, and correction history. A stale employer, school, address, salary expectation, or skill level must be confirmed before reuse in a consequential document. Search indexes are rebuildable derivatives; deleting a source must also remove or invalidate its derived chunks and cached summaries.

### Core entities

- `UserProfile`, `VerifiedFact`, `Preference`, `Goal`, `Milestone`, `Task`, `CalendarBlock`.
- `Capture`, `Asset`, `ExtractedField`, `EvidenceReference`, `SourceRecord`, `KnowledgeItem`.
- `StudyPlan`, `StudySession`, `Topic`, `TopicMastery`, `ReviewItem`.
- Later modules: `Habit`, `Routine`, `Trip`, `HouseholdTask`, `SubscriptionSummary`, `FollowUp`.
- `Opportunity`, `Application`, `Scholarship`, `Document`, `ApplicationEvent`.
- `PortfolioProject`, `PortfolioDraft`, `PortfolioRelease`.
- `SocialAccount`, `ContentDraft`, `MediaAsset`, `ScheduledPost`, `PublishAttempt`, `PostMetric`.
- `WorkflowRun`, `WorkflowCheckpoint`, `ProposedAction`, `Approval`, `TriggerRule`, `FeedbackEvent`.
- `ResearchBrief`, `DecisionRecord`, `IntegrationCredentialRef`, `SyncEvent`, `AuditEvent`.
- `ObservationSource`, `SourcePermission`, `ObservationEvent`, `DerivedSignal`, `RetentionRule`, `DeviceConsent`, `BrokerConnection`, `MarketSnapshot`.

Keep credentials outside normal record tables; store references to platform-secure or server secret storage.

## 9. Security, privacy, and observability

- Request least-privilege OAuth scopes and use delegated account access where available.
- Keep model/API credentials on the trusted server; never embed long-lived secrets in the web bundle.
- Use encrypted transport, platform secure storage, account/session revocation, export, and deletion controls.
- Redact prompt and personal-content bodies from routine logs; make any diagnostic retention configurable.
- Maintain an append-only action history with proposal, approval, execution, and result states.
- Protect against prompt injection by separating untrusted source text from system policy and requiring user approval for side effects.
- Track workflow success, factual corrections, missed deadlines, approval turnaround, sync conflicts, model latency, and cost.
- Provide an internal trace view for debugging, with personal content redacted by default.
- Add an AI/data control center for per-workspace context access, model-provider routing, cloud/local processing preference where available, retention, and usage limits.
- Make integrations individually connectable, scoped, pausable, and revocable; show requested permissions, last successful sync, and recent reads/writes.
- Separate `observe`, `suggest`, and `act` capabilities for every connector, account, and data category. Default new connections to the minimum read scope; never infer permission to write from permission to read.
- Show observation status, per-source last-read timeline, “pause all” control, exclusions, retention, local/cloud processing route, export, and deletion. Use OS permission dialogs only after explaining the feature that needs them.
- Require explicit per-source consent for device activity, notifications, camera, microphone, clipboard, location, health, and smart-home data. Camera/microphone/clipboard remain off except for user-started capture or a specific temporary workflow.
- Use OAuth or an official provider flow where available. Do not collect provider passwords, MFA codes, session cookies, or browser profile secrets. Keep finance connectors read-only and isolate them from ordinary action tools.
- Maintain versioned, privacy-reviewed evaluation scenarios for fact extraction, factual drafting, source grounding, clarification behavior, approval policy, outcome verification, and sync recovery.
- Track usefulness as well as activity: accepted suggestions, draft edits, dismissed prompts, completed tasks, incorrect claims, and verified versus unverified outcomes.

Do not optimize for tool-call count or time in app. Use user outcomes, correction rates, unwanted interruptions, and safe completion as the quality signals.

### Product quality scorecard

- **Capture:** extraction accuracy for dates, names, and task fields; user correction rate; source attribution completeness.
- **Memory and research:** retrieval relevance, stale-fact detection, citation coverage, and unsupported-claim rate.
- **Study:** user-rated helpfulness, topic mastery change, confidence calibration, and successful review timing.
- **Career and portfolio:** proportion of generated factual claims linked to verified evidence; amount of editing needed before approval.
- **Actions:** correct target and payload, approvals shown at the right boundary, verified completion rate, duplicate/ambiguous outcomes, and recovery time.
- **Proactivity:** accepted, snoozed, and dismissed suggestions; unwanted interruption reports; reminders that prevented missed deadlines.
- **Offline:** drafts retained, sync completion, conflict resolution, and lost local changes (target: none).

Keep a small, versioned set of representative scenarios for each high-impact workflow. Add user-corrected failures as privacy-reviewed cases. Compare workflow outcomes when prompts, models, retrieval, or policies change; keep evaluation independent from any one model vendor's evaluation service.

## 10. Technical decisions and open questions

### Current recommendations

- Rust owns policy, workflows, scheduling, sync, and integration adapters.
- React/Vite provides one UI source for PWA and Tauri packages.
- PostgreSQL is the shared server database; SQLite/IndexedDB provide local-first storage.
- First model integration is provider-adapted HTTP/Rust client code; AI provider details remain replaceable.
- Social scheduling is server-side after explicit approval and confirmation.

### Resolve before implementation

- Target operating systems and whether iOS app-store distribution is required.
- Preferred sign-in and hosting model; self-hosted versus managed server/storage.
- Email/calendar provider and requested permission scope.
- Social account types (especially Instagram Professional vs personal, and Facebook Page access) and API app approval status.
- Portfolio hosting/repository and whether publishing should create a pull request or deploy directly after approval.
- Data retention preference for voice, images, transcripts, prompts, and model traces.
- Arabic/English requirements, RTL behavior, and default timezone.
- Whether offline local AI is a later requirement or network-based AI is acceptable.

## 11. Reference documentation

- [Tauri overview](https://v2.tauri.app/start/) and [frontend setup](https://v2.tauri.app/start/frontend/)
- [Tauri plugin support](https://v2.tauri.app/plugin/) and [prerequisites](https://v2.tauri.app/start/prerequisites/)
- [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) and [service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/), [Android runtime permission guidance](https://developer.android.com/training/permissions/requesting), and [Apple privacy guidance](https://developer.apple.com/design/human-interface-guidelines/privacy/)
- [Axum](https://docs.rs/axum/latest/axum/) and [SQLx](https://docs.rs/sqlx/latest/sqlx/)
- [OpenAI API SDKs](https://developers.openai.com/api/docs/libraries), [voice agents](https://developers.openai.com/api/docs/guides/voice-agents), and [image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) and [file search with citations](https://developers.openai.com/api/docs/guides/tools-file-search); implement application-owned policy and a provider-independent quality/evaluation harness.
- [Meta Instagram API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [Meta Facebook API](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api), and [X API post management](https://github.com/xdevplatform/docs/blob/main/x-api/posts/manage-tweets/introduction.mdx)
