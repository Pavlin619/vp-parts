// MapLibre finds its worker beside its own module, which a bundled chunk is not,
// so the worker and the shared code it imports are served from public/ instead.
// Copied on every dev and build to stay on the installed version.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sourceDir = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const targetDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "vendor", "maplibre");

mkdirSync(targetDir, { recursive: true });

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(sourceDir, file), join(targetDir, file));
}
