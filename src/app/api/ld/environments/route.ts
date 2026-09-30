import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, ldGetAll, requireParam, tokenFrom } from '@/lib/ld-rest';
import type { Environment } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const token = tokenFrom(req);
    const project = requireParam(req, 'project');
    const items = await ldGetAll<{ key: string; name: string; color?: string }>(
      token,
      `/api/v2/projects/${encodeURIComponent(project)}/environments?limit=50`,
    );
    // Deliberately drop apiKey / mobileKey: the browser never needs SDK keys.
    const environments: Environment[] = items.map(e => ({ key: e.key, name: e.name, color: e.color }));
    return NextResponse.json({ environments });
  } catch (err) {
    return errorResponse(err);
  }
}
