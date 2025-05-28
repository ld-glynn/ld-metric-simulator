# LaunchDarkly Metric Simulator

This project is a web-based simulator for generating and sending synthetic flag evaluation and event data to a LaunchDarkly environment. It is built with Next.js (App Router) and uses the LaunchDarkly Node SDK on the backend.

## Features
- Simulate multiple user or organization contexts with custom attributes
- Send custom events with configurable probabilities
- Evaluate feature flags for each simulated context
- Adjustable user/entity count and event delay
- Real-time logging of event dispatches

## Usage

### 1. Install dependencies
```bash
npm install
```

### 2. Start the development server
```bash
npm run dev
```

### 3. Open the simulator
Go to [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Configure your simulation
- **SDK Key:** Enter your LaunchDarkly server-side SDK key (from your LD dashboard, for the correct environment).
- **Flag Key:** Enter the key of the feature flag you want to evaluate.
- **Events:** Add one or more events, each with a name and a probability (0-1) for how often it should be sent per user.
- **Contexts:** Define one or more context kinds (e.g., user, org) and their attributes. Each context will be simulated as a unique entity.
- **User Count:** Set how many simulated users/entities to run through the simulation.

### 5. Run the simulation
Click **Run Simulation**. The backend will:
- Generate the specified number of unique contexts
- Evaluate the flag for each context
- Send events according to the configured probabilities, with a delay between each event
- Log each event dispatch to the server console

## Notes
- Make sure your SDK key is a **server-side** key for the correct LaunchDarkly environment.
- Events may take a few seconds to appear in the LaunchDarkly dashboard.
- Each context is given a unique key for every simulation run.

## Project Structure
- `src/app/page.tsx` — Main UI for configuring and running simulations
- `src/app/api/simulate/route.ts` — API route that runs the simulation and sends data to LaunchDarkly

## License
MIT
