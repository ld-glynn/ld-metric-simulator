import { NextRequest, NextResponse } from 'next/server';
import { init, type LDContext } from '@launchdarkly/node-server-sdk';
import { LdError, errorResponse, ldGet, tokenFrom } from '@/lib/ld-rest';
import type { SimulateRequest, SimulateResponse, VariationTally } from '@/lib/types';
import { MAX_BATCH } from '@/lib/constants';

// Vercel: allow up to 60s per batch (Hobby maximum). The client sends batches of at most MAX_BATCH.
export const maxDuration = 60;

const COUNTRIES = ['US', 'US', 'US', 'GB', 'DE', 'CA', 'AU', 'FR', 'BR', 'IN'];
const DEVICES = ['desktop', 'desktop', 'mobile', 'mobile', 'mobile', 'tablet'];
const SOURCES = ['organic', 'paid', 'email', 'direct', 'social'];

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** A value around `mean` with ±35% uniform noise, never negative, two decimals. */
function noisy(mean: number): number {
  const v = mean * (0.65 + Math.random() * 0.7);
  return Math.max(0, Math.round(v * 100) / 100);
}

export async function POST(req: NextRequest) {
  let client: ReturnType<typeof init> | undefined;
  try {
    const token = tokenFrom(req);
    const body = (await req.json()) as SimulateRequest;
    const { project, environment, flag, contextKind, variationIds, metrics, settings, runId } = body;
    const count = Math.min(Math.max(Number(body.count) || 0, 0), MAX_BATCH);
    const offset = Number(body.offset) || 0;

    if (!project || !environment || !flag || !contextKind || !variationIds?.length || !runId) {
      throw new LdError(400, 'Simulation request is incomplete.');
    }
    if (count === 0) throw new LdError(400, 'Nothing to simulate.');

    // The server-side SDK key is looked up here so it never reaches the browser.
    const envRep = await ldGet<{ apiKey?: string }>(
      token,
      `/api/v2/projects/${encodeURIComponent(project)}/environments/${encodeURIComponent(environment)}`,
    );
    if (!envRep.apiKey) throw new LdError(403, 'Your token cannot read the SDK key for this environment. It needs the Reader role or the viewSdkKey action.');

    client = init(envRep.apiKey, {
      diagnosticOptOut: true,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    await client.waitForInitialization({ timeout: 15 });

    const byVariation: Record<string, VariationTally> = {};
    let notInExperiment = 0;

    for (let i = 0; i < count; i++) {
      const n = offset + i;
      const context: LDContext = {
        kind: contextKind,
        key: `sim-${runId}-${n}`,
        country: pick(COUNTRIES),
        device: pick(DEVICES),
        source: pick(SOURCES),
      };

      const detail = await client.variationDetail(flag, context, null);
      const idx = detail.variationIndex;
      if (idx === null || idx === undefined || idx < 0 || idx >= variationIds.length) continue;
      const variationId = variationIds[idx];
      const tally = (byVariation[variationId] ??= { visitors: 0, events: {} });
      tally.visitors++;

      if (detail.reason?.inExperiment === false) notInExperiment++;

      const perMetric = settings[variationId] ?? {};
      for (const m of metrics) {
        if (!m.eventKey) continue;
        const s = perMetric[m.key];
        if (!s) continue;
        if (m.isNumeric) {
          const value = noisy(Number(s.mean) || 0);
          client.track(m.eventKey, context, undefined, value);
          tally.events[m.key] = (tally.events[m.key] ?? 0) + value;
        } else if (Math.random() < Number(s.rate)) {
          client.track(m.eventKey, context);
          tally.events[m.key] = (tally.events[m.key] ?? 0) + 1;
        }
      }
    }

    await client.flush();
    const response: SimulateResponse = { processed: count, notInExperiment, byVariation };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof Error && /timed out|initialization/i.test(err.message)) {
      return NextResponse.json({ error: 'The LaunchDarkly SDK could not connect with this environment’s key. Try again in a moment.' }, { status: 502 });
    }
    return errorResponse(err);
  } finally {
    client?.close();
  }
}
