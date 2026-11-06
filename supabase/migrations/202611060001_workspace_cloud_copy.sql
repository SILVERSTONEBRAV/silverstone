create table if not exists public.silverstone_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace jsonb not null check (jsonb_typeof(workspace) = 'object'),
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);

alter table public.silverstone_workspaces enable row level security;

revoke all on table public.silverstone_workspaces from anon, authenticated;
grant select, insert, update on table public.silverstone_workspaces to authenticated;

drop policy if exists "Read own Silverstone workspace" on public.silverstone_workspaces;
create policy "Read own Silverstone workspace"
  on public.silverstone_workspaces
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own Silverstone workspace" on public.silverstone_workspaces;
create policy "Create own Silverstone workspace"
  on public.silverstone_workspaces
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own Silverstone workspace" on public.silverstone_workspaces;
create policy "Update own Silverstone workspace"
  on public.silverstone_workspaces
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.save_silverstone_workspace(
  p_workspace jsonb,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_next_revision bigint;
begin
  if v_user_id is null then
    raise exception 'Sign-in is required to save a cloud workspace.' using errcode = '42501';
  end if;

  if p_workspace is null or jsonb_typeof(p_workspace) <> 'object' then
    raise exception 'Workspace data must be a JSON object.' using errcode = '22023';
  end if;

  if p_expected_revision < 0 then
    raise exception 'Expected revision cannot be negative.' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.silverstone_workspaces (user_id, workspace, revision, updated_at)
    values (v_user_id, p_workspace, 1, now())
    on conflict (user_id) do nothing
    returning revision into v_next_revision;
  else
    update public.silverstone_workspaces
    set workspace = p_workspace,
        revision = revision + 1,
        updated_at = now()
    where user_id = v_user_id
      and revision = p_expected_revision
    returning revision into v_next_revision;
  end if;

  if v_next_revision is null then
    raise exception 'Workspace revision conflict. Refresh before saving.' using errcode = '40001';
  end if;

  return v_next_revision;
end;
$function$;

revoke all on function public.save_silverstone_workspace(jsonb, bigint) from public, anon;
grant execute on function public.save_silverstone_workspace(jsonb, bigint) to authenticated;
