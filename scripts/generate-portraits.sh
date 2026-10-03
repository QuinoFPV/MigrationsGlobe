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
wait

for id in whale tern wildebeest monarch caribou; do
  sips -s format jpeg -s formatOptions 82 -Z 1200 "assets-src/$id.png" --out "public/img/$id.jpg" >/dev/null
done
echo "Plates written to public/img/"
