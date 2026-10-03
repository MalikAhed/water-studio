# Testing Stillwater

Run all commands from the repository root with Node.js 24 (the Pages workflow
version) and the committed dependencies:

```sh
npm ci
```

## Build and non-browser checks

```sh
npm run build
node habitat-check.mjs
```

The habitat check runs in Node and does not need a server or Chrome. It exercises
swept collision and simulated swimming against both deliberately obstructed lanes
and the actual island rock bounds.

The build writes `dist/` with the `/water-studio/` base path. A successful build
does not execute the habitat, wave, smoke, or detail checks.

## Browser-check prerequisites

In one terminal, keep the Vite development server running at its fixed test port:

```sh
npm run dev -- --port 4174 --strictPort
```

The scripts launch headless Chrome with software-rendering flags. By default they
expect `/usr/bin/google-chrome`:

- `wave-check.mjs`: supports `CHROME_PATH`; server URL is fixed at
  `http://localhost:4174/`.
- `smoke.mjs`: supports both `CHROME_PATH` and `WATER_URL`.
- `detail-check.mjs`: hardcodes the default Chrome path and development URL;
  neither environment override applies.

Installing the npm package alone does not install a browser executable. If Chrome
is elsewhere, set `CHROME_PATH` to the actual executable for the first two scripts.
Alternatively, after `npx playwright install chromium`, a POSIX shell can select
Playwright's installed Chromium:

```sh
export CHROME_PATH="$(node --input-type=module -e "import { chromium } from '@playwright/test'; console.log(chromium.executablePath())")"
```

This does not change `detail-check.mjs`'s hardcoded path. If its required browser
is unavailable, report that check as blocked rather than assuming it passed.

## Run browser checks

In a second terminal:

```sh
node wave-check.mjs
node smoke.mjs
node detail-check.mjs
```

The wave check serves a synthetic test page and imports `/src/waves.js` and
Three.js from the development server. It checks motion, pause behavior, control
scaling, world-space anchoring, ripple decay, reset, and frame cadence. A
production preview does not expose the same development module paths.

The smoke check exercises the application, movement while paused, diving and
resurfacing, interaction, lighting, PNG export, and a mobile viewport. The detail
check captures close views and compares surface output after wave motion.
Screenshots and exports are written under `artifacts/`. These scripts drive
animation frames explicitly; elapsed test time is not an FPS benchmark.

## Production-path smoke check

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

Open `http://localhost:4173/water-studio/` manually. Confirm assets load, movement
and pause work, and Save view downloads a PNG. Development instead uses
`http://localhost:4174/`; do not interchange the two URL layouts.

Record the commit, Node/browser versions, commands run, failures, and skipped
checks. The Pages workflow currently builds and deploys only, so a green deployment
does not establish that these browser regressions were run.
