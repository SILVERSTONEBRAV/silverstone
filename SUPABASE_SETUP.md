# Supabase setup for Silverstone

**Current prototype:** Silverstone keeps its working workspace in IndexedDB and offers optional Supabase sign-in plus explicit per-record **Create cloud records**, **Replace cloud records**, and **Restore to this device** actions. Sync is user-triggered and replaces the online record set atomically; automatic background sync and conflict merging are not implemented.

**Draft boundary:** Earlier deployed versions uploaded the entire JSON workspace, including email reply, application, portfolio, and social drafts. Per-record sync excludes those four collections and preserves each device's own drafts on restore. The first successful per-record replacement also clears those draft collections from the legacy JSON row. Existing records in an older copy are not merged automatically; restore that copy to a device before replacing it if it contains changes you need.

## 1. Create the bootstrap workspace table

Open the Supabase project’s **SQL Editor** and run [`supabase/migrations/202611060001_workspace_cloud_copy.sql`](supabase/migrations/202611060001_workspace_cloud_copy.sql). It creates the legacy JSONB workspace row and its revision-checked save function, which older builds used and which the current build reads only as a compatibility source during migration.

The function is `SECURITY INVOKER`; table grants and RLS continue to apply. Only the signed-in owner can read or write their own row. No anonymous access or client-side delete permission is granted.

## 1a. Prepare the cloud-first record schema

After migration `202611060001_workspace_cloud_copy.sql`, run [`supabase/migrations/202611060002_cloud_first_records.sql`](supabase/migrations/202611060002_cloud_first_records.sql) in the SQL Editor. It adds per-record storage for non-draft tasks, captures, study records, career records, and interview preparation; a private profile/master-CV record; private observation notes; email connection and message-header metadata; and a separate portfolio-publication table.

Every private table has RLS policies scoped to the signed-in owner. The portfolio-publication table is the only table with anonymous read access, and it contains published content only; public clients can query its content columns but cannot read the owner ID or write rows. Email connection/message metadata and portfolio publications are writable only by the trusted `service_role`, so future OAuth and publication flows must go through the server-side API and its approval checks. Unsent email replies, application drafts, portfolio drafts, social drafts, email bodies, and OAuth tokens are not stored in these tables. Provider tokens belong in encrypted server-side storage.

This migration prepares the tables but does not add the record-sync RPCs or migrate the old JSONB row. Continue with the next migration before using the current Settings sync controls.

## 1b. Add atomic record sync

Run [`supabase/migrations/202611060003_record_sync_protocol.sql`](supabase/migrations/202611060003_record_sync_protocol.sql) after migration 002. It adds a per-account sync revision and two RPCs: a read-only `SECURITY INVOKER` reader and a narrowly scoped `SECURITY DEFINER` replacement function with a fixed search path and authenticated-user check. Browser clients can read their rows but cannot write the records or revision table directly; writes go through the atomic replacement function, which rejects stale revisions. The first successful replacement also clears old draft collections from the compatibility JSON row.

The UI's **Replace cloud records** action replaces the full online set, including removals, after confirmation. It is not an automatic offline outbox: until background sync and a merge/conflict interface ship, sync manually after changes and refresh before replacing if another device may have changed the cloud set.

## 2. Create the account and configure email links

The current email flow signs in existing accounts only. In Supabase **Authentication → Users**, create your account. In **Authentication → URL Configuration**, set:

- **Site URL:** `https://silverstoneb.vercel.app`
- **Redirect URL:** `https://silverstoneb.vercel.app`
- For local email-link development, also allow `http://localhost:5173`.

The email provider must be enabled and able to deliver sign-in links. The app does not enable open public sign-up.

## 3. Configure passkeys (optional)

Supabase currently labels passkey support experimental. In **Authentication → Passkeys**, enable passkey authentication and use:

- **Relying Party Display Name:** `Silverstone`
- **Relying Party ID:** `silverstoneb.vercel.app`
- **Relying Party Origins:** `https://silverstoneb.vercel.app`

Use the production site for passkey enrollment and sign-in. Local development can use the email link. If Silverstone later moves to a custom domain, passkeys registered to the Vercel domain will need to be registered again for the new domain. Keep email sign-in enabled as a recovery route.

Passkeys use the device’s authenticator (biometric, device PIN, or security key). The biometric check stays with the operating system; Supabase stores the public credential. This depends on browser and device support.

## 4. Configure the browser and Rust API

Copy `.env.example` to `.env.local` and set these values from the Supabase project's **Connect** dialog or **Settings → API Keys**:

| Variable | Value | Vercel type |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL, such as `https://your-project-ref.supabase.co` | Config |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key | Config |
| `VITE_SILVERSTONE_API_URL` | Base URL of the separately deployed Rust API, without a path | Config |

Add the first two to the `silverstoneb` Vercel project for the environments you use. Set `VITE_SILVERSTONE_API_URL` after deploying the Rust API. These `VITE_` values are compiled into the browser bundle, so they are public configuration. The publishable key is safe in a client only when all data access is correctly protected by RLS.

The voice assistant now has an optional OpenAI Responses API route through the Rust API. The browser sends only the text of an AI turn; the Rust server validates the Supabase session and keeps the model key private. The API image builds successfully for Linux and runs as a non-root user. Local task/note commands continue to work without cloud AI. Do not put OAuth client secrets, AI API keys, Supabase secret keys, or `service_role` keys in any `VITE_` variable, browser bundle, or Git commit. Vercel's current environment-variable UI distinguishes Config and Secret types ([Vercel docs](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types)).

Supabase's current key guidance uses publishable keys for browser clients and secret keys only in controlled server components; secret keys bypass RLS and must never be shipped to a browser ([Supabase API key docs](https://supabase.com/docs/guides/getting-started/api-keys)).

### Rust API host variables

Deploy the Rust API separately from the Vite frontend. A container build is available at `server/Dockerfile`; the host must provide HTTPS, set `PORT`, and store server variables in its secret manager. Set:

| Variable | Used for | Placement |
|---|---|---|
| `SILVERSTONE_SUPABASE_URL` | Verifies the signed-in user session through Supabase Auth | Rust API host; Config |
| `SILVERSTONE_SUPABASE_PUBLISHABLE_KEY` | Supabase Auth verification request; publishable, not a secret | Rust API host; Config |
| `OPENAI_API_KEY` | Voice panel's cloud AI responses | Rust API host; Secret |
| `OPENAI_MODEL` | Responses API model; defaults to `gpt-6-astra` | Rust API host; Config |
| `SILVERSTONE_ALLOWED_ORIGINS` | Comma-separated frontend origins allowed by CORS; defaults to `https://silverstoneb.vercel.app,http://localhost:5173` | Rust API host; Config |
| `PORT` | Container listen port; bind address defaults to `0.0.0.0` when set | Rust API host; supplied by host |
| `SILVERSTONE_LISTEN_ADDR` | Optional explicit socket address; overrides `PORT` | Rust API host; Config |

Set `VITE_SILVERSTONE_API_URL` in Vercel to the API origin, for example `https://api.example.com` (no `/v1` suffix). The model key is optional: without it, the API starts in degraded mode and local assistant commands still work. AI requests are limited to 12 per signed-in account per minute in one API process; use a shared limiter before running multiple replicas. Every AI request checks the Supabase session with Auth, so it requires an internet connection. The request uses OpenAI's Responses API with `store: false`; the OpenAI account's other data-handling rules still apply.

In local development, copy `.env.example` to `.env.local`; the Rust server reads that ignored file, while Vite exposes only variables prefixed with `VITE_`. Never commit the populated `.env.local` file. Do not add a Supabase secret/service-role key; this API path does not need one.

Build and run the container locally from the repository root with `docker build -f server/Dockerfile -t silverstone-api .`, then `docker run --env-file .env.local -e PORT=8080 -p 8080:8080 silverstone-api`. For a hosted API, configure the same server variables in that host's secret manager, deploy the container, then put its HTTPS origin in Vercel as `VITE_SILVERSTONE_API_URL`.

### Credentials for integrations (not used yet)

Gmail, Microsoft Graph, and portfolio publishing are not connected. Add their OAuth credentials only when those server-side integrations are implemented; keep them on the Rust API host, never in Vercel `VITE_` variables.

| Variable | Used for | Type and placement |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Gmail OAuth client | Config; Rust API host (the ID is not a password) |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth code exchange | Secret; Rust API host only |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook OAuth, only if selected instead of Gmail | Config / Secret; Rust API host |
| `PORTFOLIO_PUBLISH_TOKEN` | Only if a future approved publishing adapter uses a token | Secret; Rust API host |

Gmail access is OAuth, not a Gmail password or an API key. The consent screen must request only the scopes needed for reading and sending; Google's Gmail scopes have different sensitivity and verification requirements ([scope guide](https://developers.google.com/workspace/gmail/api/auth/scopes)). OAuth refresh tokens belong in encrypted server-side storage, not Vercel environment variables or browser storage. If we keep the Rust service on a separate host, set its provider/model secrets there. Never send secrets in chat; add them directly in the deployment dashboard.

## 5. Use cloud records

In Silverstone, open **Settings → Supabase online workspace**, sign in, and choose **Create cloud records** to upload non-draft records one row per item. The UI excludes email, application, portfolio, and social drafts, and a restore preserves drafts already on that device. Replacing records removes cloud records absent from this device, so review the confirmation and refresh before syncing if another device may have changed the set. If an older JSON cloud copy is detected, restore it first if it contains changes not present on this device.

The current records integration is manual and user-scoped; automatic sync and conflict merging remain. The voice panel can use the authenticated Rust/OpenAI text endpoint when its server variables are configured. It does not yet retrieve workspace memory or use tools, and email OAuth, opportunity discovery, portfolio publishing, social scheduling, and camera vision remain future integrations. Before wiring the live portfolio site, inspect its source repository and add only read access to published content on the public site; never expose a server secret there.
