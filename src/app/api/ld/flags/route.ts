import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, ldGetAll, requireParam, tokenFrom } from '@/lib/ld-rest';
import type { FlagSummary } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const token = tokenFrom(req);
    const project = requireParam(req, 'project');
    const env = requireParam(req, 'env');
    const items = await ldGetAll<{ key: string; name: string }>(
      token,
      `/api/v2/flags/${encodeURIComponent(project)}?env=${encodeURIComponent(env)}&summary=1&limit=100&sort=name`,
      1000,
    );
    const flags: FlagSummary[] = items.map(f => ({ key: f.key, name: f.name }));
    return NextResponse.json({ flags });
  } catch (err) {
    return errorResponse(err);
  }
}
