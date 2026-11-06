# Supabase setup for Silverstone

**Current prototype:** Silverstone keeps its working workspace in IndexedDB and offers optional Supabase sign-in plus explicit **Create cloud copy**, **Replace cloud copy**, and **Restore to this device** actions. This copies the complete JSON workspace rather than synchronizing individual records.

**Draft boundary:** Earlier deployed versions uploaded the entire JSON workspace, including email reply, application, portfolio, and social drafts. The current branch excludes those four draft collections during cloud upload and preserves each device's own drafts on restore. Deploy this update before using cloud copy. If an older cloud row contains drafts, replace it from an updated device to overwrite those fields with empty collections; the relational cloud-first sync is still planned.

## 1. Create the private workspace table

Open the Supabase project’s **SQL Editor** and run [`supabase/migrations/202611060001_workspace_cloud_copy.sql`](supabase/migrations/202611060001_workspace_cloud_copy.sql). It creates one JSONB workspace row per authenticated user, enables RLS, and adds the revision-checked save function used by Silverstone.

The function is `SECURITY INVOKER`; table grants and RLS continue to apply. Only the signed-in owner can read or write their own row. No anonymous access or client-side delete permission is granted.

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

## 4. Add the two variables the current app uses

Copy `.env.example` to `.env.local` and set these values from the Supabase project's **Connect** dialog or **Settings → API Keys**:

| Variable | Value | Vercel type |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL, such as `https://your-project-ref.supabase.co` | Config |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key | Config |

Add them to the `silverstoneb` Vercel project for the environments you use, then redeploy. These `VITE_` values are compiled into the browser bundle, so they are public configuration. The publishable key is safe in a client only when all data access is correctly protected by RLS.

The current app does not use Gmail, Microsoft Graph, an AI provider, or a portfolio publishing credential. Adding those credentials now will not enable integrations. Do not put OAuth client secrets, AI API keys, Supabase secret keys, or `service_role` keys in any `VITE_` variable, browser bundle, or Git commit. Add secrets only after the server-side integration exists, to the environment of the Rust API/worker that will use them. If a future Vercel Function handles a callback, add its server-only credentials as Vercel **Secret** variables, never with a `VITE_` prefix. Vercel's current environment-variable UI distinguishes Config and Secret types ([Vercel docs](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types)).

Supabase's current key guidance uses publishable keys for browser clients and secret keys only in controlled server components; secret keys bypass RLS and must never be shipped to a browser ([Supabase API key docs](https://supabase.com/docs/guides/getting-started/api-keys)).

### Credentials for integrations (not used yet)

Do not create these until the server-side integration is implemented. The recommended Rust API/worker is a separate service, so its secrets belong in that service host's secret manager—not in the Vercel frontend project. Add them to Vercel only if a future Vercel Function actually reads them.

| Variable | Used for | Type and placement |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Gmail OAuth client | Config; Rust API host (the ID is not a password) |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth code exchange | Secret; Rust API host only |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook OAuth, only if selected instead of Gmail | Config / Secret; Rust API host |
| `OPENAI_API_KEY` (or the chosen model provider's key) | Job/CV drafting and optional cloud vision | Secret; Rust API host only |
| `VITE_SILVERSTONE_API_URL` | Public base URL of the deployed Rust API, if the browser needs a direct URL | Config; Vercel frontend |

Gmail access is OAuth, not a Gmail password or an API key. The consent screen must request only the scopes needed for reading and sending; Google's Gmail scopes have different sensitivity and verification requirements ([scope guide](https://developers.google.com/workspace/gmail/api/auth/scopes)). OAuth refresh tokens belong in encrypted server-side storage, not Vercel environment variables or browser storage. If we keep the Rust service on a separate host, set its provider/model secrets there. Never send secrets in chat; add them directly in the deployment dashboard.

## 5. Use the cloud copy

In Silverstone, open **Settings → Supabase online workspace**, sign in, and choose **Create cloud copy** to upload online workspace records. The current build excludes email, application, portfolio, and social drafts, and a restore preserves drafts already on that device. Replacing a cloud copy and restoring online records both ask first. If another device updated the row since it was loaded, refresh before uploading again.

The current integration is manual and user-scoped. Automatic cloud-first sync, relational record storage, device-only draft isolation, merge/conflict resolution, provider OAuth, portfolio publishing, and server-side AI/vision jobs are later milestones. Before wiring the live portfolio site, inspect its source repository and add only read access to published content on the public site; never expose a server secret there.
