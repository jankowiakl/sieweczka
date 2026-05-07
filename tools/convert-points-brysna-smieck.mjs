import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "data", "points_brysna_smieck.gpkg");
const output = resolve(root, "data", "points_brysna_smieck.geojson");

if (!existsSync(input)) {
  console.error(`Brak pliku wejściowego: ${input}`);
  process.exit(1);
}

const result = spawnSync("ogr2ogr", [
  "-f",
  "GeoJSON",
  "-t_srs",
  "EPSG:4326",
  output,
  input
], { stdio: "inherit" });

if (result.error?.code === "ENOENT") {
  console.error("Nie znaleziono ogr2ogr. Zainstaluj GDAL i uruchom:");
  console.error(`ogr2ogr -f GeoJSON -t_srs EPSG:4326 data/points_brysna_smieck.geojson data/points_brysna_smieck.gpkg`);
  process.exit(1);
}

process.exit(result.status ?? 0);
