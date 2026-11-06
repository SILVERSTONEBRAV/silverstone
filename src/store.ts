import type { AgentTask, CaptureItem, LocalAppState, StudyGoal, StudySession } from './types';

const DATABASE_NAME = 'silverstone-local';
const DATABASE_VERSION = 1;
const OBJECT_STORE = 'records';
const WORKSPACE_KEY = 'workspace';
const LEGACY_STORAGE_KEYS = ['silverstone.local.v2', 'silverstone.local.v1', 'orbit.local.v1'];
const FALLBACK_MODE_KEY = 'silverstone.storage-fallback.v1';

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface WorkspaceRecord {
  key: string;
  state: unknown;
}

const sampleTasks: AgentTask[] = [
  {
    id: 'task-study-1',
    title: 'Complete the ownership practice set',
    category: 'Study',
    dueLabel: '10:30 AM',
    done: false,
  },
  {
    id: 'task-career-1',
    title: 'Review fellowship essay draft',
    category: 'Career',
    dueLabel: 'Today',
    done: false,
  },
  {
    id: 'task-portfolio-1',
    title: 'Add the results section to my case study',
    category: 'Portfolio',
    dueLabel: 'Today',
    done: false,
  },
  {
    id: 'task-personal-1',
    title: 'Send the reading list to Sam',
    category: 'Personal',
    dueLabel: 'Tomorrow',
    done: true,
  },
];

let databasePromise: Promise<IDBDatabase> | null = null;
let activeStorageBackend: 'indexeddb' | 'localstorage' = 'indexeddb';

export function createInitialState(): LocalAppState {
  return {
    version: 2,
    tasks: sampleTasks,
    captures: [],
    studyGoal: null,
    studySessions: [],
  };
}

function normalizeLocalAppState(value: unknown): LocalAppState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { version?: unknown; tasks?: unknown; captures?: unknown; studyGoal?: unknown; studySessions?: unknown };
  if (!Array.isArray(candidate.tasks) || !Array.isArray(candidate.captures)) return null;
  if (candidate.version === 1) {
    return {
      version: 2,
      tasks: candidate.tasks as AgentTask[],
      captures: candidate.captures as CaptureItem[],
      studyGoal: null,
      studySessions: [],
    };
  }
  if (candidate.version !== 2 || !Array.isArray(candidate.studySessions)) return null;
  const goal = candidate.studyGoal;
  const validGoal = goal === null || (
    Boolean(goal) && typeof goal === 'object'
    && typeof (goal as StudyGoal).id === 'string'
    && typeof (goal as StudyGoal).topic === 'string'
    && Number.isFinite((goal as StudyGoal).weeklyTargetMinutes)
    && Number.isFinite((goal as StudyGoal).availableMinutesToday)
    && typeof (goal as StudyGoal).updatedAt === 'string'
  );
  if (!validGoal) return null;
  const goalUpdatedAt = goal && typeof goal === 'object' ? new Date((goal as StudyGoal).updatedAt) : null;
  const normalizedGoal = goal && typeof goal === 'object'
    ? {
        ...(goal as StudyGoal),
        availabilityDate: typeof (goal as StudyGoal).availabilityDate === 'string'
          ? (goal as StudyGoal).availabilityDate
          : goalUpdatedAt && !Number.isNaN(goalUpdatedAt.getTime()) ? localDateKey(goalUpdatedAt) : localDateKey(),
      }
    : null;
  return {
    version: 2,
    tasks: candidate.tasks as AgentTask[],
    captures: candidate.captures as CaptureItem[],
    studyGoal: normalizedGoal,
    studySessions: candidate.studySessions.filter((session): session is StudySession => {
      if (!session || typeof session !== 'object') return false;
      const item = session as StudySession;
      return typeof item.id === 'string' && typeof item.goalId === 'string' && typeof item.topic === 'string'
        && Number.isFinite(item.plannedMinutes) && typeof item.completedAt === 'string';
    }),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is unavailable in this environment.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE)) {
        database.createObjectStore(OBJECT_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open the local Silverstone database.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('The local Silverstone database upgrade is blocked by another tab.'));
    };
  });

  return databasePromise;
}

function readWorkspace(database: IDBDatabase): Promise<LocalAppState | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readonly');
    const request = transaction.objectStore(OBJECT_STORE).get(WORKSPACE_KEY) as IDBRequest<WorkspaceRecord | undefined>;
    request.onsuccess = () => {
      resolve(normalizeLocalAppState(request.result?.state));
    };
    request.onerror = () => reject(request.error ?? new Error('Could not read the local workspace.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Reading the local workspace was interrupted.'));
  });
}

function writeWorkspace(database: IDBDatabase, state: LocalAppState): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readwrite');
    transaction.objectStore(OBJECT_STORE).put({ key: WORKSPACE_KEY, state } satisfies WorkspaceRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the local workspace.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving the local workspace was interrupted.'));
  });
}

function deleteWorkspace(database: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readwrite');
    transaction.objectStore(OBJECT_STORE).delete(WORKSPACE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear the local workspace.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Clearing the local workspace was interrupted.'));
  });
}

function readLegacyState(): { state: LocalAppState | null; key: string | null } {
  if (typeof window === 'undefined') return { state: null, key: null };
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) continue;
      const parsed: unknown = JSON.parse(stored);
      const state = normalizeLocalAppState(parsed);
      if (state) return { state, key };
    } catch {
      // Try the next legacy key if browser storage or this record is invalid.
    }
  }
  return { state: null, key: null };
}

function hasFallbackOverride(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FALLBACK_MODE_KEY) === 'active';
  } catch {
    return false;
  }
}

function removeLegacyState(): void {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // IndexedDB holds the current copy, so a stale legacy copy can be cleaned up later.
    }
  }
  try {
    window.localStorage.removeItem(FALLBACK_MODE_KEY);
  } catch {
    // This marker is only needed while IndexedDB is unavailable.
  }
}

function saveLegacyState(state: LocalAppState): void {
  if (typeof window === 'undefined') throw new Error('Browser storage is unavailable.');
  window.localStorage.setItem(LEGACY_STORAGE_KEYS[0], JSON.stringify(state));
  for (const key of LEGACY_STORAGE_KEYS.slice(1)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // The current Silverstone key was saved successfully.
    }
  }
}

export async function loadLocalState(): Promise<LocalAppState> {
  if (typeof window === 'undefined') return createInitialState();

  const fallbackState = readLegacyState().state;
  if (fallbackState && hasFallbackOverride()) {
    try {
      const database = await openDatabase();
      await writeWorkspace(database, fallbackState);
      activeStorageBackend = 'indexeddb';
      removeLegacyState();
      return fallbackState;
    } catch {
      activeStorageBackend = 'localstorage';
      return fallbackState;
    }
  }

  try {
    const database = await openDatabase();
    const storedState = await readWorkspace(database);
    if (storedState) {
      activeStorageBackend = 'indexeddb';
      removeLegacyState();
      return storedState;
    }

    const legacy = readLegacyState();
    const migratedState = legacy.state ?? createInitialState();
    await writeWorkspace(database, migratedState);
    activeStorageBackend = 'indexeddb';
    removeLegacyState();
    return migratedState;
  } catch {
    activeStorageBackend = 'localstorage';
    return readLegacyState().state ?? createInitialState();
  }
}

export async function saveLocalState(state: LocalAppState): Promise<'indexeddb' | 'localstorage'> {
  try {
    const database = await openDatabase();
    await writeWorkspace(database, state);
    activeStorageBackend = 'indexeddb';
    removeLegacyState();
    return 'indexeddb';
  } catch (indexedDbError) {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(FALLBACK_MODE_KEY, 'active');
      saveLegacyState(state);
      activeStorageBackend = 'localstorage';
      return 'localstorage';
    } catch {
      throw indexedDbError;
    }
  }
}

export async function clearLocalState(): Promise<void> {
  try {
    const database = await openDatabase();
    await deleteWorkspace(database);
    activeStorageBackend = 'indexeddb';
  } catch (indexedDbError) {
    if (typeof window === 'undefined' || 'indexedDB' in window || activeStorageBackend !== 'localstorage') throw indexedDbError;
    removeLegacyState();
    return;
  }
  removeLegacyState();
}

export function createId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}
