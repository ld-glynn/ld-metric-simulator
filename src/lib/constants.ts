/** Largest number of visitors one /api/simulate call will process. Keeps each call well inside Vercel's 60s limit. */
export const MAX_BATCH = 250;

/** Header the browser uses to hand the LaunchDarkly API token to this app's own routes. */
export const TOKEN_HEADER = 'x-ld-api-token';

/** Tag put on every flag and metric the quick start creates, so they are easy to find and archive. */
export const SIMULATOR_TAG = 'experiment-simulator';
