import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "data", "points_brysna_smieck.gpkg");
const output = resolve(root, "data", "points_brysna_smieck.geojson");
const fallbackLayer = "points_brysna_smiecka";

if (!existsSync(input)) {
  console.error(`Brak pliku wejściowego: ${input}`);
  process.exit(1);
}

const ogr2ogr = findCommand("ogr2ogr");
const ogrinfo = findCommand("ogrinfo");

if (!ogr2ogr) {
  console.error("Nie znaleziono ogr2ogr. Zainstaluj GDAL/QGIS i uruchom:");
  console.error("ogr2ogr -f GeoJSON -t_srs EPSG:4326 data/points_brysna_smieck.geojson data/points_brysna_smieck.gpkg points_brysna_smiecka");
  process.exit(1);
}

const env = {
  ...process.env,
  PROJ_LIB: process.env.PROJ_LIB || "C:\\Program Files\\QGIS 3.28.1\\share\\proj",
  GDAL_DATA: process.env.GDAL_DATA || "C:\\Program Files\\QGIS 3.28.1\\apps\\gdal\\share\\gdal"
};

let layer = fallbackLayer;
if (ogrinfo) {
  const info = spawnSync(ogrinfo, [input], { encoding: "utf8", env });
  if (info.stdout) process.stdout.write(info.stdout);
  if (info.stderr) process.stderr.write(info.stderr);
  const match = info.stdout?.match(/^\d+:\s+([^\s(]+)/m);
  if (match?.[1]) layer = match[1];
}

const result = spawnSync(ogr2ogr, [
  "-f",
  "GeoJSON",
  "-t_srs",
  "EPSG:4326",
  output,
  input,
  layer
], { stdio: "inherit", env });

if (result.status !== 0) {
  console.error(`Konwersja nie powiodła się dla warstwy: ${layer}`);
  process.exit(result.status ?? 1);
}

const data = JSON.parse(readFileSync(output, "utf8"));
if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
  console.error("Wynik nie jest poprawnym GeoJSON FeatureCollection.");
  process.exit(1);
}
if (data.features.length === 0) {
  console.error("GeoJSON został utworzony, ale nie zawiera obiektów.");
  process.exit(1);
}

console.log(`Utworzono ${output}`);
console.log(`Liczba obiektów: ${data.features.length}`);

function findCommand(name) {
  const candidates = [
    name,
    `C:\\Program Files\\QGIS 3.28.1\\bin\\${name}.exe`,
    `C:\\Program Files\\QGIS 3.28.1\\apps\\gdal\\bin\\${name}.exe`
  ];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return "";
}
