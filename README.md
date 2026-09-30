# LaunchDarkly Experiment Simulator

**Use it now:** https://ld-metric-simulator.vercel.app

Sends realistic, made-up visitors and conversions to a LaunchDarkly experiment so its **Results** tab has something to show. Built for demos, training, and checking an experiment is wired up before real traffic arrives.

You do not need to know SDK keys, flag keys, or event names. Paste an API access token, pick the experiment from dropdowns, decide how each variation should perform, and press send.

## Two modes

- **Send events straight to LaunchDarkly.** No website needed. Pick an experiment, or create a sample one, and the tool plays the visitors itself through the server-side SDK. The four steps below.
- **Send real visitors to your own site** (`/site-traffic`). For teams that have wired the experiment into a staging site and want traffic to arrive there. The page writes a journey file (staging URL, how a visitor converts, visitors per hour, duration) and the one command to run it. The command pulls the companion runner, [ld-experiment-visitors](https://github.com/ld-glynn/ld-experiment-visitors), straight from GitHub and drives real Chrome sessions at the staging site with a fresh identity per visitor. The site's own SDK does every evaluation and event, so evaluation charts, Results, and the Audience tab fill in exactly as with production traffic. Needs Node.js and Chrome or Edge on the machine that runs it, which can be inside the VPN.

## How it works (direct mode)

1. **Connect.** Paste a LaunchDarkly API access token. Reader is enough to send traffic to an existing experiment. Writer lets the tool create a sample experiment for you.
2. **Choose.** Pick a project, an environment, and a flag. Experiments that use that flag appear automatically, with their metrics and variations. If the flag has no experiment yet you can pick metrics from the project instead.
   **Starting from an empty account?** Pick "Create a sample experiment" instead of a flag. The tool creates a sample flag, a custom metric, and an experiment on the flag's default rule, turns the flag on in the chosen environment, starts the experiment, and brings you straight to step 3. Three templates: a two-variation call-to-action copy test, a three-variation pricing layout test, and a numeric "checkout time" test where lower is better. Everything it creates is tagged `experiment-simulator` and described as safe to archive.
3. **Configure.** Set how many visitors to send and, for every variation, the conversion rate (or average value, for numeric metrics). The defaults already give one variation a believable lift. "Make this the winner" rigs the numbers for you.
4. **Run.** Visitors are sent in batches with a live progress bar and per-variation tallies. Choose "spread over 4 hours" for multi-armed bandits so the reallocation curve has time to move.

Under the hood each visitor is a fresh context of the experiment's randomization unit (usually `user`). The LaunchDarkly server-side SDK evaluates the flag for that context, so LaunchDarkly decides which variation each visitor sees. The simulator then sends the metric events with the probabilities you chose.

## Things to know

- **Only running experiments record results.** LaunchDarkly attributes events to an iteration only while it is running. The tool warns you if the experiment is stopped or not started.
- **Custom metrics only.** Page view and click metrics are produced by the browser SDK and cannot be simulated from a server. They are listed and skipped.
- **Audience tab stays empty.** Server-side SDKs send rolled-up evaluation summaries, which populate experiment and flag evaluation charts but not the Audience tab.
- **Use a test environment.** These are real events in whatever environment you pick.
- **Sample experiments are real objects.** The quick start writes a flag, a metric, and a running experiment into the project you choose. Use a test environment, and archive them (tag `experiment-simulator`) when you are done.
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

- `src/app/page.tsx`: the four-step UI (direct mode)
- `src/app/site-traffic/page.tsx`: journey builder for the real-visitors mode
- `src/app/api/ld/*`: read-only proxies to the LaunchDarkly REST API (projects, environments, flags, flag detail with experiments and metrics)
- `src/app/api/ld/quickstart/route.ts`: creates and starts a sample flag + metric + experiment (Writer token)
- `src/lib/quickstart-templates.ts`: the sample experiment templates
- `src/app/api/simulate/route.ts`: runs one batch of visitors through the LaunchDarkly Node server SDK
- `src/lib/ld-rest.ts`: REST helper and error mapping

## Deploying

It is a plain Next.js app. `vercel deploy` or any Node host works. Each simulate call processes at most 250 visitors and finishes in about a second, so it fits comfortably inside serverless function limits.

## License

MIT. See [LICENSE](LICENSE).
