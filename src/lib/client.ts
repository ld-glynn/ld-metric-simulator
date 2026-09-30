// Browser-side helpers for calling this app's own API routes.
import { TOKEN_HEADER } from './constants';

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body as T;
}

export function apiGet<T>(path: string, token: string): Promise<T> {
  return fetch(path, { headers: { [TOKEN_HEADER]: token } }).then(r => parse<T>(r));
}

export function apiPost<T>(path: string, token: string, body: unknown): Promise<T> {
  return fetch(path, {
    method: 'POST',
    headers: { [TOKEN_HEADER]: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => parse<T>(r));
}
