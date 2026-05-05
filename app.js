(() => {
  "use strict";

  const STORAGE_KEY = "sieweczka-field-data-v3";
  const LEGACY_STORAGE_KEY = "sieweczka-field-data-v2";
  const DRAFT_KEY = "sieweczka-field-draft-v3";
  const CUSTOM_SPECIES_KEY = "sieweczka-custom-species-v1";
  const OBSERVERS_KEY = "sieweczka-observers-v1";
  const SECTORS_KEY = "sieweczka-sectors-v1";
  const WORKING_NESTS_KEY = "sieweczka-working-nests-v1";
  const PHOTO_DB = "sieweczka-photo-db";
  const PHOTO_STORE = "photos";
  const PROTOCOL_VERSION = "field-sheet-v4-clean";

  const SYNC_CONFIG_KEY = "sieweczka-sync-config-v1";
  const SYNC_STATE_KEY = "sieweczka-sync-state-v1";

  function getClientId() {
    const key = "sieweczka-client-id-v1";
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; localStorage.setItem(key, id); }
    return id;
  }
  function getSyncConfig() { try { return JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY) || "{}"); } catch { return {}; } }
  function setSyncConfig(cfg) { localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(cfg)); }
  function getLastSyncAt() { try { return JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || "{}").lastSyncAt || null; } catch { return null; } }
  function setLastSyncAt(v) { localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ lastSyncAt: v })); }

  function getSyncApiBase(cfg = getSyncConfig()) {
    return String(cfg.apiUrl || "").trim().replace(/\/+$/, "");
  }

  function syncUrl(path, cfg = getSyncConfig()) {
    const base = getSyncApiBase(cfg);
    if (!base) return path;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    // Reverse proxy on QNAP is often configured as https://host/api -> container root.
    // In that setup /api/sync must become https://host/api/sync, not https://host/api/api/sync.
    if (base.endsWith("/api") && cleanPath.startsWith("/api/")) return `${base}${cleanPath.slice(4)}`;
    return `${base}${cleanPath}`;
  }

  function syncAuthHeaders(cfg, extra = {}) {
    return { ...extra, Authorization: `Bearer ${cfg.token}` };
  }

  function photoIdFromRef(ref) {
    const text = String(ref || "");
    if (!text.startsWith("idb:")) return "";
    return text.slice(4);
  }

  function photoRefFromId(id) {
    return `idb:${String(id || "")}`;
  }

  function safeFilenamePart(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "photo";
  }

  function photoExtension(mimeType = "") {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("heic")) return "heic";
    if (mimeType.includes("heif")) return "heif";
    return "jpg";
  }

  function photoFilename(record, kind, position, blob) {
    const base = safeFilenamePart(record?.nestId || record?.uid || "record");
    return `${base}_${kind}_${position}.${photoExtension(blob?.type || "image/jpeg")}`;
  }

  async function collectPhotoSyncItems(entries) {
    const items = [];
    const seen = new Set();
    const add = async (record, ref, kind, index) => {
      const id = photoIdFromRef(ref);
      if (!id || seen.has(id)) return;
      seen.add(id);
      let blob = null;
      try { blob = await getPhotoBlob(ref); } catch { blob = null; }
      items.push({
        id,
        recordUid: record.uid,
        kind,
        position: index + 1,
        filename: photoFilename(record, kind, index + 1, blob),
        mimeType: blob?.type || "image/jpeg",
        sizeBytes: Number.isFinite(blob?.size) ? blob.size : null,
        updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
        clientId: getClientId(),
        localRef: ref,
      });
    };

    for (const record of entries || []) {
      const nestPhotos = record?.nestMicro?.photos || [];
      const randomPhotos = record?.randomMicro?.photos || [];
      for (let i = 0; i < nestPhotos.length; i += 1) await add(record, nestPhotos[i], "nest", i);
      for (let i = 0; i < randomPhotos.length; i += 1) await add(record, randomPhotos[i], "random", i);
    }
    return items;
  }

  function photoSyncPayload(items) {
    return (items || []).map(({ localRef, ...item }) => item);
  }

  async function uploadMissingPhotos(cfg, photoItems, missingPhotoIds = []) {
    const byId = new Map((photoItems || []).map((item) => [String(item.id), item]));
    let uploaded = 0;
    for (const id of missingPhotoIds || []) {
      const item = byId.get(String(id));
      if (!item) continue;
      const blob = await getPhotoBlob(item.localRef);
      if (!blob) continue;
      const res = await fetch(syncUrl(`/api/photos/${encodeURIComponent(id)}/content`, cfg), {
        method: "PUT",
        headers: syncAuthHeaders(cfg, { "Content-Type": blob.type || item.mimeType || "application/octet-stream" }),
        body: blob,
      });
      if (!res.ok) throw new Error(`Upload zdjęcia ${id}: HTTP ${res.status}`);
      uploaded += 1;
    }
    return { uploaded };
  }

  function collectPhotoIdsFromRecords(entries) {
    const ids = new Set();
    const collect = (refs = []) => refs.forEach((ref) => { const id = photoIdFromRef(ref); if (id) ids.add(id); });
    (entries || []).forEach((record) => {
      collect(record?.nestMicro?.photos || []);
      collect(record?.randomMicro?.photos || []);
    });
    return ids;
  }

  async function hasLocalPhoto(id) {
    try { return !!(await getPhotoBlob(photoRefFromId(id))); } catch { return false; }
  }

  async function downloadMissingPhotos(cfg, serverPhotos = [], entries = []) {
    const wanted = new Map();
    for (const meta of serverPhotos || []) {
      if (!meta?.id || meta.hasData === false) continue;
      wanted.set(String(meta.id), meta);
    }
    collectPhotoIdsFromRecords(entries).forEach((id) => {
      if (!wanted.has(id)) wanted.set(id, { id, mimeType: "image/jpeg" });
    });

    let downloaded = 0;
    let failed = 0;
    for (const [id, meta] of wanted.entries()) {
      if (await hasLocalPhoto(id)) continue;
      try {
        const res = await fetch(syncUrl(`/api/photos/${encodeURIComponent(id)}/content`, cfg), {
          headers: syncAuthHeaders(cfg),
        });
        if (res.status === 404) continue;
        if (!res.ok) { failed += 1; continue; }
        const blob = await res.blob();
        const type = blob.type || meta.mimeType || "image/jpeg";
        const filename = meta.filename || `${id}.${photoExtension(type)}`;
        const stored = typeof File !== "undefined" ? new File([blob], filename, { type }) : blob;
        await putPhotoBlob(id, stored);
        downloaded += 1;
      } catch {
        failed += 1;
      }
    }
    return { downloaded, failed };
  }

  async function testSyncConnection() {
    const cfg = getSyncConfig();
    if (!getSyncApiBase(cfg) || !cfg.token) throw new Error("Brak URL API lub tokenu");
    const res = await fetch(syncUrl("/health", cfg), { headers: syncAuthHeaders(cfg) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function syncNow() {
    const cfg = getSyncConfig();
    if (!getSyncApiBase(cfg) || !cfg.token) throw new Error("Brak konfiguracji synchronizacji");
    const entries = getEntries();
    const workingNests = getWorkingNests();
    const photoItems = await collectPhotoSyncItems(entries);
    const payload = {
      clientId: getClientId(),
      lastSyncAt: getLastSyncAt(),
      records: entries,
      workingNests,
      photos: photoSyncPayload(photoItems),
    };

    const res = await fetch(syncUrl("/api/sync", cfg), {
      method: "POST",
      headers: syncAuthHeaders(cfg, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
    const data = await res.json();

    const uploadStats = await uploadMissingPhotos(cfg, photoItems, data.missingPhotoIds || []);

    const local = new Map(getEntries().map((r)=>[String(r.uid), r]));
    for (const rec of (data.records || [])) {
      const existing = local.get(String(rec.uid));
      if (!existing || new Date(rec.updatedAt || 0) >= new Date(existing.updatedAt || 0)) local.set(String(rec.uid), normalizeEntry(rec));
    }
    const mergedEntries = Array.from(local.values()).map((entry) => ({ ...normalizeEntry(entry), syncStatus: "synced" }));
    setEntries(mergedEntries);

    const localWorking = new Map(getWorkingNests().map((w)=>[String(w.id), normalizeWorkingNest(w)]));
    for (const wn of (data.workingNests || [])) {
      const incoming = normalizeWorkingNest(wn);
      const existing = localWorking.get(String(incoming.id));
      if (!existing || new Date(incoming.updatedAt || 0) >= new Date(existing.updatedAt || 0)) localWorking.set(String(incoming.id), incoming);
    }
    setWorkingNests(Array.from(localWorking.values()));
    if (workingMap) renderWorkingMap();

    const downloadStats = await downloadMissingPhotos(cfg, data.photos || [], mergedEntries);
    setLastSyncAt(data.serverTime || new Date().toISOString());
    return { ...data, photoUploads: uploadStats.uploaded, photoDownloads: downloadStats.downloaded, photoDownloadErrors: downloadStats.failed };
  }
  function markSyncStatus(uid, status) {
    const entries = getEntries();
    const i = entries.findIndex((e)=>String(e.uid)===String(uid));
    if (i >= 0) { entries[i].syncStatus = status; setEntries(entries); }
  }
  function setupSyncUI() {
    const cfg = getSyncConfig();
    setValue("#sync-api-url", cfg.apiUrl || "");
    setValue("#sync-token", cfg.token || "");
    $("#sync-save-config")?.addEventListener("click", () => {
      setSyncConfig({ apiUrl: trim("#sync-api-url"), token: trim("#sync-token") });
      $("#sync-status").textContent = "Zapisano ustawienia synchronizacji.";
    });
    $("#sync-test-connection")?.addEventListener("click", async () => {
      try { await testSyncConnection(); $("#sync-status").textContent = "Połączenie OK."; } catch (e) { $("#sync-status").textContent = `Błąd: ${e.message}`; }
    });
    $("#sync-now")?.addEventListener("click", async () => {
      try {
        const result = await syncNow();
        const errors = result.photoDownloadErrors ? `, błędy pobierania: ${result.photoDownloadErrors}` : "";
        $("#sync-status").textContent = `Synchronizacja zakończona. Zdjęcia wysłane: ${result.photoUploads || 0}, pobrane: ${result.photoDownloads || 0}${errors}.`;
        renderEntries();
      } catch (e) {
        $("#sync-status").textContent = `Błąd synchronizacji: ${e.message}`;
      }
    });
    window.addEventListener("online", () => { syncNow().catch(()=>{}); });
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const value = (selector, fallback = "") => $(selector)?.value ?? fallback;
  const trim = (selector, fallback = "") => String(value(selector, fallback)).trim();
  const setValue = (selector, val = "") => {
    const el = $(selector);
    if (el) el.value = val ?? "";
  };
  const getNumber = (selector, fallback = null) => {
    const raw = value(selector, "");
    if (raw === "" || raw == null) return fallback;
    const n = Number(raw);
    return Number.isNaN(n) ? fallback : n;
  };
  const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
  const SPECIES_CODE_MAP = {
    "charadrius-hiaticula": "SOb",
    "charadrius-dubius": "SRz",
    "vanellus-vanellus": "Cz",
    "tringa-totanus": "Kr",
    "sternula-albifrons": "Rb",
    "chroicocephalus-ridibundus": "Sm",
    unknown: "SN",
  };

  const LABELS = {
    species: {
      "charadrius-hiaticula": "Sieweczka obrożna",
      "charadrius-dubius": "Sieweczka rzeczna",
      "vanellus-vanellus": "Czajka",
      "tringa-totanus": "Krwawodziób",
      "sternula-albifrons": "Rybitwa białoczelna",
      "chroicocephalus-ridibundus": "Śmieszka",
      unknown: "Nieokreślony",
    },
    nestStatus: {
      incubated: "Inkubacja",
      fresh: "Świeże zniesienie",
      unknown: "Nieznane",
    },
    yesNoUnknown: { yes: "Tak", no: "Nie", unknown: "Nie wiem" },
    yesNo: { yes: "Tak", no: "Nie" },
    substrate: {
      sand: "Piasek",
      "fine-gravel": "Drobny żwir",
      "coarse-gravel": "Gruby żwir",
      stones: "Kamienie",
      mixed: "Mieszane",
    },
    slope: { flat: "Płasko", slight: "Lekki spadek", steep: "Wyraźny spadek" },
    microrelief: {
      flat: "Płaskie",
      depression: "Lekkie zagłębienie",
      ridge: "Grzbiet/garb",
      "between-stones": "Między kamieniami",
    },
    rerollReason: {
      none: "Nie dotyczy",
      water: "Woda",
      "dense-vegetation": "Roślinność zwarta",
      "outside-habitat": "Poza dostępnym siedliskiem",
      other: "Inne",
    },
    assessment: {
      unknown: "Nieokreślone",
      field: "Teren / klasy szacunkowe",
      gis: "Ortofotomapa / GIS",
    },
    qcReaction: { weak: "Słaba", moderate: "Umiarkowana", strong: "Silna" },
    qcTime: { lt1: "< 1 min", "1to3": "1–3 min", gt3: "> 3 min" },
  };

  const PERCENT_GROUPS = {
    nest: {
      sumEl: "#nest-sum",
      rowsEl: '[data-group="nest"] .percent-rows',
      items: [
        ["nest-pct-sand", "Piasek"],
        ["nest-pct-fine-gravel", "Drobny żwir"],
        ["nest-pct-coarse", "Gruby żwir / kamienie"],
        ["nest-pct-shells", "Muszle"],
        ["nest-pct-live-veg", "Roślinność żywa"],
        ["nest-pct-dry-veg", "Roślinność sucha"],
        ["nest-pct-organic", "Drewno / szczątki"],
        ["nest-pct-anthro", "Antropogeniczne"],
      ],
    },
    random: {
      sumEl: "#random-sum",
      rowsEl: '[data-group="random"] .percent-rows',
      items: [
        ["random-pct-sand", "Piasek"],
        ["random-pct-fine-gravel", "Drobny żwir"],
        ["random-pct-coarse", "Gruby żwir / kamienie"],
        ["random-pct-shells", "Muszle"],
        ["random-pct-live-veg", "Roślinność żywa"],
        ["random-pct-dry-veg", "Roślinność sucha"],
        ["random-pct-organic", "Drewno / szczątki"],
        ["random-pct-anthro", "Antropogeniczne"],
      ],
    },
    meso: {
      sumEl: "#meso-sum",
      rowsEl: '[data-group="meso"] .percent-rows',
      items: [
        ["pct-sand", "Piasek"],
        ["pct-gravel", "Żwir / kamienie"],
        ["pct-vegetation", "Roślinność"],
        ["pct-water", "Woda / podmokłość"],
        ["pct-other", "Inne"],
      ],
    },
  };

  let currentStep = 1;
  let editingUid = null;
  let readonlyUid = null;
  let editReturnToReadonly = false;
  let recordsMap = null;
  let mapMarkersLayer = null;
  let mapFocusUid = null;
  const mapUserState = {
    records: { userLocationMarker: null, userAccuracyCircle: null, userHeadingMarker: null, hasAutoCenteredOnUser: false },
    working: { userLocationMarker: null, userAccuracyCircle: null, userHeadingMarker: null, hasAutoCenteredOnUser: false }
  };
  let latestUserLatLng = null;
  let latestUserAccuracy = null;
  let userLocationWatchId = null;
  let mapHeadingEnabled = false;
  let latestMapHeadingDeg = null;
  let recordSpeciesLabelsVisible = true;
  let workingMap = null;
  let workingLayer = null;
  let recordsGridLayer = null;
  let workingGridLayer = null;
  let gridGeoJsonData = null;
  let gridGeoJsonPromise = null;
  let workingViewMode = "map";
  let workingFocusId = null;
  let editingWorkingId = null;
  let workingNotesVisible = true;
  let currentNestPhotos = [];
  let currentRandomPhotos = [];
  const photoUrlCache = new Map();

  async function loadGridGeoJson() {
    if (gridGeoJsonData) return gridGeoJsonData;
    if (!gridGeoJsonPromise) {
      gridGeoJsonPromise = fetch("data/grid_vanvan.geojson", { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`Nie udało się załadować gridu: ${response.status}`);
          return response.json();
        })
        .then((json) => {
          gridGeoJsonData = json;
          return json;
        })
        .catch((error) => {
          console.error(error);
          gridGeoJsonPromise = null;
          return null;
        });
    }
    return gridGeoJsonPromise;
  }

  async function addGridToMap(map, target) {
    if (!map || typeof L === "undefined") return null;
    const data = await loadGridGeoJson();
    if (!data) return null;
    const gridLayer = L.geoJSON(data, {
      pane: "overlayPane",
      interactive: false,
      style: {
        color: "rgba(15, 23, 42, 0.7)",
        weight: 1,
        fillColor: "rgba(255, 255, 255, 0.06)",
        fillOpacity: 0.1
      },
      onEachFeature(feature, layer) {
        const gridId = feature?.properties?.id;
        if (gridId == null) return;
        layer.bindTooltip(String(gridId), {
          permanent: true,
          direction: "center",
          className: "grid-label"
        });
      }
    });
    gridLayer.addTo(map);
    if (target === "records") recordsGridLayer = gridLayer;
    if (target === "working") workingGridLayer = gridLayer;
    return gridLayer;
  }

  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(lon, lat, polygonCoords) {
    if (!polygonCoords?.length || !pointInRing(lon, lat, polygonCoords[0])) return false;
    for (let i = 1; i < polygonCoords.length; i++) if (pointInRing(lon, lat, polygonCoords[i])) return false;
    return true;
  }

  async function findGridIdForPoint(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
    const data = await loadGridGeoJson();
    const features = data?.features || [];
    for (const feature of features) {
      const geometry = feature?.geometry;
      if (!geometry) continue;
      const coords = geometry.coordinates;
      if (geometry.type === "Polygon" && pointInPolygon(lon, lat, coords)) return feature?.properties?.id ?? "";
      if (geometry.type === "MultiPolygon" && (coords || []).some((polygon) => pointInPolygon(lon, lat, polygon))) return feature?.properties?.id ?? "";
    }
    return "";
  }

  async function autoFillSectorFromGrid() {
    const sectorEl = $("#sector");
    if (!sectorEl || sectorEl.dataset.manual === "1") return;
    const lat = getNumber("#lat", null);
    const lon = getNumber("#lon", null);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      if (sectorEl.dataset.auto === "1") {
        sectorEl.value = "";
        delete sectorEl.dataset.auto;
      }
      return;
    }
    const gridId = await findGridIdForPoint(lat, lon);
    if (gridId !== "") {
      const val = String(gridId);
      if (!sectorEl.value || sectorEl.dataset.auto === "1") {
        sectorEl.value = val;
        sectorEl.dataset.auto = "1";
      }
    } else if (sectorEl.dataset.auto === "1") {
      sectorEl.value = "";
      delete sectorEl.dataset.auto;
    }
  }

  function openPhotoDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(PHOTO_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function savePhotoFile(file) {
    const db = await openPhotoDb();
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      tx.objectStore(PHOTO_STORE).put(file, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return `idb:${id}`;
  }

  async function getPhotoBlob(ref) {
    if (!ref || !String(ref).startsWith("idb:")) return null;
    const id = String(ref).slice(4);
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const req = tx.objectStore(PHOTO_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function putPhotoBlob(id, blob) {
    if (!id || !blob) return false;
    const db = await openPhotoDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      tx.objectStore(PHOTO_STORE).put(blob, String(id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    const ref = photoRefFromId(id);
    if (photoUrlCache.has(ref)) {
      URL.revokeObjectURL(photoUrlCache.get(ref));
      photoUrlCache.delete(ref);
    }
    return true;
  }

  async function resolvePhotoSrc(ref) {
    if (!ref) return "";
    if (String(ref).startsWith("data:")) return ref;
    if (!String(ref).startsWith("idb:")) return "";
    if (photoUrlCache.has(ref)) return photoUrlCache.get(ref);
    const blob = await getPhotoBlob(ref);
    if (!blob) return "";
    const url = URL.createObjectURL(blob);
    photoUrlCache.set(ref, url);
    return url;
  }

  async function saveSelectedFiles(inputSelector) {
    const input = $(inputSelector);
    const selected = input?.files ? Array.from(input.files).slice(0, 8) : [];
    const refs = [];
    for (const file of selected) refs.push(await savePhotoFile(file));
    return refs;
  }

  function migrateLegacyEntries() {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return;
    try {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.map(normalizeEntry)));
    } catch {
      // Ignore broken legacy data.
    }
  }

  function normalizeEntry(entry) {
    const uid = entry.uid || `${entry.nestId || "rec"}-${entry.createdAt || Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nestCoverage = entry.nestMicro?.coverage || {};
    const randomCoverage = entry.randomMicro?.coverage || {};
    const meso = entry.meso || {};
    return {
      ...entry,
      uid,
      protocolVersion: entry.protocolVersion || PROTOCOL_VERSION,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
      season: entry.season || "",
      observer: entry.observer || "",
      docPhotoDone: entry.docPhotoDone || "unknown",
      nestOneMPhotoDone: entry.nestOneMPhotoDone || "unknown",
      randomPointDone: entry.randomPointDone || "unknown",
      nestMicro: {
        ...entry.nestMicro,
        photos: entry.nestMicro?.photos || [],
        coverage: {
          pctSand: Number(nestCoverage.pctSand || 0),
          pctFineGravel: Number(nestCoverage.pctFineGravel || 0),
          pctCoarse: Number(nestCoverage.pctCoarse || 0),
          pctShells: Number(nestCoverage.pctShells || 0),
          pctLiveVeg: Number(nestCoverage.pctLiveVeg || 0),
          pctDryVeg: Number(nestCoverage.pctDryVeg || 0),
          pctOrganic: Number(nestCoverage.pctOrganic || 0),
          pctAnthro: Number(nestCoverage.pctAnthro || 0),
        },
        distPlantCm: entry.nestMicro?.distPlantCm ?? entry.nestMicro?.distPlantM ?? null,
        distObjectCm: entry.nestMicro?.distObjectCm ?? entry.nestMicro?.distObjectM ?? null,
        microrelief: entry.nestMicro?.microrelief || "flat",
      },
      randomMicro: {
        ...entry.randomMicro,
        photos: entry.randomMicro?.photos || [],
        wasRerolled: entry.randomMicro?.wasRerolled || "no",
        rerollReason: entry.randomMicro?.rerollReason || "none",
        coverage: {
          pctSand: Number(randomCoverage.pctSand || 0),
          pctFineGravel: Number(randomCoverage.pctFineGravel || 0),
          pctCoarse: Number(randomCoverage.pctCoarse || 0),
          pctShells: Number(randomCoverage.pctShells || 0),
          pctLiveVeg: Number(randomCoverage.pctLiveVeg || 0),
          pctDryVeg: Number(randomCoverage.pctDryVeg || 0),
          pctOrganic: Number(randomCoverage.pctOrganic || 0),
          pctAnthro: Number(randomCoverage.pctAnthro || 0),
        },
        distPlantCm: entry.randomMicro?.distPlantCm ?? entry.randomMicro?.distPlantM ?? null,
        distObjectCm: entry.randomMicro?.distObjectCm ?? entry.randomMicro?.distObjectM ?? null,
        microrelief: entry.randomMicro?.microrelief || "flat",
      },
      meso: {
        ...meso,
        pctSand: Number(meso.pctSand || 0),
        pctGravel: Number(meso.pctGravel || 0),
        pctVegetation: Number(meso.pctVegetation || 0),
        pctWater: Number(meso.pctWater || 0),
        pctOther: Number(meso.pctOther || 0),
        assessmentMethod: meso.assessmentMethod || "unknown",
        spatialNotes: meso.spatialNotes || "",
      },
      qualityControl: entry.qualityControl || {},
      moduleNotes: entry.moduleNotes || {},
    };
  }

  function getEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeEntry) : [];
    } catch {
      return [];
    }
  }

  function setEntries(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.map(normalizeEntry)));
      return true;
    } catch (error) {
      alert("Nie udało się zapisać danych. Pamięć telefonu może być pełna.");
      console.error(error);
      return false;
    }
  }

  function setDefaultDateTime() {
    const now = new Date();
    if (!value("#obs-date")) setValue("#obs-date", now.toISOString().slice(0, 10));
    if (!value("#obs-time")) setValue("#obs-time", now.toTimeString().slice(0, 5));
    if (!value("#season")) setValue("#season", String(now.getFullYear()));
  }

  function formatNestIdDateTime(date = new Date()) {
    const y = String(date.getFullYear());
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}${m}${d}-${hh}${mm}`;
  }

  function speciesCode(speciesValue) {
    const existing = SPECIES_CODE_MAP[speciesValue];
    if (existing) return existing;
    const normalized = String(speciesValue || "").trim().toLowerCase().replace(/^custom:/, "");
    const fallback = normalized.split("-").filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase() || "").join("");
    return fallback || "SX";
  }

  function parseNestId(text) {
    const value = String(text || "").trim();
    const match = value.match(/^([^-]+)-(\d{8})-(\d{4})-(.*)$/);
    if (!match) return null;
    return { code: match[1], date: match[2], time: match[3], suffix: match[4] || "" };
  }

  function buildNestId(speciesValue, suffix = "", now = new Date()) {
    return `${speciesCode(speciesValue)}-${formatNestIdDateTime(now)}-${suffix}`;
  }

  function setupNestIdAutofill() {
    const nestIdInput = $("#nest-id");
    const speciesInput = $("#species");
    const generateBtn = $("#nest-id-generate");
    if (!nestIdInput || !speciesInput) return;

    const refreshFromSpecies = () => {
      const current = parseNestId(nestIdInput.value);
      if (current) {
        nestIdInput.value = buildNestId(speciesInput.value, current.suffix);
        return;
      }
      if (!String(nestIdInput.value || "").trim()) nestIdInput.value = buildNestId(speciesInput.value);
    };

    speciesInput.addEventListener("change", refreshFromSpecies);
    document.addEventListener("click", (event) => {
      if (event.target.closest('.tile-group[data-target="species"] .tile')) {
        requestAnimationFrame(refreshFromSpecies);
      }
    });
    if (generateBtn) generateBtn.addEventListener("click", () => {
      const current = parseNestId(nestIdInput.value);
      nestIdInput.value = buildNestId(speciesInput.value, current ? current.suffix : "");
    });
  }

  
  const slugify = (txt) => String(txt || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  function readList(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } }
  function saveList(key, values) { localStorage.setItem(key, JSON.stringify(Array.from(new Set(values.filter(Boolean))))); }

  function setupSmartLists() {
    const bind = (inputSel, listSel, key) => {
      const input = $(inputSel); const list = $(listSel); if (!input || !list) return;
      const render = () => { list.innerHTML = readList(key).map((v) => `<option value="${escapeHtml(v)}"></option>`).join(""); };
      input.addEventListener("change", () => { const v = String(input.value || "").trim(); if (!v) return; const arr = readList(key); arr.push(v); saveList(key, arr); render(); });
      render();
    };
    bind("#observer", "#observer-list", OBSERVERS_KEY);
    bind("#sector", "#sector-list", SECTORS_KEY);
  }

  function setupCustomSpecies() {
    const hidden = $("#species"); const customInput = $("#species-custom-input"); const list = $("#species-custom-list");
    if (!hidden || !customInput || !list) return;
    const render = () => { list.innerHTML = readList(CUSTOM_SPECIES_KEY).map((v) => `<option value="${escapeHtml(v)}"></option>`).join(""); };
    document.addEventListener("click", (event) => { if (event.target.closest('.tile-group[data-target="species"] .tile[data-value="custom:other"]')) { hidden.value = "custom:"; customInput.hidden = false; customInput.focus(); } });
    customInput.addEventListener("change", () => {
      const raw = String(customInput.value || "").trim(); if (!raw) return;
      hidden.value = `custom:${slugify(raw) || "inn"}`;
      const arr = readList(CUSTOM_SPECIES_KEY); arr.push(raw); saveList(CUSTOM_SPECIES_KEY, arr); render();
    });
    render();
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = (n) => (n * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function autoFillNearestDistances() {
    const lat = getNumber("#lat", null), lon = getNumber("#lon", null);
    if (lat == null || lon == null) return;
    const entries = getEntries();
    const nearest = (sp) => entries
      .filter((e) => e.species === sp && e.uid !== editingUid && hasValidCoords(e.lat, e.lon))
      .reduce((best, e) => Math.min(best, haversineM(lat, lon, Number(e.lat), Number(e.lon))), Infinity);
    const hiEl = $("#dist-nearest-hiaticula"), duEl = $("#dist-nearest-dubius");
    if (hiEl && !hiEl.dataset.manual) { const d = nearest("charadrius-hiaticula"); hiEl.value = Number.isFinite(d) ? d.toFixed(1) : ""; }
    if (duEl && !duEl.dataset.manual) { const d = nearest("charadrius-dubius"); duEl.value = Number.isFinite(d) ? d.toFixed(1) : ""; }
  }

  function showView(name) {
    $("#home-screen").hidden = name !== "home";
    $("#records-screen").hidden = name !== "records";
    $("#record-readonly-screen").hidden = name !== "readonly";
    $("#map-screen").hidden = name !== "map";
    $("#working-map-screen").hidden = name !== "working-map";
    $("#form-screen").hidden = name !== "form";
    if (name === "map") setTimeout(() => renderRecordsMap(mapFocusUid), 0);
    if (name === "working-map") setTimeout(() => renderWorkingMap(), 0);
    updateCounts();
  }

  function showStep(step) {
    currentStep = clamp(Number(step) || 1, 1, 8);
    $$(".step").forEach((el) => {
      el.hidden = Number(el.dataset.step) !== currentStep;
    });
    const titles = [
      "Identyfikacja",
      "GPS i zdjęcia gniazda",
      "Mikrohabitat gniazda",
      "Punkt losowy 10 m",
      "Mikrohabitat punktu losowego",
      "Mezohabitat",
      "Kontrola jakości",
      "Podsumowanie i zapis",
    ];
    $("#step-title").textContent = `Krok ${currentStep} z 8 — ${titles[currentStep - 1]}`;
    $("#step-progress").style.width = `${(currentStep / 8) * 100}%`;
    $("#step-back").disabled = currentStep === 1;
    $("#step-next").hidden = currentStep === 8;
    $("#save-final").hidden = currentStep !== 8;
    if (currentStep === 8) renderValidationAndPreview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setupTiles() {
    $$(".tile-group").forEach((group) => {
      group.addEventListener("click", (event) => {
        const tile = event.target.closest(".tile");
        if (!tile) return;
        const target = $(`#${group.dataset.target}`);
        if (!target) return;
        target.value = tile.dataset.value;
        syncTilesFromInputs();
      });
    });
    syncTilesFromInputs();
  }

  function syncTilesFromInputs() {
    $$(".tile-group").forEach((group) => {
      const target = $(`#${group.dataset.target}`);
      if (!target) return;
      $$(".tile", group).forEach((tile) => tile.classList.toggle("selected", tile.dataset.value === target.value));
    });
  }

  function createPercentRow(id, label) {
    const row = document.createElement("label");
    row.className = "pct-label";
    row.innerHTML = `
      <span>${label}</span>
      <div class="pct-row">
        <button type="button" class="pct-btn" data-id="${id}" data-delta="-5">−5</button>
        <input id="${id}" type="number" min="0" max="100" step="1" inputmode="numeric" value="0" />
        <button type="button" class="pct-btn" data-id="${id}" data-delta="5">+5</button>
      </div>
    `;
    return row;
  }

  function setupPercentGroups() {
    Object.values(PERCENT_GROUPS).forEach((group) => {
      const rows = $(group.rowsEl);
      if (!rows) return;
      rows.innerHTML = "";
      group.items.forEach(([id, label]) => rows.appendChild(createPercentRow(id, label)));
    });

    document.addEventListener("click", (event) => {
      const btn = event.target.closest(".pct-btn");
      if (!btn) return;
      const input = $(`#${btn.dataset.id}`);
      if (!input) return;
      const group = findPercentGroup(btn.dataset.id);
      const current = getNumber(`#${btn.dataset.id}`, 0) || 0;
      const delta = Number(btn.dataset.delta || 0);
      let next = clamp(current + delta);
      if (delta > 0 && group) {
        const remaining = 100 - groupSum(group) + current;
        next = Math.min(next, Math.max(0, remaining));
      }
      input.value = String(next);
      updatePercentSummaries();
    });

    document.addEventListener("input", (event) => {
      if (event.target.matches(".percent-rows input[type='number']")) {
        const n = clamp(Number(event.target.value) || 0);
        if (String(event.target.value) !== String(n)) event.target.value = String(n);
        updatePercentSummaries();
      }
    });

    $$(".pct-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = PERCENT_GROUPS[btn.dataset.group];
        if (!group) return;
        if (btn.dataset.action === "clear") {
          group.items.forEach(([id]) => setValue(`#${id}`, "0"));
        } else if (btn.dataset.action === "fill") {
          const target = btn.dataset.target;
          const current = getNumber(`#${target}`, 0) || 0;
          setValue(`#${target}`, String(Math.min(100, current + Math.max(0, 100 - groupSum(group)))));
        }
        updatePercentSummaries();
      });
    });

    updatePercentSummaries();
  }

  function findPercentGroup(inputId) {
    return Object.values(PERCENT_GROUPS).find((group) => group.items.some(([id]) => id === inputId)) || null;
  }

  function groupSum(group) {
    return group.items.reduce((sum, [id]) => sum + (getNumber(`#${id}`, 0) || 0), 0);
  }

  function updatePercentSummaries() {
    Object.entries(PERCENT_GROUPS).forEach(([, group]) => {
      const el = $(group.sumEl);
      if (!el) return;
      const sum = groupSum(group);
      el.classList.toggle("ok", sum >= 95 && sum <= 105);
      el.classList.toggle("bad", sum < 95 || sum > 105);
      if (sum >= 95 && sum <= 105) el.textContent = `Suma: ${sum}% — OK`;
      else if (sum < 95) el.textContent = `Suma: ${sum}% — pozostało ${100 - sum}%`;
      else el.textContent = `Suma: ${sum}% — za dużo o ${sum - 100}%`;
    });
  }

  function readCoverage(prefix) {
    return {
      pctSand: getNumber(`#${prefix}-pct-sand`, 0) || 0,
      pctFineGravel: getNumber(`#${prefix}-pct-fine-gravel`, 0) || 0,
      pctCoarse: getNumber(`#${prefix}-pct-coarse`, 0) || 0,
      pctShells: getNumber(`#${prefix}-pct-shells`, 0) || 0,
      pctLiveVeg: getNumber(`#${prefix}-pct-live-veg`, 0) || 0,
      pctDryVeg: getNumber(`#${prefix}-pct-dry-veg`, 0) || 0,
      pctOrganic: getNumber(`#${prefix}-pct-organic`, 0) || 0,
      pctAnthro: getNumber(`#${prefix}-pct-anthro`, 0) || 0,
    };
  }

  function setCoverage(prefix, coverage = {}) {
    setValue(`#${prefix}-pct-sand`, coverage.pctSand ?? 0);
    setValue(`#${prefix}-pct-fine-gravel`, coverage.pctFineGravel ?? 0);
    setValue(`#${prefix}-pct-coarse`, coverage.pctCoarse ?? 0);
    setValue(`#${prefix}-pct-shells`, coverage.pctShells ?? 0);
    setValue(`#${prefix}-pct-live-veg`, coverage.pctLiveVeg ?? 0);
    setValue(`#${prefix}-pct-dry-veg`, coverage.pctDryVeg ?? 0);
    setValue(`#${prefix}-pct-organic`, coverage.pctOrganic ?? 0);
    setValue(`#${prefix}-pct-anthro`, coverage.pctAnthro ?? 0);
  }

  function coverageSum(coverage) {
    return Object.values(coverage || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  }

  async function buildRecord(options = {}) {
    const persistPhotos = options.persistPhotos === true;
    const entries = getEntries();
    const existing = editingUid ? entries.find((entry) => String(entry.uid) === String(editingUid)) : null;
    const newNestPhotos = persistPhotos ? await saveSelectedFiles("#nest-photos") : [];
    const newRandomPhotos = persistPhotos ? await saveSelectedFiles("#random-photos") : [];

    const uid = editingUid || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const now = new Date().toISOString();

    return {
      uid,
      protocolVersion: PROTOCOL_VERSION,
      createdAt: existing?.createdAt || now,
      updatedAt: now,

      nestId: trim("#nest-id"),
      season: trim("#season"),
      obsDate: value("#obs-date"),
      obsTime: value("#obs-time"),
      observer: trim("#observer"),
      species: value("#species", "unknown"),
      sector: trim("#sector"),
      lat: getNumber("#lat", null),
      lon: getNumber("#lon", null),
      gpsAccuracyM: getNumber("#gps-accuracy", null),
      nestStatus: value("#nest-status", "unknown"),
      eggCount: getNumber("#egg-count", null),
      possibleRenest: value("#possible-renest", "unknown"),
      docPhotoDone: value("#doc-photo-done", "unknown"),
      nestOneMPhotoDone: value("#nest-one-m-photo-done", "unknown"),
      randomPointDone: value("#random-point-done", "unknown"),

      nestMicro: {
        photos: [...(currentNestPhotos || []), ...newNestPhotos],
        substrate: value("#nest-substrate", "sand"),
        coverage: readCoverage("nest"),
        distPlantCm: getNumber("#nest-dist-plant", null),
        heightPlantCm: getNumber("#nest-height-plant", null),
        distObjectCm: getNumber("#nest-dist-object", null),
        heightObjectCm: getNumber("#nest-height-object", null),
        slope: value("#nest-slope", "flat"),
        microrelief: value("#nest-microrelief", "flat"),
      },

      randomMicro: {
        azimuthDeg: getNumber("#random-azimuth", null),
        wasRerolled: value("#random-rerolled", "no"),
        rerollReason: value("#random-reroll-reason", "none"),
        lat: getNumber("#random-lat", null),
        lon: getNumber("#random-lon", null),
        gpsAccuracyM: getNumber("#random-gps-accuracy", null),
        photos: [...(currentRandomPhotos || []), ...newRandomPhotos],
        substrate: value("#random-substrate", "sand"),
        coverage: readCoverage("random"),
        distPlantCm: getNumber("#random-dist-plant", null),
        heightPlantCm: getNumber("#random-height-plant", null),
        distObjectCm: getNumber("#random-dist-object", null),
        heightObjectCm: getNumber("#random-height-object", null),
        slope: value("#random-slope", "flat"),
        microrelief: value("#random-microrelief", "flat"),
      },

      meso: {
        pctSand: getNumber("#pct-sand", 0) || 0,
        pctGravel: getNumber("#pct-gravel", 0) || 0,
        pctVegetation: getNumber("#pct-vegetation", 0) || 0,
        pctWater: getNumber("#pct-water", 0) || 0,
        pctOther: getNumber("#pct-other", 0) || 0,
        assessmentMethod: value("#meso-assessment-method", "unknown"),
        distWaterM: getNumber("#dist-water", null),
        distVegEdgeM: getNumber("#dist-veg-edge", null),
        distVerticalStructureM: getNumber("#dist-vertical-structure", null),
        distNearestHiaticulaM: getNumber("#dist-nearest-hiaticula", null),
        distNearestDubiusM: getNumber("#dist-nearest-dubius", null),
        bigObjects: value("#meso-big-objects", "unknown"),
        distFineGravelPatchM: getNumber("#dist-fine-gravel-patch", null),
        distCoarseGravelPatchM: getNumber("#dist-coarse-gravel-patch", null),
        spatialNotes: trim("#meso-spatial-notes"),
      },

      qualityControl: {
        birdReaction: value("#qc-bird-reaction", "weak"),
        timeAtNest: value("#qc-time-at-nest", "lt1"),
        aborted: value("#qc-aborted", "no"),
        tracksVisible: value("#qc-tracks", "no"),
        tracksNotes: trim("#qc-tracks-notes"),
      },

      moduleNotes: {
        identification: trim("#notes-identification"),
        nestMicro: trim("#notes-nest-micro"),
        randomMicro: trim("#notes-random-micro"),
        meso: trim("#notes-meso"),
      },

      notes: trim("#notes"),
      validationOverride: !!$("#validation-override-summary")?.checked,
    };
  }

  function validateRecord(record) {
    const errors = [];
    const warnings = [];
    const addErr = (step, field, message) => errors.push({ step, field, message });
    const addWarn = (step, field, message) => warnings.push({ step, field, message });

    if (!record.nestId) addErr(1, "#nest-id", "Brakuje ID gniazda.");
    if (!record.obsDate) addErr(1, "#obs-date", "Brakuje daty.");
    if (!record.obsTime) addErr(1, "#obs-time", "Brakuje godziny.");
    if (!record.sector) addErr(1, "#sector", "Brakuje sektora / części wyspy.");
    if (!record.observer) addWarn(1, "#observer", "Brakuje obserwatora.");
    if (record.species === "unknown") addErr(1, "#species", "Brak gatunku.");
    if (record.eggCount == null || Number.isNaN(record.eggCount)) addErr(1, "#egg-count", "Brak liczby jaj.");

    if (record.lat == null || record.lon == null) addErr(2, "#lat", "Brak GPS gniazda.");
    if (record.randomMicro.lat == null || record.randomMicro.lon == null) addErr(4, "#random-lat", "Brak GPS punktu losowego / kontroli.");
    if (record.randomMicro.azimuthDeg == null) addWarn(4, "#random-azimuth", "Brakuje azymutu punktu losowego.");

    const infos = [];
    const quality = [];
    const nestSum = coverageSum(record.nestMicro.coverage);
    const randomSum = coverageSum(record.randomMicro.coverage);
    const mesoSum = record.meso.pctSand + record.meso.pctGravel + record.meso.pctVegetation + record.meso.pctWater + record.meso.pctOther;
    if (nestSum !== 100) quality.push({ step: 3, field: "#nest-pct-sand", message: `Mikrohabitat gniazda: suma pokrycia wynosi ${nestSum}%, powinna wynosić 100%.` });
    if (mesoSum !== 100) quality.push({ step: 6, field: "#pct-sand", message: `Mezohabitat: suma pokrycia wynosi ${mesoSum}%, powinna wynosić 100%.` });
    if (randomSum !== 100) quality.push({ step: 5, field: "#random-pct-sand", message: `Punkt losowy/kontrola: suma pokrycia wynosi ${randomSum}%, powinna wynosić 100%.` });
    if (!record.docPhotoDone || record.docPhotoDone === "unknown") quality.push({ step: 7, field: "#doc-photo-done", message: "Brak informacji o zdjęciu nad kontrolą." });
    if (!(record.nestMicro?.photos?.length)) addErr(2, "#nest-photos", "Brak zdjęcia gniazda.");
    if (!(record.randomMicro?.photos?.length)) addErr(4, "#random-photos", "Brak zdjęcia punktu losowego / kontroli.");
    if (!record.nestOneMPhotoDone || record.nestOneMPhotoDone === "unknown") quality.push({ step: 7, field: "#nest-one-m-photo-done", message: "Brak informacji o zdjęciu 1 m²." });
    if (!record.randomPointDone || record.randomPointDone === "unknown") addWarn(7, "#random-point-done", "Brak informacji o punkcie losowym.");
    const infoFields = new Set();
    const addInfo = (step, field, message) => { if (infoFields.has(field)) return; infoFields.add(field); infos.push({ step, field, message }); };
    const emptyNum = (v) => v == null || Number.isNaN(v);
    if (emptyNum(record.nestMicro?.distPlantCm)) addInfo(3, "#nest-dist-plant", "Puste: odległość do najbliższej rośliny przy gnieździe.");
    if (emptyNum(record.nestMicro?.distObjectCm)) addInfo(3, "#nest-dist-object", "Puste: odległość do najbliższego obiektu przy gnieździe.");
    if (emptyNum(record.randomMicro?.distPlantCm)) addInfo(5, "#random-dist-plant", "Puste: odległość do najbliższej rośliny przy kontroli/punkcie losowym.");
    if (emptyNum(record.randomMicro?.distObjectCm)) addInfo(5, "#random-dist-object", "Puste: odległość do najbliższego obiektu przy kontroli/punkcie losowym.");
    if (emptyNum(record.meso?.distWaterM)) addInfo(6, "#dist-water", "Puste: odległość do wody.");
    if (emptyNum(record.meso?.distVegEdgeM)) addInfo(6, "#dist-veg-edge", "Puste: odległość do krawędzi zwartej roślinności.");
    if (emptyNum(record.meso?.distVerticalStructureM)) addInfo(6, "#dist-vertical-structure", "Puste: odległość do najbliższego wyższego obiektu.");
    if (emptyNum(record.meso?.distFineGravelPatchM)) addInfo(6, "#dist-fine-gravel-patch", "Puste: odległość do płatu drobnego żwiru.");
    if (emptyNum(record.meso?.distCoarseGravelPatchM)) addInfo(6, "#dist-coarse-gravel-patch", "Puste: odległość do płatu grubszego żwiru/kamieni.");
    if (emptyNum(record.meso?.distNearestHiaticulaM)) addInfo(6, "#dist-nearest-hiaticula", "Puste: odległość do najbliższego gniazda sieweczki obrożnej.");
    if (emptyNum(record.meso?.distNearestDubiusM)) addInfo(6, "#dist-nearest-dubius", "Puste: odległość do najbliższego gniazda sieweczki rzecznej.");
    if (emptyNum(record.nestMicro?.heightPlantCm)) addInfo(3, "#nest-height-plant", "Puste: wysokość najbliższej rośliny przy gnieździe.");
    if (emptyNum(record.nestMicro?.heightObjectCm)) addInfo(3, "#nest-height-object", "Puste: wysokość najbliższego obiektu przy gnieździe.");
    if (emptyNum(record.randomMicro?.heightPlantCm)) addInfo(5, "#random-height-plant", "Puste: wysokość najbliższej rośliny przy kontroli/punkcie losowym.");
    if (emptyNum(record.randomMicro?.heightObjectCm)) addInfo(5, "#random-height-object", "Puste: wysokość najbliższego obiektu przy kontroli/punkcie losowym.");
    if (!record.nestMicro?.slope) addInfo(3, "#nest-slope", "Puste: nachylenie przy gnieździe.");
    if (!record.randomMicro?.slope) addInfo(5, "#random-slope", "Puste: nachylenie przy kontroli/punkcie losowym.");
    if (!record.nestMicro?.microrelief) addInfo(3, "#nest-microrelief", "Puste: mikrorzeźba przy gnieździe.");
    if (!record.randomMicro?.microrelief) addInfo(5, "#random-microrelief", "Puste: mikrorzeźba przy kontroli/punkcie losowym.");
    if (!record.meso?.bigObjects || record.meso?.bigObjects === "unknown") addInfo(6, "#meso-big-objects", "Puste: duże obiekty w 15 m.");
    if (!record.meso?.assessmentMethod || record.meso?.assessmentMethod === "unknown") addInfo(6, "#meso-assessment-method", "Puste: sposób oceny buforu 15 m.");
    if (!String(record.meso?.spatialNotes || "").trim()) addInfo(6, "#meso-spatial-notes", "Puste: uwagi przestrzenne.");
    if (!String(record.moduleNotes?.meso || "").trim()) addInfo(6, "#notes-meso", "Puste: notatki mezohabitatowe.");

    const technical = new Set(["species","egg-count","nest-status","possible-renest","doc-photo-done","nest-one-m-photo-done","random-point-done","nest-substrate","random-rerolled","random-reroll-reason","random-substrate","qc-bird-reaction","qc-time-at-nest","qc-aborted","qc-tracks","gps-accuracy","random-gps-accuracy","validation-override-summary"]);
    $$("input,select,textarea", $("#entry-form")).forEach((el) => {
      if (!el.id || el.type === "hidden" || el.type === "file" || technical.has(el.id)) return;
      if (el.closest("[hidden]")) return;
      if (String(el.value || "").trim()) return;
      const step = Number(el.closest(".step")?.dataset.step || 1);
      infos.push({ step, field: `#${el.id}`, message: `Pole puste: ${el.id}` });
    });
    return { errors, warnings, infos, quality };
  }

  function renderValidationAndPreview() {
    buildRecord({ persistPhotos: false }).then((record) => {
      const { errors, warnings, infos, quality } = validateRecord(record);
      const list = $("#validation-list");
      if (list) {
        const renderItems = (items, cls) => items.map((item) => `
          <div class="${cls}">
            ${item.message}
            <button type="button" data-step="${item.step}" data-field="${item.field}">Przejdź</button>
          </div>
        `).join("");
        list.innerHTML = `
          ${errors.length ? `<h3>Braki obowiązkowe — blokują zapis</h3>${renderItems(errors, "validation-error")}` : `<p class="ok-text">Brak braków blokujących zapis.</p>`}
          ${warnings.length ? `<h3>Braki zalecane — sprawdź przed zakończeniem</h3>${renderItems(warnings, "validation-warning")}` : `<p class="ok-text">Brak ostrzeżeń jakościowych.</p>`}
          <h3>Pola puste / nieuzupełnione — informacyjnie</h3>${infos.length ? renderItems(infos, "validation-warning") : `<p class="muted">Brak.</p>`}<h3>Ostrzeżenia jakościowe</h3>${quality.length ? renderItems(quality, "validation-warning") : `<p class="ok-text">Brak ostrzeżeń jakościowych.</p>`}
        `;
        $$("button", list).forEach((btn) => btn.addEventListener("click", () => {
          showStep(Number(btn.dataset.step));
          setTimeout(() => $(btn.dataset.field)?.focus(), 100);
        }));
      }

      const preview = $("#record-preview");
      if (preview) {
        preview.innerHTML = `
          <h3>Podgląd rekordu</h3>
          <p><strong>${escapeHtml(record.nestId || "(bez ID)")}</strong> • ${LABELS.species[record.species] || record.species} • ${escapeHtml(record.sector || "")}</p>
          <p>${escapeHtml(record.obsDate || "")} ${escapeHtml(record.obsTime || "")} • jaja: ${record.eggCount ?? "brak"} • GPS: ${record.lat ?? "brak"}, ${record.lon ?? "brak"}</p>
        `;
      }
    });
  }

  async function saveFinalRecord() {
    const record = await buildRecord({ persistPhotos: true });
    const { errors } = validateRecord(record);
    if (errors.length && !$("#validation-override-summary")?.checked) {
      renderValidationAndPreview();
      showStep(8);
      return;
    }
    const entries = getEntries();
    const idx = entries.findIndex((entry) => String(entry.uid) === String(record.uid));
    if (idx >= 0) entries[idx] = record;
    else entries.unshift(record);
    record.syncStatus = navigator.onLine ? "pending" : "pending";
    if (!setEntries(entries)) return;

    editingUid = null;
    currentNestPhotos = [];
    currentRandomPhotos = [];
    localStorage.removeItem(DRAFT_KEY);
    renderEntries();
    resetForm();
    showView("records");
    alert("Rekord zapisany.");
    if (navigator.onLine) { syncNow().catch(() => { markSyncStatus(record.uid, "error"); }); }
  }

  function saveDraft() {
    const data = {};
    new FormData($("#entry-form")).forEach((v, k) => { data[k] = v; });
    // FormData does not include hidden fields without name attributes, so save by id as well.
    $$("input, select, textarea").forEach((el) => {
      if (el.id && el.type !== "file") data[el.id] = el.value;
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data }));
    alert("Szkic zapisany lokalnie.");
  }

  function resetForm() {
    $("#entry-form").reset();
    editingUid = null;
    currentNestPhotos = [];
    currentRandomPhotos = [];
    setDefaultDateTime();

    const defaults = {
      "#species": "unknown",
      "#egg-count": "",
      "#nest-status": "unknown",
      "#possible-renest": "unknown",
      "#doc-photo-done": "unknown",
      "#nest-one-m-photo-done": "unknown",
      "#random-point-done": "unknown",
      "#nest-substrate": "sand",
      "#nest-slope": "flat",
      "#nest-microrelief": "flat",
      "#random-rerolled": "no",
      "#random-reroll-reason": "none",
      "#random-substrate": "sand",
      "#random-slope": "flat",
      "#random-microrelief": "flat",
      "#meso-assessment-method": "unknown",
      "#meso-big-objects": "unknown",
      "#qc-bird-reaction": "weak",
      "#qc-time-at-nest": "lt1",
      "#qc-aborted": "no",
      "#qc-tracks": "no",
    };
    Object.entries(defaults).forEach(([selector, v]) => setValue(selector, v));
    Object.values(PERCENT_GROUPS).forEach((group) => group.items.forEach(([id]) => setValue(`#${id}`, "0")));

    $("#nest-photo-preview").innerHTML = "";
    $("#random-photo-preview").innerHTML = "";
    if ($("#validation-override-summary")) $("#validation-override-summary").checked = false;
    const sectorEl = $("#sector");
    if (sectorEl) {
      delete sectorEl.dataset.manual;
      delete sectorEl.dataset.auto;
    }
    $("#edit-banner").hidden = true;
    $("#form-mode-title").textContent = "Nowe gniazdo";
    syncTilesFromInputs();
    updatePercentSummaries();
  }

  function startNewRecord() {
    resetForm();
    showView("form");
    showStep(1);
  }

  function loadRecordToForm(record) {
    resetForm();
    editingUid = record.uid;
    $("#form-mode-title").textContent = "Edycja rekordu";
    $("#edit-banner").hidden = false;
    $("#edit-record-label").textContent = `${record.nestId || "rekord"} (${record.obsDate || ""})`;

    setValue("#nest-id", record.nestId);
    setValue("#season", record.season);
    setValue("#obs-date", record.obsDate);
    setValue("#obs-time", record.obsTime);
    setValue("#observer", record.observer);
    setValue("#species", record.species || "unknown");
    setValue("#sector", record.sector);
    const sectorEl = $("#sector");
    if (sectorEl) {
      delete sectorEl.dataset.manual;
      delete sectorEl.dataset.auto;
      if (String(record.sector || "").trim()) sectorEl.dataset.manual = "1";
    }
    setValue("#lat", record.lat);
    setValue("#lon", record.lon);
    setValue("#gps-accuracy", record.gpsAccuracyM);
    setValue("#egg-count", record.eggCount);
    setValue("#nest-status", record.nestStatus || "unknown");
    setValue("#possible-renest", record.possibleRenest || "unknown");
    setValue("#doc-photo-done", record.docPhotoDone || "unknown");
    setValue("#nest-one-m-photo-done", record.nestOneMPhotoDone || "unknown");
    setValue("#random-point-done", record.randomPointDone || "unknown");
    if ($("#validation-override-summary")) $("#validation-override-summary").checked = !!record.validationOverride;

    setValue("#nest-substrate", record.nestMicro?.substrate || "sand");
    setCoverage("nest", record.nestMicro?.coverage);
    setValue("#nest-dist-plant", record.nestMicro?.distPlantCm ?? "");
    setValue("#nest-height-plant", record.nestMicro?.heightPlantCm ?? "");
    setValue("#nest-dist-object", record.nestMicro?.distObjectCm ?? "");
    setValue("#nest-height-object", record.nestMicro?.heightObjectCm ?? "");
    setValue("#nest-slope", record.nestMicro?.slope || "flat");
    setValue("#nest-microrelief", record.nestMicro?.microrelief || "flat");

    setValue("#random-azimuth", record.randomMicro?.azimuthDeg ?? "");
    setValue("#random-rerolled", record.randomMicro?.wasRerolled || "no");
    setValue("#random-reroll-reason", record.randomMicro?.rerollReason || "none");
    setValue("#random-lat", record.randomMicro?.lat ?? "");
    setValue("#random-lon", record.randomMicro?.lon ?? "");
    setValue("#random-gps-accuracy", record.randomMicro?.gpsAccuracyM ?? "");
    setValue("#random-substrate", record.randomMicro?.substrate || "sand");
    setCoverage("random", record.randomMicro?.coverage);
    setValue("#random-dist-plant", record.randomMicro?.distPlantCm ?? "");
    setValue("#random-height-plant", record.randomMicro?.heightPlantCm ?? "");
    setValue("#random-dist-object", record.randomMicro?.distObjectCm ?? "");
    setValue("#random-height-object", record.randomMicro?.heightObjectCm ?? "");
    setValue("#random-slope", record.randomMicro?.slope || "flat");
    setValue("#random-microrelief", record.randomMicro?.microrelief || "flat");

    setValue("#pct-sand", record.meso?.pctSand ?? 0);
    setValue("#pct-gravel", record.meso?.pctGravel ?? 0);
    setValue("#pct-vegetation", record.meso?.pctVegetation ?? 0);
    setValue("#pct-water", record.meso?.pctWater ?? 0);
    setValue("#pct-other", record.meso?.pctOther ?? 0);
    setValue("#meso-assessment-method", record.meso?.assessmentMethod || "unknown");
    setValue("#dist-water", record.meso?.distWaterM ?? "");
    setValue("#dist-veg-edge", record.meso?.distVegEdgeM ?? "");
    setValue("#dist-vertical-structure", record.meso?.distVerticalStructureM ?? "");
    setValue("#dist-nearest-hiaticula", record.meso?.distNearestHiaticulaM ?? "");
    setValue("#dist-nearest-dubius", record.meso?.distNearestDubiusM ?? "");
    setValue("#meso-big-objects", record.meso?.bigObjects || "unknown");
    setValue("#dist-fine-gravel-patch", record.meso?.distFineGravelPatchM ?? "");
    setValue("#dist-coarse-gravel-patch", record.meso?.distCoarseGravelPatchM ?? "");
    setValue("#meso-spatial-notes", record.meso?.spatialNotes || "");

    setValue("#qc-bird-reaction", record.qualityControl?.birdReaction || "weak");
    setValue("#qc-time-at-nest", record.qualityControl?.timeAtNest || "lt1");
    setValue("#qc-aborted", record.qualityControl?.aborted || "no");
    setValue("#qc-tracks", record.qualityControl?.tracksVisible || "no");
    setValue("#qc-tracks-notes", record.qualityControl?.tracksNotes || "");

    setValue("#notes-identification", record.moduleNotes?.identification || "");
    setValue("#notes-nest-micro", record.moduleNotes?.nestMicro || "");
    setValue("#notes-random-micro", record.moduleNotes?.randomMicro || "");
    setValue("#notes-meso", record.moduleNotes?.meso || "");
    setValue("#notes", record.notes || "");

    currentNestPhotos = [...(record.nestMicro?.photos || [])];
    currentRandomPhotos = [...(record.randomMicro?.photos || [])];
    renderPhotoPreviews();

    syncTilesFromInputs();
    updatePercentSummaries();
    void autoFillSectorFromGrid();
    showView("form");
    showStep(1);
  }

  function editRecord(uid) {
    const record = getEntries().find((entry) => String(entry.uid) === String(uid));
    if (!record) {
      alert("Nie znaleziono rekordu do edycji.");
      return;
    }
    loadRecordToForm(record);
    const backBtn = $("#back-to-readonly");
    if (backBtn) backBtn.hidden = !editReturnToReadonly;
  }

  function deleteRecord(uid) {
    const entries = getEntries();
    const target = entries.find((entry) => String(entry.uid) === String(uid));
    if (!target) return;
    if (!confirm(`Usunąć rekord ${target.nestId || ""}?`)) return;
    setEntries(entries.filter((entry) => String(entry.uid) !== String(uid)));
    renderEntries();
    updateCounts();
  }

  async function renderPhotoPreviews() {
    const render = async (wrapSelector, existingRefs, inputSelector, label) => {
      const wrap = $(wrapSelector);
      if (!wrap) return;
      wrap.innerHTML = "";
      for (const ref of existingRefs) {
        const tile = document.createElement("div");
        tile.className = "photo-tile";
        tile.innerHTML = `<img alt="${label}"><small>${label} zapisane</small>`;
        wrap.appendChild(tile);
        resolvePhotoSrc(ref).then((src) => {
          if (src) tile.querySelector("img").src = src;
        });
      }
      const input = $(inputSelector);
      if (input?.files) {
        for (const file of Array.from(input.files)) {
          const tile = document.createElement("div");
          tile.className = "photo-tile";
          tile.innerHTML = `<img alt="${label}"><small>${label} nowe</small>`;
          tile.querySelector("img").src = URL.createObjectURL(file);
          wrap.appendChild(tile);
        }
      }
      if (!wrap.children.length) wrap.innerHTML = `<p class="muted">Brak zdjęć.</p>`;
    };
    await render("#nest-photo-preview", currentNestPhotos, "#nest-photos", "gniazdo");
    await render("#random-photo-preview", currentRandomPhotos, "#random-photos", "punkt losowy");
  }

  function updateCounts() {
    const entries = getEntries();
    $("#entry-count").textContent = String(entries.length);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayCount = entries.filter((entry) => entry.obsDate === today).length;
    $("#today-count").textContent = String(todayCount);
    $("#offline-status").textContent = navigator.onLine ? "online" : "offline";
    const speciesSummary = $("#species-summary");
    if (speciesSummary) {
      const stats = new Map();
      entries.forEach((entry) => {
        const key = entry.species || "unknown";
        if (!stats.has(key)) stats.set(key, { all: 0, today: 0 });
        const row = stats.get(key);
        row.all += 1;
        if (entry.obsDate === today) row.today += 1;
      });
      speciesSummary.innerHTML = [
        `<div>Wszystkie rekordy: ${entries.length}</div>`,
        `<div>Dzisiaj: ${todayCount}</div>`,
        ...Array.from(stats.entries()).map(([key, row]) => `<div>${escapeHtml(LABELS.species[key] || key || "Inne / nieokreślone")}: ${row.all}, dziś ${row.today}</div>`),
      ].join("");
    }
  }

  function renderEntries() {
    const list = $("#entries-list");
    if (!list) return;
    const query = trim("#record-search").toLowerCase();
    const entries = getEntries();
    const filtered = !query ? entries : entries.filter((entry) => {
      const text = [
        entry.nestId,
        entry.sector,
        entry.observer,
        LABELS.species[entry.species] || entry.species,
        entry.obsDate,
      ].join(" ").toLowerCase();
      return text.includes(query);
    });

    if (!filtered.length) {
      list.innerHTML = `<p class="muted">Brak rekordów.</p>`;
      return;
    }

    list.innerHTML = "";
    filtered.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "entry-card";
      card.dataset.uid = entry.uid;
      card.innerHTML = `
        <div class="entry-main">
          <h3>${escapeHtml(entry.nestId || "(bez ID)")}</h3>
          <p>${escapeHtml(LABELS.species[entry.species] || entry.species || "gatunek?")} • ${escapeHtml(entry.sector || "sektor?")}</p>
          <p class="muted">${escapeHtml(entry.obsDate || "")} ${escapeHtml(entry.obsTime || "")} • jaja: ${entry.eggCount ?? "brak"} • obserwator: ${escapeHtml(entry.observer || "brak")}</p>
          <p class="muted">GPS: ${entry.lat ?? "brak"}, ${entry.lon ?? "brak"} • protokół: ${escapeHtml(entry.protocolVersion || "")}</p>
          <p class="muted">Sync: ${escapeHtml(entry.syncStatus || "pending")}</p>
        </div>
        <div class="entry-actions">
          <button type="button" data-action="share" data-uid="${entry.uid}">Udostępnij</button>
          <button type="button" data-action="edit" data-uid="${entry.uid}">Edytuj</button>
          <button type="button" data-action="delete" data-uid="${entry.uid}" class="danger">Usuń</button>
        </div>
      `;
      list.appendChild(card);
    });
  }



  function buildRecordShareText(record) {
    const speciesLabel = LABELS.species[record?.species] || record?.species || "Nieokreślony";
    const nestPos = toLatLon(record?.lat, record?.lon);
    const gpsText = nestPos ? `${nestPos[0].toFixed(6)}, ${nestPos[1].toFixed(6)}` : "brak";
    const mapUrl = nestPos ? `https://www.google.com/maps?q=${nestPos[0].toFixed(6)},${nestPos[1].toFixed(6)}` : null;
    return [
      `Gniazdo: ${record?.nestId || "(bez ID)"}`,
      `Gatunek: ${speciesLabel}`,
      `Data: ${record?.obsDate || "brak"}`,
      `Liczba jaj: ${record?.eggCount ?? "brak"}`,
      `GPS: ${gpsText}`,
      ...(mapUrl ? [`Mapa: ${mapUrl}`] : []),
    ].join("\n");
  }

  async function shareRecord(uid) {
    const record = getEntries().find((entry) => String(entry.uid) === String(uid));
    if (!record) return;
    const text = buildRecordShareText(record);
    if (navigator.share) {
      try {
        await navigator.share({ title: record.nestId || "Rekord gniazda", text });
        return;
      } catch {}
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => alert("Skopiowano dane rekordu do schowka"), () => alert(text));
      return;
    }
    alert(text);
  }

  function hasValidCoords(lat, lon) {
    if (lat == null || lon == null) return false;
    if (String(lat).trim() === "" || String(lon).trim() === "") return false;
    const a = Number(lat), b = Number(lon);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (a < -90 || a > 90 || b < -180 || b > 180) return false;
    if (a === 0 && b === 0) return false;
    return true;
  }

  function toLatLon(lat, lon) {
    if (!hasValidCoords(lat, lon)) return null;
    const a = Number(lat); const b = Number(lon);
    return [a, b];
  }


  function createBaseLayers() {
    const esriImg = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}");
    const esriLbl = L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}");
    const esriImgLbl = L.layerGroup([esriImg, esriLbl]);
    return {
      defaultLayer: esriImgLbl,
      layers: {
        "Esri Imagery + Labels": esriImgLbl,
        "ArcGIS Terrain with Labels": L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}"),
        "Esri World Imagery": esriImg,
        "OSM Standard": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"),
      }
    };
  }

  function markerHtml({ color = "#2563eb", label = "", muted = false } = {}) {
    const bg = muted ? "#94a3b8" : color;
    return `<div class="map-marker" style="background:${bg};">${escapeHtml(label || "")}</div>`;
  }

  function makeDivIcon(options = {}) {
    return L.divIcon({
      className: "custom-map-marker-wrap",
      html: markerHtml(options),
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  }

  function createHeadingIcon(deg = 0) {
    return L.divIcon({
      className: "heading-marker-wrap",
      html: `<div class="heading-marker" style="transform: rotate(${Number(deg) || 0}deg);"></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
  }

  function updateLocationMarkerForMap(target, lat, lon, accuracyM = null, headingDeg = null) {
    const state = mapUserState[target];
    const map = target === "records" ? recordsMap : workingMap;
    if (!state || !map || typeof L === "undefined") return;
    const pos = [lat, lon];
    if (!state.userLocationMarker) {
      state.userLocationMarker = L.circleMarker(pos, {
        radius: 7,
        color: "#0f172a",
        weight: 2,
        fillColor: "#38bdf8",
        fillOpacity: 1
      }).addTo(map);
    } else {
      state.userLocationMarker.setLatLng(pos);
    }
    if (Number.isFinite(Number(accuracyM))) {
      if (!state.userAccuracyCircle) {
        state.userAccuracyCircle = L.circle(pos, {
          radius: Math.max(1, Number(accuracyM)),
          color: "#38bdf8",
          weight: 1,
          fillColor: "#38bdf8",
          fillOpacity: 0.08
        }).addTo(map);
      } else {
        state.userAccuracyCircle.setLatLng(pos);
        state.userAccuracyCircle.setRadius(Math.max(1, Number(accuracyM)));
      }
    }
    if (Number.isFinite(Number(headingDeg))) {
      if (!state.userHeadingMarker) state.userHeadingMarker = L.marker(pos, { icon: createHeadingIcon(headingDeg), interactive: false }).addTo(map);
      else { state.userHeadingMarker.setLatLng(pos); state.userHeadingMarker.setIcon(createHeadingIcon(headingDeg)); }
    }
  }

  function startUserLocationTracking() {
    if (!navigator.geolocation) return;
    if (userLocationWatchId != null) return;
    userLocationWatchId = navigator.geolocation.watchPosition((pos) => {
      latestUserLatLng = [pos.coords.latitude, pos.coords.longitude];
      latestUserAccuracy = pos.coords.accuracy;
      updateLocationMarkerForMap("records", pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, latestMapHeadingDeg);
      updateLocationMarkerForMap("working", pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, latestMapHeadingDeg);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });

    window.addEventListener("deviceorientationabsolute", handleDeviceOrientation, true);
    window.addEventListener("deviceorientation", handleDeviceOrientation, true);
  }

  function handleDeviceOrientation(event) {
    const raw = typeof event.webkitCompassHeading === "number" ? event.webkitCompassHeading : (360 - (event.alpha || 0));
    if (!Number.isFinite(raw)) return;
    latestMapHeadingDeg = ((raw % 360) + 360) % 360;
    if (latestUserLatLng) {
      updateLocationMarkerForMap("records", latestUserLatLng[0], latestUserLatLng[1], latestUserAccuracy, latestMapHeadingDeg);
      updateLocationMarkerForMap("working", latestUserLatLng[0], latestUserLatLng[1], latestUserAccuracy, latestMapHeadingDeg);
    }
  }

  function enableMapHeading() {
    mapHeadingEnabled = true;
    startUserLocationTracking();
  }

  function renderRecordsMap(focusUid = null) {
    if (typeof L === "undefined") return;
    const entries = getEntries().filter((entry) => hasValidCoords(entry.lat, entry.lon));
    if (!recordsMap) {
      const base = createBaseLayers();
      recordsMap = L.map("records-map", { layers: [base.defaultLayer] }).setView([52.069, 15.95], 13);
      L.control.layers(base.layers, {}, { collapsed: true }).addTo(recordsMap);
      addGridToMap(recordsMap, "records");
      recordsMap.on("locationfound", (event) => updateLocationMarkerForMap("records", event.latlng.lat, event.latlng.lng, event.accuracy, latestMapHeadingDeg));
      recordsMap.on("locationerror", () => {});
      recordsMap.locate({ watch: true, enableHighAccuracy: true, maximumAge: 5000 });
      startUserLocationTracking();
    }
    if (mapMarkersLayer) mapMarkersLayer.remove();
    mapMarkersLayer = L.layerGroup().addTo(recordsMap);
    const bounds = [];
    entries.forEach((entry) => {
      const label = recordSpeciesLabelsVisible ? speciesCode(entry.species) : "";
      const marker = L.marker([Number(entry.lat), Number(entry.lon)], { icon: makeDivIcon({ color: "#2563eb", label }) })
        .bindPopup(`<strong>${escapeHtml(entry.nestId || "(bez ID)")}</strong><br>${escapeHtml(LABELS.species[entry.species] || entry.species || "")}<br>${escapeHtml(entry.obsDate || "")} ${escapeHtml(entry.obsTime || "")}<br><button type="button" data-map-edit="${entry.uid}">Otwórz rekord</button>`);
      marker.addTo(mapMarkersLayer);
      bounds.push([Number(entry.lat), Number(entry.lon)]);
    });
    if (bounds.length) {
      const target = entries.find((entry) => String(entry.uid) === String(focusUid));
      if (target) recordsMap.setView([Number(target.lat), Number(target.lon)], Math.max(recordsMap.getZoom(), 17));
      else recordsMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 17 });
    }
    setTimeout(() => recordsMap.invalidateSize(), 50);
  }

  function focusRecordOnMap(uid) {
    mapFocusUid = uid;
    showView("map");
  }

  function getWorkingNests() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WORKING_NESTS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(normalizeWorkingNest) : [];
    } catch {
      return [];
    }
  }

  function normalizeWorkingNest(nest) {
    const now = new Date().toISOString();
    const id = nest.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    return {
      ...nest,
      id,
      createdAt: nest.createdAt || now,
      updatedAt: nest.updatedAt || nest.createdAt || now,
      status: nest.status || "active",
      lat: nest.lat == null || nest.lat === "" ? null : Number(nest.lat),
      lon: nest.lon == null || nest.lon === "" ? null : Number(nest.lon),
      notes: nest.notes || nest.note || "",
    };
  }

  function setWorkingNests(nests) {
    localStorage.setItem(WORKING_NESTS_KEY, JSON.stringify(nests.map(normalizeWorkingNest)));
    updateWorkingCount();
  }

  function updateWorkingCount() {
    const el = $("#working-count");
    if (!el) return;
    el.textContent = String(getWorkingNests().filter((n)=>n.status !== "done" && !n.deletedAt).length);
  }

  function renderWorkingMap() {
    if (typeof L === "undefined") return;
    const nests = getWorkingNests().filter((n) => !n.deletedAt && n.status !== "done" && hasValidCoords(n.lat, n.lon));
    if (!workingMap) {
      const base = createBaseLayers();
      workingMap = L.map("working-map", { layers: [base.defaultLayer] }).setView([52.069, 15.95], 13);
      L.control.layers(base.layers, {}, { collapsed: true }).addTo(workingMap);
      addGridToMap(workingMap, "working");
      workingMap.on("locationfound", (event) => updateLocationMarkerForMap("working", event.latlng.lat, event.latlng.lng, event.accuracy, latestMapHeadingDeg));
      workingMap.on("locationerror", () => {});
      workingMap.locate({ watch: true, enableHighAccuracy: true, maximumAge: 5000 });
      startUserLocationTracking();
    }
    if (workingLayer) workingLayer.remove();
    workingLayer = L.layerGroup().addTo(workingMap);
    const bounds = [];
    nests.forEach((nest) => {
      const marker = L.marker([Number(nest.lat), Number(nest.lon)], { icon: makeDivIcon({ color: nest.status === "checked" ? "#16a34a" : "#f97316", label: nest.status === "checked" ? "✓" : "?" }) })
        .bindPopup(`<strong>${escapeHtml(nest.id)}</strong><br>${escapeHtml(nest.notes || "")}${nest.lastVisitedAt ? `<br>Ostatnio: ${escapeHtml(nest.lastVisitedAt)}` : ""}<br><button type="button" data-working-focus="${nest.id}">Pokaż</button>`);
      marker.addTo(workingLayer);
      bounds.push([Number(nest.lat), Number(nest.lon)]);
    });
    if (bounds.length) {
      const target = nests.find((nest) => String(nest.id) === String(workingFocusId));
      if (target) workingMap.setView([Number(target.lat), Number(target.lon)], Math.max(workingMap.getZoom(), 17));
      else workingMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 17 });
    }
    setTimeout(() => workingMap.invalidateSize(), 50);
    renderWorkingList();
  }

  function workingStatusLabel(status) {
    if (status === "checked") return "sprawdzone";
    if (status === "done") return "zakończone";
    return "do sprawdzenia";
  }

  function renderWorkingList() {
    const list = $("#working-list");
    if (!list) return;
    const nests = getWorkingNests().filter((n)=>!n.deletedAt && n.status !== "done");
    if (!nests.length) {
      list.innerHTML = `<p class="muted">Brak roboczych gniazd.</p>`;
      return;
    }
    const rows = nests.map((nest) => `
      <article class="entry-card working-card${String(nest.id) === String(workingFocusId) ? " selected" : ""}" data-working-id="${escapeHtml(nest.id)}">
        <div class="entry-main">
          <h3>${escapeHtml(nest.id)}</h3>
          <p>${escapeHtml(workingStatusLabel(nest.status))}</p>
          <p class="muted">GPS: ${nest.lat ?? "brak"}, ${nest.lon ?? "brak"}</p>
          ${workingNotesVisible ? `<p class="muted">${escapeHtml(nest.notes || "brak notatek")}</p>` : ""}
        </div>
        <div class="entry-actions">
          <button type="button" data-working-action="focus" data-id="${escapeHtml(nest.id)}">Pokaż</button>
          <button type="button" data-working-action="edit" data-id="${escapeHtml(nest.id)}">Edytuj</button>
          <button type="button" data-working-action="checked" data-id="${escapeHtml(nest.id)}">Sprawdzone</button>
          <button type="button" data-working-action="done" data-id="${escapeHtml(nest.id)}">Zakończ</button>
          <button type="button" data-working-action="delete" data-id="${escapeHtml(nest.id)}" class="danger">Usuń</button>
        </div>
      </article>
    `).join("");
    list.innerHTML = rows;
  }

  function setWorkingViewMode(mode) {
    workingViewMode = mode === "list" ? "list" : "map";
    const mapEl = $("#working-map");
    const listEl = $("#working-list");
    if (mapEl) mapEl.hidden = workingViewMode !== "map";
    if (listEl) listEl.hidden = workingViewMode !== "list";
    $$("[data-working-view]").forEach((btn) => btn.classList.toggle("primary", btn.dataset.workingView === workingViewMode));
    if (workingViewMode === "map") setTimeout(() => renderWorkingMap(), 0);
    else renderWorkingList();
  }

  function addWorkingNestFromInputs() {
    const id = trim("#working-id") || `W-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(16).slice(2, 5)}`;
    const lat = getNumber("#working-lat", latestUserLatLng?.[0] ?? null);
    const lon = getNumber("#working-lon", latestUserLatLng?.[1] ?? null);
    if (!hasValidCoords(lat, lon)) {
      alert("Brakuje poprawnych współrzędnych roboczego gniazda.");
      return;
    }
    const nests = getWorkingNests();
    const now = new Date().toISOString();
    const row = normalizeWorkingNest({ id, lat, lon, notes: trim("#working-notes"), status: "active", createdAt: now, updatedAt: now });
    const idx = nests.findIndex((n)=>String(n.id)===String(row.id));
    if (idx >= 0) nests[idx] = { ...nests[idx], ...row };
    else nests.unshift(row);
    setWorkingNests(nests);
    setValue("#working-id", ""); setValue("#working-notes", "");
    workingFocusId = row.id;
    renderWorkingMap();
  }

  function updateWorkingNestStatus(id, status) {
    const nests = getWorkingNests();
    const idx = nests.findIndex((n)=>String(n.id)===String(id));
    if (idx < 0) return;
    nests[idx].status = status;
    nests[idx].updatedAt = new Date().toISOString();
    if (status === "checked") nests[idx].lastVisitedAt = new Date().toISOString();
    setWorkingNests(nests);
    renderWorkingMap();
  }

  function editWorkingNest(id) {
    const nest = getWorkingNests().find((n)=>String(n.id)===String(id));
    if (!nest) return;
    editingWorkingId = nest.id;
    setValue("#working-id", nest.id);
    setValue("#working-lat", nest.lat ?? "");
    setValue("#working-lon", nest.lon ?? "");
    setValue("#working-notes", nest.notes || "");
    showView("working-map");
    setWorkingViewMode("map");
  }

  function deleteWorkingNest(id) {
    if (!confirm("Usunąć robocze gniazdo?")) return;
    const nests = getWorkingNests().map((n)=>String(n.id)===String(id) ? { ...n, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : n);
    setWorkingNests(nests);
    renderWorkingMap();
  }

  function startRecordFromWorking(id) {
    const nest = getWorkingNests().find((n)=>String(n.id)===String(id));
    startNewRecord();
    if (nest) {
      setValue("#nest-id", nest.id);
      setValue("#lat", nest.lat ?? "");
      setValue("#lon", nest.lon ?? "");
      if (nest.notes) setValue("#notes-identification", nest.notes);
      workingFocusId = nest.id;
    }
  }

  function setupWorkingNests() {
    $("#working-map-open")?.addEventListener("click", () => { showView("working-map"); setWorkingViewMode("map"); });
    $("#back-home-from-working")?.addEventListener("click", () => showView("home"));
    $("#working-add")?.addEventListener("click", addWorkingNestFromInputs);
    $("#working-current-gps")?.addEventListener("click", () => {
      if (!latestUserLatLng) { alert("Nie mam jeszcze aktualnej pozycji GPS."); return; }
      setValue("#working-lat", latestUserLatLng[0].toFixed(6));
      setValue("#working-lon", latestUserLatLng[1].toFixed(6));
    });
    $("#working-refresh-map")?.addEventListener("click", renderWorkingMap);
    $("#working-show-me")?.addEventListener("click", () => {
      if (!workingMap) return;
      if (latestUserLatLng) workingMap.setView(latestUserLatLng, Math.max(workingMap.getZoom(), 17));
      workingMap.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true });
    });
    $("#working-heading")?.addEventListener("click", enableMapHeading);
    $("#working-toggle-notes")?.addEventListener("click", () => { workingNotesVisible = !workingNotesVisible; renderWorkingList(); });
    $$("[data-working-view]").forEach((btn) => btn.addEventListener("click", () => setWorkingViewMode(btn.dataset.workingView)));
    document.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-working-action]");
      if (actionBtn) {
        const id = actionBtn.dataset.id;
        const action = actionBtn.dataset.workingAction;
        if (action === "focus") { workingFocusId = id; setWorkingViewMode("map"); renderWorkingMap(); }
        if (action === "edit") editWorkingNest(id);
        if (action === "checked") updateWorkingNestStatus(id, "checked");
        if (action === "done") updateWorkingNestStatus(id, "done");
        if (action === "delete") deleteWorkingNest(id);
        return;
      }
      const popupBtn = event.target.closest("[data-working-focus]");
      if (popupBtn) { workingFocusId = popupBtn.dataset.workingFocus; renderWorkingMap(); return; }
    });
    renderWorkingList();
    updateWorkingCount();
  }

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function isNoValue(value) {
    const v = normalizeText(value);
    return ["", "brak", "nie", "no", "n", "0", "false"].includes(v);
  }

  function classifyYesNo(value, unknown = "unknown") {
    const v = normalizeText(value);
    if (["tak", "yes", "y", "1", "true", "prawda"].includes(v)) return "yes";
    if (["nie", "no", "n", "0", "false", "brak", "none"].includes(v)) return "no";
    return unknown;
  }

  function speciesFromText(value) {
    const v = normalizeText(value);
    if (!v) return "unknown";
    if (v.includes("obroz") || v.includes("hiaticula") || v === "sob") return "charadrius-hiaticula";
    if (v.includes("rzecz") || v.includes("dubius") || v === "srz") return "charadrius-dubius";
    if (v.includes("czaj") || v.includes("vanellus") || v === "cz") return "vanellus-vanellus";
    if (v.includes("krwaw") || v.includes("totanus") || v === "kr") return "tringa-totanus";
    if (v.includes("bialoczel") || v.includes("sternula") || v === "rb") return "sternula-albifrons";
    if (v.includes("smiesz") || v.includes("ridibundus") || v === "sm") return "chroicocephalus-ridibundus";
    return `custom:${slugify(value) || "unknown"}`;
  }

  function substrateFromText(value) {
    const v = normalizeText(value);
    if (v.includes("drob") || v.includes("fine")) return "fine-gravel";
    if (v.includes("grub") || v.includes("kam")) return "coarse-gravel";
    if (v.includes("muszl") || v.includes("shell")) return "stones";
    if (v.includes("miesz")) return "mixed";
    if (v.includes("piasek") || v.includes("sand")) return "sand";
    return "sand";
  }

  function slopeFromText(value) {
    const v = normalizeText(value);
    if (v.includes("strom") || v.includes("steep") || v.includes("duz")) return "steep";
    if (v.includes("lek") || v.includes("slight") || v.includes("mal")) return "slight";
    return "flat";
  }

  function microreliefFromText(value) {
    const v = normalizeText(value);
    if (v.includes("zag") || v.includes("depress")) return "depression";
    if (v.includes("grzb") || v.includes("ridge") || v.includes("garb")) return "ridge";
    if (v.includes("miedzy") || v.includes("między") || v.includes("between")) return "between-stones";
    return "flat";
  }

  function assessmentFromText(value) {
    const v = normalizeText(value);
    if (v.includes("gis") || v.includes("orto") || v.includes("map")) return "gis";
    if (v.includes("teren") || v.includes("field")) return "field";
    return "unknown";
  }

  function findFirst(row, candidates) {
    for (const key of candidates) {
      if (row[key] != null && String(row[key]).trim() !== "") return row[key];
      const normalizedKey = normalizeText(key);
      const match = Object.keys(row).find((k) => normalizeText(k) === normalizedKey);
      if (match && row[match] != null && String(row[match]).trim() !== "") return row[match];
    }
    return "";
  }

  function toNumberOrNull(value) {
    if (value == null || String(value).trim() === "") return null;
    const text = String(value).replace(",", ".").replace(/[^0-9.+-]/g, "");
    if (!text) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  function buildEntryFromImportedRow(row, index) {
    const now = new Date().toISOString();
    const nestId = String(findFirst(row, ["nest_id", "ID gniazda", "id", "gniazdo", "nestId"])).trim() || `import-${index + 1}`;
    const obsDate = String(findFirst(row, ["date", "obs_date", "data", "Data"])).trim();
    const obsTime = String(findFirst(row, ["time", "obs_time", "godzina", "Godzina"])).trim();
    const species = speciesFromText(findFirst(row, ["species", "gatunek", "Gatunek", "kod gatunku"]));
    const sector = String(findFirst(row, ["sector", "sektor", "część wyspy", "czesc wyspy"])).trim();
    const observer = String(findFirst(row, ["observer", "obserwator", "Obserwator"])).trim();
    const lat = toNumberOrNull(findFirst(row, ["lat", "latitude", "szerokość", "szerokosc", "GPS lat", "gps_lat"]));
    const lon = toNumberOrNull(findFirst(row, ["lon", "lng", "longitude", "długość", "dlugosc", "GPS lon", "gps_lon"]));
    const eggCount = toNumberOrNull(findFirst(row, ["egg_count", "eggs", "liczba jaj", "jaja", "Liczba jaj"]));
    const createdAt = String(findFirst(row, ["created_at", "createdAt"])).trim() || now;
    const updatedAt = String(findFirst(row, ["updated_at", "updatedAt"])).trim() || createdAt;
    return normalizeEntry({
      uid: String(findFirst(row, ["uid", "record_uid", "record id"])).trim() || `${nestId}-${createdAt}-${index}`,
      protocolVersion: String(findFirst(row, ["protocolVersion", "protocol_version"])).trim() || PROTOCOL_VERSION,
      createdAt,
      updatedAt,
      nestId,
      season: String(findFirst(row, ["season", "sezon", "rok"])).trim() || (obsDate ? obsDate.slice(0, 4) : ""),
      obsDate,
      obsTime,
      observer,
      species,
      sector,
      lat,
      lon,
      gpsAccuracyM: toNumberOrNull(findFirst(row, ["gps_accuracy_m", "gpsAccuracyM", "dokładność gps", "dokladnosc gps"])),
      nestStatus: "unknown",
      eggCount,
      possibleRenest: classifyYesNo(findFirst(row, ["possible_renest", "renest", "powtórne gniazdo"])),
      docPhotoDone: classifyYesNo(findFirst(row, ["doc_photo_done", "docPhotoDone", "zdjęcie dokumentacyjne", "zdjecie dokumentacyjne"])),
      nestOneMPhotoDone: classifyYesNo(findFirst(row, ["nest_1m_photo_done", "nestOneMPhotoDone", "zdjęcie 1m", "zdjecie 1m"])),
      randomPointDone: classifyYesNo(findFirst(row, ["random_point_done", "randomPointDone", "punkt losowy"])),
      nestMicro: {
        photos: [],
        substrate: substrateFromText(findFirst(row, ["nest_substrate", "podłoże gniazda", "podloze gniazda"])),
        coverage: {
          pctSand: toNumberOrNull(findFirst(row, ["nest_pct_sand", "pct_piasek_gniazdo"])) || 0,
          pctFineGravel: toNumberOrNull(findFirst(row, ["nest_pct_fine_gravel", "pct_drobny_zwir_gniazdo"])) || 0,
          pctCoarse: toNumberOrNull(findFirst(row, ["nest_pct_coarse", "pct_gruby_zwir_gniazdo"])) || 0,
          pctShells: toNumberOrNull(findFirst(row, ["nest_pct_shells", "pct_muszle_gniazdo"])) || 0,
          pctLiveVeg: toNumberOrNull(findFirst(row, ["nest_pct_live_veg", "pct_rosliny_zywe_gniazdo"])) || 0,
          pctDryVeg: toNumberOrNull(findFirst(row, ["nest_pct_dry_veg", "pct_rosliny_suche_gniazdo"])) || 0,
          pctOrganic: toNumberOrNull(findFirst(row, ["nest_pct_organic", "pct_organiczne_gniazdo"])) || 0,
          pctAnthro: toNumberOrNull(findFirst(row, ["nest_pct_anthro", "pct_antropogeniczne_gniazdo"])) || 0,
        },
        distPlantCm: toNumberOrNull(findFirst(row, ["nest_dist_plant_cm", "dist_plant_cm"])),
        heightPlantCm: toNumberOrNull(findFirst(row, ["nest_height_plant_cm", "height_plant_cm"])),
        distObjectCm: toNumberOrNull(findFirst(row, ["nest_dist_object_cm", "dist_object_cm"])),
        heightObjectCm: toNumberOrNull(findFirst(row, ["nest_height_object_cm", "height_object_cm"])),
        slope: slopeFromText(findFirst(row, ["nest_slope", "nachylenie_gniazdo"])),
        microrelief: microreliefFromText(findFirst(row, ["nest_microrelief", "mikrorzezba_gniazdo"])),
      },
      randomMicro: {
        azimuthDeg: toNumberOrNull(findFirst(row, ["random_azimuth_deg", "azimuth", "azymut"])),
        wasRerolled: classifyYesNo(findFirst(row, ["random_was_rerolled", "reroll", "losowanie ponowne"]), "no"),
        rerollReason: "none",
        lat: toNumberOrNull(findFirst(row, ["random_lat", "control_lat"])),
        lon: toNumberOrNull(findFirst(row, ["random_lon", "control_lon"])),
        gpsAccuracyM: toNumberOrNull(findFirst(row, ["random_gps_accuracy_m", "control_gps_accuracy_m"])),
        photos: [],
        substrate: substrateFromText(findFirst(row, ["random_substrate", "podłoże punktu", "podloze punktu"])),
        coverage: {
          pctSand: toNumberOrNull(findFirst(row, ["random_pct_sand"])) || 0,
          pctFineGravel: toNumberOrNull(findFirst(row, ["random_pct_fine_gravel"])) || 0,
          pctCoarse: toNumberOrNull(findFirst(row, ["random_pct_coarse"])) || 0,
          pctShells: toNumberOrNull(findFirst(row, ["random_pct_shells"])) || 0,
          pctLiveVeg: toNumberOrNull(findFirst(row, ["random_pct_live_veg"])) || 0,
          pctDryVeg: toNumberOrNull(findFirst(row, ["random_pct_dry_veg"])) || 0,
          pctOrganic: toNumberOrNull(findFirst(row, ["random_pct_organic"])) || 0,
          pctAnthro: toNumberOrNull(findFirst(row, ["random_pct_anthro"])) || 0,
        },
        distPlantCm: toNumberOrNull(findFirst(row, ["random_dist_plant_cm"])),
        heightPlantCm: toNumberOrNull(findFirst(row, ["random_height_plant_cm"])),
        distObjectCm: toNumberOrNull(findFirst(row, ["random_dist_object_cm"])),
        heightObjectCm: toNumberOrNull(findFirst(row, ["random_height_object_cm"])),
        slope: slopeFromText(findFirst(row, ["random_slope"])),
        microrelief: microreliefFromText(findFirst(row, ["random_microrelief"])),
      },
      meso: {
        pctSand: toNumberOrNull(findFirst(row, ["pct_sand", "meso_pct_sand"])) || 0,
        pctGravel: toNumberOrNull(findFirst(row, ["pct_gravel", "meso_pct_gravel"])) || 0,
        pctVegetation: toNumberOrNull(findFirst(row, ["pct_vegetation", "meso_pct_vegetation"])) || 0,
        pctWater: toNumberOrNull(findFirst(row, ["pct_water", "meso_pct_water"])) || 0,
        pctOther: toNumberOrNull(findFirst(row, ["pct_other", "meso_pct_other"])) || 0,
        assessmentMethod: assessmentFromText(findFirst(row, ["assessment_method", "metoda_oceny"])),
        distWaterM: toNumberOrNull(findFirst(row, ["dist_water_m", "odległość od wody", "odleglosc od wody"])),
        distVegEdgeM: toNumberOrNull(findFirst(row, ["dist_veg_edge_m", "odległość od roślinności", "odleglosc od roslinnosci"])),
        distVerticalStructureM: toNumberOrNull(findFirst(row, ["dist_vertical_structure_m"])),
        distNearestHiaticulaM: toNumberOrNull(findFirst(row, ["dist_nearest_hiaticula_m"])),
        distNearestDubiusM: toNumberOrNull(findFirst(row, ["dist_nearest_dubius_m"])),
        bigObjects: String(findFirst(row, ["meso_big_objects", "big_objects"])).trim() || "unknown",
        distFineGravelPatchM: toNumberOrNull(findFirst(row, ["dist_fine_gravel_patch_m"])),
        distCoarseGravelPatchM: toNumberOrNull(findFirst(row, ["dist_coarse_gravel_patch_m"])),
        spatialNotes: String(findFirst(row, ["spatial_notes", "uwagi przestrzenne"])).trim(),
      },
      qualityControl: {},
      moduleNotes: {},
      notes: String(findFirst(row, ["notes", "uwagi", "notatki"])).trim(),
    });
  }

  function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inside = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inside && line[i + 1] === '"') { current += '"'; i += 1; }
        else inside = !inside;
      } else if (ch === "," && !inside) {
        values.push(current); current = "";
      } else current += ch;
    }
    values.push(current);
    return values;
  }

  function parseCsv(text) {
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
    if (!lines.length) return [];
    const headers = parseCsvLine(lines[0]).map((h) => String(h).trim());
    return lines.slice(1).map((line) => {
      const vals = parseCsvLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
      return row;
    });
  }

  function parseDelimitedText(text) {
    const raw = String(text || "");
    if (!raw.trim()) return [];
    if (raw.includes(",") && raw.split(/\r?\n/)[0]?.includes(",")) return parseCsv(raw);
    const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
    const headerLine = lines[0] || "";
    const delimiter = headerLine.includes("\t") ? "\t" : headerLine.includes(";") ? ";" : ",";
    const headers = headerLine.split(delimiter).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = delimiter === "," ? parseCsvLine(line) : line.split(delimiter);
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
      return row;
    });
  }

  function setupDataImport() {
    const fileInput = $("#import-file");
    const btn = $("#import-data");
    if (!fileInput || !btn) return;
    btn.addEventListener("click", async () => {
      const file = fileInput.files?.[0];
      if (!file) { alert("Wybierz plik CSV/TXT wyeksportowany z Excela."); return; }
      try {
        const text = await file.text();
        const rows = parseDelimitedText(text);
        if (!rows.length) { alert("Nie znaleziono danych do importu."); return; }
        const imported = rows.map(buildEntryFromImportedRow).filter(Boolean);
        const current = getEntries();
        const byUid = new Map(current.map((entry) => [String(entry.uid), entry]));
        imported.forEach((entry) => byUid.set(String(entry.uid), entry));
        if (!setEntries(Array.from(byUid.values()))) return;
        renderEntries();
        updateCounts();
        alert(`Zaimportowano/uzupełniono rekordy: ${imported.length}.`);
      } catch (error) {
        console.error(error);
        alert("Nie udało się zaimportować pliku. Sprawdź format CSV/TXT.");
      }
    });
  }

  function csvHeaders() {
    return [
      "uid", "nest_id", "season", "obs_date", "obs_time", "observer", "species", "sector", "lat", "lon", "gps_accuracy_m",
      "nest_status", "egg_count", "possible_renest", "doc_photo_done", "nest_1m_photo_done", "random_point_done",
      "nest_substrate", "nest_pct_sand", "nest_pct_fine_gravel", "nest_pct_coarse", "nest_pct_shells", "nest_pct_live_veg", "nest_pct_dry_veg", "nest_pct_organic", "nest_pct_anthro",
      "nest_dist_plant_cm", "nest_height_plant_cm", "nest_dist_object_cm", "nest_height_object_cm", "nest_slope", "nest_microrelief",
      "random_azimuth_deg", "random_was_rerolled", "random_reroll_reason", "random_lat", "random_lon", "random_gps_accuracy_m",
      "random_substrate", "random_pct_sand", "random_pct_fine_gravel", "random_pct_coarse", "random_pct_shells", "random_pct_live_veg", "random_pct_dry_veg", "random_pct_organic", "random_pct_anthro",
      "random_dist_plant_cm", "random_height_plant_cm", "random_dist_object_cm", "random_height_object_cm", "random_slope", "random_microrelief",
      "pct_sand", "pct_gravel", "pct_vegetation", "pct_water", "pct_other", "meso_assessment_method", "meso_big_objects",
      "dist_water_m", "dist_veg_edge_m", "dist_vertical_structure_m", "dist_fine_gravel_patch_m", "dist_coarse_gravel_patch_m", "dist_nearest_hiaticula_m", "dist_nearest_dubius_m", "meso_spatial_notes",
      "qc_bird_reaction", "qc_time_at_nest", "qc_aborted", "qc_tracks", "qc_tracks_notes",
      "notes_identification", "notes_nest_micro", "notes_random_micro", "notes_meso", "notes",
      "nest_photo_refs", "random_photo_refs", "all_photo_refs", "nest_photo_link", "random_photo_link", "created_at", "updated_at"
    ];
  }

  function csvRow(record) {
    const nestRefs = (record.nestMicro?.photos || []).map((_, i) => `${record.uid}_nest_${i + 1}.jpg`);
    const randomRefs = (record.randomMicro?.photos || []).map((_, i) => `${record.uid}_random_${i + 1}.jpg`);
    const allRefs = [...nestRefs, ...randomRefs];
    const values = [
      record.uid, record.nestId, record.season, record.obsDate, record.obsTime, record.observer, record.species, record.sector, record.lat, record.lon, record.gpsAccuracyM,
      record.nestStatus, record.eggCount, record.possibleRenest, record.docPhotoDone, record.nestOneMPhotoDone, record.randomPointDone,
      record.nestMicro?.substrate, record.nestMicro?.coverage?.pctSand, record.nestMicro?.coverage?.pctFineGravel, record.nestMicro?.coverage?.pctCoarse, record.nestMicro?.coverage?.pctShells, record.nestMicro?.coverage?.pctLiveVeg, record.nestMicro?.coverage?.pctDryVeg, record.nestMicro?.coverage?.pctOrganic, record.nestMicro?.coverage?.pctAnthro,
      record.nestMicro?.distPlantCm, record.nestMicro?.heightPlantCm, record.nestMicro?.distObjectCm, record.nestMicro?.heightObjectCm, record.nestMicro?.slope, record.nestMicro?.microrelief,
      record.randomMicro?.azimuthDeg, record.randomMicro?.wasRerolled, record.randomMicro?.rerollReason, record.randomMicro?.lat, record.randomMicro?.lon, record.randomMicro?.gpsAccuracyM,
      record.randomMicro?.substrate, record.randomMicro?.coverage?.pctSand, record.randomMicro?.coverage?.pctFineGravel, record.randomMicro?.coverage?.pctCoarse, record.randomMicro?.coverage?.pctShells, record.randomMicro?.coverage?.pctLiveVeg, record.randomMicro?.coverage?.pctDryVeg, record.randomMicro?.coverage?.pctOrganic, record.randomMicro?.coverage?.pctAnthro,
      record.randomMicro?.distPlantCm, record.randomMicro?.heightPlantCm, record.randomMicro?.distObjectCm, record.randomMicro?.heightObjectCm, record.randomMicro?.slope, record.randomMicro?.microrelief,
      record.meso?.pctSand, record.meso?.pctGravel, record.meso?.pctVegetation, record.meso?.pctWater, record.meso?.pctOther, record.meso?.assessmentMethod, record.meso?.bigObjects,
      record.meso?.distWaterM, record.meso?.distVegEdgeM, record.meso?.distVerticalStructureM, record.meso?.distFineGravelPatchM, record.meso?.distCoarseGravelPatchM, record.meso?.distNearestHiaticulaM, record.meso?.distNearestDubiusM, record.meso?.spatialNotes,
      record.qualityControl?.birdReaction, record.qualityControl?.timeAtNest, record.qualityControl?.aborted, record.qualityControl?.tracksVisible, record.qualityControl?.tracksNotes,
      record.moduleNotes?.identification, record.moduleNotes?.nestMicro, record.moduleNotes?.randomMicro, record.moduleNotes?.meso, record.notes,
      nestRefs.join(";"), randomRefs.join(";"), allRefs.join(";"),
      nestRefs[0] ? `=HIPERŁĄCZE("${nestRefs[0]}";"picture_nest")` : "",
      randomRefs[0] ? `=HIPERŁĄCZE("${randomRefs[0]}";"picture_random")` : "",
      record.createdAt, record.updatedAt,
    ];
    return values.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",");
  }

  function downloadBlob(filename, type, content) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportPhotosZip(entries) {
    const zip = new JSZip();
    const photos = zip.folder("photos");
    let count = 0;
    for (const record of entries) {
      const addPhoto = async (ref, kind, index) => {
        const blob = await getPhotoBlob(ref);
        if (!blob) return;
        photos.file(`${record.uid}_${kind}_${index + 1}.jpg`, blob);
        count += 1;
      };
      for (let i = 0; i < (record.nestMicro?.photos || []).length; i += 1) await addPhoto(record.nestMicro.photos[i], "nest", i);
      for (let i = 0; i < (record.randomMicro?.photos || []).length; i += 1) await addPhoto(record.randomMicro.photos[i], "random", i);
    }
    if (!count) return null;
    return zip.generateAsync({ type: "blob" });
  }

  async function exportExcel(entries) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sieweczka");
    const headers = csvHeaders();
    sheet.addRow(headers);
    entries.forEach((record) => {
      const raw = csvRow(record).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v) => v.replace(/^"|"$/g, "").replaceAll('""', '"'));
      sheet.addRow(raw);
    });
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(`sieweczka-${new Date().toISOString().slice(0, 10)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Blob([buffer]));
  }

  function setupExports() {
    $("#export-csv")?.addEventListener("click", async () => {
      const entries = getEntries();
      if (!entries.length) { alert("Brak danych do eksportu."); return; }
      const csv = [csvHeaders().join(","), ...entries.map(csvRow)].join("\n");
      downloadBlob(`sieweczka-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8", "\uFEFF" + csv);
      const zip = await exportPhotosZip(entries);
      if (zip) downloadBlob(`sieweczka-zdjecia-${new Date().toISOString().slice(0, 10)}.zip`, "application/zip", zip);
      alert(zip ? "Pobrano CSV i paczkę zdjęć ZIP." : "Pobrano CSV. Brak zdjęć do ZIP.");
    });
    $("#export-excel")?.addEventListener("click", async () => {
      const entries = getEntries();
      if (!entries.length) { alert("Brak danych do eksportu."); return; }
      if (typeof ExcelJS === "undefined") { alert("Biblioteka ExcelJS nie jest dostępna."); return; }
      try { await exportExcel(entries); } catch (error) { console.error(error); alert("Nie udało się wyeksportować XLSX."); }
    });
  }

  function setupPhotoInputs() {
    ["#nest-photos", "#random-photos"].forEach((selector) => $(selector)?.addEventListener("change", renderPhotoPreviews));
  }

  function setupFieldMode() {
    const root = document.body;
    const key = "sieweczka-field-mode-v1";
    const apply = () => root.classList.toggle("field-mode", localStorage.getItem(key) === "1");
    apply();
    $("#field-mode-toggle")?.addEventListener("click", () => {
      localStorage.setItem(key, localStorage.getItem(key) === "1" ? "0" : "1");
      apply();
    });
  }

  function setupHelpBubbles() {
    document.addEventListener("click", (event) => {
      const btn = event.target.closest(".help-bubble");
      if (!btn) return;
      const isOpen = btn.classList.toggle("open");
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  function setupSheetEditor() {
    const btn = $("#sheet-toggle");
    const wrap = $("#sheet-editor");
    if (!btn || !wrap) return;
    btn.addEventListener("click", () => {
      wrap.hidden = !wrap.hidden;
      if (!wrap.hidden) renderSheetEditor();
    });
    $("#sheet-save-all")?.addEventListener("click", async () => {
      const rows = $$("#sheet-editor tbody tr");
      const entries = getEntries();
      for (const row of rows) {
        const uid = row.dataset.uid;
        const target = entries.find((entry) => String(entry.uid) === String(uid));
        if (!target) continue;
        const get = (col) => row.querySelector(`[data-col="${col}"]`)?.value ?? "";
        target.nestId = get("nestId").trim();
        target.obsDate = get("obsDate");
        target.obsTime = get("obsTime");
        target.observer = get("observer").trim();
        target.sector = get("sector").trim();
        target.eggCount = toNumberOrNull(get("eggCount"));
        target.lat = toNumberOrNull(get("lat"));
        target.lon = toNumberOrNull(get("lon"));
        target.notes = get("notes");
        const nestUploadInput = row.querySelector('[data-col="nestPhotosUpload"]');
        const randomUploadInput = row.querySelector('[data-col="randomPhotosUpload"]');
        const newNestPhotos = nestUploadInput ? await saveSelectedFilesForElement(nestUploadInput, 4) : [];
        const newRandomPhotos = randomUploadInput ? await saveSelectedFilesForElement(randomUploadInput, 4) : [];
        if (!target.nestMicro) target.nestMicro = {};
        if (!target.randomMicro) target.randomMicro = {};
        if (newNestPhotos.length) target.nestMicro.photos = [...(target.nestMicro.photos || []), ...newNestPhotos];
        if (newRandomPhotos.length) target.randomMicro.photos = [...(target.randomMicro.photos || []), ...newRandomPhotos];
        target.updatedAt = new Date().toISOString();
      }
      if (!setEntries(entries)) return;
      renderEntries(); renderSheetEditor();
      alert("Zapisano zmiany w arkuszu.");
    });
  }

  async function saveSelectedFilesForElement(input, maxFiles = 8) {
    const selected = input?.files ? Array.from(input.files).slice(0, maxFiles) : [];
    const refs = [];
    for (const file of selected) refs.push(await savePhotoFile(file));
    return refs;
  }

  function renderSheetEditor() {
    const tbody = $("#sheet-editor tbody");
    if (!tbody) return;
    const entries = getEntries();
    if (!entries.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="muted">Brak rekordów.</td></tr>`;
      return;
    }
    tbody.innerHTML = entries.map((entry) => `
      <tr data-uid="${escapeHtml(entry.uid)}">
        <td><input data-col="nestId" value="${escapeHtml(entry.nestId || "")}"></td>
        <td><input data-col="obsDate" type="date" value="${escapeHtml(entry.obsDate || "")}"></td>
        <td><input data-col="obsTime" type="time" value="${escapeHtml(entry.obsTime || "")}"></td>
        <td><input data-col="observer" value="${escapeHtml(entry.observer || "")}"></td>
        <td><input data-col="sector" value="${escapeHtml(entry.sector || "")}"></td>
        <td><input data-col="eggCount" type="number" value="${entry.eggCount ?? ""}"></td>
        <td><input data-col="lat" type="number" step="any" value="${entry.lat ?? ""}"></td>
        <td><input data-col="lon" type="number" step="any" value="${entry.lon ?? ""}"></td>
        <td><input data-col="notes" value="${escapeHtml(entry.notes || "")}"></td>
        <td>${(entry.nestMicro?.photos || []).length} <input data-col="nestPhotosUpload" type="file" accept="image/*" multiple></td>
        <td>${(entry.randomMicro?.photos || []).length} <input data-col="randomPhotosUpload" type="file" accept="image/*" multiple></td>
      </tr>
    `).join("");
  }

  function setupRecordBrowser() {
    $("#record-search")?.addEventListener("input", renderEntries);
    $("#entries-list")?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const { action, uid } = btn.dataset;
      if (action === "edit") { editReturnToReadonly = false; editRecord(uid); }
      if (action === "delete") deleteRecord(uid);
      if (action === "share") shareRecord(uid);
    });
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function setupFormNavigation() {
    $("#step-next")?.addEventListener("click", () => showStep(currentStep + 1));
    $("#step-back")?.addEventListener("click", () => showStep(currentStep - 1));
    $("#save-final")?.addEventListener("click", saveFinalRecord);
    $("#save-draft")?.addEventListener("click", saveDraft);
    $("#cancel-form")?.addEventListener("click", () => { resetForm(); showView("records"); });
    $("#entry-form")?.addEventListener("submit", (event) => event.preventDefault());
  }

  function setupGpsButtons() {
    const fill = (latSel, lonSel, accSel) => {
      if (!navigator.geolocation) { alert("Geolokalizacja niedostępna."); return; }
      navigator.geolocation.getCurrentPosition((pos) => {
        setValue(latSel, pos.coords.latitude.toFixed(6));
        setValue(lonSel, pos.coords.longitude.toFixed(6));
        setValue(accSel, pos.coords.accuracy.toFixed(1));
        autoFillNearestDistances();
        autoFillSectorFromGrid();
      }, () => alert("Nie udało się pobrać GPS."), { enableHighAccuracy: true, timeout: 15000 });
    };
    $("#gps-current")?.addEventListener("click", () => fill("#lat", "#lon", "#gps-accuracy"));
    $("#random-gps-current")?.addEventListener("click", () => fill("#random-lat", "#random-lon", "#random-gps-accuracy"));
  }

  function setupInstallPrompt() {
    let deferredPrompt = null;
    const btn = $("#install-app");
    window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredPrompt = event; if (btn) btn.hidden = false; });
    btn?.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.hidden = true;
    });
    if (window.matchMedia("(display-mode: standalone)").matches && btn) btn.hidden = true;
  }

  function setupFieldHelp() {
    const help = $("#field-help");
    if (!help) return;
    help.innerHTML = `
      <details><summary>Jak mierzyć odległości?</summary><p>Użyj centymetrów dla mikrohabitatów i metrów dla mezohabitatu. Notuj brak pomiaru jako puste pole, nie zero.</p></details>
      <details><summary>Zdjęcia</summary><p>Dodaj co najmniej jedno zdjęcie gniazda i jedno zdjęcie punktu losowego/kontroli. Aplikacja zapisuje zdjęcia lokalnie w telefonie i dołącza je do eksportu ZIP.</p></details>
      <details><summary>Pokrycie procentowe</summary><p>Suma powinna wynosić 100%. Dopuszczalne są niewielkie odchylenia tylko przy szybkim szacowaniu terenowym.</p></details>
    `;
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  function handleReadonlyActions() {
    $("#back-to-records")?.addEventListener("click", () => showView("records"));
    $("#readonly-edit")?.addEventListener("click", () => { editReturnToReadonly = true; editRecord(readonlyUid); });
    $("#readonly-map")?.addEventListener("click", () => focusRecordOnMap(readonlyUid));
    $("#back-to-readonly")?.addEventListener("click", () => { if (readonlyUid) showReadonlyRecord(readonlyUid); else showView("records"); });
  }

  function showReadonlyRecord(uid) {
    const record = getEntries().find((entry) => String(entry.uid) === String(uid));
    if (!record) return;
    readonlyUid = uid;
    const wrap = $("#record-readonly-content");
    wrap.innerHTML = `
      <h2>${escapeHtml(record.nestId || "(bez ID)")}</h2>
      <p>${escapeHtml(LABELS.species[record.species] || record.species || "")} • ${escapeHtml(record.obsDate || "")} ${escapeHtml(record.obsTime || "")}</p>
      <p>GPS: ${record.lat ?? "brak"}, ${record.lon ?? "brak"}</p>
      <p>Jaja: ${record.eggCount ?? "brak"} • Sektor: ${escapeHtml(record.sector || "brak")}</p>
      <h3>Notatki</h3><p>${escapeHtml(record.notes || "brak")}</p>
      <div id="readonly-photos" class="photo-preview"></div>
    `;
    showView("readonly");
    const refs = [...(record.nestMicro?.photos || []), ...(record.randomMicro?.photos || [])];
    const photos = $("#readonly-photos");
    refs.forEach((ref) => {
      const tile = document.createElement("div");
      tile.className = "photo-tile";
      tile.innerHTML = `<img alt="zdjęcie"><small>zdjęcie</small>`;
      photos.appendChild(tile);
      resolvePhotoSrc(ref).then((src) => { if (src) tile.querySelector("img").src = src; });
    });
  }

  function setupReadonlyOpen() {
    $("#entries-list")?.addEventListener("click", (event) => {
      const card = event.target.closest(".entry-card");
      if (!card || event.target.closest("button")) return;
      showReadonlyRecord(card.dataset.uid);
    });
    document.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-map-edit]");
      if (btn) showReadonlyRecord(btn.dataset.mapEdit);
    });
  }

  function setupAzimuth() {
    $("#random-azimuth-generate")?.addEventListener("click", () => setValue("#random-azimuth", String(Math.floor(Math.random() * 360))));
  }

  function setupDistanceManualFlags() {
    ["#dist-nearest-hiaticula", "#dist-nearest-dubius", "#sector"].forEach((sel) => $(sel)?.addEventListener("input", (event) => { event.target.dataset.manual = "1"; }));
  }

  function setupNavigationButtons() {
    $("#new-record")?.addEventListener("click", startNewRecord);
    $("#open-records")?.addEventListener("click", () => showView("records"));
    $("#open-map")?.addEventListener("click", () => { mapFocusUid = null; showView("map"); });
    $("#back-home-from-records")?.addEventListener("click", () => showView("home"));
    $("#back-home-from-map")?.addEventListener("click", () => showView("home"));
    $("#refresh-map")?.addEventListener("click", () => renderRecordsMap(mapFocusUid));
    $("#locate-me")?.addEventListener("click", () => {
      if (!recordsMap) return;
      if (latestUserLatLng) recordsMap.setView(latestUserLatLng, Math.max(recordsMap.getZoom(), 17));
      recordsMap.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true });
    });
    $("#enable-heading")?.addEventListener("click", enableMapHeading);
    $("#toggle-record-labels")?.addEventListener("click", () => { recordSpeciesLabelsVisible = !recordSpeciesLabelsVisible; renderRecordsMap(mapFocusUid); });
  }

  migrateLegacyEntries();
  setupPercentGroups();
  setupTiles();
  setupSmartLists();
  setupCustomSpecies();
  setupNestIdAutofill();
  setupFormNavigation();
  setupGpsButtons();
  setupPhotoInputs();
  setupNavigationButtons();
  setupRecordBrowser();
  setupReadonlyOpen();
  handleReadonlyActions();
  setupAzimuth();
  setupInstallPrompt();
  setupHelpBubbles();
  setupSheetEditor();
  setupDataImport();
  setupWorkingNests();
  setupDistanceManualFlags();
  setupExports();
  setupFieldMode();
  setupSyncUI();
  syncTilesFromInputs();
  updatePercentSummaries();
  renderEntries();
  updateCounts();
  setDefaultDateTime();
  registerServiceWorker();
})();
