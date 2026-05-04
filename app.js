(() => {
  "use strict";

  const STORAGE_KEY = "sieweczka-field-data-v3";
  const LEGACY_STORAGE_KEY = "sieweczka-field-data-v2";
  const DRAFT_KEY = "sieweczka-field-draft-v3";
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
    const normalized = String(speciesValue || "").trim().toLowerCase();
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

  function showView(name) {
    $("#home-screen").hidden = name !== "home";
    $("#records-screen").hidden = name !== "records";
    $("#form-screen").hidden = name !== "form";
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
    if (record.species === "unknown") addWarn(1, "#species", "Gatunek jest nieokreślony.");
    if (record.eggCount == null || Number.isNaN(record.eggCount)) addWarn(1, "#egg-count", "Brakuje liczby jaj.");

    if (record.lat == null || record.lon == null) addWarn(2, "#lat", "Brakuje GPS gniazda.");
    if (record.randomMicro.azimuthDeg == null) addWarn(4, "#random-azimuth", "Brakuje azymutu punktu losowego.");

    const nestSum = coverageSum(record.nestMicro.coverage);
    const randomSum = coverageSum(record.randomMicro.coverage);
    const mesoSum = record.meso.pctSand + record.meso.pctGravel + record.meso.pctVegetation + record.meso.pctWater + record.meso.pctOther;

    if (nestSum < 95 || nestSum > 105) addWarn(3, "#nest-pct-sand", `Mikrohabitat gniazda: suma pokrycia to ${nestSum}%, zalecane ok. 100%.`);
    if (randomSum < 95 || randomSum > 105) addWarn(5, "#random-pct-sand", `Punkt losowy: suma pokrycia to ${randomSum}%, zalecane ok. 100%.`);
    if (mesoSum < 95 || mesoSum > 105) addWarn(6, "#pct-sand", `Mezohabitat: suma pokrycia to ${mesoSum}%, zalecane ok. 100%.`);

    return { errors, warnings };
  }

  function renderValidationAndPreview() {
    buildRecord({ persistPhotos: false }).then((record) => {
      const { errors, warnings } = validateRecord(record);
      const list = $("#validation-list");
      if (list) {
        const renderItems = (items, cls) => items.map((item) => `
          <div class="${cls}">
            ${item.message}
            <button type="button" data-step="${item.step}" data-field="${item.field}">Przejdź</button>
          </div>
        `).join("");
        list.innerHTML = `
          ${errors.length ? `<h3>Braki blokujące zapis</h3>${renderItems(errors, "validation-error")}` : `<p class="ok-text">Brak braków blokujących zapis.</p>`}
          ${warnings.length ? `<h3>Ostrzeżenia</h3>${renderItems(warnings, "validation-warning")}` : `<p class="ok-text">Brak ostrzeżeń jakościowych.</p>`}
          <p class="hint">Ostrzeżenia nie blokują zapisu, ale warto je sprawdzić przed wyjściem z terenu.</p>
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
    if (errors.length) {
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
    const today = new Date().toISOString().slice(0, 10);
    $("#today-count").textContent = String(entries.filter((entry) => entry.obsDate === today).length);
    $("#offline-status").textContent = navigator.onLine ? "online" : "offline";
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
    $("#start-new").addEventListener("click", startNewRecord);
    $("#open-records").addEventListener("click", () => {
      renderEntries();
      showView("records");
    });
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
      if (!btn) return;
      if (btn.dataset.action === "edit") editRecord(btn.dataset.uid);
      if (btn.dataset.action === "delete") deleteRecord(btn.dataset.uid);
    });

    $("#nest-photos").addEventListener("change", renderPhotoPreviews);
    $("#random-photos").addEventListener("change", renderPhotoPreviews);
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
    const render = (deg) => {
      const n = normalize(deg);
      degEl.textContent = `${Math.round(n)}°`;
      dirEl.textContent = toDir(n);
      arrowEl.style.transform = `rotate(${n}deg)`;
      statusEl.textContent = "Kompas aktywny.";
    };

    const onOrientation = (event) => {
      let heading = null;
      if (typeof event.webkitCompassHeading === "number") heading = event.webkitCompassHeading;
      else if (event.absolute === true && typeof event.alpha === "number") heading = 360 - event.alpha;
      else if (typeof event.alpha === "number") heading = 360 - event.alpha;
      if (typeof heading === "number" && Number.isFinite(heading)) render(heading);
    };

    const start = () => {
      window.addEventListener("deviceorientationabsolute", onOrientation, true);
      window.addEventListener("deviceorientation", onOrientation, true);
      statusEl.textContent = "Kompas: oczekiwanie na dane czujnika...";
    };

    const hasApi = "DeviceOrientationEvent" in window;
    if (!hasApi) {
      statusEl.textContent = "Kompas niedostępny w tej przeglądarce lub na tym urządzeniu.";
      return;
    }
    const requestPermission = window.DeviceOrientationEvent?.requestPermission;
    if (typeof requestPermission === "function") {
      enableBtn.hidden = false;
      statusEl.textContent = "Kompas wymaga zgody użytkownika.";
      enableBtn.addEventListener("click", async () => {
        try {
          const permission = await requestPermission.call(window.DeviceOrientationEvent);
          if (permission === "granted") {
            enableBtn.hidden = true;
            start();
          } else statusEl.textContent = "Kompas niedostępny bez zgody użytkownika.";
        } catch {
          statusEl.textContent = "Kompas niedostępny w tej przeglądarce lub na tym urządzeniu.";
        }
      });
      return;
    }
    start();
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
    setupNavigation();
    setupGps();
    setupCompass();
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
