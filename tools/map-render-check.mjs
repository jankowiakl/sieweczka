// Small renderer/initialization regression check; no browser or extra dependencies.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const filters = fs.readFileSync(new URL("../study-filters.js", import.meta.url), "utf8");
for (const file of ["app.js", "study-filters.js", "sw.js"]) new vm.Script(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), { filename: file });
const year = new Date().getFullYear();
const entries = [
  { uid: "nest-control", obsDate: `${year}-05-15T09:43:00Z`, lat: 52, lon: 19, randomMicro: { lat: 52.1, lon: 19.1 } },
  { uid: "unknown-species", season: year, obsDate: `${year}-05-15`, lat: "53", lon: "18" },
  { uid: "old", season: String(year - 1), lat: 51, lon: 20 },
  { uid: "no-gps", season: year },
  { uid: "deleted", season: year, lat: 51, lon: 20, deletedAt: "deleted" }
];
const working = [
  { id: "now", createdAt: `${year}-05-15T10:00:00Z`, status: "potwierdzone", lat: 52, lon: 19 },
  { id: "old", createdAt: `${year - 1}-05-15`, status: "do_sprawdzenia", lat: 51, lon: 20 }
];
const originalData = JSON.stringify([entries, working]);
const elements = new Map();
const element = (selector) => {
  if (!elements.has(selector)) elements.set(selector, { checked: false, hidden: false, innerHTML: "", addEventListener() {} });
  return elements.get(selector);
};
let mapCreations = 0;
const context = vm.createContext({
  $: element, $$: () => [element("options"), element("measure")], window: { addEventListener() {} },
  recordsMap: null, workingMap: null, mapMarkersLayer: null, workingLayer: null,
  recordsGridLayer: null, workingGridLayer: null, workingFocusId: null, workingViewMode: "map", latestUserLatLng: null,
  MAP_MAX_ZOOM: 30, ortoCacheState: { records: { viewRestored: true }, working: { viewRestored: true } },
  activeEntries: () => entries, activeWorkingNests: () => working,
  getSpeciesInfo: (entry) => ({ key: entry.species || "" }), escapeHtml: String, speciesLabel: () => "",
  canMoveMapPoint: () => false, canEditItem: () => false, canSoftDeleteItem: () => false, isMapPointEditModeEnabled: () => false,
  markerLabelHtml: () => "", workingStatusMarkerText: () => "?", workingStatusLabel: (status) => status,
  createBaseLayers: () => ({ layers: {} }), showMapRenderError: (_, error) => { throw error; },
  L: {
    map() { mapCreations++; return { _loaded: true, attributionControl: { setPrefix() {} }, on() {}, hasLayer: () => true }; },
    layerGroup() { return { markers: [], addTo() { return this; }, clearLayers() { this.markers = []; } }; },
    divIcon: (options) => options,
    marker(pos, options) { return { pos, options, addTo(layer) { layer.markers.push(this); return this; }, bindPopup() {}, bindTooltip() {}, openPopup() {} }; }
  }
});
vm.runInContext(filters, context);
const F = context.StudyFilters;
context.toLatLon = F.coordinates;
let selected = F.getDefaultFilters();
context.getViewFilters = () => selected;
context.filteredRecords = () => F.filterRecords(entries, selected, context.getSpeciesInfo);
context.filteredWorkingNests = () => F.filterWorkingNests(working, selected, context.getSpeciesInfo);
for (const name of ["initMapBaseLayerSelect", "restoreMapViewState", "initViewedOrtoCacheTools", "initMeasureTools", "initBrysnaSmieckLayer", "switchToOfflineOrtoIfNeeded", "initMapPointEditControl", "initQuickMapEntryControl", "bindRecordPointDrag", "bindWorkingNestDrag", "refreshFilterSummary", "setMapInfo", "resizeFieldMap", "renderBrysnaSmieckPoints", "syncUserLocationLayers", "bringMeasureToFront", "syncWorkingControlLocation", "clearMapRenderError", "captureMapViewState", "scheduleMapViewStateSave", "saveMapPanelState"]) context[name] = () => {};
for (const name of ["initMapViewStatePersistence", "getMapEmptyMessage", "renderRecordsMap", "renderRecordsMapContent", "renderWorkingMap", "renderWorkingMapContent"]) {
  const start = app.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, name);
  vm.runInContext(app.slice(start, app.indexOf("\n  }", start) + 4), context);
}
context.renderRecordsMap(); context.renderWorkingMap();
assert.equal(context.mapMarkersLayer.markers.length, 3);
assert.equal(context.workingLayer.markers.length, 1);
assert.ok(context.workingLayer.markers[0].options.icon.className.includes("potwierdzone"));
selected = { ...selected, year: "all" };
context.renderRecordsMap(); context.renderWorkingMap();
assert.equal(context.mapMarkersLayer.markers.length, 4);
assert.equal(context.workingLayer.markers.length, 2);
for (const [type, count] of [["gniazdo", 3], ["kontrola", 1]]) {
  selected = { ...selected, pointType: type };
  context.renderRecordsMap();
  assert.equal(context.mapMarkersLayer.markers.length, count);
  assert.ok(context.mapMarkersLayer.markers.every((marker) => marker.options.icon.className.includes(type)));
}
assert.equal(mapCreations, 2, "Filter changes must reuse Leaflet maps");
assert.equal(JSON.stringify([entries, working]), originalData);
assert.match(context.getMapEmptyMessage("records", 0, []), /Brak zapisanych danych/);
assert.match(context.getMapEmptyMessage("records", 0, [{ season: year }]), /GPS/);
selected = F.getDefaultFilters();
assert.equal(context.getMapEmptyMessage("records", 0, [{ season: year - 1 }]), "Brak punktów w wybranym sezonie. Zmień rok lub wybierz Wszystkie lata.");
for (const obsDate of ["2026-05-15", "2026-05-15T09:43:00Z", "2026-05-15 09:43:00", "15.05.2026"]) assert.equal(F.getRecordStudyYear({ obsDate }), 2026);
for (const createdAt of ["2026-05-15", "2026-05-15T09:43:00Z", "2026-05-15 09:43:00", "15.05.2026"]) assert.equal(F.getWorkingNestYear({ createdAt }), 2026);
assert.equal(F.getRecordStudyYear({ obsDate: "2026-02-30" }), null);
assert.equal(F.getWorkingNestYear({ updatedAt: "2026-05-15" }), null);
console.log("PASS: syntax, real initialization selector, renderer calls into a Leaflet stub, current/all years, G/K, statuses, empty/GPS messages, date formats and unchanged source data. No browser/E2E test.");
