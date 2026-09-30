import { NextRequest, NextResponse } from 'next/server';
import { LD_APP, errorResponse, ldGet, ldGetAll, requireParam, tokenFrom } from '@/lib/ld-rest';
import type { ExperimentSummary, FlagDetail, SimMetric, Treatment, Variation } from '@/lib/types';

type LdVariation = { _id: string; name?: string; value: unknown };
type LdFlag = { key: string; name: string; variations: LdVariation[] };

type LdMetricRef = {
  key: string;
  name: string;
  kind: string;
  isNumeric?: boolean;
  isGroup?: boolean;
  unitAggregationType?: 'average' | 'sum';
  metrics?: Array<{ key: string; name: string; kind: string; isNumeric?: boolean; unitAggregationType?: 'average' | 'sum' }>;
};

type LdMetric = {
  key: string;
  name: string;
  kind: 'custom' | 'pageview' | 'click';
  eventKey?: string;
  isNumeric?: boolean;
  unitAggregationType?: 'average' | 'sum';
  successCriteria?: 'HigherThanBaseline' | 'LowerThanBaseline';
  unit?: string;
};

type LdIteration = {
  status: string;
  randomizationUnit?: string;
  primarySingleMetric?: LdMetricRef;
  primaryFunnel?: LdMetricRef;
  primaryMetric?: LdMetricRef;
  secondaryMetrics?: LdMetricRef[];
  metrics?: LdMetricRef[];
  treatments?: Array<{
    _id: string;
    name: string;
    allocationPercent: string;
    baseline?: boolean;
    parameters?: Array<{ variationId: string; flagKey: string }>;
  }>;
};

type LdExperiment = { key: string; name: string; currentIteration?: LdIteration; draftIteration?: LdIteration };

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function toSimMetric(m: LdMetric, groupName?: string): SimMetric {
  const kind = m.kind;
  return {
    key: m.key,
    name: m.name,
    kind,
    eventKey: m.eventKey,
    isNumeric: Boolean(m.isNumeric),
    unitAggregationType: m.unitAggregationType,
    successCriteria: m.successCriteria,
    unit: m.unit,
    simulatable: kind === 'custom' && Boolean(m.eventKey),
    groupName,
  };
}

/** Resolve every metric an iteration references (expanding groups) to a full metric with its event key. */
async function resolveIterationMetrics(token: string, project: string, it: LdIteration): Promise<SimMetric[]> {
  const refs: Array<{ key: string; groupName?: string }> = [];
  const seen = new Set<string>();
  const push = (key: string, groupName?: string) => {
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ key, groupName });
    }
  };
  const visit = (ref?: LdMetricRef) => {
    if (!ref) return;
    if (ref.isGroup || ref.metrics?.length) {
      for (const m of ref.metrics ?? []) push(m.key, ref.name);
    } else {
      push(ref.key);
    }
  };
  visit(it.primarySingleMetric);
  visit(it.primaryFunnel);
  visit(it.primaryMetric);
  for (const m of it.metrics ?? []) visit(m);
  for (const m of it.secondaryMetrics ?? []) visit(m);

  const full = await Promise.all(
    refs.map(async r => {
      const m = await ldGet<LdMetric>(token, `/api/v2/metrics/${encodeURIComponent(project)}/${encodeURIComponent(r.key)}`);
      return toSimMetric(m, r.groupName);
    }),
  );
  return full;
}

export async function GET(req: NextRequest) {
  try {
    const token = tokenFrom(req);
    const project = requireParam(req, 'project');
    const env = requireParam(req, 'env');
    const flagKey = requireParam(req, 'flag');

    const [flag, experiments, projectMetricsRaw] = await Promise.all([
      ldGet<LdFlag>(token, `/api/v2/flags/${encodeURIComponent(project)}/${encodeURIComponent(flagKey)}?env=${encodeURIComponent(env)}`),
      ldGetAll<LdExperiment>(
        token,
        `/api/v2/projects/${encodeURIComponent(project)}/environments/${encodeURIComponent(env)}/experiments?limit=20&filter=flagKey:${encodeURIComponent(flagKey)}&expand=treatments,secondaryMetrics,draftIteration`,
        50,
      ),
      // The documented `filter=eventKind:custom` is rejected by the API ("invalid filter"), so filter by kind after fetching.
      ldGetAll<LdMetric>(token, `/api/v2/metrics/${encodeURIComponent(project)}?limit=50&sort=name`, 200),
    ]);

    const variations: Variation[] = flag.variations.map((v, index) => ({
      id: v._id,
      index,
      name: v.name?.trim() || displayValue(v.value),
      value: displayValue(v.value),
    }));

    const summaries: ExperimentSummary[] = await Promise.all(
      experiments.map(async exp => {
        const it = exp.currentIteration ?? exp.draftIteration;
        const metrics = it ? await resolveIterationMetrics(token, project, it) : [];
        const treatments: Treatment[] = (it?.treatments ?? []).map(t => ({
          id: t._id,
          name: t.name,
          allocationPercent: t.allocationPercent,
          baseline: Boolean(t.baseline),
          variationIds: (t.parameters ?? []).filter(p => p.flagKey === flagKey).map(p => p.variationId),
        }));
        return {
          key: exp.key,
          name: exp.name,
          status: it?.status ?? 'not_started',
          randomizationUnit: it?.randomizationUnit ?? 'user',
          metrics,
          treatments,
          resultsUrl: `${LD_APP}/projects/${encodeURIComponent(project)}/experiments/${encodeURIComponent(exp.key)}/results?environmentKey=${encodeURIComponent(env)}`,
        };
      }),
    );

    // Running experiments first, then stopped, then drafts.
    const order: Record<string, number> = { running: 0, stopped: 1, not_started: 2 };
    summaries.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

    const detail: FlagDetail = {
      key: flag.key,
      name: flag.name,
      variations,
      experiments: summaries,
      projectMetrics: projectMetricsRaw.filter(m => m.kind === 'custom').map(m => toSimMetric(m)).filter(m => m.simulatable),
      flagUrl: `${LD_APP}/projects/${encodeURIComponent(project)}/flags/${encodeURIComponent(flag.key)}/targeting?env=${encodeURIComponent(env)}&selected-env=${encodeURIComponent(env)}`,
    };
    return NextResponse.json(detail);
  } catch (err) {
    return errorResponse(err);
  }
}
