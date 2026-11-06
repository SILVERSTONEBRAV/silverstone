-- Silverstone cloud-first record foundation.
-- Run after 202611060001_workspace_cloud_copy.sql. The existing workspace-copy
-- table remains a bootstrap path until application sync is migrated.

create table if not exists public.silverstone_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  record_type text not null check (record_type in (
    'task',
    'capture',
    'study_goal',
    'study_session',
    'study_card',
    'career_opportunity',
    'interview_prep',
    'star_story',
    'career_evidence'
  )),
  record_id text not null check (char_length(record_id) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_type, record_id)
);

create index if not exists silverstone_records_user_type_updated_idx
  on public.silverstone_records (user_id, record_type, updated_at desc);

alter table public.silverstone_records enable row level security;
revoke all on table public.silverstone_records from anon, authenticated;
grant select, insert, update, delete on table public.silverstone_records to authenticated;
grant select, insert, update, delete on table public.silverstone_records to service_role;

drop policy if exists "Read own Silverstone records" on public.silverstone_records;
create policy "Read own Silverstone records"
  on public.silverstone_records for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own Silverstone records" on public.silverstone_records;
create policy "Create own Silverstone records"
  on public.silverstone_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own Silverstone records" on public.silverstone_records;
create policy "Update own Silverstone records"
  on public.silverstone_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own Silverstone records" on public.silverstone_records;
create policy "Delete own Silverstone records"
  on public.silverstone_records for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.silverstone_records is
  'Per-record private workspace data. The record_type allowlist deliberately excludes email, application, portfolio, and social drafts.';

create table if not exists public.silverstone_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile) = 'object'),
  master_cv jsonb not null default '{}'::jsonb check (jsonb_typeof(master_cv) = 'object'),
  timezone text not null default 'UTC',
  locale text not null default 'en',
  updated_at timestamptz not null default now()
);

alter table public.silverstone_profiles enable row level security;
revoke all on table public.silverstone_profiles from anon, authenticated;
grant select, insert, update, delete on table public.silverstone_profiles to authenticated;
grant select, insert, update, delete on table public.silverstone_profiles to service_role;

drop policy if exists "Read own Silverstone profile" on public.silverstone_profiles;
create policy "Read own Silverstone profile"
  on public.silverstone_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own Silverstone profile" on public.silverstone_profiles;
create policy "Create own Silverstone profile"
  on public.silverstone_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own Silverstone profile" on public.silverstone_profiles;
create policy "Update own Silverstone profile"
  on public.silverstone_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own Silverstone profile" on public.silverstone_profiles;
create policy "Delete own Silverstone profile"
  on public.silverstone_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.silverstone_observation_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid,
  observed_at timestamptz not null,
  source text not null check (source in ('camera', 'file', 'calendar', 'email', 'manual', 'other')),
  note text not null check (char_length(note) between 1 and 10000),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'user_confirmed', 'dismissed')),
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists silverstone_observation_notes_user_time_idx
  on public.silverstone_observation_notes (user_id, observed_at desc);

alter table public.silverstone_observation_notes enable row level security;
revoke all on table public.silverstone_observation_notes from anon, authenticated;
grant select, insert, update, delete on public.silverstone_observation_notes to authenticated;
grant select, insert, update, delete on public.silverstone_observation_notes to service_role;

drop policy if exists "Read own Silverstone observation notes" on public.silverstone_observation_notes;
create policy "Read own Silverstone observation notes"
  on public.silverstone_observation_notes for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own Silverstone observation notes" on public.silverstone_observation_notes;
create policy "Create own Silverstone observation notes"
  on public.silverstone_observation_notes for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own Silverstone observation notes" on public.silverstone_observation_notes;
create policy "Update own Silverstone observation notes"
  on public.silverstone_observation_notes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own Silverstone observation notes" on public.silverstone_observation_notes;
create policy "Delete own Silverstone observation notes"
  on public.silverstone_observation_notes for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.silverstone_observation_notes is
  'Private, derived observation notes only. Do not add raw image, video, or audio storage here.';

create table if not exists public.silverstone_email_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  account_email text not null,
  granted_scopes text[] not null default '{}',
  connection_status text not null default 'pending'
    check (connection_status in ('pending', 'connected', 'revoked', 'error')),
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, account_email)
);

alter table public.silverstone_email_connections enable row level security;
revoke all on table public.silverstone_email_connections from anon, authenticated;
grant select on public.silverstone_email_connections to authenticated;
grant select, insert, update, delete on public.silverstone_email_connections to service_role;

drop policy if exists "Read own Silverstone email connections" on public.silverstone_email_connections;
create policy "Read own Silverstone email connections"
  on public.silverstone_email_connections for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own Silverstone email connections" on public.silverstone_email_connections;
drop policy if exists "Update own Silverstone email connections" on public.silverstone_email_connections;
drop policy if exists "Delete own Silverstone email connections" on public.silverstone_email_connections;

create table if not exists public.silverstone_email_message_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.silverstone_email_connections (id) on delete cascade,
  provider_message_id text not null,
  provider_thread_id text,
  sender_email text not null,
  subject text not null default '',
  received_at timestamptz not null,
  labels text[] not null default '{}',
  has_attachments boolean not null default false,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_message_id)
);

create index if not exists silverstone_email_message_metadata_user_time_idx
  on public.silverstone_email_message_metadata (user_id, received_at desc);

alter table public.silverstone_email_message_metadata enable row level security;
revoke all on table public.silverstone_email_message_metadata from anon, authenticated;
grant select on public.silverstone_email_message_metadata to authenticated;
grant select, insert, update, delete on public.silverstone_email_message_metadata to service_role;

drop policy if exists "Read own Silverstone email metadata" on public.silverstone_email_message_metadata;
create policy "Read own Silverstone email metadata"
  on public.silverstone_email_message_metadata for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own Silverstone email metadata" on public.silverstone_email_message_metadata;
drop policy if exists "Update own Silverstone email metadata" on public.silverstone_email_message_metadata;
drop policy if exists "Delete own Silverstone email metadata" on public.silverstone_email_message_metadata;

comment on table public.silverstone_email_connections is
  'Private provider connection metadata only; OAuth access and refresh tokens belong in encrypted server-side storage.';
comment on table public.silverstone_email_message_metadata is
  'Private email headers and status only. Message bodies and unsent reply drafts are deliberately excluded.';

create table if not exists public.silverstone_portfolio_publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  site_key text not null check (char_length(site_key) between 1 and 120),
  slug text not null check (char_length(slug) between 1 and 200),
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  version integer not null default 1 check (version >= 1),
  public_url text,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_key, slug)
);

alter table public.silverstone_portfolio_publications enable row level security;
revoke all on table public.silverstone_portfolio_publications from anon, authenticated;
grant select (site_key, slug, title, description, content, version, public_url, published_at)
  on public.silverstone_portfolio_publications to authenticated;
grant select (site_key, slug, title, description, content, version, public_url, published_at)
  on public.silverstone_portfolio_publications to anon;
grant select, insert, update, delete on public.silverstone_portfolio_publications to service_role;

drop policy if exists "Read published Silverstone portfolio content" on public.silverstone_portfolio_publications;
create policy "Read published Silverstone portfolio content"
  on public.silverstone_portfolio_publications for select to anon, authenticated
  using (true);

drop policy if exists "Read own Silverstone portfolio content" on public.silverstone_portfolio_publications;
drop policy if exists "Publish own Silverstone portfolio content" on public.silverstone_portfolio_publications;
drop policy if exists "Update own Silverstone portfolio content" on public.silverstone_portfolio_publications;
drop policy if exists "Unpublish own Silverstone portfolio content" on public.silverstone_portfolio_publications;

comment on table public.silverstone_portfolio_publications is
  'Contains intentionally published portfolio content only. Keep unpublished drafts on the originating device.';
