#!/usr/bin/env bash
# Regenerates the five species plates with Codex's built-in image tool, billed to the
# ChatGPT/Codex subscription you're logged into (no OpenAI API key involved).
# Requires the Codex CLI; on macOS it ships inside ChatGPT.app.
set -euo pipefail
cd "$(dirname "$0")/.."
CODEX="${CODEX:-$(command -v codex || echo /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex)}"
mkdir -p assets-src public/img

STYLE="documentary wildlife photograph, cinematic, National Geographic style, deep shadows, low-key lighting, 35mm film grain, subtle desaturation, vertical composition, generous dark negative space at top, no text, no watermark"
gen() {
  "$CODEX" exec --skip-git-repo-check -s workspace-write \
    "Use your built-in image generation tool (request model gpt-image-2.5 if selectable) to create ONE image; do not draw it with code. Prompt: '$2, $STYLE'. Size 1024x1536 portrait. Then copy the resulting PNG to ./assets-src/$1.png and print the final path." &
}
gen whale "A humpback whale breaching at dusk in the South Pacific, cold blue-teal palette, mist"
gen tern "An arctic tern in flight against a pale polar sky over drifting sea ice, wings fully spread, backlit translucent feathers, cold silver-blue palette"
gen wildebeest "A vast column of wildebeest crossing the Mara River in golden dusty late-afternoon light, splashing water, dust haze, warm amber palette, telephoto compression"
gen monarch "Thousands of monarch butterflies clustered on oyamel fir branches in the misty mountain forests of Michoacan, Mexico, shafts of morning light, rich orange and deep green"
gen caribou "A herd of caribou crossing snowy arctic tundra at blue hour, breath vapor visible, mountains of the Brooks Range behind, soft pink and ice-blue light"
gen swallow "A barn swallow in fast flight skimming low over a golden Italian wheat field at dawn, forked tail, steel-blue back catching the light, motion and speed"
gen tuna "A school of Atlantic bluefin tuna swimming in deep blue Mediterranean water, shafts of sunlight from the surface, silver flanks flashing, underwater photography"
gen buzzard "A European honey buzzard soaring on a thermal above the Strait of Messina, Sicily and Calabria coastlines below in hazy morning light, wings spread wide, seen from slightly below"
gen martin "Common house martins at their mud nests under the stone cornice of an old Italian palazzo at golden hour, one bird in flight showing its bright white rump and glossy blue-black back, terracotta and ochre walls"
gen egret "A great white egret standing in shallow misty estuary water at dawn, long neck in an S-curve, delicate breeding plumes, reflections on still water, reeds silhouetted behind, cold blue and pale gold light"
gen starling "A vast murmuration of starlings forming a swirling dark shape in the dusk sky above the domes and rooftops of Rome, St Peter's dome silhouetted, pink and violet sunset, the River Tiber below"
gen eel "A European eel swimming through dark deep blue ocean water, silvery sinuous body catching a faint shaft of light, tiny transparent glass eels drifting around it, mysterious deep-sea atmosphere, underwater photography"
wait

for id in whale tern wildebeest monarch caribou swallow tuna buzzard martin egret starling eel; do
  sips -s format jpeg -s formatOptions 82 -Z 1200 "assets-src/$id.png" --out "public/img/$id.jpg" >/dev/null
done
echo "Plates written to public/img/"
