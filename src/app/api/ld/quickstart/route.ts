import { NextRequest, NextResponse } from 'next/server';
import { LD_API, LdError, errorResponse, ldGet, tokenFrom } from '@/lib/ld-rest';
import { QUICKSTART_TEMPLATES } from '@/lib/quickstart-templates';
import type { QuickstartRequest, QuickstartResponse } from '@/lib/types';
import { SIMULATOR_TAG } from '@/lib/constants';

export const maxDuration = 60;


type Method = 'POST' | 'PATCH';

async function ldWrite<T>(token: string, method: Method, path: string, body: unknown, semanticPatch = false): Promise<T> {
  const res = await fetch(`${LD_API}${path}`, {
    method,
    headers: {
      Authorization: token,
      'LD-API-Version': '20240415',
      'Content-Type': semanticPatch ? 'application/json; domain-model=launchdarkly.semanticpatch' : 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (res.ok) return (await res.json()) as T;
  let detail = '';
  try {
    detail = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    // non-JSON body
  }
  if (res.status === 401) throw new LdError(401, 'LaunchDarkly rejected that token.');
  if (res.status === 403) throw new LdError(403, `Creating a sample experiment needs a token with Writer access to this project. LaunchDarkly said: ${detail || 'forbidden'}.`);
  if (res.status === 409) throw new LdError(409, detail || 'Something with that key already exists.');
  throw new LdError(res.status, detail || `LaunchDarkly returned ${res.status}.`);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export async function POST(req: NextRequest) {
  try {
    const token = tokenFrom(req);
    const body = (await req.json()) as QuickstartRequest;
    const { project, environment, templateId } = body;
    const tpl = QUICKSTART_TEMPLATES.find(t => t.id === templateId);
    if (!project || !environment || !tpl) throw new LdError(400, 'Quick start request is incomplete.');

    const suffix = Math.random().toString(36).slice(2, 6);
    const flagKey = `sample-${slug(tpl.id)}-${suffix}`;
    const metricKey = `sample-${slug(tpl.metric.name.replace(/^Sample:\s*/i, ''))}-${suffix}`;
    const experimentKey = `${flagKey}-exp`;

    // Who is the maintainer? Service tokens have no member; that is fine, the field is optional.
    const caller = await ldGet<{ memberId?: string }>(token, '/api/v2/caller-identity').catch(() => ({}) as { memberId?: string });
    const maintainerId = caller.memberId;

    // 1. Flag (off in every environment to start).
    await ldWrite(token, 'POST', `/api/v2/flags/${encodeURIComponent(project)}`, {
      key: flagKey,
      name: tpl.flag.name,
      description: tpl.flag.description,
      temporary: true,
      tags: [SIMULATOR_TAG],
      variations: tpl.flag.variations.map(v => ({ name: v.name, value: v.value })),
      defaults: { onVariation: 0, offVariation: 0 },
      // Available to browser SDKs too, so the same flag works if they wire it into a real page later.
      clientSideAvailability: { usingEnvironmentId: true, usingMobileKey: true },
      ...(maintainerId ? { maintainerId } : {}),
    });

    // 2. Metric.
    await ldWrite(token, 'POST', `/api/v2/metrics/${encodeURIComponent(project)}`, {
      key: metricKey,
      name: tpl.metric.name,
      description: tpl.metric.description,
      kind: 'custom',
      eventKey: metricKey,
      isNumeric: tpl.metric.isNumeric,
      ...(tpl.metric.isNumeric ? { unit: tpl.metric.unit ?? '', unitAggregationType: tpl.metric.unitAggregationType ?? 'average' } : {}),
      successCriteria: tpl.metric.successCriteria,
      randomizationUnits: ['user'],
      analysisType: 'mean',
      tags: [SIMULATOR_TAG],
      ...(maintainerId ? { maintainerId } : {}),
    });

    // 3. Turn the flag on in the chosen environment (an iteration cannot start on an off flag).
    await ldWrite(
      token,
      'PATCH',
      `/api/v2/flags/${encodeURIComponent(project)}/${encodeURIComponent(flagKey)}`,
      { environmentKey: environment, comment: 'Turned on by the Experiment Simulator', instructions: [{ kind: 'turnFlagOn' }] },
      true,
    );

    // 4. Read back variation ids and the environment's config version, both needed by the experiment.
    const flag = await ldGet<{ variations: Array<{ _id: string; name?: string }>; environments: Record<string, { version: number }> }>(
      token,
      `/api/v2/flags/${encodeURIComponent(project)}/${encodeURIComponent(flagKey)}?env=${encodeURIComponent(environment)}`,
    );
    const version = flag.environments?.[environment]?.version;
    if (!version) throw new LdError(500, 'Could not read the new flag back from LaunchDarkly.');

    const n = flag.variations.length;
    const share = (i: number) => (i === 0 ? (100 - Math.floor(100 / n) * (n - 1)).toFixed(2) : Math.floor(100 / n).toFixed(2));

    // 5. Experiment on the flag's default (fallthrough) rule, equal split, first variation is the control.
    await ldWrite(token, 'POST', `/api/v2/projects/${encodeURIComponent(project)}/environments/${encodeURIComponent(environment)}/experiments`, {
      key: experimentKey,
      name: tpl.experiment.name,
      description: 'Created by the Experiment Simulator so you can see results without deploying anything.',
      ...(maintainerId ? { maintainerId } : {}),
      iteration: {
        hypothesis: tpl.experiment.hypothesis,
        canReshuffleTraffic: true,
        metrics: [{ key: metricKey, isGroup: false, primary: true }],
        primarySingleMetricKey: metricKey,
        treatments: flag.variations.map((v, i) => ({
          name: v.name || tpl.flag.variations[i]?.name || `Variation ${i + 1}`,
          baseline: i === 0,
          allocationPercent: share(i),
          parameters: [{ flagKey, variationId: v._id }],
        })),
        flags: { [flagKey]: { ruleId: 'fallthrough', flagConfigVersion: version } },
        randomizationUnit: 'user',
      },
    });

    // 6. Start it.
    await ldWrite(
      token,
      'PATCH',
      `/api/v2/projects/${encodeURIComponent(project)}/environments/${encodeURIComponent(environment)}/experiments/${encodeURIComponent(experimentKey)}`,
      { instructions: [{ kind: 'startIteration', changeJustification: 'Started by the Experiment Simulator' }] },
      true,
    );

    const response: QuickstartResponse = { flagKey, metricKey, experimentKey };
    return NextResponse.json(response);
  } catch (err) {
    return errorResponse(err);
  }
}
