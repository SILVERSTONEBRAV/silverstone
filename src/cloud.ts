import type { LocalAppState } from './types';
import { parseWorkspaceState } from './store';
import { supabase } from './supabase';

export type CloudWorkspaceSource = 'records' | 'legacy' | 'empty';

export interface CloudWorkspaceSnapshot {
  workspace: LocalAppState | null;
  revision: number;
  updatedAt: string | null;
  source: CloudWorkspaceSource;
}

type CloudRecordType =
  | 'task'
  | 'capture'
  | 'study_goal'
  | 'study_session'
  | 'study_card'
  | 'career_opportunity'
  | 'interview_prep'
  | 'star_story'
  | 'career_evidence';

interface CloudRecord {
  record_type: CloudRecordType;
  record_id: string;
  payload: unknown;
}

const emptyWorkspace = (): LocalAppState => ({
  version: 13,
  tasks: [],
  captures: [],
  studyGoal: null,
  studySessions: [],
  portfolioProjects: [],
  careerOpportunities: [],
  socialPosts: [],
  studyCards: [],
  interviewPreps: [],
  starStories: [],
  careerEvidence: [],
  emailItems: [],
  careerDrafts: [],
});

function workspaceToRecords(workspace: LocalAppState): CloudRecord[] {
  const records: CloudRecord[] = [];
  const add = (record_type: CloudRecordType, payload: { id: string }) => {
    records.push({ record_type, record_id: payload.id, payload });
  };

  workspace.tasks.forEach((item) => add('task', item));
  workspace.captures.forEach((item) => add('capture', item));
  if (workspace.studyGoal) add('study_goal', workspace.studyGoal);
  workspace.studySessions.forEach((item) => add('study_session', item));
  workspace.studyCards.forEach((item) => add('study_card', item));
  workspace.careerOpportunities.forEach((item) => add('career_opportunity', item));
  workspace.interviewPreps.forEach((item) => add('interview_prep', item));
  workspace.starStories.forEach((item) => add('star_story', item));
  workspace.careerEvidence.forEach((item) => add('career_evidence', item));

  return records;
}

function recordsToWorkspace(value: unknown): LocalAppState {
  if (!Array.isArray(value)) throw new Error('The cloud record response is not a list.');

  const workspace = emptyWorkspace();
  const seen = new Set<string>();
  const collections: Record<CloudRecordType, unknown[]> = {
    task: [],
    capture: [],
    study_goal: [],
    study_session: [],
    study_card: [],
    career_opportunity: [],
    interview_prep: [],
    star_story: [],
    career_evidence: [],
  };

  for (const valueRow of value) {
    if (!valueRow || typeof valueRow !== 'object' || Array.isArray(valueRow)) {
      throw new Error('The cloud contains an invalid record.');
    }
    const row = valueRow as Partial<CloudRecord>;
    const types = Object.keys(collections) as CloudRecordType[];
    if (typeof row.record_type !== 'string' || !types.includes(row.record_type as CloudRecordType)
      || typeof row.record_id !== 'string' || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
      throw new Error('The cloud contains an unsupported record type or payload.');
    }

    const recordType = row.record_type as CloudRecordType;
    const payload = row.payload as { id?: unknown };
    if (payload.id !== row.record_id) throw new Error('A cloud record ID does not match its payload.');
    const key = `${recordType}\u0000${row.record_id}`;
    if (seen.has(key)) throw new Error('The cloud contains duplicate record IDs.');
    seen.add(key);
    collections[recordType].push(row.payload);
  }

  if (collections.study_goal.length > 1) throw new Error('The cloud contains more than one active study goal.');
  workspace.tasks = collections.task as LocalAppState['tasks'];
  workspace.captures = collections.capture as LocalAppState['captures'];
  workspace.studyGoal = (collections.study_goal[0] as LocalAppState['studyGoal']) ?? null;
  workspace.studySessions = collections.study_session as LocalAppState['studySessions'];
  workspace.studyCards = collections.study_card as LocalAppState['studyCards'];
  workspace.careerOpportunities = collections.career_opportunity as LocalAppState['careerOpportunities'];
  workspace.interviewPreps = collections.interview_prep as LocalAppState['interviewPreps'];
  workspace.starStories = collections.star_story as LocalAppState['starStories'];
  workspace.careerEvidence = collections.career_evidence as LocalAppState['careerEvidence'];

  return parseWorkspaceState(workspace);
}

function parseRecordSnapshot(value: unknown): { revision: number; updatedAt: string | null; records: unknown[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Supabase returned an invalid cloud record snapshot.');
  }
  const snapshot = value as { revision?: unknown; updated_at?: unknown; records?: unknown };
  if (!Number.isSafeInteger(snapshot.revision) || (snapshot.revision as number) < 0 || !Array.isArray(snapshot.records)) {
    throw new Error('Supabase returned an invalid cloud record revision.');
  }
  return {
    revision: snapshot.revision as number,
    updatedAt: typeof snapshot.updated_at === 'string' ? snapshot.updated_at : null,
    records: snapshot.records,
  };
}

async function loadLegacyWorkspace(): Promise<{ workspace: LocalAppState | null; updatedAt: string | null }> {
  const client = supabase;
  if (!client) throw new Error('Supabase is not configured for this deployment.');
  const { data, error } = await client
    .from('silverstone_workspaces')
    .select('workspace, updated_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { workspace: null, updatedAt: null };
  return { workspace: parseWorkspaceState(data.workspace), updatedAt: data.updated_at };
}

export async function loadCloudWorkspace(): Promise<CloudWorkspaceSnapshot> {
  const client = supabase;
  if (!client) throw new Error('Supabase is not configured for this deployment.');

  const { data, error } = await client.rpc('read_silverstone_records');
  if (error) throw new Error(error.message);
  const recordSnapshot = parseRecordSnapshot(data);

  if (recordSnapshot.revision > 0 || recordSnapshot.records.length > 0) {
    return {
      workspace: recordsToWorkspace(recordSnapshot.records),
      revision: recordSnapshot.revision,
      updatedAt: recordSnapshot.updatedAt,
      source: 'records',
    };
  }

  const legacy = await loadLegacyWorkspace();
  if (legacy.workspace) {
    return { workspace: legacy.workspace, revision: 0, updatedAt: legacy.updatedAt, source: 'legacy' };
  }
  return { workspace: null, revision: 0, updatedAt: null, source: 'empty' };
}

export async function saveCloudWorkspace(workspace: LocalAppState, expectedRevision: number): Promise<void> {
  const client = supabase;
  if (!client) throw new Error('Supabase is not configured for this deployment.');

  const { error } = await client.rpc('replace_silverstone_records', {
    p_records: workspaceToRecords(workspace),
    p_expected_revision: expectedRevision,
  });
  if (error) {
    if (error.code === '40001') throw new Error('The cloud records changed since they were loaded. Refresh before syncing.');
    throw new Error(error.message);
  }
}
