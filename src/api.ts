export interface HealthResponse {
  status: 'ok';
  service: 'silverstone-api';
  version: string;
}

export interface ApiReadinessResponse {
  status: 'ready' | 'degraded';
  service: 'silverstone-api';
  version: string;
  features: {
    supabase_auth: boolean;
    openai_responses: boolean;
  };
}

function configuredApiBase(): string {
  return import.meta.env.VITE_SILVERSTONE_API_URL?.trim().replace(/\/+$/, '') ?? '';
}

export async function getApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const base = configuredApiBase();
  const endpoint = base ? `${base}/health` : '/api/health';
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error(`API health request failed (${response.status})`);
  return response.json() as Promise<HealthResponse>;
}

export async function getApiReadiness(signal?: AbortSignal): Promise<ApiReadinessResponse | null> {
  const base = configuredApiBase();
  if (import.meta.env.PROD && !base) return null;
  const endpoint = base ? `${base}/ready` : '/api/ready';
  const response = await fetch(endpoint, { signal });
  if (!response.ok) throw new Error(`API readiness request failed (${response.status})`);
  return response.json() as Promise<ApiReadinessResponse>;
}

interface AssistantApiResponse {
  answer: string;
  model: string;
}

interface AssistantErrorResponse {
  error?: { message?: string };
}

export interface CareerDiscoveryResult {
  summary: string;
  opportunities: {
    title: string;
    organization: string;
    location: string;
    source_url: string;
    deadline: string;
    overview: string;
    fit_notes: string;
    requirements_to_verify: string[];
  }[];
  sources: { title: string; url: string }[];
  model: string;
}

export async function askSilverstone(message: string, signal?: AbortSignal): Promise<AssistantApiResponse> {
  const { supabase } = await import('./supabase');
  if (!supabase) throw new Error('Sign-in is not configured for this deployment.');
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('Could not check your sign-in session.');
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in from Settings to use cloud AI. Local tasks and notes still work.');

  const configuredBase = import.meta.env.VITE_SILVERSTONE_API_URL?.trim().replace(/\/+$/, '');
  if (import.meta.env.PROD && !configuredBase) {
    throw new Error('Cloud AI is not connected. Set VITE_SILVERSTONE_API_URL to the Rust API address.');
  }
  const endpoint = configuredBase
    ? `${configuredBase}/v1/assistant/respond`
    : '/api/v1/assistant/respond';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as AssistantErrorResponse | null;
    throw new Error(failure?.error?.message ?? `Silverstone API request failed (${response.status}).`);
  }
  const result = await response.json() as AssistantApiResponse;
  if (!result.answer?.trim()) throw new Error('Silverstone returned an empty answer. Try again.');
  return result;
}

export async function discoverCareerOpportunities(input: {
  kind: 'job' | 'scholarship';
  query: string;
  location: string;
  evidence: string;
}, signal?: AbortSignal): Promise<CareerDiscoveryResult> {
  const { supabase } = await import('./supabase');
  if (!supabase) throw new Error('Sign-in is not configured for this deployment.');
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('Could not check your sign-in session.');
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in from Settings to search for opportunities.');

  const base = configuredApiBase();
  if (import.meta.env.PROD && !base) {
    throw new Error('Career search is not connected. Set VITE_SILVERSTONE_API_URL to the Rust API address.');
  }
  const endpoint = base ? `${base}/v1/careers/discover` : '/api/v1/careers/discover';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as AssistantErrorResponse | null;
    throw new Error(failure?.error?.message ?? `Career search failed (${response.status}).`);
  }
  return response.json() as Promise<CareerDiscoveryResult>;
}
