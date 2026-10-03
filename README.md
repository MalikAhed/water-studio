# Stillwater — Hawaiian lagoon

[**Explore the live lagoon →**](https://malikahed.github.io/water-studio/)

An interactive Three.js / WebGL island: clear turquoise water, a sloping sandy beach, 18 coconut palms with 108 coconuts, 70 varied rocks, 30 animated reef fish, seagrass/kelp clusters, colorful coral and sponge gardens, leafy coastal plants, an arched wooden bridge, and a wooden rowboat. Four turtles, nine crabs, seven seahorses, five jellyfish, and scattered starfish inhabit the reef. The water renders scene reflections, depth-aware refraction, wavelength-dependent absorption, and a subtle shoreline wash. The earlier flowing wave motion and fading ripple rings drive the newer water renderer; water caustics and sun glare are disabled.

## Run locally

Use Node.js 24 (the deployment version) or a compatible Node.js 22 release
starting at 22.12. Install the exact dependencies from the committed lockfile:

```sh
npm ci
npm run dev -- --port 4174 --strictPort
```

Open **http://localhost:4174/**. Vite updates the page as files change.

- **WASD / arrow keys:** swim in the direction you look, or strafe sideways. Movement eases in and out and slides along rock bounds.
- **Q / E:** dive / rise. **Shift:** boost from 10 to 25 world units per second. **C:** slow to 2.2 for close inspection.
- **Drag:** look around. **Explore:** capture the mouse for continuous mouse look; **Esc** releases it.
- **Scroll:** change camera height. Dive below the surface; the camera stops above the seabed.
- **Click water:** create a ripple. **Space:** pause the water while keeping camera movement available.
- **H:** hide or restore controls. On touch devices, use the movement arrows and +/− buttons.
- **Reset:** return to the original viewpoint and settings. **Save view:** download a PNG.

Daylight, golden hour, moonlight, wave height, flow speed, surface detail, and rain remain adjustable. The defaults (also restored by Reset) are wave height 1.5, flow speed 2, and surface texture 1. Their slider limits are 3, 4, and 2 respectively. All assets and dependencies are served locally. This uses a cached wave field and approximated light transport; it does not simulate full fluid dynamics. WebGL 2 is required; render scale stays at 1 with native display pixel density; it does not automatically reduce resolution.

## Deployment

GitHub Pages publishes the site at **https://malikahed.github.io/water-studio/**. Every push to `main` runs the [deployment workflow](.github/workflows/pages.yml), builds the Vite application, and publishes `dist/`. No API keys or backend services are required.

For a local production preview, run `npm run build` followed by `npm run preview`, then open `http://localhost:4173/water-studio/`. Development continues to use the root URL on port 4174.

## Verification

`npm run build` builds the production site; the Pages workflow runs this build,
not the browser regression checks below.

- `node habitat-check.mjs` runs directly after `npm ci`, without a development
  server or Chrome. It checks swept collision and simulated animal movement.
- `node wave-check.mjs` checks wave motion, pause, controls, anchoring, ripple decay,
  reset, and frame cadence. It accepts `CHROME_PATH`, but needs the development
  server at `http://localhost:4174/` because it imports development modules.
- `node smoke.mjs` checks WebGL, navigation, pause, reset, lighting, PNG export,
  and desktop/mobile rendering. It accepts `CHROME_PATH` and `WATER_URL`.
- `node detail-check.mjs` captures close views and checks wave motion. It hardcodes
  `http://localhost:4174/` and `/usr/bin/google-chrome`; neither override applies.

Browser scripts require an installed Chrome executable and a running server.
Their default browser path is `/usr/bin/google-chrome`. Captures are written to
`artifacts/`; explicit animation stepping makes these functional checks rather
than hardware FPS measurements. See [TESTING.md](TESTING.md) for the complete
setup, browser selection, and production-path smoke check.

## Textures

The sand and rock textures are generated assets, served with the application:

- `public/textures/coral-sand.webp`
- `public/textures/volcanic-rock.webp`

Original prompts:

> Use case: photorealistic-natural. Asset type: seamless square albedo texture for a real-time 3D Hawaiian beach and underwater sand, 1024 by 1024. Primary request: perfectly top-down orthographic scan of pale ivory coral beach sand with extraordinarily fine natural grain, sparse microscopic tan shell flecks, faint broad irregular sand ripples. Flat diffuse neutral lighting, no directional shadows, no reflected light or caustics, no water, no objects, no horizon, no text. Fine realistic PBR base color, low contrast, near-white warm cream rather than orange, unobtrusive tiling pattern. Entire image filled edge to edge with sand, seamless.

> Use case: photorealistic-natural. Asset type: seamless square PBR rock albedo texture for a 3D Hawaiian shoreline, 1024 by 1024. Perfectly top-down orthographic material scan of weathered gray-brown volcanic basalt stone, realistic porous pitted rough grain, hairline mineral cracks, subtle earthy ochre mineral deposits and olive algae in tiny crevices. Mid gray warm neutral palette, detailed believable irregular fine texture without large dominant patches. Even diffuse neutral lighting, no directional shadows, no objects, no perspective, no text, no borders. Seamlessly tileable flat material filling the whole image.

Rendering uses the local Three.js implementation and its documented [depth textures](https://threejs.org/docs/pages/DepthTexture.html) and [standard material model](https://threejs.org/docs/pages/MeshStandardMaterial.html). Geometry, shaders, navigation, and interface are project code.

Swimming animals use conservative rock bounding boxes expanded by body radius and swept movement steps to avoid tunneling. Underwater rendering intersects the same moving wave surface as the above-water view, using Snell refraction, Fresnel reflection, total internal reflection, scene-depth tracing, and distance-dependent absorption. Offscreen objects fall back to sky or water color, as this is a screen-space effect. Plant and reef geometry is batched by material to reduce draw calls.

## Detailed island update

The island footprint is approximately three times larger (30 × 20 terrain radii versus 18 × 11). Coconut palms have larger feathered crowns, textured trunks, and fruit clusters. Leaves have folded geometry, vein/roughness/bump maps and current motion. Sponges, coral, shells, scales, skin and wood use shared procedural texture sets. Jellyfish have translucent scalloped bells, internal radial canals, pulsing organs, and separately animated trailing filaments. Turtles use articulated flippers; crabs scuttle with jointed legs and pincers; seahorses flutter their fins.

Downloaded model candidates are preserved in `references/models/`, with sources and licenses in [ATTRIBUTIONS.md](references/models/ATTRIBUTIONS.md). The performance revision uses four instanced, brightly patterned fish schools and four merged rock batches instead. The downloaded scans are excluded from the public build. Rock geometry uses small convex hulls with irregular strata and offset shoulders; round boulders have been replaced by angular outcrops. Reef materials use shared color/bump maps; the translucent jellyfish details are merged, and reflection updates are cached and water lighting passes are removed. `node detail-check.mjs` checks the close views, wave motion, and rendering diagnostics.

Water research and the implementation limits are documented in [WATER_NOTES.md](WATER_NOTES.md). Sand and stone textures are served as WebP; original PNGs and evaluated scan models are retained under `references/` and excluded from the production build.

## License

Original contributions by Malik Abuallatta are licensed under the
[MIT License](LICENSE). Third-party code, adaptations, dependencies, and assets
retain their existing licenses and notices. This license does not grant new
rights to third-party material.
