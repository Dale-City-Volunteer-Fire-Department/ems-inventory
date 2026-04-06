const BASE_URL = '/api';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((customHeaders as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export function useApi() {
  return {
    get: <T>(path: string) => apiFetch<T>(path),
    post: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'POST', body }),
    put: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  };
}
