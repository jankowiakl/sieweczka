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
    unknown: "SN",
  };

  const LABELS = {
    species: {
      "charadrius-hiaticula": "Sieweczka obrożna",
      "charadrius-dubius": "Sieweczka rzeczna",
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
  let userLayers = { records:{marker:null,circle:null,heading:null}, working:{marker:null,circle:null,heading:null} };
  let mapUserWatchId = null;
  let latestUserLatLng = null;
  let latestUserAccuracy = null;
  let mapHasAutoCenteredOnUser = false;
  let mapHeadingEnabled = false;
  let latestMapHeadingDeg = null;
  let workingMap = null;
  let workingLayer = null;
  let workingViewMode = "map";
  let workingFocusId = null;
  let currentNestPhotos = [];
  let currentRandomPhotos = [];
  const photoUrlCache = new Map();

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
    const lat = getNumber("#lat", null), lon = getNumber("#lon", null), species = value("#species", "unknown");
    if (lat == null || lon == null) return;
    const entries = getEntries();
    const nearest = (sp) => entries.filter((e) => e.species === sp && e.uid !== editingUid && e.lat != null && e.lon != null).reduce((best, e) => Math.min(best, haversineM(lat, lon, Number(e.lat), Number(e.lon))), Infinity);
    const hiEl = $("#dist-nearest-hiaticula"), duEl = $("#dist-nearest-dubius");
    if (hiEl && !hiEl.dataset.manual && species === "charadrius-hiaticula") { const d = nearest("charadrius-hiaticula"); hiEl.value = Number.isFinite(d) ? d.toFixed(1) : ""; }
    if (duEl && !duEl.dataset.manual && species === "charadrius-dubius") { const d = nearest("charadrius-dubius"); duEl.value = Number.isFinite(d) ? d.toFixed(1) : ""; }
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
    if (!setEntries(entries)) return;

    editingUid = null;
    currentNestPhotos = [];
    currentRandomPhotos = [];
    localStorage.removeItem(DRAFT_KEY);
    renderEntries();
    resetForm();
    showView("records");
    alert("Rekord zapisany.");
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
        </div>
        <div class="entry-actions">
          <button type="button" data-action="edit" data-uid="${entry.uid}">Edytuj</button>
          <button type="button" data-action="delete" data-uid="${entry.uid}" class="danger">Usuń</button>
        </div>
      `;
      list.appendChild(card);
    });
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
        "OSM DE": L.tileLayer("https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png"),
        "CARTO Positron": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"),
        "CARTO Voyager": L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"),
        "OpenTopoMap": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png")
      }
    };
  }

  function setLocationStatus(text){ ["#map-user-status","#working-user-status"].forEach((id)=>{ if($(id)) $(id).textContent=text; }); }

  function locationStatusText(mode){ if(mode==="waiting") return "Moja pozycja: oczekiwanie na GPS…"; if(mode==="unavailable") return "Moja pozycja: niedostępna"; if(mode==="active") return Number.isFinite(latestUserAccuracy)?`Moja pozycja: aktywna, dokładność ${Math.round(latestUserAccuracy)} m`:"Moja pozycja: aktywna"; return "Moja pozycja: niedostępna"; }

  async function showMyLocationOnMap(map, statusSelector) {
    if (!navigator.geolocation || !map) {
      if (statusSelector) $(statusSelector).textContent = locationStatusText("unavailable");
      throw new Error("gps-unavailable");
    }
    if (statusSelector) $(statusSelector).textContent = locationStatusText("waiting");
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        latestUserLatLng = [coords.latitude, coords.longitude];
        latestUserAccuracy = coords.accuracy;
        if (statusSelector) $(statusSelector).textContent = locationStatusText("active"); setLocationStatus(locationStatusText("active"));
        resolve(latestUserLatLng);
      }, () => {
        if (statusSelector) $(statusSelector).textContent = locationStatusText("unavailable");
        reject(new Error("gps-failed"));
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
    });
  }

  function syncUserLocationLayers(targetMap, kind = "records") {
    if (!targetMap || !latestUserLatLng) return;
    const layer = userLayers[kind];
    if (!layer.marker) layer.marker = L.circleMarker(latestUserLatLng, {radius:8,color:"#0b57d0",weight:3,fillColor:"#2f8cff",fillOpacity:.85}).addTo(targetMap);
    else if (!targetMap.hasLayer(layer.marker)) layer.marker.addTo(targetMap);
    layer.marker.setLatLng(latestUserLatLng);
    if (Number.isFinite(latestUserAccuracy)) {
      if (!layer.circle) layer.circle = L.circle(latestUserLatLng,{radius:latestUserAccuracy,color:"#2f8cff",weight:1,fillOpacity:.08}).addTo(targetMap);
      else if (!targetMap.hasLayer(layer.circle)) layer.circle.addTo(targetMap);
      layer.circle.setLatLng(latestUserLatLng).setRadius(latestUserAccuracy);
    }
    setLocationStatus(locationStatusText("active"));
  }

  function cleanupUserLayers(kind){ const map= kind==='records'?recordsMap:workingMap; const l=userLayers[kind]; if(!map||!l) return; [l.marker,l.circle,l.heading].forEach((x)=>{ if(x&&map.hasLayer(x)) map.removeLayer(x); }); }

  function navigateTo(lat, lon) {
    const pos = toLatLon(lat, lon);
    if (!pos) return alert("Brak poprawnych współrzędnych GPS.");
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${pos[0]},${pos[1]}`, "_blank", "noopener");
  }

  function showReadonlyRecord(uid) {
    const record = getEntries().find((entry) => String(entry.uid) === String(uid));
    if (!record) return;
    readonlyUid = record.uid;
    const nestPos = toLatLon(record.lat, record.lon);
    const randomPos = toLatLon(record.randomMicro?.lat, record.randomMicro?.lon);
    $("#readonly-nav-random").hidden = !randomPos;
    $("#readonly-nav-random").disabled = !randomPos;
    $("#readonly-nav-nest").disabled = !nestPos;
    $("#record-readonly-content").innerHTML = buildReadonlySections(record);
    initReadonlyCarousel();
    showView("readonly");
  }

  function buildReadonlySections(record) {
    const val = (v) => (v == null || String(v).trim() === "" ? "—" : String(v));
    const fld = (label, v) => `<div class="readonly-field"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(val(v))}</div></div>`;
    const photoGrid = (photos, alt) => `<div class="readonly-photo-grid">${(photos || []).map((p)=>`<img src="" data-photo-ref="${escapeHtml(p.dataUrl || p)}" class="readonly-thumb" alt="${alt}">`).join("") || "<p>—</p>"}</div>`;
    const sections = [
      ["Identyfikacja", `${fld("ID gniazda", record.nestId)}${fld("Gatunek", LABELS.species[record.species] || record.species)}${fld("Data", record.obsDate)}${fld("Godzina", record.obsTime)}${fld("Obserwator", record.observer)}${fld("Sektor", record.sector)}${fld("Liczba jaj", record.eggCount)}`],
      ["GPS i zdjęcia gniazda", `${fld("Lat", record.lat)}${fld("Lon", record.lon)}${fld("Dokładność [m]", record.gpsAccuracyM)}${photoGrid(record.nestMicro?.photos, "Zdjęcie gniazda")}`],
      ["Mikrohabitat gniazda", `${fld("Podłoże", LABELS.substrate[record.nestMicro?.substrate] || record.nestMicro?.substrate)}${fld("Piasek [%]", record.nestMicro?.coverage?.pctSand)}${fld("Drobny żwir [%]", record.nestMicro?.coverage?.pctFineGravel)}${fld("Gruby żwir/kamienie [%]", record.nestMicro?.coverage?.pctCoarse)}${fld("Muszle [%]", record.nestMicro?.coverage?.pctShells)}${fld("Roślinność żywa [%]", record.nestMicro?.coverage?.pctLiveVeg)}${fld("Roślinność sucha [%]", record.nestMicro?.coverage?.pctDryVeg)}${fld("Drewno/szczątki [%]", record.nestMicro?.coverage?.pctOrganic)}${fld("Antropogeniczne [%]", record.nestMicro?.coverage?.pctAnthro)}${fld("Suma pokrycia [%]", coverageSum(record.nestMicro?.coverage||{}))}${fld("Odległość do rośliny [cm]", record.nestMicro?.distPlantCm)}${fld("Wysokość rośliny [cm]", record.nestMicro?.heightPlantCm)}${fld("Odległość do obiektu [cm]", record.nestMicro?.distObjectCm)}${fld("Wysokość obiektu [cm]", record.nestMicro?.heightObjectCm)}${fld("Nachylenie", LABELS.slope[record.nestMicro?.slope] || record.nestMicro?.slope)}${fld("Mikrorzeźba", LABELS.microrelief[record.nestMicro?.microrelief] || record.nestMicro?.microrelief)}`],
      ["Mezohabitat", `${Object.entries(record.meso||{}).filter(([k])=>k.startsWith("pct")).map(([k,v])=>fld(`Pokrycie ${k}` ,v)).join("")}${fld("Suma pokrycia [%]", Object.entries(record.meso||{}).filter(([k])=>k.startsWith("pct")).reduce((a,[,v])=>a+(Number(v)||0),0))}${fld("Sposób oceny buforu", LABELS.assessmentMethod?.[record.meso?.assessmentMethod] || record.meso?.assessmentMethod)}${fld("Odległość do wody [m]", record.meso?.distWaterM)}${fld("Odległość do krawędzi roślinności [m]", record.meso?.distVegEdgeM)}${fld("Odległość do wysokiego obiektu [m]", record.meso?.distVerticalStructureM)}${fld("Duże obiekty w 15 m", LABELS.yesNoUnknown?.[record.meso?.bigObjects] || record.meso?.bigObjects)}${fld("Odległość do płatu drobnego żwiru [m]", record.meso?.distFineGravelPatchM)}${fld("Odległość do płatu grubszego żwiru [m]", record.meso?.distCoarseGravelPatchM)}${fld("Odległość do najbliższego gniazda obrożnej [m]", record.meso?.distNearestHiaticulaM)}${fld("Odległość do najbliższego gniazda rzecznej [m]", record.meso?.distNearestDubiusM)}${fld("Uwagi przestrzenne", record.meso?.spatialNotes)}`],
      ["Punkt losowy / kontrola", `${fld("Azymut [°]", record.randomMicro?.azimuthDeg)}${fld("Ponowne losowanie", LABELS.yesNoUnknown[record.randomMicro?.wasRerolled] || record.randomMicro?.wasRerolled)}${fld("Powód ponownego losowania", record.randomMicro?.rerollReason)}${fld("GPS kontroli lat", record.randomMicro?.lat)}${fld("GPS kontroli lon", record.randomMicro?.lon)}${fld("Dokładność GPS kontroli [m]", record.randomMicro?.gpsAccuracyM)}`],
      ["Mikrohabitat kontroli", `${fld("Podłoże", LABELS.substrate[record.randomMicro?.substrate] || record.randomMicro?.substrate)}${fld("Piasek [%]", record.randomMicro?.coverage?.pctSand)}${fld("Drobny żwir [%]", record.randomMicro?.coverage?.pctFineGravel)}${fld("Gruby żwir/kamienie [%]", record.randomMicro?.coverage?.pctCoarse)}${fld("Muszle [%]", record.randomMicro?.coverage?.pctShells)}${fld("Roślinność żywa [%]", record.randomMicro?.coverage?.pctLiveVeg)}${fld("Roślinność sucha [%]", record.randomMicro?.coverage?.pctDryVeg)}${fld("Drewno/szczątki [%]", record.randomMicro?.coverage?.pctOrganic)}${fld("Antropogeniczne [%]", record.randomMicro?.coverage?.pctAnthro)}${fld("Suma pokrycia [%]", coverageSum(record.randomMicro?.coverage||{}))}${fld("Odległość do rośliny [cm]", record.randomMicro?.distPlantCm)}${fld("Wysokość rośliny [cm]", record.randomMicro?.heightPlantCm)}${fld("Odległość do obiektu [cm]", record.randomMicro?.distObjectCm)}${fld("Wysokość obiektu [cm]", record.randomMicro?.heightObjectCm)}${fld("Nachylenie", LABELS.slope[record.randomMicro?.slope] || record.randomMicro?.slope)}${fld("Mikrorzeźba", LABELS.microrelief[record.randomMicro?.microrelief] || record.randomMicro?.microrelief)}${photoGrid(record.randomMicro?.photos, "Zdjęcie kontroli")}`],
      ["Kontrola jakości", `${fld("Zdjęcie dokumentacyjne", LABELS.yesNoUnknown[record.docPhotoDone] || record.docPhotoDone)}${fld("Zdjęcie 1m²", LABELS.yesNoUnknown[record.nestOneMPhotoDone] || record.nestOneMPhotoDone)}${fld("Punkt losowy", LABELS.yesNoUnknown[record.randomPointDone] || record.randomPointDone)}`],
      ["Notatki / podsumowanie", `${fld("Notatki", record.notes)}${fld("Notatki identyfikacja", record.moduleNotes?.identification)}${fld("Notatki mikro gniazda", record.moduleNotes?.nestMicro)}${fld("Notatki mikro kontroli", record.moduleNotes?.randomMicro)}${fld("Notatki mezohabitat", record.moduleNotes?.meso)}`]
    ];
    return `<div class="readonly-carousel">${sections.map(([title, html], i) => `<section class="readonly-section${i===0?" active":""}"><h3>${title}</h3>${html}</section>`).join("")}</div><div class="readonly-nav"><button type="button" id="readonly-prev-section">Poprzednia karta</button><button type="button" id="readonly-next-section">Następna karta</button></div>`;
  }
  function initReadonlyCarousel() { let i = 0; const secs = $$("#record-readonly-content .readonly-section"); const set = (n) => { i=(n+secs.length)%secs.length; secs.forEach((s,idx)=>s.classList.toggle("active",idx===i)); }; $("#readonly-prev-section")?.addEventListener("click",()=>set(i-1)); $("#readonly-next-section")?.addEventListener("click",()=>set(i+1)); let sx=0; const wrap=$("#record-readonly-content .readonly-carousel"); wrap?.addEventListener("touchstart",(e)=>{sx=e.changedTouches[0].screenX;},{passive:true}); wrap?.addEventListener("touchend",(e)=>{const dx=e.changedTouches[0].screenX-sx; if (Math.abs(dx)>40) set(i+(dx<0?1:-1));},{passive:true}); $$("#record-readonly-content img[data-photo-ref]").forEach((img)=>{ resolvePhotoSrc(img.dataset.photoRef).then((src)=>{ if(src) img.src=src; });}); $("#record-readonly-content").addEventListener("click",(e)=>{ const img=e.target.closest("img[data-photo-ref]"); if(img?.src) window.open(img.src,"_blank","noopener");}); }

  function renderRecordsMap(focusUid = null) {
    const mapEl = $("#records-map");
    if (!mapEl || typeof L === "undefined") { $("#map-info").textContent = "Mapa niedostępna offline (brak biblioteki Leaflet)."; return; }
    if (!recordsMap) {
      const base = createBaseLayers();
      recordsMap = L.map(mapEl, { layers: [base.defaultLayer] });
      recordsMap.attributionControl.setPrefix("");
      L.control.layers(base.layers).addTo(recordsMap);
      mapMarkersLayer = L.layerGroup().addTo(recordsMap);
    }
    mapMarkersLayer.clearLayers();
    const entries = getEntries();
    const points = [];
    let missingNest = 0, missingCtrl = 0;
    entries.forEach((entry) => {
      const nestPos = toLatLon(entry.lat, entry.lon);
      const ctrlPos = toLatLon(entry.randomMicro?.lat, entry.randomMicro?.lon);
      if (nestPos) points.push({entry, pos:nestPos, type:"gniazdo"}); else missingNest++;
      if (ctrlPos) points.push({entry, pos:ctrlPos, type:"kontrola"}); else missingCtrl++;
    });
    points.forEach((p)=>{
      const icon = L.divIcon({className:`map-marker ${p.type}`, html:`<div class="pin"><span>${p.type==='gniazdo'?'G':'K'}</span></div>`});
      const m = L.marker(p.pos,{icon}).addTo(mapMarkersLayer);
      const e=p.entry;
      m.bindPopup(`<strong>${escapeHtml(e.nestId||'(bez ID)')}</strong><br>${escapeHtml(LABELS.species[e.species]||e.species||'-')}<br>${escapeHtml(e.obsDate||'-')} • ${escapeHtml(e.observer||'-')}<br>Sektor: ${escapeHtml(e.sector||'-')}<br>Typ punktu: ${p.type}<br>Współrzędne: ${p.pos[0]}, ${p.pos[1]}<br><button data-map-action='view' data-uid='${e.uid}'>Zobacz rekord</button> <button data-map-action='edit' data-uid='${e.uid}'>Edytuj</button> <button data-map-action='delete' data-uid='${e.uid}'>Usuń</button> <button data-map-action='nav' data-lat='${p.pos[0]}' data-lon='${p.pos[1]}'>Nawiguj</button>`);
      if (focusUid && String(e.uid)===String(focusUid)) m.openPopup();
    });
    if (focusUid) {
      const focusRecord = entries.find((e) => String(e.uid) === String(focusUid));
      const focusNest = toLatLon(focusRecord?.lat, focusRecord?.lon);
      const focusCtrl = toLatLon(focusRecord?.randomMicro?.lat, focusRecord?.randomMicro?.lon);
      const focusPos = focusNest || focusCtrl;
      if (focusPos) recordsMap.setView(focusPos, 18);
      else $("#map-info").textContent = "Wybrany rekord nie ma poprawnych współrzędnych GPS.";
    }
    if (!points.length) {$("#map-info").textContent="Brak zapisanych punktów z GPS do pokazania na mapie."; recordsMap.setView([52,19],6);}
    $("#map-info").textContent = `Punkty: ${points.length}. Brak GPS gniazda: ${missingNest}. Brak GPS kontroli: ${missingCtrl}.`;
    if (points.length) recordsMap.fitBounds(L.latLngBounds(points.map((p)=>p.pos)), {padding:[30,30]});
    recordsMap.invalidateSize();
    ensureUserLocationTracking(points, focusUid); syncUserLocationLayers(recordsMap,"records");
  }

  function ensureUserLocationTracking(points, focusUid) {
    if (!navigator.geolocation || !recordsMap) { setLocationStatus(locationStatusText("unavailable")); return; }
    if (mapUserWatchId == null) {
      mapUserWatchId = navigator.geolocation.watchPosition(({coords}) => {
        latestUserLatLng = [coords.latitude, coords.longitude];
        latestUserAccuracy = coords.accuracy;
        setLocationStatus(locationStatusText("active"));
        syncUserLocationLayers(recordsMap,"records");
        syncUserLocationLayers(workingMap,"working");
        renderMapHeading("records");
        renderMapHeading("working");
        if (!mapHasAutoCenteredOnUser && !focusUid) { recordsMap.setView(latestUserLatLng, 17); mapHasAutoCenteredOnUser = true; }
      }, () => { setLocationStatus(locationStatusText("unavailable")); if (!points.length) $("#map-info").textContent = "Brak zapisanych punktów z GPS do pokazania na mapie."; }, {enableHighAccuracy:true, maximumAge:10000, timeout:12000});
    } else setLocationStatus(latestUserLatLng ? locationStatusText("active") : locationStatusText("waiting"));
  }
  function renderMapHeading(kind = "records") {
    const map = kind==="records"?recordsMap:workingMap;
    if (!map || !latestUserLatLng || !Number.isFinite(latestMapHeadingDeg) || !mapHeadingEnabled) return;
    const layer = userLayers[kind];
    if (!layer.heading) layer.heading = L.marker(latestUserLatLng,{icon:L.divIcon({className:"map-heading", html:"<div>▲</div>"}),zIndexOffset:900}).addTo(map);
    else { if(!map.hasLayer(layer.heading)) layer.heading.addTo(map); layer.heading.setLatLng(latestUserLatLng); }
    const arrow = layer.heading.getElement()?.querySelector("div");
    if (arrow) arrow.style.transform = `rotate(${latestMapHeadingDeg}deg)`;
  }

  function setupGps() {
    const getGps = (latSelector, lonSelector, accSelector, statusSelector, label) => {
      const status = $(statusSelector);
      if (!navigator.geolocation) {
        if (status) status.textContent = `${label}: GPS niedostępny`;
        return;
      }
      if (status) status.textContent = `${label}: pobieranie...`;
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setValue(latSelector, coords.latitude.toFixed(6));
          setValue(lonSelector, coords.longitude.toFixed(6));
          setValue(accSelector, Math.round(coords.accuracy));
          if (status) status.textContent = `${label}: dokładność ±${Math.round(coords.accuracy)} m (${gpsQuality(coords.accuracy)})`;
        },
        () => {
          if (status) status.textContent = `${label}: błąd pobierania`;
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    };
    $("#gps-btn").addEventListener("click", () => getGps("#lat", "#lon", "#gps-accuracy", "#gps-status", "GPS gniazda"));
    $("#random-gps-btn").addEventListener("click", () => getGps("#random-lat", "#random-lon", "#random-gps-accuracy", "#random-gps-status", "GPS punktu"));
  }

  function gpsQuality(acc) {
    if (acc <= 5) return "dobry";
    if (acc <= 10) return "średni";
    return "słaby";
  }

  function setupNavigation() {
    $("#home-shortcut").addEventListener("click", () => showView("home"));
    $$(".back-home").forEach((btn) => btn.addEventListener("click", () => showView("home")));
    $("#start-new").addEventListener("click", () => { editReturnToReadonly = false; startNewRecord(); });
    $("#open-records").addEventListener("click", () => {
      renderEntries();
      showView("records");
    });
    $("#open-map").addEventListener("click", () => { mapFocusUid = null; showView("map"); });
    $("#open-working-map").addEventListener("click", () => showView("working-map"));
    $("#records-show-map").addEventListener("click", () => { mapFocusUid = null; showView("map"); });
    $("#step-back").addEventListener("click", () => showStep(currentStep - 1));
    $("#step-next").addEventListener("click", () => showStep(currentStep + 1));
    $("#save-final").addEventListener("click", () => saveFinalRecord().catch((error) => {
      console.error(error);
      alert(`Zapis nie powiódł się: ${error.message || error}`);
    }));
    $("#save-draft").addEventListener("click", saveDraft);
    $("#cancel-edit").addEventListener("click", () => {
      resetForm();
      showView("records");
    });
    $("#random-azimuth-btn").addEventListener("click", () => setValue("#random-azimuth", String(Math.floor(Math.random() * 360))));
    $("#record-search").addEventListener("input", renderEntries);
    $("#entries-list").addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (btn) {
        event.stopPropagation();
        if (btn.dataset.action === "edit") editRecord(btn.dataset.uid);
        if (btn.dataset.action === "delete") deleteRecord(btn.dataset.uid);
        return;
      }
      const card = event.target.closest(".entry-card");
      if (card?.dataset.uid) showReadonlyRecord(card.dataset.uid);
    });
    $("#readonly-back, #readonly-back-btn").addEventListener("click", () => showView("records"));
    $("#readonly-edit").addEventListener("click", () => { editReturnToReadonly = true; readonlyUid && editRecord(readonlyUid); });
    $("#readonly-delete").addEventListener("click", () => { if (readonlyUid) { deleteRecord(readonlyUid); showView("records"); } });
    $("#readonly-nav-nest").addEventListener("click", () => { const r=getEntries().find((e)=>String(e.uid)===String(readonlyUid)); if (r) navigateTo(r.lat,r.lon); });
    $("#readonly-nav-random").addEventListener("click", () => { const r=getEntries().find((e)=>String(e.uid)===String(readonlyUid)); if (r) navigateTo(r.randomMicro?.lat,r.randomMicro?.lon); });
    $("#readonly-show-map").addEventListener("click", () => { mapFocusUid = readonlyUid; showView("map"); });
    $("#map-back").addEventListener("click", () => showView("records"));
    $("#map-center-user").addEventListener("click", () => {
      if (!latestUserLatLng) return alert("Twoja pozycja jest jeszcze niedostępna.");
      recordsMap?.setView(latestUserLatLng, 17);
    });
    $("#map-enable-heading").addEventListener("click", async () => {
      const statusEl = $("#map-user-status");
      const onOrientation = (event) => {
        let heading = null;
        if (typeof event.webkitCompassHeading === "number") heading = event.webkitCompassHeading;
        else if (event.absolute === true && typeof event.alpha === "number") heading = event.alpha;
        else if (typeof event.alpha === "number") heading = 360 - event.alpha;
        if (Number.isFinite(heading)) {
          const normalized = ((heading % 360) + 360) % 360;
          if (latestMapHeadingDeg != null && Math.abs(normalized - latestMapHeadingDeg) < 3) return;
          latestMapHeadingDeg = latestMapHeadingDeg == null ? normalized : (latestMapHeadingDeg * 0.7 + normalized * 0.3);
          requestAnimationFrame(renderMapHeading);
          setLocationStatus("Moja pozycja: aktywna (kierunek włączony)");
        }
      };
      if (!("DeviceOrientationEvent" in window)) return alert("Kierunek niedostępny na tym urządzeniu lub w tej przeglądarce.");
      if (mapHeadingEnabled) {
        mapHeadingEnabled = false;
        $("#map-enable-heading").textContent = "Włącz kierunek"; $("#working-enable-heading").textContent = "Włącz kierunek";
        cleanupUserLayers("records"); cleanupUserLayers("working"); syncUserLocationLayers(recordsMap,"records"); syncUserLocationLayers(workingMap,"working");
        return;
      }
      if (!mapHeadingEnabled) {
        const req = window.DeviceOrientationEvent?.requestPermission;
        if (typeof req === "function") {
          const permission = await req.call(window.DeviceOrientationEvent);
          if (permission !== "granted") return alert("Kierunek niedostępny na tym urządzeniu lub w tej przeglądarce.");
        }
        window.addEventListener("deviceorientationabsolute", onOrientation, true);
        window.addEventListener("deviceorientation", onOrientation, true);
        mapHeadingEnabled = true;
        $("#map-enable-heading").textContent = "Wyłącz kierunek"; $("#working-enable-heading").textContent = "Wyłącz kierunek";
        alert("Porusz telefonem ósemką, aby skalibrować kompas.");
      }
    });
    $("#map-screen").addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-map-action]");
      if (!btn) return;
      const action = btn.dataset.mapAction;
      if (action === "view") showReadonlyRecord(btn.dataset.uid);
      if (action === "edit") editRecord(btn.dataset.uid);
      if (action === "delete") deleteRecord(btn.dataset.uid);
      if (action === "nav") navigateTo(btn.dataset.lat, btn.dataset.lon);
    });

    $("#nest-photos").addEventListener("change", () => {
      setValue("#nest-one-m-photo-done", "yes");
      renderPhotoPreviews();
    });
    $("#random-photos").addEventListener("change", () => {
      setValue("#random-point-done", "yes");
      setValue("#doc-photo-done", "yes");
      renderPhotoPreviews();
    });
    $("#validation-override-summary")?.addEventListener("change", () => renderValidationAndPreview());
    $("#working-map-back").addEventListener("click", () => showView("home"));
    $("#working-add-gps").addEventListener("click", addWorkingNestFromGps);
    $("#working-center-user").addEventListener("click", async () => {
      try {
        await showMyLocationOnMap(workingMap, "#working-user-status");
        syncUserLocationLayers(workingMap,"working");
        workingMap?.setView(latestUserLatLng, 17);
      } catch {
        alert("Nie udało się pobrać mojej pozycji. Sprawdź uprawnienia lokalizacji.");
      }
    });
    $("#working-fit").addEventListener("click", () => fitWorkingMapBounds());
    $("#working-enable-heading").addEventListener("click", () => $("#map-enable-heading")?.click());
    $("#working-show-map").addEventListener("click",()=>{workingViewMode="map";renderWorkingMap();});
    $("#working-show-list").addEventListener("click",()=>{workingViewMode="list";renderWorkingMap();});
    $("#working-nearest").addEventListener("click",()=>{workingViewMode="list";renderWorkingMap(true);});
    $("#working-list").addEventListener("click", onWorkingListClick);
    $("#working-list").addEventListener("change", onWorkingListClick);
    $("#working-map-screen").addEventListener("click", onWorkingListClick);
    $("#working-map-screen").addEventListener("change", onWorkingListClick);
    $("#back-to-readonly")?.addEventListener("click", () => {
      if (readonlyUid) showReadonlyRecord(readonlyUid);
    });

  }

  function setupCompass() {
    const statusEl = $("#compass-status");
    const degEl = $("#compass-deg");
    const dirEl = $("#compass-dir");
    const arrowEl = $("#compass-arrow");
    const enableBtn = $("#compass-enable-btn");
    if (!statusEl || !degEl || !dirEl || !arrowEl) return;

    const toDir = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
    const normalize = (deg) => ((deg % 360) + 360) % 360;
    let gotData = false;
    let started = false;
    let timeoutId = null;
    const render = (deg) => {
      const n = normalize(deg);
      gotData = true;
      degEl.textContent = `${Math.round(n)}°`;
      dirEl.textContent = toDir(n);
      arrowEl.style.transform = `rotate(${n}deg)`;
      statusEl.textContent = "Kompas aktywny.";
    };

    const onOrientation = (event) => {
      let heading = null;
      if (typeof event.webkitCompassHeading === "number") heading = event.webkitCompassHeading;
      else if (event.absolute === true && typeof event.alpha === "number") heading = event.alpha;
      else if (typeof event.alpha === "number") heading = 360 - event.alpha;
      if (typeof heading === "number" && Number.isFinite(heading)) render(heading);
    };

    const start = () => {
      if (started) return;
      started = true;
      gotData = false;
      window.addEventListener("deviceorientationabsolute", onOrientation, true);
      window.addEventListener("deviceorientation", onOrientation, true);
      statusEl.textContent = "Kompas: oczekuję na dane z kompasu...";
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!gotData) {
          statusEl.textContent = "Brak danych z kompasu. Sprawdź, czy przeglądarka ma dostęp do czujników ruchu/orientacji i czy urządzenie ma magnetometr.";
        }
      }, 7000);
    };

    const hasApi = "DeviceOrientationEvent" in window;
    if (!hasApi) {
      statusEl.textContent = "Kompas niedostępny w tej przeglądarce lub na tym urządzeniu.";
      enableBtn.disabled = true;
      return;
    }
    statusEl.textContent = "Kompas gotowy. Kliknij „Uruchom kompas”.";
    enableBtn.addEventListener("click", async () => {
      const requestPermission = window.DeviceOrientationEvent?.requestPermission;
      if (typeof requestPermission === "function") {
        try {
          const permission = await requestPermission.call(window.DeviceOrientationEvent);
          if (permission !== "granted") {
            statusEl.textContent = "Kompas niedostępny bez zgody użytkownika.";
            return;
          }
        } catch {
          statusEl.textContent = "Kompas niedostępny w tej przeglądarce lub na tym urządzeniu.";
          return;
        }
      }
      start();
    });
  }

  function setupExports() {
    $("#export-json").addEventListener("click", () => {
      downloadText(`sieweczka-records-${dateStamp()}.json`, JSON.stringify(getEntries(), null, 2), "application/json");
    });
    $("#export-csv").addEventListener("click", () => {
      downloadText(`sieweczka-records-${dateStamp()}.csv`, buildCsv(getEntries()), "text/csv;charset=utf-8");
    });
    $("#export-zip").addEventListener("click", exportZip);
  }

  function flattenEntry(entry) {
    return {
      uid: entry.uid,
      protocolVersion: entry.protocolVersion,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      nestId: entry.nestId,
      season: entry.season,
      obsDate: entry.obsDate,
      obsTime: entry.obsTime,
      observer: entry.observer,
      species: entry.species,
      sector: entry.sector,
      lat: entry.lat,
      lon: entry.lon,
      gpsAccuracyM: entry.gpsAccuracyM,
      nestStatus: entry.nestStatus,
      eggCount: entry.eggCount,
      possibleRenest: entry.possibleRenest,
      docPhotoDone: entry.docPhotoDone,
      nestOneMPhotoDone: entry.nestOneMPhotoDone,
      randomPointDone: entry.randomPointDone,

      nestSubstrate: entry.nestMicro?.substrate,
      nestPctSand: entry.nestMicro?.coverage?.pctSand,
      nestPctFineGravel: entry.nestMicro?.coverage?.pctFineGravel,
      nestPctCoarse: entry.nestMicro?.coverage?.pctCoarse,
      nestPctShells: entry.nestMicro?.coverage?.pctShells,
      nestPctLiveVeg: entry.nestMicro?.coverage?.pctLiveVeg,
      nestPctDryVeg: entry.nestMicro?.coverage?.pctDryVeg,
      nestPctOrganic: entry.nestMicro?.coverage?.pctOrganic,
      nestPctAnthro: entry.nestMicro?.coverage?.pctAnthro,
      nestDistPlantCm: entry.nestMicro?.distPlantCm,
      nestHeightPlantCm: entry.nestMicro?.heightPlantCm,
      nestDistObjectCm: entry.nestMicro?.distObjectCm,
      nestHeightObjectCm: entry.nestMicro?.heightObjectCm,
      nestSlope: entry.nestMicro?.slope,
      nestMicrorelief: entry.nestMicro?.microrelief,
      nestPhotoCount: entry.nestMicro?.photos?.length || 0,

      randomAzimuthDeg: entry.randomMicro?.azimuthDeg,
      randomWasRerolled: entry.randomMicro?.wasRerolled,
      randomRerollReason: entry.randomMicro?.rerollReason,
      randomLat: entry.randomMicro?.lat,
      randomLon: entry.randomMicro?.lon,
      randomGpsAccuracyM: entry.randomMicro?.gpsAccuracyM,
      randomSubstrate: entry.randomMicro?.substrate,
      randomPctSand: entry.randomMicro?.coverage?.pctSand,
      randomPctFineGravel: entry.randomMicro?.coverage?.pctFineGravel,
      randomPctCoarse: entry.randomMicro?.coverage?.pctCoarse,
      randomPctShells: entry.randomMicro?.coverage?.pctShells,
      randomPctLiveVeg: entry.randomMicro?.coverage?.pctLiveVeg,
      randomPctDryVeg: entry.randomMicro?.coverage?.pctDryVeg,
      randomPctOrganic: entry.randomMicro?.coverage?.pctOrganic,
      randomPctAnthro: entry.randomMicro?.coverage?.pctAnthro,
      randomDistPlantCm: entry.randomMicro?.distPlantCm,
      randomHeightPlantCm: entry.randomMicro?.heightPlantCm,
      randomDistObjectCm: entry.randomMicro?.distObjectCm,
      randomHeightObjectCm: entry.randomMicro?.heightObjectCm,
      randomSlope: entry.randomMicro?.slope,
      randomMicrorelief: entry.randomMicro?.microrelief,
      randomPhotoCount: entry.randomMicro?.photos?.length || 0,

      mesoPctSand: entry.meso?.pctSand,
      mesoPctGravel: entry.meso?.pctGravel,
      mesoPctVegetation: entry.meso?.pctVegetation,
      mesoPctWater: entry.meso?.pctWater,
      mesoPctOther: entry.meso?.pctOther,
      mesoAssessmentMethod: entry.meso?.assessmentMethod,
      distWaterM: entry.meso?.distWaterM,
      distVegEdgeM: entry.meso?.distVegEdgeM,
      distVerticalStructureM: entry.meso?.distVerticalStructureM,
      distNearestHiaticulaM: entry.meso?.distNearestHiaticulaM,
      distNearestDubiusM: entry.meso?.distNearestDubiusM,
      mesoBigObjects: entry.meso?.bigObjects,
      distFineGravelPatchM: entry.meso?.distFineGravelPatchM,
      distCoarseGravelPatchM: entry.meso?.distCoarseGravelPatchM,
      mesoSpatialNotes: entry.meso?.spatialNotes,

      qcBirdReaction: entry.qualityControl?.birdReaction,
      qcTimeAtNest: entry.qualityControl?.timeAtNest,
      qcAborted: entry.qualityControl?.aborted,
      qcTracksVisible: entry.qualityControl?.tracksVisible,
      qcTracksNotes: entry.qualityControl?.tracksNotes,

      notesIdentification: entry.moduleNotes?.identification,
      notesNestMicro: entry.moduleNotes?.nestMicro,
      notesRandomMicro: entry.moduleNotes?.randomMicro,
      notesMeso: entry.moduleNotes?.meso,
      notes: entry.notes,
    };
  }

  function buildCsv(entries) {
    const rows = entries.map(flattenEntry);
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const escape = (cell) => {
      const text = cell == null ? "" : String(cell);
      return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return [headers.join(";"), ...rows.map((row) => headers.map((header) => escape(row[header])).join(";"))].join("\n");
  }

  async function exportZip() {
    const entries = getEntries();
    if (!window.JSZip) {
      alert("Biblioteka ZIP nie jest dostępna. Eksportuję CSV i JSON osobno.");
      downloadText(`sieweczka-records-${dateStamp()}.csv`, buildCsv(entries), "text/csv;charset=utf-8");
      downloadText(`sieweczka-records-${dateStamp()}.json`, JSON.stringify(entries, null, 2), "application/json");
      return;
    }
    const zip = new JSZip();
    zip.file("records.csv", buildCsv(entries));
    zip.file("records.json", JSON.stringify(entries, null, 2));
    const photos = zip.folder("photos");

    for (const entry of entries) {
      const nestPhotos = entry.nestMicro?.photos || [];
      const randomPhotos = entry.randomMicro?.photos || [];
      let i = 1;
      for (const ref of nestPhotos) {
        const blob = await getPhotoBlob(ref);
        if (blob) photos.file(`${safeFile(entry.nestId)}_nest_${String(i++).padStart(2, "0")}.jpg`, blob);
      }
      i = 1;
      for (const ref of randomPhotos) {
        const blob = await getPhotoBlob(ref);
        if (blob) photos.file(`${safeFile(entry.nestId)}_random_${String(i++).padStart(2, "0")}.jpg`, blob);
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`sieweczka-export-${dateStamp()}.zip`, blob);
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  }

  function safeFile(name) {
    return String(name || "record").replace(/[^\p{L}\p{N}_-]+/gu, "_");
  }

  function downloadText(filename, text, type) {
    downloadBlob(filename, new Blob([text], { type }));
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getWorkingNests() { try { const v = JSON.parse(localStorage.getItem(WORKING_NESTS_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
  function saveWorkingNests(items) { localStorage.setItem(WORKING_NESTS_KEY, JSON.stringify(items)); }
  function fitWorkingMapBounds() {
    const points = getWorkingNests().map((w) => toLatLon(w.lat, w.lon)).filter(Boolean);
    if (points.length) workingMap?.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
    else if (latestUserLatLng) workingMap?.setView(latestUserLatLng, 17);
    else workingMap?.setView([52, 19], 6);
  }
  function getCurrentPositionAsync(options = { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("gps-unavailable"));
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function addWorkingNestFromCurrentGps() {
    try {
      const { coords } = await getCurrentPositionAsync();
      const lat = Number(coords.latitude); const lon = Number(coords.longitude);
      if (!hasValidCoords(lat, lon)) throw new Error("invalid-coords");
      const pos = [Number(lat.toFixed(6)), Number(lon.toFixed(6))];
      latestUserLatLng = pos; latestUserAccuracy = coords.accuracy;
      const items = getWorkingNests();
      const nearest = items.map((i) => ({ item: i, p: toLatLon(i.lat, i.lon) })).filter((x) => x.p).map((x) => ({ item: x.item, dist: distanceM(pos, x.p) })).sort((a, b) => a.dist - b.dist)[0];
      if (nearest && nearest.dist <= 20) {
        const msg = `W pobliżu jest już gniazdo robocze ${nearest.item.label || "—"}, odległość ${Math.round(nearest.dist)} m. Czy mimo to dodać nowy punkt?`;
        if (confirm(msg)) {
          // add anyway
        } else {
          if (confirm("Pokaż istniejące? (Anuluj = całkowite anulowanie)")) {
            workingViewMode = "map"; workingFocusId = nearest.item.id; renderWorkingMap();
          }
          return;
        }
      }
      const label = nextWorkingLabel(items);
      const point = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        label,
        createdAt: new Date().toISOString(),
        lat: pos[0], lon: pos[1],
        accuracy: Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : null,
        note: "",
        status: "do_sprawdzenia",
      };
      saveWorkingNests([point, ...items]);
      workingFocusId = point.id;
      renderWorkingMap();
      alert(`Dodano gniazdo robocze ${label}.`);
    } catch {
      alert("Nie udało się pobrać GPS. Sprawdź uprawnienia lokalizacji.");
    }
  }

  function addWorkingNestFromGps() { addWorkingNestFromCurrentGps(); }

  function onWorkingListClick(event) {
    const control = event.target.closest("button[data-w-action], select[data-w-action]"); if (!control) return;
    const items=getWorkingNests();
    const item = items.find((x) => String(x.id) === String(control.dataset.id)); if (!item) return;
    if (control.dataset.wAction === "show") { workingViewMode='map'; workingFocusId=item.id; renderWorkingMap(); }
    if (control.dataset.wAction === "nav") navigateTo(item.lat, item.lon);
    if (control.dataset.wAction === "delete" && confirm("Usunąć punkt roboczy?")) { saveWorkingNests(items.filter((x) => String(x.id) !== String(item.id))); renderWorkingMap(); }
    if (control.dataset.wAction === "status") { item.status=control.value; saveWorkingNests(items); renderWorkingMap(); }
    if (control.dataset.wAction === "edit") { item.note=prompt("Notatka", item.note||"") ?? item.note; const st=prompt("Status: do_sprawdzenia/prawdopodobne/potwierdzone/odrzucone/przepisane", item.status||"do_sprawdzenia"); if(st) item.status=st; saveWorkingNests(items); renderWorkingMap(); }
  }
  function renderWorkingMap(showNearest = false) {
    const mapEl = $("#working-map"); if (!mapEl || typeof L === "undefined") return;
    if (!workingMap) {
      const base = createBaseLayers();
      workingMap = L.map(mapEl, { layers: [base.defaultLayer] });
      workingMap.attributionControl.setPrefix("");
      L.control.layers(base.layers).addTo(workingMap);
      workingLayer = L.layerGroup().addTo(workingMap);
    }
    workingLayer.clearLayers();
    const items = getWorkingNests();
    const my=latestUserLatLng; const enriched=items.map((w)=>{ const pos=toLatLon(w.lat,w.lon); const dist=(my&&pos)?distanceM(my,pos):null; const bearing=(my&&pos)?bearingDeg(my,pos):null; return {w,pos,dist,bearing}; }).filter(x=>x.pos).sort((a,b)=>(a.dist??1e12)-(b.dist??1e12));
    enriched.forEach(({w,pos}) => {
      const iconChar = ({do_sprawdzenia:"?",prawdopodobne:"💡",potwierdzone:"📖",odrzucone:"×",przepisane:"💾"})[w.status||"do_sprawdzenia"]||"?"; const m = L.marker(pos, { icon: L.divIcon({ className: `map-marker working ${w.status||'do_sprawdzenia'}`, html: `<div class="pin"><span>${iconChar}</span></div>` }) }).addTo(workingLayer);
      m.bindPopup(`<strong>${escapeHtml(w.label || "—")}</strong><br>Status: ${escapeHtml(workingStatusLabel(w.status))}<br>${pos[0]}, ${pos[1]}<br><button data-w-action='show' data-id='${w.id}'>Pokaż</button> <button data-w-action='nav' data-id='${w.id}'>Nawiguj</button><br><select data-w-action='status' data-id='${w.id}'>${workingStatusOptions(w.status||'do_sprawdzenia')}</select>`);
      if (workingFocusId && w.id===workingFocusId) { workingMap.setView(pos,18); m.openPopup(); }
    });
    $("#working-map-info").textContent = `Punkty robocze: ${enriched.length}`;
    $("#working-list").innerHTML = enriched.map(({w,pos,dist,bearing}) => `<article class="entry-card"><div class="entry-main"><h3>${escapeHtml(w.label || "—")}</h3><p>Status: <span class="status-badge status-${escapeHtml(w.status||'do_sprawdzenia')}">${escapeHtml(workingStatusLabel(w.status))}</span> • ${escapeHtml(w.createdAt || "—")}</p><p class="muted">${pos[0]}, ${pos[1]} • GPS ±${escapeHtml(w.accuracy||'—')} m</p><p class="muted">${dist==null?'Odległość niedostępna — włącz moją pozycję.':`${Math.round(dist)} m • ${bearingLabel(bearing)} / ${Math.round(bearing)}°`}</p>${w.note?`<p>${escapeHtml(w.note)}</p>`:''}</div><div class="entry-actions"><button data-w-action="show" data-id="${w.id}">Pokaż na mapie</button><button data-w-action="nav" data-id="${w.id}">Nawiguj</button><button data-w-action="edit" data-id="${w.id}">Edytuj notatkę</button><button class="danger" data-w-action="delete" data-id="${w.id}">Usuń</button><select data-w-action="status" data-id="${w.id}">${workingStatusOptions(w.status||'do_sprawdzenia')}</select></div></article>`).join("") || `<p class="muted">Brak zapisanych gniazd roboczych.</p>`;
    $("#working-nearest-list").innerHTML = showNearest ? (enriched.slice(0,5).map(({w,dist,bearing})=>`<div>${escapeHtml(w.label)} — ${dist==null?'—':Math.round(dist)+' m'} — ${dist==null?'—':bearingLabel(bearing)} <button data-w-action="show" data-id="${w.id}">Pokaż</button> <button data-w-action="nav" data-id="${w.id}">Nawiguj</button></div>`).join('') || '<p class="muted">Brak danych.</p>') : '';
    $("#working-map-panel").hidden = workingViewMode!=='map'; $("#working-list-panel").hidden = workingViewMode!=='list';
    workingMap.invalidateSize(); if (workingViewMode==='map') { if (!workingFocusId) fitWorkingMapBounds(); syncUserLocationLayers(workingMap,"working");} 
  }

  function setupFieldMode() {
    const key = "sieweczka-field-mode";
    const apply = () => {
      const on = localStorage.getItem(key) === "1";
      document.body.classList.toggle("field-mode", on);
      $("#field-mode-toggle").textContent = on ? "Tryb terenowy: ON" : "Tryb terenowy";
    };
    $("#field-mode-toggle").addEventListener("click", () => {
      localStorage.setItem(key, localStorage.getItem(key) === "1" ? "0" : "1");
      apply();
    });
    apply();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.warn));
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function init() {
    migrateLegacyEntries();
    setupPercentGroups();
    setupTiles();
    setDefaultDateTime();
    setupNestIdAutofill();
    setupSmartLists();
    setupCustomSpecies();
    setupNavigation();
    setupGps();
    setupCompass();
    ["#lat", "#lon", "#species"].forEach((sel) => $(sel)?.addEventListener("change", autoFillNearestDistances));
    ["#dist-nearest-hiaticula", "#dist-nearest-dubius"].forEach((sel) => $(sel)?.addEventListener("input", (event) => { event.target.dataset.manual = "1"; }));
    setupExports();
    setupFieldMode();
    syncTilesFromInputs();
    updatePercentSummaries();
    renderEntries();
    updateCounts();
    showView("home");
    showStep(1);
    registerServiceWorker();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
