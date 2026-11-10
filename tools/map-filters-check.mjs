// Minimal checks only: no browser, server or additional dependencies.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const app = read("app.js");
const html = read("index.html");
for (const name of ["app.js", "study-filters.js", "sw.js"]) new vm.Script(read(name), { filename: name });

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML IDs must be unique");
for (const view of ["records", "working"]) {
  for (const suffix of ["base-layer", "map", "navigation-panel", "options-panel", "legend-panel", "measure-panel", "fullscreen-map", "orto-cache-status"]) {
    assert.ok(ids.includes(`${view}-${suffix}`), `Missing existing control: ${view}-${suffix}`);
  }
}
assert.ok(html.indexOf('src="study-filters.js') < html.indexOf('src="app.js'));
assert.ok(read("sw.js").includes(html.match(/src="(study-filters\.js[^" ]+)"/)[1]));

let localNow = new Date(2026, 11, 31, 23, 59, 50);
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [localNow.getTime()])); }
  static now() { return localNow.getTime(); }
}
const context = vm.createContext({ Date: ClockDate });
vm.runInContext(read("study-filters.js"), context);
const F = context.StudyFilters;
function loadFunction(name) {
  const start = app.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const end = app.indexOf("\n  }", start) + 4;
  vm.runInContext(app.slice(start, end), context);
}
context.LABELS = { species: { "charadrius-hiaticula": "Sieweczka obrożna", "vanellus-vanellus": "Czajka", unknown: "Nieokreślony" } };
context.otherSpeciesState = { species: JSON.parse(read("data/other_species.json")).species };
for (const name of ["normalizeSearchText", "findOtherSpecies", "getRecordSpeciesCatalogItem", "getSpeciesInfo", "mapSpeciesLabel", "csvFromRows"]) loadFunction(name);
const info = context.getSpeciesInfo;
const entries = [
  { uid: "a", season: "2026", obsDate: "2026-05-01", species: "charadrius-hiaticula", lat: 52, lon: 19, randomMicro: { lat: 52.1, lon: 19.1 } },
  { uid: "b", obsDate: "2026-06-15", species: "Czajka", lat: 53, lon: 18 },
  { uid: "c", season: "2025", obsDate: "2025-05-01", updatedAt: "2026-11-01", species: "Czajka", lat: 53, lon: 18 },
  { uid: "d", obsDate: "2026-06-01", species: "Sieweczka obrożna" },
  { uid: "e", species: "Czajka", updatedAt: "2026-11-01" },
  { uid: "f", obsDate: "2026-05-01", species: "Czajka", deletedAt: "2026-06-01", lat: 52, lon: 19 },
  { uid: "g", season: "bad", obsDate: "2026-02-30" }
];
const snapshot = JSON.stringify(entries);
const defaults = F.getDefaultFilters();
const selectedIds = (filters) => Array.from(F.filterRecords(entries, filters, info), (e) => e.uid);
assert.deepEqual(selectedIds(defaults), ["a", "b", "d"]);
assert.equal(F.getRecordStudyYear(entries[2]), 2025);
assert.equal(F.getRecordStudyYear(entries[4]), null);
assert.equal(F.getRecordStudyYear(entries[6]), null);
assert.equal(F.getRecordStudyYear({ season: "invalid", obsDate: "2025-12-31" }), 2025);
assert.equal(F.filterRecordMapPoints(entries, defaults, info).length, 3);
assert.equal(F.filterRecordMapPoints(entries, { ...defaults, pointType: "gniazdo" }, info).length, 2);
const controlFilters = { ...defaults, pointType: "kontrola" };
assert.deepEqual(selectedIds(controlFilters), ["a"]);
assert.equal(F.filterRecordMapPoints(entries, controlFilters, info)[0].type, "kontrola");
assert.deepEqual(selectedIds({ ...defaults, species: [info(entries[0]).key] }), ["a", "d"]);
assert.deepEqual(selectedIds({ ...defaults, species: [info(entries[0]).key, info(entries[1]).key] }), ["a", "b", "d"]);
assert.deepEqual(selectedIds({ ...defaults, dateFrom: "2026-05-01", dateTo: "2026-06-15" }), ["a", "b", "d"]);
assert.deepEqual(selectedIds({ ...defaults, dateFrom: "2026-06-15", dateTo: "2026-06-15" }), ["b"]);
assert.deepEqual(selectedIds({ ...defaults, year: "2025", dateFrom: "2026-01-01" }), []);
assert.equal(F.getAvailableSpecies(entries, info).length, 2);
assert.equal(info({ species: "vanellus-vanellus" }).key, info({ species: "Vanellus vanellus" }).key);
assert.equal(info({ species: "custom:sieweczka-morska" }).key, info({ species: "CHAALE" }).key);
assert.ok(info({ species: "unknown", speciesLatinName: "Vanellus vanellus" }).key);
for (const language of ["pl", "la", "en"]) {
  context.getMapViewState = () => ({ overlays: { speciesLanguage: language } });
  const entry = { species: "Test species", speciesPolishName: "Nazwa polska", speciesLatinName: "Testus testus", speciesEnglishName: "Test name" };
  assert.equal(context.mapSpeciesLabel(entry, "records"), ({ pl: "Nazwa polska", la: "Testus testus", en: "Test name" })[language]);
}
assert.equal(context.mapSpeciesLabel({ species: "vanellus-vanellus" }, "records"), "Vanellus vanellus");
const working = [
  { id: "w1", createdAt: "2026-05-01T12:00:00+02:00", status: "potwierdzone" },
  { id: "w2", createdAt: "2025-05-01T12:00:00+02:00", updatedAt: "2026-05-01", status: "do_sprawdzenia" },
  { id: "w3", updatedAt: "2026-05-01", status: "potwierdzone" }
];
assert.equal(F.filterWorkingNests(working, defaults, info).length, 1);
assert.equal(F.getWorkingNestYear(working[2]), null);
assert.equal(F.filterWorkingNests(working, { ...defaults, statuses: ["odrzucone"] }, info).length, 0);
assert.equal(F.filterWorkingNests(working, { ...defaults, dateFrom: "2026-05-01", dateTo: "2026-05-01", statuses: ["potwierdzone"] }, info).length, 1);
localNow = new Date(2027, 0, 1, 0, 0, 1);
const rolled = F.ensureCurrentCalendar({ ...defaults, year: "2026", species: ["czajka"] });
assert.equal(rolled.year, "current");
assert.equal(rolled.calendarYear, 2027);
assert.deepEqual(selectedIds(rolled), []);
assert.deepEqual(selectedIds({ ...rolled, year: "2026" }), ["a", "b", "d"]);
assert.equal(F.filterWorkingNests(working, rolled, info).length, 0);
assert.equal(F.filterWorkingNests(working, { ...rolled, year: "2026" }, info).length, 1);
assert.equal(JSON.stringify(entries), snapshot, "Filtering must not mutate data");
assert.equal(context.csvFromRows([{ note: 'Łąka; "tak"\r\nżółć' }], ["note"]), 'note\n"Łąka; ""tak""\r\nżółć"');
assert.ok(app.includes("'\\uFEFF' + csv"));
assert.ok(app.includes("if (!canManageData()) return alert"));
console.log("PASS: JS syntax, HTML control IDs, species/legacy/labels, years and rollover, inclusive dates, point types, statuses, missing data, deleted records, immutability, CSV escaping and export guard. No browser/E2E tests.");
