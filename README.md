# LaunchDarkly Experiment Simulator

**Use it now:** https://ld-metric-simulator.vercel.app

Sends realistic, made-up visitors and conversions to a LaunchDarkly experiment so its **Results** tab has something to show. Built for demos, training, and checking an experiment is wired up before real traffic arrives.

You do not need to know SDK keys, flag keys, or event names. Paste an API access token, pick the experiment from dropdowns, decide how each variation should perform, and press send.

## How it works

1. **Connect.** Paste a LaunchDarkly API access token. The Reader role is enough.
2. **Choose.** Pick a project, an environment, and a flag. Experiments that use that flag appear automatically, with their metrics and variations. If the flag has no experiment yet you can pick metrics from the project instead.
3. **Configure.** Set how many visitors to send and, for every variation, the conversion rate (or average value, for numeric metrics). The defaults already give one variation a believable lift. "Make this the winner" rigs the numbers for you.
4. **Run.** Visitors are sent in batches with a live progress bar and per-variation tallies. Choose "spread over 4 hours" for multi-armed bandits so the reallocation curve has time to move.

Under the hood each visitor is a fresh context of the experiment's randomization unit (usually `user`). The LaunchDarkly server-side SDK evaluates the flag for that context, so LaunchDarkly decides which variation each visitor sees. The simulator then sends the metric events with the probabilities you chose.

## Things to know

- **Only running experiments record results.** LaunchDarkly attributes events to an iteration only while it is running. The tool warns you if the experiment is stopped or not started.
- **Custom metrics only.** Page view and click metrics are produced by the browser SDK and cannot be simulated from a server. They are listed and skipped.
- **Audience tab stays empty.** Server-side SDKs send rolled-up evaluation summaries, which populate experiment and flag evaluation charts but not the Audience tab.
- **Use a test environment.** These are real events in whatever environment you pick.
- **Bandits need time.** Multi-armed bandits reallocate at most hourly, so spread traffic over a few hours to see more than one step.

## Your token

The token is held in the browser tab and sent to this app's server with each request so the server can list your projects, read the environment's SDK key, and send events. It is never written to a database or a log, and the SDK key never reaches the browser.

If your organization would rather not hand a token to a hosted tool, run the app locally (below). It is the same code.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. No environment variables are needed.

## Project layout

- `src/app/page.tsx`: the four-step UI
- `src/app/api/ld/*`: read-only proxies to the LaunchDarkly REST API (projects, environments, flags, flag detail with experiments and metrics)
- `src/app/api/simulate/route.ts`: runs one batch of visitors through the LaunchDarkly Node server SDK
- `src/lib/ld-rest.ts`: REST helper and error mapping

## Deploying

It is a plain Next.js app. `vercel deploy` or any Node host works. Each simulate call processes at most 250 visitors and finishes in about a second, so it fits comfortably inside serverless function limits.

## License

MIT. See [LICENSE](LICENSE).
