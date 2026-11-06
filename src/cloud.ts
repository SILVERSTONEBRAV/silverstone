import type { LocalAppState } from './types';
import { parseWorkspaceState } from './store';
import { supabase } from './supabase';

export interface CloudWorkspaceSnapshot {
  workspace: LocalAppState | null;
  revision: number;
  updatedAt: string | null;
}

export async function loadCloudWorkspace(): Promise<CloudWorkspaceSnapshot> {
  const client = supabase;
  if (!client) throw new Error('Supabase is not configured for this deployment.');

  const { data, error } = await client
    .from('silverstone_workspaces')
    .select('workspace, revision, updated_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { workspace: null, revision: 0, updatedAt: null };

  return {
    workspace: parseWorkspaceState(data.workspace),
    revision: Number(data.revision),
    updatedAt: data.updated_at,
  };
}

export async function saveCloudWorkspace(workspace: LocalAppState, expectedRevision: number): Promise<void> {
  const client = supabase;
  if (!client) throw new Error('Supabase is not configured for this deployment.');

  const { error } = await client.rpc('save_silverstone_workspace', {
    p_workspace: workspace,
    p_expected_revision: expectedRevision,
  });
  if (error) {
    if (error.code === '40001') throw new Error('The cloud copy changed since it was loaded. Refresh it before trying again.');
    throw new Error(error.message);
  }
}
