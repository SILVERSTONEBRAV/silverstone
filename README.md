# Silverstone — Personal Agent

## Overview

Silverstone is a private, multimodal assistant for coordinating everyday plans, study, career opportunities, a portfolio, communications, research, and social content. It keeps useful personal context with sources, turns goals into plans, follows open tasks through to verified outcomes, and offers proactive help within user-defined limits. It is designed as a web app and installable app, with desktop and mobile packages sharing the same account, data, workflows, and approval rules.

The planned assistant accepts text, voice, images, links, and files. The current preview includes typed chat plus click-to-talk browser speech input and spoken device-voice replies for a few local task, note, and focus commands. Browser speech support varies, and the browser speech service may process audio; Silverstone itself does not save a recording. The full product is designed to turn captures into organized notes, tasks, study material, opportunity records, or content drafts. Live visual context, reliable offline data sync, AI reasoning, connected services, and publishing are not implemented yet.

## Product principles

- Keep the user in control of external actions.
- Keep personal facts and uploaded material traceable to their sources.
- Make the current state visible: draft, approval needed, queued, synced, published, or failed.
- Explain important recommendations with their source, reason, and uncertainty.
- Keep memory inspectable and correctable; scope it to the user's current workspace.
- Offer broad optional observation source by source, while keeping observation, recommendations, and actions as separate permissions.
- Make routine planning and capture quick; keep complex work reviewable.
- Work offline for local capture and editing, and explain what still needs a connection.
- Use focused workflows over one unrestricted agent with broad access.
- Verify actions and report uncertainty instead of claiming success from an attempted operation.
- Keep transient camera input and derived visual notes out of saved history unless the user explicitly saves them.

## Main areas

- **Today:** agenda, priorities, open-time suggestions, reminders, and daily check-in.
- **Study:** goals, study blocks, notes, quizzes, revision, and progress.
- **Career:** job and scholarship discovery, fit tracking, evidence-based CV and essay drafts, deadlines, and interview preparation.
- **Portfolio:** project records, case studies, draft updates, previews, and publishing history.
- **Studio:** social content drafts, platform previews, approvals, scheduling, post status, and available insights.
- **Capture and Library:** text, voice, images, links, files, extracted metadata, and searchable personal knowledge.
- **Memory and Research:** inspectable facts and preferences, source-backed answers, decision notes, and saved research.
- **Observation:** opt-in source monitoring, event timeline, cross-source signals, suggested next steps, quiet hours, exclusions, retention, and pause/revoke controls.
- **Activity and Trust:** action history, approvals, integration status, sync state, observation reads, permissions, and AI workflow details.
- **Device Concierge (later):** guided troubleshooting based on user-selected device details and diagnostics, with review before system changes.

Later modules may add user-defined wellbeing routines, travel and household planning, read-only finance summaries, and relationship follow-ups. These remain opt-in and retain their own action boundaries.

## Autonomy levels

1. **Read and organize:** summarize, classify, extract deadlines, and update local planning records.
2. **Prepare:** draft replies, CVs, essays, portfolio changes, and posts.
3. **Act after approval:** send a message, submit an application, publish a portfolio change, or schedule/publish social content.
4. **Human decision:** signatures, attestations, accepting offers, payments, and other consequential commitments.

Approvals are bound to the specific action and content shown to the user. If the payload changes or becomes stale, approval is required again.

Observation Mode is read-only by itself. Each source has an independent `Off`, `Observe`, `Suggest`, or `Act` setting, with a visible status and immediate pause control. `Act` still follows the risk-based approval policy. Finance and brokerage access starts read-only; device sensors such as microphone, camera, clipboard, location, and health data require separate opt-in. Connector coverage depends on official APIs, account type, platform permissions, and provider approval, so the app will state supported coverage before connection rather than promise universal account access.

Live camera processing has a separate session control from general Observation Mode. “No-save” means the app does not create or retain the media file or visual notes. Cloud-assisted processing still transmits the necessary frames for inference; strict device-only handling requires local vision inference. The selected processing route must be visible before camera access starts.

## Platform and technology direction

- **Frontend:** React, TypeScript, and Vite as a responsive single-page application.
- **Web:** Progressive web app with cached application assets and IndexedDB for offline data.
- **Desktop and mobile:** Tauri 2 packages the shared interface; validate native capabilities on target operating systems before committing to this route.
- **Backend:** Rust with Axum and Tokio.
- **Server data:** PostgreSQL with SQLx; private object storage for uploads and generated documents.
- **Device data:** SQLite for Tauri applications; IndexedDB for the browser PWA.
- **AI:** provider adapter for text, structured output, image understanding, transcription, and optional realtime voice. Keep policy and workflow state in application code.
- **Scheduling:** Rust worker with durable jobs stored in PostgreSQL. Social publishing runs from the server after an approved post is confirmed there.
- **Automation:** application-owned Rust workflows and platform APIs; no no-code automation service.

## Delivery approach

1. Define the visual system and validate the Tauri/offline/native feature path.
2. Build the Rust service, action policy, durable workflow state, inspectable memory, and offline sync foundation.
3. Add the shared app shell, multimodal capture, Today, goals, and study planning.
4. Add career and scholarship workflows using verified facts and source-backed drafts.
5. Add portfolio editing, previews, versioning, and approved release.
6. Add research with citations and bounded proactive follow-through.
7. Add social content, platform connections, approvals, and server-side scheduling.
8. Expand dashboards, quality evaluation, voice interactions, and optional life modules.

## Current implementation

The first browser shell is in place. It includes responsive navigation, Today and module dashboards, local task and note capture, local search, task completion, a persisted weekly study goal with available-time planning and completed-session tracking, a focus timer, light/dark themes, a PWA app-shell cache, an online/offline indicator, and a foreground voice panel. Browser workspace data is stored in IndexedDB, with migration from earlier Silverstone/Orbit localStorage keys and localStorage fallback when IndexedDB is unavailable. Voice uses browser speech recognition and device text-to-speech; its temporary conversation can create local tasks and voice-origin notes, start focus, or summarize the local task list. This is not an AI conversation, and it does not provide speech parity across browsers. A minimal Rust/Axum health endpoint and frontend health contract are scaffolded but Rust is not installed in the workspace, so that service has not been compiled. Preview data is illustrative and is not connected to external accounts. Browser data is not an encrypted vault; keep sensitive information out of this preview. Tauri SQLite storage, sync, authentication, AI, account sync, camera visual mode, and integrations are not implemented.

To run the browser app, use `npm install` once and then `npm run dev`. `npm run build` produces the production static app in `dist/`. When Rust is installed, run the health API with `cargo run -p silverstone-server`; the Vite development server proxies `/api/*` to `127.0.0.1:8787`.

## Planning documents

- [Product and technical design](design.md)
- [Implementation task tracker](TASKS.md)

The task tracker records planned work, current implementation state, and dependencies. It distinguishes the current prototype from the remaining product work; partially implemented work is marked in progress.
