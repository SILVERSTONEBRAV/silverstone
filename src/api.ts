export interface HealthResponse {
  status: 'ok';
  service: 'silverstone-api';
  version: string;
}

export async function getApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error(`API health request failed (${response.status})`);
  return response.json() as Promise<HealthResponse>;
}
