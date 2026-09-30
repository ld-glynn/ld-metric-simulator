'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/lib/client';
import { MAX_BATCH } from '@/lib/constants';
import type {
  Environment,
  ExperimentSummary,
  FlagDetail,
  FlagSummary,
  MetricSetting,
  Project,
  SimMetric,
  SimulateRequest,
  SimulateResponse,
  Variation,
  VariationTally,
} from '@/lib/types';
import { Alert, Button, Card, Input, Label, Select, Spinner, Stepper } from '@/components/ui';

const STEPS = ['Connect', 'Choose', 'Configure', 'Run'];

const PACING = [
  { label: 'All at once (fastest)', minutes: 0 },
  { label: 'Spread over 10 minutes', minutes: 10 },
  { label: 'Spread over 1 hour', minutes: 60 },
  { label: 'Spread over 4 hours (for bandits)', minutes: 240 },
];

type Settings = Record<string, Record<string, MetricSetting>>;

type RunState = {
  status: 'idle' | 'running' | 'done' | 'error' | 'stopped';
  sent: number;
  target: number;
  notInExperiment: number;
  byVariation: Record<string, VariationTally>;
  error?: string;
  nextBatchAt?: number;
};

const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

function defaultSettings(variations: Variation[], metrics: SimMetric[], baselineId?: string): Settings {
  const s: Settings = {};
  const baseIdx = Math.max(0, variations.findIndex(v => v.id === baselineId));
  variations.forEach((v, i) => {
    s[v.id] = {};
    for (const m of metrics) {
      // Baseline gets the reference number; the first non-baseline is the default winner; the rest trail slightly.
      const role = i === baseIdx ? 'base' : i === (baseIdx === 0 ? 1 : 0) ? 'winner' : 'other';
      const lowerIsBetter = m.successCriteria === 'LowerThanBaseline';
      const mult = role === 'base' ? 1 : role === 'winner' ? (lowerIsBetter ? 0.75 : 1.3) : lowerIsBetter ? 1.05 : 0.92;
      s[v.id][m.key] = m.isNumeric ? { rate: 1, mean: Math.round(100 * mult) } : { rate: Math.round(500 * mult) / 10000, mean: 0 };
    }
  });
  return s;
}

export default function HomePage() {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState('');
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environment, setEnvironment] = useState('');
  const [flags, setFlags] = useState<FlagSummary[]>([]);
  const [flagFilter, setFlagFilter] = useState('');
  const [flagKey, setFlagKey] = useState('');
  const [detail, setDetail] = useState<FlagDetail | null>(null);
  const [experimentKey, setExperimentKey] = useState<string>('');
  const [manualMetricKeys, setManualMetricKeys] = useState<string[]>([]);

  const [visitors, setVisitors] = useState(1000);
  const [pacing, setPacing] = useState(0);
  const [settings, setSettings] = useState<Settings>({});

  const [run, setRun] = useState<RunState>({ status: 'idle', sent: 0, target: 0, notInExperiment: 0, byVariation: {} });
  const stopRef = useRef(false);

  const experiment: ExperimentSummary | undefined = detail?.experiments.find(e => e.key === experimentKey);

  // Metrics we will fire: the experiment's custom metrics, or the manually picked project metrics.
  const activeMetrics: SimMetric[] = useMemo(() => {
    if (!detail) return [];
    if (experiment) return experiment.metrics.filter(m => m.simulatable);
    return detail.projectMetrics.filter(m => manualMetricKeys.includes(m.key));
  }, [detail, experiment, manualMetricKeys]);

  const skippedMetrics: SimMetric[] = useMemo(() => (experiment ? experiment.metrics.filter(m => !m.simulatable) : []), [experiment]);

  // Variations that will actually be served: those in the experiment's treatments, else all of them.
  const activeVariations: Variation[] = useMemo(() => {
    if (!detail) return [];
    if (!experiment || experiment.treatments.length === 0) return detail.variations;
    const served = new Set(experiment.treatments.flatMap(t => t.variationIds));
    const inExp = detail.variations.filter(v => served.has(v.id));
    return inExp.length ? inExp : detail.variations;
  }, [detail, experiment]);

  const baselineVariationId = experiment?.treatments.find(t => t.baseline)?.variationIds[0];
  const contextKind = experiment?.randomizationUnit ?? 'user';

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  // ---- Step 1: connect -------------------------------------------------------------------------
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { projects } = await apiGet<{ projects: Project[] }>('/api/ld/projects', token);
      if (!projects.length) throw new Error('That token can see no projects.');
      setProjects(projects);
      setProject(projects.length === 1 ? projects[0].key : '');
      setStep(1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // ---- Step 2: choose ---------------------------------------------------------------------------
  useEffect(() => {
    if (!project) return;
    setEnvironments([]);
    setEnvironment('');
    setFlags([]);
    setFlagKey('');
    setDetail(null);
    setBusy(true);
    apiGet<{ environments: Environment[] }>(`/api/ld/environments?project=${encodeURIComponent(project)}`, token)
      .then(r => {
        setEnvironments(r.environments);
        const preferred = r.environments.find(e => /test|staging|dev/i.test(e.key)) ?? r.environments[0];
        setEnvironment(r.environments.length === 1 || preferred ? preferred.key : '');
      })
      .catch(fail)
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(() => {
    if (!project || !environment) return;
    setFlags([]);
    setFlagKey('');
    setDetail(null);
    setBusy(true);
    apiGet<{ flags: FlagSummary[] }>(`/api/ld/flags?project=${encodeURIComponent(project)}&env=${encodeURIComponent(environment)}`, token)
      .then(r => setFlags(r.flags))
      .catch(fail)
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, environment]);

  useEffect(() => {
    if (!project || !environment || !flagKey) return;
    setDetail(null);
    setExperimentKey('');
    setManualMetricKeys([]);
    setBusy(true);
    apiGet<FlagDetail>(`/api/ld/flag?project=${encodeURIComponent(project)}&env=${encodeURIComponent(environment)}&flag=${encodeURIComponent(flagKey)}`, token)
      .then(d => {
        setDetail(d);
        const first = d.experiments.find(e => e.status === 'running') ?? d.experiments[0];
        setExperimentKey(first?.key ?? '');
      })
      .catch(fail)
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, environment, flagKey]);

  const filteredFlags = useMemo(() => {
    const q = flagFilter.trim().toLowerCase();
    return q ? flags.filter(f => f.key.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)) : flags;
  }, [flags, flagFilter]);

  const toConfigure = () => {
    setSettings(defaultSettings(activeVariations, activeMetrics, baselineVariationId));
    setStep(2);
  };

  // ---- Step 3: configure ------------------------------------------------------------------------
  const setCell = (variationId: string, metricKey: string, patch: Partial<MetricSetting>) =>
    setSettings(prev => ({ ...prev, [variationId]: { ...prev[variationId], [metricKey]: { ...prev[variationId][metricKey], ...patch } } }));

  const makeWinner = (winnerId: string) => {
    setSettings(prev => {
      const next: Settings = {};
      const baseId = baselineVariationId && prev[baselineVariationId] ? baselineVariationId : activeVariations[0].id;
      for (const v of activeVariations) {
        next[v.id] = {};
        for (const m of activeMetrics) {
          const base = prev[baseId][m.key];
          const lowerIsBetter = m.successCriteria === 'LowerThanBaseline';
          const mult = v.id === baseId ? 1 : v.id === winnerId ? (lowerIsBetter ? 0.75 : 1.3) : lowerIsBetter ? 1.05 : 0.92;
          next[v.id][m.key] = m.isNumeric
            ? { rate: 1, mean: Math.round(base.mean * mult * 100) / 100 }
            : { rate: Math.round(base.rate * mult * 10000) / 10000, mean: 0 };
        }
      }
      return next;
    });
  };

  // ---- Step 4: run ------------------------------------------------------------------------------
  const startRun = useCallback(async () => {
    if (!detail) return;
    stopRef.current = false;
    const runId = Math.random().toString(36).slice(2, 8);
    const target = Math.max(1, Math.floor(visitors));
    const spreadMs = pacing * 60_000;
    // With pacing, aim for one batch every ~30s; otherwise use the largest batch allowed.
    const batches = spreadMs > 0 ? Math.max(1, Math.round(spreadMs / 30_000)) : 1;
    const batchSize = Math.min(MAX_BATCH, Math.max(1, Math.ceil(target / batches)));
    const totalBatches = Math.ceil(target / batchSize);
    const gap = spreadMs > 0 && totalBatches > 1 ? spreadMs / (totalBatches - 1) : 0;

    setRun({ status: 'running', sent: 0, target, notInExperiment: 0, byVariation: {} });
    setStep(3);

    const merged: Record<string, VariationTally> = {};
    let sent = 0;
    let notIn = 0;

    for (let b = 0; b < totalBatches; b++) {
      if (stopRef.current) {
        setRun(r => ({ ...r, status: 'stopped' }));
        return;
      }
      const count = Math.min(batchSize, target - sent);
      const body: SimulateRequest = {
        project,
        environment,
        flag: detail.key,
        contextKind,
        count,
        variationIds: detail.variations.map(v => v.id),
        metrics: activeMetrics.map(m => ({ key: m.key, eventKey: m.eventKey, isNumeric: m.isNumeric })),
        settings,
        runId,
        offset: sent,
      };
      try {
        const res = await apiPost<SimulateResponse>('/api/simulate', token, body);
        sent += res.processed;
        notIn += res.notInExperiment;
        for (const [id, t] of Object.entries(res.byVariation)) {
          const m = (merged[id] ??= { visitors: 0, events: {} });
          m.visitors += t.visitors;
          for (const [k, n] of Object.entries(t.events)) m.events[k] = (m.events[k] ?? 0) + n;
        }
        setRun({ status: 'running', sent, target, notInExperiment: notIn, byVariation: { ...merged }, nextBatchAt: gap && b < totalBatches - 1 ? Date.now() + gap : undefined });
      } catch (e) {
        setRun(r => ({ ...r, status: 'error', error: e instanceof Error ? e.message : String(e) }));
        return;
      }
      if (gap && b < totalBatches - 1) {
        const until = Date.now() + gap;
        while (Date.now() < until) {
          if (stopRef.current) break;
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
    setRun(r => ({ ...r, status: 'done', nextBatchAt: undefined }));
  }, [detail, visitors, pacing, project, environment, contextKind, activeMetrics, settings, token]);

  const reset = () => {
    stopRef.current = true;
    setRun({ status: 'idle', sent: 0, target: 0, notInExperiment: 0, byVariation: {} });
    setStep(2);
  };

  // ---- Render -------------------------------------------------------------------------------------
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="rounded-xl bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white shadow">
        <h1 className="text-2xl font-bold">LaunchDarkly Experiment Simulator</h1>
        <p className="mt-1 text-sm text-white/85">
          Send realistic, made-up visitors and conversions to an experiment so its Results tab has something to show. No SDK keys or event names to look up.
        </p>
      </header>

      <Stepper steps={STEPS} current={step} />

      {error && (
        <Alert tone="error">
          {error}{' '}
          <Button variant="link" onClick={() => setError(null)}>
            dismiss
          </Button>
        </Alert>
      )}

      {step === 0 && (
        <Card title="Connect to LaunchDarkly" subtitle="Paste an API access token. It is used only for this session and is never stored.">
          <div className="space-y-4">
            <div>
              <Label hint="In LaunchDarkly: Organization settings → Authorization → Create token. The Reader role is enough.">API access token</Label>
              <Input type="password" autoComplete="off" placeholder="api-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={token} onChange={e => setToken(e.target.value)} onKeyDown={e => e.key === 'Enter' && token && connect()} />
            </div>
            <Alert tone="info">
              The token goes from your browser to this app&apos;s server on each request so it can read your projects and send events. Nothing is written to a database or log. If your organization would rather not share a token with a hosted tool, run this app locally instead (see the README).
            </Alert>
            <Button onClick={connect} disabled={!token.trim() || busy}>
              {busy ? <Spinner /> : 'Connect'}
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="Choose the experiment" subtitle="Pick the project, environment and flag. Experiments on that flag appear automatically." right={busy ? <Spinner /> : undefined}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Project</Label>
              <Select value={project} onChange={e => setProject(e.target.value)}>
                <option value="">Select a project…</option>
                {projects.map(p => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label hint="Use a test or staging environment. This sends real events.">Environment</Label>
              <Select value={environment} onChange={e => setEnvironment(e.target.value)} disabled={!environments.length}>
                <option value="">Select an environment…</option>
                {environments.map(e => (
                  <option key={e.key} value={e.key}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label hint={flags.length ? `${flags.length} flags. Type to narrow the list.` : undefined}>Flag</Label>
              <div className="flex gap-2">
                <Input placeholder="Filter flags…" value={flagFilter} onChange={e => setFlagFilter(e.target.value)} disabled={!flags.length} className="sm:w-1/3" />
                <Select value={flagKey} onChange={e => setFlagKey(e.target.value)} disabled={!flags.length}>
                  <option value="">Select a flag…</option>
                  {filteredFlags.map(f => (
                    <option key={f.key} value={f.key}>
                      {f.name} ({f.key})
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          {detail && (
            <div className="mt-6 space-y-3">
              <Label>Experiment on this flag</Label>
              {detail.experiments.length === 0 && (
                <Alert tone="warn">
                  No experiment uses this flag in this environment. You can still send events: pick the metrics below, and set up the experiment in LaunchDarkly afterwards. Only events sent while an experiment is running count towards its results.
                </Alert>
              )}
              {detail.experiments.map(e => (
                <label key={e.key} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${experimentKey === e.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <input type="radio" className="mt-1" checked={experimentKey === e.key} onChange={() => setExperimentKey(e.key)} />
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">
                      {e.name} <StatusPill status={e.status} />
                    </div>
                    <div className="text-gray-600">
                      {e.metrics.length} metric{e.metrics.length === 1 ? '' : 's'} · {e.treatments.length} variation{e.treatments.length === 1 ? '' : 's'} · randomized by <code>{e.randomizationUnit}</code>
                    </div>
                  </div>
                </label>
              ))}
              {detail.experiments.length > 0 && (
                <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${experimentKey === '' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <input type="radio" className="mt-1" checked={experimentKey === ''} onChange={() => setExperimentKey('')} />
                  <div className="text-sm text-gray-800">No experiment. I&apos;ll pick metrics myself.</div>
                </label>
              )}

              {!experiment && (
                <div>
                  <Label hint="Custom metrics in this project. Hold Cmd/Ctrl to select several.">Metrics to send</Label>
                  <Select multiple size={Math.min(8, Math.max(3, detail.projectMetrics.length))} value={manualMetricKeys} onChange={e => setManualMetricKeys(Array.from(e.target.selectedOptions).map(o => o.value))}>
                    {detail.projectMetrics.map(m => (
                      <option key={m.key} value={m.key}>
                        {m.name} {m.isNumeric ? '(numeric)' : '(conversion)'}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {experiment && experiment.status !== 'running' && (
                <Alert tone="warn">
                  This experiment is <strong>{experiment.status.replace('_', ' ')}</strong>. LaunchDarkly only records results while an iteration is running. Start it in LaunchDarkly first, then come back here.
                </Alert>
              )}
              {skippedMetrics.length > 0 && (
                <Alert tone="info">
                  Skipping {skippedMetrics.map(m => m.name).join(', ')}: {skippedMetrics.length === 1 ? 'it is a' : 'they are'} page view or click metric{skippedMetrics.length === 1 ? '' : 's'}, which only the browser SDK can send.
                </Alert>
              )}
              {activeMetrics.length === 0 && experiment && <Alert tone="error">This experiment has no custom metrics that can be simulated from here.</Alert>}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={toConfigure} disabled={!detail || activeMetrics.length === 0 || busy}>
              Next: set the numbers
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && detail && (
        <Card title="Set the numbers" subtitle="How many visitors, and how each variation should perform. The defaults already give one variation a believable lift.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="Each visitor is a new made-up context. A few hundred is enough to see charts; a few thousand to reach significance.">Visitors</Label>
              <Input type="number" min={1} max={100000} value={visitors} onChange={e => setVisitors(Number(e.target.value))} />
            </div>
            <div>
              <Label hint="Bandits reallocate at most hourly, so spread traffic over hours to see the allocation move.">Pacing</Label>
              <Select value={pacing} onChange={e => setPacing(Number(e.target.value))}>
                {PACING.map(p => (
                  <option key={p.minutes} value={p.minutes}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-4 font-medium">Variation</th>
                  {activeMetrics.map(m => (
                    <th key={m.key} className="py-2 pr-4 font-medium">
                      {m.name}
                      <div className="text-xs font-normal text-gray-500">
                        {m.isNumeric ? `average value${m.unit ? ` (${m.unit})` : ''}` : 'conversion rate'}
                        {m.successCriteria === 'LowerThanBaseline' ? ' · lower is better' : ''}
                      </div>
                    </th>
                  ))}
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {activeVariations.map(v => (
                  <tr key={v.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4">
                      <div className="font-medium text-gray-900">{v.name}</div>
                      {v.id === baselineVariationId && <div className="text-xs text-gray-500">baseline</div>}
                    </td>
                    {activeMetrics.map(m => {
                      const s = settings[v.id]?.[m.key];
                      if (!s) return <td key={m.key} />;
                      return (
                        <td key={m.key} className="py-2 pr-4">
                          {m.isNumeric ? (
                            <Input type="number" min={0} step="any" value={s.mean} onChange={e => setCell(v.id, m.key, { mean: Number(e.target.value) })} className="w-28" />
                          ) : (
                            <div className="flex items-center gap-1">
                              <Input type="number" min={0} max={100} step={0.1} value={Math.round(s.rate * 1000) / 10} onChange={e => setCell(v.id, m.key, { rate: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })} className="w-24" />
                              <span className="text-gray-500">%</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 text-right">
                      {v.id !== baselineVariationId && (
                        <Button variant="link" onClick={() => makeWinner(v.id)}>
                          Make this the winner
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Visitors are simulated as <code>{contextKind}</code> contexts{experiment ? ' to match the experiment’s randomization unit' : ''}. LaunchDarkly decides which variation each visitor sees; you only choose how they behave afterwards.
          </p>

          <div className="mt-6 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={startRun} disabled={visitors < 1}>
              Send {visitors.toLocaleString()} visitors
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && detail && (
        <Card
          title={run.status === 'running' ? 'Sending…' : run.status === 'done' ? 'Done' : run.status === 'stopped' ? 'Stopped' : 'Something went wrong'}
          subtitle={run.status === 'running' && pacing > 0 ? 'Keep this tab open until the run finishes.' : undefined}
          right={run.status === 'running' ? <Spinner /> : undefined}
        >
          <div className="mb-4">
            <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
              <div className="h-2 bg-blue-600 transition-all" style={{ width: `${run.target ? Math.min(100, (100 * run.sent) / run.target) : 0}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-600">
              <span>
                {run.sent.toLocaleString()} of {run.target.toLocaleString()} visitors
              </span>
              {run.nextBatchAt && run.status === 'running' && <Countdown until={run.nextBatchAt} />}
            </div>
          </div>

          {run.error && <Alert tone="error">{run.error}</Alert>}
          {run.status !== 'running' && run.sent >= 20 && activeVariations.length > 1 && Object.keys(run.byVariation).length === 1 && (
            <div className="my-3">
              <Alert tone="warn">
                Every visitor received the same variation, so there is nothing to compare. This usually means the experiment is not running yet, or the flag is off in this environment. Start the experiment in LaunchDarkly and send again.
              </Alert>
            </div>
          )}
          {run.notInExperiment > 0 && (
            <div className="my-3">
              <Alert tone="warn">
                {run.notInExperiment.toLocaleString()} visitor{run.notInExperiment === 1 ? ' was' : 's were'} served outside the experiment (the experiment’s targeting rule does not cover everyone). Their events will not appear in results.
              </Alert>
            </div>
          )}

          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-4 font-medium">Variation</th>
                <th className="py-2 pr-4 font-medium">Visitors</th>
                {activeMetrics.map(m => (
                  <th key={m.key} className="py-2 pr-4 font-medium">
                    {m.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.variations
                .filter(v => run.byVariation[v.id])
                .map(v => {
                  const t = run.byVariation[v.id];
                  return (
                    <tr key={v.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium text-gray-900">{v.name}</td>
                      <td className="py-2 pr-4">{t.visitors.toLocaleString()}</td>
                      {activeMetrics.map(m => {
                        const n = t.events[m.key] ?? 0;
                        return (
                          <td key={m.key} className="py-2 pr-4">
                            {m.isNumeric ? `avg ${(t.visitors ? n / t.visitors : 0).toFixed(2)}` : `${n.toLocaleString()} (${fmtPct(t.visitors ? n / t.visitors : 0)})`}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {run.status === 'done' && (
            <div className="mt-4">
              <Alert tone="success">
                Events sent. Results usually appear in LaunchDarkly within a few minutes.{' '}
                {experiment ? (
                  <a className="font-medium underline" href={experiment.resultsUrl} target="_blank" rel="noreferrer">
                    Open the experiment results
                  </a>
                ) : (
                  <a className="font-medium underline" href={detail.flagUrl} target="_blank" rel="noreferrer">
                    Open the flag
                  </a>
                )}
                .
              </Alert>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            {run.status === 'running' ? (
              <Button variant="secondary" onClick={() => (stopRef.current = true)}>
                Stop
              </Button>
            ) : (
              <Button variant="secondary" onClick={reset}>
                Change the numbers
              </Button>
            )}
            {run.status !== 'running' && <Button onClick={startRun}>Send another {visitors.toLocaleString()}</Button>}
          </div>
        </Card>
      )}

      <footer className="text-center text-xs text-gray-500">
        Open source under MIT ·{' '}
        <a className="underline" href="https://github.com/ld-glynn/ld-metric-simulator" target="_blank" rel="noreferrer">
          github.com/ld-glynn/ld-metric-simulator
        </a>
      </footer>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const style = status === 'running' ? 'bg-green-100 text-green-800' : status === 'stopped' ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-amber-800';
  return <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{status.replace('_', ' ')}</span>;
}

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.round((until - now) / 1000));
  return <span>next batch in {s}s</span>;
}
