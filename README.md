# The Great Migrations

An interactive 3D atlas that follows twelve animal migrations through one year: humpback whales, arctic terns, wildebeest, monarch butterflies, caribou, barn swallows, Atlantic bluefin tuna, honey buzzards, house martins, great white egrets, the starlings of Rome and the European eel. The globe, the routes, the animals and all the animation are generated in code with three.js and GLSL. The only bitmaps are the twelve documentary "plates" generated through Codex.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/
```

## Using it

| Action | Effect |
| --- | --- |
| Drag the globe | Spin it with inertia. It also leans toward the pointer when left alone. |
| Press and hold on the globe | **Time-lapse**: the year accelerates up to ×19 with a radial streak. |
| Drag the orbit ring (or scroll over it) | Scrub the months. The ring is the timeline. |
| Click a species (index, label or beacon) / keys `1`–`9`, `0` (then `Tab`) | Directed camera move to that migration. |
| `Esc` · `Tab` / `Shift+Tab` · `←` `→` · `Space` | Back · next/prev species · step a month · play/pause |
| Scroll | Zoom |

The year starts on today's date.

## What's going on

- **The planet** (`src/earth.js`). Coastlines are rasterised at runtime from Natural Earth (`world-atlas`) into a three-channel field: sharp coast, shelf, continentality. Static climate (deserts, rainforests, mountain ranges and macro noise) is baked into a texture once on the GPU. The surface shader adds ridged terrain with derivative bump lighting, a snowline and sea ice that follow the month, an ocean glint, and a terminator glow. At close range, extra detail (woodland, drainage lines, fractal coasts) resolves through anti-aliased noise. When the camera dives in, a 2048² land patch is rendered on demand for that region.
- **Night is a different medium.** The day side is a natural-colour planet. Past the terminator it dissolves into halftone cartography: dot grids sized to the screen at every zoom level, glowing coastlines and a graticule. The day/night line is literally where the nature documentary becomes mission control.
- **The director's sun.** Solar declination comes from the date, so seasons are physical. In overview the sun trails the viewer slowly, so the terminator slides as you spin. Selecting a species moves the sun to side-light that route.
- **The orbit is the timeline** (`src/hud.js`). The twelve months are a 3D ring with true perspective. The back half is masked by the globe's silhouette. "Now" is always at the front, where the sun bead sits. The ring also carries a band per species showing when it is in transit, and the live sightings ticker runs along its outer orbit. Every sighting pings the globe where it was logged.
- **One visual language per species** (`src/species.js`):
  - **Whales:** SDF humpback silhouettes with long pectoral fins and beating flukes, wakes, spiral bubble-nets while feeding, and song rings that pulse faster in breeding season.
  - **Terns:** a 2,600-particle comet streaming along an S-shaped route aloft. It folds into a murmuration whenever the birds stop.
  - **Wildebeest:** 7,500 dark bodies in braided columns, with dust and river-crossing splashes at the Grumeti and the Mara.
  - **Monarchs:** a fluttering swarm funnelling from a broad front down to a few fir-forest roosts. It recolours by generation on the spring relay.
  - **Caribou:** sixteen braided trails worn into the tundra behind a dark herd that spreads out on the calving grounds.
  - **Barn swallows:** a broad, fast front of streaking birds that zig-zag as they hunt, from Po Valley farms across the Sahara to winter roosts in Nigeria. At rest they fly figure-of-eight loops.
  - **Bluefin tuna:** compact schools that stretch out while swimming and mill in rings on the spawning grounds, with silver flashes sweeping across them. They pass through the Strait of Gibraltar both ways.
  - **Honey buzzards:** thermal-hopping flight. Each bird climbs a tightening spiral, glides out of the top to the next thermal, and funnels over Cap Bon, Marettimo and the Strait of Messina in spring.
  - **House martins:** colonies that light up on the cornices of nine Italian towns, with short sorties from the nest. They migrate higher than swallows, west over Sardinia and Algeria and back via Tunisia and Sicily, with white-rump flashes, then thin into a high, faint cloud over African forests where they are rarely seen.
  - **Great white egrets:** slow, widely spaced V-skeins with a wave of wingbeats running down each line, from Lake Neusiedl via the Po Delta, Camargue and Urdaibai to Doñana and Morocco. At rest they stand still in shallow water at wetland sites, with the odd short hop.
  - **Starlings of Rome:** dense flocks pour south from the Baltic, then become one murmuration over Rome all winter. It is a glowing sheet that folds into travelling S-bends, pinches, flattens and turns, with density waves rippling through it.
  - **European eel:** a lifetime folded into one year, drawn in three stages. A long, pale band of larvae drifts on the Gulf Stream, sharpens into sparkling glass eels entering the Mediterranean and the Tiber, and returns as undulating silver eels that swirl in the Sargasso Sea to spawn. It is the only Critically Endangered species on the globe.
- **Post** (`src/post.js`): bloom, a golden-angle bokeh focus pull that tracks the subject (it racks during camera moves), the time-lapse streak, chromatic fringe, vignette and luma-weighted grain.
- **Typography is in the scene.** There are no panels. Labels hang on leader lines from projected positions, and the route name is set along the projected route itself. Callouts anchor to the herd and to the route ends and avoid each other. Titles assemble letter by letter.

Dev tools: `window.__migrations` exposes live state. `__migrations.app.select('tern')`, `__migrations.step(5)` (advance 5 s deterministically), and `__migrations.S.t = 6.5` (jump to mid-July) all work.

## Data

All figures are **plausible composites grounded in published behaviour**, not live data. Routes follow documented corridors (Southeast Pacific humpback Stock G, Greenland arctic terns, the Serengeti–Mara circuit, the eastern monarch flyway, the Porcupine caribou herd, Italian barn swallows wintering in West Africa, the eastern Atlantic bluefin stock, the Messina honey-buzzard flyway, Italian house-martin colonies, the central-European great-egret flyway, the Baltic-to-Rome starling flyway, and the eel's Sargasso–Mediterranean cycle). See `src/data.js`.

## Images

`public/img/*.jpg` were generated with the image tool built into the Codex CLI, under the ChatGPT/Codex subscription, with no API key (`scripts/generate-portraits.sh` regenerates them). The built-in tool does not let you choose the model, and it doesn't report which one it used. The prompts request GPT Image 2.5, but that cannot be pinned or verified through the subscription route. Codex's CLI fallback that does accept `--model` requires an `OPENAI_API_KEY`, so it was deliberately not used.
