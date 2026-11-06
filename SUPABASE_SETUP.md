# Supabase setup for Silverstone

Silverstone keeps IndexedDB as its local/offline workspace. The Settings page adds an optional Supabase sign-in and explicit **Create cloud copy**, **Replace cloud copy**, and **Restore to this device** actions. It does not upload every edit automatically. Cloud writes use a revision check so a stale device cannot silently overwrite a newer cloud copy.

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

## 4. Add client-safe project settings

Copy `.env.example` to `.env.local` and set the Supabase **Project URL** and **publishable key**. Add the same two variables in Vercel **Project Settings → Environment Variables** for Production, then redeploy.

`VITE_` variables are compiled into browser JavaScript. The publishable key is intended for browser use with correct RLS policies. Never put a Supabase secret or `service_role` key in `.env.local`, Vercel client variables, or Git. The `.env.local` file is ignored by Git.

## 5. Use the cloud copy

In Silverstone, open **Settings → Supabase cloud copy**, sign in, and choose **Create cloud copy** to upload this browser’s workspace. On another device, sign in and choose **Restore to this device**. Replacing a cloud copy and restoring locally both ask first. If another device updated the row since it was loaded, refresh before uploading again.

The current integration is manual and user-scoped. Automatic background sync, merge/conflict resolution, cloud deletion, and server-side AI jobs are later milestones.
