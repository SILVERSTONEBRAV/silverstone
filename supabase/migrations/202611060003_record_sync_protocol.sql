-- Atomic, revision-checked replacement for the first per-record sync UI.
-- Run after 202611060002_cloud_first_records.sql.

create table if not exists public.silverstone_record_sync_heads (
  user_id uuid primary key references auth.users (id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.silverstone_record_sync_heads enable row level security;
revoke all on table public.silverstone_record_sync_heads from anon, authenticated;
grant select on table public.silverstone_record_sync_heads to authenticated;
grant select, insert, update on table public.silverstone_record_sync_heads to service_role;

drop policy if exists "Read own Silverstone sync head" on public.silverstone_record_sync_heads;
create policy "Read own Silverstone sync head"
  on public.silverstone_record_sync_heads for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own Silverstone sync head" on public.silverstone_record_sync_heads;
drop policy if exists "Update own Silverstone sync head" on public.silverstone_record_sync_heads;

-- Record writes and revision changes go through the validated RPC, not direct
-- browser table writes, so clients cannot bypass the revision check.
revoke all on table public.silverstone_records from anon, authenticated;
grant select on table public.silverstone_records to authenticated;
grant select, insert, update, delete on table public.silverstone_records to service_role;

drop policy if exists "Create own Silverstone records" on public.silverstone_records;
drop policy if exists "Update own Silverstone records" on public.silverstone_records;
drop policy if exists "Delete own Silverstone records" on public.silverstone_records;

create or replace function public.read_silverstone_records()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'revision', coalesce((
      select h.revision
      from public.silverstone_record_sync_heads h
      where h.user_id = (select auth.uid())
    ), 0),
    'updated_at', (
      select h.updated_at
      from public.silverstone_record_sync_heads h
      where h.user_id = (select auth.uid())
    ),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'record_type', r.record_type,
        'record_id', r.record_id,
        'payload', r.payload,
        'revision', r.revision,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      ) order by r.record_type, r.record_id)
      from public.silverstone_records r
      where r.user_id = (select auth.uid())
    ), '[]'::jsonb)
  );
$function$;

create or replace function public.replace_silverstone_records(
  p_records jsonb,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_revision bigint;
  v_next_revision bigint;
begin
  if v_user_id is null then
    raise exception 'Sign-in is required to sync Silverstone records.' using errcode = '42501';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Cloud records must be supplied as a JSON array.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_records) > 5000 then
    raise exception 'A single sync cannot contain more than 5000 records.' using errcode = '22023';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision cannot be negative.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or jsonb_typeof(item.value -> 'record_type') is distinct from 'string'
      or jsonb_typeof(item.value -> 'record_id') is distinct from 'string'
      or jsonb_typeof(item.value -> 'payload') is distinct from 'object'
      or item.value -> 'payload' ->> 'id' is distinct from item.value ->> 'record_id'
      or item.value ->> 'record_type' not in (
        'task', 'capture', 'study_goal', 'study_session', 'study_card',
        'career_opportunity', 'interview_prep', 'star_story', 'career_evidence'
      )
      or char_length(item.value ->> 'record_id') not between 1 and 200
  ) then
    raise exception 'A cloud record has an invalid type, ID, or payload.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records) as item(value)
    group by item.value ->> 'record_type', item.value ->> 'record_id'
    having count(*) > 1
  ) then
    raise exception 'A sync cannot contain duplicate record IDs of the same type.' using errcode = '22023';
  end if;

  insert into public.silverstone_record_sync_heads (user_id, revision, updated_at)
  values (v_user_id, 0, now())
  on conflict (user_id) do nothing;

  select h.revision into v_revision
  from public.silverstone_record_sync_heads h
  where h.user_id = v_user_id
  for update;

  if v_revision <> p_expected_revision then
    raise exception 'Cloud records changed since they were loaded. Refresh before syncing.' using errcode = '40001';
  end if;

  delete from public.silverstone_records r where r.user_id = v_user_id;

  insert into public.silverstone_records (
    user_id, record_type, record_id, payload, revision, created_at, updated_at
  )
  select
    v_user_id,
    item.value ->> 'record_type',
    item.value ->> 'record_id',
    item.value -> 'payload',
    1,
    now(),
    now()
  from jsonb_array_elements(p_records) as item(value);

  v_next_revision := v_revision + 1;
  update public.silverstone_record_sync_heads
  set revision = v_next_revision,
      updated_at = now()
  where user_id = v_user_id;

  -- Retain the old row as a compatibility snapshot, but remove draft collections
  -- from it so drafts uploaded by earlier builds are not left in the active copy.
  update public.silverstone_workspaces
  set workspace = workspace || jsonb_build_object(
        'portfolioProjects', '[]'::jsonb,
        'socialPosts', '[]'::jsonb,
        'emailItems', '[]'::jsonb,
        'careerDrafts', '[]'::jsonb
      ),
      revision = revision + 1,
      updated_at = now()
  where user_id = v_user_id;

  return v_next_revision;
end;
$function$;

revoke all on function public.read_silverstone_records() from public, anon, service_role;
grant execute on function public.read_silverstone_records() to authenticated;

revoke all on function public.replace_silverstone_records(jsonb, bigint) from public, anon, service_role;
grant execute on function public.replace_silverstone_records(jsonb, bigint) to authenticated;

comment on function public.replace_silverstone_records(jsonb, bigint) is
  'Atomically replaces one authenticated user record set, rejecting stale revisions and draft record types.';
