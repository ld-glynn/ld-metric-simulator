// Shared shapes between the API routes and the UI.

export type Project = { key: string; name: string };
export type Environment = { key: string; name: string; color?: string };
export type FlagSummary = { key: string; name: string };

export type Variation = {
  id: string;
  index: number;
  name: string;
  /** Display form of the variation value (stringified JSON for non-strings). */
  value: string;
};

export type MetricKind = 'custom' | 'pageview' | 'click';

export type SimMetric = {
  key: string;
  name: string;
  kind: MetricKind;
  /** The event key the SDK must send. Present for custom metrics. */
  eventKey?: string;
  isNumeric: boolean;
  unitAggregationType?: 'average' | 'sum';
  successCriteria?: 'HigherThanBaseline' | 'LowerThanBaseline';
  unit?: string;
  /** Only custom metrics can be produced from a server-side simulation. */
  simulatable: boolean;
  /** Present when the metric came from a metric group (funnel / standard group). */
  groupName?: string;
};

export type Treatment = {
  id: string;
  name: string;
  allocationPercent: string;
  baseline: boolean;
  /** Variation ids this treatment serves for the selected flag. */
  variationIds: string[];
};

export type ExperimentSummary = {
  key: string;
  name: string;
  status: 'not_started' | 'running' | 'stopped' | string;
  randomizationUnit: string;
  metrics: SimMetric[];
  treatments: Treatment[];
  resultsUrl: string;
};

export type FlagDetail = {
  key: string;
  name: string;
  variations: Variation[];
  experiments: ExperimentSummary[];
  /** Custom metrics in the project, used when the flag has no experiment. */
  projectMetrics: SimMetric[];
  flagUrl: string;
};

/** Per-variation, per-metric setting. Binary metrics use `rate` (0-1); numeric use `mean`. */
export type MetricSetting = { rate: number; mean: number };

export type SimulateRequest = {
  project: string;
  environment: string;
  flag: string;
  contextKind: string;
  /** Number of visitors to simulate in this batch. */
  count: number;
  /** Variation ids in variation-index order, so the SDK's variationIndex can be mapped back. */
  variationIds: string[];
  metrics: Array<Pick<SimMetric, 'key' | 'eventKey' | 'isNumeric'>>;
  /** settings[variationId][metricKey] */
  settings: Record<string, Record<string, MetricSetting>>;
  /** Prefix for generated context keys so a run's visitors are recognizable. */
  runId: string;
  /** Offset so context keys stay unique across batches. */
  offset: number;
};

export type VariationTally = {
  visitors: number;
  /** metricKey -> number of events sent (binary) or sum of values (numeric). */
  events: Record<string, number>;
};

export type SimulateResponse = {
  processed: number;
  notInExperiment: number;
  byVariation: Record<string, VariationTally>;
};

export type QuickstartRequest = { project: string; environment: string; templateId: string };
export type QuickstartResponse = { flagKey: string; metricKey: string; experimentKey: string };
