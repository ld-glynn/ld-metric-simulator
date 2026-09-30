import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, ldGetAll, tokenFrom } from '@/lib/ld-rest';
import type { Project } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const token = tokenFrom(req);
    const items = await ldGetAll<{ key: string; name: string }>(token, '/api/v2/projects?limit=50&sort=name');
    const projects: Project[] = items.map(p => ({ key: p.key, name: p.name }));
    return NextResponse.json({ projects });
  } catch (err) {
    return errorResponse(err);
  }
}
