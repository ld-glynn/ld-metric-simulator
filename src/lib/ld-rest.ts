// Thin server-side wrapper over the LaunchDarkly REST API.
// The API token is read from the incoming request on every call and is never stored or logged.

import { NextRequest, NextResponse } from 'next/server';

export const LD_API = 'https://app.launchdarkly.com';
export const LD_APP = 'https://app.launchdarkly.com';
import { TOKEN_HEADER } from './constants';

export class LdError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function tokenFrom(req: NextRequest): string {
  const token = req.headers.get(TOKEN_HEADER)?.trim();
  if (!token) throw new LdError(401, 'Add your LaunchDarkly API access token first.');
  return token;
}

export async function ldGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${LD_API}${path}`, {
    headers: { Authorization: token, 'LD-API-Version': '20240415' },
    cache: 'no-store',
  });
  if (res.ok) return (await res.json()) as T;

  let detail = '';
  try {
    const body = (await res.json()) as { message?: string };
    detail = body.message ?? '';
  } catch {
    // ignore non-JSON error bodies
  }
  if (res.status === 401) throw new LdError(401, 'LaunchDarkly rejected that token. Check it was copied completely and has not been revoked.');
  if (res.status === 403) throw new LdError(403, `That token is not allowed to read this. ${detail}`.trim());
  if (res.status === 404) throw new LdError(404, `Not found in LaunchDarkly. ${detail}`.trim());
  if (res.status === 429) throw new LdError(429, 'LaunchDarkly is rate limiting requests. Wait a few seconds and try again.');
  throw new LdError(res.status, detail || `LaunchDarkly returned ${res.status}.`);
}

/** Walk a paginated collection until `_links.next` is absent or `max` items are collected. */
export async function ldGetAll<T>(token: string, firstPath: string, max = 500): Promise<T[]> {
  const out: T[] = [];
  let path: string | undefined = firstPath;
  while (path && out.length < max) {
    const page: { items?: T[]; _links?: { next?: { href?: string } } } = await ldGet(token, path);
    out.push(...(page.items ?? []));
    path = page._links?.next?.href;
  }
  return out.slice(0, max);
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof LdError) return NextResponse.json({ error: err.message }, { status: err.status });
  const message = err instanceof Error ? err.message : 'Something went wrong.';
  return NextResponse.json({ error: message }, { status: 500 });
}

export function requireParam(req: NextRequest, name: string): string {
  const value = req.nextUrl.searchParams.get(name)?.trim();
  if (!value) throw new LdError(400, `Missing ${name}.`);
  return value;
}
